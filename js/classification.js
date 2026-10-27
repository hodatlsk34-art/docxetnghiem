// Logic phân loại, tách khỏi giao diện. Không tự thay đổi ngưỡng y khoa: mọi ngưỡng lấy từ data/tests.json.
import { parseNumber, parseQual, unitGuard, plausibleMax, formatNum, QUAL_LABEL } from './validation.js';

// Trạng thái → mức hiển thị
//  empty          chưa nhập
//  invalid        dữ liệu không hợp lệ (sai định dạng, sai đơn vị)
//  insufficient   chưa đủ thông tin để phân loại (thiếu giới tính, đối tượng không phải người lớn...)
//  normal / low / high / band / qual-neg / qual-pos
//  critical       vượt giá trị báo động — cần đánh giá khẩn cấp
export const LEVELS = ['none', 'na', 'ok', 'info', 'warn', 'bad', 'crit'];

export const PROFILE_GROUPS = {
  adult: 'Người lớn',
  child: 'Trẻ em (dưới 18 tuổi)',
  pregnant: 'Đang mang thai'
};

/** Khoảng tham chiếu áp dụng. Không gộp ngưỡng nam/nữ khi thiếu giới tính. */
export function refFor(t, profile) {
  if (!t.ref) return null;
  if (t.ref.all) return { lo: t.ref.all[0], hi: t.ref.all[1], sexSpecific: false };
  const sex = profile && profile.sex;
  if (sex === 'male' || sex === 'female') return { lo: t.ref[sex][0], hi: t.ref[sex][1], sexSpecific: true, sex };
  return { missing: 'sex' };
}

function trivialLow(t) {
  return /không có ý nghĩa|không đáng kể/i.test((t.low && t.low.causes && t.low.causes[0]) || '');
}

function bandIndex(t, v) {
  const i = t.bands.findIndex(b => v < b.lt);
  return i < 0 ? t.bands.length - 1 : i;
}

/**
 * Phân loại một chỉ số.
 * @param t        định nghĩa xét nghiệm (từ tests.json)
 * @param raw      chuỗi người dùng nhập (số) hoặc mã định tính
 * @param profile  {sex:''|'male'|'female', group:'adult'|'child'|'pregnant'}
 * @param labRef   {lo:number|null, hi:number|null} ngưỡng in trên phiếu (nếu có)
 */
