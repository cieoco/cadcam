// 齒輪 / 齒條域（gear-editor.js）驗收：成對建立、嚙合同步、整鏈改模數、
// 有限齒條 theta 範圍、刪除齒輪與參數清理（O4 起刪除走共用編輯流程，只刪選到的那一個）。DOM 以極簡假件替身。
import { check, report } from './_harness.mjs';
globalThis.window={confirm:()=>true,alert:message=>{throw Error(message);}};

class FakeElement {
  constructor() { this.children = []; this.style = {}; this.dataset = {}; this.textContent = ''; this.value = ''; }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener() {}
}
const els = new Map();
globalThis.document = {
  getElementById: id => { if (!els.has(id)) els.set(id, new FakeElement()); return els.get(id); },
  createElement: () => new FakeElement()
};

const { S } = await import('../js/blocks/state.js');
const Model = await import('../js/blocks/model.js');
const { createGearEditor } = await import('../js/blocks/gear-editor.js');

const noop = () => {};
// O4：刪除齒輪由 delete-part.js 的 planDeleteGear 規劃（原 editor.deleteGearChain 已移除）；這裡用真的刪除入口。
const {deleteSelectedPart}=await import('../js/blocks/delete-part.js');
const deleteGear=id=>{S.selectedGearId=id;deleteSelectedPart({S,transient:noop,pushUndo:()=>{},pause:noop,closeMobileEditPanel:noop,setSliderDetailRows:noop,rebuild:noop,draw:noop,points:{}});};
let undos=0;
const editor = createGearEditor({
  pushUndo: () => undos++, pause: noop, rebuild: noop, draw: noop, renderFrame: noop,
  transient: noop, scheduleAutosave: noop, cancelMotorMode: noop, exitDrawTools: noop,
  openMobileEditPanel: noop, closeMobileEditPanel: noop, hideEditorPanels: noop,
  snapshotStr: () => '', updateUndoBtn: noop, recordManualTrace: noop,
  worldFromEvent: () => null, mobilePrompt: () => false,
  pointCoords: () => Model.pointCoords(S.comps),
  updatePointCoordsById: (id, x, y) => Model.updatePointCoordsById(S.comps, id, x, y),
  pointIsGround: id => Model.pointIsGround(S.comps, id)
});

const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const gears = () => S.comps.filter(c => c.type === 'gear');
const tangent = (a, b) => {
  const D = S.topo.params[a.radiusParam] + S.topo.params[b.radiusParam];
  return Math.abs(dist(Model.pointCoords(S.comps)[a.p1.id], Model.pointCoords(S.comps)[b.p1.id]) - D) < 1e-6;
};

