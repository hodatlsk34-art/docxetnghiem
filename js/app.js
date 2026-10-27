// Điều phối giao diện. Logic phân loại nằm ở classification.js, kiểm tra đầu vào ở validation.js,
// lưu trữ ở storage.js, đọc ảnh ở ocr.js.
import { h, clear, icon, svg } from './dom.js';
import { parseNumber, parseLabRef, formatNum, QUAL_LABEL } from './validation.js';
import { classify, bucket, evaluateRules, relatedTests, refFor, specialFor, PROFILE_GROUPS, AGE_BANDS, TRIMESTERS, ageBandFromYears, profileLabel } from './classification.js';
import { createStore, newId } from './storage.js';
import { parseLabText, recognizeImages } from './ocr.js';
import { installCard, installSteps, isStandalone } from './install.js';
import { interpret, PANEL_MEMBERS, FORMULA_SOURCES } from './interpret.js';

export const APP_VERSION = '2.3.0';

const GROUP_STYLE = {
  cbc: { icon: 'drop', cls: 'g-cbc', label: 'Huyết học' },
  bio: { icon: 'flask', cls: 'g-bio', label: 'Sinh hóa' },
  uri: { icon: 'cup', cls: 'g-uri', label: 'Nước tiểu' },
  endo: { icon: 'pulse', cls: 'g-endo', label: 'Nội tiết & khác' }
};
const QUAL_OPTIONS = {
  uri: [['', 'Chọn…'], ['neg', 'Âm tính'], ['trace', 'Vết'], ['1+', '1+'], ['2+', '2+'], ['3+', '3+']],
  endo: [['', 'Chọn…'], ['neg', 'Âm tính'], ['pos', 'Dương tính']]
};
const SAMPLE = {
  profile: { sex: 'female', group: 'adult', ageBand: '', trimester: 0, age: 42 },
  values: { hgb: '105', rbc: '4.7', hct: '34', mcv: '72.3', mch: '22.3', rdw: '16.2', wbc: '6.8', neu: '4.1', plt: '262',
    glu: '6.1', hba1c: '5.9', chol: '5.6', tg: '2.0', hdl: '1.2', ldl: '3.7', crea: '70', alt: '52', ast: '38', ggt: '45',
    ferritin: '9', tsh: '2.1', u_leu: 'neg', u_nit: 'neg', u_pro: 'neg' }
};

let D, BY, store, S;
const ui = { filter: 'all', lookGroup: 'all', query: '', tab: 'explain', ocr: null, compare: '', savedSig: '' };
const $main = () => document.getElementById('main');

// ---------------------------------------------------------------- khởi động
export async function start() {
  setupChrome();
  try {
    const res = await fetch('data/tests.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('http ' + res.status);
    D = await res.json();
    if (!Array.isArray(D.tests) || !Array.isArray(D.groups)) throw new Error('schema');
  } catch (e) {
    renderFatal();
    return;
  }
  BY = Object.fromEntries(D.tests.map(t => [t.id, t]));
  let ls = null;
  try { ls = window.localStorage; } catch { ls = null; }
  store = createStore(ls, D.tests);
  const loaded = store.load();
  S = loaded.state;
  if (loaded.notice) toast(loaded.notice, 'warn');
  if (!ls) toast('Trình duyệt đang chặn lưu dữ liệu. Kết quả sẽ mất khi đóng app.', 'warn');
  window.addEventListener('hashchange', render);
  render();
}

function persist() {
  const r = store.save(S);
  if (!r.ok) toast(r.error, 'warn');
}

function renderFatal() {
  const m = clear($main());
  m.append(h('section', { class: 'screen center-msg' },
    icon('wifi', 'xl'),
    h('h1', { text: 'Không tải được dữ liệu xét nghiệm' }),
    h('p', { class: 'muted', text: 'Hãy kiểm tra kết nối mạng rồi thử lại. Sau lần mở đầu tiên thành công, app dùng được cả khi không có mạng.' }),
    h('button', { class: 'btn primary', onclick: () => location.reload() }, icon('refresh'), 'Thử lại')));
}

// ---------------------------------------------------------------- khung chung
function setupChrome() {
  const nav = document.getElementById('nav');
  const items = [['home', 'Trang chủ', '', 'm-home'], ['doc', 'Đọc phiếu', 'nhap', 'm-doc'], ['search', 'Tra cứu', 'tracuu', 'm-look'], ['clock', 'Lịch sử', 'lichsu', 'm-hist'], ['book', 'Hướng dẫn', 'huongdan', 'm-guide']];
  for (const [ic, label, route, cls] of items) {
    nav.append(h('a', { href: '#' + route, class: 'nav-item ' + cls, dataset: { route } }, h('span', { class: 'nav-ic' }, icon(ic)), h('span', { class: 'nav-tx', text: label })));
  }
  const banner = document.getElementById('offline');
  const upd = () => { banner.hidden = navigator.onLine; };
  window.addEventListener('online', upd); window.addEventListener('offline', upd); upd();
}

function route() {
  const raw = decodeURIComponent((location.hash || '').replace(/^#/, ''));
  const [name, arg] = raw.split('/');
  return { name: name || '', arg: arg || '' };
}
function go(hash) { if (location.hash === '#' + hash) render(); else location.hash = hash; }

function render() {
  const r = route();
  const main = clear($main());
  const map = { '': screenHome, nhap: screenEnter, ketqua: screenResults, chitiet: screenDetail, tracuu: screenLookup,
    lichsu: screenHistory, huongdan: screenGuide, caidat: screenSettings, anh: screenPhoto };
  const fn = map[r.name] || screenHome;
  main.append(fn(r.arg));
  document.querySelectorAll('.nav-item').forEach(a => {
    const active = a.dataset.route === r.name || (a.dataset.route === 'nhap' && ['ketqua', 'anh'].includes(r.name)) || (a.dataset.route === 'lichsu' && r.name === 'lichsu');
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.body.dataset.screen = r.name || 'home';
  window.scrollTo(0, 0);
  const h1 = main.querySelector('h1');
  if (h1 && document.activeElement && document.activeElement !== document.body && !main.contains(document.activeElement)) {
    h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true });
  }
}

function topbar(title, opts = {}) {
  return h('header', { class: 'topbar' },
    opts.noBack ? h('span', { class: 'tb-spacer' }) :
      h('button', { class: 'icon-btn', 'aria-label': 'Quay lại', onclick: () => (opts.backTo !== undefined ? go(opts.backTo) : history.length > 1 ? history.back() : go('')) }, icon('back')),
    h('h1', { class: 'tb-title', text: title }),
    opts.right || h('span', { class: 'tb-spacer' }));
}

// ---------------------------------------------------------------- tiện ích hiển thị
function results(values = S.draft.values, labRefs = S.draft.labRefs, profile = S.profile) {
  const out = {};
  for (const [id, raw] of Object.entries(values)) {
    if (!BY[id]) continue;
    out[id] = { ...classify(BY[id], raw, profile, labRefs[id] || null) };
  }
  return out;
}

const PILL_GLYPH = { ok: '✓', warn: '!', bad: '!', crit: '⚠', na: '?', info: 'i', none: '–' };
function pill(res, small = false) {
  if (!res) return h('span', { class: 'pill none' + (small ? ' sm' : '') }, 'Chưa nhập');
  const arrow = res.dir === 'high' ? '↑ ' : res.dir === 'low' ? '↓ ' : '';
  const lvl = res.level || 'none';
  return h('span', { class: `pill ${lvl}` + (small ? ' sm' : '') },
    h('span', { class: 'pill-g', 'aria-hidden': 'true', text: PILL_GLYPH[lvl] || '' }),
    (lvl === 'ok' || lvl === 'na' || lvl === 'none' ? '' : arrow) + shortLabel(res));
}
function shortLabel(res) {
  if (res.state === 'critical') return 'Nguy hiểm';
  if (res.state === 'normal' && res.basis === 'special') return 'Bình thường';
  if (res.state === 'normal' && res.basis !== 'clinical') return 'Trong khoảng';
  if (res.label.length <= 16) return res.label;
  if (res.level === 'ok') return 'Bình thường';
  if (res.level === 'na') return 'Chưa phân loại';
  if (res.dir === 'high') return res.level === 'warn' ? 'Cao nhẹ' : 'Cao';
  if (res.dir === 'low') return res.level === 'warn' ? 'Thấp nhẹ' : 'Thấp';
  return 'Cần lưu ý';
}
/** Nhãn đầy đủ khi nhãn trên huy hiệu bị rút gọn (ví dụ "Tiền đái tháo đường"). */
function fullLabel(res) {
  return res && res.label && shortLabel(res) !== res.label && res.state !== 'critical' && (res.state !== 'normal' || res.basis === 'special') ? res.label : '';
}

function groupBadge(t) {
  const g = GROUP_STYLE[t.group] || GROUP_STYLE.bio;
  return h('span', { class: 'gbadge ' + g.cls }, icon(g.icon));
}

function refText(t, labRef, profile = S.profile) {
  if (t.type === 'qual') return 'Bình thường: âm tính';
  const one = (lo, hi) => hi == null ? `≥ ${formatNum(lo)}` : (lo == null || lo === 0) ? `≤ ${formatNum(hi)}` : `${formatNum(lo)} – ${formatNum(hi)}`;
  if (labRef && (labRef.lo != null || labRef.hi != null)) return one(labRef.lo, labRef.hi) + ' (theo phiếu)';
  const sp = specialFor(t, profile);
  if (sp && sp.kind === 'ref') return sp.lo == null ? `≤ ${formatNum(sp.hi)}` : sp.hi == null ? `≥ ${formatNum(sp.lo)}` : one(sp.lo, sp.hi);
  if (sp && sp.kind === 'bands') {
    const okI = sp.bands.findIndex(b => b.level === 'ok');
    const lo = okI > 0 ? sp.bands[okI - 1].lt : null, hi = sp.bands[okI].lt;
    return one(lo, hi >= 99 ? null : hi).replace(/^≤/, '<');
  }
  if (sp && (sp.kind === 'na' || sp.kind === 'missing')) return 'Theo phiếu xét nghiệm';
  if (t.bands) {
    const ok = t.bands.filter(b => b.level === 'ok');
    const i0 = t.bands.indexOf(ok[0]);
    const lo = i0 > 0 ? t.bands[i0 - 1].lt : null; const hi = ok[ok.length - 1].lt;
    return one(lo, hi >= 999 ? null : hi);
  }
  const r = refFor(t, profile);
  if (r && !r.missing) return one(r.lo, r.hi);
  return `Nam ${one(t.ref.male[0], t.ref.male[1])} · Nữ ${one(t.ref.female[0], t.ref.female[1])}`;
}
function bandsText(t) {
  let lo = null;
  return t.bands.map(b => {
    const s = lo == null ? `< ${formatNum(b.lt)}` : (b.lt >= 999 ? `≥ ${formatNum(lo)}` : `${formatNum(lo)} – < ${formatNum(b.lt)}`);
    lo = b.lt; return `${s}: ${b.label}`;
  });
}
function displayValue(t, raw) {
  if (t.type === 'qual') return QUAL_LABEL[raw] || '';
  const p = parseNumber(raw);
  return p.state === 'ok' ? (p.qualifier ? p.qualifier + ' ' : '') + formatNum(p.value) : String(raw);
}
const SOURCE_BASIS = { special: 'Ngưỡng riêng cho đối tượng đã chọn', lab: 'Ngưỡng in trên phiếu của bạn', app: 'Khoảng tham chiếu phổ biến ở người lớn', clinical: 'Ngưỡng quyết định lâm sàng', critical: 'Giá trị báo động phổ biến của phòng xét nghiệm' };

function toast(msg, kind = 'info', action) {
  const box = document.getElementById('toasts');
  const t = h('div', { class: 'toast ' + kind, role: kind === 'warn' ? 'alert' : 'status' },
    h('span', { text: msg }),
    action ? h('button', { class: 'toast-btn', onclick: () => { action.run(); t.remove(); } }, action.label) : null,
    h('button', { class: 'toast-x', 'aria-label': 'Đóng', onclick: () => t.remove() }, icon('x')));
  box.append(t);
  if (!action) setTimeout(() => t.remove(), kind === 'warn' ? 7000 : 3500);
}

function confirmBox(title, body, okLabel, onOk, danger = true) {
  const prev = document.activeElement;
  const close = () => { wrap.remove(); prev && prev.focus && prev.focus(); };
  const okBtn = h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => { close(); onOk(); } }, okLabel);
  const wrap = h('div', { class: 'modal-wrap', onclick: e => { if (e.target === wrap) close(); } },
    h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'mdl-t' },
      h('h2', { id: 'mdl-t', text: title }), h('p', { text: body }),
      h('div', { class: 'row-end' }, h('button', { class: 'btn ghost', onclick: close }, 'Hủy'), okBtn)));
  wrap.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  document.body.append(wrap);
  okBtn.focus();
}

