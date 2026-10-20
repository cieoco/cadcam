// Student entry points must be editable, unpowered, and completable through the real installer.
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {getExample} from '../js/blocks/examples.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {planPlacedSyringe} from '../js/blocks/syringe-installation.js';
import {scanSyringe,syringeReading,solveSyringe} from '../js/blocks/syringe-operations.js';
for(const n of [1,2,3]){
 const id=`hydraulic-h0${n}`,complete=getExample(id).snapshot,before=JSON.stringify(complete);
 const practice=getExample(id+'-practice').snapshot,source=normalizeSnapshot(practice);
 assert.equal(source.comps.some(c=>c.type==='syringe'),false);
 assert.deepEqual(practice.params,complete.params);
 assert.deepEqual(practice.comps,complete.comps.filter(c=>c.type!=='syringe'));
 const c=complete.comps.find(c=>c.type==='syringe'),f=source.comps.find(part=>part.id===c.a.componentId);
 // Rounded angles match the hints students actually enter, not exact hidden values.
 const angle=[0,153.57,.62][n-1],request={newId:'StudentSyringe',frameId:f.id,
  position:{x:f.p1.x,y:f.p1.y},axisDeg:angle,b:c.b};
 const plan=planPlacedSyringe(source,request);
 assert.ok(plan.ok,plan.message);
 assert.ok(scanSyringe(plan.comps,plan.params,plan.syringe.id).ok);
 const reopened=normalizeSnapshot({kind:'blocks',v:1,comps:plan.comps,params:plan.params});
 assert.ok(scanSyringe(reopened.comps,reopened.params,'StudentSyringe').ok);
 if(n===1){
  const l=plan.params.H1Frame;
  const moved=planPlacedSyringe(plan,{...request,id:plan.syringe.id,position:{x:f.p1.x+200/l,y:f.p1.y+120/l}});
  assert.ok(moved.ok,moved.message);assert.ok(scanSyringe(moved.comps,moved.params,plan.syringe.id).ok);
 }
 if(n===2){
  const params={...plan.params,H2Arm:145.892,H2Tail:plan.params.H2Reach-145.892};
  assert.ok(scanSyringe(plan.comps,params,plan.syringe.id).ok);
  const solved=solveSyringe(plan.comps,params);
  assert.deepEqual(syringeReading(plan.syringe,plan.comps,params,solved.points).end,solved.points.H2C,'newly installed syringe measures the actual 250 mm tip');
 }
 assert.equal(JSON.stringify(complete),before,'original reference unchanged');
 console.log('PASS',id,'install, stroke, persistence and reference preservation');
}
const html=readFileSync('teaching-hydraulic.html','utf8');
for(const id of ['unit-8','unit-9','unit-10','unit-11']){
 assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1);
 assert.ok(readFileSync('teaching.html','utf8').includes('teaching-hydraulic.html#'+id));
}
for(const [,src] of html.matchAll(/(?:src|href)="([^"#?]+)(?:[?#][^"]*)?"/g)){
 if(!/^https?:/.test(src))assert.ok(existsSync(src),'missing course resource '+src);
}
for(const [,id] of html.matchAll(/href="#([^"]+)"/g))assert.ok(html.includes(`id="${id}"`),'missing section '+id);
assert.ok(html.includes('推出收攏')&&html.includes('交叉夾臂'),'variant boundary is explicit');
console.log('PASS four-unit navigation and local assets');
