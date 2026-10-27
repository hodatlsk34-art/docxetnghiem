// Đọc liên kết các chỉ số theo nhóm cơ quan.
// Nguyên tắc:
// - Chỉ dùng kết quả phân loại từ classification.js (không đặt ngưỡng mới ngoài các công thức/tỷ lệ có nguồn ghi bên dưới).
// - Diễn đạt "gợi ý", "cần bác sĩ đánh giá"; không chẩn đoán, không khuyên dùng/ngừng thuốc.
// - Kiểm tra số liệu không khớp nhau (thường do nhập sai hoặc ảnh đọc sai) trước khi diễn giải.
import { formatNum } from './validation.js';

export const FORMULA_SOURCES = {
  mentzer: 'Chỉ số Mentzer = MCV (fL) ÷ RBC (T/L); < 13 nghiêng về thalassemia thể ẩn, > 13 nghiêng về thiếu sắt (chỉ để sàng lọc).',
  ckdepi: 'CKD-EPI 2021 (National Kidney Foundation): eGFR = 142 × min(Scr/κ,1)^α × max(Scr/κ,1)^−1,200 × 0,9938^tuổi × 1,012 (nữ).',
  ureacrea: 'Tỷ lệ urê/creatinin (đơn vị SI) = urê (mmol/L) ÷ creatinin (µmol/L) × 1000; 40–100 bình thường, > 100 gợi ý trước thận (khi urê > 10 mmol/L).',
  cacorr: 'Canxi hiệu chỉnh (mmol/L) = canxi toàn phần + 0,02 × (40 − albumin g/L).',
  deritis: 'Tỷ lệ De Ritis = AST ÷ ALT; > 2 khi men gan tăng gợi ý tổn thương do rượu.',
  nonhdl: 'Non-HDL = Cholesterol toàn phần − HDL; mục tiêu cao hơn mục tiêu LDL 0,8 mmol/L (NCEP ATP III).',
  friedewald: 'LDL tính (Friedewald) = Cholesterol − HDL − Triglycerid ÷ 2,2 (mmol/L); chỉ dùng khi Triglycerid < 4,5 mmol/L.',
  eag: 'Đường huyết trung bình ước tính (ADAG) = 1,59 × HbA1c − 2,59 (mmol/L).',
  acg: 'Mức tăng men gan theo ACG 2017: < 5 lần ngưỡng trên là nhẹ, 5–15 lần là vừa, > 15 lần là nặng.'
};

const RANK = { none: 0, info: 1, ok: 1, na: 1, warn: 2, bad: 3, crit: 4 };
const worst = arr => arr.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'ok');

/**
 * @param results  {id: kết quả classify()}
 * @param tests    định nghĩa xét nghiệm (BY id)
 * @param profile  hồ sơ (sex, group, ageBand, trimester, age)
 */