// ---------------------------------------------------------------- ảnh phiếu
function photoInputs() {
  const cam = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'sr-only', id: 'in-cam', tabindex: '-1', 'aria-hidden': 'true' });
  const gal = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'sr-only', id: 'in-gal', tabindex: '-1', 'aria-hidden': 'true' });
  const onPick = e => { const files = [...e.target.files].filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)); e.target.value = ''; if (files.length) startOcr(files); };
  cam.addEventListener('change', onPick); gal.addEventListener('change', onPick);
  return { cam, gal };
}

function startOcr(files) {
  if (files.some(f => f.size > 25 * 1024 * 1024)) { toast('Ảnh quá lớn (trên 25 MB).', 'warn'); return; }
  ui.ocr = { files, urls: files.map(f => URL.createObjectURL(f)), phase: 'Đang chuẩn bị…', pct: 0, status: 'running', result: null, error: null, run: Symbol() };
  const run = ui.ocr.run;
  go('anh');
  recognizeImages(files, (phase, pct) => {
    if (!ui.ocr || ui.ocr.run !== run) return;
    ui.ocr.phase = phase; ui.ocr.pct = pct || 0; updateOcrProgress();
  }).then(text => {
    if (!ui.ocr || ui.ocr.run !== run) return;
    const parsed = parseLabText(text, D.tests);
    ui.ocr.status = 'review'; ui.ocr.text = text;
    ui.ocr.items = parsed.items.map(it => ({ ...it, existing: S.draft.values[it.id] ?? '' }));
    ui.ocr.unmatched = parsed.unmatched; ui.ocr.hints = parsed.hints;
    if (route().name === 'anh') render();
  }).catch(err => {
    if (!ui.ocr || ui.ocr.run !== run) return;
    ui.ocr.status = 'error'; ui.ocr.error = (err && err.message) || 'Không đọc được ảnh.';
    if (route().name === 'anh') render();
  });
}
function updateOcrProgress() {
  const p = document.getElementById('ocr-phase'); const b = document.getElementById('ocr-bar');
  if (p) p.textContent = ui.ocr.phase;
  if (b) b.value = Math.round((ui.ocr.pct || 0) * 100);
}

function screenPhoto() {
  const o = ui.ocr;
  if (!o) { setTimeout(() => go('nhap'), 0); return h('div'); }
  const wrap = h('section', { class: 'screen' }, topbar(o.status === 'review' ? 'Kiểm tra chỉ số đọc được' : 'Đọc ảnh phiếu', { backTo: 'nhap' }));
  const thumbs = h('div', { class: 'thumbs' }, o.urls.map((u, i) => h('img', { src: u, alt: `Ảnh phiếu ${i + 1}` })));

  if (o.status === 'running') {
    wrap.append(h('div', { class: 'card ocr-run' }, thumbs,
      h('p', { id: 'ocr-phase', class: 'strong', 'aria-live': 'polite', text: o.phase }),
      h('progress', { id: 'ocr-bar', max: '100', value: String(Math.round(o.pct * 100)) }),
      h('p', { class: 'muted small', text: 'Ảnh được xử lý ngay trên máy của bạn, không gửi đi đâu. Lần đầu cần mạng để tải bộ nhận dạng chữ (khoảng 5 MB).' }),
      h('button', { class: 'btn ghost', onclick: () => { ui.ocr = null; go('nhap'); } }, 'Hủy')));
    return wrap;
  }
  if (o.status === 'error') {
    wrap.append(h('div', { class: 'card center-msg' }, icon('alert', 'xl warn-c'),
      h('h2', { text: 'Chưa đọc được ảnh' }), h('p', { text: o.error }),
      h('div', { class: 'row-wrap' }, h('button', { class: 'btn primary', onclick: () => startOcr(o.files) }, icon('refresh'), 'Thử lại'),
        h('button', { class: 'btn ghost', onclick: () => go('nhap') }, 'Nhập tay'))));
    return wrap;
  }

  // ---- màn hình xác nhận
  const items = o.items;
  const count = () => items.filter(i => i.selected && i.value !== '').length;
  const applyBtn = h('button', { class: 'btn primary block', onclick: applyOcr });
  const refreshApply = () => { const n = count(); applyBtn.textContent = n ? `Thêm ${n} chỉ số vào phiếu` : 'Chưa chọn chỉ số nào'; applyBtn.disabled = !n; };

  wrap.append(h('div', { class: 'card note' }, icon('shield'),
    h('p', {}, h('strong', { text: `Đọc được ${items.length} chỉ số. ` }),
      'Nhận dạng chữ có thể sai. Hãy so từng số với phiếu gốc trước khi thêm. Mục có dấu ', h('strong', { text: '!' }), ' cần bạn xác nhận.')));

  const hints = o.hints || {};
  const hintRow = [];
  if (hints.sex && hints.sex !== S.profile.sex) {
    hintRow.push(h('div', { class: 'card hint' }, h('span', { text: `Phiếu ghi giới tính: ${hints.sex === 'male' ? 'Nam' : 'Nữ'}.` }),
      h('button', { class: 'btn sm', onclick: e => { S.profile.sex = hints.sex; persist(); e.target.closest('.hint').remove(); toast('Đã chọn giới tính theo phiếu.'); } }, 'Áp dụng')));
  }
  const age = hints.age ?? (hints.birthYear ? new Date().getFullYear() - hints.birthYear : null);
  if (age != null && age >= 0 && age < 18 && S.profile.group !== 'child') {
    const band = age >= 2 ? ageBandFromYears(age) : '';
    hintRow.push(h('div', { class: 'card hint warn' }, h('span', { text: `Phiếu có vẻ của trẻ khoảng ${age} tuổi. App sẽ dùng ngưỡng dành cho trẻ em${band ? '' : ' (hãy chọn tuổi ở màn Đọc phiếu)'}.` }),
      h('button', { class: 'btn sm', onclick: e => { Object.assign(S.profile, { group: 'child', ageBand: band, trimester: 0 }); persist(); e.target.closest('.hint').remove(); toast('Đã chọn đối tượng Trẻ em' + (band ? ' ' + profileLabel(S.profile).replace('Trẻ em ', '') : '') + '.'); } }, 'Áp dụng')));
  }
  wrap.append(...hintRow);

  if (!items.length) {
    wrap.append(h('div', { class: 'card center-msg' }, icon('image', 'xl'),
      h('h2', { text: 'Không nhận ra chỉ số nào' }),
      h('p', { text: 'Hãy chụp lại: đặt phiếu phẳng, đủ sáng, chụp thẳng và gần, để bảng kết quả chiếm gần hết khung hình.' }),
      h('div', { class: 'row-wrap' }, h('button', { class: 'btn primary', onclick: () => document.getElementById('in-cam').click() }, icon('camera'), 'Chụp lại'),
        h('button', { class: 'btn ghost', onclick: () => go('nhap') }, 'Nhập tay'))));
  }

  const checkBox = h('div', { class: 'ocr-checks' });
  const refreshChecks = () => {
    const vals = {}, refs = {};
    items.forEach(i => { if (i.selected && i.value !== '') { vals[i.id] = i.value; if (i.labRef) refs[i.id] = i.labRef; } });
    const R0 = {}; for (const [id, v] of Object.entries(vals)) R0[id] = classify(BY[id], v, S.profile, refs[id] || null);
    const { checks } = interpret(R0, BY, S.profile, refs);
    checkBox.replaceChildren(...(checks.length ? [checksBox(checks)] : []));
  };
  const onRowChange = () => { refreshApply(); refreshChecks(); };
  const list = h('div', { class: 'list ocr-list' });
  for (const it of items) list.append(ocrRow(it, onRowChange));
  wrap.append(checkBox);
  if (items.length) wrap.append(h('div', { class: 'row-between' },
    h('h2', { class: 'sec', text: 'Chỉ số đọc được' }),
    h('button', { class: 'link', onclick: () => { const all = items.every(i => i.selected); items.forEach(i => { if (!i.warnings.length || all) i.selected = !all; }); render(); } }, items.every(i => i.selected) ? 'Bỏ chọn tất cả' : 'Chọn các mục chắc chắn')), list);

  if (o.unmatched && o.unmatched.length) {
    wrap.append(h('details', { class: 'card raw' }, h('summary', { text: `Các dòng có số nhưng app không nhận ra (${o.unmatched.length})` }),
      h('p', { class: 'muted small', text: 'Nếu trong đó có chỉ số bạn cần, hãy thêm bằng tay ở màn hình Đọc phiếu.' }),
      h('ul', {}, o.unmatched.slice(0, 40).map(l => h('li', { text: l })))));
  }
  wrap.append(h('details', { class: 'card raw' }, h('summary', { text: 'Xem toàn bộ chữ đọc được từ ảnh' }), h('pre', { text: o.text || '' })), thumbs);
  wrap.append(h('div', { class: 'sticky-act' }, applyBtn));
  refreshApply(); refreshChecks();
  wrap.append(photoInputs().cam);
  return wrap;
}

