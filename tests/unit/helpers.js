import fs from 'node:fs';
export const DATA = JSON.parse(fs.readFileSync(new URL('../../data/tests.json', import.meta.url)));
export const BY = Object.fromEntries(DATA.tests.map(t => [t.id, t]));
export class MemStorage {
  constructor(init = {}, { quota = Infinity, throwOnGet = false } = {}) { this.m = new Map(Object.entries(init)); this.quota = quota; this.throwOnGet = throwOnGet; }
  getItem(k) { if (this.throwOnGet) throw new Error('SecurityError'); return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { if (String(v).length > this.quota) { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; } this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
