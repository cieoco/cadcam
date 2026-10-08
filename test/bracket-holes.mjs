// G2：角碼每一翼的螺牙孔要畫得出來，而且對準木板上的轉接座孔；另外畫出鎖進去的螺絲。
import { check, report } from './_harness.mjs';
import { S, B, Asm, fresh, motor, near, solveAt, cnc, ex } from './_bench-setup.mjs';
const { createModuleEditor } = await import('../js/blocks/module-editor.js');
const OJ = await import('../js/blocks/orthogonal-joint.js');
const BP = await import('../js/blocks/build-plan.js');
const { memberStock } = await import('../js/blocks/member-stock.js');
const T = 3;
const [L, G] = fresh('fourbar-lift', 'gear-gripper');
const P = S.topo.params;
const brace = S.comps.find(c => c.moduleId === L.id && c.id.startsWith('ToolBrace'));
const run = (st, label) => {
  const pts = solveAt(st.comps, st.modules, P).points;
  const plan = BP.buildPlan({ comps: st.comps, modules: st.modules, params: P, exportSettings: ex, cnc });
  const f = Asm.orthogonalFrame(st.comps, st.modules, G.id, pts, P);
  const boxes = OJ.bracketBoxes(st.comps, st.modules, G.id, pts, P, { stockMm: T, plan });
  const lay = OJ.adapterLayout(st.comps, st.modules, G.id, P, { stockMm: T });
  check(`${label}：每一翼帶 hole（中心、軸向、直徑 3）`, boxes.length === 4 && boxes.every(b => b.hole && Number.isFinite(b.hole.center.z) && b.hole.axis && near(b.hole.diameterMm, 3)));
  const dot = (a, b) => a.x * b.x + a.y * b.y + (a.z || 0) * (b.z || 0);
  const thin = b => b.axes[['x', 'y', 'z'].findIndex(k => near(b.size[k], 1.2))];
  check(`${label}：孔軸＝該翼的厚度方向、孔心在該翼的厚度中面上`, boxes.every(b => near(Math.abs(dot(b.hole.axis, thin(b))), 1) && near(dot({ x: b.hole.center.x - b.center.x, y: b.hole.center.y - b.center.y, z: b.hole.center.z - b.center.z }, thin(b)), 0, 1e-6)));
  check(`${label}：孔心離該翼末端 3.5 mm（在翼的範圍內、靠末端）`, boxes.every(b => { const ks = ['x', 'y', 'z']; const li = ks.findIndex(k => near(b.size[k], 13) || near(b.size[k], 9.5)); const d = Math.abs(dot({ x: b.hole.center.x - b.center.x, y: b.hole.center.y - b.center.y, z: b.hole.center.z - b.center.z }, b.axes[li])); return near(d, b.size[ks[li]] / 2 - 3.5, 0.01); }));
  // 對準木板上的孔：宿主孔（桿座標 u,v → 平面座標）與子模組孔（toWorld3D），只比對垂直孔軸的平面位置
  const p1 = pts[brace.p1.id], p2 = pts[brace.p2.id], len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const d = { x: (p2.x - p1.x) / len, y: (p2.y - p1.y) / len }, left = { x: -d.y, y: d.x };
  const hostW = lay.hostHoles.map(h => ({ x: p1.x + h.u * d.x + h.v * left.x, y: p1.y + h.u * d.y + h.v * left.y }));
  const longLegs = boxes.filter(b => ['x', 'y', 'z'].some(k => near(b.size[k], 13))), shortLegs = boxes.filter(b => ['x', 'y', 'z'].some(k => near(b.size[k], 9.5)));
  check(`${label}：長邊的孔對準宿主桿上的孔`, hostW.every(h => longLegs.some(b => Math.hypot(b.hole.center.x - h.x, b.hole.center.y - h.y) < 0.05)));
  const childW = lay.childHoles.map(h => Asm.toWorld3D(f, h, 0));
  const offAxis = (a, b, ax) => { const v = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; const t = dot(v, ax); return Math.hypot(v.x - t * ax.x, v.y - t * ax.y, v.z - t * ax.z); };
  check(`${label}：短邊的孔對準固定板上的孔`, childW.every(h => shortLegs.some(b => offAxis(b.hole.center, h, b.hole.axis) < 0.05)));
  const screws = OJ.bracketScrews(st.comps, st.modules, G.id, pts, P, { stockMm: T, plan });
  const screwLength = memberStock(st.comps.find(c => c.id === brace.id)).thicknessMm > 4 ? 8 : 6;
  check(`${label}：4 支螺絲，從木板外側穿進角碼（頭在木板的另一面）、長 ${screwLength}`, screws.length === 4 && screws.every(s => near(s.lengthMm, screwLength) && s.head && s.tip && near(Math.hypot(s.tip.x - s.head.x, s.tip.y - s.head.y, s.tip.z - s.head.z), screwLength, 0.01)) &&
    boxes.every(b => screws.some(s => offAxis(s.head, b.hole.center, b.hole.axis) < 0.05 && Math.abs(dot({ x: s.head.x - b.hole.center.x, y: s.head.y - b.hole.center.y, z: s.head.z - b.hole.center.z }, b.hole.axis)) > T)));
  // 長、短腳要在接合角重疊至少一個角碼厚度；只驗孔位會漏掉 side=1 時兩翼相隔一片宿主板厚的錯誤。
  const alongN = p => (p.x - f.origin.x) * f.n.x + (p.y - f.origin.y) * f.n.y + (p.z - f.origin.z) * f.n.z;
  const legSpan = b => { const c = alongN(b.center), h = b.size.z / 2; return [c - h, c + h]; };
  const cornersMeet = [0, 1].every(k => { const a = legSpan(boxes[k * 2]), b = legSpan(boxes[k * 2 + 1]); return Math.min(a[1], b[1]) - Math.max(a[0], b[0]) >= 1.19; });
  check(`${label}：長短腳在轉角重疊角碼厚度 1.2 mm`, cornersMeet);
};
check('orthogonal-joint 匯出 bracketScrews', typeof OJ.bracketScrews === 'function');
if (typeof OJ.bracketScrews !== 'function') { report('bracket-holes'); process.exit(1); }
const hang = B.connect(S.comps, S.modules, G.id, { module: L.id, port: `edge:${brace.id}:R` }, P, motor, { joint: 'bracket-m3' });
run(hang, '壓在邊上');
run(B.benchAdjust(hang.comps, hang.modules, G.id, 'slide+', P), '沿邊滑 5 mm');
const otherSide = B.benchAdjust(hang.comps, hang.modules, G.id, 'side', P);
run(otherSide, '壓在另一側（side +1）');
const standing = B.benchAdjust(hang.comps, hang.modules, G.id, 'stand', P);
run(standing, '立在上面（face +1）');
run(B.benchAdjust(standing.comps, standing.modules, G.id, 'face', P), '立在下面（face -1）');
const thick = { ...hang, comps: hang.comps.map(c => c.id === brace.id ? { ...c, stock: { ...memberStock(c), thicknessMm: 5 } } : c) };
run(thick, '宿主板厚 5 mm');

