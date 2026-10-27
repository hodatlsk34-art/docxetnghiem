// Kiểm thử đầu-cuối bằng Playwright (Chromium). Chạy: npm run test:e2e
// Tùy chọn: TESSERACT_LOCAL=/đường/dẫn/node_modules để phục vụ bộ nhận dạng chữ từ máy thay vì cdn.jsdelivr.net.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = path.resolve(new URL('../../', import.meta.url).pathname);
const OUT = path.join(ROOT, 'tests/e2e/out');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm' };
const BASE = '/docxetnghiem/'; // giống đường dẫn con của GitHub Pages
const server = http.createServer((req, res) => {
  let u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!u.startsWith(BASE)) { res.writeHead(404); return res.end(); }
  let f = path.join(ROOT, u.slice(BASE.length));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
  if (globalThis.SW_BUMP && f.endsWith('sw.js')) {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    return res.end(fs.readFileSync(f, 'utf8').replace(/const VERSION = '([\d.]+)'/, `const VERSION = '${globalThis.SW_BUMP}'`));
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const URLB = `http://localhost:${server.address().port}${BASE}`;

const results = []; let failed = 0;
const check = (name, ok, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); if (!ok) failed++; };

const browser = await chromium.launch();
async function newPage(width = 375, height = 812, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: opts.dark ? 'dark' : 'light', serviceWorkers: opts.sw ? 'allow' : 'block' });
  const local = process.env.TESSERACT_LOCAL;
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  if (local) {
    await ctx.route(/cdn\.jsdelivr\.net\/npm\//, async route => {
      const p = new URL(route.request().url()).pathname.replace(/^\/npm\//, '');
      const m = /^((?:@[^/]+\/)?[^@/]+)(?:@v?[^/]+)?\/(.*)$/.exec(p);
      const file = path.join(local, m[1], m[2]);
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: 'nf ' + file });
      route.fulfill({ status: 200, body: fs.readFileSync(file), headers: { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' } });
    });
  }
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_FAILED/.test(m.text())) page.errors.push(m.text()); });
  page.on('dialog', d => { page.errors.push('dialog: ' + d.message()); d.dismiss(); });
  return { ctx, page };
}
const noHScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true });

