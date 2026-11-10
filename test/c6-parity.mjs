// Pack C6 of docs/SDD-CONNECTION-INTEGRITY.md: the gear-side "output hole is taken" checks and connectedRootComps must answer the same
// after the hand-written reference lists were replaced by (or pinned against) the field table of ref-fields.js / attachmentsOf.
// test/fixtures/c6-parity.json was recorded on d7c642f (before C6). Same style as c5-parity.mjs.
//   node test/c6-parity.mjs            compare with the recorded baseline
//   node test/c6-parity.mjs --write    re-record (only after a reviewed, intended difference; list it in INTENDED)
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BLOCK_EXAMPLES,loadUnitStarts} from '../js/blocks/examples.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {connectedRootComps} from '../js/blocks/module-ops.js';
import {planGearMemberMount} from '../js/blocks/gear-member-mount.js';
import {planGearHolePlacement,outputRadius} from '../js/blocks/gear-hole-placement.js';
import {pointKeysFor} from '../js/blocks/part-types.js';
import {check,report} from './_harness.mjs';

// INTENDED differences from d7c642f: none. (gear-member-mount now also treats any other field that names the gear's output hole as
// "taken"; no built-in example or variant below depends on it. See test/c6-attachments.mjs for the strictness cases.)
const INTENDED={};
const FILE=new URL('./fixtures/c6-parity.json',import.meta.url);
const sha=v=>process.env.C6_RAW?v:createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0,16);
const clone=v=>structuredClone(v);
const safe=fn=>{try{return fn();}catch(e){return 'ERR '+String(e?.message||e).split('\n')[0].slice(0,80);}};
await loadUnitStarts();
const works=[];
for(const e of BLOCK_EXAMPLES){const s=normalizeSnapshot(clone(e.snapshot));if(s)works.push({name:e.id,s});}

