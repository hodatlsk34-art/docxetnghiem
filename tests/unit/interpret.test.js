import test from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../../js/classification.js';
import { interpret } from '../../js/interpret.js';
import { BY } from './helpers.js';

function run(values, profile = { sex: 'female', group: 'adult' }, labRefs = {}) {
  const R = {};
  for (const [id, v] of Object.entries(values)) R[id] = classify(BY[id], v, profile, labRefs[id] || null);
  return interpret(R, BY, profile, labRefs);
}
const P = (ip, id) => ip.panels.find(p => p.id === id);
const titles = p => p.findings.map(f => f.title).join(' | ');
const calc = (p, label) => p.derived.find(d => d.label.startsWith(label));

test('ca 1: thiếu máu thiếu sắt (Hb thấp, MCV thấp, Ferritin thấp)', () => {
  const ip = run({ hgb: '98', rbc: '4.2', hct: '31', mcv: '73.8', mch: '23.3', mchc: '316', rdw: '17', ferritin: '6' });
  const p = P(ip, 'anemia');
  assert.equal(ip.checks.length, 0);
  assert.match(titles(p), /thiếu máu kiểu hồng cầu nhỏ/);
  assert.match(titles(p), /Gợi ý thiếu sắt/);
  assert.equal(p.level, 'bad');
});
test('ca 2: hồng cầu nhỏ, Ferritin bình thường → nghi thalassemia; Mentzer < 13', () => {
  const ip = run({ hgb: '118', rbc: '6.1', hct: '38', mcv: '62.3', ferritin: '85' });
  const p = P(ip, 'anemia');
  assert.match(titles(p), /thalassemia/);
  assert.ok(Number(calc(p, 'Chỉ số Mentzer').value.replace(',', '.')) < 13);
});
test('ca 3: số liệu hồng cầu không khớp (ảnh đọc 721 thay vì 72.1)', () => {
  const ip = run({ hgb: '105', rbc: '4.3', hct: '31', mcv: '721' });
  assert.ok(ip.checks.some(c => /MCV/.test(c.text)));
  assert.match(P(ip, 'anemia').summary, /không khớp/);
});
test('ca 4: tổng bạch cầu thành phần lớn hơn tổng (nhập NEU% vào NEU#)', () => {
  const ip = run({ wbc: '6.8', neu: '30', lym: '2.0' });
  assert.ok(ip.checks.some(c => /tỷ lệ %/.test(c.text)));
});
test('ca 5: giảm ba dòng → khẩn', () => {
  const ip = run({ hgb: '80', wbc: '2.5', plt: '60' });
  assert.equal(P(ip, 'inflam').level, 'crit');
});
test('ca 6: men gan tăng do rượu (AST/ALT > 2, GGT cao)', () => {
  const ip = run({ ast: '180', alt: '70', ggt: '250' });
  const p = P(ip, 'liver');
  assert.match(titles(p), /AST tăng nhiều hơn ALT/);
  assert.equal(calc(p, 'Tỷ lệ AST/ALT').value, '2,57');
  assert.ok(p.suggest.includes('HBsAg'));
});
test('ca 7: men gan tăng rất cao (> 15 lần) → khẩn', () => {
  const ip = run({ alt: '900', ast: '700' });
  assert.equal(P(ip, 'liver').level, 'crit');
});
test('ca 8: viêm gan B kèm men gan tăng', () => {
  const ip = run({ hbsag: 'pos', alt: '120' });
  assert.match(titles(P(ip, 'liver')), /Viêm gan B kèm men gan tăng/);
});
test('ca 9: eGFR tính theo CKD-EPI 2021', () => {
  // Nữ 60 tuổi, creatinin 1.0 mg/dL (88.4 µmol/L) → ≈ 64 theo bảng tính NKF
  const ip = run({ crea: '88.4' }, { sex: 'female', group: 'adult', age: 60 });
  const v = Number(calc(P(ip, 'kidney'), 'eGFR').value);
  assert.ok(v >= 62 && v <= 66, String(v));
  // Nam 50 tuổi, 1.2 mg/dL → ≈ 72
  const ip2 = run({ crea: String(1.2 * 88.4) }, { sex: 'male', group: 'adult', age: 50 });
  const v2 = Number(calc(P(ip2, 'kidney'), 'eGFR').value);
  assert.ok(v2 >= 70 && v2 <= 74, String(v2));
});
test('ca 10: urê/creatinin > 100 khi urê cao → gợi ý trước thận', () => {
  const ip = run({ ure: '15', crea: '110' }, { sex: 'male', group: 'adult' });
  assert.match(titles(P(ip, 'kidney')), /Urê tăng nhiều hơn creatinin/);
});
test('ca 11: canxi thấp do albumin thấp', () => {
  const ip = run({ ca: '2.0', alb: '28' });
  const p = P(ip, 'kidney');
  assert.equal(calc(p, 'Canxi hiệu chỉnh').value, '2,24');
  assert.match(titles(p), /Canxi thấp do albumin thấp/);
});
test('ca 12: mỡ máu — non-HDL, Friedewald, kiểm tra vô lý', () => {
  const ip = run({ chol: '6.2', hdl: '1.0', tg: '2.4' });
  const p = P(ip, 'lipid');
  assert.equal(calc(p, 'Non-HDL').value, '5,2');
  assert.equal(calc(p, 'LDL tính').value, '4,11');
  assert.match(titles(p), /Triglycerid cao kèm HDL thấp/);
  const bad = run({ chol: '4.0', hdl: '4.5' });
  assert.ok(bad.checks.length);
});
test('ca 13: đường huyết và HbA1c lệch nhau', () => {
  const ip = run({ glu: '7.3', hba1c: '6.0' });
  assert.match(titles(P(ip, 'glucose')), /chưa thống nhất/);
  const ip2 = run({ glu: '7.3', hba1c: '6.9' });
  assert.match(titles(P(ip2, 'glucose')), /cùng đạt ngưỡng/);
  assert.ok(calc(P(ip2, 'glucose'), 'Đường huyết trung bình'));
});
test('ca 14: ceton + đường huyết rất cao → khẩn', () => {
  const ip = run({ glu: '18', u_ket: '2+' });
  assert.equal(P(ip, 'glucose').level, 'crit');
});
test('ca 15: tuyến giáp — cường giáp do T3, suy giáp dưới lâm sàng', () => {
  assert.match(titles(P(run({ tsh: '0.05', ft4: '18', ft3: '9' }), 'thyroid')), /do T3/);
  assert.match(titles(P(run({ tsh: '7', ft4: '15' }), 'thyroid')), /dưới lâm sàng/);
});
test('ca 16: nước tiểu — bạch cầu dương, nitrit âm', () => {
  assert.match(titles(P(run({ u_leu: '2+', u_nit: 'neg' }), 'urine')), /nitrit âm tính/);
});
test('ca 17: viêm gan B chưa có miễn dịch', () => {
  assert.match(titles(P(run({ hbsag: 'neg', antihbs: '3' }), 'hbv')), /chưa có miễn dịch/);
});
test('ca 18: mọi chỉ số bình thường → không có cảnh báo, không suy diễn', () => {
  const ip = run({ hgb: '135', rbc: '4.6', hct: '41', mcv: '89', mch: '29.3', mchc: '329', wbc: '6', plt: '250', glu: '5', alt: '20', ast: '22' });
  assert.equal(ip.checks.length, 0);
  assert.ok(ip.panels.every(p => p.level === 'ok'), ip.panels.map(p => p.id + ':' + p.level).join(','));
});
test('ca 19: thai phụ không tính eGFR/non-HDL, không chẩn đoán ĐTĐ theo HbA1c', () => {
  const ip = run({ chol: '7', hdl: '1.5', hba1c: '6.8', glu: '5.3' }, { sex: 'female', group: 'pregnant', trimester: 2 });
  assert.equal(P(ip, 'lipid') ? P(ip, 'lipid').derived.length : 0, 0);
  assert.doesNotMatch(titles(P(ip, 'glucose')), /HbA1c đạt ngưỡng/);
});
