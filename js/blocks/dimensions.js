/**
 * blocks / dimensions
 *
 * 量尺（製圖式尺寸標註）的純計算，不碰 DOM、不改傳入資料。世界座標 y 向上。
 *
 * 量法（kind）：
 *   distance     兩個機構點的直線距離（aligned dimension）
 *   height       一點到水平基準線的垂直距離（地面，或經過某固定點的水平線），上方為正
 *   horizontal   一點到垂直基準線的水平距離（經過某固定點的垂直線），右方為正
 *   displacement 一點相對「歸零姿勢」位置移動了多少：距離、Δ左右、Δ上下
 *
 * 參照（ref）：{pointId} 孔／接點，或 {compId, vertex} 板件的第 vertex 個外形頂點（如夾爪尖端）。
 * 放上去就掃描驅動輸入的全行程：有針筒掃 0..行程（mm）；否則伺服掃自己的起訖角、其餘馬達掃 0–360°。
 *
 * 範圍：D1 只做同一平面的設計模式；組立與跨平面量測尚未支援。
 */
import {plateVertexWorldPoints, plateVertices} from './plate-geometry.js';
import {compileTopology} from '../core/topology.js';
import {sweepTopology} from '../multilink/solver.js';
import {planSyringeStroke, solveSyringe} from './syringe-operations.js';
import {servoRange} from './motor-tools.js';

export const DIMENSION_KINDS = ['distance', 'height', 'horizontal', 'displacement'];
const fin = n => Number.isFinite(n);
const holes = c => [c?.p1, c?.p2, c?.p3].filter(p => p && p.id);
const roleOf = p => p.physicalMotor || p.physical_motor ? '馬達軸心' : p.type === 'fixed' ? '固定孔' : '接點';

// ---------- 候選點 ----------
// 每個孔／接點都是候選；板件的外形頂點（求解孔以外的點）也是，最後一個標為「尖端」（夾爪尖）。
export function dimensionCandidates(comps = [], params = {}, points = {}) {
  const out = [], seen = new Set();
  const at = p => {
    const q = points?.[p.id] || p;
    return fin(q?.x) && fin(q?.y) ? {x: q.x, y: q.y} : null;
  };
  for (const c of comps) for (const p of holes(c)) {
    if (seen.has(p.id)) continue;
    const q = at(p);
    if (!q) continue;
    seen.add(p.id);
    out.push({ref: {pointId: p.id}, label: `${p.id}（${roleOf(p)}）`, short: p.id, kind: 'hole', compId: c.id, ...q});
  }
  for (const c of comps) {
    if (!c || !['triangle', 'bar'].includes(c.type) || !c.p1 || !c.p2) continue;
    const verts = plateVertices(c);
    if (!verts.some(v => !v.solve)) continue;
    const world = plateVertexWorldPoints(c, [c.p1, c.p2, c.p3].map(p => points?.[p?.id] || p));
    // 頂點序與 plateVertexWorldPoints 的輸出對齊：只有求解點座標有限才會輸出。
    if (world.length !== verts.length) continue;
    const shapeIdx = world.map((w, i) => w.solve ? -1 : i).filter(i => i >= 0);
    shapeIdx.forEach((i, n) => {
      const w = world[i], tip = i === world.length - 1;
      out.push({
        ref: {compId: c.id, vertex: i},
        label: tip ? `${c.id} 尖端` : `${c.id} 外形點${n + 1}`,
        short: tip ? `${c.id.slice(-1)}尖` : `角${n + 1}`, kind: tip ? 'tip' : 'vertex', compId: c.id, x: w.x, y: w.y
      });
    });
  }
  return out;
}

