// Pack O0 of docs/SDD-OPERATION-PIPELINE.md: run the 零件 × 動作 matrix (js/blocks/operation-matrix.js) against the REAL modules.
//
//   node test/operation-matrix.mjs
//
// - every 'ok' case with a `check` must pass; an 'ok' case with neither `check` nor `unverified` fails the suite
// - every 'gap' case with a `check` is run as known(): the check returns true while the gap STILL reproduces. It never fails the suite;
//   when a fix lands the line flips to "GAP CLOSED" so the matrix can be updated (status -> 'ok')
// - prints counts per action and the gap list; exits 0 on the current code base
import {readFileSync} from 'node:fs';
import {check,report} from './_harness.mjs';

// ------------------------------------------------------------------ fake DOM (delete-part, node-editor, Panels)
class FakeElement{
  constructor(){this.children=[];this.style={};this.dataset={};this.attributes={};this.textContent='';this.value='';this.classList={toggle(){},add(){},remove(){}};this.parentElement={style:{}};}
  appendChild(c){return c;}append(){}before(){}after(){}replaceChildren(){}setAttribute(){}closest(){return this.parentElement;}
  querySelector(){return null;}querySelectorAll(){return [];}addEventListener(){}
}
const els=new Map();
globalThis.document={getElementById:id=>{if(!els.has(id))els.set(id,new FakeElement());return els.get(id);},createElement:()=>new FakeElement()};
globalThis.window={confirm:()=>true,alert(){}};

const R='../js/blocks/';
const {PARTS,ACTIONS,MATRIX,listCases}=await import(R+'operation-matrix.js');
const {S}=await import(R+'state.js');
const Model=await import(R+'model.js');
const Panels=await import(R+'panels.js');
const ConnectOps=await import(R+'connect-ops.js');
const {normalizeSnapshot}=await import(R+'schema.js');
const {readStoredProject}=await import(R+'project-envelope.js');
const {deleteSelectedPart}=await import(R+'delete-part.js');
const {targetOf}=await import(R+'selection-target.js');
const {integrityGate,loadIntegrity}=await import(R+'integrity-gate.js');
const {checkWork}=await import(R+'integrity.js');
const MR=await import(R+'motor-release.js');
const {planMemberCopy}=await import(R+'member-copy.js');
const {releaseSelectedMesh}=await import(R+'gear-plan.js');
const {resizeStandardBlank,makeStandardBlank}=await import(R+'standard-blank.js');
const {getExample,loadUnitStarts}=await import(R+'examples.js');
const {planSyringeDisconnect}=await import(R+'syringe-operations.js');
const {planDraggedMotorOutput}=await import(R+'motor-drop.js');
const {localHoles}=await import('../js/core/local-holes.js');
const {pointKeysFor}=await import(R+'part-types.js');
const Rig=await import('./_drag-rig.mjs');
const {showHoleOwner}=await import(R+'hole-owner.js');
const {commitMountingEdit}=await import(R+'mounting-review-ui.js');
await loadIntegrity();await loadUnitStarts();

// ------------------------------------------------------------------ works
const FIX=new URL('./fixtures/',import.meta.url);
const fixture=n=>normalizeSnapshot(readStoredProject(JSON.parse(readFileSync(new URL(n,FIX),'utf8'))));
const example=id=>normalizeSnapshot(structuredClone(getExample(id).snapshot));
const blocks=(...made)=>({comps:made.map(m=>m.comp),params:Object.assign({theta:0},...made.map(m=>m.params)),modules:[]});
const blocked=()=>fixture('delete-blocked.json');                 // plate + TT motor off its plate hole (existing problem) + input bar + coupler + free-end bar
const repaired=()=>{const w=blocked(),back=MR.planMotorReturn(w,MR.offPlateMotors(w.comps)[0].id);return {...w,comps:back.comps,params:back.params};};
const released=()=>{const w=repaired(),r=MR.planMotorRelease({comps:w.comps,params:w.params,fabrication:w.fabrication,modules:w.modules},'Blank135',{},{});return {...w,comps:r.comps,params:r.params,plan:r};};
const comp=(w,id)=>w.comps.find(c=>c.id===id);

