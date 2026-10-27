import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseLabText, looseUnit, profileHints } from '../../js/ocr.js';
import { DATA } from './helpers.js';

const read = f => fs.readFileSync(new URL('../fixtures/' + f, import.meta.url), 'utf8');
const pick = (r, id) => r.items.find(i => i.id === id);

test('đọc văn bản OCR thật từ ảnh chụp phiếu mẫu (đã xử lý ảnh)', () => {
  const r = parseLabText(read('ocr-phieu-da-xu-ly.txt'), DATA.tests);
  const want = { wbc: '6.8', neu: '4.1', rbc: '4.3', hgb: '105', hct: '34.0', mch: '23.4', plt: '262', glu: '6.1', crea: '70', ast: '38', alt: '52', ggt: '45', ferritin: '9.0',
    u_glu: 'neg', u_pro: 'neg', u_leu: '2+', u_nit: 'neg', u_ph: '6.0', u_sg: '1.015', u_bld: 'neg' };
  for (const [id, v] of Object.entries(want)) {
    const it = pick(r, id);
    assert.ok(it, 'thiếu ' + id);
    assert.equal(it.value, v, id);
    assert.equal(it.selected, true, id);
  }
  // NEU% không bị nhầm thành NEU#
  assert.equal(pick(r, 'neu').value, '4.1');
  assert.deepEqual(pick(r, 'hgb').labRef, { lo: 120, hi: 150 });
});
test('mất dấu thập phân → hỏi lại, không tự sửa', () => {
  const r = parseLabText(read('ocr-phieu-anh-chup.txt'), DATA.tests);
  const mcv = pick(r, 'mcv');
  assert.equal(mcv.selected, false);
  assert.deepEqual(mcv.alternatives, ['72.1', '721']);
  const tg = pick(r, 'tg');
  assert.deepEqual(tg.alternatives, ['2', '20']);
});
test('khác đơn vị → không chọn sẵn, không tự đổi', () => {
  const r = parseLabText(read('ocr-phieu-anh-chup.txt'), DATA.tests);
  const chol = pick(r, 'chol');
  assert.equal(chol.value, '230');
  assert.equal(chol.selected, false);
  assert.match(chol.warnings[0], /mg\/d/i);
});
test('ngưỡng phiếu lệch cỡ (OCR mất dấu chấm) bị bỏ', () => {
  const r = parseLabText('SINH HÓA MÁU\nGlucose 6.1 mmol/L 39-64', DATA.tests);
  assert.equal(pick(r, 'glu').labRef, null);
});
test('glucose máu và glucose niệu tách theo đoạn phiếu', () => {
  const r = parseLabText('SINH HÓA\nGlucose 5.2 mmol/L\nTỔNG PHÂN TÍCH NƯỚC TIỂU\nGLU Âm tính\nPRO 1+', DATA.tests);
  assert.equal(pick(r, 'glu').value, '5.2');
  assert.equal(pick(r, 'u_glu').value, 'neg');
  assert.equal(pick(r, 'u_pro').value, '1+');
});
test('cờ H/L dính số, dấu <', () => {
  const r = parseLabText('ALT (GPT) 52H U/L <40\nCRP < 0.5 mg/L', DATA.tests);
  assert.equal(pick(r, 'alt').value, '52');
  assert.deepEqual(pick(r, 'alt').labRef, { lo: null, hi: 40 });
  assert.equal(pick(r, 'crp').value, '<0.5');
});
test('đơn vị bị OCR đọc sai vẫn khớp', () => {
  assert.equal(looseUnit('GIL'), 'g/l');
  assert.equal(looseUnit('UL'), 'u/l');
});
test('gợi ý giới tính, năm sinh', () => {
  assert.deepEqual(profileHints('Họ tên: A  Năm sinh: 2015  Giới: Nam'), { sex: 'male', birthYear: 2015 });
});
test('văn bản rác không làm hỏng', () => {
  const r = parseLabText('<script>alert(1)</script>\n\n%%%%\n12345', DATA.tests);
  assert.equal(r.items.length, 0);
});

import { parseRefText, labNameFromText } from '../../js/ocr.js';
test('đọc các kiểu ghi ngưỡng', () => {
  assert.deepEqual(parseRefText('4,0 den 10,0'), { lo: 4, hi: 10 });
  assert.deepEqual(parseRefText('<= 40'), { lo: null, hi: 40 });
  assert.deepEqual(parseRefText('nam: 130-170; nu: 120-150'), { bySex: { male: { lo: 130, hi: 170 }, female: { lo: 120, hi: 150 } } });
  assert.deepEqual(parseRefText('mmol/l 3.9 - 6.4'), { lo: 3.9, hi: 6.4 });
  assert.equal(parseRefText('am tinh'), null);
});
test('nhận tên nơi xét nghiệm', () => {
  assert.equal(labNameFromText('SỞ Y TẾ\nBỆNH VIỆN ĐA KHOA MINH AN   ĐT 028\nKhoa Xét nghiệm'), 'BỆNH VIỆN ĐA KHOA MINH AN');
  assert.equal(labNameFromText('Họ tên: A\nHGB 120'), '');
});
test('ngưỡng nam/nữ trên phiếu chọn theo giới tính ghi trên phiếu', () => {
  const r = parseLabText('Giới tính: Nữ\nHGB 125 g/L Nam: 130 - 170; Nữ: 120 - 150', DATA.tests);
  assert.deepEqual(r.items[0].labRef, { lo: 120, hi: 150 });
  assert.ok(r.items[0].refBySex);
});