export function classify(t, raw, profile = {}, labRef = null) {
  if (t.type === 'qual') {
    const p = parseQual(raw);
    if (p.state === 'empty') return { state: 'empty', level: 'none', label: 'Chưa nhập' };
    if (p.state === 'invalid') return { state: 'invalid', level: 'na', label: 'Không hợp lệ', reason: p.error };
    if (p.value === 'neg') return { state: 'qual-neg', level: 'ok', label: 'Âm tính', dir: null, display: QUAL_LABEL.neg };
    if (p.value === 'trace') return { state: 'qual-pos', level: 'warn', label: 'Vết', dir: 'high', display: QUAL_LABEL.trace };
    return { state: 'qual-pos', level: 'bad', label: QUAL_LABEL[p.value], dir: 'high', display: QUAL_LABEL[p.value] };
  }

  const n = parseNumber(raw);
  if (n.state === 'empty') return { state: 'empty', level: 'none', label: 'Chưa nhập' };
  if (n.state === 'invalid') return { state: 'invalid', level: 'na', label: 'Không hợp lệ', reason: n.error };

  const guard = unitGuard(t.id, n.value);
  if (guard) return { state: 'invalid', level: 'na', label: 'Kiểm tra đơn vị', reason: guard, value: n.value };
  if (n.value > plausibleMax(t)) return { state: 'invalid', level: 'na', label: 'Kiểm tra lại', reason: 'Giá trị lớn bất thường — có thể thừa chữ số hoặc sai đơn vị.', value: n.value };

  // So sánh trên giá trị gốc; "<x" nghĩa là nhỏ hơn x, ">x" là lớn hơn x.
  const eps = 1e-9;
  const v = n.qualifier === '<' ? n.value - eps : n.qualifier === '>' ? n.value + eps : n.value;
  const base = { value: n.value, display: (n.qualifier ? n.qualifier + ' ' : '') + formatNum(n.value) };

  // 1. Giá trị báo động — luôn kiểm tra trước.
  const c = t.critical || {};
  if (c.low != null && v < c.low) return { ...base, state: 'critical', level: 'crit', label: 'Cần đánh giá khẩn cấp', dir: 'low', basis: 'critical' };
  if (c.high != null && v > c.high) return { ...base, state: 'critical', level: 'crit', label: 'Cần đánh giá khẩn cấp', dir: 'high', basis: 'critical' };

  // 2. Ngưỡng trên phiếu — ưu tiên khi có.
  if (labRef && (labRef.lo != null || labRef.hi != null)) {
    return { ...base, ...rangeClass(t, v, labRef.lo ?? null, labRef.hi ?? null), basis: 'lab' };
  }

  // 3. Đối tượng ngoài phạm vi ngưỡng của app.
  if (profile.group && profile.group !== 'adult') {
    return { ...base, state: 'insufficient', level: 'na', label: 'Chưa đủ thông tin',
      reason: `Ngưỡng của app dành cho người lớn không mang thai. Với đối tượng "${PROFILE_GROUPS[profile.group] || profile.group}", hãy nhập ngưỡng in trên phiếu.` };
  }

  // 4. Ngưỡng quyết định lâm sàng (đường huyết, mỡ máu, eGFR...)
  if (t.bands) {
    const i = bandIndex(t, v), b = t.bands[i];
    const okIdx = t.bands.findIndex(x => x.level === 'ok');
    const dir = b.level === 'ok' ? null : (i < okIdx ? 'low' : 'high');
    const state = b.level === 'ok' ? 'normal' : 'band';
    return { ...base, state, level: b.level, label: b.label, dir, basis: 'clinical' };
  }

  // 5. Khoảng tham chiếu phổ biến của app
  const r = refFor(t, profile);
  if (!r) return { ...base, state: 'insufficient', level: 'na', label: 'Chưa đủ thông tin', reason: 'Chưa có khoảng tham chiếu.' };
  if (r.missing === 'sex') {
    return { ...base, state: 'insufficient', level: 'na', label: 'Chưa đủ thông tin',
      reason: 'Khoảng tham chiếu của chỉ số này khác nhau giữa nam và nữ. Hãy chọn giới tính hoặc nhập ngưỡng trên phiếu.' };
  }
  return { ...base, ...rangeClass(t, v, r.lo, r.hi), basis: 'app' };
}

function rangeClass(t, v, lo, hi) {
  // Mức "nhẹ" chỉ để trình bày (lệch ≤ 10% khoảng), không thay đổi ngưỡng.
  const span = lo != null && hi != null ? hi - lo : (hi ?? lo ?? 0);
  if (lo != null && v < lo) {
    if (trivialLow(t)) return { state: 'low', level: 'ok', label: 'Thấp (thường không đáng lo)', dir: null };
    const m = Math.min(span * 0.1, Math.abs(lo) * 0.1);
    return v >= lo - m ? { state: 'low', level: 'warn', label: 'Thấp nhẹ', dir: 'low' } : { state: 'low', level: 'bad', label: 'Thấp', dir: 'low' };
  }
  if (hi != null && v > hi) {
    const m = Math.min(span * 0.1, Math.abs(hi) * 0.1);
    return v <= hi + m ? { state: 'high', level: 'warn', label: 'Cao nhẹ', dir: 'high' } : { state: 'high', level: 'bad', label: 'Cao', dir: 'high' };
  }
  return { state: 'normal', level: 'ok', label: 'Trong khoảng tham chiếu', dir: null };
}

/** Nhóm trạng thái dùng cho bộ lọc và thẻ tổng quan. */
export function bucket(res) {
  if (!res || res.state === 'empty') return 'empty';
  if (res.level === 'crit') return 'crit';
  if (res.level === 'na') return 'unclassified';
  if (res.level === 'ok' || res.level === 'info') return 'in';
  return 'out';
}

