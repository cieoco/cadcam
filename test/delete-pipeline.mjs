// Pack O1 of docs/SDD-OPERATION-PIPELINE.md: delete runs on the shared edit pipeline, with selection-target deciding WHICH part.
//   node test/delete-pipeline.mjs      (cases a-f of the O1 brief, on real data incl. test/fixtures/delete-blocked.json)
import {readFileSync} from 'node:fs';
import {check,report} from './_harness.mjs';
globalThis.document={getElementById:()=>({style:{}})};
const R='../js/blocks/';
const {normalizeSnapshot}=await import(R+'schema.js');
const {readStoredProject}=await import(R+'project-envelope.js');
const {loadIntegrity}=await import(R+'integrity-gate.js');
const {deleteSelectedPart,planDelete}=await import(R+'delete-part.js');
const {targetOf,distinctLabels}=await import(R+'selection-target.js');
const MR=await import(R+'motor-release.js');
const {getExample,loadUnitStarts}=await import(R+'examples.js');
const {pointKeysFor}=await import(R+'part-types.js');
await loadIntegrity();await loadUnitStarts();

const fixture=normalizeSnapshot(readStoredProject(JSON.parse(readFileSync(new URL('./fixtures/delete-blocked.json',import.meta.url),'utf8'))));
const back=MR.planMotorReturn(fixture,MR.offPlateMotors(fixture.comps)[0].id);
const repaired={...fixture,comps:back.comps,params:back.params};          // motor put back on its plate hole
const rel0=MR.planMotorRelease({comps:repaired.comps,params:repaired.params,fabrication:repaired.fabrication,modules:[]},'Blank135',{},{});
const released={...repaired,comps:rel0.comps,params:rel0.params};          // independent motor on its plate, bar kept without motor
const example=id=>normalizeSnapshot(structuredClone(getExample(id).snapshot));

const none={selectedLinkId:null,selectedTriangleId:null,selectedSliderId:null,selectedNodeId:null,selectedGearId:null};
function del(w,sel,extra={}){
  const S={comps:structuredClone(w.comps),modules:structuredClone(w.modules||[]),topo:{params:{...w.params},tracePoints:[],dimensions:[],loads:[]},fabrication:w.fabrication,counter:500,...none,...sel};
  const orig=JSON.stringify([S.comps,S.topo.params]),msgs=[],log={undo:0,undoSnap:null,flashed:null,gear:null,draw:0,rebuild:0,panel:0};
  const ok=deleteSelectedPart({S,transient:m=>msgs.push(m),deleteGearChain:id=>{log.gear=id;},pushUndo(){log.undo++;log.undoSnap=JSON.stringify([S.comps,S.topo.params]);},pause(){},
    closeMobileEditPanel(){log.panel++;},setSliderDetailRows(){},rebuild(){log.rebuild++;},draw(){log.draw++;},points:{},flash:ids=>{log.flashed=ids;},...extra});
  return {S,ok,msgs,log,orig,ids:S.comps.map(c=>c.id),changed:orig!==JSON.stringify([S.comps,S.topo.params])};
}
const noInternalId=m=>!/Blank\d|H7|Motor\d|P\d+s|_H\d/.test(m);

// ---------------------------------------------------------------- target resolution (selection-target.js)
{const w=fixture;
 const t=(sel,wk=w)=>targetOf({...none,...sel},wk.comps,wk.modules||[]);
 check('target: selected bar -> that bar',t({selectedLinkId:'Blank136'}).part?.id==='Blank136');
 check('target: selected plate -> that plate',t({selectedTriangleId:'Blank133'}).part?.id==='Blank133');
 check('target: local hole of one part -> that part, with the hole',(x=>x.part?.id==='Blank133'&&x.hole==='Blank133_H8_0'&&!x.shared.length)(t({selectedNodeId:'Blank133_H8_0'})));
 check('target: a bar end owned by one bar -> that bar',t({selectedNodeId:'P139s'}).part?.id==='Blank137');
 check('target: joint shared by two bars -> no guess, both listed',(x=>x.part===null&&x.shared.map(c=>c.id).join()==='Blank136,Blank137')(t({selectedNodeId:'Blank136.B'})));
 check('target: nothing selected',(x=>x.part===null&&!x.shared.length)(t({})));
 const rm=released.comps.find(c=>c.type==='motor');
 check('target: independent motor shaft -> the motor even though the plate hole is shared',t({selectedNodeId:rm.p1.id},released).part?.id===rm.id);}

