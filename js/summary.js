// Nhận định tổng quát và nhận định từng nhóm, dựng từ kết quả phân loại (classification.js)
// và đọc liên kết (interpret.js). Không đặt ngưỡng mới ngoài các tiêu chí có nguồn ghi tại đây.
// Diễn đạt: "gợi ý", "cần bác sĩ đánh giá"; không chẩn đoán, không chỉ định thuốc.
import { formatNum } from './validation.js';

export const SUMMARY_SOURCES = {
  'who-sev': 'WHO — phân mức thiếu máu nhẹ/vừa/nặng theo Hb (2011, cập nhật 2024 cho trẻ nhỏ và thai phụ).',
  'mets': 'AHA/NHLBI 2005 — hội chứng chuyển hóa khi có ≥ 3/5 tiêu chí: vòng bụng, huyết áp, triglycerid ≥ 1,7 mmol/L, HDL < 1,03 (nam) / < 1,29 (nữ) mmol/L, đường huyết đói ≥ 5,6 mmol/L.',
  'who-pa': 'WHO 2020 — người lớn nên vận động mức vừa 150–300 phút mỗi tuần.'
};

const RANK = { none: 0, ok: 1, info: 1, na: 1, warn: 2, bad: 3, crit: 4 };
const SPECIALTY = {
  anemia: 'Huyết học / Nội tổng quát', inflam: 'Nội tổng quát', glucose: 'Nội tiết – Đái tháo đường', lipid: 'Tim mạch / Nội tiết',
  liver: 'Tiêu hóa – Gan mật', kidney: 'Thận – Tiết niệu', thyroid: 'Nội tiết', urine: 'Thận – Tiết niệu', hbv: 'Gan mật / Truyền nhiễm'
};

function helpers(results, profile) {
  const R = id => results[id];
  const has = id => { const r = R(id); return !!r && !['empty', 'invalid'].includes(r.state); };
  const num = id => (has(id) && Number.isFinite(R(id).value) ? R(id).value : null);
  const low = id => { const r = R(id); return !!r && r.dir === 'low' && ['warn', 'bad', 'crit'].includes(r.level); };
  const high = id => { const r = R(id); return !!r && r.dir === 'high' && ['warn', 'bad', 'crit'].includes(r.level); };
  const ok = id => { const r = R(id); return !!r && r.level === 'ok'; };
  const pos = id => { const r = R(id); return !!r && r.state === 'qual-pos'; };
  const neg = id => { const r = R(id); return !!r && r.state === 'qual-neg'; };
  const lv = id => (R(id) ? R(id).level : 'none');
  return { R, has, num, low, high, ok, pos, neg, lv, profile };
}

/** Phân mức thiếu máu theo WHO. @returns {'nhẹ'|'vừa'|'nặng'|null} */
export function anemiaSeverity(hb, profile = {}) {
  if (hb == null) return null;
  let mild, mod, sev; // ngưỡng dưới của từng mức (g/L): >= mild → không thiếu máu
  const g = profile.group, tri = Number(profile.trimester), age = profile.ageBand;
  if (g === 'pregnant') { if (!tri) return null; [mild, mod, sev] = tri === 2 ? [105, 95, 70] : [110, 100, 70]; }
  else if (g === 'child') {
    if (age === '6-23m') [mild, mod, sev] = [105, 95, 70];
    else if (age === '2-4y') [mild, mod, sev] = [110, 100, 70];
    else if (age === '5-9y' || age === '10-11y') [mild, mod, sev] = [115, 110, 80];
    else if (age === '12-14y') [mild, mod, sev] = [120, 110, 80];
    else if (age === '15-17y') { if (!profile.sex) return null; [mild, mod, sev] = profile.sex === 'male' ? [130, 110, 80] : [120, 110, 80]; }
    else return null;
  } else {
    if (profile.sex === 'male') [mild, mod, sev] = [130, 110, 80];
    else if (profile.sex === 'female') [mild, mod, sev] = [120, 110, 80];
    else return null;
  }
  if (hb >= mild) return null;
  if (hb >= mod) return 'nhẹ';
  if (hb >= sev) return 'vừa';
  return 'nặng';
}

