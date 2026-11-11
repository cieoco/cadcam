// Pack O3-C (docs/SDD-OPERATION-PIPELINE.md): resize keeps ONE rule whether it comes from a size handle or from the numeric field.
// Resize commits through member-editor setDimensionValue -> resizeStandardBlank (pure plan: candidate + `follow`) -> commitMountingEdit
// (integrityGate before/after, mounting review, ONE pushUndo). This test pins the shared contract:
//   handle value N (exact:false, already rounded to 1 mm) and typed N (exact:true) give identical data;
//   one undo restores; a refusal changes nothing and says why; a pre-existing problem elsewhere does not block an unrelated resize.
import {readFileSync} from 'node:fs';
import {check,report} from './_harness.mjs';
import {S} from '../js/blocks/state.js';
import {createMemberEditor} from '../js/blocks/member-editor.js';
import {normalizeSnapshot,alignSavedInputPhase} from '../js/blocks/schema.js';
import {readStoredProject} from '../js/blocks/project-envelope.js';
import {getExample,loadUnitStarts} from '../js/blocks/examples.js';
import {makeStandardBlank} from '../js/blocks/standard-blank.js';
import {loadIntegrity} from '../js/blocks/integrity-gate.js';
import {checkWork} from '../js/blocks/integrity.js';
await loadIntegrity();await loadUnitStarts();

class FakeElement{constructor(){this.children=[];this.style={};this.dataset={};this.parentElement={style:{}};this.value='';this.textContent='';this.attributes={};}
 closest(){return this.parentElement;}replaceChildren(...c){this.children=c;}append(...c){this.children.push(...c);}before(){}setAttribute(k,v){this.attributes[k]=String(v);}}
const elements=new Map();
globalThis.document={getElementById:id=>{if(!elements.has(id))elements.set(id,new FakeElement());return elements.get(id);},createElement:()=>new FakeElement()};
globalThis.window={confirm:()=>true,alert(){}};

let notices=[],undo=[];
const editor=createMemberEditor({pause(){},rebuild(){},draw(){},reshapeTriangle(){},updatePointCoordsById(){},pushUndo:()=>undo.push(JSON.stringify({comps:S.comps,params:S.topo.params})),notify:m=>notices.push(m)});
const FIX=new URL('./fixtures/',import.meta.url);
const fixture=n=>alignSavedInputPhase(normalizeSnapshot(readStoredProject(JSON.parse(readFileSync(new URL(n,FIX),'utf8')))));
function reset(s){Object.assign(S,{comps:structuredClone(s.comps),modules:structuredClone(s.modules||[]),topo:{...S.topo,params:{...s.params}},fabrication:s.fabrication,theta:0,activeMotor:'1',motorAngles:{}});notices=[];undo=[];}
const state=()=>JSON.stringify({comps:S.comps,params:S.topo.params,modules:S.modules});
const comp=id=>S.comps.find(c=>c.id===id);
// the two ways a student gives a number
const byHandle=(id,axis,v)=>editor.setDimensionValue(id,axis,Math.round(v),{exact:false});
const byNumber=(id,axis,v)=>editor.setDimensionValue(id,axis,v,{exact:true});

const connected=fixture('connected-resize.json'),blocked=fixture('delete-blocked.json');
const bell=normalizeSnapshot(structuredClone(getExample('bell-crank-gripper').snapshot));
const freeL=(()=>{const m=makeStandardBlank({kind:'l',n:1});return {comps:[m.comp],params:{theta:0,...m.params},modules:[]};})();
const freePlate=(()=>{const m=makeStandardBlank({kind:'plate',n:1});return {comps:[m.comp],params:{theta:0,...m.params},modules:[]};})();