try {
  // 1. Trang chủ + các màn hình, điện thoại 320px & 375px
  for (const w of [320, 375]) {
    const { page, ctx } = await newPage(w, 760);
    await page.goto(URLB);
    await page.waitForSelector('.hero');
    check(`trang chủ hiển thị (${w}px)`, await page.isVisible('text=Chụp ảnh hoặc tải file kết quả'));
    for (const r of ['', 'nhap', 'tracuu', 'lichsu', 'huongdan', 'caidat', 'chitiet/hgb']) {
      await page.goto(URLB + '#' + r); await page.waitForTimeout(120);
      check(`không cuộn ngang #${r || 'home'} (${w}px)`, await noHScroll(page));
    }
    if (w === 375) { await page.goto(URLB); await page.waitForSelector('.hero'); await shot(page, '01-trang-chu'); }
    check(`không lỗi JS (${w}px)`, page.errors.length === 0, page.errors.join(' | '));
    await ctx.close();
  }

  // 2. Nhập tay + XSS + xác thực
  {
    const { page, ctx } = await newPage();
    await page.goto(URLB + '#nhap'); await page.waitForSelector('.profile');
    await page.click('text=Nữ');
    await page.fill('#add-q', 'hgb'); await page.press('#add-q', 'Enter');
    await page.waitForSelector('#in-hgb');
    const xss = '<img src=x onerror="window.__xss=1">';
    await page.fill('#in-hgb', xss);
    check('XSS trong ô nhập không thực thi', await page.evaluate(() => !window.__xss && !document.querySelector('#main img[src="x"]')));
    check('giá trị sai định dạng bị báo lỗi', await page.isVisible('#st-hgb .err'));
    await page.fill('#in-hgb', '10,5');
    check('báo nhầm đơn vị g/dL', (await page.textContent('#st-hgb')).includes('g/dL'));
    await page.fill('#in-hgb', '105');
    check('HGB 105 nữ → thấp', (await page.textContent('#st-hgb')).includes('Thấp'));
    await page.fill('#add-q', 'men gan'); await page.waitForSelector('#sugg:not([hidden])');
    await page.press('#add-q', 'Enter');
    await page.click('text=Tải ví dụ');
    await page.waitForTimeout(200);
    await page.click('.modal .btn.primary').catch(() => {});
    await page.waitForSelector('#in-ferritin');
    check('không cuộn ngang #nhap có dữ liệu', await noHScroll(page));
    await shot(page, '02-nhap');
    await page.click('.sticky-act .btn');
    await page.waitForSelector('.summary');
    check('đọc liên kết: nhóm thiếu máu → gợi ý thiếu sắt', await page.isVisible('.panel >> text=Gợi ý thiếu sắt'));
    check('nhận định tổng quát hiển thị', await page.isVisible('.overall >> text=Nhận định tổng quát'));
    check('nhận định nhóm dạng hỏi–đáp', await page.isVisible('.qa >> text=Có thiếu máu không?'));
    check('đọc liên kết: có chỉ số tính thêm', await page.isVisible('text=Non-HDL cholesterol'));
    check('không có câu "Phù hợp đái tháo đường"', !(await page.isVisible('text=Phù hợp đái tháo đường')));
    check('không cuộn ngang #ketqua có dữ liệu', await noHScroll(page));
    await shot(page, '03-ket-qua');
    await page.click('text=Lưu vào lịch sử');
    await page.click('.res-row >> nth=0');
    await page.waitForSelector('.det-head');
    await shot(page, '04-chi-tiet');
    await page.click('role=tab[name="Liên quan"]');
    check('tab Liên quan', await page.isVisible('.tabpanel .res-row'));
    check('không lỗi JS (luồng nhập)', page.errors.length === 0, page.errors.join(' | '));
    // lịch sử: lưu thêm 1 lần với giá trị khác để so sánh
    await page.goto(URLB + '#nhap'); await page.fill('#in-hgb', '118');
    await page.goto(URLB + '#ketqua'); await page.click('text=Lưu vào lịch sử');
    await page.goto(URLB + '#lichsu'); await page.waitForSelector('.compare');
    check('so sánh có biểu đồ', await page.isVisible('.spark'));
    await shot(page, '06-lich-su');
    await page.goto(URLB + '#tracuu'); await page.fill('#lk-q', 'ALT'); await page.waitForTimeout(100);
    check('tra cứu ALT', (await page.textContent('.list')).includes('ALT'));
    await shot(page, '05-tra-cuu');
    await ctx.close();
  }

  // 2b. Trẻ em / thai phụ
  {
    const { page, ctx } = await newPage();
    await page.goto(URLB + '#nhap'); await page.waitForSelector('.profile');
    await page.click('text=Nữ');
    await page.click('text=Trẻ em (dưới 18 tuổi)');
    check('chọn trẻ em → hiện chọn tuổi', await page.isVisible('text=Tuổi của trẻ'));
    await page.click('text=5–9 tuổi');
    await page.fill('#add-q', 'hgb'); await page.press('#add-q', 'Enter');
    await page.fill('#in-hgb', '112');
    check('Hb 112 trẻ 5–9 tuổi → dưới ngưỡng thiếu máu', (await page.textContent('#st-hgb')).includes('thiếu máu'));
    await page.click('text=Đang mang thai');
    check('chọn mang thai → hiện giai đoạn', await page.isVisible('text=Giai đoạn thai kỳ'));
    await page.click('text=3 tháng giữa (tuần 14–27)');
    await page.fill('#in-hgb', '107');
    check('Hb 107 thai 3 tháng giữa → trên ngưỡng', (await page.textContent('#st-hgb')).includes('Trên ngưỡng'));
    check('không cuộn ngang (đối tượng)', await noHScroll(page));
    await shot(page, '12-thai-phu');
    await page.goto(URLB + '#chitiet/hgb'); await page.waitForSelector('.det-head');
    check('chi tiết ghi nguồn WHO', (await page.textContent('.result')).includes('WHO'));
    check('không lỗi JS (đối tượng)', page.errors.length === 0, page.errors.join(' | '));
    await ctx.close();
  }

  // 3. localStorage độc hại / hỏng
  {
    const { page, ctx } = await newPage();
    await page.goto(URLB); await page.waitForSelector('.hero');
    await page.evaluate(() => localStorage.setItem('dpxn-v2', JSON.stringify({ profile: { sex: '<svg onload=alert(1)>' }, draft: { values: { glu: '<img src=x onerror=window.__xss=1>', u_nit: '"><script>window.__xss=1</script>' }, order: ['glu', 'u_nit', '<b>'] }, history: [{ id: 'x1', at: '2026-01-01T00:00:00Z', values: { glu: '<svg/onload=window.__xss=1>' } }] })));
    await page.goto(URLB + '#nhap'); await page.reload(); await page.waitForSelector('.profile');
    await page.goto(URLB + '#ketqua'); await page.waitForTimeout(150);
    await page.goto(URLB + '#lichsu'); await page.waitForTimeout(150);
    check('dữ liệu lưu độc hại không thực thi', await page.evaluate(() => !window.__xss && !document.querySelector('#main script, #main img[src="x"]')));
    await page.evaluate(() => localStorage.setItem('dpxn-v2', '{hỏng'));
    await page.goto(URLB + '#'); await page.reload(); await page.waitForSelector('.hero');
    check('JSON hỏng → thông báo, app vẫn chạy', await page.isVisible('.toast'));
    check('không lỗi JS (dữ liệu hỏng)', page.errors.length === 0, page.errors.join(' | '));
    await ctx.close();
  }

  // 4. Chụp ảnh phiếu → OCR → xác nhận → kết quả
  if (process.env.TESSERACT_LOCAL || process.env.OCR_NETWORK) {
    const { page, ctx } = await newPage();
    await page.goto(URLB + '#nhap'); await page.waitForSelector('#in-gal', { state: 'attached' });
    await page.setInputFiles('#in-gal', path.join(ROOT, 'tests/fixtures/phieu-mau.jpg'));
    await page.waitForSelector('.ocr-run');
    await shot(page, '07-dang-doc-anh');
    await page.waitForSelector('.ocr-list, .center-msg', { timeout: 180000 });
    const n = await page.locator('.ocr-row').count();
    check('OCR đọc được ≥ 18 chỉ số từ ảnh mẫu', n >= 18, `${n} chỉ số`);
    check('không cuộn ngang màn hình xác nhận ảnh', await noHScroll(page));
    await shot(page, '08-xac-nhan-anh');
    const alts = page.locator('.alts .chip');
    if (await alts.count()) await alts.first().click();
    const btnText = await page.textContent('.sticky-act .btn');
    await page.click('.sticky-act .btn');
    await page.waitForSelector('.summary');
    check('áp dụng chỉ số từ ảnh', /Thêm \d+/.test(btnText), btnText);
    check('kết quả từ ảnh có phần đọc liên kết', await page.isVisible('.linked .panel'));
    await shot(page, '09-ket-qua-tu-anh');
    check('không lỗi JS (OCR)', page.errors.length === 0, page.errors.join(' | '));
    await ctx.close();
  } else results.push('SKIP  OCR (đặt TESSERACT_LOCAL hoặc OCR_NETWORK=1)');

  // 4b. Tải file: PDF có chữ (1 cột, 2 cột), CSV, Excel, PDF scan
  if (process.env.TESSERACT_LOCAL || process.env.OCR_NETWORK) {
    const cases = [['phieu-mau-1cot.pdf', 20, 'đọc trực tiếp chữ'], ['phieu-mau-2cot.pdf', 20, 'đọc trực tiếp chữ'], ['phieu-mau.csv', 5, 'bảng tính'], ['phieu-mau.xlsx', 3, 'bảng tính'], ['phieu-mau-scan.pdf', 18, 'Nhận dạng chữ']];
    for (const [f, min, note] of cases) {
      const { page, ctx } = await newPage();
      await page.goto(URLB + '#nhap'); await page.waitForSelector('#in-gal', { state: 'attached' });
      await page.setInputFiles('#in-gal', path.join(ROOT, 'tests/fixtures/', f));
      await page.waitForSelector('.ocr-list, .center-msg h2', { timeout: 180000 });
      const n = await page.locator('.ocr-row').count();
      const txt = await page.textContent('.card.note');
      check(`tải file ${f}: đọc được ≥ ${min} chỉ số`, n >= min, `${n} chỉ số; ${page.errors.join(' | ')}`);
      check(`tải file ${f}: báo đúng cách đọc`, txt.includes(note), txt.slice(0, 80));
      if (f === 'phieu-mau-2cot.pdf') {
        await shot(page, '13-tai-pdf');
        await page.click('.sticky-act .btn'); await page.waitForSelector('.summary');
        check('PDF → kết quả có đọc liên kết', await page.isVisible('.linked .panel'));
      }
      check(`không lỗi JS (${f})`, page.errors.length === 0, page.errors.join(' | '));
      await ctx.close();
    }
  }

  // 4c. Bộ ngưỡng theo nơi xét nghiệm: lưu từ phiếu có ngưỡng, dùng lại cho phiếu không in ngưỡng và nhập tay
  {
    const { page, ctx } = await newPage();
    await page.goto(URLB + '#nhap'); await page.waitForSelector('#in-gal', { state: 'attached' });
    await page.setInputFiles('#in-gal', path.join(ROOT, 'tests/fixtures/phieu-mau.csv'));
    await page.waitForSelector('.ocr-list');
    await page.fill('#lab-name', 'Bệnh viện Đa khoa Minh An (mẫu thử)'); await page.press('#lab-name', 'Enter'); await page.dispatchEvent('#lab-name', 'change');
    await page.waitForTimeout(200);
    await page.click('.sticky-act .btn'); await page.waitForSelector('.summary');
    check('lưu bộ ngưỡng từ phiếu', (await page.textContent('.ref-usage')).includes('theo phiếu'));
    // Phiếu thứ hai cùng nơi, không in ngưỡng → dùng ngưỡng đã lưu (TSH 0,4–4,0; HGB 130–170)
    await page.goto(URLB + '#nhap'); await page.waitForSelector('#in-gal', { state: 'attached' });
    await page.setInputFiles('#in-gal', path.join(ROOT, 'tests/fixtures/phieu-mau-khong-nguong.txt'));
    await page.waitForSelector('.ocr-list');
    check('nhận tên nơi xét nghiệm từ phiếu', (await page.inputValue('#lab-name')).includes('MINH AN'));
    await page.fill('#lab-name', 'Bệnh viện Đa khoa Minh An (mẫu thử)'); await page.dispatchEvent('#lab-name', 'change'); await page.waitForTimeout(200);
    check('dùng ngưỡng đã lưu cho phiếu không in ngưỡng', await page.isVisible('text=Ngưỡng đã lưu: 130 – 170'));
    await page.click('.sticky-act .btn'); await page.waitForSelector('.summary');
    check('kết quả ghi số chỉ số theo bộ ngưỡng đã lưu', (await page.textContent('.ref-usage')).includes('theo bộ ngưỡng đã lưu'));
    await page.goto(URLB + '#caidat'); await page.waitForSelector('.labitem');
    check('quản lý bộ ngưỡng trong Cài đặt', (await page.textContent('.labitem')).includes('Minh An'));
    check('không lỗi JS (bộ ngưỡng)', page.errors.length === 0, page.errors.join(' | '));
    await shot(page, '14-bo-nguong');
    await ctx.close();
  }

  // 5. Desktop + chế độ tối
  {
    const { page, ctx } = await newPage(1280, 860, { dark: true });
    await page.goto(URLB); await page.waitForSelector('.hero');
    await page.evaluate(() => localStorage.clear());
    await page.goto(URLB + '#nhap'); await page.click('text=Tải ví dụ'); await page.goto(URLB + '#ketqua'); await page.waitForSelector('.summary');
    check('desktop không cuộn ngang', await noHScroll(page));
    await shot(page, '10-desktop-toi');
    await ctx.close();
  }

  // 5b. Gợi ý cài app theo thiết bị
  {
    const cases = [
      ['iPhone Safari', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', 'Thêm vào MH chính'],
      ['Zalo', 'Mozilla/5.0 (Linux; Android 13; SM-A536E Build/TP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36 Zalo android/12100682 ZaloTheme/light', 'Mở bằng trình duyệt'],
      ['Android Chrome', 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36', 'Cài đặt ứng dụng']
    ];
    for (const [name, ua, want] of cases) {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, userAgent: ua, serviceWorkers: 'block' });
      await ctx.route(/fonts\./, r => r.abort());
      const page = await ctx.newPage();
      await page.goto(URLB); await page.waitForSelector('.hero');
      check(`gợi ý cài app (${name})`, (await page.textContent('.install')).includes(want));
      if (name === 'Android Chrome') {
        await page.evaluate(() => { const e = new Event('beforeinstallprompt'); e.prompt = () => { window.__prompted = 1; }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); });
        await page.waitForSelector('text=Cài đặt ngay');
        await page.click('text=Cài đặt ngay');
        check('nút "Cài đặt ngay" gọi hộp thoại cài', await page.evaluate(() => window.__prompted === 1));
        await page.click('.install .icon-btn');
        await page.reload(); await page.waitForSelector('.hero');
        check('ẩn gợi ý cài sau khi bấm ✕', !(await page.isVisible('.install')));
        await shot(page, '11-goi-y-cai');
      }
      await ctx.close();
    }
  }

  // 6. PWA: service worker, ngoại tuyến
  {
    const { page, ctx } = await newPage(375, 760, { sw: true });
    await page.goto(URLB); await page.waitForSelector('.hero');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); await page.waitForSelector('.hero');
    await ctx.setOffline(true);
    await page.reload(); await page.waitForSelector('.hero', { timeout: 8000 }).catch(() => {});
    check('mở lại khi ngoại tuyến', await page.isVisible('.hero'));
    check('hiện thông báo ngoại tuyến', await page.isVisible('#offline'));
    const manifestOk = await page.evaluate(async () => { const m = await (await fetch('manifest.webmanifest')).json(); return m.icons.length >= 3 && m.start_url === './'; });
    check('manifest hợp lệ (đường dẫn con)', manifestOk);
    // Nhận file chia sẻ (Android share target)
    await ctx.setOffline(false);
    await page.reload(); await page.waitForSelector('.hero');
    await page.evaluate(async () => {
      const fd = new FormData();
      fd.append('files', new File(['Tên;Kết quả\nHGB;128\nGlucose;5,4'], 'kq.csv', { type: 'text/csv' }));
      const r = await fetch('./?share-target', { method: 'POST', body: fd, redirect: 'manual' });
      window.__shareStatus = r.type;
    });
    await page.goto(URLB + '#nhan-file');
    await page.waitForSelector('.ocr-list', { timeout: 20000 }).catch(() => {});
    check('nhận file chia sẻ từ ứng dụng khác', (await page.locator('.ocr-row').count()) === 2);
    // Tự cập nhật: máy chủ có bản sw.js mới → app tự tải lại và báo đã cập nhật
    await page.goto(URLB + '#'); await page.waitForSelector('.hero');
    globalThis.SW_BUMP = '9.9.9';
    page.on('console', m => { if (process.env.DEBUG_SW) console.log('console:', m.text()); });
    const upd = await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update().then(() => 'ok', e => 'err ' + e.message)));
    if (process.env.DEBUG_SW) console.log('update()', upd, await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => [!!r.installing, !!r.waiting, !!r.active, location.hash, document.activeElement && document.activeElement.tagName])));
    await page.waitForSelector('text=Đã cập nhật lên phiên bản mới 9.9.9', { timeout: 20000 }).catch(() => {});
    check('app tự cập nhật khi có bản mới', await page.isVisible('text=Đã cập nhật lên phiên bản mới 9.9.9'));
    globalThis.SW_BUMP = null;
    const cdp = await ctx.newCDPSession(page);
    await ctx.setOffline(false);
    await page.reload(); await page.waitForSelector('.hero');
    const ie = await cdp.send('Page.getInstallabilityErrors');
    check('Chrome đánh giá cài được như app', ie.installabilityErrors.length === 0, JSON.stringify(ie.installabilityErrors));
    await ctx.close();
  }
} catch (e) {
  check('chạy kịch bản', false, e.stack);
} finally {
  await browser.close(); server.close();
  console.log(results.join('\n'));
  console.log(`\n${results.filter(r => r.startsWith('PASS')).length} đạt, ${failed} lỗi. Ảnh chụp: tests/e2e/out/`);
  process.exit(failed ? 1 : 0);
}