function load(w){
  S.comps=structuredClone(w.comps);S.modules=structuredClone(w.modules||[]);S.topo={params:{...w.params},tracePoints:[],dimensions:[],loads:[]};S.fabrication=w.fabrication;S.mode='design';S.counter=500;
  S.selectedLinkId=S.selectedTriangleId=S.selectedNodeId=S.selectedSliderId=S.selectedGearId=null;
}
// As delete-part is called from app.js (Delete key / 刪除選取 button). `sel` is what the app would have in the S.selected* fields.
function del(w,sel){
  load(w);Object.assign(S,sel);
  const msgs=[],before=JSON.stringify([S.comps,S.topo.params]);let pushes=0;
  deleteSelectedPart({S,transient:m=>msgs.push(m),pushUndo(){pushes++;},pause(){},closeMobileEditPanel(){},setSliderDetailRows(){},rebuild(){},draw(){},points:{},flash(){}});
  return {changed:before!==JSON.stringify([S.comps,S.topo.params]),msgs,pushes,ids:S.comps.map(c=>c.id)};
}
const compsOfPoint=(w,id)=>w.comps.filter(c=>pointKeysFor(c).some(k=>c[k]?.id===id));
const noop=()=>{};
let notices=[],pushCount=0;
Panels.init({pointCoords:()=>Model.pointCoords(S.comps),sliderMountInfo:()=>null,roleLabel:()=>'',triParamFor:()=>'',hasPoint:id=>Model.hasPoint(S.comps,id),
  motorBarForCenter:()=>null,pointUseCount:()=>0,pointIsGround:id=>Model.pointIsGround(S.comps,id),isGroundPositionUnlocked:()=>false});

// ------------------------------------------------------------------ checks
// A check returns true (or {pass,detail}). For an 'ok' case: true = the expected behaviour holds.
// For a 'gap' case: true = the gap still reproduces exactly as described in `now`.
const resizeOf=(w,id,axis,v)=>resizeStandardBlank(comp(w,id),w.params,axis,v,{comps:w.comps,modules:w.modules||[]});
const freeBar=()=>blocks(makeStandardBlank({kind:'bar',n:1}));
const freePlate=()=>blocks(makeStandardBlank({kind:'plate',n:1}));
const freeL=()=>blocks(makeStandardBlank({kind:'l',n:1}));
const groundedL=()=>{const w=freeL();w.comps[0].p1.type='fixed';return w;};
const bell=()=>example('bell-crank-gripper');
const copyOf=(w,id,mode='copy')=>planMemberCopy({comps:w.comps,params:w.params,modules:w.modules||[],counter:700,id,mode});

async function dragSays(w,down,re){
  Rig.load(w);const before=JSON.stringify(S.comps);
  const click=await Rig.gesture(down,[]),msgs=await Rig.gesture(down,[[112,100],[140,110],[170,120]]);
  return click.length===0&&msgs.length===1&&re.test(msgs[0])&&!/Blank\d|P\d+s|_H\d/.test(msgs[0])&&JSON.stringify(S.comps)===before;
}
function ownerOf(w,id){load(w);S.selectedNodeId=id;let flashed=[];const title={textContent:'接點',dataset:{}};
  showHoleOwner(S,{querySelector:()=>title},true,{flash:ids=>{flashed=ids;}});return {title:title.textContent,flashed};}
