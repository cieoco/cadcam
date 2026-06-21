/**
 * blocks / schema
 *
 * 「機構積木」作品格式的正規化與輕量驗證。這裡只接受 UI 能做得出來的積木語法：
 * anchor、bar、triangle、接點角色、固定長度參數，以及放在連桿端點上的馬達。
 */

const KIND = 'blocks';
const VERSION = 1;
const LEGO_STEP = 8;
const SAFE_ID = /^[\w.-]+$/u;
const SAFE_COLOR = /^#[0-9a-fA-F]{6}$/;
const POINT_TYPES = new Set(['floating', 'fixed', 'motor', 'linear']);

const clone = value => JSON.parse(JSON.stringify(value));
const snapLego = value => Math.max(LEGO_STEP, Math.round((Number(value) || 0) / LEGO_STEP) * LEGO_STEP);
const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const safeId = value => typeof value === 'string' && SAFE_ID.test(value);

function normalizePoint(point, fallbackId, warnings) {
  if (!point || typeof point !== 'object') {
    warnings.push(`接點 ${fallbackId} 格式不正確，已用自由接點補上。`);
    return { id: fallbackId, type: 'floating', x: 0, y: 0 };
  }
  const id = safeId(point.id) ? point.id : fallbackId;
  if (id !== point.id) warnings.push(`接點 id 不安全或遺失，已改成 ${id}。`);
  const type = POINT_TYPES.has(point.type) ? point.type : 'floating';
  const out = {
    id,
    type,
    x: num(point.x, 0),
    y: num(point.y, 0)
  };
  if (point.physicalMotor) out.physicalMotor = String(point.physicalMotor);
  return out;
}

function normalizeAnchor(comp, index, warnings) {
  const id = safeId(comp.id) ? comp.id : `Anchor${index + 1}`;
  const p1 = normalizePoint(comp.p1, `A${index + 1}`, warnings);
  p1.type = 'fixed';
  return { type: 'anchor', id, p1 };
}

function normalizeBar(comp, index, params, warnings) {
  const id = safeId(comp.id) ? comp.id : `Link${index + 1}`;
  const p1 = normalizePoint(comp.p1, `P${index + 1}a`, warnings);
  const p2 = normalizePoint(comp.p2, `P${index + 1}b`, warnings);
  const lenParam = safeId(comp.lenParam) ? comp.lenParam : `LL${index + 1}`;
  const out = {
    type: 'bar',
    id,
    color: SAFE_COLOR.test(comp.color || '') ? comp.color : '#3498db',
    p1,
    p2,
    lenParam,
    isInput: Boolean(comp.isInput),
    fixedLen: comp.fixedLen !== false
  };

  if (comp.phaseOffset !== undefined) out.phaseOffset = num(comp.phaseOffset, 0);
  if (comp.physicalMotor) out.physicalMotor = String(comp.physicalMotor);
  if (comp.isInput || comp.physicalMotor || p1.physicalMotor || p2.physicalMotor) {
    out.isInput = true;
    out.physicalMotor = String(comp.physicalMotor || p1.physicalMotor || p2.physicalMotor || '1');
    // 動力來源型號：TT 馬達（整圈轉）或 MG995 伺服（角度範圍內來回擺）。
    out.motorType = comp.motorType === 'mg995' ? 'mg995' : 'tt';
    if (out.motorType === 'mg995') {
      // 伺服來回擺的兩端角度（與 play 的 theta 同座標系），clamp 0..360。
      const clampAng = v => Math.max(0, Math.min(360, Math.round(num(v, 0))));
      out.servoStart = clampAng(comp.servoStart ?? 0);
      out.servoEnd = clampAng(comp.servoEnd ?? 90);
    }
  }
  if (comp.zlift) out.zlift = Math.max(-4, Math.min(4, Math.round(num(comp.zlift, 0)))); // 手動疊放相對位移

  const rawLen = params[lenParam] ?? Math.hypot(p2.x - p1.x, p2.y - p1.y);
  params[lenParam] = out.fixedLen ? snapLego(rawLen) : Math.round(num(rawLen, 0));
  return out;
}

function normalizeTriangle(comp, index, params, warnings) {
  const id = safeId(comp.id) ? comp.id : `Tri${index + 1}`;
  const p1 = normalizePoint(comp.p1, `T${index + 1}a`, warnings);
  const p2 = normalizePoint(comp.p2, `T${index + 1}b`, warnings);
  const p3 = normalizePoint(comp.p3, `T${index + 1}c`, warnings);
  const gParam = safeId(comp.gParam) ? comp.gParam : `TG${index + 1}`;
  const r1Param = safeId(comp.r1Param) ? comp.r1Param : `TR1_${index + 1}`;
  const r2Param = safeId(comp.r2Param) ? comp.r2Param : `TR2_${index + 1}`;
  const out = {
    type: 'triangle',
    id,
    color: SAFE_COLOR.test(comp.color || '') ? comp.color : '#27ae60',
    p1,
    p2,
    p3,
    gParam,
    r1Param,
    r2Param,
    sign: Number(comp.sign) < 0 ? -1 : 1
  };
  if (comp.zlift) out.zlift = Math.max(-4, Math.min(4, Math.round(num(comp.zlift, 0)))); // 手動疊放相對位移

  params[gParam] = Math.round(num(params[gParam] ?? Math.hypot(p2.x - p1.x, p2.y - p1.y), 0));
  params[r1Param] = Math.round(num(params[r1Param] ?? Math.hypot(p3.x - p1.x, p3.y - p1.y), 0));
  params[r2Param] = Math.round(num(params[r2Param] ?? Math.hypot(p3.x - p2.x, p3.y - p2.y), 0));
  return out;
}