// 巢狀宿主：第二個夾爪裝在第一個夾爪底板外框，角碼仍須在宿主框架座標內閉合並對孔。
const nestedEditor = createModuleEditor({ pushUndo: () => {}, rebuild: () => {}, draw: () => {}, transient: () => {}, downloadJson: () => {}, viewCenter: () => ({ x: 0, y: 0 }), loadLibraryText: () => null, saveLibraryText: () => {} });
nestedEditor.insertBuiltin('gear-gripper');
const N = S.modules.find(m => m.id !== L.id && m.id !== G.id);
const nestedComps = [...hang.comps, ...S.comps.filter(c => c.moduleId === N.id)];
const nestedPort = B.autoPorts(nestedComps, [...hang.modules, N], G.id, P).find(p => p.body?.kind === 'frame');
const nestedMount = B.connect(nestedComps, [...hang.modules, N], N.id, { module: G.id, port: nestedPort?.id }, P, motor, { joint: 'bracket-m3' });
check('巢狀宿主測試透過正式接口安裝成功', nestedMount.ok === true);
const nestedModules = nestedMount.modules;
const connectedNestedComps = nestedMount.comps;
const nestedSide = nestedModules.find(m => m.id === N.id).mount.orient.side;
const nestedPts = solveAt(connectedNestedComps, nestedModules, P).points;
const nestedFrame = Asm.orthogonalFrame(connectedNestedComps, nestedModules, N.id, nestedPts, P);
const nestedLayout = OJ.adapterLayout(connectedNestedComps, nestedModules, N.id, P, { stockMm: T });
const nestedBoxes = OJ.bracketBoxes(connectedNestedComps, nestedModules, N.id, nestedPts, P, { stockMm: T });
const nestedLong = nestedBoxes.filter(b => near(b.size.y, 13)), nestedShort = nestedBoxes.filter(b => near(b.size.z, 9.5));
const nestedHostAligned = nestedLayout && nestedLayout.hostKind === 'frame' && nestedLayout.hostModuleId === G.id &&
  nestedLayout.hostHoles.every(h => nestedLong.some(b => Math.hypot(b.hole.center.x - h.x, b.hole.center.y - h.y) < 0.05));
const nestedChildWorld = nestedLayout && nestedFrame ? nestedLayout.childHoles.map(h => Asm.toWorld3D(nestedFrame, h, 0)) : [];
const nestedOffAxis = (a, b, ax) => { const v = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; const t = v.x * ax.x + v.y * ax.y + v.z * ax.z; return Math.hypot(v.x - t * ax.x, v.y - t * ax.y, v.z - t * ax.z); };
const nestedChildAligned = nestedChildWorld.length === nestedShort.length && nestedChildWorld.every(h => nestedShort.some(b => nestedOffAxis(b.hole.center, h, b.hole.axis) < 0.05));
check('巢狀宿主底板：角碼孔仍對準宿主框架與子模組底板', !!nestedHostAligned && nestedChildAligned);
check(`巢狀宿主 side ${nestedSide}：長短腳仍在轉角接合`, nestedBoxes.length === 4 && [0, 1].every(k => {
  const along = p => (p.x - nestedFrame.origin.x) * nestedFrame.n.x + (p.y - nestedFrame.origin.y) * nestedFrame.n.y + (p.z - nestedFrame.origin.z) * nestedFrame.n.z;
  const span = box => { const c = along(box.center), h = box.size.z / 2; return [c - h, c + h]; };
  const a = span(nestedBoxes[k * 2]), b = span(nestedBoxes[k * 2 + 1]);
  return Math.min(a[1], b[1]) - Math.max(a[0], b[0]) >= 1.19;
}));
report('bracket-holes');
