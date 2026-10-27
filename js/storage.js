// Đọc/ghi dữ liệu trên trình duyệt (localStorage) có kiểm tra schema và phiên bản.
// Dữ liệu chỉ nằm trên trình duyệt hiện tại; app không gửi lên máy chủ nào.
import { QUAL_VALUES, MAX_LEN } from './validation.js';

export const KEY = 'dpxn-v2';
export const OLD_KEY = 'dpxn-v1';
export const SCHEMA = 2;
export const MAX_HISTORY = 60;
export const MAX_LABS = 20;

export function emptyState() {
  return {
    v: SCHEMA,
    profile: { sex: '', group: 'adult', ageBand: '', trimester: 0, age: null },
    draft: { values: {}, labRefs: {}, refOrigin: {}, labId: '', order: [], sample: false, fromPhoto: [] },
    history: [],
    labs: []
  };
}

const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const okNum = x => x === null || (typeof x === 'number' && Number.isFinite(x));

const AGE_IDS = ['lt6m', '6-23m', '2-4y', '5-9y', '10-11y', '12-14y', '15-17y'];
export function cleanProfile(p) {
  const out = { sex: '', group: 'adult', ageBand: '', trimester: 0, age: null };
  if (!isObj(p)) return out;
  if (['male', 'female', ''].includes(p.sex)) out.sex = p.sex;
  if (['adult', 'child', 'pregnant'].includes(p.group)) out.group = p.group;
  if (out.group === 'child' && AGE_IDS.includes(p.ageBand)) out.ageBand = p.ageBand;
  if (out.group === 'pregnant' && [1, 2, 3].includes(Number(p.trimester))) out.trimester = Number(p.trimester);
  if (out.group === 'pregnant') out.sex = 'female';
  if (out.group === 'adult' && Number.isInteger(p.age) && p.age >= 18 && p.age <= 120) out.age = p.age;
  return out;
}

/** Làm sạch toàn bộ trạng thái: chỉ giữ khóa hợp lệ, đúng kiểu. */
export function sanitize(input, tests) {
  const byId = new Map(tests.map(t => [t.id, t]));
  const out = emptyState();
  if (!isObj(input)) return out;

  out.profile = cleanProfile(input.profile);
  const cleanValues = (vals) => {
    const res = {};
    if (!isObj(vals)) return res;
    for (const [id, val] of Object.entries(vals)) {
      const t = byId.get(id);
      if (!t || typeof val !== 'string' || val.length > MAX_LEN) continue;
      if (t.type === 'qual' && val !== '' && !QUAL_VALUES.includes(val)) continue;
      res[id] = val;
    }
    return res;
  };
  const cleanRefs = (refs) => {
    const res = {};
    if (!isObj(refs)) return res;
    for (const [id, r] of Object.entries(refs)) {
      if (!byId.has(id) || !isObj(r) || !okNum(r.lo ?? null) || !okNum(r.hi ?? null)) continue;
      const lo = r.lo ?? null, hi = r.hi ?? null;
      if (lo === null && hi === null) continue;
      if (lo !== null && hi !== null && lo >= hi) continue;
      res[id] = { lo, hi };
    }
    return res;
  };
  const one = r => {
    if (!isObj(r) || !okNum(r.lo ?? null) || !okNum(r.hi ?? null)) return null;
    const lo = r.lo ?? null, hi = r.hi ?? null;
    if ((lo === null && hi === null) || (lo !== null && hi !== null && lo >= hi)) return null;
    return { lo, hi };
  };
  // Bộ ngưỡng của nơi xét nghiệm: {lo,hi} và/hoặc ngưỡng riêng nam/nữ
  const cleanLabRefs = (refs) => {
    const res = {};
    if (!isObj(refs)) return res;
    for (const [id, r] of Object.entries(refs)) {
      if (!byId.has(id) || !isObj(r)) continue;
      const base = one(r), male = one(r.male), female = one(r.female);
      if (!base && !(male && female)) continue;
      res[id] = { ...(base || { lo: null, hi: null }), ...(male && female ? { male, female } : {}) };
    }
    return res;
  };
  if (Array.isArray(input.labs)) {
    for (const l of input.labs.slice(0, MAX_LABS)) {
      if (!isObj(l) || typeof l.id !== 'string' || !/^[a-z0-9-]{1,40}$/i.test(l.id) || typeof l.name !== 'string') continue;
      const name = l.name.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 80);
      if (!name) continue;
      const at = typeof l.updatedAt === 'string' && !isNaN(new Date(l.updatedAt)) ? new Date(l.updatedAt).toISOString() : new Date(0).toISOString();
      out.labs.push({ id: l.id, name, refs: cleanLabRefs(l.refs), updatedAt: at });
    }
  }
  const d = isObj(input.draft) ? input.draft : {};
  out.draft.values = cleanValues(d.values);
  out.draft.labRefs = cleanRefs(d.labRefs);
  out.draft.sample = d.sample === true;
  const order = Array.isArray(d.order) ? d.order.filter(id => byId.has(id)) : [];
  out.draft.order = [...new Set([...order, ...Object.keys(out.draft.values)])];
  out.draft.fromPhoto = Array.isArray(d.fromPhoto) ? d.fromPhoto.filter(id => byId.has(id)) : [];
  out.draft.labId = typeof d.labId === 'string' && out.labs.some(l => l.id === d.labId) ? d.labId : '';
  out.draft.refOrigin = {};
  if (isObj(d.refOrigin)) for (const [id, o] of Object.entries(d.refOrigin)) if (out.draft.labRefs[id] && ['slip', 'saved', 'manual'].includes(o)) out.draft.refOrigin[id] = o;
  for (const id of Object.keys(out.draft.labRefs)) if (!out.draft.refOrigin[id]) out.draft.refOrigin[id] = 'manual';

  if (Array.isArray(input.history)) {
    for (const h of input.history.slice(0, MAX_HISTORY)) {
      if (!isObj(h) || typeof h.id !== 'string' || !/^[a-z0-9-]{1,40}$/i.test(h.id)) continue;
      const at = typeof h.at === 'string' ? new Date(h.at) : null;
      if (!at || isNaN(at)) continue;
      const values = cleanValues(h.values);
      if (!Object.keys(values).length) continue;
      const labName = typeof h.labName === 'string' ? h.labName.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 80) : '';
      out.history.push({ id: h.id, at: at.toISOString(), profile: cleanProfile(h.profile), values, labRefs: cleanRefs(h.labRefs), labName });
    }
  }
  return out;
}