function normalizeSlider(comp, index, params, warnings) {
  const id = safeId(comp.id) ? comp.id : `Slider${index + 1}`;
  const p1 = normalizePoint(comp.p1, `S${index + 1}a`, warnings);
  const p2 = normalizePoint(comp.p2, `S${index + 1}b`, warnings);
  const p3 = normalizePoint(comp.p3, `S${index + 1}c`, warnings);
  p1.type = 'fixed';   // 軌道兩端釘地
  p2.type = 'fixed';
  p3.type = 'floating'; // 滑塊點沿軌道滑動（活塞模式由 input_linear 推算，型別仍非 fixed）
  const lenParam = safeId(comp.lenParam) ? comp.lenParam : `SL${index + 1}`;
  const out = {
    type: 'slider',
    id,
    color: SAFE_COLOR.test(comp.color || '') ? comp.color : '#16a085',
    p1,
    p2,
    p3,
    lenParam,
    sign: Number(comp.sign) < 0 ? -1 : 1
  };
  // 線性致動器（活塞）模式：滑塊點本身被直線位移驅動
  if (comp.isInput || comp.physicalMotor || p3.physicalMotor) {
    out.isInput = true;
    out.physicalMotor = String(comp.physicalMotor || p3.physicalMotor || '1');
    const clampMm = v => Math.max(-400, Math.min(400, Math.round(num(v, 0))));
    out.strokeMin = clampMm(comp.strokeMin ?? 0);
    out.strokeMax = clampMm(comp.strokeMax ?? 64);
  }
  // 軌道長度參數（保留；被動時驅動桿長由 compile 自動找，這裡僅記錄軌道兩端距離）
  const rawLen = params[lenParam] ?? Math.hypot(p2.x - p1.x, p2.y - p1.y);
  params[lenParam] = Math.round(num(rawLen, 0));
  return out;
}

function dropZeroBars(comps) {
  return comps.filter(comp => !(comp.type === 'bar' && comp.p1 && comp.p2 && comp.p1.id === comp.p2.id));
}

export function toSnapshot(comps, topo, counter) {
  const snapshot = {
    kind: KIND,
    v: VERSION,
    counter: Number(counter) || 0,
    comps: clone(comps || []),
    params: clone((topo && topo.params) ? topo.params : {})
  };
  if (topo && safeId(topo.tracePoint)) snapshot.tracePoint = topo.tracePoint;
  return snapshot;
}

export function normalizeSnapshot(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const sourceComps = Array.isArray(obj.comps) ? obj.comps : null;
  if (!sourceComps) return null;

  const warnings = [];
  const params = (obj.params && typeof obj.params === 'object' && !Array.isArray(obj.params)) ? clone(obj.params) : {};
  const tracePoint = safeId(obj.tracePoint) ? obj.tracePoint : '';
  const comps = [];

  sourceComps.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      warnings.push(`第 ${index + 1} 個零件格式不正確，已略過。`);
      return;
    }
    if (raw.type === 'anchor') comps.push(normalizeAnchor(raw, index, warnings));
    else if (raw.type === 'bar') comps.push(normalizeBar(raw, index, params, warnings));
    else if (raw.type === 'triangle') comps.push(normalizeTriangle(raw, index, params, warnings));
    else if (raw.type === 'slider') comps.push(normalizeSlider(raw, index, params, warnings));
    else warnings.push(`不支援的零件 ${raw.type || '(unknown)'}，已略過。`);
  });

  const cleanComps = dropZeroBars(comps);
  const counter = Math.max(Number(obj.counter) || 0, highestIdNum(cleanComps));
  return { comps: cleanComps, params, counter, tracePoint, warnings };
}

export function highestIdNum(comps) {
  let max = 0;
  const scan = (s) => {
    if (typeof s !== 'string') return;
    const matches = s.match(/(\d+)/g);
    if (matches) matches.forEach(n => { const v = Number(n); if (v > max) max = v; });
  };
  (comps || []).forEach(c => {
    scan(c.id);
    ['p1', 'p2', 'p3'].forEach(k => { if (c[k]) scan(c[k].id); });
  });
  return max;
}
