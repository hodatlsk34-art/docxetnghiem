import test from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../../js/classification.js';
import { interpret } from '../../js/interpret.js';
import { overallSummary, anemiaSeverity, crossLinks } from '../../js/summary.js';
import { BY } from './helpers.js';

function run(values, profile = { sex: 'male', group: 'adult' }) {
  const R = {};
  for (const [id, v] of Object.entries(values)) R[id] = classify(BY[id], v, profile, null);
  return overallSummary(R, interpret(R, BY, profile), profile, 56);
}

test('phân mức thiếu máu WHO', () => {
  assert.equal(anemiaSeverity(125, { sex: 'male' }), 'nhẹ');
  assert.equal(anemiaSeverity(115, { sex: 'female' }), 'nhẹ');
  assert.equal(anemiaSeverity(95, { sex: 'female' }), 'vừa');
  assert.equal(anemiaSeverity(75, { sex: 'female' }), 'nặng');
  assert.equal(anemiaSeverity(122, { sex: 'female' }), null);
  assert.equal(anemiaSeverity(100, { group: 'pregnant', trimester: 2 }), 'nhẹ');
  assert.equal(anemiaSeverity(100, { group: 'pregnant', trimester: 1 }), 'nhẹ');
  assert.equal(anemiaSeverity(99, { group: 'pregnant', trimester: 1 }), 'vừa');
  assert.equal(anemiaSeverity(112, { group: 'child', ageBand: '5-9y' }), 'nhẹ');
  assert.equal(anemiaSeverity(112, { sex: '' }), null);
});
test('ca chuyển hóa: đủ 3/3 tiêu chí xét nghiệm, gan nhiễm mỡ, tim mạch', () => {
  const os = run({ glu: '6.4', hba1c: '6.1', tg: '2.8', hdl: '0.85', ldl: '4.3', chol: '6.5', alt: '68', ast: '45', ggt: '80', uric: '520' });
  assert.equal(os.urgency.level, 'bad');
  assert.ok(os.links.some(l => /3\/3 tiêu chí/.test(l.title)));
  assert.ok(os.links.some(l => /Men gan tăng cùng rối loạn/.test(l.title)));
  assert.ok(os.lifestyle.some(t => /150–300 phút/.test(t)));
  assert.ok(os.specialties.length >= 1);
  assert.ok(os.ask.some(q => /LDL/.test(q)));
});
test('ca thiếu máu do viêm', () => {
  const os = run({ hgb: '102', mcv: '86', crp: '45', ferritin: '220', wbc: '11.5' }, { sex: 'female', group: 'adult' });
  assert.ok(os.links.some(l => /Thiếu máu kèm tình trạng viêm/.test(l.title)));
  const qa = os.assess.anemia.find(x => /thiếu máu/.test(x.q));
  assert.match(qa.a, /mức vừa/);
});
test('ca nguy hiểm: kali rất cao → khẩn', () => {
  const os = run({ k: '6.8', crea: '250', egfr: '22' });
  assert.equal(os.urgency.level, 'crit');
  assert.equal(os.problems[0].level, 'crit');
});
test('ca bình thường: chưa thấy bất thường, có điều đáng yên tâm, không khuyên chuyên khoa', () => {
  const os = run({ hgb: '145', mcv: '90', wbc: '6', plt: '250', glu: '5.0', chol: '4.5', ldl: '2.5', hdl: '1.4', tg: '1.0', alt: '20', ast: '22', crea: '80', egfr: '95', tsh: '2' });
  assert.equal(os.urgency.level, 'ok');
  assert.equal(os.problems.length, 0);
  assert.equal(os.specialties.length, 0);
  assert.ok(os.reassure.length >= 6);
});
test('ca thiếu nước', () => {
  const links = crossLinks({ hct: classify(BY.hct, '53', { sex: 'male' }), na: classify(BY.na, '149', {}), u_sg: classify(BY.u_sg, '1.035', {}) }, { sex: 'male' });
  assert.ok(links.some(l => /thiếu nước/.test(l.title)));
});
test('thai phụ: không tính hội chứng chuyển hóa, có nhận định đường huyết thai kỳ', () => {
  const os = run({ glu: '5.3', tg: '2.5', hdl: '1.1', hgb: '100' }, { sex: 'female', group: 'pregnant', trimester: 2 });
  assert.ok(!os.links.some(l => /chuyển hóa/.test(l.title)));
  assert.match(os.assess.glucose[0].a, /bác sĩ sản khoa/);
  assert.ok(os.links.some(l => /mang thai/.test(l.title)));
});