function ocrRow(it, onChange) {
  const t = BY[it.id];
  const chk = h('input', { type: 'checkbox', checked: it.selected, 'aria-label': 'Chọn ' + t.short });
  let field;
  if (t.type === 'qual') {
    field = h('select', { class: 'inp', 'aria-label': 'Kết quả ' + t.short }, (QUAL_OPTIONS[t.group] || QUAL_OPTIONS.endo).map(([v, l]) => h('option', { value: v, selected: v === it.value, text: l })));
  } else {
    field = h('input', { class: 'inp num', inputmode: 'decimal', autocomplete: 'off', value: it.value, 'aria-label': 'Kết quả ' + t.short });
  }
  const status = h('div', { class: 'ocr-status' });
  const upd = () => {
    clear(status);
    const r = classify(t, it.value, S.profile, it.labRef);
    status.append(pill(r, true));
    if (r.state === 'invalid' && r.reason) status.append(h('span', { class: 'err small', text: r.reason }));
    row.classList.toggle('off', !it.selected);
    onChange();
  };
  chk.addEventListener('change', () => { it.selected = chk.checked; upd(); });
  field.addEventListener('input', () => { it.value = field.value.trim(); if (!it.selected && it.value) { it.selected = true; chk.checked = true; } upd(); });

  const extras = [];
  if (it.alternatives) {
    extras.push(h('div', { class: 'alts' }, h('span', { class: 'small', text: 'Phiếu ghi:' }),
      it.alternatives.map(a => h('button', { class: 'chip', onclick: e => {
        it.value = a; field.value = a; it.selected = true; chk.checked = true;
        e.target.parentElement.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === e.target)); upd();
      } }, formatNum(Number(a)) + ' ' + (t.unit.split(' ')[0] || '')))));
  }
  for (const w of it.warnings) if (!it.alternatives || !/dấu thập phân/.test(w)) extras.push(h('p', { class: 'warn-t small' }, icon('alert'), w));
  for (const n of it.notes || []) extras.push(h('p', { class: 'muted small', text: n }));
  if (it.labRef) {
    const chip = h('span', { class: 'chip ref' }, 'Ngưỡng phiếu: ' + refText(t, it.labRef).replace(' (theo phiếu)', ''),
      h('button', { class: 'chip-x', 'aria-label': 'Bỏ ngưỡng phiếu', onclick: () => { it.labRef = null; chip.remove(); upd(); } }, icon('x')));
    extras.push(chip);
  }
  if (it.existing && it.existing !== it.value) extras.push(h('p', { class: 'muted small', text: `Phiếu đang có ${displayValue(t, it.existing)} — sẽ được thay.` }));

  const row = h('div', { class: 'ocr-row' + (it.warnings.length ? ' attn' : '') },
    h('label', { class: 'ocr-chk' }, chk),
    h('div', { class: 'ocr-main' },
      h('div', { class: 'ocr-head' }, groupBadge(t), h('div', { class: 'nm' }, h('strong', { text: t.short }), h('span', { class: 'muted small', text: t.name }))),
      h('div', { class: 'ocr-val' }, field, h('span', { class: 'unit', text: t.unit })),
      status, extras,
      h('p', { class: 'src-line', text: 'Trên ảnh: ' + it.line })));
  upd();
  return row;
}

function applyOcr() {
  const o = ui.ocr; if (!o) return;
  let n = 0;
  for (const it of o.items) {
    if (!it.selected || it.value === '') continue;
    S.draft.values[it.id] = it.value;
    if (it.labRef) S.draft.labRefs[it.id] = it.labRef; else delete S.draft.labRefs[it.id];
    if (!S.draft.order.includes(it.id)) S.draft.order.push(it.id);
    if (!S.draft.fromPhoto.includes(it.id)) S.draft.fromPhoto.push(it.id);
    n++;
  }
  S.draft.sample = false;
  persist();
  o.urls.forEach(u => URL.revokeObjectURL(u));
  ui.ocr = null;
  toast(`Đã thêm ${n} chỉ số từ ảnh.`);
  go('ketqua');
}

// ---------------------------------------------------------------- TRANG CHỦ
function screenHome() {
  const { cam, gal } = photoInputs();
  const n = Object.keys(S.draft.values).length;
  const R = results();
  const out = Object.values(R).filter(r => ['out', 'crit'].includes(bucket(r))).length;
  return h('section', { class: 'screen home' },
    h('div', { class: 'hero' },
      h('div', { class: 'brand' }, h('img', { src: 'icons/icon-192.png', alt: '', class: 'logo' }),
        h('div', {}, h('h1', { text: 'Đọc Phiếu Xét Nghiệm' }), h('p', { class: 'tagline', text: 'Hiểu kết quả · Chủ động sức khỏe' }))),
      h('a', { href: '#caidat', class: 'icon-btn', 'aria-label': 'Cài đặt' }, icon('gear'))),
    installCard(),
    h('div', { class: 'card cta' },
      h('div', { class: 'cta-ic' }, icon('camera')),
      h('div', { class: 'cta-tx' }, h('h2', { text: 'Chụp ảnh phiếu xét nghiệm' }),
        h('p', { text: 'App tự đọc các chỉ số, bạn chỉ cần kiểm tra lại. Không phải gõ từng số.' })),
      h('div', { class: 'cta-act' },
        h('button', { class: 'btn on-dark', onclick: () => cam.click() }, icon('camera'), 'Chụp phiếu'),
        h('button', { class: 'btn on-dark ghost', onclick: () => gal.click() }, icon('image'), 'Chọn ảnh có sẵn')), cam, gal),
    n ? h('a', { href: '#ketqua', class: 'card current' },
      h('div', {}, h('span', { class: 'eyebrow', text: 'Phiếu đang xem' }),
        h('strong', { text: `${n} chỉ số` + (out ? ` · ${out} ngoài khoảng tham chiếu` : '') })),
      h('span', { class: 'link' }, 'Xem kết quả', icon('chev'))) : null,
    h('div', { class: 'card note' }, icon('info'),
      h('p', { text: 'Thông tin chỉ mang tính tham khảo, không thay thế chẩn đoán của bác sĩ. Luôn đối chiếu với phiếu gốc.' })),
    h('nav', { class: 'tiles', 'aria-label': 'Chức năng' },
      tile('nhap', 'doc', 'm-doc', 'Nhập tay', 'Gõ chỉ số và xem kết quả'),
      tile('tracuu', 'search', 'm-look', 'Tra cứu chỉ số', `Ý nghĩa ${D.tests.length} xét nghiệm`),
      tile('lichsu', 'clock', 'm-hist', 'Lịch sử', S.history.length ? `${S.history.length} lần đã lưu` : 'Lưu và so sánh các lần'),
      tile('huongdan', 'book', 'm-guide', 'Hướng dẫn', 'Cách chụp phiếu, đọc kết quả')));
}
function tile(route, ic, cls, title, sub) {
  return h('a', { href: '#' + route, class: 'tile ' + cls }, h('span', { class: 'tile-ic' }, icon(ic)),
    h('span', { class: 'tile-tx' }, h('strong', { text: title }), h('span', { text: sub })), icon('chev', 'chev'));
}

// ---------------------------------------------------------------- NHẬP
function profileBlock() {
  const set = patch => { Object.assign(S.profile, patch); persist(); render(); };
  const sexBtn = (v, label, sym) => h('button', { class: 'seg-btn' + (S.profile.sex === v ? ' on' : ''), 'aria-pressed': String(S.profile.sex === v),
    onclick: () => {
      const sex = S.profile.sex === v ? '' : v;
      // Chọn "Nam" khi đang ở "Mang thai" → chuyển về người lớn
      set(S.profile.group === 'pregnant' && sex !== 'female' ? { sex, group: 'adult', trimester: 0 } : { sex });
    } }, h('span', { class: 'sym', text: sym, 'aria-hidden': 'true' }), label);
  const chip = (on, label, onclick) => h('button', { class: 'chip' + (on ? ' on' : ''), 'aria-pressed': String(on), onclick }, label);
  const g = S.profile.group;
  return h('div', { class: 'card profile' },
    h('div', { class: 'field' }, h('span', { class: 'lbl', text: 'Giới tính' }),
      h('div', { class: 'seg' }, sexBtn('male', 'Nam', '♂'), sexBtn('female', 'Nữ', '♀')),
      !S.profile.sex ? h('p', { class: 'muted small', text: 'Chưa chọn: các chỉ số có ngưỡng khác nhau giữa nam và nữ sẽ chưa được phân loại.' }) : null),
    h('div', { class: 'field' }, h('span', { class: 'lbl', text: 'Đối tượng' }),
      h('div', { class: 'chips' }, Object.entries(PROFILE_GROUPS).map(([k, label]) => chip(g === k, label, () =>
        set(k === 'pregnant' ? { group: k, sex: 'female', ageBand: '' } : k === 'child' ? { group: k, trimester: 0 } : { group: k, ageBand: '', trimester: 0 }))))),
    g === 'adult' ? ageField() : null,
    g === 'child' ? h('div', { class: 'field sub-field' }, h('span', { class: 'lbl', text: 'Tuổi của trẻ' }),
      h('div', { class: 'chips' }, AGE_BANDS.map(([k, label]) => chip(S.profile.ageBand === k, label, () => set({ ageBand: k })))),
      !S.profile.ageBand ? h('p', { class: 'warn-t small' }, icon('alert'), 'Chọn tuổi để app áp dụng ngưỡng dành cho trẻ em.') : null) : null,
    g === 'pregnant' ? h('div', { class: 'field sub-field' }, h('span', { class: 'lbl', text: 'Giai đoạn thai kỳ' }),
      h('div', { class: 'chips' }, Object.entries(TRIMESTERS).map(([k, label]) => chip(S.profile.trimester === Number(k), label, () => set({ trimester: Number(k) })))),
      !S.profile.trimester ? h('p', { class: 'warn-t small' }, icon('alert'), 'Chọn giai đoạn để app áp dụng ngưỡng dành cho thai phụ.') : null) : null,
    g !== 'adult' ? h('p', { class: 'muted small', text: g === 'child'
      ? 'App có ngưỡng riêng cho trẻ em với Hb (WHO 2024), mỡ máu (NHLBI 2011), đường huyết và HbA1c (ADA). Các chỉ số thay đổi nhiều theo tuổi (bạch cầu, tiểu cầu, men gan, creatinin…) cần ngưỡng in trên phiếu.'
      : 'App có ngưỡng riêng cho thai phụ với Hb theo giai đoạn (WHO 2024), đường huyết đói (IADPSG) và TSH (ATA 2017). HbA1c và mỡ máu không dùng để đánh giá khi mang thai. Các chỉ số khác cần ngưỡng in trên phiếu.' }) : null);
}

