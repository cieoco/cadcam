// D3：子模組「立在對方板面上」（orient.edge 'child'）——子模組底板的一條邊站在宿主板面上，貼齊宿主的邊，轉接座在板面內側。
import { check, report } from './_harness.mjs';
import { S, B, Asm, fresh, motor, near, solveAt, cnc, ex } from './_bench-setup.mjs';
const BP = await import('../js/blocks/build-plan.js');
const IF = await import('../js/blocks/interference.js');
const OJ = await import('../js/blocks/orthogonal-joint.js');
const Sch = await import('../js/blocks/schema.js');
const { memberStock } = await import('../js/blocks/member-stock.js');

const [L, G] = fresh('fourbar-lift', 'gear-gripper');
const P = S.topo.params;
const brace = S.comps.find(c => c.moduleId === L.id && c.id.startsWith('ToolBrace'));
const hang = B.connect(S.comps, S.modules, G.id, { module: L.id, port: `edge:${brace.id}:R` }, P, motor);
const orient = st => st.modules.find(m => m.id === G.id).mount.orient;
const frameOf = (st, ang = {}) => Asm.orthogonalFrame(st.comps, st.modules, G.id, solveAt(st.comps, st.modules, P, ang).points, P);
const f0 = frameOf(hang);
const T = 3;   // 板厚

const st = B.benchAdjust(hang.comps, hang.modules, G.id, 'stand', P);
check("benchAdjust 'stand'：orient.edge 變 'child'、face 預設 1、記下子模組用哪條底板邊", st.ok && orient(st).edge === 'child' && orient(st).face === 1 && Number.isInteger(orient(st).childEdge));
check('零件不動', JSON.stringify(st.comps) === JSON.stringify(hang.comps));
const f = frameOf(st);
console.log('stand frame:', JSON.stringify({ o: f.origin, d: f.d, m: f.m, n: f.n }));
check('n＝宿主板面法向（face 1 → +z）、m 仍是邊的外法線（朝下）、d＝n×m', near(f.n.z, 1) && near(f.m.y, -1) && near(f.d.x, 1) && near(f.d.y, 0));
// 接合線：子模組底板正面貼齊宿主的邊 → 底板背面（w=0）在邊往內一個板厚；z 在宿主上表面
const w = memberStock(brace).widthMm;
const pts0 = solveAt(st.comps, st.modules, P).points;
const edgeY = (pts0[brace.p1.id].y + pts0[brace.p2.id].y) / 2 - w / 2;
check('origin：邊往內一個板厚、z＝宿主板厚（上表面）', near(f.origin.y, edgeY + T) && near(f.origin.z, T) && near(f.origin.x, f0.origin.x));
check('子模組的站立邊中點落在 origin', (() => { const p = Asm.toWorld3D(f, f.base, 0); return near(p.x, f.origin.x) && near(p.y, f.origin.y) && near(p.z, f.origin.z); })());
check('往子模組內側 10 mm → 離開板面往上 10 mm', (() => { const p = Asm.toWorld3D(f, { x: f.base.x + 10 * f.f.x, y: f.base.y + 10 * f.f.y }, 0); return near(p.z, T + 10) && near(p.x, f.origin.x) && near(p.y, f.origin.y); })());
check('e、f 是右手系（f＝e 的左法線），不會把子模組鏡射', near(f.f.x, -f.e.y) && near(f.f.y, f.e.x));
// 站立邊是底板外框的邊：底板所有節點都在板面上方（t ≥ 0）
// 安裝基準點（base）只是參考點，不是板上的孔，不算。
const gFrameNodes = S.comps.filter(c => c.moduleId === G.id).flatMap(c => ['p1', 'p2', 'p3'].map(k => c[k]).filter(p => p && p.id !== G.base && (p.type === 'fixed' || p.physicalMotor)));
check('夾爪的固定點（底板上的孔）都在板面上方', gFrameNodes.length > 0 && gFrameNodes.every(p => (p.x - f.base.x) * f.f.x + (p.y - f.base.y) * f.f.y > 0));

