// M1c 刀 1：模組操作的純函式（SDD-ASSEMBLY-MODULES §4.3a、E-M6）。
import { BLOCK_EXAMPLES } from '../js/blocks/examples.js';
import { compileAssembly, solveAssembly, rebakeModules } from '../js/blocks/assembly.js';
import { normalizeSnapshot } from '../js/blocks/schema.js';
import {
  connectedRootComps, createModule, inferOutput, addOutput, mountModule, unmountModule, dissolveModule,
  moduleToTemplate, normalizeTemplate, instantiateTemplate, BUILTIN_MODULES, builtinTemplate, parseLibrary, serializeLibrary
} from '../js/blocks/module-ops.js';
import { check, report } from './_harness.mjs';

const clone = v => JSON.parse(JSON.stringify(v));
const near = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;
const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
const snap = id => clone(BLOCK_EXAMPLES.find(e => e.id === id).snapshot);
const ptOf = (comps, id) => { for (const c of comps) for (const k of ['p1', 'p2', 'p3', 'm1', 'm2']) if (c[k]?.id === id) return c[k]; return null; };
const motorIdsOf = comps => { const s = new Set(); JSON.stringify(comps, (k, v) => { if (k === 'physicalMotor') s.add(String(v)); return v; }); return [...s].sort(); };
const tokensOf = comps => { const s = new Set(); comps.forEach(c => { s.add(c.id); ['p1', 'p2', 'p3', 'm1', 'm2'].forEach(k => c[k]?.id && s.add(c[k].id)); (c.holes || []).forEach(h => h?.id && s.add(h.id)); }); return s; };
const solveWorld = (comps, modules, params, angles) => solveAssembly(compileAssembly(comps, modules, { params }), { thetaDeg: 0, motorAngles: angles });

// ---------- 相連群組（共用接點或 id 參照） ----------
{
  const lift = snap('competition-rack-lift'), grip = snap('gear-gripper');
  const comps = [...lift.comps, ...grip.comps, { type: 'anchor', id: 'Lone', p1: { id: 'LN', type: 'fixed', x: 500, y: 0 } }];
  const a = connectedRootComps(comps, 'LiftPinion').sort();
  check('齒條升降 5 件靠 pinion／framePins／mountLocatorPoint 相連', a.join(',') === ['LiftGuideA', 'LiftGuideB', 'LiftPinion', 'LiftRackGear', 'MotorLocator'].sort().join(','), a.join(','));
  const b = connectedRootComps(comps, 'RightJaw').sort();
  check('夾爪 4 件靠共用接點與 mesh 相連', b.join(',') === ['GearA', 'GearB', 'LeftJaw', 'RightJaw'].join(','), b.join(','));
  check('孤立零件自成一組', connectedRootComps(comps, 'Lone').join(',') === 'Lone');
  check('已屬模組的零件不算在根群組內', connectedRootComps([...comps.map(c => c.id === 'MotorLocator' ? { ...c, moduleId: 'X' } : c)], 'LiftPinion').length === 4);
  check('找不到零件 → []', connectedRootComps(comps, 'Nope').length === 0);
}

// ---------- 建立模組、宣告輸出端 ----------
{
  const lift = snap('competition-rack-lift');
  const r = createModule(lift.comps, [], 'LiftRackGear', '升降"<x>');
  check('createModule 成功並回傳新模組 id', r.ok && r.moduleId === 'Mod1');
  check('群組 5 件都標上 moduleId', r.comps.filter(c => c.moduleId === 'Mod1').length === 5);
  check('base＝群組中第一個 fixed／motor 點（LPC）', r.modules[0].base === 'LPC');
  check('名稱過濾引號與角括號', r.modules[0].name === '升降x');
  check('不改動輸入', !lift.comps.some(c => c.moduleId));
  check('第二個模組 id 為 Mod2', createModule([...r.comps, { type: 'anchor', id: 'A9', p1: { id: 'A9p', type: 'fixed', x: 0, y: 0 } }], r.modules, 'A9', 'x').moduleId === 'Mod2');
  check('已屬模組的零件不能再建模組', createModule(r.comps, r.modules, 'LiftPinion', 'y').ok === false);

  const mod = r.modules[0];
  const out = inferOutput(r.comps, mod, 'LiftOutput');
  check('inferOutput：齒條孔 → body rack LiftRackGear', out.ok && out.output.body.kind === 'rack' && out.output.body.id === 'LiftRackGear' && out.output.at === 'LiftOutput');
  check('inferOutput：固定點不可當輸出', inferOutput(r.comps, mod, 'LGA').ok === false);
  check('inferOutput：不屬於本模組的點 → 拒絕', inferOutput(r.comps, mod, 'Nope').ok === false);
  const added = addOutput(r.comps, r.modules, 'Mod1', 'LiftOutput', '滑台');
  check('addOutput 加入輸出端（名稱、id 不重複）', added.ok && added.modules[0].outputs.length === 1 && added.modules[0].outputs[0].name === '滑台');
  const again = addOutput(r.comps, added.modules, 'Mod1', 'LiftHoleA');
  check('第二個輸出端 id 不重複', again.ok && new Set(again.modules[0].outputs.map(o => o.id)).size === 2);
  const grip = snap('gear-gripper');
  const g = createModule(grip.comps, [], 'GearA', '夾爪');
  const gp = inferOutput(g.comps, g.modules[0], 'GPA');
  check('inferOutput：齒輪銷 GPA 選三角板 LeftJaw 當 body（齒輪不是可用 body）', gp.ok && gp.output.body.kind === 'triangle' && gp.output.body.id === 'LeftJaw');
}