/**
 * Nhận định từng nhóm dạng hỏi–đáp.
 * @returns {Object<panelId, Array<{q, a, level}>>}
 */
export function assessPanels(results, profile = {}) {
  const H = helpers(results, profile);
  const { has, num, low, high, ok, pos, neg, lv } = H;
  const out = {};
  const qa = (id, q, a, level) => { (out[id] = out[id] || []).push({ q, a, level }); };

  // Hồng cầu
  if (has('hgb')) {
    const sev = anemiaSeverity(num('hgb'), profile);
    if (low('hgb')) qa('anemia', 'Có thiếu máu không?', `Có${sev ? ', mức ' + sev + ' theo WHO' : ''} (HGB ${formatNum(num('hgb'))} g/L).`, sev === 'nặng' ? 'crit' : sev === 'vừa' ? 'bad' : 'warn');
    else if (high('hgb')) qa('anemia', 'Có thiếu máu không?', 'Không. HGB cao hơn khoảng tham chiếu (máu cô đặc).', 'warn');
    else if (ok('hgb')) qa('anemia', 'Có thiếu máu không?', 'Không. Lượng huyết sắc tố trong khoảng tham chiếu.', 'ok');
  }
  if (has('mcv')) qa('anemia', 'Kích thước hồng cầu?', low('mcv') ? 'Nhỏ hơn bình thường (gặp trong thiếu sắt, thalassemia).' : high('mcv') ? 'To hơn bình thường (gặp khi thiếu B12/folate, rượu bia, bệnh gan).' : 'Bình thường.', low('mcv') || high('mcv') ? 'warn' : 'ok');
  if (has('ferritin')) {
    const f = num('ferritin');
    qa('anemia', 'Sắt dự trữ?', low('ferritin') || (f !== null && f < 30 && profile.group !== 'child') ? `Thấp (Ferritin ${formatNum(f)} ng/mL) — cơ thể đang thiếu sắt.` : high('ferritin') ? (high('crp') ? 'Ferritin cao nhưng đang có viêm nên chưa đánh giá đúng được.' : 'Cao — cần bác sĩ đánh giá (thừa sắt hoặc viêm, bệnh gan).') : 'Đủ.', low('ferritin') || (f !== null && f < 30) ? 'bad' : high('ferritin') ? 'warn' : 'ok');
  }
  if (has('b12')) qa('anemia', 'Vitamin B12?', low('b12') ? 'Thấp.' : 'Đủ.', low('b12') ? 'warn' : 'ok');

  // Bạch cầu, viêm
  const infl = high('crp') || high('wbc') || high('neu');
  if (has('wbc') || has('crp')) {
    qa('inflam', 'Có dấu hiệu viêm, nhiễm trùng?',
      (high('wbc') || high('neu')) && high('crp') ? 'Có, rõ: bạch cầu và CRP cùng tăng.'
        : infl ? `Có gợi ý: ${[high('wbc') && 'bạch cầu tăng', high('neu') && 'trung tính tăng', high('crp') && 'CRP tăng'].filter(Boolean).join(', ')}.`
        : low('wbc') ? 'Bạch cầu giảm — sức đề kháng có thể giảm (hay gặp sau nhiễm virus).'
        : 'Không thấy dấu hiệu viêm trong các chỉ số đã làm.',
      (high('wbc') || high('neu')) && high('crp') ? 'bad' : infl || low('wbc') ? 'warn' : 'ok');
  }
  if (has('plt')) qa('inflam', 'Tiểu cầu (cầm máu)?', low('plt') ? (lv('plt') === 'crit' ? 'Rất thấp — nguy cơ chảy máu, cần khám ngay.' : 'Thấp — dễ bầm tím, chảy máu hơn bình thường.') : high('plt') ? 'Cao hơn bình thường.' : 'Bình thường.', lv('plt') === 'crit' ? 'crit' : low('plt') ? 'bad' : high('plt') ? 'warn' : 'ok');
  if (has('eos') && high('eos')) qa('inflam', 'Dị ứng, ký sinh trùng?', 'Bạch cầu ái toan tăng — gợi ý dị ứng hoặc nhiễm giun sán.', 'warn');

  // Đường huyết
  if (has('glu') || has('hba1c')) {
    const g = H.R('glu'), a = H.R('hba1c');
    const cat = r => !r || !['band', 'normal'].includes(r.state) ? null : r.level === 'ok' ? 0 : r.level === 'warn' ? 1 : (r.dir === 'low' ? -1 : 2);
    const c = Math.max(cat(g) ?? -9, cat(a) ?? -9);
    if (profile.group === 'pregnant' && has('glu')) {
      qa('glucose', 'Đường huyết thai kỳ?', ok('glu') ? 'Dưới ngưỡng đái tháo đường thai kỳ.' : low('glu') ? 'Thấp.' : 'Đạt ngưỡng cần bác sĩ sản khoa đánh giá.', ok('glu') ? 'ok' : 'bad');
    } else if (c === -1) qa('glucose', 'Đường huyết?', 'Thấp — hạ đường huyết.', lv('glu') === 'crit' ? 'crit' : 'bad');
    else if (c >= 0) qa('glucose', 'Chuyển hóa đường?', ['Bình thường.', 'Ở mức tiền đái tháo đường — giai đoạn còn đảo ngược được.', 'Đạt ngưỡng chẩn đoán đái tháo đường của ADA — cần bác sĩ xác nhận.'][c], ['ok', 'warn', 'bad'][c]);
    if (has('hba1c') && profile.group !== 'pregnant') qa('glucose', 'Kiểm soát đường 2–3 tháng qua?', `HbA1c ${formatNum(num('hba1c'))}%${num('hba1c') >= 7 ? ' — ở người đã bị đái tháo đường, mục tiêu thường là dưới 7% (bác sĩ sẽ đặt mục tiêu riêng).' : '.'}`, lv('hba1c') === 'ok' ? 'ok' : 'warn');
  }

  // Mỡ máu
  if (['chol', 'ldl', 'hdl', 'tg'].some(has) && profile.group !== 'pregnant') {
    const bad = ['chol', 'ldl', 'tg'].filter(high).map(id => ({ chol: 'Cholesterol', ldl: 'LDL', tg: 'Triglycerid' })[id]);
    if (low('hdl')) bad.push('HDL thấp');
    qa('lipid', 'Mỡ máu có rối loạn không?', bad.length ? `Có: ${bad.join(', ')}.` : 'Các chỉ số mỡ máu đã làm đều ở mức chấp nhận được.', bad.length >= 2 ? 'bad' : bad.length ? 'warn' : 'ok');
    if (has('ldl')) qa('lipid', 'LDL ("mỡ xấu", mục tiêu chính)?', `${formatNum(num('ldl'))} mmol/L — ${H.R('ldl').label.toLowerCase()}. Mục tiêu LDL tùy nguy cơ tim mạch của từng người.`, lv('ldl') === 'ok' ? 'ok' : lv('ldl'));
    if (H.R('tg') && H.R('tg').level === 'crit') qa('lipid', 'Nguy cơ viêm tụy?', 'Triglycerid rất cao — có nguy cơ viêm tụy cấp.', 'crit');
  }

  // Gan
  if (['ast', 'alt', 'ggt', 'bil_t', 'alb'].some(has)) {
    if (has('alt') || has('ast')) qa('liver', 'Tế bào gan có bị tổn thương?', high('alt') || high('ast') ? 'Có dấu hiệu: men gan tăng.' : 'Không: men gan trong khoảng.', high('alt') || high('ast') ? (Math.max(num('alt') || 0, num('ast') || 0) >= 200 ? 'bad' : 'warn') : 'ok');
    if (has('ggt') || has('bil_t')) qa('liver', 'Đường mật, rượu bia?', high('ggt') && high('bil_d') ? 'GGT và bilirubin trực tiếp tăng — cần kiểm tra đường mật.' : high('ggt') ? 'GGT tăng — hay liên quan rượu bia, gan nhiễm mỡ, thuốc.' : high('bil_t') ? 'Bilirubin tăng.' : 'Không thấy bất thường.', high('ggt') || high('bil_t') ? 'warn' : 'ok');
    if (has('alb')) qa('liver', 'Gan còn tổng hợp đạm tốt?', low('alb') ? 'Albumin thấp — có thể do gan, thận mất đạm hoặc dinh dưỡng kém.' : 'Tốt (albumin trong khoảng).', low('alb') ? 'warn' : 'ok');
  }
  if (has('hbsag') || has('antihcv')) qa('liver', 'Viêm gan virus?', pos('hbsag') || pos('antihcv') ? [pos('hbsag') && 'đang nhiễm viêm gan B', pos('antihcv') && 'có kháng thể viêm gan C'].filter(Boolean).join('; ').replace(/^./, c => c.toUpperCase()) + '.' : 'Không phát hiện ' + [has('hbsag') && 'viêm gan B', has('antihcv') && 'viêm gan C'].filter(Boolean).join(', ') + '.', pos('hbsag') || pos('antihcv') ? 'bad' : 'ok');

  // Thận
  if (['crea', 'egfr', 'ure'].some(has)) {
    const e = num('egfr');
    qa('kidney', 'Thận lọc máu tốt không?', e !== null ? (e >= 90 ? 'Tốt (eGFR ≥ 90).' : e >= 60 ? `Giảm nhẹ (eGFR ${formatNum(e)}) — thường chưa đáng lo nếu không có đạm niệu.` : `Giảm (eGFR ${formatNum(e)}) — cần bác sĩ thận đánh giá.`) : high('crea') ? 'Creatinin tăng — chức năng lọc có thể giảm.' : ok('crea') ? 'Creatinin trong khoảng (nhập tuổi để app tính eGFR).' : 'Chưa đủ dữ liệu.', e !== null ? (e < 30 ? 'bad' : e < 60 ? 'warn' : 'ok') : high('crea') ? 'warn' : 'ok');
  }
  if (has('u_pro')) qa('kidney', 'Thận có làm rò đạm?', pos('u_pro') ? 'Có đạm trong nước tiểu — cần làm lại để xác nhận.' : 'Không.', pos('u_pro') ? 'warn' : 'ok');
  if (['na', 'k', 'cl', 'ca'].some(has)) {
    const offE = ['na', 'k', 'cl', 'ca'].filter(id => has(id) && !ok(id));
    qa('kidney', 'Điện giải?', offE.length ? `Lệch: ${offE.map(id => ({ na: 'Natri', k: 'Kali', cl: 'Clo', ca: 'Canxi' })[id] + (high(id) ? ' cao' : ' thấp')).join(', ')}.` : 'Cân bằng.', offE.some(id => lv(id) === 'crit') ? 'crit' : offE.length ? 'warn' : 'ok');
  }
  if (has('uric')) qa('kidney', 'Acid uric (gút)?', high('uric') ? 'Cao — tăng nguy cơ gút, sỏi thận; chưa có nghĩa là đã bị gút.' : 'Bình thường.', high('uric') ? 'warn' : 'ok');

  // Tuyến giáp
  if (has('tsh')) qa('thyroid', 'Tuyến giáp hoạt động thế nào?', ok('tsh') && (!has('ft4') || ok('ft4')) ? 'Bình thường.' : high('tsh') ? (low('ft4') ? 'Kém (suy giáp).' : 'Có dấu hiệu hoạt động kém nhẹ (suy giáp dưới lâm sàng).') : low('tsh') ? (high('ft4') || high('ft3') ? 'Quá mức (cường giáp).' : 'TSH thấp — có thể cường giáp nhẹ hoặc thay đổi tạm thời.') : 'Cần bác sĩ đánh giá thêm.', ok('tsh') && (!has('ft4') || ok('ft4')) ? 'ok' : (high('tsh') && low('ft4')) || (low('tsh') && high('ft4')) ? 'bad' : 'warn');

  // Nước tiểu
  if (['u_nit', 'u_leu'].some(has)) qa('urine', 'Có nhiễm trùng tiểu?', pos('u_nit') && pos('u_leu') ? 'Gợi ý có (nitrit và bạch cầu niệu cùng dương).' : pos('u_leu') || pos('u_nit') ? 'Có thể — một dấu hiệu dương tính.' : 'Không thấy dấu hiệu.', pos('u_nit') && pos('u_leu') ? 'bad' : pos('u_leu') || pos('u_nit') ? 'warn' : 'ok');
  if (['u_pro', 'u_bld', 'u_glu'].some(has)) {
    const p = [pos('u_pro') && 'đạm', pos('u_bld') && 'máu', pos('u_glu') && 'đường'].filter(Boolean);
    qa('urine', 'Có chất bất thường trong nước tiểu?', p.length ? `Có ${p.join(', ')}.` : 'Không có đạm, máu, đường.', p.length ? 'warn' : 'ok');
  }

  // Viêm gan B
  if (has('hbsag') && has('antihbs')) qa('hbv', 'Tình trạng viêm gan B?', pos('hbsag') ? 'Đang nhiễm.' : num('antihbs') >= 10 ? 'Không nhiễm, đã có miễn dịch.' : 'Không nhiễm, chưa có miễn dịch — nên hỏi về tiêm vắc-xin.', pos('hbsag') ? 'bad' : num('antihbs') >= 10 ? 'ok' : 'warn');
  else if (neg('hbsag')) qa('hbv', 'Tình trạng viêm gan B?', 'Không nhiễm. Cần Anti-HBs để biết đã có miễn dịch chưa.', 'ok');
  return out;
}

