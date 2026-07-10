/**
 * blocks / schema
 *
 * 「機構積木」作品格式的正規化與輕量驗證。這裡只接受 UI 能做得出來的積木語法：
 * anchor、bar、triangle、接點角色、固定長度參數，以及放在連桿端點上的馬達。
 */

const KIND = 'blocks';
const VERSION = 1;
const LEGO_STEP = 8;
const MAX_PLATE_POINTS = 6;
const SAFE_ID = /^[\w.-]+$/u;
const SAFE_COLOR = /^#[0-9a-fA-F]{6}$/;
const POINT_TYPES = new Set(['floating', 'fixed', 'motor', 'linear']);

const clone = value => JSON.parse(JSON.stringify(value));
const snapLego = value => Math.max(LEGO_STEP, Math.round((Number(value) || 0) / LEGO_STEP) * LEGO_STEP);
const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const roundMm = (value, fallback = 0) => Math.round(num(value, fallback));
const roundTenth = (value, fallback = 0) => Number(num(value, fallback).toFixed(1));
const safeId = value => typeof value === 'string' && SAFE_ID.test(value);
const uniqueSafeIds = values => Array.from(new Set((values || []).filter(safeId)));

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
  if (Number(point.solveSign) === -1) out.solveSign = -1;
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
  if (comp.snapLength === false) out.snapLength = false;

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
  if (Array.isArray(comp.holes)) {
    const holes = comp.holes
      .filter(h => h && safeId(h.id))
      .map((h, hIndex) => {
        const distParam = safeId(h.distParam) ? h.distParam : `${lenParam}_H${hIndex + 1}`;
        if (params[distParam] === undefined) params[distParam] = Math.max(0, Math.round(num(h.dist, 0)));
        return { id: h.id, distParam };
      });
    if (holes.length) out.holes = holes;
  }

  const rawLen = params[lenParam] ?? Math.hypot(p2.x - p1.x, p2.y - p1.y);
  params[lenParam] = out.snapLength === false
    ? roundTenth(rawLen)
    : (out.fixedLen ? snapLego(rawLen) : Math.round(num(rawLen, 0)));
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
  const inferredJaw = comp.shape === 'jaw' || /(^|[-_])(?:left|right)?jaw/i.test(id);
  if (inferredJaw) {
    out.shape = 'jaw';
    out.shapeMode = 'polyline';
    if (Number(comp.jawTurnSign) < 0) out.jawTurnSign = -1;
    else if (Number(comp.jawTurnSign) > 0) out.jawTurnSign = 1;
    else if (/leftjaw/i.test(id)) out.jawTurnSign = -1;
    else if (/rightjaw/i.test(id)) out.jawTurnSign = 1;
  } else if (comp.shapeMode === 'polyline' || comp.shapeMode === 'hull' || comp.shapeMode === 'polygon') {
    out.shapeMode = comp.shapeMode;
  }
  // 有順序的頂點清單：solve 頂點用 ref 指向 p1/p2/p3；shape 頂點存局部 u,v(,hole)。
  // 新檔直接帶 vertices；舊檔（只有 outlinePoints）合成成「求解點在前、造形點在後」。
  const refExists = { p1: !!(p1 && p1.id), p2: !!(p2 && p2.id), p3: !!(p3 && p3.id) };
  const pushShape = (list, p, i) => {
    const u = num(p && p.u, NaN);
    const v = num(p && p.v, NaN);
    if (!Number.isFinite(u) || !Number.isFinite(v)) {
      warnings.push(`三點桿 ${id} 的造形頂點 ${i + 1} 格式錯誤，已略過`);
      return;
    }
    const pt = { solve: false, u: roundTenth(u), v: roundTenth(v) };
    if (p && p.hole === true) pt.hole = true;
    list.push(pt);
  };
  const vertices = [];
  if (Array.isArray(comp.vertices) && comp.vertices.length) {
    comp.vertices.slice(0, MAX_PLATE_POINTS).forEach((vt, i) => {
      if (vt && vt.solve) {
        const ref = vt.ref;
        if ((ref === 'p1' || ref === 'p2' || ref === 'p3') && refExists[ref]
          && !vertices.some(x => x.solve && x.ref === ref)) {
          vertices.push({ solve: true, ref });
        } else {
          warnings.push(`三點桿 ${id} 的求解頂點 ${i + 1} 無效，已略過`);
        }
      } else {
        pushShape(vertices, vt, i);
      }
    });
  } else {
    if (refExists.p1) vertices.push({ solve: true, ref: 'p1' });
    if (refExists.p2) vertices.push({ solve: true, ref: 'p2' });
    if (refExists.p3) vertices.push({ solve: true, ref: 'p3' });
    const extraLimit = Math.max(0, MAX_PLATE_POINTS - vertices.length);
    (Array.isArray(comp.outlinePoints) ? comp.outlinePoints : [])
      .slice(0, extraLimit)
      .forEach((p, i) => pushShape(vertices, p, i));
  }
  if (!vertices.some(v => v.solve) && refExists.p1) vertices.unshift({ solve: true, ref: 'p1' });
  out.vertices = vertices;
  if (comp.visualOnly) out.visualOnly = true;
  if (comp.snapLength === false) out.snapLength = false;

  const normalizeLen = out.snapLength === false
    ? value => roundTenth(value)
    : value => Math.round(num(value, 0));
  params[gParam] = normalizeLen(params[gParam] ?? Math.hypot(p2.x - p1.x, p2.y - p1.y));
  params[r1Param] = normalizeLen(params[r1Param] ?? Math.hypot(p3.x - p1.x, p3.y - p1.y));
  params[r2Param] = normalizeLen(params[r2Param] ?? Math.hypot(p3.x - p2.x, p3.y - p2.y));
  return out;
}