// ---------- 內建模組與插入實例（E-M6） ----------
let work;
{
  check('內建模組兩個：rack-lift、gear-gripper', BUILTIN_MODULES.map(m => m.id).join(',') === 'rack-lift,gear-gripper');
  const tLift = builtinTemplate('rack-lift'), tGrip = builtinTemplate('gear-gripper');
  check('內建模組是合法模板', normalizeTemplate(tLift).ok && normalizeTemplate(tGrip).ok);
  check('齒條升降模板帶滑台輸出端', tLift.outputs.length === 1 && tLift.outputs[0].at === 'LiftOutput');
  check('夾爪模板去掉夾爪任務 params', !('gripperWorkflow' in tGrip.params) && !('gripperObjectWidth' in tGrip.params));
  check('不存在的內建 id → null', builtinTemplate('nope') === null);

  const L = instantiateTemplate(tLift, { counter: 0, usedMotorIds: [], existingTokens: new Set(), place: { x: 0, y: 0 } });
  const tokL = tokensOf(L.comps);
  const G = instantiateTemplate(tGrip, { counter: L.counter, usedMotorIds: motorIdsOf(L.comps), existingTokens: new Set([...tokL, ...Object.keys(L.params)]), place: { x: 200, y: 0 } });
  check('實例零件都標上自己的模組 id', L.comps.every(c => c.moduleId === L.module.id) && G.comps.every(c => c.moduleId === G.module.id) && L.module.id !== G.module.id);
  check('馬達重新編號：升降 1、夾爪 2', motorIdsOf(L.comps).join(',') === '1' && motorIdsOf(G.comps).join(',') === '2');
  check('兩實例的 token 不衝突', [...tokensOf(G.comps)].every(t => !tokL.has(t)));
  check('參照同步改名（齒條 pinion 指向新小齒輪 id、framePins 指向新地錨點）', (() => {
    const rack = L.comps.find(c => c.type === 'rack'), pinion = L.comps.find(c => c.type === 'gear');
    return rack.pinion === pinion.id && rack.framePins.every(id => tokL.has(id)) && pinion.mountLocatorPoint && tokL.has(pinion.mountLocatorPoint);
  })());
  check('param key 同步改名且值保留', (() => { const rack = L.comps.find(c => c.type === 'rack'); return L.params[rack.lenParam] === 176 && rack.lenParam !== 'LRL'; })());
  check('base 落在 place', near(ptOf(L.comps, L.module.base).x, 0) && near(ptOf(L.comps, L.module.base).y, 0) && near(ptOf(G.comps, G.module.base).x, 200));
  check('輸出端 at／body 跟著改名', L.module.outputs[0].at !== 'LiftOutput' && tokL.has(L.module.outputs[0].at) && L.comps.some(c => c.id === L.module.outputs[0].body.id));
  check('counter 遞增', G.counter > L.counter && L.counter > 0);
  const G2 = instantiateTemplate(tGrip, { counter: G.counter, usedMotorIds: [...motorIdsOf(L.comps), ...motorIdsOf(G.comps)], existingTokens: new Set([...tokL, ...tokensOf(G.comps), ...Object.keys(L.params), ...Object.keys(G.params)]), place: { x: 400, y: 0 } });
  check('同一模板插兩次：id、param、馬達都不衝突', [...tokensOf(G2.comps)].every(t => !tokensOf(G.comps).has(t)) && motorIdsOf(G2.comps).join(',') === '3'
    && Object.keys(G2.params).every(k => !(k in G.params)));
  const n = normalizeSnapshot({ kind: 'blocks', v: 1, comps: [...L.comps, ...G.comps, ...G2.comps], params: { ...L.params, ...G.params, ...G2.params }, modules: [L.module, G.module, G2.module] });
  check('三個實例組成的作品通過 schema（含樹狀組裝檢查）', n && n.modules.length === 3);
  work = { comps: [...L.comps, ...G.comps], modules: [L.module, G.module], params: { ...L.params, ...G.params }, L, G };
}