// ---------------- Tổ hợp chỉ số ----------------
// Mỗi quy tắc: điều kiện, chỉ số cần có, diễn đạt thận trọng, nguồn, trạng thái rà soát.
const isLow = r => r && r.dir === 'low' && ['warn', 'bad', 'crit'].includes(r.level);
const isHigh = r => r && r.dir === 'high' && ['warn', 'bad', 'crit'].includes(r.level);
const isOk = r => r && (r.level === 'ok');
const isPos = r => r && r.state === 'qual-pos';
const valid = r => r && !['empty', 'invalid', 'insufficient'].includes(r.state);

export const RULES = [
  { id: 'iron-def', needs: ['hgb', 'mcv', 'ferritin'],
    when: R => isLow(R.hgb) && isLow(R.mcv) && R.ferritin.value < 30,
    title: 'Gợi ý thiếu máu do thiếu sắt — cần bác sĩ đánh giá',
    why: 'HGB thấp + MCV thấp + Ferritin dưới 30 ng/mL',
    next: 'Bác sĩ sẽ tìm nguyên nhân mất sắt (kinh nguyệt nhiều, đường tiêu hóa, giun móc) và quyết định cách bổ sung.',
    source: 'lab-adult' },
  { id: 'thal', needs: ['mcv', 'ferritin'],
    when: R => isLow(R.mcv) && R.ferritin.value >= 30,
    title: 'Hồng cầu nhỏ nhưng sắt dự trữ không thấp — có thể cần tầm soát thalassemia',
    why: 'MCV thấp + Ferritin từ 30 ng/mL trở lên',
    next: 'Hỏi bác sĩ về xét nghiệm điện di huyết sắc tố.',
    source: 'lab-adult' },
  { id: 'macro', needs: ['hgb', 'mcv'],
    when: R => isLow(R.hgb) && isHigh(R.mcv),
    title: 'Thiếu máu kèm hồng cầu to — cần bác sĩ đánh giá',
    why: 'HGB thấp + MCV cao',
    next: 'Bác sĩ có thể chỉ định xét nghiệm vitamin B12, folate.',
    source: 'lab-adult' },
  { id: 'viral', needs: ['plt', 'wbc'],
    when: R => isLow(R.plt) && isLow(R.wbc),
    title: 'Tiểu cầu và bạch cầu cùng thấp — cần được khám, nhất là khi đang sốt',
    why: 'Tiểu cầu thấp + bạch cầu thấp',
    next: 'Thường gặp khi nhiễm virus, trong đó có sốt xuất huyết. Đến cơ sở y tế để được theo dõi; hỏi nhân viên y tế trước khi dùng bất kỳ thuốc hạ sốt nào.',
    source: 'lab-adult' },
  { id: 'bacterial', needs: ['crp'], anyOf: ['wbc', 'neu'],
    when: R => (isHigh(R.wbc) || isHigh(R.neu)) && isHigh(R.crp),
    title: 'Dấu hiệu phản ứng viêm — cần khám để tìm nguyên nhân',
    why: 'Bạch cầu hoặc trung tính cao + CRP cao',
    next: 'Thường gặp trong nhiễm khuẩn. Bác sĩ sẽ khám để tìm ổ nhiễm và quyết định điều trị.',
    source: 'crp' },
  { id: 'liver', needs: ['ggt'], anyOf: ['alt', 'ast'],
    when: R => (isHigh(R.alt) || isHigh(R.ast)) && isHigh(R.ggt),
    title: 'Men gan tăng — cần bác sĩ đánh giá chức năng gan',
    why: 'ALT/AST cao + GGT cao',
    next: 'Hay gặp ở gan nhiễm mỡ hoặc do rượu bia. Có thể cần HBsAg, Anti-HCV, siêu âm gan.',
    source: 'lab-adult' },
  { id: 'cholestasis', needs: ['bil_d', 'ggt'],
    when: R => isHigh(R.bil_d) && isHigh(R.ggt),
    title: 'Bilirubin trực tiếp và GGT cùng tăng — cần kiểm tra đường mật',
    why: 'Bilirubin trực tiếp cao + GGT cao',
    next: 'Bác sĩ có thể chỉ định siêu âm gan mật.',
    source: 'lab-adult' },
  { id: 'hyperthyroid', needs: ['tsh', 'ft4'],
    when: R => isLow(R.tsh) && isHigh(R.ft4),
    title: 'Kết quả tuyến giáp theo hướng cường giáp — cần bác sĩ nội tiết xác nhận',
    why: 'TSH thấp + FT4 cao',
    next: 'Khám chuyên khoa nội tiết.',
    source: 'lab-adult' },
  { id: 'hypothyroid', needs: ['tsh', 'ft4'],
    when: R => isHigh(R.tsh) && isLow(R.ft4),
    title: 'Kết quả tuyến giáp theo hướng suy giáp — cần bác sĩ nội tiết xác nhận',
    why: 'TSH cao + FT4 thấp',
    next: 'Khám chuyên khoa nội tiết.',
    source: 'lab-adult' },
  { id: 'subclinical', needs: ['tsh', 'ft4'],
    when: R => isHigh(R.tsh) && isOk(R.ft4),
    title: 'TSH cao, FT4 trong khoảng — bác sĩ thường hẹn làm lại',
    why: 'TSH cao + FT4 trong khoảng tham chiếu',
    next: 'Thường được kiểm tra lại sau 6–12 tuần. Người đang mang thai cần khám sớm.',
    source: 'lab-adult' },
  { id: 'diabetes', needs: ['glu', 'hba1c'],
    when: R => R.glu.value >= 7.0 && R.hba1c.value >= 6.5 && R.glu.basis === 'clinical' && R.hba1c.basis === 'clinical',
    title: 'Đường huyết đói và HbA1c cùng đạt ngưỡng chẩn đoán của ADA — cần bác sĩ xác nhận',
    why: 'Glucose đói ≥ 7,0 mmol/L + HbA1c ≥ 6,5%',
    next: 'Chỉ bác sĩ mới kết luận được. Mang phiếu đến khám nội tiết.',
    source: 'ada' },
  { id: 'uti', needs: ['u_nit', 'u_leu'],
    when: R => isPos(R.u_nit) && isPos(R.u_leu),
    title: 'Nitrit và bạch cầu niệu cùng dương tính — gợi ý nhiễm trùng tiết niệu',
    why: 'Nitrit + bạch cầu niệu dương tính',
    next: 'Cần khám để bác sĩ quyết định điều trị; có thể cần cấy nước tiểu.',
    source: 'lab-adult' },
  { id: 'kidney', needs: ['egfr', 'u_pro'],
    when: R => R.egfr.value < 60 && isPos(R.u_pro),
    title: 'eGFR giảm kèm đạm niệu — cần khám thận',
    why: 'eGFR dưới 60 + protein niệu dương tính',
    next: 'Bác sĩ cần kiểm tra lại sau 3 tháng để xác định có bệnh thận mạn hay không.',
    source: 'kdigo' }
];

/** Chạy các quy tắc chỉ khi đủ dữ liệu hợp lệ. Trả về {matched, evaluated, skipped}. */
export function evaluateRules(results) {
  const matched = [], evaluated = [], skipped = [];
  for (const rule of RULES) {
    const needOk = rule.needs.every(id => valid(results[id]));
    const anyOk = !rule.anyOf || rule.anyOf.some(id => valid(results[id]));
    if (!needOk || !anyOk) { skipped.push(rule.id); continue; }
    evaluated.push(rule.id);
    let hit = false;
    try { hit = !!rule.when(results); } catch { hit = false; }
    if (hit) matched.push(rule);
  }
  return { matched, evaluated, skipped };
}

/** Chỉ số liên quan (cùng xuất hiện trong một quy tắc). */
export function relatedTests(id) {
  const s = new Set();
  for (const r of RULES) {
    const all = [...r.needs, ...(r.anyOf || [])];
    if (all.includes(id)) all.forEach(x => x !== id && s.add(x));
  }
  return [...s];
}