export function resolveRef(ref, comps, points = {}) {
  if (!ref) return null;
  if (ref.pointId !== undefined) {
    let p = points?.[ref.pointId];
    if (!p) for (const c of comps) { const h = holes(c).find(q => q.id === ref.pointId); if (h) { p = h; break; } }
    return p && fin(p.x) && fin(p.y) ? {x: p.x, y: p.y} : null;
  }
  const c = comps.find(o => o.id === ref.compId);
  if (!c || !Number.isInteger(ref.vertex) || !c.p1 || !c.p2) return null;
  const w = plateVertexWorldPoints(c, [c.p1, c.p2, c.p3].map(p => points?.[p?.id] || p))[ref.vertex];
  return w && fin(w.x) && fin(w.y) ? {x: w.x, y: w.y} : null;
}

// ---------- 基準線 ----------
const fixedPoints = comps => comps.flatMap(holes).filter(p => p.type === 'fixed');
// 地面：不高於最低固定點的水平線（取最低固定點；板件下緣依零件外形而變，先不採用）。
function groundY(comps, points) {
  const ys = fixedPoints(comps).map(p => (points?.[p.id] || p).y).filter(fin);
  return ys.length ? Math.min(...ys) : null;
}
export function dimensionBaselines(comps = [], points = {}) {
  const out = [], gy = groundY(comps, points);
  if (gy !== null) out.push({id: 'ground', kind: 'h', y: gy, label: '地面'});
  const seen = new Set();
  for (const p of fixedPoints(comps)) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    const q = points?.[p.id] || p;
    if (!fin(q.x) || !fin(q.y)) continue;
    out.push({id: `h:${p.id}`, kind: 'h', y: q.y, label: `經過 ${p.id} 的水平線`});
    out.push({id: `v:${p.id}`, kind: 'v', x: q.x, label: `經過 ${p.id} 的垂直線`});
  }
  return out;
}
function resolveBaseline(id, comps, points, ground) {
  if (id === 'ground') return ground === null ? null : {kind: 'h', y: ground};
  const m = /^([hv]):(.+)$/.exec(id || '');
  const q = m && resolveRef({pointId: m[2]}, comps, points);
  return q ? (m[1] === 'h' ? {kind: 'h', y: q.y} : {kind: 'v', x: q.x}) : null;
}

// ---------- 量測 ----------
// points：目前（或某個輸入值下）的接點位置表 {id:{x,y}}。回傳 value 與畫圖用的量測線 from→to。
export function measureDimension(dim, comps = [], params = {}, points = {}, ground) {
  const a = resolveRef(dim?.a, comps, points);
  if (!a) return {ok: false, message: '找不到量尺的點'};
  if (dim.kind === 'distance') {
    const b = resolveRef(dim.b, comps, points);
    if (!b) return {ok: false, message: '找不到量尺的第二點'};
    return {ok: true, kind: 'distance', value: Math.hypot(b.x - a.x, b.y - a.y), dx: b.x - a.x, dy: b.y - a.y, a, b, from: a, to: b};
  }
  if (dim.kind === 'height' || dim.kind === 'horizontal') {
    const base = resolveBaseline(dim.baseline, comps, points, ground === undefined ? groundY(comps, points) : ground);
    if (!base) return {ok: false, message: '找不到基準線'};
    if (dim.kind === 'height' && base.kind === 'h') {
      return {ok: true, kind: 'height', value: a.y - base.y, a, base, from: {x: a.x, y: base.y}, to: a};
    }
    if (dim.kind === 'horizontal' && base.kind === 'v') {
      return {ok: true, kind: 'horizontal', value: a.x - base.x, a, base, from: {x: base.x, y: a.y}, to: a};
    }
    return {ok: false, message: '基準線方向不符'};
  }
  if (dim.kind === 'displacement') {
    const z = dim.zero;
    if (!z || !fin(z.x) || !fin(z.y)) return {ok: false, message: '尚未歸零'};
    const dx = a.x - z.x, dy = a.y - z.y;
    return {ok: true, kind: 'displacement', value: Math.hypot(dx, dy), dx, dy, a, zero: {x: z.x, y: z.y}, from: {x: z.x, y: z.y}, to: a};
  }
  return {ok: false, message: '不支援的量法'};
}