const fc = B.benchAdjust(st.comps, st.modules, G.id, 'face', P);
check("'face'：換到宿主另一面（face -1）→ n 朝 -z、origin.z＝0、d 反向", fc.ok && orient(fc).face === -1 && near(frameOf(fc).n.z, -1) && near(frameOf(fc).origin.z, 0) && near(frameOf(fc).d.x, -1));
const rt = B.benchAdjust(st.comps, st.modules, G.id, 'rotate', P);
check("站立時 'rotate'＝換子模組的下一條底板邊", rt.ok && orient(rt).childEdge !== orient(st).childEdge && orient(rt).edge === 'child');
const sl = B.benchAdjust(st.comps, st.modules, G.id, 'slide+', P);
check('站立時也能沿邊滑 5 mm', sl.ok && orient(sl).offsetMm === 5 && near(frameOf(sl).origin.x - f.origin.x, 5));
check("壓在邊上（edge 'host'）時 'face' 不適用：白話原因", B.benchAdjust(hang.comps, hang.modules, G.id, 'face', P).ok === false);
const back = B.benchAdjust(st.comps, st.modules, G.id, 'stand', P);
check("再按一次 'stand' 回到壓在邊上，位姿與原本相同", back.ok && orient(back).edge === 'host' && near(frameOf(back).origin.y, f0.origin.y) && near(frameOf(back).n.z, f0.n.z));
check('升降 40°：站立的子模組跟著工具架走', (() => { const a = frameOf(st, { '1': 40 }), b = frameOf(hang, { '1': 40 }); return near(a.origin.x - f.origin.x, b.origin.x - f0.origin.x, 1e-4) && near(a.origin.y - f.origin.y, b.origin.y - f0.origin.y, 1e-4); })());

// 製作：宿主孔在板面內側（離邊 板厚＋9），子模組孔離站立邊 9
const a = OJ.adapterLayout(st.comps, st.modules, G.id, P, { stockMm: T });
console.log('stand layout:', JSON.stringify({ host: a.hostHoles, child: a.childHoles }));
check('宿主桿上的孔：v＝side·(寬/2 − 板厚 − 9)＝3（在桿面內）', a.hostHoles.length === 2 && a.hostHoles.every(h => near(h.v, -1 * (w / 2 - T - 9))) && near(a.hostHoles[1].u - a.hostHoles[0].u, 10));
check('子模組底板上的孔：離站立邊 9 mm、沿邊相距 10 mm', a.childHoles.length === 2 && a.childHoles.every(h => near((h.x - f.base.x) * f.f.x + (h.y - f.base.y) * f.f.y, 9, 1e-3)) && near(Math.abs((a.childHoles[1].x - a.childHoles[0].x) * f.e.x + (a.childHoles[1].y - a.childHoles[0].y) * f.e.y), 10, 1e-3));
const plan = BP.buildPlan({ comps: st.comps, modules: st.modules, params: P, exportSettings: ex, cnc });
check('製作計畫有轉接座關節、兩邊各 2 孔', plan.joints.some(j => j.kind === 'adapter') && plan.parts.find(p => p.compId === brace.id).holeLayers.ADAPTER_HOLE === 2 && plan.parts.find(p => p.name === `${G.id}-frame`).holeLayers.ADAPTER_HOLE === 2);
check('組裝說明寫「立在…板面上」', /立在/.test(BP.buildPackHtml(plan, { title: 'T', cnc, modules: st.modules })));
const hit = IF.findInterference({ comps: st.comps, modules: st.modules, params: P, plan, pose: { '1': 0, '2': 0 }, exportSettings: ex });
check('干涉檢查跑得動，且不把宿主桿本身當成被撞', Array.isArray(hit) && !hit.some(x => x.kind === 'cross-plane' && x.parts.some(n => n.startsWith('ToolBrace'))));
const n = Sch.normalizeSnapshot(JSON.parse(JSON.stringify({ kind: 'blocks', v: 1, comps: st.comps, modules: st.modules, params: P })));
check('存檔往返保留 edge／face／childEdge', JSON.stringify(n.modules.find(m => m.id === G.id).mount.orient) === JSON.stringify(orient(st)));
const narrow = B.benchAdjust(hang.comps, hang.modules, G.id, 'stand', { ...P });
check('太窄的宿主（寬 < 板厚＋14）不能站：白話原因', (() => { const c2 = JSON.parse(JSON.stringify(hang.comps)); c2.find(c => c.id === brace.id).stock = { widthMm: 12, thicknessMm: 3 }; const r = B.benchAdjust(c2, hang.modules, G.id, 'stand', P); return r.ok === false && /寬/.test(r.reason); })() && narrow.ok);
report('bench-stand');
