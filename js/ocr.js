// Nhận dạng chỉ số từ ảnh phiếu xét nghiệm.
// - Nhận dạng chữ (OCR) chạy NGAY TRÊN MÁY bằng Tesseract.js; ảnh không gửi đi đâu.
// - Lần đầu cần mạng để tải bộ nhận dạng (~5 MB), sau đó trình duyệt lưu lại.
// - parseLabText() là hàm thuần (không phụ thuộc trình duyệt) để kiểm thử được.
import { parseNumber, QUAL_VALUES } from './validation.js';

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

export const norm = s => String(s).toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
  .replace(/[‐‑‒–—―]/g, '-').replace(/[μ]/g, 'µ').replace(/\s+/g, ' ').trim();

// Từ khóa nhận dạng theo chỉ số. Từ ngắn (≤ 3 ký tự) chỉ khớp ở đầu dòng để tránh nhầm.
const EXTRA_KEYS = {
  rbc: ['rbc', 'hong cau', 'so luong hong cau', 'red blood cell'],
  hgb: ['hgb', 'hb', 'huyet sac to', 'hemoglobin', 'luong huyet sac to'],
  hct: ['hct', 'hematocrit', 'the tich khoi hong cau'],
  mcv: ['mcv', 'the tich trung binh hong cau'],
  mch: ['mch', 'luong hst trung binh', 'luong huyet sac to trung binh'],
  mchc: ['mchc', 'nong do hst trung binh', 'nong do huyet sac to trung binh'],
  rdw: ['rdw-cv', 'rdw cv', 'rdw', 'phan bo kich thuoc hong cau'],
  wbc: ['wbc', 'bach cau', 'so luong bach cau', 'white blood cell'],
  neu: ['neu#', 'neut#', 'neu #', 'trung tinh#', 'ne#', 'neu', 'neut', 'bach cau trung tinh'],
  lym: ['lym#', 'lymph#', 'ly#', 'lym', 'lymph', 'bach cau lympho'],
  eos: ['eos#', 'eo#', 'eos', 'bach cau ai toan'],
  plt: ['plt', 'tieu cau', 'so luong tieu cau', 'platelet'],
  glu: ['glucose', 'glu', 'duong huyet', 'duong mau'],
  hba1c: ['hba1c', 'hb a1c', 'a1c'],
  chol: ['cholesterol toan phan', 'cholesterol tp', 'cholesterol', 'chol', 'total cholesterol'],
  tg: ['triglycerid', 'triglyceride', 'triglycerides', 'tg'],
  hdl: ['hdl-cholesterol', 'hdl-c', 'hdl c', 'hdl'],
  ldl: ['ldl-cholesterol', 'ldl-c', 'ldl c', 'ldl'],
  ure: ['ure', 'urea', 'bun', 'ure mau'],
  crea: ['creatinin', 'creatinine', 'crea', 'creat'],
  egfr: ['egfr', 'mlct', 'muc loc cau than'],
  uric: ['acid uric', 'axit uric', 'uric acid', 'uric'],
  ast: ['ast', 'sgot', 'got', 'ast (got)', 'got (ast)'],
  alt: ['alt', 'sgpt', 'gpt', 'alt (gpt)', 'gpt (alt)'],
  ggt: ['ggt', 'gamma gt', 'gamma-gt', 'y-gt', 'γ-gt'],
  bil_t: ['bilirubin toan phan', 'bilirubin tp', 'bil tp', 'bilirubin total', 't-bil', 'total bilirubin'],
  bil_d: ['bilirubin truc tiep', 'bilirubin tt', 'bil tt', 'bilirubin direct', 'd-bil', 'direct bilirubin'],
  alb: ['albumin', 'alb'],
  prot: ['protein toan phan', 'protein tp', 'total protein'],
  na: ['natri', 'sodium', 'na+', 'na'],
  k: ['kali', 'potassium', 'k+', 'k'],
  cl: ['clo', 'chloride', 'cl-', 'cl'],
  ca: ['canxi toan phan', 'calci toan phan', 'canxi', 'calci', 'calcium', 'ca toan phan'],
  crp: ['crp', 'hs-crp', 'crp-hs', 'protein phan ung c'],
  ferritin: ['ferritin'],
  iron: ['sat huyet thanh', 'iron', 'fe', 'sat'],
  vitd: ['25-oh vitamin d', '25(oh)d', '25-oh', 'vitamin d'],
  b12: ['vitamin b12', 'b12'],
  u_ph: ['ph'],
  u_sg: ['sg', 'ty trong', 'specific gravity'],
  u_glu: ['glu', 'glucose'],
  u_pro: ['pro', 'protein'],
  u_bld: ['bld', 'ery', 'hong cau', 'blood'],
  u_leu: ['leu', 'bach cau', 'leukocytes'],
  u_nit: ['nit', 'nitrit', 'nitrite'],
  u_ket: ['ket', 'ceton', 'ketone', 'thể ceton'],
  u_bil: ['bil', 'bilirubin'],
  u_uro: ['uro', 'urobilinogen', 'ubg'],
  tsh: ['tsh'],
  ft4: ['ft4', 'free t4', 'ft-4'],
  ft3: ['ft3', 'free t3', 'ft-3'],
  hbsag: ['hbsag', 'hbs ag', 'hbs-ag'],
  antihbs: ['anti-hbs', 'anti hbs', 'antihbs', 'hbsab', 'hbs ab'],
  antihcv: ['anti-hcv', 'anti hcv', 'antihcv', 'hcv ab'],
  psa: ['psa toan phan', 'total psa', 'psa'],
  bhcg: ['beta hcg', 'β-hcg', 'b-hcg', 'bhcg', 'hcg']
};

