// Kiểm tra đầu vào. Không phụ thuộc giao diện — chạy được cả trong trình duyệt và Node (kiểm thử).
//
// Chính sách số liệu (công bố trong mục Hướng dẫn):
// - Dấu "," hoặc "." đều là dấu thập phân. KHÔNG dùng dấu phân cách hàng nghìn.
// - Cho phép tiền tố "<", ">", "≤", "≥" như phiếu xét nghiệm hay ghi (ví dụ "< 0,5").
// - Từ chối: ký tự thừa (5abc), số âm, dạng số mũ (1e3), NaN, Infinity, chuỗi quá dài.
// - Không làm tròn giá trị gốc; chỉ làm tròn khi hiển thị.

export const MAX_LEN = 20;
export const QUAL_VALUES = ['neg', 'trace', '1+', '2+', '3+', 'pos'];

export const QUAL_LABEL = {
  neg: 'Âm tính', trace: 'Vết', '1+': 'Dương tính 1+', '2+': 'Dương tính 2+', '3+': 'Dương tính 3+', pos: 'Dương tính'
};

/**
 * @returns {{state:'empty'}|{state:'invalid', error:string}|{state:'ok', value:number, qualifier:''|'<'|'>', text:string}}
 */
export function parseNumber(raw) {
  if (raw === null || raw === undefined) return { state: 'empty' };
  if (typeof raw !== 'string' && typeof raw !== 'number') return { state: 'invalid', error: 'Dữ liệu không hợp lệ' };
  const s = String(raw).trim().replace(/\s+/g, ' ');
  if (s === '') return { state: 'empty' };
  if (s.length > MAX_LEN) return { state: 'invalid', error: 'Giá trị quá dài' };

  const m = /^([<>≤≥]=?)?\s*([+-])?\s*(\d*)(?:([.,])(\d*))?(.*)$/.exec(s);
  const rest = m ? m[6] : s;
  if (/^[eE][+-]?\d+$/.test(rest)) return { state: 'invalid', error: 'Không nhận dạng số mũ (ví dụ 1e3). Hãy nhập số đầy đủ.' };
  if (/^(nan|infinity|-?infinity)$/i.test(s.replace(/^[+-]/, ''))) return { state: 'invalid', error: 'Giá trị không phải là số' };

  const strict = /^([<>≤≥]=?)?\s*(\+)?(\d+)(?:[.,](\d+))?$/.exec(s);
  if (!strict) {
    if (m && m[2] === '-' && /^\d/.test((m[3] || '') + (m[5] || ''))) return { state: 'invalid', error: 'Kết quả xét nghiệm không thể là số âm' };
    if (/^\d+[.,]\d{3}[.,]\d{3}/.test(s)) return { state: 'invalid', error: 'Không dùng dấu phân cách hàng nghìn' };
    return { state: 'invalid', error: 'Chỉ nhập số, dùng dấu , hoặc . cho phần thập phân' };
  }
  const value = Number(strict[3] + (strict[4] ? '.' + strict[4] : ''));
  if (!Number.isFinite(value)) return { state: 'invalid', error: 'Giá trị không phải là số' };
  const q = strict[1] ? (strict[1][0] === '<' || strict[1][0] === '≤' ? '<' : '>') : '';
  return { state: 'ok', value, qualifier: q, text: s };
}

export function parseQual(raw) {
  if (raw === null || raw === undefined || raw === '') return { state: 'empty' };
  if (typeof raw !== 'string' || !QUAL_VALUES.includes(raw)) return { state: 'invalid', error: 'Giá trị định tính không hợp lệ' };
  return { state: 'ok', value: raw };
}