function normalizeSlider(comp, index, params, warnings) {
  const id = safeId(comp.id) ? comp.id : `Slider${index + 1}`;
  const p1 = normalizePoint(comp.p1, `S${index + 1}a`, warnings);
  const p2 = normalizePoint(comp.p2, `S${index + 1}b`, warnings);
  const p3 = normalizePoint(comp.p3, `S${index + 1}c`, warnings);
  const m1Seed = comp.m1 || (comp.p1 ? { type: 'fixed', x: comp.p1.x, y: comp.p1.y } : null);
  const m2Seed = comp.m2 || (comp.p2 ? { type: 'fixed', x: comp.p2.x, y: comp.p2.y } : null);
  const m1 = normalizePoint(m1Seed, `S${index + 1}m1`, warnings);
  const m2 = normalizePoint(m2Seed, `S${index + 1}m2`, warnings);
  p1.type = 'fixed';   // 軌道兩端釘地
  p2.type = 'fixed';
  p3.type = 'floating'; // 滑塊點沿軌道滑動（活塞模式由 input_linear 推算，型別仍非 fixed）
  m1.type = 'fixed';   // 承載桿件兩端固定孔
  m2.type = 'fixed';
  const lenParam = safeId(comp.lenParam) ? comp.lenParam : `SL${index + 1}`;
  const rawLen = Math.max(1, roundMm(params[lenParam] ?? Math.hypot(p2.x - p1.x, p2.y - p1.y), 1));
  const carriageLen = Math.max(1, Math.min(rawLen, roundMm(comp.carriageLen, 32)));
  const carrierLen = Math.max(rawLen, Math.min(1000, roundMm(comp.carrierLen ?? comp.trackLen ?? rawLen, rawLen)));
  const axisDx = p2.x - p1.x;
  const axisDy = p2.y - p1.y;
  const axisLen = Math.hypot(axisDx, axisDy) || 1;
  const ux = axisDx / axisLen;
  const uy = axisDy / axisLen;
  const maxOffset = Math.max(0, carrierLen - rawLen);
  let railOffset = Math.max(0, Math.min(maxOffset, roundMm(comp.railOffset, 0)));
  if (!comp.m1 && !comp.m2 && comp.railOffset === undefined && carrierLen > rawLen) {
    railOffset = Math.round(maxOffset / 2);
  }
  if (comp.m1 && comp.m2 && comp.railOffset === undefined) {
    railOffset = Math.max(0, Math.min(maxOffset, roundMm((p1.x - m1.x) * ux + (p1.y - m1.y) * uy, 0)));
  }
  m1.x = p1.x - ux * railOffset;
  m1.y = p1.y - uy * railOffset;
  m2.x = m1.x + ux * carrierLen;
  m2.y = m1.y + uy * carrierLen;
  const travelStart = Math.max(0, Math.min(rawLen, roundMm(comp.travelStart ?? comp.strokeMin, 0)));
  const travelEnd = Math.max(travelStart, Math.min(rawLen, roundMm(comp.travelEnd ?? comp.strokeMax, rawLen)));
  const out = {
    type: 'slider',
    id,
    color: SAFE_COLOR.test(comp.color || '') ? comp.color : '#16a085',
    p1,
    p2,
    p3,
    m1,
    m2,
    lenParam,
    baseEnd: comp.baseEnd === 'p2' ? 'p2' : 'p1',
    carriageLen,
    carrierLen,
    railOffset,
    travelStart,
    travelEnd,
    sign: Number(comp.sign) < 0 ? -1 : 1
  };
  // 線性致動器（活塞）模式：滑塊點本身被直線位移驅動
  if (comp.isInput || comp.physicalMotor || p3.physicalMotor) {
    out.isInput = true;
    out.physicalMotor = String(comp.physicalMotor || p3.physicalMotor || '1');
  }
  // 軌道長度參數（保留；被動時驅動桿長由 compile 自動找，這裡僅記錄軌道兩端距離）
  params[lenParam] = rawLen;
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
  const tracePoints = uniqueSafeIds([...(topo?.tracePoints || []), ...(safeId(topo?.tracePoint) ? [topo.tracePoint] : [])]);
  if (tracePoints.length === 1) snapshot.tracePoint = tracePoints[0]; // 舊欄位相容：單點檔案仍好讀。
  if (tracePoints.length) snapshot.tracePoints = tracePoints;
  return snapshot;
}

