// Pack C5 of docs/SDD-CONNECTION-INTEGRITY.md: hole-use and free-body answers must not change when the duplicate
// implementations are replaced by the shared queries. test/fixtures/c5-parity.json was recorded on 3a23704 (before C5);
// this test recomputes every answer from the current code and compares per work (70 built-in examples + 2 student files).
//   node test/c5-parity.mjs            compare with the recorded baseline
//   node test/c5-parity.mjs --write    re-record (only after a reviewed, intended difference; list it in INTENDED below)
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BLOCK_EXAMPLES,loadUnitStarts} from '../js/blocks/examples.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {FABRICATION_DEFAULTS} from '../js/blocks/fabrication-profile.js';
import {prepareScopedExport} from '../js/blocks/export-scope.js';
import {machinedComps,undrilledIds} from '../js/blocks/used-holes.js';
import {isFreeBody} from '../js/blocks/model.js';
import {attachedGroup} from '../js/blocks/motor-release.js';
import {connectedRootComps} from '../js/blocks/module-ops.js';
import {gearMountMember,planGearMemberMount} from '../js/blocks/gear-member-mount.js';
import {nudgeDrivenSprocket} from '../js/blocks/chain-tools.js';
import {planGearHolePlacement,outputRadius} from '../js/blocks/gear-hole-placement.js';
import {quickMotorChoices,actuatorHostPoints} from '../js/blocks/actuator-installation.js';
import {inspectMountingChange} from '../js/blocks/mounting-review.js';
import {planActuatorPlateHoles} from '../js/blocks/actuator-plate-holes.js';
import {passiveLocalHoles} from '../js/core/local-holes.js';
import {buildRelations} from '../js/blocks/relations.js';
import {pointKeysFor} from '../js/blocks/part-types.js';
import {check,report} from './_harness.mjs';

// INTENDED: answers that differ from the baseline on purpose: { 'work/question': {to: <new hash>, reason} }. The new value is pinned too.
// 1) motor-release.attachedGroup ignored a slider's rail holes m1/m2 (the old key list was p1,p2,p3), so a group that contains a slider looked
//    free and would have been translated although its rail is anchored. pointKeysFor() sees m1/m2: those groups are not free any more.
const SLIDER='attachedGroup used p1,p2,p3 only: a slider with anchored rail holes m1/m2 counted as a free group (bug); now not free';
// 2) chain-tools.nudgeDrivenSprocket knew eight reference fields; the relation index sees every one (mesh/pinion/fusedWith included), so a
//    part that only names the driven sprocket in another field now also counts as "attached" (stricter, never looser).
const GEARISH='nudgeDrivenSprocket hand list had eight fields; attachmentsOf sees every field that names the sprocket (e.g. mesh)';
const INTENDED={'_chain/gearish':{to:[false,'從動鏈輪已連接其他零件，無法單獨修改中心距；請先調整連接。'],reason:GEARISH},'slider-crank/motorGroup':{to:'9b06395fcb04d658',reason:SLIDER},'quick-return/motorGroup':{to:'f76039bfcd205e7a',reason:SLIDER},'slider-crank-practice/motorGroup':{to:'652401492bd0494d',reason:SLIDER}};
const FILE=new URL('./fixtures/c5-parity.json',import.meta.url);
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0,16);
const clone=v=>structuredClone(v);
const first=e=>String(e?.message||e).split('\n')[0].slice(0,80);
const safe=fn=>{try{return fn();}catch(e){return 'ERR '+first(e);}};
await loadUnitStarts();

const works=[];
for(const e of BLOCK_EXAMPLES){const s=normalizeSnapshot(clone(e.snapshot));if(s)works.push({name:e.id,s});}
for(const f of ['connected-resize','motor-off-plate']){
  const s=normalizeSnapshot(JSON.parse(readFileSync(new URL(`./fixtures/${f}.json`,import.meta.url),'utf8')));
  if(s)works.push({name:'file:'+f,s});
}

