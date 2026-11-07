// 數位積木 8 mm 孔格判定（docs/SDD-GRID-BLOCKS.md G1）。跑法：node test/grid-rule.mjs
import assert from 'node:assert/strict';
import { pitchDeviation, latticeEmbedding, gridIssues, gridEdgeMarginMm, gridBarWidthMm } from '../js/blocks/grid-rule.js';

const rot = (pts, deg, dx = 0, dy = 0) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return pts.map(p => ({ x: c * p.x - s * p.y + dx, y: s * p.x + c * p.y + dy })); };
const rules = list => list.map(i => `${i.componentId || i.type}:${i.rule}:${i.subject}`).sort();

// 邊距＝P − t/2；3 mm 合板 → 6.5 mm、棍寬 13 mm（SDD §2）。
assert.equal(gridEdgeMarginMm(3), 6.5); assert.equal(gridBarWidthMm(3), 13); assert.equal(gridBarWidthMm(4), 12);
assert.equal(gridEdgeMarginMm(0), null); assert.equal(gridEdgeMarginMm(NaN), null);

// R1 孔距
assert.ok(pitchDeviation(48).ok); assert.equal(pitchDeviation(48).holes, 7);
const d50 = pitchDeviation(50); assert.equal(d50.ok, false); assert.equal(d50.nearestMm, 48); assert.equal(d50.deviationMm, 2);
assert.ok(pitchDeviation(48.005).ok, 'within tolerance'); assert.equal(pitchDeviation(48.1).ok, false, 'numeric decimals are off-grid');
assert.equal(pitchDeviation(2).nearestMm, 8, 'at least one pitch');

