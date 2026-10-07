// M6：干涉訊息裡的零件要用看得懂的名字（哪個機構的什麼），不出現 Mod2-frame、LiftPinion_1 這類內部名稱。
import { check, report } from './_harness.mjs';
import { S, fresh, motor } from './_bench-setup.mjs';
let PL = null;
try { PL = await import('../js/blocks/part-labels.js'); } catch (e) { console.log(String(e).slice(0, 160)); }
check('part-labels.js 匯出 partLabel／hitLabels', typeof PL?.partLabel === 'function' && typeof PL?.hitLabels === 'function');
if (typeof PL?.partLabel !== 'function') { report('part-labels'); process.exit(1); }
const C = await import('../js/blocks/mate-connect.js');
const BP = await import('../js/blocks/build-plan.js');
const [A, L, G] = fresh('rack-lift', 'fourbar-lift', 'gear-gripper'); const P = S.topo.params;
const join = (st, c, h, re) => { const t = C.mateTargets(st.comps, st.modules, c, P).find(x => x.module === h && re.test(x.name)); return C.mateConnect(st.comps, st.modules, c, { module: h, mate: t.mateId }, P, motor); };
const s1 = join({ comps: S.comps, modules: S.modules }, L.id, A.id, /滑台/), s2 = join(s1, G.id, L.id, /下緣/);
const lab = n => PL.partLabel(n, s2.comps, s2.modules);
const id = re => s2.comps.find(c => re.test(c.id)).id;
console.log([`frame`, `${L.id}-frame`, `${G.id}-frame`, id(/^LiftPinion/), id(/^LiftRackGear/), id(/^ToolBrace/), id(/^LiftCrank/), id(/^LeftJaw/), id(/^GearA/)].map(n => `${n} → ${lab(n)}`).join('\n'));
check('frame → 底座（齒條升降）的機架板', lab('frame') === `${A.name}的機架板`);
check('<模組id>-frame → 那個機構的底板', lab(`${L.id}-frame`) === `${L.name}的底板` && lab(`${G.id}-frame`) === `${G.name}的底板`);
check('齒輪／齒條：機構名＋零件種類；輸出端構件用輸出端的名字（齒條＝滑台、ToolBrace＝工具架）', lab(id(/^LiftPinion/)) === `${A.name}的齒輪` && lab(id(/^LiftRackGear/)) === `${A.name}的滑台` && lab(id(/^ToolBrace/)) === `${L.name}的工具架` && lab(id(/^GearA/)) === `${G.name}的齒輪`);
check('連桿、夾爪臂', lab(id(/^LiftCrank/)) === `${L.name}的連桿` && lab(id(/^LeftJaw/)) === `${G.name}的夾爪臂`);
check('所有製作計畫的零件名都換得成中文、不含內部名稱', BP.buildPlan({ comps: s2.comps, modules: s2.modules, params: P, exportSettings: { holeDiameterMm: 3.2, frameHoleDiameterMm: 3.2 }, cnc: { toolDiameterMm: 3.175, stockThicknessMm: 3 } }).parts.every(p => { const t = lab(p.name); return t !== p.name && !/[A-Za-z]+_\d+|-frame|\bframe\b|Mod\d/.test(t); }));
check('不認得的名字原樣回傳；沒有模組的作品：frame → 機架板', lab('whatever') === 'whatever' && PL.partLabel('frame', s2.comps.map(c => ({ ...c, moduleId: undefined })), []) === '機架板');
check('hitLabels：轉成名字並去掉重複、保持順序', JSON.stringify(PL.hitLabels([id(/^LiftCrank/), id(/^LiftFollower/), 'frame', id(/^LiftCrank/)], s2.comps, s2.modules)) === JSON.stringify([`${L.name}的連桿`, `${A.name}的機架板`]));
check('同名的兩個機構用編號後的顯示名稱（opts.displayName）', PL.partLabel(`${G.id}-frame`, s2.comps, s2.modules, { displayName: i => i === G.id ? '齒輪夾爪 2' : null }) === '齒輪夾爪 2的底板');
report('part-labels');