function answers({name,s}){
  const comps=s.comps,modules=s.modules||[],params=s.params||{};
  const src=()=>({...clone(s),topo:clone(s),fabrication:s.fabrication||clone(FABRICATION_DEFAULTS),exportSettings:FABRICATION_DEFAULTS.export});
  const out={};
  // 1. hole use: which holes are kept / undrilled
  out.machined=sha(safe(()=>machinedComps(comps,modules,params).map((m,i)=>m===comps[i]?[m.id,'same']:[m.id,m.holes.map(h=>h.id),m.undrilled])));
  out.undrilled=sha(safe(()=>[...undrilledIds(comps,modules,params)].sort()));
  out.machinedNoCtx=sha(safe(()=>machinedComps(comps).map((m,i)=>m===comps[i]?[m.id,'same']:[m.id,m.holes.map(h=>h.id),m.undrilled])));   // exportableLinks calls it without modules/params
  out.passive=sha(safe(()=>passiveLocalHoles(comps,s).passive.map(g=>[g.p1,g.p2,g.holes.map(h=>h.id)])));
  out.platePlan=sha(safe(()=>{const r=planActuatorPlateHoles({comps:clone(comps),modules:clone(modules),params:clone(params),fabrication:s.fabrication,counter:s.counter});return [r.ok,r.message||'',r.ok?r.comps:null,r.reports];}));
  out.motorChoices=sha(safe(()=>[quickMotorChoices(clone(comps)),comps.filter(c=>c.type!=='slider').map(c=>actuatorHostPoints(c).map(p=>p.key))]));   // key lists in actuator-installation
  out.mounting=sha(safe(()=>{const moved=clone(s);for(const c of moved.comps)for(const k of pointKeysFor(c))if(c[k]&&c.type!=='gear'&&c[k].type==='floating'){c[k].x+=1;}return [inspectMountingChange(clone(s),clone(s)),inspectMountingChange(clone(s),moved)];}));
  // 2. exports
  for(const fmt of ['svg','dxf'])out['export-'+fmt]=safe(()=>sha(prepareScopedExport(src(),{scope:'assembly'},fmt).files.map(f=>[f.name,f.text,f.sourceIds,f.mime])));
  // 3. free body, per caller
  out.freeBody=comps.filter(c=>isFreeBody(comps,c,modules)).map(c=>c.id).sort();                       // model.isFreeBody (drag)
  // Built-in examples are fully connected, so also detach each movable body (fresh ids) and then re-attach it in four ways.
  out.freeBodyVariants=sha(safe(()=>comps.filter(c=>['bar','triangle','motor'].includes(c.type)).map(c=>{
    const detach=()=>{const cs=clone(comps),t=cs.find(x=>x.id===c.id);for(const k of pointKeysFor(t))if(t[k]?.id)t[k].id+='_d';for(const h of t.holes||[])h.id+='_d';return {cs,t};};
    const ask=(cs,t,mods=modules)=>isFreeBody(cs,t,mods);
    const a=detach(),b=detach(),d=detach(),e=detach(),f=detach();
    b.cs.push({id:'Ref1',type:'syringe',a:{componentId:c.id,u:0,v:0},b:{componentId:c.id,u:1,v:0}});
    d.cs.push({id:'Ref2',type:'bar',motorCarrier:c.id,p1:{id:'zz1',x:0,y:0},p2:{id:'zz2',x:1,y:0}});
    const pid=a.t.p1?.id;e.cs.push({id:'Ref3',type:'bar',p1:{id:pid,x:0,y:0},p2:{id:'zz3',x:1,y:0}});
    return [c.id,ask(a.cs,a.t),ask(b.cs,b.t),ask(d.cs,d.t),ask(e.cs,e.t),ask(f.cs,f.t,[...modules,{id:'M9',outputs:[{pointId:f.t.p1.id}]}])];})));
  out.freeBodyVariantTrue=comps.filter(c=>['bar','triangle','motor'].includes(c.type)).length&&safe(()=>comps.filter(c=>['bar','triangle','motor'].includes(c.type)).filter(c=>{const cs=clone(comps),t=cs.find(x=>x.id===c.id);for(const k of pointKeysFor(t))if(t[k]?.id)t[k].id+='_d';for(const h of t.holes||[])h.id+='_d';return isFreeBody(cs,t,modules);}).map(c=>c.id));
  out.motorGroup=sha(safe(()=>comps.flatMap(c=>pointKeysFor(c).filter(k=>c[k]?.id).map(k=>{       // motor-release.attachedGroup, every comp x point as shaft
    const r=attachedGroup(clone(comps),{id:c.id,center:c[k].id,host:undefined});return [c.id,c[k].id,[...r.group].map(x=>x.id).sort(),r.free];}))));
  out.rootGroup=sha(safe(()=>comps.map(c=>[c.id,[...connectedRootComps(comps,c.id)].sort()])));      // module-ops.connectedRootComps
  const members=comps.filter(c=>['bar','triangle'].includes(c.type)),gears=comps.filter(c=>c.type==='gear');
  out.gearMember=sha(safe(()=>members.map(m=>{const r=gearMountMember(clone(s),m.id);return [m.id,r.ok,r.ok?'':r.message];})));
  out.gearMount=sha(safe(()=>gears.flatMap(g=>members.map(m=>[true,false].map(flip=>{
    const r=planGearMemberMount(clone(s),{memberId:m.id,gearId:g.id,centerId:m.p1.id,pinId:m.p2.id,matchRadius:true,flipPin:flip});return [g.id,m.id,flip,r.ok,r.ok?'':(r.message||r.reason)];})))));
  // The built-in members are all pinned, so also free a copy (fresh ids, floating) and attach something from outside in six ways.
  out.gearMemberVariants=sha(safe(()=>{const g=gears[0];if(!g)return 'no gear';return members.slice(0,6).map(m=>{
    const run=(edit)=>{const w=clone(s),t=w.comps.find(x=>x.id===m.id);for(const k of pointKeysFor(t))if(t[k]?.id){t[k].id+='_d';t[k].type='floating';delete t[k].physicalMotor;}
      for(const h of t.holes||[])h.id+='_d';t.isInput=false;edit?.(w,t);
      const r=planGearMemberMount(w,{memberId:m.id,gearId:g.id,centerId:t.p1.id,pinId:t.p2.id,matchRadius:true});return [r.ok,r.ok?'':(r.message||r.reason)];};
    return [m.id,run(),run((w,t)=>w.comps.push({id:'X1',type:'syringe',a:{componentId:t.id,u:0,v:0},b:{componentId:t.id,u:1,v:0}})),
      run((w,t)=>w.comps.push({id:'X2',type:'bar',motorCarrier:t.id,p1:{id:'zz1',x:0,y:0},p2:{id:'zz2',x:1,y:0}})),
      run((w,t)=>w.comps.push({id:'X3',type:'bar',p1:{id:t.p1.id,x:0,y:0},p2:{id:'zz3',x:1,y:0}})),
      run((w,t)=>w.comps.push({id:'X4',type:'bar',motorMountPoint:t.p2.id,p1:{id:'zz4',x:0,y:0},p2:{id:'zz5',x:1,y:0}})),
      run((w,t)=>w.modules=[...(w.modules||[]),{id:"M9",outputs:[{pointId:t.p1.id}]}])];});}));
  out.chainNudge=sha(safe(()=>comps.filter(c=>c.type==='belt'&&c.kind==='chain').map(c=>{const r=nudgeDrivenSprocket(clone(comps),clone(params),c.id,1);return [c.id,r.ok,r.ok?'':r.message];})));
  out.gearHole=sha(safe(()=>gears.map(g=>{const r=planGearHolePlacement(clone(s),{gearId:g.id,mode:'manual',radius:outputRadius(g,params)+1,angle:10});return [g.id,r.ok,r.ok?'':r.message];})));
  return out;
}

