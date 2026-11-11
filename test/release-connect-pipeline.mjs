// Pack O2 of docs/SDD-OPERATION-PIPELINE.md: release / connect actions run on the shared edit pipeline.
//   node test/release-connect-pipeline.mjs
// split a shared joint, merge a dragged end onto a hole, motor release / return / leave, syringe release / reconnect:
// success changes exactly the intended data with one undo, a refusal changes nothing and pushes no undo, every outcome speaks
// (and never shows an internal id), pre-existing problems do not block unrelated edits, normalizeSnapshot round trip.
import {readFileSync} from 'node:fs';
import {check,report} from './_harness.mjs';

class FakeEl{
 constructor(tag){this.tagName=String(tag).toUpperCase();this.childNodes=[];this.parentElement=null;this.attrs={};this.dataset={};this.style={};this.hidden=false;this.disabled=false;this.value='';this.checked=false;this._text='';this.listeners={};
  this.classList={set:new Set(),add:(...c)=>c.forEach(x=>this.classList.set.add(x)),toggle:(c,on)=>{if(on??!this.classList.set.has(c))this.classList.set.add(c);else this.classList.set.delete(c);},contains:c=>this.classList.set.has(c)};}
 get children(){return this.childNodes;}
 get textContent(){return this._text+this.childNodes.map(n=>n.textContent).join('');}
 set textContent(t){this._text=String(t??'');for(const n of this.childNodes)n.parentElement=null;this.childNodes=[];}
 set className(v){this.classList.set=new Set(String(v).split(/\s+/).filter(Boolean));}
 get className(){return [...this.classList.set].join(' ');}
 append(...ns){for(const n of ns){n.parentElement?.childNodes.splice(n.parentElement.childNodes.indexOf(n),1);n.parentElement=this;this.childNodes.push(n);}}
 prepend(...ns){for(const n of ns.reverse()){n.parentElement?.childNodes.splice(n.parentElement.childNodes.indexOf(n),1);n.parentElement=this;this.childNodes.unshift(n);}}
 insertBefore(n,ref){n.parentElement?.childNodes.splice(n.parentElement.childNodes.indexOf(n),1);const i=ref?this.childNodes.indexOf(ref):-1;n.parentElement=this;if(i<0)this.childNodes.push(n);else this.childNodes.splice(i,0,n);}
 before(...ns){const p=this.parentElement;for(const n of ns)p.insertBefore(n,this);}
 after(...ns){const p=this.parentElement;let ref=p.childNodes[p.childNodes.indexOf(this)+1];for(const n of ns)p.insertBefore(n,ref);}
 remove(){this.parentElement?.childNodes.splice(this.parentElement.childNodes.indexOf(this),1);this.parentElement=null;}
 replaceChildren(...ns){for(const n of this.childNodes)n.parentElement=null;this.childNodes=[];this._text='';this.append(...ns);}
 setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return k in this.attrs?this.attrs[k]:null;}hasAttribute(k){return k in this.attrs;}removeAttribute(k){delete this.attrs[k];}
 toggleAttribute(k,on){if(on??!(k in this.attrs))this.attrs[k]='';else delete this.attrs[k];}
 addEventListener(t,f){(this.listeners[t]??=[]).push(f);}removeEventListener(){}
 closest(tag){let n=this;while(n&&n.tagName!==tag.toUpperCase())n=n.parentElement;return n;}
 querySelectorAll(){return [];}
 appendChild(n){this.append(n);return n;}
 getScreenCTM(){return {a:1,b:0,d:1,inverse(){return this;}};}
 querySelector(tag){return walk(this).find(n=>n!==this&&n.tagName===tag.toUpperCase())||null;}
 getBoundingClientRect(){return {left:0,top:0,right:600,bottom:400,width:600,height:400};}
 focus(){}select(){}
 show(){this.open=true;}showModal(){this.open=true;}close(){if(!this.open&&this.closed)return;this.open=false;this.closed=true;this.onclose?.();}
}
const walk=n=>[n,...n.childNodes.flatMap(walk)];


