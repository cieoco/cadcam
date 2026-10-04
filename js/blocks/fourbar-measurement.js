/** 四連桿入門課的按需量測；以連續組裝分支取樣，不在每個播放影格執行。 */
import { compileTopology } from '../core/topology.js';
import { solveTopology } from '../multilink/solver.js';
import { planMotion, extrapolateSeed } from './motion.js';

export function measureFourbarSwing(comps, params) {
  let lengths = null;
  let inputMode = 'unknown';
  const fail = message => ({ ok: false, message, spanDeg: null, inputMode, outputMode: 'unknown', lengths });
  try {
    if (!Array.isArray(comps) || comps.length !== 5 || !params) return fail('量測適用於本課的 A、B 固定點與 AC、CD、BD 三根連桿。');
    const anchors = comps.filter(c => c?.type === 'anchor');
    const bars = ['Link1', 'Link2', 'Link3'].map(id => comps.find(c => c?.id === id && c.type === 'bar'));
    if (anchors.length !== 2 || bars.some(c => !c)) return fail('請保留本課的三根連桿與兩個固定點，再量測。');
    const [input, coupler, output] = bars;
    if (input.p1?.id !== 'A' || input.p2?.id !== 'C' || coupler.p1?.id !== 'C' || coupler.p2?.id !== 'D'
      || output.p1?.id !== 'B' || output.p2?.id !== 'D' || !input.isInput || coupler.isInput || output.isInput
      || bars.some(c => c.motorCarrier || c.moduleId || c.style === 'piston' || c.motorType === 'mg995')) {
      return fail('目前接法或動力模式已不同於本課；此量測只適用於 AC 整圈旋轉的四連桿。');
    }
    const a = anchors.find(c => c.p1?.id === 'A')?.p1;
    const b = anchors.find(c => c.p1?.id === 'B')?.p1;
    const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
    if (!finitePoint(a) || !finitePoint(b) || a.type !== 'fixed' || b.type !== 'fixed'
      || bars.some(c => !finitePoint(c.p1) || !finitePoint(c.p2))) return fail('固定點或接點資料不完整，請先檢查作品。');
    if (coupler.p1.type !== 'floating' || coupler.p2.type !== 'floating' || output.p2.type !== 'floating'
      || [coupler.p1, coupler.p2, output.p2].some(p => p.physicalMotor || p.physical_motor)) return fail('C、D 需要保持自由接點，不能另加固定或動力。');
    lengths = { ground: Math.hypot(b.x - a.x, b.y - a.y), input: params[input.lenParam], coupler: params[coupler.lenParam], output: params[output.lenParam] };
    if (Object.values(lengths).some(v => !Number.isFinite(v) || v <= 0)) return fail('桿長需要是大於零的有限數值。');
    // 編譯器取得副本：量測不能改寫目前作品或目前播放姿勢。
    const copy = JSON.parse(JSON.stringify(comps));
    const topo = { params: { ...params }, tracePoint: 'D' };
    const compiled = compileTopology(copy, topo, new Set());
    const theta = Number.isFinite(params.theta) ? params.theta : 0;
    const seed = Object.fromEntries(copy.flatMap(c => [c.p1, c.p2].filter(Boolean).map(p => [p.id, { x: p.x, y: p.y }])));
    const start = solveTopology(compiled, { thetaDeg: theta, _prevPoints: seed });
    const valid = s => s && s.isValid !== false && ['A', 'B', 'C', 'D'].every(id => finitePoint(s.points?.[id]));
    if (!valid(start)) return fail('目前角度無法求解，請先復原或調整至可活動的姿勢，再量測。');
    const motion = planMotion(compiled, topo, theta, start.points);
    inputMode = motion.mode;
    const { ground: g, input: r, coupler: l, output: o } = lengths;
    // 嚴格排除死點與部分可達區間；這些情況不把不同裝配分支拼成一個假擺幅。
    if (motion.mode !== 'rotate' || Math.abs(g - r) <= Math.abs(l - o) + 1e-6 || g + r >= l + o - 1e-6) {
      return fail('輸入只有部分可達角度，或會經過死點；本量測暫不報擺幅。請先播放觀察，或恢復本課原始桿長。');
    }
    const angle = pts => Math.atan2(pts.D.y - pts.B.y, pts.D.x - pts.B.x) * 180 / Math.PI;
    const side = pts => Math.sign((pts.B.x - pts.C.x) * (pts.D.y - pts.C.y) - (pts.B.y - pts.C.y) * (pts.D.x - pts.C.x));
    const branch = side(start.points);
    let current = start.points, previous = {}, lastAngle = angle(current), accumulated = 0, low = 0, high = 0;
    for (let k = 1; k <= 720; k++) {
      const sol = solveTopology(compiled, { thetaDeg: theta + k * 0.5, _prevPoints: extrapolateSeed(current, previous) });
      if (!valid(sol) || !branch || side(sol.points) !== branch) return fail('取樣未能保持同一組裝分支，暫不報擺幅；請調整桿長後重試。');
      const nextAngle = angle(sol.points);
      const delta = ((nextAngle - lastAngle + 540) % 360) - 180;
      if (Math.abs(delta) > 30) return fail('接近死點時角度變化過快，取樣不足以可靠量測；請調整桿長後重試。');
      accumulated += delta; low = Math.min(low, accumulated); high = Math.max(high, accumulated);
      previous = current; current = sol.points; lastAngle = nextAngle;
    }
    const rotates = Math.abs(accumulated) > 350;
    const spanDeg = rotates ? 360 : Math.round((high - low) * 10) / 10;
    return { ok: true, message: rotates ? 'BD 是整圈旋轉，並非來回擺動（每圈 360°）。' : `BD 擺幅約 ${spanDeg.toFixed(1)}°（AC 每 0.5° 取樣，同一組裝分支）。`,
      spanDeg, inputMode, outputMode: rotates ? 'rotate' : 'rock', lengths };
  } catch (_) {
    return fail('目前作品無法完成四連桿量測，請檢查接點與桿長後重試。');
  }
}