// Chặn nhập nhầm đơn vị phổ biến. Đây là kiểm tra hợp lệ đầu vào, KHÔNG phải ngưỡng y khoa:
// một giá trị nằm ngoài các mốc này gần như chắc chắn đang dùng đơn vị khác với app.
export const UNIT_GUARD = {
  hgb:   { below: 25,  msg: 'Giá trị giống đơn vị g/dL. App dùng g/L (g/dL × 10).' },
  mchc:  { below: 50,  msg: 'Giá trị giống đơn vị g/dL. App dùng g/L (g/dL × 10).' },
  hct:   { below: 1.5, msg: 'Giá trị giống dạng L/L. App dùng % (L/L × 100).' },
  rbc:   { above: 100, msg: 'Giá trị giống đơn vị /µL. App dùng T/L (×10¹²/L).' },
  wbc:   { above: 500, msg: 'Giá trị giống đơn vị /µL. App dùng G/L (chia 1000).' },
  plt:   { above: 5000, msg: 'Giá trị giống đơn vị /µL. App dùng G/L (chia 1000).' },
  neu:   { above: 40,  msg: 'Giá trị giống tỷ lệ % (NEU%). App cần số lượng tuyệt đối NEU# (G/L).' },
  lym:   { above: 40,  msg: 'Giá trị giống tỷ lệ % (LYM%). App cần số lượng tuyệt đối LYM# (G/L).' },
  eos:   { above: 20,  msg: 'Giá trị giống tỷ lệ % (EOS%). App cần số lượng tuyệt đối EOS# (G/L).' },
  glu:   { above: 50,  msg: 'Giá trị giống đơn vị mg/dL. App dùng mmol/L.' },
  hba1c: { above: 20,  msg: 'Giá trị giống đơn vị mmol/mol (IFCC). App dùng %.' },
  chol:  { above: 20,  msg: 'Giá trị giống đơn vị mg/dL. App dùng mmol/L.' },
  ldl:   { above: 15,  msg: 'Giá trị giống đơn vị mg/dL. App dùng mmol/L.' },
  hdl:   { above: 5,   msg: 'Giá trị giống đơn vị mg/dL. App dùng mmol/L.' },
  tg:    { above: 40,  msg: 'Giá trị giống đơn vị mg/dL. App dùng mmol/L.' },
  crea:  { below: 15,  msg: 'Giá trị giống đơn vị mg/dL. App dùng µmol/L.' },
  uric:  { below: 20,  msg: 'Giá trị giống đơn vị mg/dL. App dùng µmol/L.' },
  ca:    { above: 5,   msg: 'Giá trị giống đơn vị mg/dL. App dùng mmol/L.' },
  alb:   { below: 10,  msg: 'Giá trị giống đơn vị g/dL. App dùng g/L (g/dL × 10).' },
  prot:  { below: 15,  msg: 'Giá trị giống đơn vị g/dL. App dùng g/L (g/dL × 10).' },
  ft4:   { below: 4,   msg: 'Giá trị giống đơn vị ng/dL. App dùng pmol/L.' }
};

export function unitGuard(id, value) {
  const g = UNIT_GUARD[id];
  if (!g) return null;
  if (g.below !== undefined && value > 0 && value < g.below) return g.msg;
  if (g.above !== undefined && value > g.above) return g.msg;
  return null;
}

// Trần hợp lý: lớn hơn mức này coi là nhập sai (thừa chữ số/sai đơn vị).
export function plausibleMax(t) {
  let top = 0;
  if (t.ref) for (const k of Object.keys(t.ref)) { const r = t.ref[k]; top = Math.max(top, r[1] ?? r[0] * 3); }
  if (t.bands) for (const b of t.bands) if (b.lt < 99999) top = Math.max(top, b.lt);
  if (t.critical && t.critical.high) top = Math.max(top, t.critical.high);
  if (t.bands && t.bands[t.bands.length - 1].lt >= 99999) return Infinity;
  return top > 0 ? top * 300 : Infinity;
}

/** Ngưỡng do người dùng nhập từ phiếu. */
export function parseLabRef(lo, hi) {
  const a = parseNumber(lo), b = parseNumber(hi);
  if (a.state === 'invalid') return { state: 'invalid', error: 'Ngưỡng dưới: ' + a.error };
  if (b.state === 'invalid') return { state: 'invalid', error: 'Ngưỡng trên: ' + b.error };
  if (a.state === 'empty' && b.state === 'empty') return { state: 'empty' };
  const L = a.state === 'ok' ? a.value : null, H = b.state === 'ok' ? b.value : null;
  if (L !== null && H !== null && L >= H) return { state: 'invalid', error: 'Ngưỡng dưới phải nhỏ hơn ngưỡng trên' };
  return { state: 'ok', lo: L, hi: H };
}

export function formatNum(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '';
  const r = Math.round(v * 1000) / 1000;
  return String(r).replace('.', ',');
}
