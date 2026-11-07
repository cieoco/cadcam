import { check, report } from './_harness.mjs';
import { frameAngleCandidates, snapFrameAngle, snapFrameHole } from '../js/blocks/frame-grid.js';
import { planFrameGroundChange } from '../js/blocks/frame-ground.js';
import { projectedDimension } from '../js/blocks/dimension-handle.js';

const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const rot = (p, deg) => { const t = deg * Math.PI / 180; return { x: p.x * Math.cos(t) - p.y * Math.sin(t), y: p.x * Math.sin(t) + p.y * Math.cos(t) }; };

// (a) 方向吸附
const c40 = frameAngleCandidates(40);
check('L=40 候選含 0/90/-90/180', [0, 90, -90, 180].every(a => c40.some(c => near(c, a))));
check('L=40 候選含 (4,3)、(3,4)', c40.some(c => near(c, 36.8699, 1e-3)) && c40.some(c => near(c, 53.1301, 1e-3)));
check('L=40 拖到 40° 取 36.87°', near(snapFrameAngle(40, 40), 36.8699, 1e-3));
check('L=40 拖到 50° 取 53.13°', near(snapFrameAngle(40, 50), 53.1301, 1e-3));
check('L=40 拖到 -170° 取 -180°（與拖曳角連續）', near(snapFrameAngle(40, -170), -180));
check('L=40 全象限：拖到 -40° 取 -36.87°', near(snapFrameAngle(40, -40), -36.8699, 1e-3));
check('L=100 無候選回傳 null（維持整度）', frameAngleCandidates(100).length === 0 && snapFrameAngle(100, 33.3) === null);
check('L=8 只有四個軸向', frameAngleCandidates(8).length === 4);

// projectedDimension 的 quantize
check('quantize 取代預設取整並夾在範圍內', projectedDimension(0, { x: 13, y: 0 }, { x: 1, y: 0 }, { min: 0, max: 100, quantize: v => Math.round(v / 8) * 8 + 1000 }) === 100
  && projectedDimension(0, { x: 13, y: 0 }, { x: 1, y: 0 }, { quantize: v => Math.round(v / 8) * 8 }) === 16
  && projectedDimension(0, { x: 13.4, y: 0 }, { x: 1, y: 0 }, { quantize: () => null }) === 13);

// (b) 新增孔方格吸附
const worldFrame = [{ x: 0, y: 0 }, { x: 88, y: 48 }];
const axisW = { a: worldFrame[0], u: { x: 88 / Math.hypot(88, 48), y: 48 / Math.hypot(88, 48) } };
const plane = snapFrameHole(worldFrame, axisW, 41, 5, false);
const wp = { x: plane.u * axisW.u.x - plane.v * axisW.u.y, y: plane.u * axisW.u.y + plane.v * axisW.u.x };
check('世界對齊機架（軸 (0,0)-(88,48)）：平面模式落在 8 mm 世界格', near(wp.x / 8, Math.round(wp.x / 8)) && near(wp.y / 8, Math.round(wp.y / 8)));
const alignedAxis = { a: { x: 0, y: 0 }, u: { x: 1, y: 0 } };
const alignedPts = [{ x: 0, y: 0 }, { x: 40, y: 0 }];
const s1 = snapFrameHole(alignedPts, alignedAxis, 13.2, 11, false);
check('世界對齊機架：(13.2,11) → (16,8)', near(s1.u, 16) && near(s1.v, 8));
const lat = [{ x: 0, y: 0 }, rot({ x: 40, y: 0 }, 30), rot({ x: 0, y: 24 }, 30)];
const axisR = { a: lat[0], u: { x: Math.cos(Math.PI / 6), y: Math.sin(Math.PI / 6) } };
const s2 = snapFrameHole(lat, axisR, 15, 9, false);
check('旋轉格機架：(15,9) → (16,8) 於機架軸座標', near(s2.u, 16) && near(s2.v, 8));
const offGrid = [{ x: 0, y: 0 }, { x: 40.5, y: 0 }];
const s3 = snapFrameHole(offGrid, { a: { x: 0, y: 0 }, u: { x: 1, y: 0 } }, 13.2, 11, false);
check('機架離格：退回 u、v 各取 8 的倍數', near(s3.u, 16) && near(s3.v, 8));
check('單一固定孔（無法判格）也退回 8 的倍數', (() => { const s = snapFrameHole([{ x: 0, y: 0 }], alignedAxis, 13.2, 0, true); return near(s.u, 16) && s.v === 0; })());

