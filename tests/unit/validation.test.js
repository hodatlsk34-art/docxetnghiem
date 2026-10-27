import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNumber, parseQual, parseLabRef, unitGuard, plausibleMax } from '../../js/validation.js';
import { BY } from './helpers.js';

test('rỗng và khoảng trắng → chưa nhập', () => {
  for (const v of ['', '   ', null, undefined]) assert.equal(parseNumber(v).state, 'empty');
});
test('dấu phẩy và dấu chấm thập phân', () => {
  assert.deepEqual([parseNumber('5,4').value, parseNumber('5.4').value, parseNumber(' 5.4 ').value], [5.4, 5.4, 5.4]);
  assert.equal(parseNumber('120').value, 120);
  assert.equal(parseNumber('+7').value, 7);
});
test('không làm tròn giá trị gốc', () => {
  assert.equal(parseNumber('5.5999').value, 5.5999);
});
test('từ chối ký tự thừa, NaN, Infinity, số mũ, số âm', () => {
  for (const v of ['5abc', 'abc', 'NaN', 'Infinity', '-Infinity', '1e3', '2E-1', '-5', '- 3', '5..4', '5,4,3', '.', ',5x', '1.000.000'])
    assert.equal(parseNumber(v).state, 'invalid', v);
  assert.match(parseNumber('-5').error, /âm/);
  assert.match(parseNumber('1e3').error, /mũ/);
});
test('chuỗi quá dài bị từ chối', () => {
  assert.equal(parseNumber('1'.repeat(21)).state, 'invalid');
});
test('tiền tố < > như trên phiếu', () => {
  assert.deepEqual([parseNumber('<0,5').qualifier, parseNumber('<0,5').value], ['<', 0.5]);
  assert.equal(parseNumber('≥ 90').qualifier, '>');
});
test('giá trị định tính', () => {
  for (const v of ['neg', 'trace', '1+', '2+', '3+', 'pos']) assert.equal(parseQual(v).state, 'ok');
  assert.equal(parseQual('').state, 'empty');
  assert.equal(parseQual('<img>').state, 'invalid');
});
test('ngưỡng trên phiếu', () => {
  assert.deepEqual(parseLabRef('120', '150'), { state: 'ok', lo: 120, hi: 150 });
  assert.deepEqual(parseLabRef('', '40'), { state: 'ok', lo: null, hi: 40 });
  assert.equal(parseLabRef('150', '120').state, 'invalid');
  assert.equal(parseLabRef('a', '').state, 'invalid');
  assert.equal(parseLabRef('', '').state, 'empty');
});
test('chặn nhầm đơn vị', () => {
  assert.ok(unitGuard('hgb', 10.5));        // g/dL
  assert.equal(unitGuard('hgb', 105), null);
  assert.ok(unitGuard('glu', 110));         // mg/dL
  assert.ok(unitGuard('neu', 60));          // NEU%
  assert.equal(unitGuard('ast', 99999), null);
});
test('trần hợp lý', () => {
  assert.ok(plausibleMax(BY.glu) > 30);
  assert.equal(plausibleMax(BY.bhcg), Infinity);
});