const body=new FakeEl('body');
globalThis.document={body,createElement:t=>new FakeEl(t),createElementNS:(_,t)=>new FakeEl(t),addEventListener(){},removeEventListener(){},activeElement:null,
  getElementById:()=>({style:{}})};
globalThis.matchMedia=()=>({matches:false});globalThis.requestAnimationFrame=()=>{};

const R='../js/blocks/';
const {S:GS}=await import(R+'state.js');
const {normalizeSnapshot}=await import(R+'schema.js');
const {readStoredProject}=await import(R+'project-envelope.js');
const {loadIntegrity}=await import(R+'integrity-gate.js');
const CO=await import(R+'connect-ops.js');
const MR=await import(R+'motor-release.js');
const Model=await import(R+'model.js');
const {getExample,loadUnitStarts}=await import(R+'examples.js');
const {makeStandardBlank}=await import(R+'standard-blank.js');
const {createSyringeEditor}=await import(R+'syringe-editor.js');
const {pointCoords}=Model;
await loadIntegrity();await loadUnitStarts();

const fix=n=>normalizeSnapshot(readStoredProject(JSON.parse(readFileSync(new URL('./fixtures/'+n,import.meta.url),'utf8'))));
const example=id=>normalizeSnapshot(structuredClone(getExample(id).snapshot));
const fixture=fix('delete-blocked.json');                     // plate + TT motor OFF its plate hole (existing problem) + input bar + coupler + free-end bar
const offPlate=fix('motor-off-plate.json');
const back=MR.planMotorReturn(fixture,MR.offPlateMotors(fixture.comps)[0].id);
const repaired={...fixture,comps:back.comps,params:back.params};
const noInternalId=m=>!/Blank\d|H7|Motor\d|P\d+s|_H\d|\.[ABC]\b/.test(m);
const none={selectedLinkId:null,selectedTriangleId:null,selectedSliderId:null,selectedNodeId:null,selectedGearId:null};

// one fake host: records undo snapshots, messages, rebuild/draw counts
function mk(w,sel={},extra={}){
  const S={comps:structuredClone(w.comps),modules:structuredClone(w.modules||[]),topo:{params:{...w.params},tracePoints:[],dimensions:[],loads:[]},fabrication:w.fabrication,counter:500,theta:0,motorAngles:{},mode:'design',...none,...sel,...extra};
  const log={undo:0,undoSnap:null,rebuild:0,draw:0,save:0,refresh:0},msgs=[];
  const snap=()=>JSON.stringify([S.comps,S.topo.params]);
  const host={S,transient:m=>msgs.push(m),pushUndo(){log.undo++;log.undoSnap=snap();},pause(){},rebuild(){log.rebuild++;},draw(){log.draw++;}};
  return {S,log,msgs,host,orig:snap(),snap,changed:()=>snap()!==JSON.stringify([w.comps,w.params])&&snap()!==undefined};
}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const roundTrip=S=>normalizeSnapshot(structuredClone({comps:S.comps,params:S.topo.params,modules:S.modules,fabrication:S.fabrication,counter:S.counter}));

