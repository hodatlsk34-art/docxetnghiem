import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, bucket, evaluateRules, refFor } from '../../js/classification.js';
import { BY } from './helpers.js';

const F = { sex: 'female', group: 'adult' }, M = { sex: 'male', group: 'adult' }, X = { sex: '', group: 'adult' };

test('ranh giới khoảng tham chiếu: dưới, đúng ngưỡng, trên', () => {
  assert.equal(classify(BY.plt, '149', X).state, 'low');
  assert.equal(classify(BY.plt, '150', X).state, 'normal');
  assert.equal(classify(BY.plt, '450', X).state, 'normal');
  assert.equal(classify(BY.plt, '451', X).state, 'high');
});
test('thiếu giới tính → chưa đủ thông tin (không gộp ngưỡng nam/nữ)', () => {
  const r = classify(BY.hgb, '125', X);
  assert.equal(r.state, 'insufficient');
  assert.equal(classify(BY.hgb, '125', F).state, 'normal');
  assert.equal(classify(BY.hgb, '125', M).state, 'low');
  assert.equal(refFor(BY.hgb, X).missing, 'sex');
});
test('trẻ em/thai phụ không có ngưỡng phiếu → chưa đủ thông tin', () => {
  assert.equal(classify(BY.wbc, '12', { sex: 'female', group: 'child' }).state, 'insufficient');
  assert.equal(classify(BY.wbc, '12', { sex: 'female', group: 'pregnant' }, { lo: 4, hi: 13 }).state, 'normal');
});
test('ngưỡng trên phiếu được ưu tiên', () => {
  assert.equal(classify(BY.ast, '38', X).state, 'normal');
  assert.equal(classify(BY.ast, '38', X, { lo: null, hi: 35 }).state, 'high');
  assert.equal(classify(BY.ast, '38', X, { lo: null, hi: 35 }).basis, 'lab');
});
test('giá trị báo động luôn được kiểm tra', () => {
  assert.equal(classify(BY.k, '6.5', X).state, 'critical');
  assert.equal(classify(BY.k, '6.5', X, { lo: 3.5, hi: 7 }).state, 'critical');
  assert.equal(classify(BY.glu, '2.5', X).level, 'crit');
  assert.equal(classify(BY.hgb, '60', X).state, 'critical'); // báo động không phụ thuộc giới
});
test('ngưỡng quyết định lâm sàng (đường huyết)', () => {
  assert.equal(classify(BY.glu, '5.5', X).basis, 'clinical');
  assert.equal(classify(BY.glu, '5.6', X).level, 'warn');
  assert.equal(classify(BY.glu, '6.99', X).level, 'warn');
  assert.equal(classify(BY.glu, '7.0', X).level, 'bad');
});
test('định tính', () => {
  assert.equal(classify(BY.u_nit, 'neg', X).state, 'qual-neg');
  assert.equal(classify(BY.u_nit, 'trace', X).level, 'warn');
  assert.equal(classify(BY.u_leu, '2+', X).level, 'bad');
  assert.equal(classify(BY.hbsag, 'pos', X).state, 'qual-pos');
  assert.equal(classify(BY.u_nit, '', X).state, 'empty');
});
test('dữ liệu sai không bị đổi thành số khác', () => {
  assert.equal(classify(BY.glu, '5abc', X).state, 'invalid');
  assert.equal(classify(BY.hgb, '10.5', F).state, 'invalid');   // g/dL
  assert.equal(classify(BY.glu, '<5', X).level, 'ok');
});
test('bucket', () => {
  assert.equal(bucket(classify(BY.k, '6.5', X)), 'crit');
  assert.equal(bucket(classify(BY.hgb, '125', X)), 'unclassified');
  assert.equal(bucket(classify(BY.plt, '200', X)), 'in');
  assert.equal(bucket(classify(BY.plt, '100', X)), 'out');
});
test('tổ hợp chỉ xét khi đủ dữ liệu, diễn đạt thận trọng', () => {
  const R = id => v => classify(BY[id], v, F);
  const res = { hgb: R('hgb')('105'), mcv: R('mcv')('72'), ferritin: R('ferritin')('9') };
  const ev = evaluateRules(res);
  assert.ok(ev.matched.some(r => r.id === 'iron-def'));
  assert.ok(ev.skipped.includes('hyperthyroid'));
  const dm = evaluateRules({ glu: R('glu')('7.2'), hba1c: R('hba1c')('6.8') });
  const rule = dm.matched.find(r => r.id === 'diabetes');
  assert.match(rule.title, /cần bác sĩ xác nhận/);
  assert.doesNotMatch(rule.title, /^Phù hợp đái tháo đường$/);
});
test('tổ hợp bỏ qua khi chỉ số chưa đủ thông tin', () => {
  const ev = evaluateRules({ hgb: classify(BY.hgb, '105', X), mcv: classify(BY.mcv, '72', X), ferritin: classify(BY.ferritin, '9', X) });
  assert.ok(ev.skipped.includes('iron-def'));
});