async function overIdleHole(){
  const plate=makeStandardBlank({kind:'plate',n:1}),bar=makeStandardBlank({kind:'bar',n:2});plate.comp.p1.type=plate.comp.p2.type='fixed';
  const w=blocks(plate,bar),hole=localHoles(plate.comp)[1].id;
  Rig.load(w);Rig.dom.unused.add(hole);Rig.dom.under=[Rig.partEl(bar.comp.id),Rig.partEl(plate.comp.id)];
  const tap=await Rig.gesture(Rig.nodeDown(hole),[]),tapKept=JSON.stringify(S.comps)===JSON.stringify(w.comps)&&S.selectedNodeId===hole&&tap.length===0;
  const a=Model.pointCoords(S.comps);await Rig.gesture(Rig.nodeDown(hole),[[112,104],[150,130],[200,160]]);const b=Model.pointCoords(S.comps),id=bar.comp.p1.id;
  return tapKept&&Math.hypot(b[id].x-a[id].x-100,b[id].y-a[id].y-60)<1e-6;
}
async function resizeConfirmCancel(){
  const lift=example('lift-bucket'),{createMemberEditor}=await import(R+'member-editor.js');let answer=false,asked=0,undo=0;const said=[];
  globalThis.window.confirm=()=>{asked++;return answer;};
  const ed=createMemberEditor({pause:noop,rebuild:noop,draw:noop,reshapeTriangle:noop,updatePointCoordsById:noop,pushUndo:()=>undo++,notify:m=>said.push(m)});
  load(lift);const L=S.topo.params[comp(lift,'Link3').lenParam],before=JSON.stringify([S.comps,S.topo.params]);
  ed.setDimensionValue('Link3','g',L+8,{exact:true});
  const cancelled=asked===1&&undo===0&&said.join('|')==='已取消，未套用。'&&JSON.stringify([S.comps,S.topo.params])===before;
  answer=true;said.length=0;ed.setDimensionValue('Link3','g',L+8,{exact:true});
  globalThis.window.confirm=()=>true;
  return cancelled&&undo===1&&S.topo.params[comp(lift,'Link3').lenParam]===L+8;
}
// O4：齒輪刪除只刪選到的一個；分開咬合
const gearOnly=()=>{const w=example('reduction-gear-train'),r=del(w,{selectedGearId:'GearB'}),g=S.comps.find(c=>c.id==='GearC');
  return r.changed&&r.ids.join()==='GearA,GearC'&&!('mesh' in g)&&r.pushes===1&&r.msgs.length===1&&/不再被它帶動/.test(r.msgs[0])&&!/Gear[A-Z]/.test(r.msgs[0]);};
const gearRelease=()=>{load(example('gear-pair'));S.selectedGearId='GearB';const msgs=[],before=JSON.stringify(S.comps);let pushes=0;
  releaseSelectedMesh({S,transient:m=>msgs.push(m),pushUndo(){pushes++;},pause(){},rebuild(){},draw(){}});
  return pushes===1&&msgs.length===1&&/分開，不再嚙合/.test(msgs[0])&&S.comps.every(c=>!('mesh' in c))&&JSON.stringify(S.comps.map(c=>c.p1))===JSON.stringify(JSON.parse(before).map(c=>c.p1));};