// ---------- 安裝、拆下、解散 ----------
{
  const { comps, modules, params, L, G } = clone(work);
  const outId = L.module.outputs[0].id, at = L.module.outputs[0].at;
  const home = mountModule(comps, modules, G.module.id, { module: L.module.id, output: outId }, params, { activeMotor: '1', theta: 0, motorAngles: { '2': 0 } });
  check('mountModule 成功', home.ok, home.reason);
  const gm = home.modules.find(m => m.id === G.module.id);
  const s0 = solveWorld(home.comps, home.modules, params, { '1': 0, '2': 0 });
  check('安裝後夾爪 base 落在滑台孔目前位置', near(dist(ptOf(home.comps, G.module.base), s0.points[at]), 0));
  check('mount.ref＝輸出端目前位姿（方向 90°）、home 只記宿主鏈馬達 {1: 0}', near(gm.mount.ref.a, 90) && JSON.stringify(gm.mount.home) === JSON.stringify({ '1': 0 }));
  check('安裝不旋轉：夾爪兩齒輪中心仍水平', (() => { const gears = home.comps.filter(c => c.moduleId === G.module.id && c.type === 'gear'); return near(gears[0].p1.y, gears[1].p1.y); })());
  const s60 = solveWorld(home.comps, home.modules, params, { '1': 60, '2': 0 });
  check('升降 60° 時夾爪 base 跟著滑台孔', near(dist(s60.points[G.module.base], s60.points[at]), 0) && s60.points[at].y > s0.points[at].y + 30);
  check('安裝後 rebake 不再變動（I1 成立）', rebakeModules(home.comps, home.modules, params).changed === false);

  // 在升降已升起 30° 時安裝：home 記 30°，I1 仍成立
  const up = mountModule(comps, modules, G.module.id, { module: L.module.id, output: outId }, params, { activeMotor: '1', theta: 30, motorAngles: { '2': 0 } });
  const s30 = solveWorld(up.comps, up.modules, params, { '1': 30, '2': 0 });
  check('升起時安裝：home={1:30}，base 貼在升起後的孔', up.ok && JSON.stringify(up.modules.find(m => m.id === G.module.id).mount.home) === JSON.stringify({ '1': 30 })
    && near(dist(ptOf(up.comps, G.module.base), s30.points[at]), 0));
  check('升起時安裝：rebake 不變動', rebakeModules(up.comps, up.modules, params).changed === false);

  // 拒絕的情況
  check('已安裝的模組不能再安裝', mountModule(home.comps, home.modules, G.module.id, { module: L.module.id, output: outId }, params, { activeMotor: '1', theta: 0, motorAngles: {} }).ok === false);
  check('不能裝到自己', mountModule(comps, modules, L.module.id, { module: L.module.id, output: outId }, params, { activeMotor: '1', theta: 0, motorAngles: {} }).ok === false);
  check('不能裝到自己的子孫（形成迴圈）', (() => {
    const withOut = addOutput(home.comps, home.modules, G.module.id, ptOf(home.comps, 'LT') ? 'LT' : G.comps.find(c => c.type === 'triangle').p3.id);
    if (!withOut.ok) return false;
    const gOut = withOut.modules.find(m => m.id === G.module.id).outputs[0].id;
    return mountModule(home.comps, withOut.modules, L.module.id, { module: G.module.id, output: gOut }, params, { activeMotor: '1', theta: 0, motorAngles: {} }).ok === false;
  })());
  check('目標輸出端不存在 → 拒絕', mountModule(comps, modules, G.module.id, { module: L.module.id, output: 'nope' }, params, { activeMotor: '1', theta: 0, motorAngles: {} }).ok === false);

  // 拆下：在升降 60° 時拆，夾爪留在目前世界位置、變成未安裝
  const un = unmountModule(home.comps, home.modules, G.module.id, params, { activeMotor: '1', theta: 60, motorAngles: { '2': 0 } });
  check('unmountModule 成功、mount 變 null', un.ok && un.modules.find(m => m.id === G.module.id).mount === null);
  const sUn = solveWorld(un.comps, un.modules, params, { '1': 60, '2': 0 });
  check('拆下後夾爪停在拆下當時的世界位置', near(dist(sUn.points[G.module.base], s60.points[G.module.base]), 0, 1e-6));
  check('拆下後升降再動，夾爪不跟著動', (() => { const s = solveWorld(un.comps, un.modules, params, { '1': 0, '2': 0 }); return near(dist(s.points[G.module.base], sUn.points[G.module.base]), 0); })());
  check('未安裝的模組不能拆下', unmountModule(un.comps, un.modules, G.module.id, params, { activeMotor: '1', theta: 0, motorAngles: {} }).ok === false);

  // 解散
  check('有模組裝在上面時不能解散宿主', dissolveModule(home.comps, home.modules, L.module.id).ok === false);
  check('已安裝的模組不能解散', dissolveModule(home.comps, home.modules, G.module.id).ok === false);
  const dis = dissolveModule(un.comps, un.modules, G.module.id);
  check('解散未安裝模組：標記移除、模組條目刪除', dis.ok && !dis.comps.some(c => c.moduleId === G.module.id) && !dis.modules.some(m => m.id === G.module.id));
  check('不改動輸入', JSON.stringify(home.modules) === JSON.stringify(mountModule(comps, modules, G.module.id, { module: L.module.id, output: outId }, params, { activeMotor: '1', theta: 0, motorAngles: { '2': 0 } }).modules));
}