function ageField() {
  const inp = h('input', { class: 'inp num sm', id: 'in-age', inputmode: 'numeric', maxlength: '3', autocomplete: 'off', value: S.profile.age ?? '', placeholder: '—', 'aria-describedby': 'age-hint' });
  const hint = h('span', { class: 'small muted', id: 'age-hint', text: 'Không bắt buộc. Dùng để tính eGFR (mức lọc cầu thận) từ creatinin.' });
  inp.addEventListener('input', () => {
    const v = inp.value.trim();
    if (v === '') { S.profile.age = null; hint.textContent = 'Không bắt buộc. Dùng để tính eGFR (mức lọc cầu thận) từ creatinin.'; hint.className = 'small muted'; persist(); return; }
    const n = /^\d{1,3}$/.test(v) ? Number(v) : NaN;
    if (n >= 18 && n <= 120) { S.profile.age = n; hint.textContent = 'Đã lưu tuổi.'; hint.className = 'small muted'; persist(); }
    else { hint.textContent = n < 18 ? 'Dưới 18 tuổi: hãy chọn đối tượng "Trẻ em".' : 'Tuổi không hợp lệ (18–120).'; hint.className = 'small err'; }
  });
  return h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'in-age', text: 'Tuổi' }), h('div', { class: 'row' }, inp, h('span', { text: 'tuổi' })), hint);
}

function screenEnter() {
  const { cam, gal } = photoInputs();
  const order = S.draft.order.filter(id => id in S.draft.values);
  const wrap = h('section', { class: 'screen' },
    topbar('Đọc phiếu xét nghiệm', { backTo: '', right: h('a', { href: '#huongdan', class: 'icon-btn', 'aria-label': 'Hướng dẫn' }, icon('help')) }));

  const R = results();
  const left = h('div', { class: 'col' }, profileBlock(),
    h('div', { class: 'card photo' },
      h('div', { class: 'photo-tx' }, icon('camera', 'lg'), h('div', {}, h('strong', { text: 'Có phiếu giấy? Chụp ảnh cho nhanh' }),
        h('span', { class: 'muted small', text: 'App đọc chữ ngay trên máy. Chụp được nhiều trang.' }))),
      h('div', { class: 'row-wrap' },
        h('button', { class: 'btn primary', onclick: () => cam.click() }, icon('camera'), 'Chụp phiếu'),
        h('button', { class: 'btn ghost', onclick: () => gal.click() }, icon('image'), 'Chọn ảnh')), cam, gal));

  // --- tìm & thêm
  const sugg = h('ul', { class: 'sugg', role: 'listbox', id: 'sugg', hidden: true });
  const search = h('input', { type: 'search', class: 'inp search', id: 'add-q', placeholder: 'Tìm và thêm chỉ số… (ví dụ: HGB, men gan)', autocomplete: 'off',
    role: 'combobox', 'aria-expanded': 'false', 'aria-controls': 'sugg', 'aria-autocomplete': 'list' });
  const addTest = id => {
    if (!(id in S.draft.values)) S.draft.values[id] = '';
    if (!S.draft.order.includes(id)) S.draft.order.push(id);
    persist(); render();
    setTimeout(() => { const el = document.getElementById('in-' + id); if (el) { el.focus(); el.scrollIntoView({ block: 'center' }); } }, 30);
  };
  const showSugg = () => {
    const hits = searchTests(search.value).slice(0, 8);
    clear(sugg);
    hits.forEach((t, i) => sugg.append(h('li', { role: 'option', id: 'sg-' + t.id, 'aria-selected': String(i === 0), class: 'sugg-it', onmousedown: e => { e.preventDefault(); addTest(t.id); } },
      groupBadge(t), h('span', {}, h('strong', { text: t.short }), ' ', h('span', { class: 'muted', text: t.name })),
      t.id in S.draft.values ? h('span', { class: 'small muted', text: 'đã có' }) : icon('plus'))));
    const open = !!search.value.trim() && hits.length > 0;
    sugg.hidden = !open; search.setAttribute('aria-expanded', String(open));
  };
  search.addEventListener('input', showSugg);
  search.addEventListener('keydown', e => { if (e.key === 'Enter') { const f = searchTests(search.value)[0]; if (f) { e.preventDefault(); addTest(f.id); } } if (e.key === 'Escape') { sugg.hidden = true; } });
  search.addEventListener('blur', () => setTimeout(() => { sugg.hidden = true; }, 150));

  const addGroup = gid => {
    D.tests.filter(t => t.group === gid && (!t.sex || !S.profile.sex || t.sex === S.profile.sex)).forEach(t => {
      if (!(t.id in S.draft.values)) S.draft.values[t.id] = '';
      if (!S.draft.order.includes(t.id)) S.draft.order.push(t.id);
    });
    persist(); render();
  };

  const listBox = h('div', { class: 'card list-card' },
    h('div', { class: 'row-between' }, h('h2', { class: 'sec', text: `Các chỉ số đã thêm (${order.length})` }),
      S.draft.sample ? h('span', { class: 'tag warn', text: 'Dữ liệu ví dụ' }) : null),
    h('div', { class: 'combo' }, icon('search', 'in-ic'), search, sugg),
    h('div', { class: 'chips add-groups' }, h('span', { class: 'small muted', text: 'Thêm cả nhóm:' }),
      D.groups.map(g => h('button', { class: 'chip', onclick: () => addGroup(g.id) }, icon('plus'), g.name))));

  if (!order.length) {
    listBox.append(h('div', { class: 'empty' }, h('p', { text: 'Chưa có chỉ số nào. Chụp ảnh phiếu, tìm chỉ số ở ô trên, hoặc thêm cả nhóm.' }),
      h('button', { class: 'btn ghost', onclick: loadSample }, 'Tải ví dụ để xem thử')));
  } else {
    const rows = h('div', { class: 'list entry-list' });
    order.forEach(id => rows.append(entryRow(BY[id], R[id])));
    listBox.append(rows);
  }

  const right = h('div', { class: 'col' }, listBox,
    h('div', { class: 'row-wrap tools' },
      h('button', { class: 'btn ghost', onclick: loadSample }, 'Tải ví dụ'),
      order.length ? h('button', { class: 'btn ghost danger-t', onclick: () => confirmBox('Xóa các chỉ số đang nhập?', 'Các giá trị và ngưỡng phiếu đang nhập sẽ bị xóa. Lịch sử đã lưu không bị ảnh hưởng.', 'Xóa', () => {
        S.draft = { values: {}, labRefs: {}, order: [], sample: false, fromPhoto: [] }; persist(); render(); toast('Đã xóa các chỉ số đang nhập.');
      }) }, icon('trash'), 'Xóa dữ liệu') : null));

  const filled = order.filter(id => S.draft.values[id] !== '').length;
  wrap.append(h('div', { class: 'two-col' }, left, right),
    h('div', { class: 'sticky-act' }, h('button', { class: 'btn primary block', disabled: !filled, onclick: () => go('ketqua') }, icon('chart'),
      filled ? `Phân tích kết quả (${filled})` : 'Nhập ít nhất 1 chỉ số để phân tích')));
  return wrap;
}

function loadSample() {
  const doIt = () => {
    S.profile = { ...SAMPLE.profile };
    S.draft = { values: { ...SAMPLE.values }, labRefs: {}, order: Object.keys(SAMPLE.values), sample: true, fromPhoto: [] };
    persist(); render(); toast('Đã tải dữ liệu ví dụ (không phải kết quả của bạn).');
  };
  if (Object.values(S.draft.values).some(v => v !== '') && !S.draft.sample) confirmBox('Thay bằng dữ liệu ví dụ?', 'Các chỉ số đang nhập sẽ bị thay bằng dữ liệu ví dụ.', 'Tải ví dụ', doIt, false);
  else doIt();
}

function entryRow(t, res) {
  const id = t.id;
  let field;
  if (t.type === 'qual') {
    field = h('select', { class: 'inp', id: 'in-' + id, 'aria-label': `${t.short} – ${t.name}` },
      (QUAL_OPTIONS[t.group] || QUAL_OPTIONS.endo).map(([v, l]) => h('option', { value: v, selected: v === S.draft.values[id], text: l })));
  } else {
    field = h('input', { class: 'inp num', id: 'in-' + id, inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'next', maxlength: '20',
      value: S.draft.values[id] || '', placeholder: '—', 'aria-label': `${t.short} – ${t.name}`, 'aria-describedby': 'st-' + id });
  }
  const status = h('div', { class: 'e-status', id: 'st-' + id, 'aria-live': 'polite' });
  const paint = () => {
    const r = classify(t, S.draft.values[id], S.profile, S.draft.labRefs[id] || null);
    clear(status);
    if (r.state !== 'empty') status.append(pill(r, true));
    if (fullLabel(r)) status.append(h('span', { class: 'small lbl-full lv-' + r.level, text: fullLabel(r) }));
    if ((r.state === 'invalid' || r.state === 'insufficient') && r.reason) status.append(h('span', { class: r.state === 'invalid' ? 'err small' : 'muted small', text: r.reason }));
    field.setAttribute('aria-invalid', String(r.state === 'invalid'));
  };
  const onEdit = () => {
    S.draft.values[id] = field.value.trim();
    if (S.draft.sample) S.draft.sample = false;
    S.draft.fromPhoto = S.draft.fromPhoto.filter(x => x !== id);
    persist(); paint();
    const btn = document.querySelector('.sticky-act .btn');
    const filled = Object.values(S.draft.values).filter(v => v !== '').length;
    if (btn) { btn.disabled = !filled; btn.lastChild.textContent = filled ? `Phân tích kết quả (${filled})` : 'Nhập ít nhất 1 chỉ số để phân tích'; }
  };
  field.addEventListener(t.type === 'qual' ? 'change' : 'input', onEdit);

  // ngưỡng trên phiếu
  const lr = S.draft.labRefs[id] || {};
  const lo = h('input', { class: 'inp num sm', inputmode: 'decimal', value: lr.lo != null ? formatNum(lr.lo) : '', 'aria-label': 'Ngưỡng dưới trên phiếu', placeholder: 'Dưới' });
  const hi = h('input', { class: 'inp num sm', inputmode: 'decimal', value: lr.hi != null ? formatNum(lr.hi) : '', 'aria-label': 'Ngưỡng trên trên phiếu', placeholder: 'Trên' });
  const refErr = h('span', { class: 'err small' });
  const onRef = () => {
    const p = parseLabRef(lo.value, hi.value);
    refErr.textContent = p.state === 'invalid' ? p.error : '';
    if (p.state === 'ok') S.draft.labRefs[id] = { lo: p.lo, hi: p.hi };
    else if (p.state === 'empty') delete S.draft.labRefs[id];
    persist(); paint();
  };
  lo.addEventListener('input', onRef); hi.addEventListener('input', onRef);
  const refBox = t.type === 'num' ? h('details', { class: 'labref', open: !!S.draft.labRefs[id] },
    h('summary', { text: S.draft.labRefs[id] ? 'Ngưỡng trên phiếu' : '＋ Ngưỡng trên phiếu (nếu khác)' }),
    h('div', { class: 'ref-in' }, lo, h('span', { text: '–' }), hi, h('span', { class: 'unit', text: t.unit })), refErr,
    h('p', { class: 'muted small', text: `Ngưỡng của app${S.profile.group !== 'adult' ? ' (' + profileLabel(S.profile) + ')' : ''}: ${refText(t, null)}. Ngưỡng trên phiếu được ưu tiên khi phân loại.` })) : null;

  const row = h('div', { class: 'e-row' },
    groupBadge(t),
    h('div', { class: 'e-main' },
      h('div', { class: 'e-top' },
        h('label', { for: 'in-' + id, class: 'nm' }, h('strong', { text: t.short }), h('span', { class: 'muted small', text: t.name })),
        h('div', { class: 'e-val' }, field, h('span', { class: 'unit', text: t.unit || '' })),
        h('button', { class: 'icon-btn sm', 'aria-label': 'Xóa ' + t.short, onclick: () => {
          delete S.draft.values[id]; delete S.draft.labRefs[id];
          S.draft.order = S.draft.order.filter(x => x !== id); S.draft.fromPhoto = S.draft.fromPhoto.filter(x => x !== id);
          persist(); render();
        } }, icon('trash'))),
      h('div', { class: 'e-sub' }, status, S.draft.fromPhoto.includes(id) ? h('span', { class: 'tag', text: 'từ ảnh' }) : null),
      refBox));
  paint();
  return row;
}