// ---- 成對齒輪：建立即相切、預設 12:18 ----
editor.addGearPair();
let [driver, driven] = gears();
// Draw a rigid link across both fastening holes and run the saved design.
{
  const {compileTopology} = await import('../js/core/topology.js');
  const {solveTopology} = await import('../js/multilink/solver.js');
  const {normalizeSnapshot,toSnapshot} = await import('../js/blocks/schema.js');
  const {inspectGearExport} = await import('../js/blocks/exporters.js');
  const bodies = structuredClone(S.comps);
  bodies.forEach(g => g.p1.type = 'fixed');
  Object.assign(bodies[0].p1,{type:'motor',physicalMotor:'1'});
  const g = bodies[1], [a,b] = g.holes, points = Model.pointCoords(bodies);
  const end = h => ({id:h.id,type:'floating',...points[h.id]});
  bodies.push({type:'bar',id:'Arm',p1:end(a),p2:end(b),lenParam:'ArmLength',fixedLen:true});
  const saved = normalizeSnapshot(toSnapshot(bodies,{params:{...S.topo.params,ArmLength:32}},10));
  const t = compileTopology(saved.comps,{params:saved.params});
  for (const thetaDeg of [0,90,180]) {
    const sol = solveTopology(t,{thetaDeg}), p = sol.points;
    const angle = -thetaDeg*Math.PI/360;
    check('從動輪雙孔固定桿跟隨減速比 '+thetaDeg,
      sol.isValid && Math.abs(dist(p[a.id],p[b.id])-32)<1e-6 &&
      Math.hypot(p[b.id].x-g.p1.x+16*Math.sin(angle),p[b.id].y-g.p1.y-16*Math.cos(angle))<1e-6);
  }
  const holes = inspectGearExport(g,saved.params).holes.filter(h=>h.layer==='MOUNT_HOLE');
  check('固定孔加工位置與孔徑',holes.length===2 && holes.every(h=>h.r===1.6) && dist(...holes)===32);
  const before = undos;
  editor.changeGearTeeth(6-driven.teeth);
  check('縮到齒根會破孔時保留原尺寸',undos===before && driven.teeth===48);
}
// Change the count through the same control used on the canvas inspector.
{
  await import('../js/blocks/gear-reduction-ui.js');
  const {compileTopology} = await import('../js/core/topology.js');
  const {solveTopology} = await import('../js/multilink/solver.js');
  editor.selectGear(driven.id);
  await new Promise(resolve=>setTimeout(resolve,0));
  editor.updateGearEditor();
  const field = document.getElementById('gearMountCount');
  const original = structuredClone(driven.holes);
  field.value='4';field.onchange();
  check('新增一對固定孔保留舊孔',driven.holes.length===4 && JSON.stringify(driven.holes.slice(0,2))===JSON.stringify(original));
  const bodies=structuredClone(S.comps),g=bodies[1];
  bodies.forEach(c=>c.p1.type='fixed');
  Object.assign(bodies[0].p1,{type:'motor',physicalMotor:'1'});
  const sol=solveTopology(compileTopology(bodies,{params:{...S.topo.params}}),{thetaDeg:180});
  check('新增的兩孔隨從動輪轉 90 度',sol.isValid && g.holes.slice(2).every(h=>Math.hypot(sol.points[h.id].x-g.p1.x,sol.points[h.id].y-g.p1.y+h.u)<1e-5));
  driven.holes[2].type='fixed';
  field.value='2';field.onchange();
  check('已固定的孔不能隨孔數減少而消失',driven.holes.length===4 && field.value==='4');
  driven.holes[2].type='floating';
  field.value='2';field.onchange();
  check('移除額外兩孔保留原孔',JSON.stringify(driven.holes)===JSON.stringify(original));
}
// Both legacy inline radii and parameter-backed gears must reach every integer.
const radiusKey=driven.pinRadiusParam;
for(const legacy of [false,true]){
  if(legacy){delete driven.pinRadiusParam;driven.pinRadius=17;}
  else S.topo.params[radiusKey]=17;
  const start=undos;
  editor.changeGearPinRadius(1);
  check(`孔距17→18（${legacy?'舊作品':'參數'}）`,editor.gearPinRadius(driven)===18&&undos===start+1);
  editor.changeGearPinRadius(1);editor.changeGearPinRadius(-1);
  check('孔距18→19→18，孔位距離同步',editor.gearPinRadius(driven)===18&&Math.abs(dist(driven.p1,driven.p2)-18)<1e-6);
  editor.setGearPinRadius('23');editor.setGearPinRadius('18');
  check('可直接輸入18，面板同步',editor.gearPinRadius(driven)===18&&document.getElementById('gearPinRadiusVal').value==='18');
  const same=undos,original=JSON.stringify(driven);
  for(const v of ['','bad',NaN,Infinity,3,999,18])editor.setGearPinRadius(v);
  check('空白、無效、越界與相同值不修改也不新增復原',undos===same&&JSON.stringify(driven)===original);
}
editor.setGearPinRadius('18.5');
check('輸出孔距數字欄接受小數',editor.gearPinRadius(driven)===18.5);
driven.pinRadiusParam=radiusKey;delete driven.pinRadius;
check('齒輪成對建立且從動輪嚙合驅動輪', gears().length === 2 && driven.mesh === driver.id);
const initialModule = driver.module, initialDrivenTeeth = driven.teeth;
check('節圓半徑參數 = teeth·module/2', S.topo.params[driver.radiusParam] === driver.teeth * initialModule / 2 && S.topo.params[driven.radiusParam] === driven.teeth * initialModule / 2);
check('兩輪中心距 = 兩節圓半徑和（相切）', tangent(driver, driven));
check('放下即選取從動輪', S.selectedGearId === driven.id);

// ---- 改齒數 / 模數：半徑同步且保持嚙合 ----
editor.changeGearTeeth(2);
check('改齒數後半徑參數同步且仍相切', driven.teeth === initialDrivenTeeth + 2 && S.topo.params[driven.radiusParam] === driven.teeth * initialModule / 2 && tangent(driver, driven));
editor.changeGearModule(1);
check('改模數整鏈共用且仍相切', driver.module === initialModule + 1 && driven.module === initialModule + 1 && tangent(driver, driven));
const state = editor.gearDriveState(driven);
check('傳動比 = −(驅動節圓半徑/從動節圓半徑)', state && Math.abs(state.factor + S.topo.params[driver.radiusParam] / S.topo.params[driven.radiusParam]) < 1e-9);

