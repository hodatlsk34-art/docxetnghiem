// Đọc kết quả xét nghiệm từ file: PDF (có chữ hoặc dạng scan), ảnh, Excel, CSV, TXT.
// - PDF có chữ: lấy chữ trực tiếp (chính xác, nhanh, không cần nhận dạng ảnh).
// - PDF scan / ảnh: nhận dạng chữ ngay trên máy (ocr.js).
// - Mọi xử lý diễn ra trên máy; file không gửi đi đâu.
import { recognizeImages, startsWithTestKey } from './ocr.js';

const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/';
const XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
export const MAX_FILE_MB = 30;
export const MAX_PDF_PAGES = 10;
export const ACCEPT = 'image/*,application/pdf,.pdf,.csv,.txt,.xlsx,.xls,text/csv,text/plain';

export function fileKind(f) {
  const n = (f.name || '').toLowerCase(), t = f.type || '';
  if (t === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (t.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|bmp|gif)$/.test(n)) return 'image';
  if (/\.(xlsx|xls)$/.test(n) || /spreadsheet|ms-excel/.test(t)) return 'sheet';
  if (n.endsWith('.csv') || t === 'text/csv') return 'csv';
  if (n.endsWith('.txt') || t === 'text/plain') return 'text';
  return '';
}

// ---------------------------------------------------------------- PDF: ghép chữ thành dòng
/**
 * Ghép các mảnh chữ của một trang PDF thành dòng theo tọa độ.
 * Tách một dòng thành hai khi có khoảng trống lớn và phần bên phải bắt đầu bằng tên một xét nghiệm
 * (phiếu in hai cột).
 * @param items  [{str, x, y, w, h}]
 */
export function itemsToLines(items, pageWidth, isKeyStart = () => false) {
  const its = items.filter(i => i.str && i.str.trim() !== '').map(i => ({ ...i, h: i.h || 8 }));
  its.sort((a, b) => b.y - a.y || a.x - b.x);
  const rows = [];
  for (const it of its) {
    const row = rows.find(r => Math.abs(r.y - it.y) <= Math.max(2, Math.min(r.h, it.h) * 0.45));
    if (row) { row.items.push(it); row.h = Math.max(row.h, it.h); }
    else rows.push({ y: it.y, h: it.h, items: [it] });
  }
  rows.sort((a, b) => b.y - a.y);
  const lines = [];
  for (const r of rows) {
    r.items.sort((a, b) => a.x - b.x);
    let cur = '', lastEnd = null;
    const segs = [];
    for (const it of r.items) {
      const gap = lastEnd === null ? 0 : it.x - lastEnd;
      if (lastEnd !== null && gap > Math.max(pageWidth * 0.02, it.h * 2.5) && isKeyStart(it.str) && cur.trim()) {
        segs.push(cur); cur = '';
      } else if (lastEnd !== null && gap > Math.max(1, it.h * 0.15) && !cur.endsWith(' ')) {
        cur += gap > it.h * 1.5 ? '   ' : ' ';
      }
      cur += it.str;
      lastEnd = it.x + (it.w || it.str.length * it.h * 0.5);
    }
    segs.push(cur);
    segs.forEach(s => { if (s.trim()) lines.push(s.replace(/\s+$/, '')); });
  }
  return lines;
}

let pdfjsLoading = null;
async function loadPdfJs() {
  if (globalThis.pdfjsLib) return globalThis.pdfjsLib;
  if (!pdfjsLoading) pdfjsLoading = (async () => {
    await loadScript(PDFJS + 'build/pdf.min.js');
    const lib = globalThis.pdfjsLib || globalThis['pdfjs-dist/build/pdf'];
    // Worker khác tên miền: tải về rồi chạy qua blob để trình duyệt cho phép
    const src = await (await fetch(PDFJS + 'build/pdf.worker.min.js')).text();
    lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    return lib;
  })().catch(e => { pdfjsLoading = null; throw e; });
  return pdfjsLoading;
}
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.async = true; s.crossOrigin = 'anonymous';
    s.onload = () => res(); s.onerror = () => rej(new Error('script'));
    document.head.appendChild(s);
  });
}