const now={};
for(const w of works)now[w.name]=answers(w);
// Synthetic chain drive: the driven sprocket gets one extra attachment at a time (anchors do not count).
now._chain=(()=>{const base=works.find(w=>w.name==='sprocket-chain').s,driven='SprocketB';
  const run=edit=>safe(()=>{const comps=clone(base.comps).filter(c=>!['Coupler1','Rocker1','Anchor1'].includes(c.id));edit?.(comps);const r=nudgeDrivenSprocket(comps,clone(base.params),'Chain1',1);return [r.ok,r.ok?'':r.message];});
  return {alone:run(),anchor:run(c=>c.push({id:'A9',type:'anchor',p1:{id:'SKB',type:'fixed',x:40,y:0}})),
    bar:run(c=>c.push({id:'B9',type:'bar',p1:{id:'SKBP',x:56,y:0},p2:{id:'zz',x:0,y:0}})),
    syringe:run(c=>c.push({id:'S9',type:'syringe',a:{componentId:driven,u:0,v:0},b:{componentId:driven,u:1,v:0}})),
    belt:run(c=>c.push({id:'Chain2',type:'belt',kind:'chain',driver:'SprocketA',driven})),
    carrier:run(c=>c.push({id:'B8',type:'bar',motorCarrier:driven,p1:{id:'zy',x:0,y:0},p2:{id:'zx',x:1,y:0}})),
    gearish:run(c=>c.push({id:'G9',type:'gear',mesh:driven,p1:{id:'zg',x:0,y:0}}))};})();

