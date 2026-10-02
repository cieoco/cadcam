// F1：金屬角碼成為軟體內建、作品級的預設直角接合件——規格存在加工設定（可改），孔位、五金、3D 都引用它。
import { check, report } from './_harness.mjs';
import { S, B, Asm, fresh, motor, near, solveAt, cnc, ex } from './_bench-setup.mjs';
const FP = await import('../js/blocks/fabrication-profile.js');
const OJ = await import('../js/blocks/orthogonal-joint.js');
const BP = await import('../js/blocks/build-plan.js');
const { memberStock } = await import('../js/blocks/member-stock.js');

const D = FP.FABRICATION_DEFAULTS.joint;
check('加工設定預設有 joint：預設接合件 bracket-m3、角碼規格 寬 7／厚 1.2／長邊 13／短邊 9.5／孔心離末端 3.5',
  D && D.defaultKind === 'bracket-m3' && D.bracket && D.bracket.widthMm === 7 && D.bracket.thicknessMm === 1.2 && D.bracket.longLegMm === 13 && D.bracket.shortLegMm === 9.5 && D.bracket.holeEndMm === 3.5);
if (!D) { report('joint-profile'); process.exit(1); }
const norm = FP.normalizeFabricationProfile({});
const prof = norm.profile || norm;
check('舊作品沒有 joint：靜默補上預設', prof.joint && prof.joint.defaultKind === 'bracket-m3' && prof.joint.bracket.longLegMm === 13);
const custom = FP.normalizeFabricationProfile({ joint: { defaultKind: 'printed', bracket: { longLegMm: 15, holeEndMm: 4, widthMm: 999, shortLegMm: 'x' } } });
const cp = custom.profile || custom;
check('自訂值保留、不合理的值回預設或夾住', cp.joint.defaultKind === 'printed' && cp.joint.bracket.longLegMm === 15 && cp.joint.bracket.holeEndMm === 4 && cp.joint.bracket.shortLegMm === 9.5 && cp.joint.bracket.widthMm <= 30);
check('不認識的預設種類回 bracket-m3', (() => { const r = FP.normalizeFabricationProfile({ joint: { defaultKind: 'glue' } }); return (r.profile || r).joint.defaultKind === 'bracket-m3'; })());

check('jointSpec(kind, joint 設定)：由規格算出孔距', typeof OJ.jointSpec === 'function');
const s0 = OJ.jointSpec('bracket-m3', D);
check('預設：宿主孔離轉角 9.5、子模組孔 6、標籤含尺寸 13×9.5×7', s0.hostHoleMm === 9.5 && s0.childHoleMm === 6 && /13×9\.5×7/.test(s0.label) && s0.threaded && s0.count === 2);
const s1 = OJ.jointSpec('bracket-m3', { ...D, bracket: { ...D.bracket, longLegMm: 15, shortLegMm: 12, holeEndMm: 4, widthMm: 8 } });
check('改規格：15／12／孔端 4 → 宿主孔 11、子模組孔 8、標籤 15×12×8', s1.hostHoleMm === 11 && s1.childHoleMm === 8 && /15×12×8/.test(s1.label));
check('printed 不受角碼規格影響', OJ.jointSpec('printed', D).hostHoleMm === 9 && OJ.jointSpec('printed', D).childHoleMm === 9);
check('沒給設定時用內建預設', OJ.jointSpec('bracket-m3').hostHoleMm === 9.5);

// 孔位與製作包引用作品的角碼規格
const [L, G] = fresh('fourbar-lift', 'gear-gripper');
const P = S.topo.params;
const brace = S.comps.find(c => c.moduleId === L.id && c.id.startsWith('ToolBrace'));
const w = memberStock(brace).widthMm;
const st = B.connect(S.comps, S.modules, G.id, { module: L.id, port: `edge:${brace.id}:R` }, P, motor, { joint: 'bracket-m3' });
const joint2 = { ...D, bracket: { ...D.bracket, longLegMm: 15, shortLegMm: 12, holeEndMm: 4, widthMm: 8 } };
const a0 = OJ.adapterLayout(st.comps, st.modules, G.id, P, { stockMm: 3 });
const a1 = OJ.adapterLayout(st.comps, st.modules, G.id, P, { stockMm: 3, joint: joint2 });
check('adapterLayout：預設規格孔離邊 9.5；自訂規格孔離邊 11', a0.hostHoles.every(h => near(h.v, -1 * (w / 2 - 9.5))) && a1.hostHoles.every(h => near(h.v, -1 * (w / 2 - 11))));
check('layout 帶 bracket 外形（給 3D 與說明用）：寬、厚、兩邊長', a1.bracket && a1.bracket.widthMm === 8 && a1.bracket.longLegMm === 15 && a1.bracket.shortLegMm === 12 && a1.bracket.thicknessMm === 1.2);
const plan = BP.buildPlan({ comps: st.comps, modules: st.modules, params: P, exportSettings: ex, cnc, joint: joint2 });
const hw = BP.hardwareList(plan, { modules: st.modules });
check('五金清單的角碼名稱跟著規格（15×12×8）', hw.some(r => /角碼/.test(r.spec) && /15×12×8/.test(r.spec) && r.qty === 2));
check('不給 joint 時與之前相同（13×9.5×7）', BP.hardwareList(BP.buildPlan({ comps: st.comps, modules: st.modules, params: P, exportSettings: ex, cnc }), { modules: st.modules }).some(r => /13×9\.5×7/.test(r.spec)));

// 3D：角碼的實體方塊（兩翼各一塊），供檢視器畫出
check('orthogonal-joint 匯出 bracketBoxes', typeof OJ.bracketBoxes === 'function');
const pts = solveAt(st.comps, st.modules, P).points;
const boxes = OJ.bracketBoxes(st.comps, st.modules, G.id, pts, P, { stockMm: 3 });
console.log('boxes:', boxes.length, JSON.stringify(boxes[0]));
check('兩片角碼 × 兩翼＝4 個方塊，每個有中心、三個軸向與尺寸（mm，宿主平面座標）', boxes.length === 4 && boxes.every(b => b.center && Number.isFinite(b.center.z) && b.size && b.axes && b.axes.length === 3));
check('有一翼厚 1.2、長 13（長邊）；另一翼長 9.5（短邊）', boxes.some(b => [b.size.x, b.size.y, b.size.z].some(v => near(v, 13))) && boxes.some(b => [b.size.x, b.size.y, b.size.z].some(v => near(v, 9.5))) && boxes.every(b => [b.size.x, b.size.y, b.size.z].some(v => near(v, 1.2))));
const pr = B.benchAdjust(st.comps, st.modules, G.id, 'joint:printed', P);
check('3D 列印的接合不產生角碼方塊', OJ.bracketBoxes(pr.comps, pr.modules, G.id, pts, P, { stockMm: 3 }).length === 0);
report('joint-profile');