// ---- parity: same number from a handle and from the field -> byte-identical work, same undo, same notices
const CASES=[
  ['已接桿件 長度 +1 孔',connected,'Blank136','g',c=>S.topo.params[c.lenParam]+8],
  ['已接桿件 長度 −1 孔',connected,'Blank137','g',c=>S.topo.params[c.lenParam]-8],
  ['機架板 長向',connected,'Blank133','g',()=>S.topo.params['Blank133.G']+8],
  ['機架板 直向',connected,'Blank133','r1',()=>S.topo.params['Blank133.H']+8],
  ['自由板材 長向',freePlate,'__first','g',c=>S.topo.params[c.gParam]+16],
  ['L型件 長向',freeL,'__first','g',c=>S.topo.params[c.gParam]+16],
  ['L型件 臂寬',freeL,'__first','arm',c=>c.standardBlank.armWidthMm+8],
  ['彎桿 第1臂長（孔數）',bell,'__arms','arm0',c=>(c.standardBlank.arms?.[0]?.holes??c.arms?.[0]?.holes??4)+1]
];
for(const [label,work,pid,axis,target] of CASES){
  const id=pid==='__first'?work.comps[0].id:pid==='__arms'?work.comps.find(c=>c.standardBlank?.kind==='arms').id:pid;
  reset(work);const c0=comp(id),v=target(c0);
  byHandle(id,axis,v);const h={state:state(),undo:undo.length,notices:[...notices]};
  reset(work);byNumber(id,axis,v);const n={state:state(),undo:undo.length,notices:[...notices]};
  check(`${label}：把手與數字欄結果完全相同`,h.state===n.state,'');
  check(`${label}：同樣一次復原、同樣的回饋`,h.undo===n.undo&&JSON.stringify(h.notices)===JSON.stringify(n.notices));
  if(h.undo===1){const before=(reset(work),state());byNumber(id,axis,v);const s=JSON.parse(undo.pop());S.comps=s.comps;S.topo.params=s.params;check(`${label}：一次復原回到原狀`,state()===before);}
  else check(`${label}：（此尺寸被拒絕或不變，兩條路一致）`,h.notices.join()===n.notices.join(),h.notices.join());
}
// a decimal typed in the field is kept; the handle only ever hands over whole millimetres (see AGENTS.md)
reset(freePlate);const id0=freePlate.comps[0].id;byNumber(id0,'g',freePlate.params[freePlate.comps[0].gParam]+12.5);
check('數字欄的小數不被取整（把手才取整）',Number.isFinite(S.topo.params[comp(id0).gParam])&&S.topo.params[comp(id0).gParam]===freePlate.params[freePlate.comps[0].gParam]+12.5||notices.length>0);

// ---- refusals: both paths refuse the same way, change nothing, and say why in plain words
for(const [label,via] of [['把手',byHandle],['數字欄',byNumber]]){
  reset(connected);const before=state();via('Blank133','r1',24);
  check(`${label}：縮小會移除已使用的孔→拒絕、作品不變、沒有復原點`,state()===before&&undo.length===0&&notices.length===1&&/孔/.test(notices[0])&&/解除/.test(notices[0])&&!/Blank\d|_H\d/.test(notices[0]),notices.join('|'));
}
// ---- an existing problem elsewhere does not block an unrelated resize (the gate only refuses what this edit newly causes)
reset(blocked);
check('夾具：作品原本就有問題（馬達離開座板原孔）',checkWork({comps:S.comps,modules:S.modules,params:S.topo.params}).length>0);
const L0=S.topo.params[comp('Blank137').lenParam];
byNumber('Blank137','g',L0+8);
check('原本的舊問題不擋不相干的改尺寸（數字欄）',S.topo.params[comp('Blank137').lenParam]===L0+8&&undo.length===1&&notices.length===0,notices.join('|'));
reset(blocked);byHandle('Blank137','g',L0+8);
check('原本的舊問題不擋不相干的改尺寸（把手）',S.topo.params[comp('Blank137').lenParam]===L0+8&&undo.length===1&&notices.length===0,notices.join('|'));
// ---- a resize that would itself create a new problem is still refused (the gate is not switched off)
reset(blocked);const stateBefore=state();byNumber('Blank133','g',16);
check('新造成的問題仍被擋下（縮小機架板會讓馬達孔消失）',state()===stateBefore&&undo.length===0&&notices.length>=1,notices.join('|'));
// ---- the mounting-change confirmation runs INSIDE the shared pipeline (runEdit `confirm` stage): accept -> one commit, decline -> nothing changes
{
  const lift=normalizeSnapshot(structuredClone(getExample('lift-bucket').snapshot)),id='Link3';
  let asked=0,answer=true;globalThis.window.confirm=()=>{asked++;return answer;};
  reset(lift);const L=S.topo.params[comp(id).lenParam],start=state();
  answer=false;byNumber(id,'g',L+8);
  check('確認視窗按取消：作品完全不變、沒有復原點、只說一句「已取消，未套用。」',state()===start&&undo.length===0&&asked===1&&notices.length===1&&notices[0]==='已取消，未套用。',notices.join('|'));
  reset(lift);asked=0;answer=true;byNumber(id,'g',L+8);const accepted=state();
  check('確認視窗按確定：套用一次、一次復原點、只問一次',S.topo.params[comp(id).lenParam]===L+8&&undo.length===1&&asked===1&&notices.length===0,`${asked} ${undo.length} ${notices.join('|')}`);
  reset(lift);asked=0;byHandle(id,'g',L+8);
  check('確認流程：把手與數字欄結果相同、同樣只問一次',state()===accepted&&undo.length===1&&asked===1);
  const held=(reset(lift),comp(id));byNumber(id,'g',L+8);
  check('面板手上拿著的零件物件在套用後仍是同一個（保留身分）',comp(id)===held&&S.topo.params[held.lenParam]===L+8);
  globalThis.window.confirm=()=>true;
}
report('resize-pipeline');