// ---------------------------------------------------------------- 1. split a shared joint
{const m=mk(fixture,{selectedNodeId:'Blank136.B'}),before=structuredClone(m.S.comps);
 const ok=CO.splitSelected(m.host);
 check('split: succeeds on the shared joint of two bars',ok===true);
 check('split: exactly one undo step, taken before the write, and it restores the exact work',m.log.undo===1&&m.log.undoSnap===m.orig);
 check('split: one sentence that says what was separated, no internal id',m.msgs.length===1&&/^已把其中一個「孔格桿件」從這個接點分開；另一個「孔格桿件」留在原處。/.test(m.msgs[0])&&noInternalId(m.msgs[0]),m.msgs.join('|'));
 check('split: the joint now has one owner; the other end got its own point',Model.pointRefs(m.S.comps,'Blank136.B').length===1&&Model.pointRefs(m.S.comps,'Blank137').length===0&&m.S.comps.find(c=>c.id==='Blank137').p1.id.endsWith('s'));
 const changedIds=m.S.comps.filter((c,i)=>!same(c,before[i])).map(c=>c.id);
 check('split: only the part that left changed',changedIds.join()==='Blank137',changedIds.join());
 check('split: the new point counter was advanced (no id reuse) and selection cleared',m.S.counter>500&&m.S.selectedNodeId===null);
 check('split: rebuilt and redrawn once',m.log.rebuild===1&&m.log.draw===1);
 check('split: normalizeSnapshot round trip keeps the parts',roundTrip(m.S).comps.map(c=>c.id).join()===m.S.comps.map(c=>c.id).join());}
{// pre-existing problem (motor off its plate) must not block an unrelated split
 for(const [label,w] of [['delete-blocked.json',fixture],['motor-off-plate.json',offPlate]]){
  const m=mk(w,{selectedNodeId:'Blank136.B'}),ok=CO.splitSelected(m.host);
  check(`split: ${label}: the old off-plate problem does not block it`,MR.offPlateMotors(w.comps).length===1&&ok&&m.log.undo===1&&!/座板格位/.test(m.msgs.join()),m.msgs.join('|'));}}
{// four parts at one joint: all but the first leave, and the sentence counts them
 const l1=makeStandardBlank({kind:'bar',n:8,origin:{x:-300,y:0}}),l2=makeStandardBlank({kind:'bar',n:9,origin:{x:-300,y:100}});
 const w={...repaired,comps:[...repaired.comps,l1.comp,l2.comp],params:{...repaired.params,...l1.params,...l2.params}};
 w.comps=Model.mergePoints(w.comps,l1.comp.p1.id,'Blank136.B');w.comps=Model.mergePoints(w.comps,l2.comp.p1.id,'Blank136.B');
 const m=mk(w,{selectedNodeId:'Blank136.B'}),ok=CO.splitSelected(m.host);
 check('split: four parts at the joint: three leave, one stays, said with counts',Model.pointRefs(w.comps,'Blank136.B').length===4&&ok&&Model.pointRefs(m.S.comps,'Blank136.B').length===1&&/^已把3 個「孔格桿件」從這個接點分開；另一個「孔格桿件」留在原處。/.test(m.msgs[0])&&noInternalId(m.msgs[0]),m.msgs.join('|'));
 check('split: four parts: still one undo',m.log.undo===1&&m.log.undoSnap===m.orig);}
{// refusals change nothing, push no undo, and speak
 const six=example('six-bar-lift'),fused=six.comps.find(c=>c.barFusionRoot||c.barFusion),fusedPoint=Object.values(fused).find(v=>v&&v.id&&Model.pointRefs(six.comps,v.id).length>1)?.id;
 const cases=[['nothing selected',fixture,{},/請先點選要分開的接點/],['a point owned by one part',fixture,{selectedNodeId:'P139s'},/只有一個零件/],['a stale point id',fixture,{selectedNodeId:'no-such'},/只有一個零件|請先點選/]];
 if(fusedPoint)cases.push(['a fused joint',six,{selectedNodeId:fusedPoint},/請先解除合成，再修改孔位。/]);
 for(const [label,w,sel,re] of cases){
  const m=mk(w,sel),ok=CO.splitSelected(m.host);
  check(`split refused: ${label}: nothing changed, no undo, one explaining line`,ok===false&&m.snap()===m.orig&&m.log.undo===0&&m.log.rebuild===0&&m.msgs.length===1&&re.test(m.msgs[0])&&noInternalId(m.msgs[0]),m.msgs.join('|'));}}

