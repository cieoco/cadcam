// 液壓第二期 P2-3（H06 三軸手臂）補充：預設動作序列（H05 不變）、範例內的安裝資料與 mountOrthogonal 一致、教材與版本登錄。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hydraulicLiftGripSnapshot as H05,hydraulicArmSnapshot as H06} from '../js/blocks/hydraulic-assembly-example.js';
import {DEFAULT_HYDRAULIC_SEQUENCE,prepareHydraulicSequence,sequenceExtensionsAt,sequenceSyringeOptions} from '../js/blocks/hydraulic-sequence.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {rebakeModules,orthogonalHostEdge} from '../js/blocks/assembly.js';
import {mountOrthogonal} from '../js/blocks/module-ops.js';
import {ADAPTER_LENGTH_MM} from '../js/blocks/orthogonal-joint.js';
import {pointCoords} from '../js/blocks/model.js';
let pass=0;const ok=(cond,msg)=>{assert.ok(cond,msg);pass++;console.log('PASS',msg);};
const near=(a,b,t=1e-6)=>Math.abs(a-b)<=t;
const load=snap=>{const n=normalizeSnapshot(structuredClone(snap)),rb=rebakeModules(n.comps,n.modules,n.params);return {comps:rb.comps,modules:rb.modules,params:n.params};};

// ---------- H05 預設序列不變（字面值取自 P2-2 的實作輸出）----------
const h5=load(H05),seq5=DEFAULT_HYDRAULIC_SEQUENCE(h5);
assert.deepEqual(seq5,[
  {name:'張開',syringe:'H3Syringe',extension:0,seconds:2},
  {name:'降到取物位',syringe:'H2Syringe',extension:0,seconds:2.5},
  {name:'夾緊',syringe:'H3Syringe',extension:20,seconds:2},
  {name:'升起',syringe:'H2Syringe',extension:20,seconds:2.5},
  {name:'放開',syringe:'H3Syringe',extension:0,seconds:2}]);
ok(true,'H05 預設序列與 P2-2 完全相同（五步、兩支針筒）');
const n5=normalizeSnapshot(structuredClone(H05));
assert.deepEqual(DEFAULT_HYDRAULIC_SEQUENCE(n5),seq5);ok(true,'H05 不論是否 rebake，預設序列一樣');

// ---------- H06 預設序列：三軸取放 ----------
const h6=load(H06),seq=DEFAULT_HYDRAULIC_SEQUENCE(h6);
const syr=h6.comps.filter(c=>c.type==='syringe'),byModule=m=>syr.find(c=>c.moduleId===m).id;
const base=byModule('Base'),lift=byModule('Lift'),grip=byModule('Grip');
ok(seq.map(s=>s.name).join('→')==='轉到取物方向→張開→降到取物位→夾緊→升起→轉到放置方向→放開','H06 預設七步：轉到取物方向→張開→降→夾緊→升→轉到放置方向→放開');
ok(seq.map(s=>s.syringe).join()===[base,grip,lift,grip,lift,base,grip].join(),'每一步推哪支針筒：底盤、夾爪、升降、夾爪、升降、底盤、夾爪');
ok(seq[0].extension===0&&seq[5].extension===20,'底盤：取物方向 0 mm，放置方向行程末端 20 mm');
ok(seq.every(s=>s.seconds>=0.5&&s.seconds<=5&&Number.isFinite(s.extension)),'每步秒數與伸出量合法');
const start=Object.fromEntries(syr.map(c=>[c.id,c.extension]));
const before=JSON.stringify(h6);
const plan=prepareHydraulicSequence(h6,seq,start);
ok(plan.ok,`H06 預設序列通過驗證（${plan.message||''}）`);
ok(JSON.stringify(h6)===before,'不改傳入資料');
let need=0,prev={...start};for(const s of seq){need+=Math.ceil(Math.abs(s.extension-prev[s.syringe])/0.5);prev[s.syringe]=s.extension;}
ok(plan.samples>=need,`每 0.5 mm 至少驗一次（${plan.samples} ≥ ${need}）`);
const at0=sequenceExtensionsAt(plan,0).extensions,end=sequenceExtensionsAt(plan,plan.duration).extensions;
ok(syr.every(c=>near(at0[c.id],start[c.id])),'t=0 為起始伸出量');
ok(near(end[base],20)&&near(end[grip],0)&&near(end[lift],20),'結束：底盤 20、夾爪 0、升降 20');
// 動作確實是取放：降到取物位時工具端比升起時低；轉到放置方向時升降平面的方位角改變很大
const tool=h6.modules.find(m=>m.id==='Lift').outputs[0].at;
const solved=ext=>plan.solve({...start,...ext}).result;
const lowAt=solved({[base]:0,[lift]:0}).points[tool].y,highAt=solved({[base]:0,[lift]:20}).points[tool].y;
const yawOf=ext=>solved(ext).orthogonal.Lift.now.a;
const dyaw=Math.abs(((yawOf({[base]:20})-yawOf({[base]:0}))%360+540)%360-180);
ok(highAt-lowAt>15,`升降針筒推出＝工具端升高（${(highAt-lowAt).toFixed(1)} mm），預設序列的「降」是縮回 0 mm`);
ok(seq[2].extension===0&&seq[4].extension===20,'「降到取物位」＝升降 0 mm、「升起」＝20 mm');
ok(dyaw>60&&dyaw<100,`取物與放置方向差 ${dyaw.toFixed(1)}°（轉盤帶著整組升降轉）`);
ok(sequenceSyringeOptions(h6).map(o=>o.label).join()==='旋轉底盤 針筒,升降 針筒,夾爪 針筒','動作序列的針筒下拉選單：旋轉底盤／升降／夾爪');
// 設計不合法時仍會擋：夾爪針筒推到 25 mm、或底盤針筒負值
ok(!prepareHydraulicSequence(h6,[{name:'x',syringe:base,extension:25,seconds:1}],start).ok,'超出行程的步驟被拒絕');

