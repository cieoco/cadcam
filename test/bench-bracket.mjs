// E1：現成的 M3 帶牙金屬角碼（13×9.5×7 mm，厚 1.2，孔心離末端 3.5）當直角接合件，取代 3D 列印轉接座。
// 每個接合處兩片並排；長邊（孔離轉角 9.5）貼宿主、短邊（孔離轉角 6）貼子模組底板；M3×6 直接鎖進螺牙，不用螺帽。
import { check, report } from './_harness.mjs';
import { S, B, Asm, fresh, motor, near, solveAt, cnc, ex } from './_bench-setup.mjs';
const BP = await import('../js/blocks/build-plan.js');
const OJ = await import('../js/blocks/orthogonal-joint.js');
const Sch = await import('../js/blocks/schema.js');
const { memberStock } = await import('../js/blocks/member-stock.js');

check('orthogonal-joint.js 匯出 JOINT_KINDS（printed、bracket-m3）', OJ.JOINT_KINDS && OJ.JOINT_KINDS.printed && OJ.JOINT_KINDS['bracket-m3']);
if (!OJ.JOINT_KINDS || !OJ.JOINT_KINDS['bracket-m3']) { report('bench-bracket'); process.exit(1); }
const K = OJ.JOINT_KINDS['bracket-m3'];
check('角碼規格：寬 7、厚 1.2、長邊孔離轉角 9.5、短邊孔離轉角 6、帶螺牙、每處 2 片', K.widthMm === 7 && K.thicknessMm === 1.2 && K.hostHoleMm === 9.5 && K.childHoleMm === 6 && K.threaded === true && K.count === 2 && /角碼/.test(K.label));

const [L, G] = fresh('fourbar-lift', 'gear-gripper');
const P = S.topo.params;
const brace = S.comps.find(c => c.moduleId === L.id && c.id.startsWith('ToolBrace'));
const w = memberStock(brace).widthMm, T = 3;
const printed = B.connect(S.comps, S.modules, G.id, { module: L.id, port: `edge:${brace.id}:R` }, P, motor);
const orient = st => st.modules.find(m => m.id === G.id).mount.orient;
check('不指定時仍是 3D 列印轉接座（舊行為不變）', orient(printed).joint.kind === 'printed');
const viaOpt = B.connect(S.comps, S.modules, G.id, { module: L.id, port: `edge:${brace.id}:R` }, P, motor, { joint: 'bracket-m3' });
check('connect 可指定接合件：joint.kind bracket-m3', viaOpt.ok && orient(viaOpt).joint.kind === 'bracket-m3');
const br = B.benchAdjust(printed.comps, printed.modules, G.id, 'joint:bracket-m3', P);
check("benchAdjust 'joint:bracket-m3' 切換接合件", br.ok && JSON.stringify(orient(br).joint) === JSON.stringify(orient(viaOpt).joint));
check("切回 'joint:printed'", (() => { const r = B.benchAdjust(br.comps, br.modules, G.id, 'joint:printed', P); return r.ok && r.modules.find(m => m.id === G.id).mount.orient.joint.kind === 'printed'; })());
const n = Sch.normalizeSnapshot(JSON.parse(JSON.stringify({ kind: 'blocks', v: 1, comps: br.comps, modules: br.modules, params: P })));
check('存檔往返保留 joint', JSON.stringify(n.modules.find(m => m.id === G.id).mount.orient.joint) === JSON.stringify(orient(br).joint));

