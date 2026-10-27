// Service worker: chạy ngoại tuyến và cập nhật có kiểm soát.
// - Mã nguồn & dữ liệu (cùng nguồn): mạng trước, lỗi mạng thì dùng bản đã lưu → luôn lấy bản mới khi có mạng.
// - Biểu tượng, phông chữ: dùng bản đã lưu trước.
// - Bộ nhận dạng chữ (cdn.jsdelivr.net): để trình duyệt và Tesseract tự lưu, không lưu trùng ở đây.
// - Chỉ xóa cache có tiền tố "dpxn-" của chính app.
const VERSION = '2.3.0';
const CACHE = 'dpxn-' + VERSION;
const CORE = [
  './', './index.html', './css/styles.css', './manifest.webmanifest',
  './js/main.js', './js/app.js', './js/dom.js', './js/validation.js', './js/classification.js', './js/storage.js', './js/ocr.js', './js/install.js', './js/interpret.js',
  './data/tests.json', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })));
    // Nâng cấp từ bản 1 (không có nút "Cập nhật"): kích hoạt ngay để lần mở sau dùng bản mới.
    if (await caches.has('dpxn-v1')) await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('dpxn-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

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
    const res = await Promise.race([fetch(req), timeout(6000)]);
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