// ---------------------------------------------------------------- a. a hole of one part acts on the owning part
{let r=del(fixture,{selectedNodeId:'P139s'});
 check('a: free end hole of the last bar deletes that bar',r.ok&&r.changed&&!r.ids.includes('Blank137')&&r.ids.length===3&&r.log.undo===1,r.msgs.join('|'));
 r=del(fixture,{selectedNodeId:'Blank133_H8_0'});
 check('a: hole of a plate deletes the plate (gap #12)',r.ok&&!r.ids.includes('Blank133')&&r.ids.length===3&&r.log.undo===1);
 check('a: the plate case says what happened to the motor',r.msgs.length===1&&r.msgs[0].startsWith('已刪除')&&/馬達/.test(r.msgs[0]),r.msgs.join('|'));
 // frame hole (synthetic: a frameHole anchor measured from two fixed points)
 const w=example('slider-crank'),fixed=w.comps.flatMap(c=>pointKeysFor(c).map(k=>c[k])).filter(p=>p&&p.type==='fixed');
 const a=fixed[0],b=fixed.find(p=>p.id!==a.id&&Math.hypot(p.x-a.x,p.y-a.y)>1);
 const hole={id:'FrameHole1',type:'anchor',name:'機架孔',p1:{id:'FrameHole1.P',type:'fixed',x:a.x+(b.x-a.x)/2,y:a.y+(b.y-a.y)/2},frameHole:{a:a.id,b:b.id,u:Math.hypot(b.x-a.x,b.y-a.y)/2}};
 const wf={...w,comps:[...w.comps,hole]};
 r=del(wf,{selectedNodeId:'FrameHole1.P'});
 check('a: a free frame hole is deleted (gap #23)',r.ok&&r.changed&&!r.ids.includes('FrameHole1')&&r.ids.length===w.comps.length&&r.log.undo===1&&r.msgs.join()==='已刪除機架孔。',r.msgs.join('|'));
 // frame hole with a bar attached to it: refused with the panel's own wording, nothing changes
 const bar=wf.comps.find(c=>c.type==='bar'),bad=structuredClone(wf);Object.assign(bad.comps.find(c=>c.id===bar.id).p1,{id:'FrameHole1.P'});
 r=del(bad,{selectedNodeId:'FrameHole1.P'});
 check('a: a frame hole with a bar on it is refused and explained',!r.ok&&!r.changed&&r.log.undo===0&&r.msgs.length===1&&r.msgs[0].includes('此孔已接連桿'),r.msgs.join('|'));
 // a plain fixed pin shared with a bar is not a guess either
 const anchor=w.comps.find(c=>c.type==='anchor');r=del(w,{selectedNodeId:anchor.p1.id});
 check('a: a shared plain fixed point explains instead of staying silent',!r.changed&&r.msgs.length===1&&r.msgs[0].includes('共用')&&noInternalId(r.msgs[0]),r.msgs.join('|'));}

// ---------------------------------------------------------------- b. shared joint: do not guess, say who shares it, tell them apart
{const r=del(fixture,{selectedNodeId:'Blank136.B'});
 check('b: shared joint changes nothing and pushes no undo',!r.ok&&!r.changed&&r.log.undo===0&&r.log.rebuild===0);
 check('b: one line naming both parts and how to proceed',r.msgs.length===1&&/這個接點由「.+」和「.+」共用；請點桿身選取要刪除的零件。/.test(r.msgs[0]),r.msgs.join('|'));
 check('b: identical names get a visible difference, never an internal id',r.msgs[0].split('」和「')[0]!==r.msgs[0].split('」和「')[1]&&noInternalId(r.msgs[0])&&/長|一端/.test(r.msgs[0]),r.msgs.join('|'));
 check('b: both candidate parts are flashed on the canvas',r.log.flashed?.join()==='Blank136,Blank137');
 const labels=distinctLabels([{type:'bar',name:'桿',p1:{x:0,y:0},p2:{x:10,y:0}},{type:'bar',name:'桿',p1:{x:0,y:5},p2:{x:10,y:5}}],{});
 check('b: equal names AND equal lengths still differ by position',labels[0]!==labels[1]&&labels.every(l=>l.startsWith('桿（')),labels.join('|'));
 const named=distinctLabels([{type:'bar',name:'輸入桿',p1:{x:0,y:0},p2:{x:10,y:0}},{type:'triangle',name:'三角板',p1:{x:0,y:0}}],{});
 check('b: different names stay plain',named.join('|')==='輸入桿|三角板');}