// ---------- 匯出成模板、模組庫 ----------
{
  const { comps, modules, params, L } = clone(work);
  const t = moduleToTemplate(comps, modules, params, L.module.id);
  check('模板格式：kind blocks-module、v 1、零件去掉 moduleId', t.kind === 'blocks-module' && t.v === 1 && t.comps.length === 5 && t.comps.every(c => !('moduleId' in c)));
  check('模板只帶參照到的 params', Object.keys(t.params).sort().join(',') === Object.keys(L.params).filter(k => k !== 'theta').sort().join(','), Object.keys(t.params).join(','));
  check('模板保留 paramProps 以外的參照參數（桿件孔 distParam、皮帶輪 pinRadiusParam、凸輪升程）', (() => {
    const extra = [
      { type: 'bar', id: 'HB', moduleId: 'X', p1: { id: 'H1', type: 'fixed', x: 0, y: 0 }, p2: { id: 'H2', type: 'floating', x: 80, y: 0 }, lenParam: 'HL', holes: [{ id: 'H3', distParam: 'HL_H1' }] },
      { type: 'pulley', id: 'PU', moduleId: 'X', p1: { id: 'H1', type: 'fixed', x: 0, y: 0 }, p2: { id: 'PP', type: 'floating', x: 10, y: 0 }, radiusParam: 'PR', pinRadiusParam: 'PPR' },
      { type: 'cam', id: 'CM', moduleId: 'X', p1: { id: 'H1', type: 'fixed', x: 0, y: 0 }, p2: { id: 'CF', type: 'floating', x: 0, y: 30 }, baseRadiusParam: 'CB', liftParam: 'CL' }
    ];
    const tt = moduleToTemplate(extra, [{ id: 'X', name: 'x', outputs: [], mount: null }], { HL: 80, HL_H1: 40, PR: 10, PPR: 6, CB: 20, CL: 12, unrelated: 1 }, 'X');
    return ['HL', 'HL_H1', 'PR', 'PPR', 'CB', 'CL'].every(k => k in tt.params) && !('unrelated' in tt.params);
  })());
  check('模板帶 base 與 outputs', t.base === L.module.base && t.outputs.length === 1);
  const round = normalizeTemplate(JSON.parse(JSON.stringify(t)));
  check('模板往返 normalizeTemplate 成功', round.ok && round.template.comps.length === 5);
  check('kind 錯誤 → 拒絕', normalizeTemplate({ ...t, kind: 'blocks' }).ok === false);
  check('comps 不是陣列 → 拒絕', normalizeTemplate({ ...t, comps: null }).ok === false);
  check('名稱過濾', normalizeTemplate({ ...t, name: '升"降' }).template.name === '升降');
  const lib = serializeLibrary([t, builtinTemplate('gear-gripper')]);
  const back = parseLibrary(lib);
  check('模組庫序列化往返', Array.isArray(back) && back.length === 2 && back[0].kind === 'blocks-module');
  check('模組庫：壞資料略過、非 JSON 回傳 []', parseLibrary(JSON.stringify([t, { kind: 'x' }, 5])).length === 1 && parseLibrary('not json').length === 0 && parseLibrary(null).length === 0);
  check('模組庫最多 32 筆', parseLibrary(JSON.stringify(Array.from({ length: 40 }, () => t))).length === 32);
}

report('module-ops');