// ---------- 範例內的安裝資料 ＝ 學生在組立台「直角安裝」得到的形狀 ----------
{
  const n=normalizeSnapshot(structuredClone(H06));
  const comps=n.comps,mods=n.modules.map(m=>m.id==='Lift'?{...m,mount:null}:m);
  const lift=n.modules.find(m=>m.id==='Lift');
  const r=mountOrthogonal(comps,mods,'Lift',{module:'Base',body:lift.mount.to.body,edge:lift.mount.to.edge,side:lift.mount.orient.side},n.params,{activeMotor:'1',theta:0,motorAngles:{}});
  ok(r.ok,`mountOrthogonal 對同一條邊可安裝（${r.reason}）`);
  const made=r.modules.find(m=>m.id==='Lift').mount,mine=lift.mount;
  assert.deepEqual(mine.to,made.to);ok(true,'to（模組、轉盤、邊）相同');
  ok(near(mine.ref.x,made.ref.x)&&near(mine.ref.y,made.ref.y)&&near(mine.ref.a,made.ref.a,1e-6),'ref（邊的位姿）相同');
  ok(mine.orient.type===made.orient.type&&mine.orient.edge===made.orient.edge&&mine.orient.side===made.orient.side,'orient 型態、edge、side 相同');
  assert.deepEqual(mine.orient.joint,made.orient.joint);ok(true,'接合件（列印轉接座）相同');
  assert.deepEqual(mine.home,made.home);ok(true,'home 相同');
  // 範例刻意改的兩個欄位：childAxisDeg 180（升降「上」朝 +z）、offsetMm＝邊上最遠處（邊長/2−轉接座長）。
  const edge=orthogonalHostEdge(comps,n.modules,{to:mine.to,orient:{side:mine.orient.side}},pointCoords(comps),n.params);
  ok(mine.orient.childAxisDeg===180,'childAxisDeg 180');
  ok(near(mine.orient.offsetMm,Math.floor((edge.lengthMm/2-ADAPTER_LENGTH_MM)*10)/10),`offsetMm＝⌊(邊長/2−轉接座長 ${ADAPTER_LENGTH_MM})·10⌋/10＝${mine.orient.offsetMm}（範例內的常數 20 與 orthogonal-joint 一致）`);
  ok(mine.orient.offsetMm<=edge.lengthMm/2-ADAPTER_LENGTH_MM+1e-9&&mine.orient.offsetMm>=-edge.lengthMm/2,'offsetMm 在轉接座可滑動的範圍內');
  ok(edge.lengthMm>=ADAPTER_LENGTH_MM,`宿主邊 ${edge.lengthMm.toFixed(1)} mm ≥ 轉接座 ${ADAPTER_LENGTH_MM} mm`);
}

// ---------- 版本、教材、清單 ----------
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const info=read('../js/version-history.js');
ok(info.split('\n').some(l=>/^\s*\['2026\./.test(l)&&/H06/.test(l)),'更新紀錄有一筆提到 H06');
const t=read('../teaching-hydraulic.html');
ok(/第十一單元/.test(t)&&/H06/.test(t)&&/動作序列/.test(t)&&/13\s*mm/.test(t)&&/h06-mobile\.png/.test(t),'教材第十一單元：動作序列、轉盤條寬 ≥ 13 mm 的限制、手機截圖');
console.log(`hydraulic-p2-3b: ${pass} passed`);
