// Difference table for pack C1 of docs/SDD-CONNECTION-INTEGRITY.md.
// Compares the new relation index (js/blocks/relations.js) with the old per-feature implementations on every built-in
// example plus the two student files, and prints counts and the first few disagreements per question.
//   node tools/relations-diff.mjs [--all]      (--all prints every disagreement instead of the first 6)
// Read-only; nothing here is wired into the app.
import {readFileSync} from 'node:fs';
import {BLOCK_EXAMPLES,loadUnitStarts} from '../js/blocks/examples.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {buildRelations} from '../js/blocks/relations.js';
import {isFreeBody,pointIsGround,pointHasMotor} from '../js/blocks/model.js';
import {machinedComps} from '../js/blocks/used-holes.js';
import {offPlateMotors,planMotorReturn} from '../js/blocks/motor-release.js';
import {pointKeysFor} from '../js/blocks/part-types.js';

await loadUnitStarts();
const ALL=process.argv.includes('--all'),SHOW=ALL?Infinity:6;
const clone=v=>structuredClone(v);
const asWork=s=>({...s,topo:{...s}});
const works=[];
for(const e of BLOCK_EXAMPLES){const s=normalizeSnapshot(clone(e.snapshot));if(s)works.push({name:e.id,w:asWork(s)});}
for(const f of ['connected-resize','motor-off-plate']){
  const s=normalizeSnapshot(JSON.parse(readFileSync(new URL(`../test/fixtures/${f}.json`,import.meta.url),'utf8')));
  if(s)works.push({name:'file:'+f,w:asWork(s)});
}

const Q={
  freeBody:{title:'free body: model.isFreeBody vs relations.isFreeBody',n:0,diff:[]},
  group:{title:'off-plate motor group "free": motor-release.attachedGroup (via planMotorReturn message) vs relations (BFS over attachmentsOf)',n:0,diff:[]},
  machining:{title:'hole machining: used-holes.machinedComps vs relations.holeRoles().machining',n:0,diff:[]},
  ground:{title:'ground: model.pointIsGround vs relations.isGround',n:0,diff:[]},
  motor:{title:'has-motor: model.pointHasMotor vs relations.motorOf(pointId)!==null',n:0,diff:[]},
};
const note=(q,s)=>{Q[q].diff.push(s);};

for(const {name,w} of works){
  const r=buildRelations(w),{comps,modules,params}=w;
  // free body
  for(const c of comps){
    Q.freeBody.n++;
    const o=isFreeBody(comps,c,modules),n=r.isFreeBody(c.id);
    if(o!==n)note('freeBody',`${name}/${c.id} (${c.type}${c.shape?'/'+c.shape:''}): old=${o} new=${n}${n?'':' attachments='+r.attachmentsOf(c.id).slice(0,3).map(a=>a.kind+'>'+a.otherId).join(',')}`);
  }
  // off-plate motor group
  for(const item of offPlateMotors(comps)){
    Q.group.n++;
    const plan=planMotorReturn({comps,params,modules,fabrication:w.fabrication,counter:w.counter},item.id);
    const old=plan.ok&&/桿件放回/.test(plan.message);
    // new: group = owner plus comps reachable through shared points other than the shaft; free when none of them is ground
    // (other than the shaft) and nothing outside the group (except the host) touches it.
    const group=new Set([item.id]),stack=[item.id];let free=true;
    while(stack.length){
      const id=stack.pop();
      for(const a of r.attachmentsOf(id)){
        if(a.otherId===item.host.id||a.via===item.center)continue;
        if(a.kind!=='shared-point'){free=false;continue;}
        if(!group.has(a.otherId)){group.add(a.otherId);stack.push(a.otherId);}
      }
    }
    for(const id of group){const c=comps.find(c=>c.id===id);for(const k of pointKeysFor(c)){const p=c[k];if(p?.id&&p.id!==item.center&&r.isGround(p.id))free=false;}}
    if(old!==free)note('group',`${name}/${item.id}: old=${old} new=${free}`);
  }
  // machining (standard parts only, as used-holes decides: lattice holes + primary points)
  const m=machinedComps(comps,modules,params);
  comps.forEach((c,i)=>{
    if(!c.standardBlank)return;
    const mc=m[i],all=mc===c;
    const decide=[...(c.holes||[]).filter(h=>Number.isFinite(h.u)&&Number.isFinite(h.v)).map(h=>[h.id,all||mc.holes.includes(h)]),
                  ...['p1','p2','p3'].filter(k=>c[k]).map(k=>[c[k].id,all||!mc.undrilled.includes(k)])];
    for(const [id,old] of decide){Q.machining.n++;const n=r.holeRoles(c.id,id).machining;if(n!==old)note('machining',`${name}/${c.id}/${id}: old=${old} new=${n}`);}
  });
  // ground + motor, per point id
  const ids=new Set();
  for(const c of comps)for(const k of pointKeysFor(c))if(c[k]?.id)ids.add(c[k].id);
  for(const id of ids){
    Q.ground.n++;
    const og=pointIsGround(comps,id),ng=r.isGround(id);
    if(og!==ng)note('ground',`${name}/${id}: old=${og} new=${ng} (${r.groundSource(id)})`);
    Q.motor.n++;
    const om=pointHasMotor(comps,id),nm=r.motorOf(id)!==null;
    if(om!==nm){const m2=r.motorOf(id);note('motor',`${name}/${id}: old=${om} new=${nm}${m2?` (owner ${m2.ownerId}, motor ${m2.motor}, isInput=${m2.isInput})`:''}`);}
  }
}

console.log(`relations-diff: ${works.length} works (${BLOCK_EXAMPLES.length} built-in examples + 2 student files)\n`);
for(const q of Object.values(Q)){
  const byWork=new Map();for(const d of q.diff){const k=d.split('/')[0];byWork.set(k,(byWork.get(k)||0)+1);}
  console.log(`## ${q.title}\n   compared ${q.n}, disagreements ${q.diff.length} in ${byWork.size} work(s)`);
  for(const d of q.diff.slice(0,SHOW))console.log('   - '+d);
  if(q.diff.length>SHOW)console.log(`   ... ${q.diff.length-SHOW} more (--all)`);
  console.log();
}