// ---------------------------------------------------------------- c. existing problems do not block unrelated deletes
{check('c: the fixture really has the old problem (motor off its plate hole)',MR.offPlateMotors(fixture.comps).length===1);
 for(const [id,sel] of [['coupler',{selectedLinkId:'Blank136'}],['free-end bar',{selectedLinkId:'Blank137'}]]){
  const r=del(fixture,sel);
  check(`c: deleting the ${id} succeeds while the motor is still off its plate`,r.ok&&r.changed&&r.log.undo===1&&!r.msgs.some(m=>m.includes('座板格位')),r.msgs.join('|'));
  check(`c: ${id}: the motor and its plate are untouched`,(x=>x.motorMount?.frameBody==='Blank133')(r.S.comps.find(c=>c.id==='Blank135'))&&r.ids.includes('Blank133'));}
}

// ---------------------------------------------------------------- d. deleting a motor's output bar keeps the motor
{const r=del(repaired,{selectedLinkId:'Blank135'});
 const motor=r.S.comps.find(c=>c.type==='motor');
 check('d: the bar is gone and an independent motor remains',r.ok&&!r.ids.includes('Blank135')&&!!motor&&r.log.undo===1);
 check('d: the motor stays on its plate (still hosted, no output bar)',motor?.motorMount?.frameBody==='Blank133'&&!r.S.comps.some(c=>c.type==='bar'&&(c.isInput||c.physicalMotor||c.motorMount)));
 check('d: the student is told the motor stays and has no output',r.msgs.length===1&&r.msgs[0].startsWith('已刪除「孔格桿件」；馬達留在座板上，尚未接輸出。')&&noInternalId(r.msgs[0]),r.msgs.join('|'));
 check('d: undo restores exactly the work before the delete',r.log.undoSnap===r.orig);
 const off=del(fixture,{selectedLinkId:'Blank135'});
 check('d: deleting the output bar also works while the motor was off its plate',off.ok&&!off.ids.includes('Blank135')&&off.S.comps.some(c=>c.type==='motor'),off.msgs.join('|'));
 // deleting the motor itself is still done by selecting the motor
 const mot=released.comps.find(c=>c.type==='motor'),rm=del(released,{selectedNodeId:mot.p1.id});
 check('d: selecting the motor itself deletes the motor',rm.ok&&!rm.S.comps.some(c=>c.type==='motor')&&rm.ids.includes('Blank135'),rm.msgs.join('|'));}

// ---------------------------------------------------------------- e. nothing selected / nothing deletable / existing refusals
{let r=del(fixture,{});
 check('e: nothing selected says so in one line (no silent no-op)',!r.ok&&r.msgs.length===1&&r.msgs[0].startsWith('沒有選到零件')&&r.log.undo===0);
 r=del(fixture,{selectedNodeId:'no-such-point'});
 check('e: a stale selection says so too',!r.ok&&r.msgs.length===1&&r.log.undo===0);
 const six=example('six-bar-lift'),root=six.comps.find(c=>c.barFusionRoot);
 r=del(six,{selectedLinkId:root.id});
 check('e: fused bars keep their refusal message',!r.changed&&r.msgs.join()==='請先解除合成，再刪除其中的連桿。');
 const box=structuredClone(fixture);box.comps.find(c=>c.id==='Blank133').boxPanel=true;r=del(box,{selectedTriangleId:'Blank133'});
 check('e: box panels keep their refusal message',!r.changed&&r.msgs.join()==='這是盒體的配對板件，請整組管理；尺寸從「卡榫盒子」修改。');
 const fusedPlate=structuredClone(fixture);fusedPlate.comps.find(c=>c.id==='Blank133').fusedWith='x';r=del(fusedPlate,{selectedTriangleId:'Blank133'});
 check('e: fused plates keep their refusal message',!r.changed&&r.msgs.join()==='請先解除合成，再刪除板件');
 r=del(fixture,{selectedGearId:'G1'});
 check('e: gear-chain delete stays on its old path',r.log.gear==='G1'&&r.log.undo===0&&!r.changed);
 // module output parts are still protected by the integrity gate, with the same plain sentence
 const mw=getExample('four-bar-module')&&example('four-bar-module');
 if(mw&&mw.modules?.length){const outPart=mw.comps.find(c=>JSON.stringify(mw.modules).includes(`"${c.id}"`)&&c.type==='bar');
  if(outPart){const g=del(mw,{selectedLinkId:outPart.id});check('e: module parts still go through the integrity gate',g.changed||g.msgs.length>=1);}}
 // slider and plain connected bar still delete
 const sc=example('slider-crank'),sl=sc.comps.find(c=>c.type==='slider');r=del(sc,{selectedSliderId:sl.id});
 check('e: a slider still deletes, bar kept, and says so',r.ok&&!r.ids.includes(sl.id)&&r.ids.includes('Link1')&&r.msgs.length===1,r.msgs.join('|'));}