// ---------------------------------------------------------------- 2. merge: drag an end onto a hole
const cr=fix('connected-resize.json');
const dropOf=(m,points)=>({comps:structuredClone(m.S.comps),topo:structuredClone(m.S.topo),points,theta:m.S.theta,angles:{...m.S.motorAngles}});
{const m=mk(cr,{selectedNodeId:'P138s'});m.S.topo.tracePoints=['P138s'];const orig=m.snap(),drop=dropOf(m,pointCoords(m.S.comps));
 const owner=m.S.comps.find(c=>Model.pointRefs([c],'P138s').length),before=structuredClone(m.S.comps);
 const ok=CO.mergeDropped({from:'P138s',to:'Blank133_H8_0',drop,...m.host});
 check('merge: succeeds for a free bar end dropped on a plate hole',ok===true);
 check('merge: one undo, taken before the write, restoring the exact work',m.log.undo===1&&m.log.undoSnap===orig);
 check('merge: one sentence naming what was joined, no internal id',m.msgs.length===1&&/^已把「孔格桿件」的端孔接到「矩形板材」的孔。/.test(m.msgs[0])&&noInternalId(m.msgs[0]),m.msgs.join('|'));
 check('merge: the end now shares the hole; the old point is gone',Model.pointRefs(m.S.comps,'Blank133_H8_0').length>=2&&Model.pointRefs(m.S.comps,'P138s').length===0);
 check('merge: no part was added or removed; the dragged bar now ends on the hole',m.S.comps.map(c=>c.id).join()===before.map(c=>c.id).join()&&m.S.comps.find(c=>c.id===owner.id).p2.id==='Blank133_H8_0');
 check('merge: the trace point follows the joint, and the selection follows it',m.S.topo.tracePoints.join()==='Blank133_H8_0'&&m.S.selectedNodeId==='Blank133_H8_0');
 check('merge: normalizeSnapshot round trip',roundTrip(m.S).comps.length===m.S.comps.length);}
{const probe=(label,w,from,to,re)=>{const m=mk(w,{selectedNodeId:from}),drop=dropOf(m,pointCoords(m.S.comps)),ok=CO.mergeDropped({from,to,drop,...m.host});
  check(`merge refused: ${label}: nothing changed, no undo, one explaining line`,ok===false&&m.snap()===m.orig&&m.log.undo===0&&m.msgs.length===1&&re.test(m.msgs[0])&&noInternalId(m.msgs[0]),m.msgs.join('|'));};
 probe('two holes of the same part',cr,'P138s','P138s',/請選擇兩個不同接點/);
 probe('the two holes of one part',fixture,'Blank137_H8_0','Blank137_H16_0',/不能合併同一零件的兩個孔/);
 probe('a hole the linkage cannot reach',fixture,'P139s','Blank133_H24_32',/無法在保持設定桿長與固定孔位置下接合/);}
{// joining a loose bar works on a clean work; with the motor still off its plate the solver (not the gate) says it cannot reach, and nothing changes
 const loose=makeStandardBlank({kind:'bar',n:9,origin:{x:-400,y:0}}),join=(base)=>{const w={...base,comps:[...base.comps,loose.comp],params:{...base.params,...loose.params}};
  const m=mk(w,{selectedNodeId:loose.comp.p2.id}),drop=dropOf(m,pointCoords(m.S.comps));return {m,ok:CO.mergeDropped({from:loose.comp.p2.id,to:'Blank133.A',drop,...m.host})};};
 const clean=join(repaired),old=join(offPlate);
 check('merge: a loose bar joins the plate on a clean work, one undo',clean.ok&&clean.m.log.undo===1&&clean.m.log.undoSnap===clean.m.orig);
 check('merge: with the old off-plate problem the refusal is the solver sentence, nothing changed, no undo',!old.ok&&old.m.snap()===old.m.orig&&old.m.log.undo===0&&old.m.msgs.length===1&&/無法在保持設定桿長/.test(old.m.msgs[0]),old.m.msgs.join('|'));}