// ---------- 孔位：壓在邊上 ----------
const f = Asm.orthogonalFrame(br.comps, br.modules, G.id, solveAt(br.comps, br.modules, P).points, P);
const a = OJ.adapterLayout(br.comps, br.modules, G.id, P, { stockMm: T });
const a0 = OJ.adapterLayout(printed.comps, printed.modules, G.id, P, { stockMm: T });
console.log('bracket layout:', JSON.stringify({ host: a.hostHoles, child: a.childHoles, kind: a.kind }));
check('layout 帶 kind bracket-m3、兩片各一孔、孔徑 3.2（螺絲穿過木板）', a.kind === 'bracket-m3' && a.hostHoles.length === 2 && a.childHoles.length === 2 && a.holeDiameterMm === 3.2);
check('宿主孔：沿邊位置與列印版相同（相距 10），離邊 9.5 mm', near(a.hostHoles[0].u, a0.hostHoles[0].u) && near(a.hostHoles[1].u - a.hostHoles[0].u, 10) && a.hostHoles.every(h => near(h.v, -1 * (w / 2 - 9.5))));
const tOf = h => (h.x - f.base.x) * f.f.x + (h.y - f.base.y) * f.f.y;
check('子模組孔：離宿主板面 6 mm（＝板厚 3＋6＝9 從宿主底面算起）', a.childHoles.every(h => near(tOf(h), T + 6, 1e-3)));

// ---------- 孔位：立在面上 ----------
const st = B.benchAdjust(br.comps, br.modules, G.id, 'stand', P);
const fs = Asm.orthogonalFrame(st.comps, st.modules, G.id, solveAt(st.comps, st.modules, P).points, P);
const as = OJ.adapterLayout(st.comps, st.modules, G.id, P, { stockMm: T });
check('立在面上：宿主孔離邊 板厚＋9.5、子模組孔離站立邊 6', st.ok && as.hostHoles.every(h => near(h.v, -1 * (w / 2 - T - 9.5))) && as.childHoles.every(h => near((h.x - fs.base.x) * fs.f.x + (h.y - fs.base.y) * fs.f.y, 6, 1e-3)));
check('金屬角碼只有 90°：不能傾斜，白話原因提到 3D 列印', (() => { const r = B.benchAdjust(br.comps, br.modules, G.id, 'tilt+', P); return r.ok === false && /列印/.test(r.reason); })());
check('已傾斜的不能換成金屬角碼', (() => { const t = B.benchAdjust(printed.comps, printed.modules, G.id, 'tilt+', P); const r = B.benchAdjust(t.comps, t.modules, G.id, 'joint:bracket-m3', P); return r.ok === false && /傾斜/.test(r.reason); })());

// ---------- 製作包 ----------
const plan = BP.buildPlan({ comps: br.comps, modules: br.modules, params: P, exportSettings: ex, cnc });
const hw = BP.hardwareList(plan, { modules: br.modules });
console.log('bracket hw:', hw.map(r => `${r.spec}×${r.qty}`).join(' '));
const hw0 = BP.hardwareList(BP.buildPlan({ comps: printed.comps, modules: printed.modules, params: P, exportSettings: ex, cnc }), { modules: printed.modules });
const qty = (list, re) => list.filter(r => re.test(r.spec)).reduce((s, r) => s + r.qty, 0);
check('五金：M3 帶牙角碼 ×2、沒有 3D 列印轉接座', qty(hw, /角碼/) === 2 && qty(hw, /轉接座/) === 0);
check('五金：角碼螺絲 M3×6 ×4（直接鎖進螺牙）', (() => { const r = hw.find(x => x.spec === 'M3×6'); return r && r.qty === 4 && /角碼/.test(r.note); })());
check('防鬆螺帽比列印版少 4 顆（角碼不用螺帽）', qty(hw0, /防鬆螺帽/) - qty(hw, /防鬆螺帽/) === 4);
const html = BP.buildPackHtml(plan, { title: 'T', cnc, modules: br.modules });
check('組裝說明：用角碼、不要鎖太緊、不提 STL', /角碼/.test(html) && /不要鎖太緊|別鎖太緊/.test(html) && !/下載 STL/.test(html));
check('木板上的孔圖層仍是 ADAPTER_HOLE（兩邊各 2）', plan.parts.find(p => p.compId === brace.id).holeLayers.ADAPTER_HOLE === 2 && plan.parts.find(p => p.name === `${G.id}-frame`).holeLayers.ADAPTER_HOLE === 2);
report('bench-bracket');