/** Chuyển dữ liệu bản 1 ({sex, v, sample}) sang bản 2. */
export function migrateV1(old) {
  if (!isObj(old)) return null;
  const s = emptyState();
  s.profile.sex = ['male', 'female'].includes(old.sex) ? old.sex : '';
  s.draft.values = isObj(old.v) ? old.v : {};
  s.draft.sample = old.sample === true;
  return s;
}

export function createStore(ls, tests) {
  const safeGet = (k) => { try { return ls ? ls.getItem(k) : null; } catch { return null; } };
  const safeParse = (s) => { try { return s ? JSON.parse(s) : null; } catch { return undefined; } };

  return {
    /** @returns {{state:object, notice:string|null}} */
    load() {
      const raw = safeGet(KEY);
      const parsed = safeParse(raw);
      if (parsed === undefined) {
        return { state: emptyState(), notice: 'Dữ liệu đã lưu bị hỏng nên không đọc được. App đã bắt đầu lại với dữ liệu trống.' };
      }
      if (parsed) {
        const st = sanitize(parsed, tests);
        return { state: st, notice: null };
      }
      const old = safeParse(safeGet(OLD_KEY));
      if (old) {
        const st = sanitize(migrateV1(old), tests);
        this.save(st);
        try { ls.removeItem(OLD_KEY); } catch { /* bỏ qua */ }
        return { state: st, notice: null, migrated: true };
      }
      return { state: emptyState(), notice: null, fresh: true };
    },
    /** @returns {{ok:true}|{ok:false, error:string}} */
    save(state) {
      try {
        ls.setItem(KEY, JSON.stringify(state));
        return { ok: true };
      } catch (e) {
        const quota = e && (e.name === 'QuotaExceededError' || e.code === 22);
        return { ok: false, error: quota ? 'Bộ nhớ trình duyệt đã đầy. Hãy xóa bớt lịch sử.' : 'Trình duyệt không cho lưu dữ liệu (có thể đang ở chế độ ẩn danh).' };
      }
    },
    clearAll() {
      try { ls.removeItem(KEY); ls.removeItem(OLD_KEY); return { ok: true }; }
      catch { return { ok: false, error: 'Không xóa được dữ liệu trên trình duyệt.' }; }
    }
  };
}

export function newId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

// ---------------- bộ ngưỡng theo nơi xét nghiệm ----------------
export const labKey = name => String(name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim();

/** Chọn ngưỡng áp dụng theo giới tính từ một mục trong bộ ngưỡng đã lưu. */
export function resolveLabRef(r, sex) {
  if (!r) return null;
  if (r.male && r.female) return (sex === 'male' || sex === 'female') ? { ...r[sex] } : null;
  return (r.lo != null || r.hi != null) ? { lo: r.lo, hi: r.hi } : null;
}

/** Thêm/cập nhật bộ ngưỡng của một nơi xét nghiệm. @returns lab */
export function upsertLab(state, name, refs) {
  const key = labKey(name);
  let lab = state.labs.find(l => labKey(l.name) === key);
  if (!lab) {
    lab = { id: newId(), name: String(name).trim().slice(0, 80), refs: {}, updatedAt: new Date().toISOString() };
    state.labs.unshift(lab);
    state.labs = state.labs.slice(0, MAX_LABS);
  }
  Object.assign(lab.refs, refs);
  lab.updatedAt = new Date().toISOString();
  return lab;
}