// ---------- trẻ em & thai phụ ----------
const child = (ageBand, sex = 'female') => ({ sex, group: 'child', ageBand });
const preg = trimester => ({ sex: 'female', group: 'pregnant', trimester });

test('Hb trẻ em theo tuổi (WHO 2024)', () => {
  assert.equal(classify(BY.hgb, '104', child('6-23m')).state, 'low');
  assert.equal(classify(BY.hgb, '105', child('6-23m')).state, 'normal');
  assert.equal(classify(BY.hgb, '109', child('2-4y')).state, 'low');
  assert.equal(classify(BY.hgb, '114', child('5-9y')).state, 'low');
  assert.equal(classify(BY.hgb, '115', child('10-11y')).state, 'normal');
  assert.equal(classify(BY.hgb, '119', child('12-14y', 'male')).state, 'low');
  assert.equal(classify(BY.hgb, '125', child('15-17y', 'male')).state, 'low');
  assert.equal(classify(BY.hgb, '125', child('15-17y', 'female')).state, 'normal');
  assert.equal(classify(BY.hgb, '125', child('15-17y', '')).state, 'insufficient');
  assert.equal(classify(BY.hgb, '125', child('')).state, 'insufficient');
  assert.equal(classify(BY.hgb, '125', child('lt6m')).state, 'insufficient');
  assert.equal(classify(BY.hgb, '104', child('6-23m')).basis, 'special');
});
test('Hb thai phụ theo giai đoạn (WHO 2024)', () => {
  assert.equal(classify(BY.hgb, '108', preg(1)).state, 'low');
  assert.equal(classify(BY.hgb, '108', preg(2)).state, 'normal');
  assert.equal(classify(BY.hgb, '104', preg(2)).state, 'low');
  assert.equal(classify(BY.hgb, '109', preg(3)).state, 'low');
  assert.equal(classify(BY.hgb, '108', preg(0)).state, 'insufficient');
  assert.equal(classify(BY.hgb, '60', preg(2)).state, 'critical');
});
test('mỡ máu trẻ em (NHLBI)', () => {
  assert.equal(classify(BY.chol, '4.3', child('5-9y')).level, 'ok');
  assert.equal(classify(BY.chol, '4.5', child('5-9y')).level, 'warn');
  assert.equal(classify(BY.chol, '5.2', child('5-9y')).level, 'bad');
  assert.equal(classify(BY.tg, '0.9', child('5-9y')).level, 'warn');
  assert.equal(classify(BY.tg, '0.9', child('12-14y')).level, 'ok');
  assert.equal(classify(BY.hdl, '1.0', child('12-14y')).dir, 'low');
  assert.equal(classify(BY.chol, '4.3', child('6-23m')).state, 'insufficient');
});
test('thai phụ: đường huyết đói, HbA1c, mỡ máu, TSH', () => {
  assert.equal(classify(BY.glu, '5.0', preg(2)).level, 'ok');
  assert.equal(classify(BY.glu, '5.1', preg(2)).level, 'bad');
  assert.match(classify(BY.glu, '5.3', preg(0)).label, /thai kỳ/);
  assert.equal(classify(BY.hba1c, '5.9', preg(2)).state, 'insufficient');
  assert.equal(classify(BY.chol, '6.5', preg(3)).label, 'Không áp dụng');
  assert.equal(classify(BY.tsh, '4.2', preg(1)).state, 'high');
  assert.equal(classify(BY.tsh, '0.05', preg(1)).state, 'normal');
});
test('trẻ em: đường huyết như người lớn, chỉ số khác cần ngưỡng phiếu', () => {
  assert.equal(classify(BY.glu, '7.2', child('12-14y')).basis, 'clinical');
  assert.equal(classify(BY.wbc, '12', child('5-9y')).state, 'insufficient');
  assert.equal(classify(BY.wbc, '12', child('5-9y'), { lo: 5, hi: 14.5 }).state, 'normal');
  assert.equal(classify(BY.u_nit, 'pos', child('5-9y')).state, 'qual-pos');
});
test('tổ hợp thiếu sắt dùng ngưỡng trẻ em', () => {
  const p = child('5-9y');
  const ev = evaluateRules({ hgb: classify(BY.hgb, '105', p), mcv: classify(BY.mcv, '70', p, { lo: 75, hi: 95 }), ferritin: classify(BY.ferritin, '8', p, { lo: 12, hi: 150 }) });
  assert.ok(ev.matched.some(r => r.id === 'iron-def'));
});
