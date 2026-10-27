// Đọc/ghi dữ liệu trên trình duyệt (localStorage) có kiểm tra schema và phiên bản.
// Dữ liệu chỉ nằm trên trình duyệt hiện tại; app không gửi lên máy chủ nào.
import { QUAL_VALUES, MAX_LEN } from './validation.js';

export const KEY = 'dpxn-v2';
export const OLD_KEY = 'dpxn-v1';
export const SCHEMA = 2;
export const MAX_HISTORY = 60;

export function emptyState() {
  return {
    v: SCHEMA,
    profile: { sex: '', group: 'adult', ageBand: '', trimester: 0, age: null },
    draft: { values: {}, labRefs: {}, order: [], sample: false, fromPhoto: [] },
    history: []
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
  const d = isObj(input.draft) ? input.draft : {};
  out.draft.values = cleanValues(d.values);
  out.draft.labRefs = cleanRefs(d.labRefs);
  out.draft.sample = d.sample === true;
  const order = Array.isArray(d.order) ? d.order.filter(id => byId.has(id)) : [];
  out.draft.order = [...new Set([...order, ...Object.keys(out.draft.values)])];
  out.draft.fromPhoto = Array.isArray(d.fromPhoto) ? d.fromPhoto.filter(id => byId.has(id)) : [];

  if (Array.isArray(input.history)) {
    for (const h of input.history.slice(0, MAX_HISTORY)) {
      if (!isObj(h) || typeof h.id !== 'string' || !/^[a-z0-9-]{1,40}$/i.test(h.id)) continue;
      const at = typeof h.at === 'string' ? new Date(h.at) : null;
      if (!at || isNaN(at)) continue;
      const values = cleanValues(h.values);
      if (!Object.keys(values).length) continue;
      out.history.push({ id: h.id, at: at.toISOString(), profile: cleanProfile(h.profile), values, labRefs: cleanRefs(h.labRefs) });
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