// ---------------------------------------------------------------- 3. motor release / return / leave (run() = the app entry)
function motor(action,w,sel={},extra={}){
  const m=mk(w,sel),api={S:m.S,...m.host,notify:m.host.transient,save:()=>m.log.save++,refresh:()=>m.log.refresh++,points:()=>({}),motion:{},...extra};
  return {m,ok:MR.run(action,api)};
}
{const {m,ok}=motor('release',repaired,{selectedLinkId:'Blank135'},{id:'Blank135'}),motorPart=m.S.comps.find(c=>c.type==='motor');
 check('motor release: succeeds; motor and bar are both kept',ok&&!!motorPart&&m.S.comps.some(c=>c.id==='Blank135'));
 check('motor release: one undo restoring the exact work; selection kept',m.log.undo===1&&m.log.undoSnap===m.orig&&m.S.selectedLinkId==='Blank135');
 check('motor release: message unchanged, no internal id',m.msgs.length===1&&m.msgs[0]==='已解除「孔格桿件」與馬達的連接；馬達與桿件都保留，可再接回，也可按復原。',m.msgs.join('|'));
 check('motor release: saved and re-checked once',m.log.save===1&&m.log.refresh===1&&m.log.rebuild===1&&m.log.draw===1);
 check('motor release: normalizeSnapshot round trip',roundTrip(m.S).comps.some(c=>c.type==='motor'));}
{const {m,ok}=motor('back',fixture);
 check('motor return: puts the motor back on its plate hole, one undo, message unchanged',ok&&MR.offPlateMotors(m.S.comps).length===0&&m.log.undo===1&&m.log.undoSnap===m.orig&&/^已把馬達/.test(m.msgs[0])&&noInternalId(m.msgs[0]),m.msgs.join('|'));
 check('motor return: round trip',roundTrip(m.S).comps.length===m.S.comps.length);}
{const {m,ok}=motor('leave',fixture);
 check('motor leave: becomes an independent fixed point, one undo, message unchanged',ok&&MR.offPlateMotors(m.S.comps).length===0&&m.log.undo===1&&m.log.undoSnap===m.orig&&m.msgs[0]==='馬達已離開座板，軸心改成獨立固定點；座板原孔已釋出，可按復原。',m.msgs.join('|'));}
{// refusals
 for(const [label,action,w,sel,extra,re] of [
   ['a bar that is not on a motor shaft','release',repaired,{selectedLinkId:'Blank137'},{id:'Blank137'},/這根桿件沒有接在馬達軸上/],
   ['return when already on the plate','back',repaired,{},{id:'Blank135'},/已在座板原孔上/],
   ['leave when already on the plate','leave',repaired,{},{id:'Blank135'},/在座板原孔上，不需要/]
   ]){
  const {m,ok}=motor(action,w,sel,extra);
  check(`motor refused: ${label}: nothing changed, no undo, one line`,ok===false&&m.snap()===m.orig&&m.log.undo===0&&m.msgs.length===1&&re.test(m.msgs[0])&&noInternalId(m.msgs[0]),m.msgs.join('|'));}
 const {m,ok}=motor('release',repaired,{selectedLinkId:'Blank135'},{id:'Blank135'});
 const off=mk(repaired,{selectedLinkId:'Blank135'},{mode:'assembly'}),res=MR.run('release',{S:off.S,...off.host,notify:off.host.transient,id:'Blank135'});
 check('motor refused: not in design mode: nothing changed, no undo, one line',res===false&&off.snap()===off.orig&&off.log.undo===0&&off.msgs.join()==='請在設計模式修改馬達連接。');}
{// release is not blocked by the old off-plate problem of the same work
 const {m,ok}=motor('release',fixture,{selectedLinkId:'Blank135'},{id:'Blank135'});
 check('motor release: works (or explains) while the motor is still off its plate; never silent',(ok&&m.log.undo===1||!ok&&m.log.undo===0)&&m.msgs.length===1&&noInternalId(m.msgs[0]),m.msgs.join('|'));}