// Chỉ số chỉ có trong một loại mẫu
const URINE_IDS = new Set(['u_ph', 'u_sg', 'u_glu', 'u_pro', 'u_bld', 'u_leu', 'u_nit', 'u_ket', 'u_bil', 'u_uro']);

function buildMatchers(tests) {
  const list = [];
  for (const t of tests) {
    const keys = new Set((EXTRA_KEYS[t.id] || [t.short]).map(norm));
    for (const k of keys) list.push({ id: t.id, key: k, urine: URINE_IDS.has(t.id) });
  }
  const bloodKeys = new Set(list.filter(m => !m.urine).map(m => m.key));
  const urineKeys = new Set(list.filter(m => m.urine).map(m => m.key));
  list.sort((a, b) => b.key.length - a.key.length);
  return list.map(m => {
    const esc = m.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const lead = '^(?:\\d{1,3}[.)]?\\s+|[-•*]\\s*)?';
    const re = m.key.length <= 3
      ? new RegExp(lead + '(' + esc + ')(?![a-z0-9])')
      : new RegExp('(?:^|[^a-z0-9])(' + esc + ')(?![a-z])');
    // Từ khóa dùng chung máu/nước tiểu (glucose, protein, bilirubin, hồng cầu...): chọn theo đoạn phiếu đang đọc
    const shared = m.urine ? bloodKeys.has(m.key) : urineKeys.has(m.key);
    return { ...m, re, shared };
  });
}

const SECTION_URINE = /(nuoc tieu|urine|urinalysis|tong phan tich nuoc tieu|10 thong so)/;
const SECTION_BLOOD = /(huyet hoc|cong thuc mau|tong phan tich te bao mau|sinh hoa|hoa sinh|mien dich|blood count|hematology|biochemistry)/;

const QUAL_PATTERNS = [
  [/\b(am tinh|negative|neg|khong phat hien|not detected)\b/, 'neg'],
  [/\b(vet|trace|tr)\b/, 'trace'],
  [/(\+\+\+|3\s*\+)/, '3+'],
  [/(\+\+|2\s*\+)/, '2+'],
  [/\b(duong tinh|positive|pos|phat hien|reactive)\b/, 'pos'],
  [/(^|\s)(\+|1\s*\+)(\s|$)/, '1+']
];

function unitCandidates(unit) {
  const u = norm(unit || '');
  const c = new Set();
  const parts = u.split(/[()]/).map(x => x.trim()).filter(Boolean);
  for (const p of parts) c.add(cleanUnit(p));
  return c;
}
export function cleanUnit(u) {
  return norm(u).replace(/\s/g, '').replace(/µ|μ/g, 'u')
    .replace(/[×x]10\^?9\/l|10\^?9\/l|x10⁹\/l|×10⁹\/l|10⁹\/l/, 'g/l')
    .replace(/[×x]10\^?12\/l|10\^?12\/l|x10¹²\/l|×10¹²\/l|10¹²\/l/, 't/l')
    .replace(/^iu\/l$/, 'u/l').replace(/^ul$/, 'u/l')
    .replace(/^miu\/ml$/, 'miu/ml').replace(/^uiu\/ml$/, 'miu/l');
}
const UNIT_TOKEN = /^\s*([a-zµμ%][a-zµμ0-9%/^.×x¹²⁹·*-]*(?:\/[a-z0-9.²]+)?|\d*\s*[x×]\s*10\s*\^?\s*\d+\s*\/\s*l|10\^?\d+\/l)/;