/** Mối liên quan giữa các nhóm (đọc chéo). */
export function crossLinks(results, profile = {}) {
  const { has, num, low, high, ok, pos } = helpers(results, profile);
  const links = [];
  const adult = !profile.group || profile.group === 'adult';
  // Hội chứng chuyển hóa: 3 tiêu chí xét nghiệm trong 5 (AHA/NHLBI 2005)
  if (adult && (has('tg') || has('hdl') || has('glu'))) {
    const crit = [];
    if (num('tg') !== null && num('tg') >= 1.7) crit.push('triglycerid ≥ 1,7');
    const hdlCut = profile.sex === 'male' ? 1.03 : profile.sex === 'female' ? 1.29 : null;
    if (hdlCut && num('hdl') !== null && num('hdl') < hdlCut) crit.push('HDL thấp');
    if (num('glu') !== null && num('glu') >= 5.6) crit.push('đường huyết đói ≥ 5,6');
    if (crit.length >= 2) links.push({ level: crit.length === 3 ? 'bad' : 'warn', groups: ['glucose', 'lipid'], title: `Có ${crit.length}/3 tiêu chí xét nghiệm của hội chứng chuyển hóa`,
      detail: `Gồm: ${crit.join(', ')}. Hội chứng chuyển hóa được xác định khi có từ 3/5 tiêu chí; 2 tiêu chí còn lại là vòng bụng và huyết áp — hãy đo thêm. Đây là nhóm yếu tố làm tăng nguy cơ đái tháo đường và bệnh tim mạch.`, source: 'mets' });
  }
  // Gan nhiễm mỡ liên quan chuyển hóa
  const metab = high('tg') || low('hdl') || high('glu') || high('hba1c');
  if ((high('alt') || high('ast')) && metab && !pos('hbsag') && !pos('antihcv')) links.push({ level: 'warn', groups: ['liver', 'lipid', 'glucose'], title: 'Men gan tăng cùng rối loạn mỡ máu/đường huyết',
    detail: 'Kết hợp này hay gặp ở gan nhiễm mỡ liên quan chuyển hóa. Bác sĩ thường chỉ định siêu âm gan; giảm cân, giảm đường và rượu bia giúp men gan cải thiện.' });
  if (high('uric') && metab) links.push({ level: 'info', groups: ['kidney', 'lipid', 'glucose'], title: 'Acid uric cao đi cùng rối loạn chuyển hóa',
    detail: 'Acid uric cao thường đi kèm mỡ máu, đường huyết cao và thừa cân; cải thiện chế độ ăn giúp cả hai.' });
  // Nhiều yếu tố nguy cơ tim mạch
  const cv = [high('ldl') && 'LDL cao', low('hdl') && 'HDL thấp', (num('glu') >= 7 || num('hba1c') >= 6.5) && 'đường huyết ở ngưỡng đái tháo đường', num('egfr') !== null && num('egfr') < 60 && 'giảm chức năng thận'].filter(Boolean);
  if (adult && cv.length >= 2) links.push({ level: 'warn', groups: ['lipid', 'glucose', 'kidney'], title: 'Nhiều yếu tố nguy cơ tim mạch cùng lúc',
    detail: `${cv.join(', ')}. Khi có nhiều yếu tố, mục tiêu điều trị mỡ máu thường chặt hơn. Bác sĩ sẽ đánh giá cùng huyết áp, hút thuốc, tiền sử gia đình.` });
  // Thiếu máu do bệnh mạn tính / viêm
  if (low('hgb') && !low('mcv') && high('crp') && (ok('ferritin') || high('ferritin'))) links.push({ level: 'warn', groups: ['anemia', 'inflam'], title: 'Thiếu máu kèm tình trạng viêm',
    detail: 'Thiếu máu với sắt dự trữ không thấp và CRP cao gợi ý thiếu máu do viêm/bệnh mạn tính. Cần tìm và điều trị nguyên nhân gây viêm.' });
  // Mất nước
  const dehy = [high('hct') && 'HCT cao', high('na') && 'natri cao', num('ure') > 10 && num('crea') && num('ure') / num('crea') * 1000 > 100 && 'urê tăng hơn creatinin', high('u_sg') && 'nước tiểu đặc'].filter(Boolean);
  if (dehy.length >= 2) links.push({ level: 'warn', groups: ['anemia', 'kidney', 'urine'], title: 'Dấu hiệu cơ thể thiếu nước',
    detail: `${dehy.join(', ')}. Nên uống đủ nước và làm lại xét nghiệm; một số chỉ số có thể trở về bình thường.` });
  // Suy giáp và mỡ máu
  if (high('tsh') && (high('ldl') || high('chol'))) links.push({ level: 'info', groups: ['thyroid', 'lipid'], title: 'Suy giáp có thể làm tăng mỡ máu',
    detail: 'Khi tuyến giáp hoạt động kém, cholesterol/LDL thường tăng. Bác sĩ thường xử lý tuyến giáp trước rồi đánh giá lại mỡ máu.' });
  // Viêm + đường huyết
  if ((high('crp') || high('wbc')) && high('glu') && !high('hba1c') && has('hba1c')) links.push({ level: 'info', groups: ['inflam', 'glucose'], title: 'Đường huyết tăng khi đang viêm',
    detail: 'Nhiễm trùng, viêm cấp có thể làm đường huyết tăng tạm thời; HbA1c bình thường cho thấy đường máu trước đó ổn.' });
  // Thận + thiếu máu
  if (low('hgb') && num('egfr') !== null && num('egfr') < 60) links.push({ level: 'warn', groups: ['anemia', 'kidney'], title: 'Thiếu máu và giảm chức năng thận',
    detail: 'Thận giảm sản xuất hormone kích thích tạo máu, nên bệnh thận mạn thường kèm thiếu máu.' });
  // Gan + nước tiểu
  if (pos('u_bil') && (high('bil_d') || high('alt'))) links.push({ level: 'warn', groups: ['liver', 'urine'], title: 'Bilirubin niệu cùng bất thường gan',
    detail: 'Nước tiểu có bilirubin khớp với bất thường ở gan/mật — cần khám tiêu hóa sớm.' });
  // Thai kỳ
  if (profile.group === 'pregnant' && low('hgb') && profile.trimester) links.push({ level: 'warn', groups: ['anemia'], title: 'Thiếu máu khi mang thai',
    detail: 'Thiếu máu thai kỳ ảnh hưởng mẹ và bé; bác sĩ sản khoa sẽ hướng dẫn bổ sung sắt, axit folic phù hợp.' });
  return links;
}