// ---------------------------------------------------------------- 4. syringe release / reconnect (editor confirm path)
{const w=example('hydraulic-h01');GS.comps=structuredClone(w.comps);GS.topo.params={...w.params};GS.fabrication=w.fabrication;GS.modules=[];GS.mode='design';GS.designFocus=null;GS.topo.tracePoints=[];
 for(const k of Object.keys(none))GS[k]=null;
 const log={undo:0,undoSnap:null,rebuild:0,save:0,seed:0},snap=()=>JSON.stringify([GS.comps,GS.topo.params]),notes=[];
 const svg=new FakeEl('svg'),shell=new FakeEl('div');body.append(shell);shell.append(svg);
 const editor=createSyringeEditor({svg,comps:()=>GS.comps,params:()=>GS.topo.params,points:()=>pointCoords(GS.comps),motion:()=>({}),is3D:()=>false,showEditor(){},draw(){},pause(){},
   pushUndo(){log.undo++;log.undoSnap=snap();},rebuild(){log.rebuild++;},seed(){log.seed++;},save(){log.save++;},notify:m=>notes.push(m),previewStroke(){},stroke(){}});
 const find=pred=>walk(body).find(pred),button=t=>find(n=>n.tagName==='BUTTON'&&n.textContent===t),select=l=>find(n=>n.attrs['aria-label']===l),status=()=>find(n=>n.className==='syringe-edit-status').textContent;
 const syringe=GS.comps.find(c=>c.type==='syringe'),b0=structuredClone(syringe.b),orig=snap();
 editor.open(syringe.id);editor.sync(true);
 button('解除推桿連接').onclick();
 check('syringe release: the preview changes nothing and pushes no undo',snap()===orig&&log.undo===0);
 button('取消修改').onclick();
 check('syringe release: cancel changes nothing and pushes no undo',snap()===orig&&log.undo===0);
 button('解除推桿連接').onclick();button('確認套用').onclick();editor.sync(true);
 const released=GS.comps.find(c=>c.type==='syringe');
 check('syringe release: confirm writes once through the pipeline, undo restores the exact work',log.undo===1&&log.undoSnap===orig&&released.b.componentId==='');
 check('syringe release: only the syringe changed',GS.comps.every(c=>c.type==='syringe'||same(c,w.comps.find(o=>o.id===c.id))));
 check('syringe release: the status line says what was released and what remains, no internal id',status()==='已解除推桿連接；固定環與其他桿件保留。模擬待修正：推桿尚未連接，請選孔接回後再播放。'&&noInternalId(status()),status());
 check('syringe release: rebuilt, seeded and saved',log.rebuild===1&&log.seed===1&&log.save===1);
 check('syringe release: normalizeSnapshot round trip',normalizeSnapshot({comps:GS.comps,params:GS.topo.params}).comps.find(c=>c.type==='syringe').b.componentId==='');
 // reconnect to the original hole
 const releasedSnap=snap(),out=select('推桿連接孔');out.value=JSON.stringify({componentId:b0.componentId,u:b0.u,v:b0.v});out.onchange();editor.sync(true);
 check('syringe reconnect: choosing a hole only previews',log.undo===1&&snap()===releasedSnap);
 button('確認套用').onclick();editor.sync(true);
 const again=GS.comps.find(c=>c.type==='syringe');
 check('syringe reconnect: confirm writes once; undo restores the released work',log.undo===2&&log.undoSnap===releasedSnap&&again.b.componentId===b0.componentId&&again.b.u===b0.u);
 check('syringe reconnect: one line, no internal id',/^設定已(套用|保存)/.test(status())&&noInternalId(status()),status());}

report('release-connect-pipeline');