// O4: gear editor rows (real createGearEditor on the shared S) and slider / box-panel rows
async function gearEditorOn(w){
  load(w);S.mode='design';const noop2=()=>{};
  const {createGearEditor}=await import(R+'gear-editor.js');
  return createGearEditor({pushUndo:noop2,pause:noop2,rebuild:noop2,draw:noop2,renderFrame:noop2,transient:noop2,scheduleAutosave:noop2,cancelMotorMode:noop2,exitDrawTools:noop2,
    openMobileEditPanel:noop2,closeMobileEditPanel:noop2,hideEditorPanels:noop2,snapshotStr:()=>'',updateUndoBtn:noop2,recordManualTrace:noop2,worldFromEvent:()=>null,mobilePrompt:()=>false,
    pointCoords:()=>Model.pointCoords(S.comps),updatePointCoordsById:(id,x,y)=>Model.updatePointCoordsById(S.comps,id,x,y),pointIsGround:id=>Model.pointIsGround(S.comps,id)});
}
const tangentPair=()=>{const g=S.comps.filter(c=>c.type==='gear'),[a,b]=g,R1=S.topo.params[a.radiusParam],R2=S.topo.params[b.radiusParam];return g.length===2&&b.mesh===a.id&&Math.abs(Math.hypot(b.p1.x-a.p1.x,b.p1.y-a.p1.y)-(R1+R2))<1e-6;};
const CHECKS={
  'gear-add-pair-tangent':async()=>{const ed=await gearEditorOn({comps:[],params:{theta:0},modules:[]});ed.addGearPair();return tangentPair();},
  'gear-resize-keeps-mesh':async()=>{const ed=await gearEditorOn({comps:[],params:{theta:0},modules:[]});ed.addGearPair();ed.changeGearTeeth(2);ed.changeGearModule(1);return tangentPair();},
  'release-slider-split':()=>{load(example('slider-crank'));S.selectedNodeId='P3';const msgs=[];let pushes=0;
    const ok=ConnectOps.splitSelected({S,transient:m=>msgs.push(m),pushUndo(){pushes++;},pause(){},rebuild(){},draw(){}});
    return ok&&pushes===1&&msgs.length===1&&/從這個接點分開/.test(msgs[0])&&S.comps.find(c=>c.id==='Slider1').p3.id!==S.comps.find(c=>c.id==='Link2').p2.id;},
  'del-boxpanel-refused':()=>{const w=blocked();w.comps.find(c=>c.id==='Blank133').boxPanel=true;const r=del(w,{selectedTriangleId:'Blank133'});return !r.changed&&r.pushes===0&&r.msgs.length===1&&r.msgs[0].includes('卡榫盒子');},
  'select-overlap-list':async()=>{const {collectBodyCandidates}=await import(R+'overlap-picker.js');const el=id=>({getAttribute:k=>k==='data-pick-component'?id:null}),hit=[el('B'),el('A'),el('B')];
    const r=collectBodyCandidates({contains:()=>true,ownerDocument:{elementsFromPoint:()=>hit}},0,0,[{id:'A',type:'bar'},{id:'B',type:'gear'}]);return r.length===2&&r[0].id==='B'&&r[1].id==='A'&&/^整個「/.test(r[0].label);},
  'del-gear-only':gearOnly,
  'release-gear-mesh':gearRelease,
  'move-over-idle-hole':overIdleHole,
  'resize-confirm-cancel':resizeConfirmCancel,
  // --- select
  // still a gap: the target is only worked out when a command runs (delete explains and flashes); nothing marks the owner at selection time
  'select-shared-joint':()=>{const w=blocked(),t=targetOf({...S,selectedLinkId:null,selectedTriangleId:null,selectedSliderId:null,selectedGearId:null,selectedNodeId:'Blank136.B'},w.comps,[]);
    const o=ownerOf(w,'Blank136.B');
    return compsOfPoint(w,'Blank136.B').length===2&&t.part===null&&t.shared.length===2&&/共用/.test(del(w,{selectedNodeId:'Blank136.B'}).msgs[0]||'')&&/2 個零件共用/.test(o.title)&&o.flashed.length===2;},
  'select-plate-hole-owner':()=>{const w=blocked(),o=ownerOf(w,'Blank133_H8_0'),bar=ownerOf(w,'Blank137_H8_0');return o.flashed.join()==='Blank133'&&/^「.+」/.test(o.title)&&bar.flashed.join()==='Blank137'&&!/Blank\d|_H\d/.test(o.title+bar.title);},
  // --- move (Model.isFreeBody decides whether a body drag translates; otherwise input.js only selects / returns without a message)
  'move-free-bar':()=>{const w=freeBar();return Model.isFreeBody(w.comps,w.comps[0],[]);},
  'move-free-plate':()=>{const w=freePlate();return Model.isFreeBody(w.comps,w.comps[0],[]);},
  'move-free-l':()=>{const w=freeL();return Model.isFreeBody(w.comps,w.comps[0],[]);},
  'move-free-motor':()=>{const r=del(released(),{selectedTriangleId:'Blank133'});const m=S.comps.find(c=>c.type==='motor');return r.changed&&!!m&&Model.isFreeBody(S.comps,m,[]);},
  // O3-A: a drag that cannot act says why (once, after the drag threshold) and changes nothing — the real input.js through the fake-SVG rig
  'move-connected-bar-explained':()=>dragSays(blocked(),Rig.bodyDown('Blank136'),/已接上其他零件，不能單獨搬移/),
  'move-connected-hole-explained':()=>{const w=blocked(),c=comp(w,'Blank136'),h=localHoles(c)[0];return !!h&&dragSays(w,Rig.nodeDown(h.id),/這個孔屬於已接上其他零件/);},
  'move-connected-plate-explained':()=>dragSays(blocked(),Rig.bodyDown('Blank133'),/已接上其他零件，不能單獨搬移/),
  'move-connected-l-explained':()=>{const w=groundedL();return dragSays(w,Rig.bodyDown(w.comps[0].id),/已接上其他零件，不能單獨搬移/);},
  'move-connected-arms-explained':()=>{const w=bell(),c=w.comps.find(c=>c.standardBlank?.kind==='arms');return dragSays(w,Rig.bodyDown(c.id),/已接上其他零件，不能單獨搬移/);},
  'move-locked-vertex-explained':()=>{const t={id:'T',type:'triangle',p1:{id:'a',type:'fixed',x:0,y:0},p2:{id:'b',type:'fixed',x:80,y:0},p3:{id:'c',type:'floating',x:40,y:60},gParam:'g',r1Param:'r1',r2Param:'r2'};
    return dragSays({comps:[t],params:{g:80,r1:72.1,r2:72.1,theta:0},modules:[]},Rig.nodeDown('c'),/這個頂點已被相接的零件鎖住/);},
  'move-hosted-motor-explained':()=>{const w=released(),m=w.comps.find(c=>c.type==='motor');return !!m?.motorMount?.frameBody&&dragSays(w,Rig.nodeDown(m.p1.id),/馬達固定在座板上.*安裝設定/);},
  'gate-only-new':()=>{const w=blocked(),work={comps:w.comps,modules:w.modules||[],params:w.params};return checkWork(work).length>0&&integrityGate(work,{...work,comps:structuredClone(w.comps)},noop)===true;},
  'offplate-detected':()=>{const w=blocked(),items=MR.offPlateMotors(w.comps);return items.length===1&&MR.offPlateMessage(items[0]).includes('請選');},
  // --- resize
  'resize-bar-ok':()=>{const w=blocked(),r=resizeOf(w,'Blank136','g',24);return r.ok&&Number.isFinite(r.params[comp(w,'Blank136').lenParam]);},
  'resize-existing-problem-ok':()=>{const w=blocked(),c=comp(w,'Blank137'),r=resizeOf(w,'Blank137','g',w.params[c.lenParam]+8);load(w);let pushed=0;const said=[];
    const done=commitMountingEdit(S,d=>{d.comps[d.comps.findIndex(x=>x.id===c.id)]=r.comp;Object.assign(d.params,r.params);},{pushUndo:()=>pushed++,notify:m=>said.push(m)});
    return r.ok&&done&&pushed===1&&said.length===0&&S.topo.params[c.lenParam]===w.params[c.lenParam]+8;},
  'resize-plate-grow':()=>resizeOf(blocked(),'Blank133','g',48).ok,
  'resize-plate-lost-hole':()=>{const r=resizeOf(blocked(),'Blank133','g',16);return !r.ok&&/孔/.test(r.message)&&/解除/.test(r.message);},
  'resize-l-ok':()=>{const w=freeL();return resizeStandardBlank(w.comps[0],w.params,'g',w.params[w.comps[0].gParam]+16,{comps:w.comps}).ok;},
  'resize-motorbar-shaft-stays':()=>{const w=repaired(),c=comp(w,'Blank135'),r=resizeOf(w,'Blank135','g',24);return r.ok&&Math.hypot(r.comp.p2.x-c.p2.x,r.comp.p2.y-c.p2.y)<1e-6&&Math.hypot(r.comp.p1.x-c.p1.x,r.comp.p1.y-c.p1.y)>1;},
  // --- delete
  'del-bar-free-ok':()=>{const r=del(repaired(),{selectedLinkId:'Blank137'});return r.changed&&!r.ids.includes('Blank137')&&r.ids.includes('Blank136');},
  'del-connected-bar-ok':()=>{const r=del(repaired(),{selectedLinkId:'Blank136'});return r.changed&&!r.ids.includes('Blank136')&&r.ids.includes('Blank135')&&r.ids.includes('Blank137');},
  'del-hole-owner':()=>{const shared=del(blocked(),{selectedNodeId:'Blank136.B'}),own=del(blocked(),{selectedNodeId:'Blank137_H8_0'}),plate=del(blocked(),{selectedNodeId:'Blank133_H8_0'});
    return !shared.changed&&shared.msgs.length===1&&/共用/.test(shared.msgs[0])&&own.changed&&!own.ids.includes('Blank137')&&plate.changed&&!plate.ids.includes('Blank133');},
  'del-existing-problem-ok':()=>{const a=del(blocked(),{selectedLinkId:'Blank136'}),b=del(blocked(),{selectedLinkId:'Blank137'});
    return a.changed&&b.changed&&!a.msgs.concat(b.msgs).some(m=>m.includes('馬達軸心需保持在所選座板格位'));},
  'del-fused-refused':()=>{const w=example('six-bar-lift'),root=w.comps.find(c=>c.barFusionRoot);if(!root)return false;const r=del(w,{selectedLinkId:root.id});return !r.changed&&r.msgs.some(m=>m.includes('解除合成'));},
  'del-plate-plain':()=>{const w=freePlate(),r=del(w,{selectedTriangleId:w.comps[0].id});return r.changed&&!r.ids.length;},
  'del-plate-explains-detach':()=>{const r=del(repaired(),{selectedTriangleId:'Blank133'}),bar=S.comps.find(c=>c.id==='Blank135');
    return r.changed&&r.msgs.length===1&&/馬達.*獨立固定點/.test(r.msgs[0])&&bar?.p2.type==='fixed'&&!bar.motorMount?.frameBody;},
  'del-l-ok':()=>{const w=freeL(),r=del(w,{selectedTriangleId:w.comps[0].id});return r.changed&&!r.ids.length;},
  'del-arms-ok':()=>{const w=bell(),c=w.comps.find(c=>c.standardBlank?.kind==='arms'),r=del(w,{selectedTriangleId:c.id});return r.changed&&!r.ids.includes(c.id)&&r.ids.length===w.comps.length-1;},
  'del-slider-ok':()=>{const w=example('slider-crank'),s=w.comps.find(c=>c.type==='slider'),r=del(w,{selectedSliderId:s.id});return r.changed&&!r.ids.includes(s.id)&&r.ids.includes('Link1');},
  'del-motor-independent':()=>{const w=released(),m=w.comps.find(c=>c.type==='motor'),r=del(w,{selectedNodeId:m.p1.id});return r.changed&&!r.ids.includes(m.id)&&r.ids.includes('Blank133');},
  'del-motorbar-keeps-motor':()=>{const r=del(repaired(),{selectedLinkId:'Blank135'}),m=S.comps.find(c=>c.type==='motor');
    return r.changed&&!r.ids.includes('Blank135')&&m?.motorMount?.frameBody==='Blank133'&&!S.comps.some(c=>c.type==='bar'&&(c.isInput||c.motorMount))&&/馬達留在座板上，尚未接輸出/.test(r.msgs[0]||'');},
  'del-syringe-key-explained':()=>{const w=example('hydraulic-h01');if(!w.comps.some(c=>c.type==='syringe'))return false;const r=del(w,{});return !r.changed&&r.msgs.length===1&&r.msgs[0].includes('刪除針筒');},
  'del-anchor-explained':()=>{const w=example('slider-crank'),a=w.comps.find(c=>c.type==='anchor'),shared=del(w,{selectedNodeId:a.p1.id});
    const p=w.comps.flatMap(c=>pointKeysFor(c).map(k=>c[k])).filter(p=>p?.type==='fixed'),[p1,p2]=[p[0],p.find(q=>Math.hypot(q.x-p[0].x,q.y-p[0].y)>1)];
    const hole={id:'FrameHoleT',type:'anchor',name:'機架孔',p1:{id:'FrameHoleT.P',type:'fixed',x:p1.x,y:p1.y},frameHole:{a:p1.id,b:p2.id,u:0}},free=del({...w,comps:[...w.comps,hole]},{selectedNodeId:'FrameHoleT.P'});
    return !shared.changed&&shared.msgs.length===1&&/共用/.test(shared.msgs[0])&&free.changed&&!free.ids.includes('FrameHoleT')&&free.msgs.length===1;},
  // --- connect
  'connect-free-bars-ok':()=>{const a=makeStandardBlank({kind:'bar',n:1,origin:{x:0,y:0}}),b=makeStandardBlank({kind:'bar',n:2,origin:{x:200,y:100}});
    const w=blocks(a,b),r=Model.previewPointConnection(structuredClone(w.comps),{params:w.params},a.comp.p2.id,b.comp.p1.id);return r.ok&&Model.pointUseCount(r.comps,b.comp.p1.id)===2||r.ok&&r.comps.some(c=>c.id===b.comp.id);},
  'connect-refusal-message':()=>{const w=blocked(),r=Model.previewPointConnection(structuredClone(w.comps),{params:w.params},'P139s','Blank133_H8_32');return !r.ok&&typeof r.message==='string'&&r.message.length>6;},
  'connect-same-part-refused':()=>{const w=blocked(),r=Model.previewPointConnection(structuredClone(w.comps),{params:w.params},'Blank137_H8_0','Blank137_H16_0');return !r.ok&&/同一零件/.test(r.message);},
  'connect-motor-output':()=>{const w=released(),m=w.comps.find(c=>c.type==='motor'),loose=makeStandardBlank({kind:'bar',n:9,origin:{x:-400,y:0}});
    const src={comps:[...w.comps,loose.comp],params:{...w.params,...loose.params},modules:[],fabrication:w.fabrication,counter:900};
    const r=planDraggedMotorOutput(src,loose.comp.p1.id,m.p1.id,{},{thetaDeg:0});return r.matched&&r.ok;},
  'connect-motor-refuse-message':()=>{const w=released(),m=w.comps.find(c=>c.type==='motor'),r=planDraggedMotorOutput({comps:w.comps,params:w.params,modules:[],fabrication:w.fabrication,counter:900},'P139s',m.p1.id,{},{thetaDeg:0});
    return r.matched&&!r.ok&&/其他連接|多個零件/.test(r.message);},
  // --- release
  // O2: split goes through connect-ops.js (planSplit + runEdit): gate, one undo, a sentence naming what left, nothing else touched
  'release-split-explained':()=>{const w=blocked();load(w);notices=[];pushCount=0;S.selectedNodeId='Blank136.B';const before=JSON.stringify(S.comps),n=Model.pointRefs(S.comps,'Blank136.B').length;
    const done=ConnectOps.splitSelected({S,transient:m=>notices.push(m),pushUndo:()=>{pushCount++;},pause:noop,rebuild:noop,draw:noop});
    return n===2&&done&&pushCount===1&&Model.pointRefs(S.comps,'Blank136.B').length===1&&notices.length===1&&/從這個接點分開/.test(notices[0])&&!/Blank\d|P\d+s/.test(notices[0])&&before!==JSON.stringify(S.comps);},
  'release-motor-ok':()=>{const w=repaired(),r=MR.planMotorRelease({comps:w.comps,params:w.params,fabrication:w.fabrication,modules:w.modules},'Blank135',{},{});
    return r.ok&&/解除/.test(r.message)&&r.comps.some(c=>c.type==='motor')&&r.comps.some(c=>c.id==='Blank135');},
  'release-syringe-ok':()=>{const w=example('hydraulic-h01'),s=w.comps.find(c=>c.type==='syringe'),r=planSyringeDisconnect({comps:w.comps,params:w.params},s.id);return r.ok&&!r.syringe.b.componentId&&!!r.simulationIssue;},
  // --- copy
  'copy-bar':()=>{const w=freeBar(),r=copyOf(w,w.comps[0].id);return r.ok&&r.comps.length===1&&r.comps[0].id!==w.comps[0].id&&r.comps[0].holes?.length===w.comps[0].holes?.length;},
  'copy-connected-clean':()=>{const w=blocked(),r=copyOf(w,'Blank136'),ids=new Set(w.comps.flatMap(c=>pointKeysFor(c).map(k=>c[k].id)));return r.ok&&r.comps.every(c=>pointKeysFor(c).every(k=>!ids.has(c[k].id)&&c[k].type==='floating'));},
  'copy-mirror':()=>{const w=freeBar();return copyOf(w,w.comps[0].id,'mirror-x').ok&&copyOf(w,w.comps[0].id,'mirror-y').ok;},
  'copy-plate':()=>{const w=blocked(),r=copyOf(w,'Blank133');return r.ok&&r.comps[0].type==='triangle'&&!r.comps[0].motorMountPoint;},
  'copy-l':()=>{const w=freeL();return copyOf(w,w.comps[0].id).ok&&copyOf(w,w.comps[0].id,'mirror-x').ok;},
  'copy-arms-mirror':()=>{const w=bell(),c=w.comps.find(c=>c.standardBlank?.kind==='arms');return copyOf(w,c.id,'mirror-x').ok;},
  'copy-motorbar-plain':()=>{const w=blocked(),r=copyOf(w,'Blank135');return r.ok&&!r.comps[0].isInput&&!r.comps[0].physicalMotor&&!r.comps[0].motorMount;}
};

