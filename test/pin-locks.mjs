import assert from 'node:assert/strict';
import {planInsertPin,planPinLock,planPinUnlock,planUnpin,pinPairs} from '../js/blocks/pin-ops.js';
import {compileTopology} from '../js/core/topology.js';
import {solveTopology} from '../js/multilink/solver.js';
import {pinPoints} from '../js/core/pin-lock.js';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
import {storedProject} from '../js/blocks/project-envelope.js';
import {planResize} from '../js/blocks/resize-plan.js';
import {planDelete} from '../js/blocks/delete-part.js';
import {planMemberCopy} from '../js/blocks/member-copy.js';
import {instantiateTemplate} from '../js/blocks/module-ops.js';
import {loadIntegrity,integrityGate} from '../js/blocks/integrity-gate.js';
import {analyzeDof} from '../js/blocks/dof.js';
import {buildRelations} from '../js/blocks/relations.js';
await loadIntegrity();
const point=(id,x,y,type='floating')=>({id,x,y,type});
const a={type:'bar',id:'A',p1:{...point('O',0,0,'fixed'),physicalMotor:'1'},p2:point('P',20,0),lenParam:'LA',fixedLen:true,isInput:true,physicalMotor:'1'};
const bar={type:'bar',id:'B',p1:point('P',20,0),p2:point('Q',30,Math.sqrt(300)),fixedLen:true,lenParam:'LB'};
const plate={type:'triangle',id:'T',p1:point('P',20,0),p2:point('T2',30,10),p3:point('T3',15,20),gParam:'TG',r1Param:'TR1',r2Param:'TR2',sign:1};
const pose=(w,theta)=>solveTopology(compileTopology(w.comps,{params:{...w.params}},new Set()),{thetaDeg:theta});
const near=(x,y)=>assert.ok(Math.abs(x-y)<1e-5,`${x} != ${y}`),rot=(p,t)=>({x:p.x*Math.cos(t*Math.PI/180)-p.y*Math.sin(t*Math.PI/180),y:p.x*Math.sin(t*Math.PI/180)+p.y*Math.cos(t*Math.PI/180)});
for(const member of [bar,plate]){
 const work={kind:'blocks',v:1,comps:[structuredClone(a),structuredClone(member)],params:{LA:20,LB:20,TG:Math.sqrt(200),TR1:Math.sqrt(425),TR2:Math.sqrt(325)},counter:3};
 const before=JSON.stringify(work),r=planPinLock(work,{ownerId:member.id,otherId:'A',at:'P'});assert.ok(r.ok,r.message);assert.equal(JSON.stringify(work),before,'lock is a pure candidate');assert.deepEqual(r.params,work.params);
 const locked={...work,...r};assert.equal(analyzeDof(r.comps).dof,1,'locked pair counts as one rigid body');assert.equal(pinPairs(locked,'P')[0].locked,true);assert.ok(buildRelations(locked).attachmentsOf(member.id).some(r=>r.kind==='pin-lock'));
 for(const theta of [0,25,60]){const solved=pose(locked,theta);assert.ok(solved.isValid&&!solved.isUnderconstrained,solved.errorReason);for(const p of pinPoints(member)){const q=rot(p,theta);near(solved.points[p.id].x,q.x);near(solved.points[p.id].y,q.y);}}
 const compiled=compileTopology(r.comps,{params:{...r.params}},new Set());assert.ok(compiled.parts.every(c=>!c.id.startsWith('pin-lock-')),'constraint triangles are not fabricated parts');
 const shown=pose(locked,25).points,free=planPinUnlock({...locked,points:shown},{ownerId:member.id,otherId:'A',at:'P'});assert.ok(free.ok);assert.equal(analyzeDof(free.comps).dof,2);assert.ok(!free.comps.find(c=>c.id===member.id).pinLocks);assert.equal(free.comps.find(c=>c.id===member.id).p1.id,'P');assert.equal(pinPairs(free,'P')[0].locked,false);
 const pulled=planUnpin({...locked,points:shown},{ownerId:member.id,otherId:'A',at:'P'});assert.ok(pulled.ok);assert.notEqual(pulled.comps.find(c=>c.id===member.id).p1.id,'P');assert.equal(pulled.comps.find(c=>c.id==='A').p2.id,'P');near(pulled.comps.find(c=>c.id===member.id).p2.x,shown[member.p2.id].x);
 const saved=storedProject(toSnapshot(r.comps,{params:r.params},3));assert.ok(saved.requires.includes('pin-lock-v1'));const opened=normalizeSnapshot(saved);assert.ok(opened);assert.deepEqual(opened.comps.find(c=>c.id===member.id).pinLocks,r.comps.find(c=>c.id===member.id).pinLocks);assert.ok(pose(opened,25).isValid);
}
// Collinear bars with distinct reference points use the existing degenerate dyad.
{
 const straight={...structuredClone(bar),p2:point('Q',40,0)},w={comps:[structuredClone(a),straight],params:{LA:20,LB:20},counter:1},r=planPinLock(w,{ownerId:'B',otherId:'A',at:'P'});assert.ok(r.ok,r.message);for(const theta of [0,30]){const q=pose({...w,...r},theta);assert.ok(q.isValid&&!q.isUnderconstrained);const expected=rot(straight.p2,theta);near(q.points.Q.x,expected.x);near(q.points.Q.y,expected.y);}
}
// A gear-local pin captures displayed theta=25° geometry while its saved frame stays at zero.
{
 const gear={type:'gear',id:'G',p1:{...point('GC',0,0,'fixed'),physicalMotor:'1'},p2:point('GP',16,0),radiusParam:'GR',pinRadiusParam:'GPR',phase:0,teeth:24,module:3,holes:[{id:'Mount',u:0,v:-16,type:'floating',diameter:3.2}]};
 const arm={...structuredClone(bar),p1:point('Mount',0,-16),p2:point('Tip',24,-16),lenParam:'L'};const positions=Object.fromEntries([gear,arm].flatMap(pinPoints).map(p=>[p.id,rot(p,25)]));
 const w={comps:[gear,arm],params:{GR:36,GPR:16,L:24},points:positions,counter:1},r=planPinLock(w,{ownerId:'B',otherId:'G',at:'Mount'});assert.ok(r.ok,r.message);for(const theta of [25,60]){const q=pose({...w,...r},theta);assert.ok(q.isValid&&!q.isUnderconstrained,q.errorReason);const expected=rot(arm.p2,theta);near(q.points.Tip.x,expected.x);near(q.points.Tip.y,expected.y);}
}
// With three owners, only the chosen pair is locked and only the selected body leaves.
{
 const third={...structuredClone(bar),id:'C',p2:point('C2',10,-Math.sqrt(300))},w={comps:[structuredClone(a),structuredClone(bar),third],params:{LA:20,LB:20},counter:1},r=planPinLock(w,{ownerId:'B',otherId:'A',at:'P'});assert.ok(r.ok);assert.equal(pinPairs(r,'P').filter(p=>p.locked).length,1);const removed=planUnpin({...w,...r},{ownerId:'C',otherId:'A',at:'P'});assert.ok(removed.ok);assert.equal(removed.comps.find(c=>c.id==='B').p1.id,'P');assert.equal(removed.comps.find(c=>c.id==='A').p2.id,'P');assert.equal(removed.comps.find(c=>c.id==='B').pinLocks.length,1);
}
// Lock -> move -> unlock -> save/reopen at zero -> lock is based on local dimensions, not seed coordinates.
{
 const gear={type:'gear',id:'G',p1:{...point('GC',0,0,'fixed'),physicalMotor:'1'},p2:point('GP',16,0),radiusParam:'GR',pinRadiusParam:'GPR',phase:0,teeth:24,module:3,holes:[{id:'Mount',u:0,v:-16,type:'floating',diameter:3.2}]};
 const arm={...structuredClone(bar),p1:point('Mount',0,-16),p2:point('Tip',32,-16),lenParam:'L'},w={kind:'blocks',v:1,comps:[gear,arm],params:{GR:36,GPR:16,L:32},counter:1};
 const locked=planPinLock(w,{ownerId:'B',otherId:'G',at:'Mount'});assert.ok(locked.ok);const shown=pose({...w,...locked},18).points,free=planPinUnlock({...w,...locked,points:shown},{ownerId:'B',otherId:'G',at:'Mount'});
 const opened=normalizeSnapshot(toSnapshot(free.comps,{params:free.params},1));assert.ok(opened);const current=pose(opened,0).points;
 const again=planPinLock({...opened,points:current},{ownerId:'B',otherId:'G',at:'Mount'});assert.ok(again.ok,again.message);assert.ok(pose({...opened,...again},25).isValid);near(again.comps.find(c=>c.id==='B').pinLocks[0].ownRadiusMm,32);
}
// Copy/delete/rename and resize guards retain mechanical semantics.
{
 const w={kind:'blocks',v:1,comps:[structuredClone(a),structuredClone(bar)],params:{LA:20,LB:20},counter:5},r=planPinLock(w,{ownerId:'B',otherId:'A',at:'P'}),locked={...w,...r};
 assert.equal(planResize(locked,{componentId:'B',id:'g',raw:24}).ok,false);
 const changed=structuredClone(locked);changed.params.LB=24;assert.equal(integrityGate(locked,changed,()=>{}),false,'all commit paths reject new lock radius mismatch');
 const copy=planMemberCopy({...locked,id:'B'});assert.ok(copy.ok);assert.ok(copy.comps.every(c=>!c.pinLocks),'copy body does not copy an external lock');
 const deleted=planDelete(locked,{part:locked.comps.find(c=>c.id==='A'),shared:[]});assert.ok(deleted.ok,deleted.message);assert.ok(deleted.comps.every(c=>!c.pinLocks),'delete releases only obsolete lock metadata');
 const made=instantiateTemplate(locked,{counter:10,place:{x:100,y:100}}),owner=made.comps.find(c=>c.pinLocks?.length);assert.ok(owner);assert.notEqual(owner.pinLocks[0].id,r.comps.find(c=>c.id==='B').pinLocks[0].id);assert.ok(made.comps.some(c=>c.id===owner.pinLocks[0].with));assert.ok(pose(made,25).isValid,'module-instance ID remap keeps lock references');
}
// Free-body arbitrary local-hole insert translates only that body at a displayed target.
{
 const target={type:'triangle',id:'T',p1:point('T1',0,0,'fixed'),p2:point('T2',40,0,'fixed'),p3:point('T3',0,40),gParam:'TG',r1Param:'TH',r2Param:'TD',sign:1};
 const free={...structuredClone(bar),p1:point('B1',60,50),p2:point('B2',80,50),holes:[{id:'Bmid',u:8,v:0,diameter:3.2,type:'floating'}]},w={comps:[target,free],params:{TG:40,TH:40,TD:Math.sqrt(3200),LB:20},points:{T2:{x:40,y:0},B1:{x:60,y:50},B2:{x:80,y:50},Bmid:{x:68,y:50}}};
 const r=planInsertPin(w,{ownerId:'B',otherId:'T',from:'Bmid',to:'T2'});assert.ok(r.ok,r.message);assert.deepEqual(r.comps[0],target);const b=r.comps[1];assert.equal(b.holes[0].id,'T2');near(b.p1.x,32);near(b.p1.y,0);near(b.p2.x-b.p1.x,20);assert.deepEqual(r.params,w.params);
}
// Ordinary second pins rotate only the selected rigid body about the existing pin.
{
 const target={type:'triangle',id:'T',p1:point('P',0,0,'fixed'),p2:point('T2',32,0,'fixed'),p3:point('T3',0,32),gParam:'TG',r1Param:'TH',r2Param:'TD',sign:1};
 const free={...structuredClone(bar),p1:point('P',0,0),p2:point('B2',0,32)},w={comps:[target,free],params:{TG:32,TH:32,TD:Math.sqrt(2048),LB:32}};
 const r=planInsertPin(w,{ownerId:'B',otherId:'T',from:'B2',to:'T2'});assert.ok(r.ok,r.message);assert.deepEqual(r.comps[0],target);assert.equal(r.comps[1].p1.id,'P');assert.equal(r.comps[1].p2.id,'T2');near(r.comps[1].p2.x,32);near(r.comps[1].p2.y,0);assert.deepEqual(r.params,w.params);assert.equal(pinPairs(r,'P')[0].limited,true);
 const bad=structuredClone(w);bad.comps[1].p2.y=24;bad.params.LB=24;assert.equal(planInsertPin(bad,{ownerId:'B',otherId:'T',from:'B2',to:'T2'}).ok,false);assert.equal(bad.comps[1].p2.id,'B2');
}
console.log('pin locks: bar/bar, bar/plate, collinear and gear local hole at theta25; pair-specific lock/unlock/unpin, separate fabricated parts, exact motion and save/reopen passed');
import {pickPinTargets} from '../js/blocks/pin-hit.js';
{
 const support={type:'anchor',id:'Support',p1:point('SupportHole',100,50,'fixed')},free={...structuredClone(bar),p1:point('B1',0,0),p2:point('B2',20,0)},w={comps:[support,free],params:{LB:20}};
 const joined=planInsertPin(w,{ownerId:'Support',otherId:'B',from:'SupportHole',to:'B1'});assert.ok(joined.ok,joined.message);assert.equal(joined.comps[1].p1.id,'SupportHole');assert.equal(pinPairs(joined,'SupportHole').length,1);
 const apart=planUnpin(joined,{ownerId:'B',otherId:'Support',at:'SupportHole'});assert.ok(apart.ok,apart.message);assert.deepEqual(apart.comps[0],support);assert.notEqual(apart.comps[1].p1.id,'SupportHole');
}
{
 const holes=[{id:'hidden-grid',ownerId:'arm',x:40,y:60},{id:'plate',ownerId:'base',x:40,y:60},{id:'next',ownerId:'arm',x:48,y:60}];
 assert.equal(pickPinTargets(holes,{x:49,y:61})[0].id,'next','screen-space nearest hole wins even when no SVG circle is drawn');
 assert.equal(pickPinTargets(holes,{x:40,y:60}).length,2,'overlapping bodies keep both explicit choices');
 assert.equal(pickPinTargets(holes,{x:100,y:100}).length,0,'distant holes cannot steal a first-hole tap');
 assert.equal(pickPinTargets([{id:'h',ownerId:'arm',x:40,y:60}],{x:63,y:60}).length,1,'small holes retain a 24px tap target');
}
