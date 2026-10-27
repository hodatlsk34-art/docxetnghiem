// Service worker: chạy ngoại tuyến và cập nhật có kiểm soát.
// - Mã nguồn & dữ liệu (cùng nguồn): mạng trước, lỗi mạng thì dùng bản đã lưu → luôn lấy bản mới khi có mạng.
// - Biểu tượng, phông chữ: dùng bản đã lưu trước.
// - Bộ nhận dạng chữ (cdn.jsdelivr.net): để trình duyệt và Tesseract tự lưu, không lưu trùng ở đây.
// - Chỉ xóa cache có tiền tố "dpxn-" của chính app.
// - Tự cập nhật: bản mới được kích hoạt ngay khi tải xong; trang tự tải lại ở thời điểm an toàn.
const SHARE_CACHE = 'dpxn-share';
const VERSION = '2.4.0';
const CACHE = 'dpxn-' + VERSION;
const CORE = [
  './', './index.html', './css/styles.css', './manifest.webmanifest',
  './js/main.js', './js/app.js', './js/dom.js', './js/validation.js', './js/classification.js', './js/storage.js', './js/ocr.js', './js/install.js', './js/interpret.js', './js/files.js',
  './data/tests.json', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })));
    await self.skipWaiting(); // kích hoạt ngay, không chờ người dùng đóng app
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('dpxn-') && k !== CACHE && k !== SHARE_CACHE).map(k => caches.delete(k)));
    // Báo phiên bản trước khi nhận quyền điều khiển trang, để trang biết bản mới là bản nào
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach(c => c.postMessage({ type: 'updated', version: VERSION }));
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
  if (e.data === 'version' && e.source) e.source.postMessage({ type: 'version', version: VERSION });
});

// Nhận file chia sẻ từ ứng dụng khác (Zalo, Gmail, Tệp…) trên Android
async function receiveShare(req) {
  try {
    const fd = await req.formData();
    const files = fd.getAll('files').filter(f => f && typeof f === 'object' && f.size);
    const cache = await caches.open(SHARE_CACHE);
    for (const k of await cache.keys()) await cache.delete(k);
    let i = 0;
    for (const f of files.slice(0, 10)) {
      await cache.put(new Request('./__share/' + (i++)), new Response(f, { headers: { 'Content-Type': f.type || 'application/octet-stream', 'X-Name': encodeURIComponent(f.name || 'file') } }));
    }
  } catch { /* bỏ qua: trang sẽ báo không có file */ }
  return Response.redirect('./#nhan-file', 303);
}

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === 'POST' && url.origin === self.location.origin && url.searchParams.has('share-target')) {
    e.respondWith(receiveShare(req));
    return;
  }
  if (req.method !== 'GET') return;

  if (url.origin === self.location.origin) {
    const isStatic = url.pathname.includes('/icons/');
    if (isStatic) { e.respondWith(cacheFirst(req)); return; }
    e.respondWith(networkFirst(req));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(cacheFirst(req));
  }
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    // cache: 'no-cache' → hỏi lại máy chủ mỗi lần (không dùng bản HTTP cũ 10 phút của GitHub Pages)
    const fresh = req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(new Request(req, { cache: 'no-cache' }));
    const res = await Promise.race([fresh, timeout(6000)]);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await cache.match('./index.html') : null);
    if (hit) return hit;
    return new Response('Ngoại tuyến và chưa có bản lưu.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  } catch {
    return new Response('', { status: 504 });
  }
}