// ------------------------------------------------------------------ run the matrix
const cases=listCases();
const stats={};for(const a of ACTIONS)stats[a.id]={ok:0,gap:0,na:0,unverified:0};
let closed=0,stillOpen=0,knownErr=0;
const gapRows=[],unverifiedRows=[];
// completeness: every part x action has at least one case
for(const p of PARTS)for(const a of ACTIONS)check(`matrix covers ${p.id} x ${a.id}`,(MATRIX[p.id]?.[a.id]||[]).length>0);
const label=c=>`${PARTS.find(p=>p.id===c.part).label} / ${ACTIONS.find(a=>a.id===c.action).label} / ${c.when}`;
for(const c of cases){
  const s=stats[c.action];
  if(c.status==='n/a'){s.na++;continue;}
  if(c.unverified)unverifiedRows.push(c);
  if(c.status==='gap'){
    s.gap++;gapRows.push(c);
    check(`gap documented: ${label(c)}`,!!(c.now&&c.evidence&&c.expect&&c.cause));
    if(!c.check)continue;
    const fn=CHECKS[c.check];
    if(!fn){check(`gap check exists: ${c.check}`,false);continue;}
    try{
      const r=await fn();
      if(r===true||r?.pass===true){stillOpen++;console.log(`KNOWN   gap  ${label(c)}  — ${c.now}`);}
      else{closed++;console.log(`GAP CLOSED?  ${label(c)}  — check '${c.check}' no longer reproduces it; set status to 'ok' in operation-matrix.js`);}
    }catch(e){knownErr++;console.log(`KNOWN-ERR  ${label(c)}  — check '${c.check}' threw: ${e.message}`);}
    continue;
  }
  s.ok++;
  if(c.unverified)s.unverified++;
  if(!c.check){check(`ok case is verified or flagged unverified: ${label(c)}`,!!c.unverified);continue;}
  const fn=CHECKS[c.check];
  if(!fn){check(`ok check exists: ${c.check}`,false);continue;}
  let pass=false,detail='';
  try{const r=await fn();pass=r===true||r?.pass===true;detail=r?.detail||'';}catch(e){detail='threw: '+e.message;}
  check(`${c.check}: ${label(c)}`,pass,detail);
}