function searchTests(q) {
  const n = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
  const qq = n(q.trim());
  if (!qq) return D.tests;
  const scored = [];
  for (const t of D.tests) {
    const short = n(t.short), name = n(t.name), al = (t.aliases || []).map(n);
    let s = 0;
    if (short === qq || al.includes(qq)) s = 100;
    else if (short.startsWith(qq)) s = 80;
    else if (al.some(a => a.startsWith(qq))) s = 70;
    else if (name.includes(qq)) s = 60;
    else if (al.some(a => a.includes(qq))) s = 50;
    else if (n(t.what).includes(qq)) s = 20;
    if (s) scored.push([s, t]);
  }
  return scored.sort((a, b) => b[0] - a[0]).map(x => x[1]);
}

// ---------------------------------------------------------------- KẾT QUẢ
function screenResults(arg, snapshot) {
  const src = snapshot || { values: S.draft.values, labRefs: S.draft.labRefs, profile: S.profile, at: null };
  const R = results(src.values, src.labRefs, src.profile);
  const ids = (snapshot ? Object.keys(src.values) : S.draft.order.filter(id => id in src.values)).filter(id => R[id] && R[id].state !== 'empty');
  const wrap = h('section', { class: 'screen results' },
    topbar(snapshot ? 'Kết quả đã lưu' : 'Kết quả phân tích', { backTo: snapshot ? 'lichsu' : 'nhap',
      right: h('button', { class: 'icon-btn no-print', 'aria-label': 'In hoặc lưu PDF', onclick: () => window.print() }, icon('print')) }));

  if (!ids.length) {
    wrap.append(h('div', { class: 'card center-msg' }, icon('doc', 'xl'), h('h2', { text: 'Chưa có chỉ số để phân tích' }),
      h('p', { text: 'Chụp ảnh phiếu hoặc nhập chỉ số trước.' }), h('a', { class: 'btn primary', href: '#nhap' }, 'Đến Đọc phiếu')));
    return wrap;
  }
  const cnt = { in: 0, out: 0, crit: 0, unclassified: 0 };
  ids.forEach(id => cnt[bucket(R[id])]++);
  const when = src.at ? new Date(src.at) : new Date();
  const fmtDate = d => d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const prof = [src.profile.sex === 'male' ? 'Nam' : src.profile.sex === 'female' ? 'Nữ' : 'Chưa chọn giới tính', profileLabel(src.profile)].join(' · ');

  const summary = h('div', { class: 'card summary' },
    h('div', { class: 'row-between' }, h('h2', { class: 'sec', text: 'Tổng quan kết quả' }), h('span', { class: 'muted small', text: fmtDate(when) })),
    h('p', { class: 'small muted' }, prof, !snapshot ? [' · ', h('a', { href: '#nhap', text: 'Đổi' })] : null),
    h('div', { class: 'stats' },
      stat('in', cnt.in, 'Trong khoảng', 'check'), stat('out', cnt.out, 'Ngoài khoảng', 'alert'),
      stat('crit', cnt.crit, 'Cần khẩn cấp', 'alert'), stat('na', cnt.unclassified, 'Chưa phân loại', 'help')),
    h('p', { class: 'small', text: `Đã phân tích ${ids.length}/${D.tests.length} chỉ số có trong app. Kết quả chỉ để tham khảo; bác sĩ sẽ đánh giá cùng triệu chứng và khám lâm sàng.` }));

  const critIds = ids.filter(id => bucket(R[id]) === 'crit');
  const critBox = critIds.length ? h('div', { class: 'card alert-crit', role: 'alert' },
    h('div', { class: 'row' }, icon('alert'), h('strong', { text: 'Có chỉ số ở mức cần đánh giá khẩn cấp' })),
    h('ul', {}, critIds.map(id => h('li', {}, h('strong', { text: BY[id].short }), ` = ${R[id].display || displayValue(BY[id], src.values[id])} ${BY[id].unit}`))),
    h('p', { text: 'Nếu số trên phiếu đúng như vậy, hãy liên hệ ngay bác sĩ hoặc cơ sở y tế nơi làm xét nghiệm. Nếu có triệu chứng nặng (khó thở, đau ngực, lơ mơ, co giật, chảy máu nhiều), gọi cấp cứu 115.' })) : null;

  const IP = interpret(R, BY, src.profile, src.labRefs);
  const rulesBox = linkedBlock(IP, src);
  // bộ lọc + danh sách
  const counts = { all: ids.length, in: cnt.in, out: cnt.out + cnt.crit, na: cnt.unclassified };
  const match = id => ui.filter === 'all' || (ui.filter === 'in' && bucket(R[id]) === 'in') || (ui.filter === 'out' && ['out', 'crit'].includes(bucket(R[id]))) || (ui.filter === 'na' && bucket(R[id]) === 'unclassified');
  if (!counts[ui.filter]) ui.filter = 'all';
  const filters = h('div', { class: 'chips filters no-print', role: 'group', 'aria-label': 'Lọc kết quả' },
    [['all', 'Tất cả'], ['in', 'Trong khoảng'], ['out', 'Ngoài khoảng'], ['na', 'Chưa phân loại']].map(([k, l]) =>
      h('button', { class: 'chip' + (ui.filter === k ? ' on' : ''), 'aria-pressed': String(ui.filter === k), disabled: !counts[k] && k !== 'all', onclick: () => { ui.filter = k; render(); } }, `${l} (${counts[k]})`)));
  const order = ['crit', 'out', 'unclassified', 'in'];
  const sorted = [...ids].sort((a, b) => order.indexOf(bucket(R[a])) - order.indexOf(bucket(R[b])));
  const list = h('div', { class: 'list res-list' });
  sorted.filter(match).forEach(id => {
    const t = BY[id], r = R[id];
    list.append(h('a', { href: '#chitiet/' + id, class: 'res-row lv-' + r.level },
      groupBadge(t),
      h('span', { class: 'res-main' }, h('strong', { text: t.name }),
        h('span', { class: 'res-val' }, h('b', { class: 'num', text: r.display || displayValue(t, src.values[id]) }), ' ', h('span', { class: 'muted', text: t.unit }),
          h('span', { class: 'muted ref', text: '  ' + refText(t, src.labRefs[id], src.profile) })),
        fullLabel(r) ? h('span', { class: 'small lbl-full lv-' + r.level, text: fullLabel(r) }) : null),
      pill(r), icon('chev', 'chev')));
  });

  const actions = h('div', { class: 'row-wrap no-print actions' });
  if (!snapshot) {
    const sig = JSON.stringify([src.values, src.labRefs, src.profile]);
    const saved = ui.savedSig === sig;
    actions.append(
      h('button', { class: 'btn primary', disabled: saved, onclick: () => saveHistory(sig) }, icon('save'), saved ? 'Đã lưu vào lịch sử' : 'Lưu vào lịch sử'),
      h('a', { class: 'btn ghost', href: '#nhap' }, icon('edit'), 'Sửa chỉ số'));
  } else {
    actions.append(
      h('button', { class: 'btn primary', onclick: () => openSnapshot(snapshot) }, icon('edit'), 'Mở để chỉnh sửa'),
      h('button', { class: 'btn ghost danger-t', onclick: () => confirmBox('Xóa lần lưu này?', 'Không thể khôi phục sau khi xóa.', 'Xóa', () => {
        S.history = S.history.filter(x => x.id !== snapshot.id); persist(); go('lichsu'); toast('Đã xóa.');
      }) }, icon('trash'), 'Xóa lần lưu này'));
  }
  actions.append(h('button', { class: 'btn ghost', onclick: () => window.print() }, icon('print'), 'In / lưu PDF'));

  const printHead = h('div', { class: 'print-only' }, h('h1', { text: 'Đọc Phiếu Xét Nghiệm — Bản tóm tắt tham khảo' }),
    h('p', { text: `${fmtDate(when)} · ${prof}. Không phải kết quả xét nghiệm chính thức và không thay thế chẩn đoán của bác sĩ.` }));
  wrap.append(printHead, h('div', { class: 'two-col' },
    h('div', { class: 'col' }, summary, critBox, IP.checks.length ? checksBox(IP.checks) : null, rulesBox),
    h('div', { class: 'col' }, filters, list, actions)));
  return wrap;
}
const PANEL_LEVEL = { crit: ['crit', 'Cần khẩn cấp'], bad: ['bad', 'Bất thường'], warn: ['warn', 'Cần lưu ý'], ok: ['ok', 'Ổn'], info: ['ok', 'Ổn'], na: ['na', 'Chưa đủ'] };
function levelPill(level) {
  const [cls, label] = PANEL_LEVEL[level] || PANEL_LEVEL.na;
  return h('span', { class: 'pill sm ' + cls }, h('span', { class: 'pill-g', 'aria-hidden': 'true', text: PILL_GLYPH[cls] }), label);
}
function checksBox(checks) {
  return h('div', { class: 'card checks', role: 'alert' },
    h('div', { class: 'row' }, icon('alert'), h('strong', { text: 'Số liệu có thể đã bị nhập hoặc đọc sai' })),
    h('ul', {}, checks.map(c => h('li', {}, h('span', { class: 'muted small', text: c.panel + ': ' }), c.text))),
    h('p', { class: 'small', text: 'Hãy so lại với phiếu gốc. Phần đọc liên kết bên dưới có thể chưa chính xác cho đến khi sửa.' }));
}
function linkedBlock(IP, src) {
  const box = h('div', { class: 'card linked' },
    h('h2', { class: 'sec', text: 'Đọc liên kết theo nhóm' }),
    h('p', { class: 'small muted', text: 'App đọc các chỉ số liên quan cùng nhau theo từng nhóm cơ quan, tính thêm các tỷ lệ thường dùng và kiểm tra số liệu có khớp nhau không.' }));
  if (!IP.panels.length) { box.append(h('p', { class: 'small', text: 'Chưa có nhóm nào đủ chỉ số để đọc liên kết.' })); return box; }
  for (const p of IP.panels) {
    const open = ['warn', 'bad', 'crit'].includes(p.level);
    const body = h('div', { class: 'pn-body' });
    p.findings.forEach(f => body.append(h('div', { class: 'finding lv-' + f.level },
      h('span', { class: 'fd-g', 'aria-hidden': 'true', text: PILL_GLYPH[f.level === 'info' ? 'info' : f.level] || '•' }),
      h('div', {}, h('strong', { text: f.title }), h('p', { class: 'small', text: f.detail }),
        f.source && (FORMULA_SOURCES[f.source] || D.sources[f.source]) ? h('p', { class: 'src small', text: 'Căn cứ: ' + (FORMULA_SOURCES[f.source] || D.sources[f.source]) }) : null))));
    if (!p.findings.length) body.append(h('p', { class: 'small muted', text: p.summary }));
    if (p.derived.length) {
      body.append(h('div', { class: 'derived' }, h('span', { class: 'eyebrow', text: 'Chỉ số tính thêm' }),
        p.derived.map(d => h('div', { class: 'dv' },
          h('div', { class: 'dv-top' }, h('span', { text: d.label }), h('b', { class: 'num', text: d.value + (d.unit ? ' ' + d.unit : '') })),
          d.note ? h('span', { class: 'small muted', text: d.note }) : null,
          d.source && FORMULA_SOURCES[d.source] ? h('span', { class: 'src small', text: FORMULA_SOURCES[d.source] }) : null))));
    }
    p.checks.forEach(c => body.append(h('p', { class: 'warn-t small' }, icon('alert'), c.text)));
    body.append(h('div', { class: 'pn-tests' }, p.ids.map(id => {
      const r = classify(BY[id], src.values[id], src.profile, src.labRefs[id] || null);
      return h('a', { href: '#chitiet/' + id, class: 'mini lv-' + r.level }, h('span', { text: BY[id].short }), h('b', { class: 'num', text: r.display || displayValue(BY[id], src.values[id]) }));
    })));
    if (p.suggest.length) body.append(h('p', { class: 'small suggest' }, h('strong', { text: 'Bác sĩ có thể cân nhắc thêm: ' }), p.suggest.join(', ') + '.'));
    box.append(h('details', { class: 'panel lv-' + p.level, open },
      h('summary', {}, h('span', { class: 'pn-ic' }, icon(p.icon)),
        h('span', { class: 'pn-tx' }, h('strong', { text: p.title }), h('span', { class: 'small muted', text: p.summary })),
        levelPill(p.level)), body));
  }
  box.append(h('span', { class: 'tag', text: 'Nội dung chưa được chuyên gia rà soát' }));
  return box;
}
window.addEventListener('beforeprint', () => document.querySelectorAll('details.panel').forEach(d => { d.open = true; }));