// Sửa lỗi OCR thường gặp trong số liệu: O→0, l/I→1 khi đứng giữa chữ số.
function fixDigits(s) {
  // Không dùng lookbehind để chạy được trên Safari/iOS cũ.
  return s.replace(/(\d)[oO](?=[\d.,])/g, (_, d) => d + '0')
    .replace(/(\d[.,])[oO]/g, (_, a) => a + '0')
    .replace(/(\d)[lI|](?=\d)/g, (_, d) => d + '1')
    .replace(/(\d)\s+([.,])\s*(\d)/g, '$1$2$3');
}

/**
 * Tách các chỉ số từ văn bản OCR.
 * @returns {{items: Array, unmatched: string[]}}
 */
export function parseLabText(text, tests) {
  const matchers = buildMatchers(tests);
  const byId = new Map(tests.map(t => [t.id, t]));
  const items = new Map();
  const unmatched = [];
  let section = '';

  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = fixDigits(rawLine).trim();
    if (!line) continue;
    const n = norm(line);
    if (SECTION_URINE.test(n) && n.length < 80) { section = 'urine'; }
    else if (SECTION_BLOOD.test(n) && n.length < 80) { section = 'blood'; }

    let hit = null;
    for (const m of matchers) {
      if (m.shared && (m.urine ? section !== 'urine' : section === 'urine')) continue;
      if (items.has(m.id)) continue;
      const r = m.re.exec(n);
      if (!r) continue;
      const end = r.index + r[0].length;
      // "NEU%" — tỷ lệ phần trăm, không phải số lượng tuyệt đối
      if (/^\s*%/.test(n.slice(end))) { hit = 'skip'; break; }
      hit = { m, end };
      break;
    }
    if (hit === 'skip') continue;
    if (!hit) { if (/\d/.test(n) && n.length > 3) unmatched.push(line); continue; }

    const t = byId.get(hit.m.id);
    const rest = n.slice(hit.end).replace(/^[\s:=#.)\]-]+/, ' ');
    const item = { id: t.id, line, value: '', unit: '', labRef: null, warnings: [], notes: [], alternatives: null, selected: true };

    if (t.type === 'qual') {
      let q = null;
      for (const [re, val] of QUAL_PATTERNS) if (re.test(rest)) { q = val; break; }
      if (!q && /^\s*-\s*$|^\s*-\s+/.test(rest)) q = 'neg';
      if (q && QUAL_VALUES.includes(q)) {
        item.value = (t.group === 'endo' && q !== 'neg') ? 'pos' : q;
      } else {
        item.selected = false;
        item.warnings.push('Không đọc được kết quả âm/dương tính. Hãy chọn theo phiếu.');
      }
      items.set(t.id, item);
      continue;
    }

    // Số liệu: bỏ cờ H/L/↑/↓/* trước số
    const r2 = rest.replace(/^\s*(?:[hl]|↑|↓|\*)\s+(?=[<>≤≥]?\s*\d)/, ' ');
    const num = /([<>≤≥]=?\s*)?(\d+(?:[.,]\d+)?)([hl](?![a-z/]))?/.exec(r2);
    if (!num) {
      item.selected = false;
      item.warnings.push('Không đọc được số trên dòng này. Hãy nhập theo phiếu.');
      items.set(t.id, item);
      continue;
    }
    const rawVal = ((num[1] || '').replace(/\s/g, '') + num[2]).replace(/^(?:<=|≤)/, '<').replace(/^(?:>=|≥)/, '>');
    const p = parseNumber(rawVal);
    item.value = rawVal;
    if (p.state !== 'ok') { item.selected = false; item.warnings.push('Giá trị đọc được không hợp lệ.'); }

    let after = r2.slice(num.index + num[0].length);
    after = after.replace(/^\s*(?:[hl]|↑|↓|\*)(?=\s|$)/, '');
    let unitMismatch = false;
    const um = UNIT_TOKEN.exec(after);
    if (um && /[a-z%µ]/.test(um[1])) {
      item.unit = um[1];
      after = after.slice(um.index + um[0].length);
      const found = looseUnit(um[1]);
      if (KNOWN_UNITS.has(found) && !unitMatches(t.unit, found)) {
        unitMismatch = true;
        item.selected = false;
        item.warnings.push(`Phiếu ghi đơn vị "${um[1]}", app dùng "${t.unit}". App không tự đổi đơn vị — hãy kiểm tra.`);
      }
    }
    // Khoảng tham chiếu trên phiếu: "a - b", "< b", "> a"
    const rr = /(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)/.exec(after);
    let labRef = null;
    if (rr) {
      const lo = Number(rr[1].replace(',', '.')), hi = Number(rr[2].replace(',', '.'));
      if (Number.isFinite(lo) && Number.isFinite(hi) && lo < hi) labRef = { lo, hi };
    } else {
      const one = /([<>]|≤|≥)\s*=?\s*(\d+(?:[.,]\d+)?)/.exec(after);
      if (one) {
        const v = Number(one[2].replace(',', '.'));
        if (Number.isFinite(v)) labRef = one[1] === '<' || one[1] === '≤' ? { lo: null, hi: v } : { lo: v, hi: null };
      }
    }
    const scale = appScale(t);
    if (labRef && !unitMismatch) {
      // Ngưỡng đọc được phải cùng cỡ với ngưỡng của app; lệch ~10 lần thường do OCR mất dấu thập phân
      const ref = labRef.hi ?? labRef.lo;
      const appRef = labRef.hi != null ? scale.hi : scale.lo;
      if (appRef && (ref > appRef * 3 || ref < appRef / 3)) {
        item.notes.push('Không đọc chắc ngưỡng trên phiếu nên app dùng ngưỡng chuẩn. Bạn có thể nhập lại ngưỡng sau.');
      } else item.labRef = labRef;
    }
    // Có thể OCR làm mất dấu thập phân (72.1 → 721): hỏi lại, không tự sửa
    if (p.state === 'ok' && !unitMismatch && !/[.,]/.test(rawVal) && rawVal.replace(/\D/g, '').length >= 2) {
      const v = p.value, inWin = x => x >= scale.winLo && x <= scale.winHi;
      if (!inWin(v)) {
        const alt = [v / 10, v / 100].find(inWin);
        if (alt !== undefined) {
          const altStr = String(Math.round(alt * 1000) / 1000);
          item.alternatives = [altStr, rawVal];
          item.selected = false;
          item.warnings.push(`Có thể ảnh bị mất dấu thập phân. Phiếu ghi ${altStr.replace('.', ',')} hay ${rawVal}?`);
        }
      }
    }
    items.set(t.id, item);
  }
  return { items: [...items.values()], unmatched, hints: profileHints(text) };
}

const KNOWN_UNITS = new Set(['mg/dl', 'mmol/l', 'umol/l', 'g/dl', 'g/l', 'u/l', 'ng/ml', 'pg/ml', 'nmol/l', 'pmol/l', '%',
  'mmol/mol', '/ul', 'ng/dl', 'miu/ml', 'miu/l', 'uiu/ml', 'fl', 'pg', 't/l', 'mg/l', 'ug/l', 'ug/dl', 'ml/ph', 'meq/l', 'k/ul', 'm/ul']);

/** Chuẩn hóa đơn vị, chấp nhận lỗi OCR hay gặp (G/L → GIL, U/L → UL, µ → p). */
export function looseUnit(u) {
  let x = cleanUnit(u).replace(/[^a-z0-9%/]/g, '');
  if (/^g[il1|]l$|^gl$/.test(x)) x = 'g/l';
  if (/^ul$|^u1l$|^uil$/.test(x)) x = 'u/l';
  if (/^t[il1]l$|^tl$/.test(x)) x = 't/l';
  return x;
}
function unitMatches(appUnit, found) {
  const cands = [...unitCandidates(appUnit)].map(looseUnit);
  if (cands.includes(found)) return true;
  // µ hay bị đọc thành "p": µmol/L → pmol/L
  if (found === 'pmol/l' && cands.includes('umol/l')) return true;
  if (found === 'iu/l' && cands.includes('u/l')) return true;
  if ((found === 'uiu/ml' || found === 'miu/l') && cands.some(c => c === 'miu/l' || c === 'uiu/ml')) return true;
  return false;
}

/** Cỡ giá trị thường gặp của chỉ số (để phát hiện lệch 10–100 lần do OCR). */
function appScale(t) {
  let lo = null, hi = null;
  if (t.ref) {
    const rs = Object.values(t.ref);
    lo = Math.min(...rs.map(r => r[0]));
    const his = rs.map(r => r[1]).filter(x => x != null);
    hi = his.length ? Math.max(...his) : null;
  } else if (t.bands) {
    const okIdx = t.bands.findIndex(b => b.level === 'ok');
    const lastOk = t.bands.map(b => b.level).lastIndexOf('ok');
    lo = okIdx > 0 ? t.bands[okIdx - 1].lt : 0;
    hi = t.bands[lastOk].lt >= 999 ? null : t.bands[lastOk].lt;
  }
  const winLo = lo ? lo / 4 : 0;
  const winHi = hi ? hi * 4 : (lo ? lo * 8 : Infinity);
  return { lo: lo || null, hi, winLo, winHi };
}

/** Gợi ý giới tính/tuổi đọc được trên phiếu. */
export function profileHints(text) {
  const n = norm(text);
  const hints = {};
  const g = /gioi(?: tinh)?\s*[:.]?\s*(nu|nam|female|male)\b/.exec(n);
  if (g) hints.sex = (g[1] === 'nu' || g[1] === 'female') ? 'female' : 'male';
  const y = /(?:nam sinh|ngay sinh|nam\/sinh|dob|birth)[^0-9]{0,12}(?:\d{1,2}[/.-]\d{1,2}[/.-])?(\d{4})/.exec(n);
  if (y) hints.birthYear = Number(y[1]);
  const a = /tuoi\s*[:.]?\s*(\d{1,3})\b/.exec(n);
  if (a) hints.age = Number(a[1]);
  return hints;
}

// ---------------- Phần chạy trong trình duyệt ----------------
let loading = null, worker = null;

function loadScript(src) {
  return new Promise((res, rej) => {
    if (globalThis.Tesseract) return res();
    const s = document.createElement('script');
    s.src = src; s.async = true; s.crossOrigin = 'anonymous';
    s.onload = () => res(); s.onerror = () => rej(new Error('script'));
    document.head.appendChild(s);
  });
}

/** Thu nhỏ, chuyển xám, tăng tương phản để OCR chính xác hơn. */
export async function prepareImage(file) {
  const bmp = await (globalThis.createImageBitmap
    ? createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file))
    : Promise.reject(new Error('bitmap')));
  // Đưa cạnh dài về ~2400 px: ảnh nhỏ được phóng to (giữ dấu thập phân), ảnh lớn được thu nhỏ (nhanh hơn).
  let { width: w, height: h } = bmp;
  const scale = 2400 / Math.max(w, h);
  const cw = Math.round(w * scale), ch = Math.round(h * scale);
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, 0, 0, cw, ch);
  const img = g.getImageData(0, 0, cw, ch), d = img.data;
  let min = 255, max = 0;
  const lum = new Uint8ClampedArray(cw * ch);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    lum[j] = y; if (y < min) min = y; if (y > max) max = y;
  }
  const span = Math.max(1, max - min);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const y = ((lum[j] - min) / span) * 255;
    d[i] = d[i + 1] = d[i + 2] = y;
  }
  g.putImageData(img, 0, 0);
  if (bmp.close) bmp.close();
  return c;
}

