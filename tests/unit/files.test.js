import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { itemsToLines, parseCsv, rowsToText, fileKind } from '../../js/files.js';
import { parseLabText, configureTests, startsWithTestKey } from '../../js/ocr.js';
import { DATA } from './helpers.js';
configureTests(DATA.tests);

test('nhận loại file', () => {
  assert.equal(fileKind({ name: 'kq.PDF', type: '' }), 'pdf');
  assert.equal(fileKind({ name: 'a.jpg', type: 'image/jpeg' }), 'image');
  assert.equal(fileKind({ name: 'a.xlsx', type: '' }), 'sheet');
  assert.equal(fileKind({ name: 'a.csv', type: '' }), 'csv');
  assert.equal(fileKind({ name: 'a.docx', type: '' }), '');
});
test('CSV dấu chấm phẩy, số thập phân dấu phẩy', () => {
  const rows = parseCsv('Tên;Kết quả;Đơn vị\nGlucose;5,4;mmol/L\n"HGB ""máu""";128;g/L\n');
  assert.deepEqual(rows[1], ['Glucose', '5,4', 'mmol/L']);
  assert.equal(rows[2][0], 'HGB "máu"');
  const r = parseLabText(rowsToText(parseCsv(fs.readFileSync(new URL('../fixtures/phieu-mau.csv', import.meta.url), 'utf8'))), DATA.tests);
  assert.deepEqual(Object.fromEntries(r.items.map(i => [i.id, i.value])), { hgb: '128', glu: '5,4', alt: '35', tsh: '5,8', ft4: '14,2' });
});
test('ghép chữ PDF thành dòng, tách phiếu hai cột', () => {
  const it = (str, x, y) => ({ str, x, y, w: str.length * 5, h: 10 });
  const lines = itemsToLines([
    it('Glucose', 40, 700), it('7.4', 200, 700), it('mmol/L', 260, 700), it('3.9 - 6.4', 330, 700),
    it('Ure', 450, 701), it('6.2', 600, 701), it('mmol/L', 650, 701),
    it('HbA1c', 40, 680), it('7.1', 200, 680), it('%', 260, 680)
  ], 842, startsWithTestKey);
  assert.deepEqual(lines.map(l => l.replace(/\s+/g, ' ')), ['Glucose 7.4 mmol/L 3.9 - 6.4', 'Ure 6.2 mmol/L', 'HbA1c 7.1 %']);
});
test('tên xét nghiệm xuống dòng, giá trị ở dòng sau', () => {
  const r = parseLabText('HCT (Thể tích khối hồng\nLDL-C 4.1 mmol/L < 3.4\n42.7 % 40 - 50\ncầu)', DATA.tests);
  const m = Object.fromEntries(r.items.map(i => [i.id, i.value]));
  assert.equal(m.hct, '42.7'); assert.equal(m.ldl, '4.1');
});
test('bỏ NEU% (tỷ lệ), lấy NEU# (số lượng); bỏ dòng tiêu đề', () => {
  const r = parseLabText('Tên xét nghiệm Kết quả Đơn vị\nNEU% (Tỷ lệ bạch cầu trung tính) 82.0 % 45 - 75\nNEU# (Số lượng bạch cầu trung tính) 9.68 G/L 2.0 - 7.5', DATA.tests);
  assert.deepEqual(r.items.map(i => [i.id, i.value]), [['neu', '9.68']]);
});