function stat(cls, n, label, ic) {
  return h('div', { class: 'stat s-' + cls + (n ? '' : ' zero') }, icon(ic), h('b', { class: 'num', text: String(n) }), h('span', { text: label }));
}
function saveHistory(sig) {
  const values = Object.fromEntries(Object.entries(S.draft.values).filter(([, v]) => v !== ''));
  S.history.unshift({ id: newId(), at: new Date().toISOString(), profile: { ...S.profile }, values, labRefs: { ...S.draft.labRefs } });
  S.history = S.history.slice(0, 60);
  const r = store.save(S);
  if (!r.ok) { S.history.shift(); toast(r.error, 'warn'); return; }
  ui.savedSig = sig; render(); toast('Đã lưu vào lịch sử trên trình duyệt này.');
}
function openSnapshot(snap) {
  const doIt = () => {
    S.profile = { ...snap.profile };
    S.draft = { values: { ...snap.values }, labRefs: { ...snap.labRefs }, order: Object.keys(snap.values), sample: false, fromPhoto: [] };
    persist(); go('nhap');
  };
  if (Object.values(S.draft.values).some(v => v !== '')) confirmBox('Mở lần lưu này để chỉnh sửa?', 'Các chỉ số đang nhập sẽ được thay bằng dữ liệu của lần lưu này.', 'Mở', doIt, false);
  else doIt();
}

// ---------------------------------------------------------------- CHI TIẾT
function screenDetail(id) {
  const t = BY[id];
  if (!t) return h('section', { class: 'screen' }, topbar('Chi tiết chỉ số'), h('p', { class: 'card', text: 'Không tìm thấy chỉ số này.' }));
  const raw = S.draft.values[id];
  const has = raw !== undefined && raw !== '';
  const labRef = S.draft.labRefs[id] || null;
  const r = has ? classify(t, raw, S.profile, labRef) : null;
  const wrap = h('section', { class: 'screen detail' }, topbar('Chi tiết chỉ số'));

  wrap.append(h('div', { class: 'det-head' }, groupBadge(t),
    h('div', {}, h('h2', { text: t.name }), h('span', { class: 'muted', text: [t.short, ...(t.aliases || []).filter(a => /[a-z]/i.test(a) && a.toLowerCase() !== t.short.toLowerCase()).slice(0, 2)].join(' · ') }))));

  if (has) {
    const card = h('div', { class: 'card result lv-' + r.level },
      h('div', { class: 'row-between' }, h('span', { class: 'small', text: 'Kết quả của bạn' }), pill(r)),
      h('div', { class: 'big' }, h('b', { class: 'num', text: r.display || displayValue(t, raw) }), ' ', h('span', { text: t.unit })),
      h('div', { class: 'row-between small' }, h('span', { text: 'Khoảng tham chiếu' }), h('strong', { text: refText(t, labRef) })),
      fullLabel(r) ? h('p', { class: 'strong', text: fullLabel(r) }) : null,
      r.basis ? h('p', { class: 'muted small', text: 'Căn cứ phân loại: ' + SOURCE_BASIS[r.basis] + (r.basis === 'special' ? ` (${profileLabel(S.profile)})` : '') + '.' + (r.source && D.sources[r.source] ? ' Nguồn: ' + D.sources[r.source].split(' — ')[0] + '.' : '') }) : null,
      r.note ? h('p', { class: 'tip small', text: r.note }) : null,
      r.reason ? h('p', { class: r.state === 'invalid' ? 'err small' : 'warn-t small', text: r.reason }) : null,
      rangeBar(t, raw, labRef));
    if (r.state === 'critical') card.append(h('p', { class: 'crit-t', text: 'Mức này cần được đánh giá khẩn cấp. Liên hệ ngay bác sĩ/cơ sở y tế; gọi 115 nếu có triệu chứng nặng.' }));
    wrap.append(card);
  } else {
    wrap.append(h('div', { class: 'card' }, h('div', { class: 'row-between small' }, h('span', { text: 'Khoảng tham chiếu phổ biến' }), h('strong', { text: refText(t, null) })),
      t.bands ? h('ul', { class: 'small bands' }, bandsText(t).map(s => h('li', { text: s }))) : null,
      h('button', { class: 'btn ghost sm', onclick: () => { S.draft.values[id] = ''; if (!S.draft.order.includes(id)) S.draft.order.push(id); persist(); go('nhap'); } }, icon('plus'), 'Thêm vào phiếu của tôi')));
  }

  const tabs = [['explain', 'Giải thích'], ['related', 'Liên quan'], ['notes', 'Cần lưu ý']];
  const tabBar = h('div', { class: 'tabs', role: 'tablist' }, tabs.map(([k, l]) =>
    h('button', { role: 'tab', id: 'tab-' + k, 'aria-selected': String(ui.tab === k), 'aria-controls': 'tabpanel', class: 'tab' + (ui.tab === k ? ' on' : ''), onclick: () => { ui.tab = k; render(); } }, l)));
  const panel = h('div', { class: 'card tabpanel', role: 'tabpanel', id: 'tabpanel', 'aria-labelledby': 'tab-' + ui.tab });

  if (ui.tab === 'explain') {
    panel.append(h('h3', { text: `${t.short} là gì?` }), h('p', { text: t.what }));
    const q = t.type === 'qual';
    const sec = (title, o) => (o && o.causes && o.causes.length) ? [h('h3', { text: title }), h('ul', {}, o.causes.map(c => h('li', { text: c }))), o.tip ? h('p', { class: 'tip', text: o.tip }) : null] : null;
    const dir = r && r.dir;
    if (!r || dir === 'high' || !dir) panel.append(...[].concat(sec(q ? 'Dương tính thường gặp khi' : 'Nguyên nhân có thể làm tăng', t.high) || []));
    if (!q && (!r || dir === 'low' || !dir)) panel.append(...[].concat(sec('Nguyên nhân có thể làm giảm', t.low) || []));
  } else if (ui.tab === 'related') {
    const groups = Object.entries(PANEL_MEMBERS).filter(([, ids]) => ids.includes(id));
    if (!groups.length) panel.append(h('p', { class: 'muted', text: 'Chỉ số này thường được đọc riêng.' }));
    const Rall = results();
    const IP = interpret(Rall, BY, S.profile, S.draft.labRefs);
    for (const [pid, ids] of groups) {
      const pn = IP.panels.find(p => p.id === pid);
      const title = pn ? pn.title : ({ anemia: 'Hồng cầu và thiếu máu', inflam: 'Bạch cầu, tiểu cầu và viêm', glucose: 'Đường huyết', lipid: 'Mỡ máu', liver: 'Gan và mật', kidney: 'Thận và điện giải', thyroid: 'Tuyến giáp', urine: 'Nước tiểu', hbv: 'Viêm gan B' })[pid];
      panel.append(h('h3', { text: 'Nhóm ' + title }));
      if (pn && pn.findings.length) pn.findings.forEach(f => panel.append(h('div', { class: 'finding lv-' + f.level },
        h('span', { class: 'fd-g', 'aria-hidden': 'true', text: PILL_GLYPH[f.level] || '•' }), h('div', {}, h('strong', { text: f.title }), h('p', { class: 'small', text: f.detail })))));
      if (pn && pn.derived.length) pn.derived.forEach(d => panel.append(h('p', { class: 'small' }, h('strong', { text: d.label + ': ' }), d.value + (d.unit ? ' ' + d.unit : '') + (d.note ? ' — ' + d.note : ''))));
      const l = h('div', { class: 'list' });
      ids.filter(rid => rid !== id).forEach(rid => {
        const rt = BY[rid]; const v = S.draft.values[rid];
        const rr = v ? classify(rt, v, S.profile, S.draft.labRefs[rid] || null) : null;
        l.append(h('a', { href: '#chitiet/' + rid, class: 'res-row' }, groupBadge(rt),
          h('span', { class: 'res-main' }, h('strong', { text: rt.name }), h('span', { class: 'muted small', text: v ? `${displayValue(rt, v)} ${rt.unit}` : 'Chưa nhập' })),
          rr ? pill(rr, true) : null, icon('chev', 'chev')));
      });
      panel.append(l);
    }
  } else {
    if (t.note) panel.append(h('h3', { text: 'Lưu ý khi đọc' }), h('p', { text: t.note }));
    panel.append(h('h3', { text: 'Giới hạn diễn giải' }), h('ul', {},
      h('li', { text: 'Mỗi phòng xét nghiệm có khoảng tham chiếu riêng; hãy ưu tiên khoảng in trên phiếu.' }),
      h('li', { text: t.special ? `Có ngưỡng riêng cho: ${[t.special.child && 'trẻ em', t.special.pregnant && 'thai phụ'].filter(Boolean).join(', ')}${t.special.pregnant && t.special.pregnant.mode === 'na' ? ' (không áp dụng khi mang thai)' : ''}. Chọn đúng đối tượng ở màn Đọc phiếu.` : 'Ngưỡng trong app dành cho người lớn; với trẻ em và thai phụ cần dùng ngưỡng in trên phiếu.' }),
      h('li', { text: 'Một kết quả lệch nhẹ một lần thường chưa có ý nghĩa; bác sĩ có thể hẹn làm lại.' }),
      t.bands ? h('li', { text: 'Chỉ số này dùng ngưỡng quyết định lâm sàng, khác với khoảng tham chiếu của phòng xét nghiệm.' }) : null));
    const spSrc = t.special ? [...new Set(Object.values(t.special).map(x => x.source).filter(Boolean))] : [];
    panel.append(h('h3', { text: 'Nguồn tham khảo' }), h('p', { class: 'small', text: (D.sources && D.sources[t.source]) || 'Đang cập nhật.' }),
      spSrc.map(k => h('p', { class: 'small', text: D.sources[k] || '' })),
      h('p', { class: 'tag warn', text: `Trạng thái rà soát chuyên môn: ${(D.review && D.review.status) || 'chưa rà soát'}` }));
  }
  wrap.append(tabBar, panel);
  return wrap;
}