export function interpret(results, BY, profile = {}, labRefs = {}) {
  const R = id => results[id];
  const has = id => { const r = R(id); return !!r && !['empty', 'invalid'].includes(r.state); };
  const num = id => (has(id) && Number.isFinite(R(id).value) ? R(id).value : null);
  const low = id => { const r = R(id); return !!r && r.dir === 'low' && ['warn', 'bad', 'crit'].includes(r.level); };
  const high = id => { const r = R(id); return !!r && r.dir === 'high' && ['warn', 'bad', 'crit'].includes(r.level); };
  const ok = id => { const r = R(id); return !!r && r.level === 'ok'; };
  const pos = id => { const r = R(id); return !!r && r.state === 'qual-pos'; };
  const neg = id => { const r = R(id); return !!r && r.state === 'qual-neg'; };
  const ulnOf = id => { // ngưỡng trên đang áp dụng (phiếu hoặc app)
    if (labRefs[id] && labRefs[id].hi != null) return labRefs[id].hi;
    const t = BY[id]; if (!t || !t.ref) return null;
    const r = t.ref.all || (profile.sex ? t.ref[profile.sex] : null);
    return r ? r[1] : null;
  };
  const adult = !profile.group || profile.group === 'adult';
  const panels = [];

  function panel(id, title, icon, ids) {
    const p = { id, title, icon, ids: ids.filter(has), findings: [], derived: [], checks: [], suggest: [] };
    p.add = (level, title, detail, source) => p.findings.push({ level, title, detail, source });
    p.calc = (label, value, unit, note, source) => p.derived.push({ label, value, unit, note, source });
    p.check = text => p.checks.push({ level: 'warn', text });
    p.need = (...names) => names.forEach(n => { if (!p.suggest.includes(n)) p.suggest.push(n); });
    return p;
  }
  const finish = p => {
    if (!p.ids.length) return;
    const lv = [...p.ids.map(id => R(id).level === 'na' ? 'ok' : R(id).level), ...p.findings.map(f => f.level), ...(p.checks.length ? ['warn'] : [])];
    p.level = worst(lv);
    const outIds = p.ids.filter(id => ['warn', 'bad', 'crit'].includes(R(id).level));
    p.summary = p.checks.length ? 'Có số liệu không khớp nhau — kiểm tra lại trước khi đọc.'
      : p.findings.length ? p.findings[0].title
      : outIds.length ? `${outIds.length}/${p.ids.length} chỉ số ngoài khoảng, chưa thấy mẫu hình liên kết rõ.`
      : `${p.ids.length} chỉ số đều trong khoảng tham chiếu.`;
    delete p.add; delete p.calc; delete p.check; delete p.need;
    panels.push(p);
  };

  // ---------------------------------------------------------------- 1. Hồng cầu & thiếu máu
  {
    const p = panel('anemia', 'Hồng cầu và thiếu máu', 'drop', ['hgb', 'rbc', 'hct', 'mcv', 'mch', 'mchc', 'rdw', 'ferritin', 'iron', 'b12']);
    const hb = num('hgb'), rbc = num('rbc'), hct = num('hct'), mcv = num('mcv'), mch = num('mch'), mchc = num('mchc'), fer = num('ferritin');
    // Kiểm tra tính khớp (MCV = HCT×10/RBC; MCH = Hb/RBC; MCHC = Hb/HCT×100)
    const off = (a, b) => Math.abs(a - b) / b > 0.08;
    if (hct && rbc && mcv && off(hct * 10 / rbc, mcv)) p.check(`MCV (${formatNum(mcv)}) không khớp với HCT ÷ RBC (≈ ${formatNum(Math.round(hct * 10 / rbc * 10) / 10)} fL). Có thể nhập/đọc sai một trong ba số.`);
    if (hb && rbc && mch && off(hb / rbc, mch)) p.check(`MCH (${formatNum(mch)}) không khớp với HGB ÷ RBC (≈ ${formatNum(Math.round(hb / rbc * 10) / 10)} pg).`);
    if (hb && hct && mchc && off(hb / hct * 100, mchc)) p.check(`MCHC (${formatNum(mchc)}) không khớp với HGB ÷ HCT (≈ ${formatNum(Math.round(hb / hct * 100))} g/L).`);
    if (hb && hct && !mchc && (hb / hct * 100 < 250 || hb / hct * 100 > 400)) p.check(`HGB và HCT không khớp nhau (HGB thường ≈ 3 lần HCT tính theo g/dL). Kiểm tra lại đơn vị.`);

    const anemia = low('hgb');
    const micro = low('mcv'), macro = high('mcv');
    let mentzer = null;
    if (mcv && rbc && (micro || (mcv && mcv < 80))) {
      mentzer = mcv / rbc;
      p.calc('Chỉ số Mentzer', formatNum(Math.round(mentzer * 10) / 10), '', mentzer < 13 ? 'Dưới 13: nghiêng về thalassemia thể ẩn' : 'Trên 13: nghiêng về thiếu sắt', 'mentzer');
    }
    if (anemia) {
      const type = micro ? 'hồng cầu nhỏ' : macro ? 'hồng cầu to' : (mcv ? 'hồng cầu bình thường' : '');
      p.add(R('hgb').level === 'crit' ? 'crit' : 'bad', `Có thiếu máu${type ? ' kiểu ' + type : ''}`,
        mcv ? `HGB thấp, MCV ${formatNum(mcv)} fL. Kích thước hồng cầu giúp bác sĩ khoanh vùng nguyên nhân.` : 'HGB thấp. Cần thêm MCV để biết loại thiếu máu.', null);
      if (!mcv) p.need('MCV, MCH (có trong công thức máu)');
    }
    if (micro || (mcv && mcv < 80)) {
      if (fer !== null && fer < 30) p.add('bad', 'Gợi ý thiếu sắt', `MCV thấp kèm Ferritin ${formatNum(fer)} ng/mL (dưới 30) — sắt dự trữ cạn. Bác sĩ sẽ tìm nguyên nhân mất sắt.`, null);
      else if (fer !== null && fer >= 30 && high('crp')) p.add('warn', 'Hồng cầu nhỏ, Ferritin chưa đánh giá chắc được', 'CRP đang cao nên Ferritin có thể tăng do viêm, không loại trừ được thiếu sắt.', null);
      else if (fer !== null && fer >= 30) p.add('warn', 'Hồng cầu nhỏ nhưng sắt dự trữ không thấp — có thể cần tầm soát thalassemia', 'Thalassemia thể ẩn khá phổ biến ở Việt Nam. Bác sĩ có thể chỉ định điện di huyết sắc tố.', null);
      else {
        if (mentzer !== null) p.add('warn', mentzer < 13 ? 'Hồng cầu nhỏ, chỉ số Mentzer nghiêng về thalassemia thể ẩn' : 'Hồng cầu nhỏ, chỉ số Mentzer nghiêng về thiếu sắt',
          'Đây chỉ là chỉ số sàng lọc. Cần Ferritin để phân biệt chắc hơn.', 'mentzer');
        p.need('Ferritin');
      }
      if (high('rdw') && !(fer !== null && fer < 30)) p.add('info', 'RDW cao', 'Hồng cầu không đều kích thước — hay gặp trong thiếu sắt hơn là thalassemia.', null);
    }
    if (macro || (mcv && mcv > 100)) {
      if (low('b12')) p.add('bad', 'Hồng cầu to kèm vitamin B12 thấp', 'Thiếu B12 là nguyên nhân thường gặp của hồng cầu to. Bác sĩ sẽ đánh giá và hướng dẫn bổ sung.', null);
      else if (high('ggt')) p.add('warn', 'Hồng cầu to kèm GGT cao', 'Hai chỉ số này hay cùng tăng ở người uống rượu bia thường xuyên hoặc có bệnh gan.', null);
      else p.need('Vitamin B12', 'Folate');
    }
    if (anemia && !micro && !macro && mcv && num('egfr') !== null && num('egfr') < 60) p.add('warn', 'Thiếu máu kèm giảm chức năng thận', 'Bệnh thận mạn có thể gây thiếu máu kiểu hồng cầu bình thường.', null);
    if (!anemia && fer !== null && fer < 30 && profile.group !== 'child') p.add('warn', 'Sắt dự trữ thấp dù chưa thiếu máu', 'Ferritin dưới 30 ng/mL: thiếu sắt giai đoạn sớm. Có thể gây mệt, rụng tóc.', null);
    if (fer !== null && high('ferritin') && high('crp')) p.add('info', 'Ferritin cao kèm CRP cao', 'Ferritin là chất tăng khi viêm, nên lúc này không phản ánh đúng lượng sắt dự trữ.', null);
    if (high('hgb') && high('hct')) p.add('warn', 'Hồng cầu đặc (HGB và HCT cùng cao)', 'Hay do mất nước hoặc hút thuốc; nếu kéo dài cần khám huyết học.', null);
    finish(p);
  }

  // ---------------------------------------------------------------- 2. Bạch cầu, tiểu cầu, viêm
  {
    const p = panel('inflam', 'Bạch cầu, tiểu cầu và viêm', 'pulse', ['wbc', 'neu', 'lym', 'eos', 'plt', 'crp']);
    const wbc = num('wbc'), neu = num('neu'), lym = num('lym'), eos = num('eos');
    const sum = [neu, lym, eos].filter(x => x !== null).reduce((a, b) => a + b, 0);
    if (wbc && sum > wbc * 1.05) p.check(`Tổng các loại bạch cầu (${formatNum(Math.round(sum * 100) / 100)}) lớn hơn tổng số bạch cầu (${formatNum(wbc)}). Có thể đã nhập tỷ lệ % thay cho số lượng.`);
    if (low('hgb') && low('wbc') && low('plt')) p.add('crit', 'Giảm cả ba dòng tế bào máu', 'Hồng cầu, bạch cầu và tiểu cầu cùng thấp — cần khám chuyên khoa huyết học sớm.', null);
    else if (low('plt') && low('wbc')) p.add('bad', 'Bạch cầu và tiểu cầu cùng thấp', 'Thường gặp khi nhiễm virus, trong đó có sốt xuất huyết. Nếu đang sốt, cần được theo dõi tại cơ sở y tế; hỏi nhân viên y tế trước khi dùng thuốc hạ sốt.', null);
    if ((high('wbc') || high('neu')) && high('crp')) p.add('bad', 'Phản ứng viêm rõ — gợi ý nhiễm khuẩn', 'Bạch cầu/trung tính cao cùng CRP cao. Bác sĩ sẽ khám để tìm ổ nhiễm.', 'crp');
    else if (high('crp') && !has('wbc')) p.need('Công thức máu (bạch cầu)');
    else if ((high('wbc') || high('neu')) && !has('crp')) p.need('CRP');
    else if (high('crp') && ok('wbc')) p.add('warn', 'CRP cao nhưng bạch cầu bình thường', 'Có thể là viêm giai đoạn sớm, nhiễm virus, bệnh tự miễn hoặc sau chấn thương.', null);
    if (high('lym') && !high('neu')) p.add('warn', 'Tăng bạch cầu lympho', 'Thường gặp khi nhiễm virus. Nếu kéo dài ở người lớn tuổi, cần khám huyết học.', null);
    if (high('eos')) p.add('warn', 'Tăng bạch cầu ái toan', 'Hay gặp do dị ứng hoặc nhiễm giun sán.', null);
    if (neu !== null && neu < 1.0 && neu >= 0.5) p.add('bad', 'Bạch cầu trung tính giảm vừa', 'Sức chống vi khuẩn giảm. Nếu sốt, cần đến cơ sở y tế.', null);
    if (high('plt') && (low('ferritin') || (low('mcv') && low('hgb')))) p.add('info', 'Tiểu cầu tăng kèm thiếu sắt', 'Tiểu cầu thường tăng nhẹ khi thiếu sắt; thường trở về bình thường khi hết thiếu sắt.', null);
    finish(p);
  }

  // ---------------------------------------------------------------- 3. Đường huyết
  {
    const p = panel('glucose', 'Đường huyết', 'flask', ['glu', 'hba1c', 'u_glu', 'u_ket']);
    const g = num('glu'), a = num('hba1c');
    if (a !== null && profile.group !== 'pregnant') {
      const eag = 1.59 * a - 2.59;
      p.calc('Đường huyết trung bình ước tính', formatNum(Math.round(eag * 10) / 10), 'mmol/L', 'Từ HbA1c, phản ánh 2–3 tháng gần đây', 'eag');
    }
    const gD = R('glu') && R('glu').basis === 'clinical' && g >= 7.0, aD = R('hba1c') && R('hba1c').basis === 'clinical' && a >= 6.5;
    const gP = R('glu') && R('glu').basis === 'clinical' && g >= 5.6 && g < 7.0, aP = R('hba1c') && R('hba1c').basis === 'clinical' && a >= 5.7 && a < 6.5;
    if (gD && aD) p.add('bad', 'Đường huyết đói và HbA1c cùng đạt ngưỡng chẩn đoán đái tháo đường', 'Hai xét nghiệm khác nhau cùng đạt ngưỡng theo ADA. Chỉ bác sĩ mới kết luận được — hãy khám nội tiết.', 'ada');
    else if (gD !== aD && g !== null && a !== null) p.add('warn', 'Đường huyết đói và HbA1c chưa thống nhất', 'Một chỉ số đạt ngưỡng đái tháo đường, chỉ số kia chưa. Bác sĩ thường cho làm lại để xác nhận.', 'ada');
    else if (gD || aD) { p.add('bad', `${gD ? 'Đường huyết đói' : 'HbA1c'} đạt ngưỡng chẩn đoán đái tháo đường`, 'Theo ADA, cần xét nghiệm lần hai hoặc một xét nghiệm khác để xác nhận.', 'ada'); p.need(gD ? 'HbA1c' : 'Đường huyết lúc đói'); }
    else if (gP || aP) p.add('warn', 'Ở mức tiền đái tháo đường', 'Đây là giai đoạn có thể đảo ngược bằng ăn uống, vận động, giảm cân. Nên kiểm tra định kỳ.', 'ada');
    if (a !== null && (low('hgb') || low('mcv'))) p.add('info', 'HbA1c có thể sai lệch', 'Khi thiếu máu hoặc có thể có thalassemia, HbA1c có thể thấp hoặc cao giả. Bác sĩ sẽ đọc cùng đường huyết.', null);
    if (pos('u_glu') && g !== null && g < 10 && !gD) p.add('info', 'Có đường trong nước tiểu dù đường máu không quá cao', 'Có thể do thuốc tiểu đường nhóm SGLT2, thai kỳ, hoặc ngưỡng thận thấp. Nên báo bác sĩ.', null);
    if (pos('u_ket') && (gD || (g !== null && g >= 13.9))) p.add('crit', 'Ceton niệu kèm đường huyết cao', 'Có nguy cơ nhiễm toan ceton. Nếu mệt, khát, thở nhanh, đau bụng, nôn: đi cấp cứu ngay.', null);
    else if (pos('u_ket') && g !== null && !gD) p.add('info', 'Có ceton niệu, đường máu không cao', 'Thường do nhịn đói, ăn kiêng ít tinh bột hoặc nôn nhiều.', null);
    finish(p);
  }

  // ---------------------------------------------------------------- 4. Mỡ máu
  {
    const p = panel('lipid', 'Mỡ máu', 'flask', ['chol', 'tg', 'hdl', 'ldl']);
    const tc = num('chol'), tg = num('tg'), hdl = num('hdl'), ldl = num('ldl');
    if (tc !== null && hdl !== null && hdl >= tc) p.check('HDL lớn hơn hoặc bằng Cholesterol toàn phần — không thể xảy ra, hãy kiểm tra lại.');
    else if (tc !== null && hdl !== null && ldl !== null && ldl + hdl > tc + 0.4) p.check('LDL + HDL lớn hơn Cholesterol toàn phần — có thể nhập sai một chỉ số.');
    if (profile.group !== 'pregnant') {
      if (tc !== null && hdl !== null && hdl < tc) {
        const nh = tc - hdl;
        const lvl = !adult ? null : nh < 3.4 ? 'tối ưu' : nh < 4.2 ? 'gần tối ưu' : nh < 4.9 ? 'cao giới hạn' : nh < 5.7 ? 'cao' : 'rất cao';
        p.calc('Non-HDL cholesterol', formatNum(Math.round(nh * 100) / 100), 'mmol/L', lvl ? `Mức ${lvl} (người chưa có bệnh tim mạch)` : 'Tổng các loại mỡ gây xơ vữa', 'nonhdl');
        const ratio = tc / hdl;
        p.calc('Tỷ lệ Cholesterol / HDL', formatNum(Math.round(ratio * 10) / 10), '', ratio > 5 ? 'Trên 5: nguy cơ tim mạch tăng' : 'Càng thấp càng tốt', null);
        if (adult && nh >= 4.9) p.add('bad', 'Non-HDL cholesterol cao', 'Phản ánh tổng lượng mỡ gây xơ vữa, kể cả khi LDL chưa cao.', 'nonhdl');
      }
      if (ldl === null && tc !== null && hdl !== null && tg !== null) {
        if (tg < 4.5) p.calc('LDL tính (Friedewald)', formatNum(Math.round((tc - hdl - tg / 2.2) * 100) / 100), 'mmol/L', 'Phiếu không có LDL nên app tính ước lượng', 'friedewald');
        else p.add('info', 'Không ước tính được LDL', 'Triglycerid từ 4,5 mmol/L trở lên làm công thức Friedewald không còn chính xác.', 'friedewald');
      }
      if (high('tg') && low('hdl')) p.add('warn', 'Triglycerid cao kèm HDL thấp', 'Kiểu rối loạn mỡ máu hay gặp ở người thừa cân, ít vận động, đề kháng insulin — nên xem cùng đường huyết.', null);
      if (high('tg') && (high('glu') || high('hba1c'))) p.add('warn', 'Mỡ máu và đường huyết cùng tăng', 'Hai rối loạn này thường đi cùng nhau và cùng làm tăng nguy cơ tim mạch.', null);
      if (R('tg') && R('tg').level === 'crit') p.add('crit', 'Triglycerid rất cao', 'Trên 11,3 mmol/L có nguy cơ viêm tụy cấp — cần khám sớm.', null);
    }
    finish(p);
  }

  // ---------------------------------------------------------------- 5. Gan, mật
  {
    const p = panel('liver', 'Gan và mật', 'flask', ['ast', 'alt', 'ggt', 'bil_t', 'bil_d', 'alb', 'prot', 'hbsag', 'antihcv']);
    const ast = num('ast'), alt = num('alt'), bt = num('bil_t'), bd = num('bil_d'), alb = num('alb'), prot = num('prot');
    if (bt !== null && bd !== null && bd > bt) p.check('Bilirubin trực tiếp lớn hơn bilirubin toàn phần — không thể xảy ra, hãy kiểm tra lại.');
    if (alb !== null && prot !== null && alb >= prot) p.check('Albumin lớn hơn hoặc bằng protein toàn phần — hãy kiểm tra lại.');
    const fold = (id, v) => { const u = ulnOf(id); return u && v !== null ? v / u : null; };
    const fA = fold('alt', alt), fS = fold('ast', ast);
    const fMax = Math.max(fA || 0, fS || 0);
    if (fMax > 1) {
      const sev = fMax > 15 ? ['crit', 'tăng rất nhiều (trên 15 lần ngưỡng)'] : fMax >= 5 ? ['bad', 'tăng vừa (5–15 lần ngưỡng)'] : ['warn', 'tăng nhẹ (dưới 5 lần ngưỡng)'];
      p.add(sev[0], `Men gan ${sev[1]}`, fMax >= 5 ? 'Cần khám chuyên khoa gan sớm.' : 'Thường gặp do gan nhiễm mỡ, rượu bia, thuốc hoặc viêm gan virus.', 'acg');
    }
    if (ast !== null && alt !== null && alt > 0 && (high('ast') || high('alt'))) {
      const dr = ast / alt;
      p.calc('Tỷ lệ AST/ALT (De Ritis)', formatNum(Math.round(dr * 100) / 100), '', dr > 2 ? 'Trên 2: gợi ý tổn thương gan do rượu' : dr < 1 ? 'Dưới 1: hay gặp ở gan nhiễm mỡ, viêm gan virus' : 'Từ 1 đến 2', 'deritis');
      if (dr > 2 && high('ast')) p.add('warn', 'AST tăng nhiều hơn ALT (tỷ lệ trên 2)', 'Mẫu hình này hay gặp khi tổn thương gan liên quan rượu bia' + (high('ggt') ? ', nhất là khi GGT cũng cao.' : '.'), 'deritis');
    }
    if (high('ggt') && !high('alt') && !high('ast')) p.add('warn', 'GGT tăng đơn độc', 'Hay gặp do rượu bia, gan nhiễm mỡ hoặc một số thuốc. Thường kiểm tra lại sau khi hạn chế rượu bia vài tuần.', null);
    if ((high('alt') || high('ast')) && high('ggt')) p.add('warn', 'Men gan và GGT cùng tăng', 'Gợi ý tổn thương tế bào gan; bác sĩ có thể chỉ định siêu âm gan.', null);
    if (bt !== null && bd !== null && high('bil_t')) {
      const share = bd / bt;
      p.calc('Bilirubin gián tiếp', formatNum(Math.round((bt - bd) * 10) / 10), 'µmol/L', `Bilirubin trực tiếp chiếm ${Math.round(share * 100)}%`, null);
      if (share < 0.2 && !high('alt') && !high('ast')) p.add('info', 'Bilirubin tăng chủ yếu dạng gián tiếp, men gan bình thường', 'Hay gặp ở hội chứng Gilbert (lành tính) hoặc tan máu.', null);
      else if (share >= 0.5) p.add('bad', 'Bilirubin tăng chủ yếu dạng trực tiếp', 'Gợi ý vấn đề tại gan hoặc đường mật. Bác sĩ có thể chỉ định siêu âm gan mật.', null);
    }
    if (pos('hbsag') && (high('alt') || high('ast'))) p.add('bad', 'Viêm gan B kèm men gan tăng', 'Virus có thể đang hoạt động. Cần khám chuyên khoa gan để làm thêm HBV-DNA và quyết định điều trị.', 'hbv');
    else if (pos('hbsag')) p.add('warn', 'Đang nhiễm viêm gan B, men gan ' + (has('alt') ? 'chưa tăng' : 'chưa có'), 'Cần khám chuyên khoa gan và theo dõi định kỳ 6 tháng.', 'hbv');
    if (pos('antihcv')) { p.add('warn', 'Có kháng thể viêm gan C', 'Cần làm HCV-RNA để biết virus còn hay không.', 'hbv'); p.need('HCV-RNA'); }
    if ((high('alt') || high('ast')) && !has('hbsag')) p.need('HBsAg');
    if ((high('alt') || high('ast')) && !has('antihcv')) p.need('Anti-HCV');
    if (alb !== null && prot !== null && alb < prot) {
      const glob = prot - alb, ag = alb / glob;
      p.calc('Globulin', formatNum(Math.round(glob * 10) / 10), 'g/L', `Tỷ lệ Albumin/Globulin ${formatNum(Math.round(ag * 100) / 100)}${ag < 1 ? ' (thấp)' : ''}`, null);
      if (ag < 1) p.add('warn', 'Tỷ lệ Albumin/Globulin thấp', 'Gặp trong viêm mạn tính, bệnh gan mạn hoặc tăng globulin; cần bác sĩ đánh giá.', null);
    }
    if (low('alb') && (high('bil_t') || high('ast'))) p.add('warn', 'Albumin thấp kèm bất thường chức năng gan', 'Gan giảm tổng hợp đạm — cần khám chuyên khoa gan.', null);
    finish(p);
  }

  // ---------------------------------------------------------------- 6. Thận, điện giải
  {
    const p = panel('kidney', 'Thận và điện giải', 'cup', ['ure', 'crea', 'egfr', 'uric', 'na', 'k', 'cl', 'ca', 'u_pro', 'u_bld']);
    const ure = num('ure'), crea = num('crea'), egfrIn = num('egfr'), k = num('k'), ca = num('ca'), alb = num('alb');
    // eGFR tính từ creatinin (người lớn, có tuổi + giới)
    let egfr = egfrIn;
    if (crea !== null && adult && profile.age >= 18 && (profile.sex === 'male' || profile.sex === 'female')) {
      const scr = crea / 88.4, f = profile.sex === 'female';
      const kap = f ? 0.7 : 0.9, al = f ? -0.241 : -0.302;
      const e = 142 * Math.pow(Math.min(scr / kap, 1), al) * Math.pow(Math.max(scr / kap, 1), -1.2) * Math.pow(0.9938, profile.age) * (f ? 1.012 : 1);
      const eR = Math.round(e);
      const g = eR >= 90 ? 'G1' : eR >= 60 ? 'G2' : eR >= 45 ? 'G3a' : eR >= 30 ? 'G3b' : eR >= 15 ? 'G4' : 'G5';
      p.calc('eGFR tính từ creatinin', String(eR), 'mL/phút/1,73m²', `CKD-EPI 2021, ${profile.age} tuổi — mức ${g}` + (egfrIn !== null ? `; phiếu ghi ${formatNum(egfrIn)}` : ''), 'ckdepi');
      if (egfr === null) egfr = eR;
    } else if (crea !== null && egfrIn === null && adult) {
      p.need('Nhập tuổi (ở màn Đọc phiếu) để app tính eGFR từ creatinin');
    }
    if (egfr !== null && egfr < 60) {
      p.add(egfr < 30 ? 'bad' : 'warn', `Mức lọc cầu thận giảm (${formatNum(egfr)})`, 'Nếu kéo dài trên 3 tháng là bệnh thận mạn theo KDIGO. Bác sĩ sẽ cho kiểm tra lại.', 'kdigo');
      if (pos('u_pro')) p.add('bad', 'eGFR giảm kèm đạm niệu', 'Hai dấu hiệu cùng có làm tăng nguy cơ tiến triển bệnh thận — cần khám thận.', 'kdigo');
      if (!has('u_pro')) p.need('Tổng phân tích nước tiểu hoặc tỷ lệ Albumin/Creatinin niệu');
    }
    if (ure !== null && crea !== null && crea > 0) {
      const ratio = ure / crea * 1000;
      p.calc('Tỷ lệ urê/creatinin', String(Math.round(ratio)), '', ure > 10 ? (ratio > 100 ? 'Trên 100: gợi ý nguyên nhân trước thận (mất nước, giảm tưới máu)' : ratio < 40 ? 'Dưới 40: gợi ý tổn thương tại thận' : '40–100') : 'Chỉ có ý nghĩa khi urê trên 10 mmol/L', 'ureacrea');
      if (ure > 10 && ratio > 100) p.add('warn', 'Urê tăng nhiều hơn creatinin', 'Hay gặp khi mất nước, ăn nhiều đạm hoặc chảy máu tiêu hóa. Bác sĩ sẽ đánh giá thêm.', 'ureacrea');
    }
    if (high('k') && egfr !== null && egfr < 60) p.add(R('k').level === 'crit' ? 'crit' : 'bad', 'Kali cao ở người giảm chức năng thận', 'Kết hợp này nguy hiểm hơn với tim — cần liên hệ bác sĩ sớm.', null);
    else if (high('k') && (egfr === null || egfr >= 60) && R('k').level !== 'crit') p.add('info', 'Kali cao, chức năng thận không giảm', 'Có thể tăng giả do vỡ hồng cầu khi lấy máu; bác sĩ thường cho lấy máu lại.', null);
    if (ca !== null && alb !== null) {
      const cc = ca + 0.02 * (40 - alb);
      const st = cc < 2.15 ? 'thấp' : cc > 2.55 ? 'cao' : 'trong khoảng';
      p.calc('Canxi hiệu chỉnh theo albumin', formatNum(Math.round(cc * 100) / 100), 'mmol/L', `Sau hiệu chỉnh: ${st} (khoảng 2,15–2,55)`, 'cacorr');
      if (low('ca') && st === 'trong khoảng') p.add('info', 'Canxi thấp do albumin thấp', 'Sau hiệu chỉnh theo albumin, canxi trở về trong khoảng — thường không phải thiếu canxi thật.', 'cacorr');
    }
    if (high('uric') && egfr !== null && egfr < 60) p.add('info', 'Acid uric cao kèm giảm chức năng thận', 'Thận giảm thải acid uric; hai vấn đề có thể ảnh hưởng lẫn nhau.', null);
    if (pos('u_pro') && pos('u_bld')) p.add('warn', 'Đạm niệu và máu niệu cùng dương tính', 'Cần khám thận để loại trừ bệnh cầu thận. Phụ nữ đang có kinh nên làm lại sau kỳ kinh.', null);
    if (low('na') && (high('glu'))) p.add('info', 'Natri thấp khi đường huyết cao', 'Đường huyết cao kéo nước vào máu làm natri thấp giả một phần.', null);
    finish(p);
  }

  // ---------------------------------------------------------------- 7. Tuyến giáp
  {
    const p = panel('thyroid', 'Tuyến giáp', 'pulse', ['tsh', 'ft4', 'ft3']);
    const preg = profile.group === 'pregnant';
    if (low('tsh') && high('ft4')) p.add('bad', 'Mẫu hình cường giáp', 'TSH thấp, FT4 cao. Cần bác sĩ nội tiết xác nhận và tìm nguyên nhân.', null);
    else if (low('tsh') && ok('ft4') && high('ft3')) p.add('bad', 'Mẫu hình cường giáp do T3', 'TSH thấp, FT4 bình thường nhưng FT3 cao. Cần khám nội tiết.', null);
    else if (low('tsh') && ok('ft4') && !high('ft3')) p.add('warn', 'Cường giáp dưới lâm sàng hoặc thay đổi tạm thời', preg ? 'Trong 3 tháng đầu thai kỳ, TSH thấp có thể là sinh lý.' : 'Bác sĩ thường cho kiểm tra lại sau 6–12 tuần.', null);
    else if (high('tsh') && low('ft4')) p.add('bad', 'Mẫu hình suy giáp', 'TSH cao, FT4 thấp. Cần khám nội tiết.', null);
    else if (high('tsh') && ok('ft4')) p.add('warn', 'Suy giáp dưới lâm sàng', preg ? 'Ở thai phụ cần khám nội tiết sớm.' : 'Bác sĩ thường cho kiểm tra lại sau 6–12 tuần.', preg ? 'ata-2017' : null);
    else if (high('tsh') && high('ft4')) p.add('warn', 'TSH và FT4 cùng cao — kết quả không điển hình', 'Có thể do nhiễu xét nghiệm hoặc bệnh lý hiếm của tuyến yên. Cần bác sĩ nội tiết đánh giá.', null);
    else if (low('ft4') && (low('tsh') || ok('tsh'))) p.add('warn', 'FT4 thấp nhưng TSH không tăng', 'Có thể do tuyến yên — cần bác sĩ nội tiết đánh giá.', null);
    if (has('tsh') && !ok('tsh') && !has('ft4')) p.need('FT4');
    finish(p);
  }

  // ---------------------------------------------------------------- 8. Nước tiểu
  {
    const p = panel('urine', 'Nước tiểu', 'cup', ['u_ph', 'u_sg', 'u_glu', 'u_pro', 'u_bld', 'u_leu', 'u_nit', 'u_ket', 'u_bil', 'u_uro']);
    if (pos('u_nit') && pos('u_leu')) p.add('bad', 'Gợi ý nhiễm trùng tiết niệu', 'Nitrit và bạch cầu niệu cùng dương tính. Cần khám để bác sĩ quyết định điều trị.', null);
    else if (pos('u_leu') && neg('u_nit')) p.add('warn', 'Có bạch cầu niệu, nitrit âm tính', 'Có thể nhiễm trùng tiết niệu do vi khuẩn không tạo nitrit, hoặc mẫu bị nhiễm bẩn. Nếu có triệu chứng tiểu buốt, rắt, cần khám.', null);
    else if (pos('u_nit') && neg('u_leu')) p.add('warn', 'Nitrit dương tính đơn độc', 'Có thể nhiễm khuẩn sớm hoặc mẫu để lâu. Nên làm lại với mẫu mới.', null);
    if (pos('u_pro') && high('u_sg')) p.add('info', 'Nước tiểu đặc', 'Tỷ trọng cao có thể làm đạm niệu dương tính nhẹ. Nên làm lại khi uống đủ nước.', null);
    if (pos('u_bld') && !pos('u_pro')) p.add('info', 'Có máu trong nước tiểu', profile.sex === 'female' ? 'Nếu đang có kinh, nên làm lại sau kỳ kinh. Kéo dài cần khám tiết niệu.' : 'Kéo dài cần khám tiết niệu.', null);
    if (pos('u_bil')) p.add('warn', 'Có bilirubin trong nước tiểu', 'Gợi ý vấn đề gan hoặc đường mật — nên đọc cùng nhóm Gan và mật.', null);
    finish(p);
  }

  // ---------------------------------------------------------------- 9. Miễn dịch viêm gan B
  {
    const p = panel('hbv', 'Viêm gan B: nhiễm hay đã có miễn dịch', 'shield', ['hbsag', 'antihbs']);
    const ab = num('antihbs');
    if (neg('hbsag') && ab !== null && ab >= 10) p.add('ok', 'Không nhiễm và đã có miễn dịch', 'HBsAg âm tính, Anti-HBs từ 10 mIU/mL trở lên.', 'hbv');
    else if (neg('hbsag') && ab !== null && ab < 10) p.add('warn', 'Không nhiễm nhưng chưa có miễn dịch', 'Nên hỏi bác sĩ về tiêm vắc-xin viêm gan B.', 'hbv');
    else if (pos('hbsag') && ab !== null && ab >= 10) p.add('warn', 'HBsAg và Anti-HBs cùng dương tính', 'Tình huống ít gặp, cần bác sĩ chuyên khoa gan đánh giá.', 'hbv');
    else if (neg('hbsag') && ab === null) p.need('Anti-HBs (để biết đã có miễn dịch chưa)');
    finish(p);
  }

  // thứ tự: nặng trước
  panels.sort((a, b) => RANK[b.level] - RANK[a.level]);
  const checks = panels.flatMap(p => p.checks.map(c => ({ ...c, panel: p.title })));
  return { panels, checks };
}

/** Các chỉ số cùng nhóm đọc liên kết với một chỉ số. */
export const PANEL_MEMBERS = {
  anemia: ['hgb', 'rbc', 'hct', 'mcv', 'mch', 'mchc', 'rdw', 'ferritin', 'iron', 'b12'],
  inflam: ['wbc', 'neu', 'lym', 'eos', 'plt', 'crp'],
  glucose: ['glu', 'hba1c', 'u_glu', 'u_ket'],
  lipid: ['chol', 'tg', 'hdl', 'ldl'],
  liver: ['ast', 'alt', 'ggt', 'bil_t', 'bil_d', 'alb', 'prot', 'hbsag', 'antihcv'],
  kidney: ['ure', 'crea', 'egfr', 'uric', 'na', 'k', 'cl', 'ca', 'u_pro', 'u_bld'],
  thyroid: ['tsh', 'ft4', 'ft3'],
  urine: ['u_ph', 'u_sg', 'u_glu', 'u_pro', 'u_bld', 'u_leu', 'u_nit', 'u_ket', 'u_bil', 'u_uro'],
  hbv: ['hbsag', 'antihbs']
};