// R2 方格嵌入：與世界軸無關，只看孔與孔的相對位置
const tri = [{ x: 0, y: 0 }, { x: 8, y: 8 }, { x: 16, y: 0 }];
assert.ok(latticeEmbedding(tri).ok);
assert.ok(latticeEmbedding(rot(tri, 37, 5.3, -2.1)).ok, 'rotated + translated lattice triangle');
assert.ok(latticeEmbedding([{ x: 0, y: 0 }, { x: 32, y: 0 }, { x: 32, y: 24 }]).ok, '3-4-5 ×8');
assert.ok(latticeEmbedding(rot([{ x: 0, y: 0 }, { x: 8, y: 16 }, { x: 16, y: 8 }], 12)).ok, 'no side parallel to the lattice axis');
assert.ok(latticeEmbedding([{ x: 0, y: 0 }, { x: 8, y: 8 }]).ok, '8√2 two-hole plate');
const eq = latticeEmbedding([{ x: 0, y: 0 }, { x: 16, y: 0 }, { x: 8, y: 8 * Math.sqrt(3) }]);
assert.equal(eq.ok, false, 'equilateral triangle cannot sit on a square lattice'); assert.ok(eq.maxDeviationMm > 0.5);
const ten = latticeEmbedding([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
assert.equal(ten.ok, false); assert.ok(Math.abs(ten.maxDeviationMm - (8 * Math.SQRT2 - 10)) < 1e-9, 'nearest lattice point is the 8√2 diagonal');

// 作品層級
const P = { L48: 48, L50: 50, G: 16, A: 8 * Math.SQRT2, B: 8 * Math.SQRT2, S1: 24, S2: 32, D: 40, R20: 20, R24: 24, R21: 21 };
const bar = (id, len, extra = {}) => ({ type: 'bar', id, lenParam: len, p1: { id: id + 'a', type: 'floating', x: 0, y: 0 }, p2: { id: id + 'b', type: 'floating', x: P[len], y: 0 }, ...extra });
assert.deepEqual(gridIssues([bar('Ok', 'L48')], P), []);
assert.deepEqual(rules(gridIssues([bar('Off', 'L50')], P)), ['Off:R1:孔距']);

const triangle = (id, g, r1, r2, extra = {}) => ({ type: 'triangle', id, gParam: g, r1Param: r1, r2Param: r2,
  p1: { id: id + '1', type: 'floating', x: 0, y: 0 }, p2: { id: id + '2', type: 'floating', x: 1, y: 0 }, p3: { id: id + '3', type: 'floating', x: 0, y: 1 }, ...extra });
assert.deepEqual(gridIssues([triangle('T', 'G', 'A', 'B')], P), [], 'vertices (0,0) (16,0) (8,8)');
assert.deepEqual(rules(gridIssues([triangle('Eq', 'G', 'G', 'G')], { G: 16 })), ['Eq:R2:頂點孔位']);
// 折線：相鄰段是桿段（R1），三孔仍需在方格點（R2）。24／32 段、40 對角＝直角彎。
const bent = (id, s1, s2, d) => triangle(id, s1, s2, d, { shapeMode: 'polyline', vertices: [{ solve: true, ref: 'p3' }, { solve: true, ref: 'p1' }, { solve: true, ref: 'p2' }] });
assert.deepEqual(gridIssues([bent('Bend', 'S1', 'S2', 'D')], P), []);
assert.deepEqual(rules(gridIssues([bent('BadBend', 'S1', 'R20', 'D')], P)), ['BadBend:R1:折線段', 'BadBend:R2:頂點孔位']);
// 板上額外孔（外形點 hole:true，以 p1→p2 局部座標）
assert.deepEqual(gridIssues([triangle('H', 'G', 'A', 'B', { outlinePoints: [{ u: 8, v: -8, hole: true }] })], P), []);
assert.deepEqual(rules(gridIssues([triangle('H2', 'G', 'A', 'B', { outlinePoints: [{ u: 5, v: -8, hole: true }, { u: 3, v: 3 }] })], P)), ['H2:R2:頂點孔位'], 'only drilled outline points count');

// 圓盤：兩孔板（R2）
assert.deepEqual(gridIssues([bar('Disk', 'R24', { shape: 'disk', diameterMm: 80 })], P), []);
assert.deepEqual(rules(gridIssues([bar('Disk2', 'R20', { shape: 'disk', diameterMm: 80 })], P)), ['Disk2:R2:圓盤孔位']);

// 針筒端點孔：沿桿軸、P 的倍數
const syr = (u, v, owner = 'Ok') => ({ type: 'syringe', id: 'S', a: { componentId: owner, u, v }, b: { componentId: '', u: 0, v: 0 } });
assert.deepEqual(gridIssues([bar('Ok', 'L48'), syr(24, 0)], P), []);
assert.deepEqual(rules(gridIssues([bar('Ok', 'L48'), syr(20, 0)], P)), ['Ok:R1:附加孔']);
assert.deepEqual(rules(gridIssues([bar('Ok', 'L48'), syr(24, 3)], P)), ['Ok:R1:附加孔'], 'off the bar axis');

// 齒輪：中心距與輸出孔（R5）
const gear = (id, r, extra = {}) => ({ type: 'gear', id, radiusParam: r, p1: { id: id + 'c', type: 'fixed', x: 0, y: 0 }, p2: { id: id + 'p', type: 'floating', x: 0, y: 0 }, ...extra });
assert.deepEqual(gridIssues([gear('GA', 'R24'), gear('GB', 'R24', { mesh: 'GA' })], P).filter(i => i.rule === 'R5'), []);
assert.deepEqual(rules(gridIssues([gear('GA', 'R24'), gear('GB', 'R21', { mesh: 'GA' })], P).filter(i => i.rule === 'R5')), ['GB:R5:齒輪中心距']);
assert.deepEqual(rules(gridIssues([gear('GA', 'R24', { pinRadiusParam: 'R20' })], P).filter(i => i.rule === 'R5')), ['GA:R5:齒輪輸出孔']);

// 機架（R3）：以機架自己的方格判定；整組旋轉仍在格上
const frame = (pts, extra = []) => [
  { type: 'bar', id: 'F1', lenParam: 'FL1', p1: { id: 'A', type: 'fixed', ...pts[0] }, p2: { id: 'B', type: 'fixed', ...pts[1] } },
  { type: 'bar', id: 'F2', lenParam: 'FL2', p1: { id: 'C', type: 'fixed', ...pts[2] }, p2: { id: 'Cx', type: 'floating', x: pts[2].x, y: pts[2].y + 48 } }, ...extra];
const FP = { FL1: 48, FL2: 48 };
assert.deepEqual(gridIssues(frame([{ x: 0, y: 0 }, { x: 48, y: 0 }, { x: 24, y: 40 }]), FP).filter(i => i.rule === 'R3'), []);
assert.deepEqual(gridIssues(frame(rot([{ x: 0, y: 0 }, { x: 48, y: 0 }, { x: 24, y: 40 }], 30, 7, 9)), FP).filter(i => i.rule === 'R3'), [], 'rotated frame');
const offFrame = gridIssues(frame([{ x: 0, y: 0 }, { x: 48, y: 0 }, { x: 23, y: 40 }]), FP).filter(i => i.rule === 'R3');
assert.equal(offFrame.length, 1); assert.ok(offFrame[0].deviationMm > 0.5 && offFrame[0].deviationMm <= 1 + 1e-9, 'best fit spreads a 1 mm shift');
// 新增機架孔：u／v 依中心線換算後一併判定
const hole = (u, v) => ({ type: 'anchor', id: 'Extra', p1: { id: 'X', type: 'fixed', x: 0, y: 0 }, frameHole: { a: 'A', b: 'B', u, ...(v === undefined ? {} : { centered: false, v }) } });
assert.deepEqual(gridIssues(frame([{ x: 0, y: 0 }, { x: 48, y: 0 }, { x: 24, y: 40 }], [hole(16, 8)]), FP).filter(i => i.rule === 'R3'), []);
assert.equal(gridIssues(frame([{ x: 0, y: 0 }, { x: 48, y: 0 }, { x: 24, y: 40 }], [hole(20)]), FP).filter(i => i.rule === 'R3').length, 1);

// R6：外購金屬角碼與傾斜轉接座列為例外（需傳入 modules）；筆直的列印轉接座在格上
const mod = (id, orient) => ({ id, base: id + 'b', mount: { to: { module: 'M0' }, orient: { type: 'orthogonal', ...orient } } });
const r6 = gridIssues([], P, { modules: [mod('Pr', { joint: { kind: 'printed' } }), mod('Mt', { joint: { kind: 'bracket-m3' } }), mod('Tl', { joint: { kind: 'printed' }, tiltDeg: 15 }), { id: 'Pl', mount: { to: { module: 'M0' } } }] });
assert.deepEqual(r6.map(i => `${i.moduleId}:${i.rule}:${i.subject}`).sort(), ['Mt:R6:外購金屬角碼', 'Tl:R6:傾斜轉接座']);
assert.equal(r6[0].type, 'frame'); assert.deepEqual(gridIssues([], P), [], 'no modules, no R6');

// 不改作品
const comps = [bar('Off', 'L50'), ...frame([{ x: 0, y: 0 }, { x: 48, y: 0 }, { x: 24, y: 40 }], [hole(16, 8)])];
const before = JSON.stringify(comps); gridIssues(comps, { ...P, ...FP }); assert.equal(JSON.stringify(comps), before);

console.log('PASS grid rule: margin formula, pitch multiples, rotated lattice embedding, bars/bends/plates/disks/syringe holes, gear spacing, frame holes, no mutation');