async function readPdf(file, onProgress, out) {
  let lib;
  try { lib = await loadPdfJs(); }
  catch { throw new Error('Không tải được bộ đọc PDF. Lần dùng đầu tiên cần kết nối mạng.'); }
  const data = new Uint8Array(await file.arrayBuffer());
  let doc;
  try {
    doc = await lib.getDocument({ data, cMapUrl: PDFJS + 'cmaps/', cMapPacked: true, standardFontDataUrl: PDFJS + 'standard_fonts/', isEvalSupported: false }).promise;
  } catch (e) {
    if (e && e.name === 'PasswordException') throw new Error(`File "${file.name}" có mật khẩu. Hãy mở bằng mật khẩu rồi lưu lại bản không khóa, hoặc chụp màn hình.`);
    throw new Error(`Không mở được file "${file.name}". File có thể bị hỏng.`);
  }
  const n = Math.min(doc.numPages, MAX_PDF_PAGES);
  if (doc.numPages > MAX_PDF_PAGES) out.notes.push(`File có ${doc.numPages} trang; app chỉ đọc ${MAX_PDF_PAGES} trang đầu.`);
  const scans = [];
  for (let i = 1; i <= n; i++) {
    onProgress(`Đang đọc trang ${i}/${n} của file PDF…`, (i - 1) / n);
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items = tc.items.map(it => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: it.height || Math.abs(it.transform[3]) }));
    const chars = items.reduce((a, b) => a + b.str.trim().length, 0);
    if (i === 1) out.thumbs.push(await renderThumb(page));
    if (chars >= 40) {
      out.texts.push(itemsToLines(items, vp.width, startsWithTestKey).join('\n'));
      out.methods.add('pdf-text');
    } else {
      // Trang scan: vẽ ra ảnh rồi nhận dạng chữ
      const scale = Math.min(3, 2400 / Math.max(vp.width, vp.height));
      const v2 = page.getViewport({ scale });
      const c = document.createElement('canvas'); c.width = Math.round(v2.width); c.height = Math.round(v2.height);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: g, viewport: v2 }).promise;
      scans.push(c);
    }
    page.cleanup();
  }
  if (scans.length) {
    out.methods.add('ocr');
    out.texts.push(await recognizeImages(scans, onProgress));
  }
  doc.destroy();
}
async function renderThumb(page) {
  const vp = page.getViewport({ scale: 1 });
  const v = page.getViewport({ scale: 240 / vp.height });
  const c = document.createElement('canvas'); c.width = Math.round(v.width); c.height = Math.round(v.height);
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: g, viewport: v }).promise;
  return c.toDataURL('image/jpeg', 0.7);
}

// ---------------------------------------------------------------- bảng tính, CSV, TXT
/** Tách CSV có ngoặc kép; tự nhận dấu phân cách ; , hoặc tab. */
export function parseCsv(text) {
  const first = text.split(/\r?\n/).slice(0, 5).join('\n');
  const count = ch => (first.match(new RegExp(ch === '\t' ? '\\t' : '\\' + ch, 'g')) || []).length;
  const delim = ['\t', ';', ','].sort((a, b) => count(b) - count(a))[0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
export const rowsToText = rows => rows.map(r => r.map(c => String(c ?? '').trim()).filter(Boolean).join('   ')).filter(Boolean).join('\n');

let xlsxLoading = null;
async function readSheet(file, out) {
  if (!globalThis.XLSX) {
    if (!xlsxLoading) xlsxLoading = loadScript(XLSX_URL).catch(e => { xlsxLoading = null; throw e; });
    try { await xlsxLoading; } catch { throw new Error('Không tải được bộ đọc Excel. Lần dùng đầu tiên cần kết nối mạng.'); }
  }
  const wb = globalThis.XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
  for (const name of wb.SheetNames.slice(0, 5)) {
    const rows = globalThis.XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '' });
    out.texts.push(rowsToText(rows));
  }
  out.methods.add('table');
}

// ---------------------------------------------------------------- điều phối
/**
 * @returns {{text:string, methods:Set, thumbs:string[], notes:string[]}}
 */
export async function extractFromFiles(files, onProgress = () => {}) {
  const out = { texts: [], methods: new Set(), thumbs: [], notes: [] };
  const images = [];
  for (const f of files) {
    if (f.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`File "${f.name}" lớn hơn ${MAX_FILE_MB} MB.`);
    const k = fileKind(f);
    if (!k) throw new Error(`Chưa hỗ trợ loại file "${f.name}". Hãy dùng PDF, ảnh, Excel hoặc CSV.`);
    if (k === 'image') { images.push(f); out.thumbs.push(URL.createObjectURL(f)); }
    else if (k === 'pdf') await readPdf(f, onProgress, out);
    else if (k === 'sheet') await readSheet(f, out);
    else if (k === 'csv') { out.texts.push(rowsToText(parseCsv(await f.text()))); out.methods.add('table'); }
    else { out.texts.push(await f.text()); out.methods.add('table'); }
  }
  if (images.length) { out.methods.add('ocr'); out.texts.push(await recognizeImages(images, onProgress)); }
  return { text: out.texts.join('\n'), methods: out.methods, thumbs: out.thumbs, notes: out.notes };
}