function rangeBar(t, raw, labRef) {
  if (t.type !== 'num') return null;
  const p = parseNumber(raw); if (p.state !== 'ok') return null;
  let lo, hi;
  const sp = specialFor(t, S.profile);
  if (labRef && (labRef.lo != null || labRef.hi != null)) { lo = labRef.lo ?? 0; hi = labRef.hi; }
  else if (sp && sp.kind === 'ref') { lo = sp.lo ?? 0; hi = sp.hi; }
  else if (sp && sp.kind === 'bands') {
    const okI = sp.bands.findIndex(b => b.level === 'ok');
    lo = okI > 0 ? sp.bands[okI - 1].lt : 0; hi = sp.bands[okI].lt; if (hi >= 99) hi = null;
  } else if (sp && sp.kind !== 'same') return null;
  else if (t.bands) {
    const ok = t.bands.filter(b => b.level === 'ok'); const i0 = t.bands.indexOf(ok[0]);
    lo = i0 > 0 ? t.bands[i0 - 1].lt : 0; hi = ok[ok.length - 1].lt; if (hi >= 999) hi = null;
  } else { const r = refFor(t, S.profile); if (!r || r.missing) return null; lo = r.lo; hi = r.hi; }
  const H = hi == null ? (lo || 1) * 2 : hi;
  const pad = (H - lo) * 0.6 || 1;
  let min = Math.max(0, lo - pad), max = H + pad;
  min = Math.min(min, p.value); max = Math.max(max, p.value);
  const W = 300, x = v => 8 + ((v - min) / (max - min)) * (W - 16);
  const okL = x(lo), okR = hi == null ? W - 8 : x(hi);
  return svg('svg', { viewBox: `0 0 ${W} 44`, class: 'rbar', role: 'img', 'aria-label': `Vị trí kết quả so với khoảng tham chiếu ${refText(t, labRef)}` },
    svg('rect', { x: 8, y: 14, width: W - 16, height: 8, rx: 4, class: 'rb-track' }),
    svg('rect', { x: okL, y: 14, width: Math.max(2, okR - okL), height: 8, class: 'rb-ok' }),
    svg('text', { x: okL, y: 38, 'text-anchor': 'middle', class: 'rb-t' }, formatNum(lo)),
    hi != null ? svg('text', { x: okR, y: 38, 'text-anchor': 'middle', class: 'rb-t' }, formatNum(hi)) : null,
    svg('path', { d: `M${x(p.value)} 10 l-5 -8 h10 z`, class: 'rb-mk' }),
    svg('rect', { x: x(p.value) - 1.5, y: 10, width: 3, height: 16, class: 'rb-mk' }));
}

// ---------------------------------------------------------------- TRA CỨU
function screenLookup() {
  const wrap = h('section', { class: 'screen' }, topbar('Tra cứu chỉ số', { backTo: '' }));
  const q = h('input', { type: 'search', class: 'inp search', id: 'lk-q', value: ui.query, placeholder: 'Tên, ký hiệu: ALT, men gan, đường huyết…', autocomplete: 'off', 'aria-label': 'Tìm chỉ số' });
  const list = h('div', { class: 'list' });
  const count = h('p', { class: 'small muted', 'aria-live': 'polite' });
  const paint = () => {
    clear(list);
    const hits = searchTests(ui.query).filter(t => ui.lookGroup === 'all' || t.group === ui.lookGroup);
    count.textContent = `${hits.length} chỉ số`;
    if (!hits.length) list.append(h('p', { class: 'empty', text: 'Không tìm thấy. Thử ký hiệu in trên phiếu, ví dụ ALT, TSH, HbA1c.' }));
    hits.forEach(t => list.append(h('a', { href: '#chitiet/' + t.id, class: 'res-row' }, groupBadge(t),
      h('span', { class: 'res-main' }, h('strong', {}, t.short, h('span', { class: 'muted', text: ' · ' + t.name })),
        h('span', { class: 'muted small', text: GROUP_STYLE[t.group].label + (t.unit ? ' · ' + t.unit : '') })), icon('chev', 'chev'))));
  };
  q.addEventListener('input', () => { ui.query = q.value; paint(); });
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Nhóm xét nghiệm' },
    [['all', 'Tất cả'], ...Object.entries(GROUP_STYLE).map(([k, v]) => [k, v.label])].map(([k, l]) =>
      h('button', { class: 'chip' + (ui.lookGroup === k ? ' on' : ''), 'aria-pressed': String(ui.lookGroup === k), onclick: () => { ui.lookGroup = k; render(); } }, l)));
  wrap.append(h('div', { class: 'combo' }, icon('search', 'in-ic'), q), chips, count, list);
  paint();
  return wrap;
}