// ------------------------------------------------------------------ summary
console.log('\n=== 零件 × 動作 summary ===');
console.log('action        ok  gap  n/a  (ok but unverified)');
for(const a of ACTIONS){const s=stats[a.id];console.log(`${a.label.padEnd(8,'　')}  ${String(s.ok).padStart(3)} ${String(s.gap).padStart(4)} ${String(s.na).padStart(4)}   (${s.unverified})`);}
const total=Object.values(stats).reduce((t,s)=>({ok:t.ok+s.ok,gap:t.gap+s.gap,na:t.na+s.na,unverified:t.unverified+s.unverified}),{ok:0,gap:0,na:0,unverified:0});
console.log(`TOTAL ok ${total.ok} (of which unverified ${total.unverified}), gap ${total.gap}, n/a ${total.na}; gaps still reproducing ${stillOpen}, closed ${closed}, errored ${knownErr}`);
console.log('\n=== gap list ===');
for(const c of gapRows)console.log(`- [${c.cause}] ${label(c)}\n    now: ${c.now}`);
const causes={};for(const c of gapRows)(causes[c.cause]??=[]).push(c);
console.log('\n=== gaps by shared cause ===');
for(const [k,v] of Object.entries(causes))console.log(`${k}: ${v.length}`);
report('operation-matrix');