// ---------- 全行程掃描 ----------
// 輸入：有針筒→針筒伸出量 0..行程（mm）；否則第一顆馬達（伺服只掃自己的起訖角，其餘整圈 0–360°）。
// opts：{motorId（要掃的馬達）, range:{lo,hi}（呼叫端指定該馬達的輸入範圍）, motorAngles（其他馬達的凍結角）, motion（針筒求解的其他輸入）}
export function dimensionRange(dim, comps = [], params = {}, opts = {}) {
  const probe = measureDimension(dim, comps, params, {});
  if (!probe.ok) return {ok: false, message: probe.message};
  const ground = groundY(comps, {});
  const fail = message => ({ok: false, message});
  const samples = [];   // {at, value}
  const syringe = comps.find(c => c.type === 'syringe');
  let input;
  if (syringe) {
    const stroke = Number(syringe.spec?.stroke);
    if (!(stroke > 0) || stroke > 10000) return fail('針筒行程不正確，無法掃描');
    input = {kind: 'syringe', unit: 'mm', from: 0, to: stroke, id: syringe.id};
    const first = solveSyringe(comps, params, null, opts.motion || {});
    if (!first.ok) return fail(first.message || '目前姿勢無法求解');
    const n = Math.min(400, Math.ceil(stroke / 0.5));
    let previous = first.points;
    for (let i = 0; i <= n; i++) {
      const at = stroke * i / n, r = planSyringeStroke(comps, params, syringe.id, at, previous, opts.motion || {});
      if (!r.ok) continue;
      previous = r.points;
      const m = measureDimension(dim, comps, params, r.points, ground);
      if (m.ok) samples.push({at, value: m.value});
    }
  } else {
    const motorIds = [...new Set(comps.flatMap(c => [c, c.p1, c.p2, c.p3]).map(o => o && (o.physicalMotor || o.physical_motor)).filter(Boolean).map(String))].sort();
    if (!motorIds.length) return fail('這個機構沒有動力輸入，只能看目前值');
    const id = opts.motorId && motorIds.includes(String(opts.motorId)) ? String(opts.motorId) : motorIds[0];
    const servo = servoRange(comps, id), linear = comps.some(c => c.type === 'slider' && c.isInput && String(c.physicalMotor || c.physical_motor || '1') === id);
    const range = opts.range && fin(opts.range.lo) && fin(opts.range.hi) ? opts.range : servo;
    const from = range ? range.lo : 0, to = range ? range.hi : 360;
    input = {kind: servo ? 'servo' : linear ? 'linear' : 'motor', unit: linear ? 'mm' : '°', from, to, id};
    let topology;
    try { topology = compileTopology(comps, {params}); } catch (e) { return fail(`無法編譯：${e.message}`); }
    const span = to - from, step = span > 0 ? Math.min(3, span / 40) : 1;
    const frozen = {...(opts.motorAngles || {})};
    delete frozen[id];
    let sweep;
    try {
      sweep = sweepTopology(topology, {...(topology.params || params || {}), motorAngles: frozen, sweepMotor: id}, from, to + step * 1e-6, step);
    } catch (e) { return fail(`無法掃描：${e.message}`); }
    for (const r of sweep.results) {
      if (!r.isValid || !r.points) continue;
      const m = measureDimension(dim, comps, params, r.points, ground);
      if (m.ok) samples.push({at: r.theta, value: m.value});
    }
    input.invalidCount = sweep.results.filter(r => !r.isValid).length;
  }
  if (!samples.length) return fail('全行程都無法求解');
  let lo = samples[0], hi = samples[0];
  for (const s of samples) { if (s.value < lo.value) lo = s; if (s.value > hi.value) hi = s; }
  return {ok: true, input, min: lo.value, max: hi.value, minAt: lo.at, maxAt: hi.at, samples: samples.length,
    partial: input.invalidCount > 0};
}