// (c) 中心線模式只取線上格點
const s4 = snapFrameHole(alignedPts, alignedAxis, 13.2);
check('中心線：u=13.2 → 16，v=0', near(s4.u, 16) && s4.v === 0);
const diag = [{ x: 0, y: 0 }, { x: 24, y: 32 }];
const axisD = { a: diag[0], u: { x: 0.6, y: 0.8 } };
const d1 = snapFrameHole(diag, axisD, 13), d2 = snapFrameHole(diag, axisD, 25), d3 = snapFrameHole(diag, axisD, -22);
check('3-4-5 中心線只有每 40 mm 一個格點：13→0、25→40、-22→-40', near(d1.u, 0) && near(d2.u, 40) && near(d3.u, -40) && d1.v === 0);
check('中心線結果換回世界座標一定在格上', [d1, d2, d3, s4].every((r, k) => { const ax = k < 3 ? axisD : alignedAxis, p = { x: r.u * ax.u.x, y: r.u * ax.u.y }; return near(p.x / 8, Math.round(p.x / 8)) && near(p.y / 8, Math.round(p.y / 8)); }));
const sOff = snapFrameHole(offGrid, { a: { x: 0, y: 0 }, u: { x: 1, y: 0 } }, 13.2);
check('中心線 + 機架離格：u 取 8 的倍數', near(sOff.u, 16) && sOff.v === 0);
// (d) 方向吸附存精確座標：基準孔 + 8·(i,j)，不留三角函數尾數；數字輸入不變
const gPair = [{ id: 'B', x: 100, y: 20 }, { id: 'A', x: 20, y: 20 }], snapped = snapFrameAngle(80, 50), gdelta = snapped - 0;
const gp = planFrameGroundChange(gPair, 'angle', gdelta, true);
check('吸附提交存精確值（基準 (20,20)，(6,8) → (68,84)）', gp.ok && gp.x === 68 && gp.y === 84);
const np = planFrameGroundChange(gPair, 'angle', gdelta);
check('不帶吸附旗標（數字輸入）維持三角函數結果', np.ok && near(np.x, 68) && near(np.y, 84));
check('非格點角度即使帶旗標也不被湊整', (() => { const r = planFrameGroundChange(gPair, 'angle', 10, true); return near(r.x, 20 + 80 * Math.cos(10 * Math.PI / 180)) && r.x !== Math.round(r.x); })());
// 長斜機架中心線的相鄰格點可能相隔超過舊搜尋窗的80格。
{
  const pts=[{x:0,y:0},{x:1000,y:8}],L=Math.hypot(1000,8),axis={a:pts[0],u:{x:1000/L,y:8/L}};
  const first=snapFrameHole(pts,axis,500),second=snapFrameHole(pts,axis,600),negative=snapFrameHole(pts,axis,-600);
  check('長斜機架取真正中心線格點，無局部8mm fallback',near(first.u,0)&&near(second.u,L)&&near(negative.u,-L));
  check('長斜機架換回世界座標仍在格上',[first,second,negative].every(q=>near(q.u*axis.u.x/8,Math.round(q.u*axis.u.x/8))&&near(q.u*axis.u.y/8,Math.round(q.u*axis.u.y/8))));
}
report('grid-frame');