// 齒輪：p1 = 中心（fixed/motor，驅動輪在中心放馬達）、p2 = 腹板內側輸出銷（floating，由 solver 解出）。
// radiusParam = 節圓半徑;pinRadiusParam = 輸出銷半徑;teeth/module 供齒形繪製;mesh = 嚙合對象。
function normalizeGear(comp, index, params, warnings) {
  const id = safeId(comp.id) ? comp.id : `Gear${index + 1}`;
  const p1 = normalizePoint(comp.p1, `GC${index + 1}`, warnings);
  const p2 = normalizePoint(comp.p2, `GP${index + 1}`, warnings);
  const radiusParam = safeId(comp.radiusParam) ? comp.radiusParam : `GR${index + 1}`;
  const pinRadiusParam = safeId(comp.pinRadiusParam) ? comp.pinRadiusParam : '';
  const teeth = Math.max(6, Math.round(num(comp.teeth, 12)));
  const rawR = params[radiusParam] ?? Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const R = Math.max(1, Math.round(num(rawR, 40)));
  params[radiusParam] = R;
  if (pinRadiusParam) {
    params[pinRadiusParam] = Math.max(1, Math.round(num(params[pinRadiusParam] ?? comp.pinRadius, R * 0.6)));
  }
  // 模數沒給就從節圓半徑反推（R = teeth·module/2 → module = 2R/teeth），讓齒形大小自洽。
  const module = num(comp.module, 0) > 0
    ? Math.max(1, num(comp.module, 6))
    : Math.max(1, Number((2 * R / teeth).toFixed(2)));
  const out = {
    type: 'gear',
    id,
    color: SAFE_COLOR.test(comp.color || '') ? comp.color : '#b0772e',
    p1,
    p2,
    radiusParam,
    teeth,
    module,
    phase: num(comp.phase, 0)
  };
  if (pinRadiusParam) out.pinRadiusParam = pinRadiusParam;
  else if (Number.isFinite(Number(comp.pinRadius))) out.pinRadius = Math.max(1, Math.round(num(comp.pinRadius, R * 0.6)));
  if (Number.isFinite(Number(comp.pinHoleDiameter))) out.pinHoleDiameter = Math.max(1, Math.min(30, roundTenth(comp.pinHoleDiameter, 5)));
  if (safeId(comp.mesh)) out.mesh = comp.mesh;
  if (comp.physicalMotor) out.physicalMotor = String(comp.physicalMotor);
  if (comp.zlift) out.zlift = Math.max(-4, Math.min(4, Math.round(num(comp.zlift, 0))));
  return out;
}