// ---- 嚙合防呆：兩中心都接地但距離錯 → 紅環警告 ----
driver.p1.type = 'fixed';
driven.p1.type = 'fixed';
Model.updatePointCoordsById(S.comps, driven.p1.id, driver.p1.x + 30, driver.p1.y); // 拉到錯誤中心距
check('接地且中心距錯誤時偵測脫嚙', editor.gearMeshOff(driven) === true);

// ---- 刪除：只刪選到的齒輪，被它帶動的留下並放開嚙合；參數跟著該齒輪清掉 ----
deleteGear(driver.id);
check('刪驅動輪只刪它自己，從動輪留下且不再嚙合', gears().length === 1 && gears()[0].id === driven.id && !('mesh' in gears()[0]) && !(driver.radiusParam in S.topo.params) && driven.radiusParam in S.topo.params);
deleteGear(driven.id);
check('再刪從動輪後齒輪與參數都清空', gears().length === 0 && !Object.keys(S.topo.params).some(k => /^G(R|PR)/.test(k)));

// ---- 齒條齒輪：建立、行程範圍、刪除連齒條與導銷 ----
editor.addRackPinion();
const pinion = gears()[0];
const rack = S.comps.find(c => c.type === 'rack');
check('齒條組建立：小齒輪＋齒條＋兩導銷', !!pinion && !!rack && rack.pinion === pinion.id && S.comps.filter(c => c.type === 'anchor').length === 2);
const range = editor.rackPinionThetaRange();
check('有限齒條回傳有限 theta 範圍', !!range && Number.isFinite(range.lo) && Number.isFinite(range.hi) && range.lo < range.hi);
const lenBefore = S.topo.params[rack.lenParam];
const beforeDecline=JSON.stringify({comps:S.comps,params:S.topo.params}),undoBefore=undos;window.confirm=()=>false;
editor.changeRackLength(8);
check('拒絕更新導銷孔位不改齒條、不新增復原',beforeDecline===JSON.stringify({comps:S.comps,params:S.topo.params})&&undos===undoBefore);
window.confirm=()=>true;
editor.changeRackLength(8);
check('齒條長度 +8 並保持 8mm 對齊', S.topo.params[rack.lenParam] === lenBefore + 8 && S.topo.params[rack.lenParam] % 8 === 0);
editor.changeRackLength(.5);editor.changeRackSlotLength(.5);
check('齒條及槽長的數字輸入保留小數',S.topo.params[rack.lenParam]===lenBefore+8.5&&rack.slot.length%1===.5);
const {normalizeSnapshot,toSnapshot}=await import('../js/blocks/schema.js');
const rackSaved=normalizeSnapshot(toSnapshot(S.comps,S.topo,1));
check('齒條小數尺寸保存重開不取整',rackSaved.params[rack.lenParam]===lenBefore+8.5&&rackSaved.comps.find(c=>c.id===rack.id).slot.length===rack.slot.length);
deleteGear(pinion.id);
check('刪小齒輪連齒條與導銷一起刪', S.comps.length === 0 && !Object.keys(S.topo.params).some(k => /^(G|RK)/.test(k)));

// ---- 面板：取消選取隱藏編輯器 ----
editor.deselectGear();
check('取消選取後齒輪面板隱藏', S.selectedGearId === null && document.getElementById('gearEditor').style.display === 'none');

// ---- 共軸複合列：同一入口改整鏈模數、同步各軸並一次復原 ----
const {MAD_BOX_EXAMPLE}=await import('../js/blocks/iq-mad-box-example.js');
const mad=normalizeSnapshot(structuredClone(MAD_BOX_EXAMPLE.snapshot));
S.comps=mad.comps;S.topo={params:mad.params};S.modules=[];S.selectedGearId='MadF';
const beforeCompound=undos;editor.changeGearModule(1);
check('共軸三段改模數共用一次提交',undos===beforeCompound+1&&gears().every(g=>g.module===3));
check('共軸三段所有嚙合保持相切',gears().filter(g=>g.mesh).every(g=>tangent(g,gears().find(a=>a.id===g.mesh))));
check('四軸間距依序同步為72mm',gears().find(g=>g.id==='MadF').p1.x===216);
const madBefore=S.comps.length;deleteGear('MadC');
check('刪除複合列中的一個齒輪只刪它自己，沒有任何嚙合還指向它',S.comps.length===madBefore-1&&!gears().some(g=>g.id==='MadC'||g.mesh==='MadC'));

report('gear-editor');