const P=(id,x=0,y=0)=>({id,type:'floating',x,y});
// one extra comp per way of "naming the gear" (gear g); the first column says whether the old hand list counted it
const ATTACH=g=>({
  none:null,
  fusedWith:{id:'Y1',type:'triangle',fusedWith:g.id,p1:P('y1'),p2:P('y2',1),p3:P('y3',0,1)},
  pinion:{id:'Y2',type:'rack',pinion:g.id,p1:P('y4'),p2:P('y5',1)},
  syringeA:{id:'Y3',type:'syringe',a:{componentId:g.id,u:0,v:0},b:{componentId:'nobody',u:0,v:0}},
  syringeB:{id:'Y3',type:'syringe',a:{componentId:'nobody',u:0,v:0},b:{componentId:g.id,u:1,v:0}},
  carrier:{id:'Y4',type:'bar',motorCarrier:g.id,p1:P('y6'),p2:P('y7',1)},
  sharesP2:{id:'Y5',type:'bar',p1:P(g.p2.id),p2:P('y8',1)},
  sharesP1:{id:'Y5',type:'bar',p1:P(g.p1.id),p2:P('y8',1)},
  outputBody:{id:'Y6',type:'bar',motorMount:{outputBody:g.id},p1:P('y9'),p2:P('y10',1)},
  mesh:{id:'Y7',type:'gear',mesh:g.id,p1:P('y11'),p2:P('y12',1)},
  jaw:{id:'Y8',type:'syringe',jawIds:[g.id],a:{componentId:'nobody',u:0,v:0},b:{componentId:'nobody',u:0,v:0}},
  locatorP2:{id:'Y9',type:'bar',mountLocatorPoint:g.p2.id,p1:P('y13'),p2:P('y14',1)},
  mountPointP2:{id:'Y10',type:'bar',motorMountPoint:g.p2.id,p1:P('y15'),p2:P('y16',1)},
  moduleIdOnly:{id:'Y11',type:'bar',moduleId:g.id,p1:P('y17'),p2:P('y18',1)},   // moduleId equal to the gear id is not a reference
});
function answers({name,s}){
  const out={},gears=s.comps.filter(c=>c.type==='gear'),members=s.comps.filter(c=>['bar','triangle'].includes(c.type));
  if(gears.length){
    const g=gears[0];
    out.gearHole=sha(safe(()=>Object.entries(ATTACH(g)).map(([k,extra])=>{const w=clone(s);if(extra)w.comps.push(clone(extra));
      const r=planGearHolePlacement(w,{gearId:g.id,mode:'manual',radius:outputRadius(g,w.params)+1,angle:10});return [k,r.ok,r.ok?'':r.message];})));
    out.gearMount=sha(safe(()=>members.slice(0,4).map(m=>Object.entries(ATTACH(g)).map(([k,extra])=>{
      const w=clone(s),t=w.comps.find(x=>x.id===m.id);for(const key of pointKeysFor(t))if(t[key]?.id){t[key].id+='_d';t[key].type='floating';delete t[key].physicalMotor;}
      for(const h of t.holes||[])h.id+='_d';t.isInput=false;if(extra)w.comps.push(clone(extra));
      const r=planGearMemberMount(w,{memberId:m.id,gearId:g.id,centerId:t.p1.id,pinId:t.p2.id,matchRadius:true,flipPin:true});return [m.id,k,r.ok,r.ok?'':(r.message||r.reason)];}))));
  }
  // connectedRootComps: each root, plus synthetic links between the first two roots
  const roots=s.comps.filter(c=>!c.moduleId);
  out.rootGroup=sha(safe(()=>roots.map(c=>[c.id,[...connectedRootComps(s.comps,c.id)].sort()])));
  return out;
}
const now={};for(const w of works)now[w.name]=answers(w);
// synthetic roots: a chain of bars linked by one field at a time
now._roots=(()=>{
  const bar=(id,x,extra={})=>({id,type:'bar',p1:P(id+'a',x),p2:P(id+'b',x+1),...extra});
  const run=(second,third)=>safe(()=>{const comps=[bar('R1',0),bar('R2',10,second),...(third?[third]:[])];return comps.map(c=>[c.id,[...connectedRootComps(comps,c.id)].sort()]);});
  return {apart:run({}),shared:run({p1:P('R1b',1)}),carrier:run({motorCarrier:'R1'}),frame:run({motorMount:{frameBody:'R1'}}),
    fusionRoot:run({barFusionRoot:'R1'}),gearMesh:run({},{id:'G1',type:'gear',mesh:'R1',p1:P('g1'),p2:P('g2')}),
    belt:run({},{id:'B1',type:'belt',driver:'R1',driven:'R2'}),rackPinion:run({},{id:'K1',type:'rack',pinion:'R2',p1:P('k1')}),
    syringe:run({},{id:'S1',type:'syringe',a:{componentId:'R1',u:0,v:0},b:{componentId:'R2',u:0,v:0}}),
    moduled:run({moduleId:'M1',p1:P('R1b',1)}),                                   // a moduled comp is not a root: never joins
    nameOnly:run({name:'R1'})};                                                    // a name equal to another id is not a link
})();
if(process.argv.includes('--write')){writeFileSync(FILE,JSON.stringify(now)+'\n');console.log('c6-parity: recorded',works.length,'works');}
else{
  const base=JSON.parse(readFileSync(FILE,'utf8'));
  check('same set of works as the baseline',JSON.stringify(Object.keys(base))===JSON.stringify(Object.keys(now)));
  const diffs=[];
  for(const [w,a] of Object.entries(now))for(const [q,v] of Object.entries(a)){
    const want=INTENDED[w+'/'+q];
    if(want){if(JSON.stringify(v)!==JSON.stringify(want.to))diffs.push(`${w}/${q} (intended value moved)`);continue;}
    if(JSON.stringify(v)!==JSON.stringify(base[w]?.[q]))diffs.push(`${w}/${q}`);
  }
  check('gear output-hole refusals and connectedRootComps equal the d7c642f baseline for every work and variant',diffs.length===0,diffs.slice(0,8).join('; '));
  check('baseline has gear works',Object.values(base).filter(a=>a.gearHole).length>=5,String(Object.values(base).filter(a=>a.gearHole).length));
  report();
}