// ---------------------------------------------------------------- LỊCH SỬ
function screenHistory(arg) {
  if (arg) {
    const snap = S.history.find(x => x.id === arg);
    if (snap) return screenResults('', snap);
  }
  const wrap = h('section', { class: 'screen' }, topbar('Lịch sử xét nghiệm', { backTo: '' }));
  const fmt = iso => { const d = new Date(iso); return [d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }), d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })]; };
  if (!S.history.length) {
    wrap.append(h('div', { class: 'card center-msg' }, icon('clock', 'xl'), h('h2', { text: 'Chưa có lần nào được lưu' }),
      h('p', { text: 'Sau khi phân tích, bấm "Lưu vào lịch sử" để theo dõi và so sánh các lần xét nghiệm.' })));
  } else {
    const l = h('div', { class: 'card list' });
    S.history.forEach(e => {
      const R = results(e.values, e.labRefs, e.profile);
      const n = Object.keys(e.values).length, out = Object.values(R).filter(r => ['out', 'crit'].includes(bucket(r))).length;
      const [d, tm] = fmt(e.at);
      l.append(h('a', { href: '#lichsu/' + e.id, class: 'res-row' }, h('span', { class: 'gbadge g-hist' }, icon('doc')),
        h('span', { class: 'res-main' }, h('strong', {}, d, h('span', { class: 'muted', text: '  ' + tm })),
          h('span', { class: 'muted small', text: `${n} chỉ số` + (out ? ` · ${out} ngoài khoảng tham chiếu` : '') })), icon('chev', 'chev')));
    });
    wrap.append(l, compareBlock());
  }
  wrap.append(
    h('div', { class: 'card list' },
      h('button', { class: 'res-row', disabled: !S.history.length, onclick: () => confirmBox('Xóa toàn bộ dữ liệu đã lưu?', 'Lịch sử, chỉ số đang nhập và lựa chọn giới tính trên trình duyệt này sẽ bị xóa vĩnh viễn.', 'Xóa tất cả', wipeAll) },
        h('span', { class: 'gbadge g-danger' }, icon('trash')), h('span', { class: 'res-main' }, h('strong', { text: 'Xóa dữ liệu đã lưu' }), h('span', { class: 'muted small', text: 'Có hỏi lại trước khi xóa' })), icon('chev', 'chev'))),
    h('div', { class: 'card note' }, icon('shield'), h('p', {}, h('strong', { text: 'Thông tin an toàn. ' }),
      'Lịch sử chỉ lưu trên trình duyệt của thiết bị này, không đồng bộ sang máy khác. Kết quả chỉ mang tính tham khảo; luôn đối chiếu phiếu gốc và ý kiến bác sĩ.')));
  return wrap;
}
function compareBlock() {
  const counts = {};
  S.history.forEach(e => Object.keys(e.values).forEach(id => { if (BY[id] && BY[id].type === 'num') counts[id] = (counts[id] || 0) + 1; }));
  const ids = Object.keys(counts).filter(id => counts[id] >= 2);
  const box = h('div', { class: 'card compare' }, h('h2', { class: 'sec' }, icon('chart'), ' So sánh kết quả'));
  if (!ids.length) { box.append(h('p', { class: 'small muted', text: 'Cần ít nhất 2 lần lưu có cùng một chỉ số để so sánh.' })); return box; }
  if (!ids.includes(ui.compare)) ui.compare = ids[0];
  const sel = h('select', { class: 'inp', 'aria-label': 'Chọn chỉ số để so sánh' }, ids.map(id => h('option', { value: id, selected: id === ui.compare, text: `${BY[id].short} – ${BY[id].name}` })));
  sel.addEventListener('change', () => { ui.compare = sel.value; render(); });
  const t = BY[ui.compare];
  const pts = S.history.filter(e => e.values[t.id] !== undefined).map(e => ({ at: new Date(e.at), raw: e.values[t.id], p: parseNumber(e.values[t.id]), r: classify(t, e.values[t.id], e.profile, e.labRefs[t.id] || null) }))
    .filter(x => x.p.state === 'ok').sort((a, b) => a.at - b.at);
  box.append(sel);
  if (pts.length >= 2) box.append(sparkline(t, pts));
  const tb = h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, h('th', { text: 'Ngày' }), h('th', { text: `Kết quả (${t.unit})` }), h('th', { text: 'Trạng thái' }))),
    h('tbody', {}, [...pts].reverse().map(x => h('tr', {}, h('td', { text: x.at.toLocaleDateString('vi-VN') }), h('td', { class: 'num', text: displayValue(t, x.raw) }), h('td', {}, pill(x.r, true))))));
  box.append(h('div', { class: 'tbl-wrap' }, tb));
  return box;
}
function sparkline(t, pts) {
  const W = 320, Hh = 120, pl = 36, pr = 12, pt = 12, pb = 26;
  const vals = pts.map(p => p.p.value);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const r = refFor(t, S.profile);
  const band = r && !r.missing ? r : null;
  if (band) { lo = Math.min(lo, band.lo); if (band.hi != null) hi = Math.max(hi, band.hi); }
  if (hi === lo) { hi += 1; lo = Math.max(0, lo - 1); }
  const padv = (hi - lo) * 0.12; lo = Math.max(0, lo - padv); hi += padv;
  const x = i => pl + (pts.length === 1 ? 0 : i * (W - pl - pr) / (pts.length - 1));
  const y = v => pt + (1 - (v - lo) / (hi - lo)) * (Hh - pt - pb);
  const g = svg('svg', { viewBox: `0 0 ${W} ${Hh}`, class: 'spark', role: 'img', 'aria-label': `Diễn biến ${t.short} qua ${pts.length} lần` });
  if (band && band.hi != null) g.append(svg('rect', { x: pl, y: y(band.hi), width: W - pl - pr, height: Math.max(1, y(band.lo) - y(band.hi)), class: 'sp-band' }));
  [lo, hi].forEach(v => g.append(svg('text', { x: pl - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'sp-t' }, formatNum(Math.round(v * 10) / 10))));
  g.append(svg('polyline', { points: pts.map((p, i) => `${x(i)},${y(p.p.value)}`).join(' '), class: 'sp-line' }));
  pts.forEach((p, i) => {
    g.append(svg('circle', { cx: x(i), cy: y(p.p.value), r: i === pts.length - 1 ? 4.5 : 3, class: 'sp-dot lv-' + p.r.level }));
    if (i === 0 || i === pts.length - 1) g.append(svg('text', { x: x(i), y: Hh - 8, 'text-anchor': i === 0 ? 'start' : 'end', class: 'sp-t' }, p.at.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' })));
  });
  return g;
}
function wipeAll() {
  const r = store.clearAll();
  if (!r.ok) { toast(r.error, 'warn'); return; }
  S = { v: 2, profile: { sex: '', group: 'adult', ageBand: '', trimester: 0, age: null }, draft: { values: {}, labRefs: {}, order: [], sample: false, fromPhoto: [] }, history: [] };
  ui.savedSig = ''; go(''); toast('Đã xóa toàn bộ dữ liệu trên trình duyệt này.');
}

// ---------------------------------------------------------------- HƯỚNG DẪN & CÀI ĐẶT
function screenGuide() {
  const sec = (ic, title, ...body) => h('div', { class: 'card guide' }, h('h2', { class: 'sec' }, icon(ic), ' ', title), ...body);
  const ul = arr => h('ul', {}, arr.map(x => h('li', { text: x })));
  const legend = h('div', { class: 'legend' },
    [['ok', 'Trong khoảng tham chiếu'], ['warn', 'Lệch nhẹ khỏi khoảng'], ['bad', 'Ngoài khoảng tham chiếu'], ['crit', 'Vượt giá trị báo động — cần khẩn cấp'], ['na', 'Chưa đủ thông tin / không hợp lệ']]
      .map(([l, txt]) => h('div', { class: 'row' }, h('span', { class: 'pill ' + l }, h('span', { class: 'pill-g', text: PILL_GLYPH[l] })), h('span', { text: txt }))));
  return h('section', { class: 'screen' }, topbar('Hướng dẫn sử dụng', { backTo: '' }),
    sec('phone', 'Cài app lên màn hình chính', h('p', { class: 'small', text: 'Sau khi cài, app mở toàn màn hình như ứng dụng thật (không có thanh địa chỉ), có biểu tượng riêng và dùng được khi mất mạng.' }), installSteps()),
    sec('camera', 'Chụp ảnh phiếu để app tự đọc', ul([
      'Đặt phiếu trên mặt phẳng, đủ sáng, không bị bóng tay hay lóa đèn.',
      'Chụp thẳng từ trên xuống, để bảng kết quả chiếm gần hết khung hình.',
      'Phiếu nhiều trang: chọn "Chọn ảnh" và chọn nhiều ảnh cùng lúc.',
      'Sau khi đọc, so từng số với phiếu gốc. Mục có dấu ! cần bạn xác nhận (ví dụ ảnh mờ làm mất dấu thập phân).',
      'App không tự đổi đơn vị. Nếu phiếu ghi mg/dL trong khi app dùng mmol/L, app sẽ báo để bạn kiểm tra.'
    ]), h('p', { class: 'small muted', text: 'Ảnh được xử lý ngay trên máy. Lần đầu dùng cần mạng để tải bộ nhận dạng chữ (khoảng 5 MB) từ cdn.jsdelivr.net.' })),
    sec('doc', 'Nhập tay', ul([
      'Chọn giới tính và đối tượng trước: nhiều chỉ số có ngưỡng khác nhau giữa nam và nữ.',
      'Trẻ em: chọn thêm nhóm tuổi. Thai phụ: chọn giai đoạn thai kỳ. App áp dụng ngưỡng riêng cho Hb, mỡ máu, đường huyết, HbA1c, TSH; các chỉ số khác cần ngưỡng in trên phiếu.',
      'Dùng dấu phẩy hoặc dấu chấm cho phần thập phân (5,4 hoặc 5.4). Không dùng dấu phân cách hàng nghìn.',
      'Có thể nhập "< 0,5" hoặc "> 1000" như phiếu ghi.',
      'Nếu phiếu in khoảng tham chiếu khác app, mở "Ngưỡng trên phiếu" để nhập — app sẽ ưu tiên ngưỡng đó.'
    ])),
    sec('info', 'Cách đọc trạng thái', legend,
      h('p', { class: 'small', text: 'Trạng thái luôn có chữ và ký hiệu đi kèm, không chỉ dựa vào màu.' })),
    sec('shield', 'Quyền riêng tư', ul([
      'Kết quả, lịch sử và lựa chọn giới tính được lưu trên trình duyệt của thiết bị này (localStorage).',
      'App không có máy chủ và không gửi dữ liệu sức khỏe của bạn đi đâu.',
      'Xóa trình duyệt hoặc gỡ app có thể làm mất dữ liệu đã lưu. Xóa thủ công ở mục Lịch sử hoặc Cài đặt.'
    ])),
    sec('book', 'Nguồn tham khảo và rà soát', h('ul', {}, Object.values(D.sources || {}).map(s => h('li', { class: 'small', text: s }))),
      h('p', { class: 'tag warn', text: `Trạng thái: ${(D.review && D.review.status) || 'chưa rà soát'}. ${(D.review && D.review.note) || ''}` }),
      h('p', { class: 'small muted', text: `Phiên bản app ${APP_VERSION} · dữ liệu ${D.version || ''} (${D.updated || ''})` })));
}

function screenSettings() {
  return h('section', { class: 'screen' }, topbar('Cài đặt', { backTo: '' }),
    isStandalone() ? h('div', { class: 'card note' }, icon('check'), h('p', { text: 'Bạn đang dùng app đã cài trên màn hình chính.' })) : installCard({ force: true }),
    profileBlock(),
    h('div', { class: 'card list' },
      h('button', { class: 'res-row', onclick: () => confirmBox('Xóa toàn bộ dữ liệu?', 'Lịch sử, chỉ số đang nhập và lựa chọn giới tính trên trình duyệt này sẽ bị xóa vĩnh viễn.', 'Xóa tất cả', wipeAll) },
        h('span', { class: 'gbadge g-danger' }, icon('trash')), h('span', { class: 'res-main' }, h('strong', { text: 'Xóa toàn bộ dữ liệu' }), h('span', { class: 'muted small', text: 'Có hỏi lại trước khi xóa' })), icon('chev', 'chev')),
      h('button', { class: 'res-row', onclick: checkUpdate },
        h('span', { class: 'gbadge g-bio' }, icon('refresh')), h('span', { class: 'res-main' }, h('strong', { text: 'Kiểm tra bản cập nhật' }), h('span', { class: 'muted small', text: `Đang dùng phiên bản ${APP_VERSION}` })), icon('chev', 'chev'))),
    h('div', { class: 'card note' }, icon('shield'), h('p', { text: 'Dữ liệu được lưu trên trình duyệt hiện tại. App không có máy chủ, không dùng công cụ theo dõi người dùng.' })));
}

// ---------------------------------------------------------------- service worker
let waitingSW = null;
export function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    const offer = sw => { waitingSW = sw; toast('Đã có phiên bản mới của app.', 'info', { label: 'Cập nhật', run: () => sw.postMessage('skipWaiting') }); };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw && nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) offer(nw); });
    });
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }).catch(() => {});
  // Chỉ tải lại khi người dùng bấm "Cập nhật" (lần cài đầu tiên không tải lại).
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloading) { reloading = true; location.reload(); } });
}
function checkUpdate() {
  if (!('serviceWorker' in navigator)) { toast('Trình duyệt không hỗ trợ cập nhật ngoại tuyến.'); return; }
  navigator.serviceWorker.getRegistration().then(reg => {
    if (!reg) { toast('Chưa cài chế độ ngoại tuyến.'); return; }
    if (waitingSW) { waitingSW.postMessage('skipWaiting'); return; }
    reg.update().then(() => { setTimeout(() => { if (!reg.installing && !reg.waiting) toast('Bạn đang dùng bản mới nhất.'); }, 1500); })
      .catch(() => toast('Không kiểm tra được — có thể đang ngoại tuyến.', 'warn'));
  });
}
