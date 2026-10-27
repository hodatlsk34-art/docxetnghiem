import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, sanitize, KEY, OLD_KEY } from '../../js/storage.js';
import { DATA, MemStorage } from './helpers.js';

test('localStorage rỗng', () => {
  const r = createStore(new MemStorage(), DATA.tests).load();
  assert.equal(r.fresh, true);
  assert.deepEqual(r.state.draft.values, {});
});
test('JSON hỏng → bắt đầu lại, có thông báo', () => {
  const r = createStore(new MemStorage({ [KEY]: '{not json' }), DATA.tests).load();
  assert.ok(r.notice);
  assert.deepEqual(r.state.history, []);
});
test('chuyển dữ liệu bản 1 sang bản 2', () => {
  const ls = new MemStorage({ [OLD_KEY]: JSON.stringify({ sex: 'female', v: { hgb: '105', xxx: '1', u_nit: 'neg' }, sample: true }) });
  const r = createStore(ls, DATA.tests).load();
  assert.equal(r.migrated, true);
  assert.equal(r.state.profile.sex, 'female');
  assert.deepEqual(r.state.draft.values, { hgb: '105', u_nit: 'neg' });
  assert.equal(ls.getItem(OLD_KEY), null);
  assert.ok(ls.getItem(KEY));
});
test('làm sạch: bỏ khóa lạ, kiểu sai, giá trị định tính lạ', () => {
  const s = sanitize({
    profile: { sex: '<script>', group: 'alien' },
    draft: { values: { hgb: 105, glu: '5.4', u_nit: '<img src=x onerror=alert(1)>', __proto__x: '1', ast: 'x'.repeat(50) }, labRefs: { glu: { lo: 'a', hi: 6 }, ast: { lo: null, hi: 40 }, alt: { lo: 50, hi: 40 } } },
    history: [{ id: '"><svg onload=alert(1)>', at: '2026-01-01', values: { glu: '5' } }, { id: 'abc-1', at: 'not a date', values: { glu: '5' } }, { id: 'ok-1', at: '2026-01-02T00:00:00Z', values: { glu: '5' } }]
  }, DATA.tests);
  assert.deepEqual(s.profile, { sex: '', group: 'adult', ageBand: '', trimester: 0, age: null });
  assert.deepEqual(s.draft.values, { glu: '5.4' });
  assert.deepEqual(s.draft.labRefs, { ast: { lo: null, hi: 40 } });
  assert.deepEqual(s.history.map(h => h.id), ['ok-1']);
});
test('cấu trúc sai kiểu ở gốc', () => {
  for (const bad of [null, 42, 'x', [], { draft: [] }]) assert.deepEqual(sanitize(bad, DATA.tests).draft.values, {});
});
test('hết dung lượng → báo lỗi rõ', () => {
  const st = createStore(new MemStorage({}, { quota: 10 }), DATA.tests);
  const r = st.save({ big: 'x'.repeat(100) });
  assert.equal(r.ok, false);
  assert.match(r.error, /đầy/);
});
test('trình duyệt chặn localStorage', () => {
  const r = createStore(new MemStorage({}, { throwOnGet: true }), DATA.tests).load();
  assert.deepEqual(r.state.draft.values, {});
});
test('xóa dữ liệu', () => {
  const ls = new MemStorage({ [KEY]: '{}', [OLD_KEY]: '{}' });
  createStore(ls, DATA.tests).clearAll();
  assert.equal(ls.getItem(KEY), null);
  assert.equal(ls.getItem(OLD_KEY), null);
});
test('lưu đối tượng trẻ em / thai phụ', () => {
  const s = sanitize({ profile: { sex: 'male', group: 'pregnant', trimester: 2, ageBand: '5-9y' } }, DATA.tests);
  assert.deepEqual(s.profile, { sex: 'female', group: 'pregnant', ageBand: '', trimester: 2, age: null });
  const c = sanitize({ profile: { sex: 'male', group: 'child', ageBand: 'xx', trimester: 5 } }, DATA.tests);
  assert.deepEqual(c.profile, { sex: 'male', group: 'child', ageBand: '', trimester: 0, age: null });
});

import { upsertLab, resolveLabRef, emptyState as emptyS } from '../../js/storage.js';
test('bộ ngưỡng theo nơi xét nghiệm: lưu, cập nhật, chọn theo giới', () => {
  const st = emptyS();
  const a = upsertLab(st, 'Bệnh viện Minh An', { glu: { lo: 3.9, hi: 6.4 }, hgb: { lo: null, hi: null, male: { lo: 130, hi: 170 }, female: { lo: 120, hi: 150 } } });
  const b = upsertLab(st, 'BỆNH VIỆN  MINH AN', { glu: { lo: 4.1, hi: 6.1 } });
  assert.equal(a, b);
  assert.equal(st.labs.length, 1);
  assert.deepEqual(a.refs.glu, { lo: 4.1, hi: 6.1 });
  assert.deepEqual(resolveLabRef(a.refs.hgb, 'female'), { lo: 120, hi: 150 });
  assert.equal(resolveLabRef(a.refs.hgb, ''), null);
  const clean = sanitize({ ...st, labs: [...st.labs, { id: '<x>', name: 'bad', refs: {} }, { id: 'ok-2', name: '  ', refs: {} }], draft: { values: { glu: '5' }, labRefs: { glu: { lo: 4.1, hi: 6.1 } }, refOrigin: { glu: 'saved' }, labId: a.id } }, DATA.tests);
  assert.equal(clean.labs.length, 1);
  assert.equal(clean.draft.labId, a.id);
  assert.equal(clean.draft.refOrigin.glu, 'saved');
  assert.deepEqual(clean.labs[0].refs.hgb.male, { lo: 130, hi: 170 });
});
