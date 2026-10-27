// Hướng dẫn / nút cài app lên màn hình chính để mở toàn màn hình như ứng dụng thật
// (không còn thanh địa chỉ của trình duyệt).
import { h, icon } from './dom.js';

let installed = false;
let deferred = null;           // sự kiện beforeinstallprompt (Chrome/Edge/Samsung trên Android, máy tính)
const listeners = new Set();
const DISMISS_KEY = 'dpxn-install-dismissed';

export function initInstall() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferred = e;
    listeners.forEach(f => f());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null; installed = true;
    try { localStorage.setItem(DISMISS_KEY, String(Date.now() + 365 * 864e5)); } catch { /* bỏ qua */ }
    listeners.forEach(f => f());
  });
  if (isStandalone()) document.documentElement.classList.add('standalone');
}

export function onInstallChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || window.navigator.standalone === true;
}

/** Nhận biết môi trường để đưa hướng dẫn đúng. */
export function platform(ua = navigator.userAgent) {
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  let inApp = '';
  if (/Zalo/i.test(ua)) inApp = 'Zalo';
  else if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) inApp = 'Facebook';
  else if (/Messenger/i.test(ua)) inApp = 'Messenger';
  else if (/Instagram/i.test(ua)) inApp = 'Instagram';
  else if (/TikTok|musical_ly|BytedanceWebview/i.test(ua)) inApp = 'TikTok';
  else if (/Line\//i.test(ua)) inApp = 'Line';
  else if (android && /; wv\)/.test(ua)) inApp = 'ứng dụng này';
  const iosSafari = ios && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua) && !inApp;
  const iosOther = ios && !iosSafari && !inApp;
  const samsung = /SamsungBrowser/i.test(ua);
  return { ios, android, inApp, iosSafari, iosOther, samsung, desktop: !ios && !android };
}

function dismissed() {
  try { return Number(localStorage.getItem(DISMISS_KEY) || 0) > Date.now(); } catch { return false; }
}
function dismiss(days) {
  try { localStorage.setItem(DISMISS_KEY, String(Date.now() + days * 864e5)); } catch { /* bỏ qua */ }
}

async function copyLink(btn) {
  const url = location.origin + location.pathname;
  try { await navigator.clipboard.writeText(url); btn.textContent = 'Đã sao chép link'; }
  catch { btn.textContent = url; }
}

const step = (n, ...kids) => h('li', {}, h('span', { class: 'st-n', text: String(n) }), h('span', {}, ...kids));
const key = txt => h('b', { class: 'kbd', text: txt });

/** Nội dung hướng dẫn theo thiết bị. */
export function installSteps(p = platform()) {
  if (p.inApp) {
    return h('div', { class: 'inst-body' },
      h('p', {}, 'Bạn đang mở trong ', h('strong', { text: p.inApp }), '. Trình duyệt bên trong ứng dụng này không cài được app.'),
      h('ol', { class: 'steps' },
        step(1, 'Bấm nút ', key('⋯'), ' hoặc ', key('⋮'), ' ở góc trên.'),
        step(2, 'Chọn ', key(p.ios ? 'Mở bằng Safari' : 'Mở bằng trình duyệt'), '.'),
        step(3, 'Làm tiếp theo hướng dẫn cài hiện ra trên trang.')),
      h('button', { class: 'btn ghost sm', onclick: e => copyLink(e.currentTarget) }, 'Sao chép link app'));
  }
  if (p.ios) {
    return h('div', { class: 'inst-body' },
      h('ol', { class: 'steps' },
        step(1, p.iosSafari ? 'Bấm nút Chia sẻ ' : 'Bấm nút Chia sẻ ', h('span', { class: 'kbd ic-kbd' }, icon('share')), p.iosSafari ? ' ở thanh dưới cùng của Safari.' : ' (trên thanh địa chỉ hoặc trong menu ⋯).'),
        step(2, 'Kéo xuống, chọn ', key('Thêm vào MH chính'), '.'),
        step(3, 'Bấm ', key('Thêm'), '. Từ nay mở app bằng biểu tượng trên màn hình chính.')),
      p.iosOther ? h('p', { class: 'small muted', text: 'Nếu không thấy mục này, hãy mở link bằng Safari.' }) : null);
  }
  return h('div', { class: 'inst-body' },
    h('ol', { class: 'steps' },
      step(1, 'Bấm nút menu ', key('⋮'), p.samsung ? ' hoặc ' : '', p.samsung ? key('≡') : '', ' của trình duyệt.'),
      step(2, 'Chọn ', key('Cài đặt ứng dụng'), ' hoặc ', key('Thêm vào màn hình chính'), '.'),
      step(3, 'Bấm ', key('Cài đặt'), '. Biểu tượng app sẽ có trên màn hình chính.')),
    h('p', { class: 'small muted', text: 'Nếu đã có biểu tượng cũ nhưng mở vẫn thấy thanh địa chỉ, hãy xóa biểu tượng đó rồi cài lại theo các bước trên.' }));
}

/** Thẻ "Cài app" trên trang chủ. Trả về null khi đã chạy như app. */
export function installCard({ force = false } = {}) {
  if (isStandalone()) return null;
  if (!force && dismissed()) return null;
  const p = platform();
  const box = h('div', { class: 'card install', role: 'region', 'aria-label': 'Cài ứng dụng' });
  const paint = () => {
    box.replaceChildren();
    if (installed) {
      box.append(h('div', { class: 'inst-head' }, h('img', { src: 'icons/icon-192.png', alt: '', class: 'inst-logo' }),
        h('div', {}, h('strong', { text: 'Đã cài xong' }), h('span', { class: 'small muted', text: 'Từ nay hãy mở app bằng biểu tượng "Xét nghiệm" trên màn hình chính.' }))));
      return;
    }
    box.append(h('div', { class: 'inst-head' },
      h('img', { src: 'icons/icon-192.png', alt: '', class: 'inst-logo' }),
      h('div', {}, h('strong', { text: 'Cài app lên điện thoại' }),
        h('span', { class: 'small muted', text: 'Mở toàn màn hình như ứng dụng thật, dùng được khi mất mạng.' })),
      force ? null : h('button', { class: 'icon-btn sm', 'aria-label': 'Ẩn gợi ý cài app', onclick: () => { dismiss(14); box.remove(); } }, icon('x'))));
    if (deferred && !p.inApp) {
      box.append(h('button', { class: 'btn primary block', onclick: async () => {
        const ev = deferred; deferred = null;
        ev.prompt();
        try { const { outcome } = await ev.userChoice; if (outcome !== 'accepted') paint(); } catch { paint(); }
      } }, icon('download'), 'Cài đặt ngay'));
    } else {
      box.append(installSteps(p));
    }
  };
  paint();
  const off = onInstallChange(() => { if (!box.isConnected) { off(); return; } if (isStandalone()) box.remove(); else paint(); });
  return box;
}