// 齒條：與小齒輪嚙合的直線齒桿。p1 = 齒桿參考/輸出點（floating，沿 axisDeg 方向平移，由 solver 解出）。
// pinion = 嚙合的小齒輪 id（提供節圓半徑 R 與馬達）；位移 s = R·θ（純滾動）。lenParam = 齒桿長度（視覺/行程）。
function normalizeRack(comp, index, params, warnings) {
  const id = safeId(comp.id) ? comp.id : `Rack${index + 1}`;
  const p1 = normalizePoint(comp.p1, `RK${index + 1}`, warnings);
  const lenParam = safeId(comp.lenParam) ? comp.lenParam : `RKL${index + 1}`;
  const out = {
    type: 'rack',
    id,
    color: SAFE_COLOR.test(comp.color || '') ? comp.color : '#16a085',
    p1,
    lenParam,
    axisDeg: Math.round(num(comp.axisDeg, 0)),
    sign: Number(comp.sign) < 0 ? -1 : 1
  };
  if (safeId(comp.pinion)) out.pinion = comp.pinion;
  params[lenParam] = Math.max(1, Math.round(num(params[lenParam] ?? comp.len, 160)));
  if (Number.isFinite(Number(comp.bodyHeight))) out.bodyHeight = Math.max(4, roundTenth(comp.bodyHeight, 20));
  const normalizeSlot = (slot) => ({
    length: Math.max(1, roundMm(slot.length, Math.max(24, params[lenParam] - 32))),
    width: Math.max(1, roundTenth(slot.width, 5)),
    offset: roundTenth(slot.offset, 0)
  });
  if (comp.slot && typeof comp.slot === 'object') {
    out.slot = normalizeSlot(comp.slot);
  } else if (comp.slot === true || comp.rackHoleType === 'slot') {
    out.slot = normalizeSlot({ length: comp.rackSlotL || Math.max(24, params[lenParam] - 32), width: comp.holeD || 5, offset: 0 });
  } else if (comp.guide && typeof comp.guide === 'object') {
    // 舊的「外掛導軌」資料視為齒條本體內的導軌長槽，避免範例多出不合理的獨立桿件。
    out.slot = normalizeSlot({ length: comp.guide.length, width: comp.guide.slotWidth || 5, offset: comp.guide.offset || 0 });
  } else if (comp.guide === true) {
    out.slot = normalizeSlot({});
  }
  const framePins = uniqueSafeIds(comp.framePins);
  if (framePins.length) out.framePins = framePins;
  if (comp.zlift) out.zlift = Math.max(-4, Math.min(4, Math.round(num(comp.zlift, 0))));
  return out;
}

// 凸輪：p1 = 凸輪軸心（fixed/motor），p2 = 直動從動件輸出點。
// 從動件沿 axisDeg 方向位移：offset = baseRadius + liftProfile(theta)。
function normalizeCam(comp, index, params, warnings) {
  const id = safeId(comp.id) ? comp.id : `Cam${index + 1}`;
  const p1 = normalizePoint(comp.p1, `CC${index + 1}`, warnings);
  const p2 = normalizePoint(comp.p2, `CF${index + 1}`, warnings);
  const baseRadiusParam = safeId(comp.baseRadiusParam) ? comp.baseRadiusParam : `CBR${index + 1}`;
  const liftParam = safeId(comp.liftParam) ? comp.liftParam : `CLF${index + 1}`;
  const profile = comp.profile === 'constant' ? 'constant' : 'harmonic';
  params[baseRadiusParam] = Math.max(1, Math.round(num(params[baseRadiusParam] ?? comp.baseRadius, 24)));
  params[liftParam] = Math.max(0, Math.round(num(params[liftParam] ?? comp.lift, 24)));
  const out = {
    type: 'cam',
    id,
    color: SAFE_COLOR.test(comp.color || '') ? comp.color : '#9b59b6',
    p1,
    p2,
    baseRadiusParam,
    liftParam,
    axisDeg: Math.round(num(comp.axisDeg, 90)),
    profile,
    phase: num(comp.phase, 0),
    rollerRadius: Math.max(0, roundTenth(comp.rollerRadius ?? 6, 6))
  };
  if (comp.zlift) out.zlift = Math.max(-4, Math.min(4, Math.round(num(comp.zlift, 0))));
  return out;
}