/** Nhận định tổng quát cho cả phiếu. */
export function overallSummary(results, IP, profile = {}, totalTests = 0) {
  const { has, high, low, pos } = helpers(results, profile);
  const ids = Object.keys(results).filter(has);
  const assess = assessPanels(results, profile);
  const links = crossLinks(results, profile);
  const panels = IP.panels;

  const levels = [...panels.map(p => p.level), ...links.map(l => l.level), ...ids.map(id => results[id].level)];
  const top = levels.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'ok');
  const urgency = top === 'crit'
    ? { level: 'crit', label: 'Cần liên hệ cơ sở y tế ngay', text: 'Có chỉ số ở mức cần đánh giá khẩn cấp. Nếu số trên phiếu đúng, hãy liên hệ ngay bác sĩ/cơ sở y tế nơi làm xét nghiệm; gọi 115 nếu có triệu chứng nặng.' }
    : top === 'bad'
    ? { level: 'bad', label: 'Nên đi khám sớm', text: 'Có bất thường cần bác sĩ đánh giá. Hãy sắp xếp khám sớm và mang theo phiếu này.' }
    : top === 'warn'
    ? { level: 'warn', label: 'Cần theo dõi', text: 'Có một số chỉ số lệch nhẹ hoặc ở mức cần lưu ý. Hỏi bác sĩ ở lần khám tới; nhiều trường hợp chỉ cần điều chỉnh lối sống và kiểm tra lại.' }
    : { level: 'ok', label: 'Chưa thấy bất thường đáng kể', text: `Trong ${ids.length} chỉ số đã nhập, chưa thấy bất thường đáng kể. Điều này không thay thế khám sức khỏe và không đánh giá được các xét nghiệm chưa làm.` };

  // Vấn đề chính: lấy từ các nhóm, ưu tiên mức nặng; mỗi nhóm tối đa 2
  const problems = [];
  for (const p of [...panels].sort((a, b) => RANK[b.level] - RANK[a.level])) {
    p.findings.filter(f => RANK[f.level] >= 2).slice(0, 2).forEach(f => problems.push({ level: f.level, title: f.title, detail: f.detail, panel: p.title, panelId: p.id }));
  }
  if (IP.checks.length) problems.unshift({ level: 'warn', title: 'Có số liệu không khớp nhau', detail: 'Hãy kiểm tra lại số đã nhập/đọc từ ảnh trước khi dựa vào nhận định.', panel: 'Kiểm tra dữ liệu' });
  problems.sort((a, b) => RANK[b.level] - RANK[a.level]);

  // Điều đáng yên tâm
  const reassure = [];
  for (const [pid, list] of Object.entries(assess)) {
    for (const x of list) if (x.level === 'ok' && !/Chưa đủ/.test(x.a)) reassure.push(`${x.q.replace(/\?$/, '')}: ${x.a.replace(/\.$/, '').toLowerCase()}.`);
  }

  // Chuyên khoa
  const specialties = [...new Set(panels.filter(p => RANK[p.level] >= 3).map(p => SPECIALTY[p.id]))];

  // Lối sống (chung, không phải chỉ định)
  const lifestyle = [];
  const metab = high('tg') || low('hdl') || high('ldl') || high('chol') || high('glu') || high('hba1c') || high('uric');
  if (metab) {
    lifestyle.push('Giảm đồ ngọt, nước ngọt, tinh bột trắng; tăng rau xanh, ngũ cốc nguyên hạt, cá.');
    lifestyle.push('Vận động mức vừa (đi bộ nhanh, đạp xe) 150–300 phút mỗi tuần nếu sức khỏe cho phép.');
  }
  if (high('alt') || high('ast') || high('ggt') || high('uric') || high('tg')) lifestyle.push('Hạn chế rượu bia; không tự dùng thuốc nam, thực phẩm chức năng khi chưa hỏi bác sĩ.');
  if (high('uric')) lifestyle.push('Hạn chế nội tạng, hải sản, thịt đỏ, bia; uống đủ nước.');
  if (low('ferritin') || (low('hgb') && low('mcv'))) lifestyle.push('Ăn thực phẩm giàu sắt (thịt đỏ, gan, rau lá xanh đậm) kèm thực phẩm giàu vitamin C; việc bổ sung sắt nên theo hướng dẫn bác sĩ.');
  if (num(results, 'egfr') !== null && num(results, 'egfr') < 60) lifestyle.push('Hỏi bác sĩ trước khi dùng thuốc giảm đau, kháng sinh hoặc thuốc nam vì thận đang lọc kém.');

  // Câu hỏi nên hỏi bác sĩ
  const ask = [];
  if (problems.length) ask.push('Các chỉ số bất thường của tôi có cần làm lại hay làm thêm xét nghiệm nào không?');
  if (specialties.length) ask.push(`Tôi có cần khám chuyên khoa ${specialties.join(', ')} không?`);
  if (high('ldl') || high('chol')) ask.push('Với nguy cơ tim mạch của tôi, mục tiêu LDL nên là bao nhiêu?');
  if (high('glu') || high('hba1c')) ask.push('Tôi đã bị đái tháo đường hay tiền đái tháo đường? Bao lâu nên kiểm tra lại?');
  if (low('hgb')) ask.push('Nguyên nhân thiếu máu của tôi là gì? Có cần bổ sung sắt hay xét nghiệm thêm không?');
  if (high('alt') || high('ast')) ask.push('Men gan tăng có cần siêu âm gan hay xét nghiệm viêm gan không?');
  if (pos('hbsag')) ask.push('Viêm gan B của tôi có cần điều trị chưa, theo dõi bao lâu một lần?');
  if (high('tsh') || low('tsh')) ask.push('Kết quả tuyến giáp có cần điều trị hay chỉ theo dõi?');
  if (ask.length < 2) ask.push('Bao lâu tôi nên làm lại các xét nghiệm này?');

  const headline = urgency.level === 'ok' ? urgency.label
    : `${urgency.label}: ${problems.slice(0, 2).map(p => p.title.charAt(0).toLowerCase() + p.title.slice(1)).join('; ')}${problems.length > 2 ? '…' : ''}`;
  const scope = `Đã phân tích ${ids.length}/${totalTests} chỉ số trong ${panels.length} nhóm.`;
  return { urgency, headline, problems, links, reassure, specialties, lifestyle, ask, assess, scope };
}

function num(results, id) { const r = results[id]; return r && Number.isFinite(r.value) && !['empty', 'invalid'].includes(r.state) ? r.value : null; }