/**
 * @param files     danh sách ảnh (1 phiếu có thể nhiều trang)
 * @param onProgress (phase:string, pct:number) => void
 */
export async function recognizeImages(files, onProgress = () => {}) {
  if (!navigator.onLine && !globalThis.Tesseract) {
    // vẫn thử — bộ nhận dạng có thể đã được trình duyệt lưu
  }
  onProgress('Đang tải bộ nhận dạng chữ…', 0);
  if (!loading) loading = loadScript(TESSERACT_URL);
  try { await loading; } catch (e) { loading = null; throw new Error('Không tải được bộ nhận dạng chữ. Lần dùng đầu tiên cần kết nối mạng.'); }

  if (!worker) {
    worker = await globalThis.Tesseract.createWorker(['vie', 'eng'], 1, {
      logger: m => {
        if (m.status === 'recognizing text') onProgress('Đang đọc chữ trên ảnh…', m.progress);
        else if (/load|download|initializ/.test(m.status)) onProgress('Đang chuẩn bị bộ nhận dạng (chỉ lần đầu)…', m.progress || 0);
      }
    });
    await worker.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: '6' });
  }
  const texts = [];
  for (let i = 0; i < files.length; i++) {
    onProgress(`Đang xử lý ảnh ${i + 1}/${files.length}…`, 0);
    const canvas = await prepareImage(files[i]);
    const { data } = await worker.recognize(canvas);
    texts.push(data.text || '');
  }
  return texts.join('\n');
}