// 皮帶輪：p1 = 輪軸中心（fixed/motor），p2 = 輪緣輸出銷（floating，由 solver 解出）。
// radiusParam = 節圓半徑；belt 零件會用 pulley id 建立開口皮帶傳動。
function normalizePulley(comp, index, params, warnings) {
  const id = safeId(comp.id) ? comp.id : `Pulley${index + 1}`;
  const p1 = normalizePoint(comp.p1, `PLC${index + 1}`, warnings);
  const p2 = normalizePoint(comp.p2, `PLP${index + 1}`, warnings);
  const radiusParam = safeId(comp.radiusParam) ? comp.radiusParam : `PLR${index + 1}`;
  const rawR = params[radiusParam] ?? Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const R = Math.max(1, Math.round(num(rawR, 32)));
  params[radiusParam] = R;
  const pinRadiusParam = safeId(comp.pinRadiusParam) ? comp.pinRadiusParam : '';
  if (pinRadiusParam) {
    params[pinRadiusParam] = Math.max(1, Math.round(num(params[pinRadiusParam] ?? comp.pinRadius, R * 0.65)));
  }
  const out = {
    type: 'pulley',
    id,
    color: SAFE_COLOR.test(comp.color || '') ? comp.color : '#d35400',
    p1,
    p2,
    radiusParam,
    phase: num(comp.phase, 0)
  };
  if (pinRadiusParam) out.pinRadiusParam = pinRadiusParam;
  else if (Number.isFinite(Number(comp.pinRadius))) out.pinRadius = Math.max(1, Math.round(num(comp.pinRadius, R * 0.65)));
  if (comp.physicalMotor) out.physicalMotor = String(comp.physicalMotor);
  if (comp.zlift) out.zlift = Math.max(-4, Math.min(4, Math.round(num(comp.zlift, 0))));
  return out;
}

// 開口皮帶：driver/driven 連兩個 pulley id。第一版只做 open belt（同向），crossed 保留給後續。
function normalizeBelt(comp, index, params, warnings) {
  const id = safeId(comp.id) ? comp.id : `Belt${index + 1}`;
  const out = {
    type: 'belt',
    id,
    color: SAFE_COLOR.test(comp.color || '') ? comp.color : '#2c3e50',
    driver: safeId(comp.driver) ? comp.driver : '',
    driven: safeId(comp.driven) ? comp.driven : '',
    crossed: false
  };
  if (!out.driver || !out.driven || out.driver === out.driven) {
    warnings.push(`皮帶 ${id} 需要兩個不同的 pulley id。`);
  }
  if (comp.zlift) out.zlift = Math.max(-4, Math.min(4, Math.round(num(comp.zlift, 0))));
  return out;
}

export function normalizeSnapshot(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const sourceComps = Array.isArray(obj.comps) ? obj.comps : null;
  if (!sourceComps) return null;

  const warnings = [];
  const params = (obj.params && typeof obj.params === 'object' && !Array.isArray(obj.params)) ? clone(obj.params) : {};
  const tracePoint = safeId(obj.tracePoint) ? obj.tracePoint : '';
  const tracePoints = uniqueSafeIds([...(Array.isArray(obj.tracePoints) ? obj.tracePoints : []), ...(tracePoint ? [tracePoint] : [])]);
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
    else if (raw.type === 'gear') comps.push(normalizeGear(raw, index, params, warnings));
    else if (raw.type === 'rack') comps.push(normalizeRack(raw, index, params, warnings));
    else if (raw.type === 'cam') comps.push(normalizeCam(raw, index, params, warnings));
    else if (raw.type === 'pulley') comps.push(normalizePulley(raw, index, params, warnings));
    else if (raw.type === 'belt') comps.push(normalizeBelt(raw, index, params, warnings));
    else warnings.push(`不支援的零件 ${raw.type || '(unknown)'}，已略過。`);
  });

  const cleanComps = dropZeroBars(comps);
  const counter = Math.max(Number(obj.counter) || 0, highestIdNum(cleanComps));
  return { comps: cleanComps, params, counter, tracePoint, tracePoints, warnings };
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
    ['p1', 'p2', 'p3', 'm1', 'm2'].forEach(k => { if (c[k]) scan(c[k].id); });
  });
  return max;
}