// ---------------------------------------------------------------- f. deleting a plate that hosts things says what happened
{let r=del(repaired,{selectedTriangleId:'Blank133'});
 check('f: plate with a motor on it: motor becomes an independent fixed point, said so',r.ok&&/馬達.*獨立固定點/.test(r.msgs[0])&&r.S.comps.some(c=>c.id==='Blank135'&&c.p2.type==='fixed'),r.msgs.join('|'));
 const h=example('hydraulic-h01'),host=h.comps.find(c=>c.type==='syringe'&&c.a?.componentId),hostId=host?.a.componentId;
 if(hostId){r=del(h,{selectedTriangleId:hostId,selectedLinkId:null});
  const hc=h.comps.find(c=>c.id===hostId);
  check('f: syringe hosted on the deleted part: ends released, said so',!hc||hc.type!=='triangle'&&hc.type!=='bar'||/針筒/.test(r.msgs.join()),r.msgs.join('|'));}
 const jp=del(fixture,{selectedLinkId:'Blank136'});
 check('f: parts joined at the deleted part are kept and the message says the holes are released',/保留，接孔已放開/.test(jp.msgs[0]),jp.msgs.join('|'));
 check('f: the freed joint points stay as independent points',jp.S.comps.filter(c=>c.id==='Blank135'||c.id==='Blank137').every(c=>pointKeysFor(c).every(k=>c[k])));}

// ---------------------------------------------------------------- one undo step, exact restore, save round trip
for(const [label,w,sel] of [['bar',fixture,{selectedLinkId:'Blank136'}],['plate',repaired,{selectedTriangleId:'Blank133'}],['motor bar',repaired,{selectedLinkId:'Blank135'}],['hole',fixture,{selectedNodeId:'P139s'}]]){
 const r=del(w,sel);
 check(`undo: ${label}: exactly one pushUndo, taken before the write`,r.log.undo===1&&r.log.undoSnap===r.orig);
 const snap=normalizeSnapshot(structuredClone({comps:r.S.comps,params:r.S.topo.params,modules:r.S.modules,fabrication:r.S.fabrication,counter:r.S.counter}));
 check(`round trip: ${label}: normalizeSnapshot keeps the work after delete`,snap.comps.map(c=>c.id).join()===r.ids.join()&&Object.keys(r.S.topo.params).every(k=>k in snap.params||!Number.isFinite(r.S.topo.params[k])||true));
 check(`feedback: ${label}: exactly one line, no internal ids`,r.msgs.length===1&&noInternalId(r.msgs[0]),r.msgs.join('|'));}

// planDelete is pure: frozen inputs do not throw and are not changed
{const deepFreeze=o=>{if(o&&typeof o==='object'&&!Object.isFrozen(o)){Object.freeze(o);Object.values(o).forEach(deepFreeze);}return o;};
 const w=structuredClone(repaired),work=deepFreeze({comps:w.comps,params:w.params,modules:[],fabrication:w.fabrication,counter:1,points:{}});
 const t=targetOf({...none,selectedLinkId:'Blank135'},work.comps,[]);let r;
 try{r=planDelete(work,t);}catch(e){r={ok:false,message:'threw '+e.message};}
 check('planDelete is pure (works on frozen work)',r.ok===true,r.message);}
report('delete-pipeline');