if(process.argv.includes('--write')){writeFileSync(FILE,JSON.stringify(now,null,0)+'\n');console.log('c5-parity: recorded',works.length,'works');}
else{
  const base=JSON.parse(readFileSync(FILE,'utf8'));
  check('same set of works as the baseline',JSON.stringify(Object.keys(base))===JSON.stringify(Object.keys(now)));
  const diffs=[];
  for(const [w,a] of Object.entries(now))for(const [q,v] of Object.entries(a)){
    const want=INTENDED[w+'/'+q];
    if(want){if(JSON.stringify(v)!==JSON.stringify(want.to))diffs.push(`${w}/${q} (intended value moved: ${v})`);continue;}
    if(JSON.stringify(v)!==JSON.stringify(base[w]?.[q]))diffs.push(`${w}/${q}`);
  }
  check('hole use, exports and free-body answers equal the pre-C5 baseline for every work',diffs.length===0,diffs.slice(0,12).join('; ')+(diffs.length>12?` ... +${diffs.length-12}`:''));
  const questions=Object.keys(now[works[0].name]);
  for(const q of questions)check(`parity: ${q}`,!diffs.some(d=>d.endsWith('/'+q)),diffs.filter(d=>d.endsWith('/'+q)).slice(0,5).join('; '));
  {const w=works.find(x=>x.name==='slider-crank').s,slider=w.comps.find(c=>c.type==='slider');
   const r=attachedGroup(clone(w.comps),{id:slider.id,center:slider.p3.id});
   check('intended: a slider whose rail holes m1/m2 are anchored is not a free group (was free before C5)',r.free===false&&[...r.group].some(c=>c.type==='anchor'),String(r.free));}
  {const w=works.find(x=>x.name==='slider-crank').s,slider=w.comps.find(c=>c.type==='slider');
   check('intended: a slider offers its rail holes m1/m2 as host points (never a host in practice: hosts are bars and plates; quickMotorChoices unchanged)',
     ['m1','m2'].every(k=>actuatorHostPoints(slider).some(p=>p.key===k)));}
  {// model.isFreeBody stays on the startup path (relations.js is lazy), so pin its relation to relations.isFreeBody:
   // a drag-free body is always a relations-free body, and the only reverse difference is the drag type gate (workpiece is not draggable).
   const miss=[],extra=[];
   for(const w of works){const rel=buildRelations({...w.s,topo:w.s});
     for(const c of w.s.comps){const a=isFreeBody(w.s.comps,c,w.s.modules||[]),b=rel.isFreeBody(c.id);if(a&&!b)miss.push(w.name+'/'+c.id);if(b&&!a)extra.push(w.name+'/'+c.id+':'+c.type);}
     // Known C1 limit (reported, not changed here): relations scans every string, so a moduleId equal to some part's id (iq-wheel-grabber: GrabLeft) counts as a reference.
     for(const c of w.s.comps.filter(c=>['bar','triangle'].includes(c.type)&&!w.s.comps.some(o=>o.id===c.moduleId))){   // detached copy: both say free
       const cs=clone(w.s.comps),t=cs.find(x=>x.id===c.id);for(const k of pointKeysFor(t))if(t[k]?.id)t[k].id+='_d';for(const h of t.holes||[])h.id+='_d';
       const a=isFreeBody(cs,t,w.s.modules||[]),b=buildRelations({comps:cs,modules:w.s.modules||[]}).isFreeBody(t.id);if(a&&!b)miss.push(w.name+'/'+c.id+' (detached)');}}
   check('model.isFreeBody (drag) implies relations.isFreeBody on every example comp and detached copy',miss.length===0,miss.slice(0,5).join('; '));
   check('only workpieces are relations-free but not drag-free (caller type gate)',extra.every(x=>x.endsWith(':workpiece')),extra.slice(0,5).join('; '));}
  check('exports are not trivially empty',Object.values(now).filter(a=>/^[0-9a-f]{16}$/.test(a['export-dxf'])).length>=60,String(Object.values(now).filter(a=>/^[0-9a-f]{16}$/.test(a['export-dxf'])).length));
  check('baseline covers real free-body answers (detached variants)',Object.values(base).some(a=>a.freeBodyVariantTrue.length>0)&&Object.values(base).some(a=>a.freeBody.length===0));
  report();
}
