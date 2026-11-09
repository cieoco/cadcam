import assert from 'node:assert/strict';
import {getExample} from '../js/blocks/examples.js';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
import {resizeStandardBlank} from '../js/blocks/standard-blank.js';
import {planSyringeAttachmentResize,syringeAttachmentHole} from '../js/core/syringe.js';
import {solveSyringe} from '../js/blocks/syringe-operations.js';
import {inspectMountingChange} from '../js/blocks/mounting-review.js';

const base=normalizeSnapshot(getExample('hydraulic-h01').snapshot);
const rod=base.comps.find(c=>c.id==='H1Coupler'),s=base.comps.find(c=>c.type==='syringe');
[rod.p1,rod.p2]=[rod.p2,rod.p1];rod.standardBlank={kind:'bar'};s.b.u=80;
// Stored drawing coordinates can lag the solved pose, particularly after stroke edits.
rod.p2.x-=7;
assert.equal(syringeAttachmentHole(rod,base.params,s.b)?.key,'p2');
assert.ok(solveSyringe(base.comps,base.params).ok);
for(const length of [72,88,96]){
  const next=structuredClone(base),owner=next.comps.find(c=>c.id===rod.id);
  const plan=resizeStandardBlank(owner,next.params,'g',length,{comps:next.comps});
  assert.ok(plan.ok,plan.message);
  planSyringeAttachmentResize(next.comps,owner,80,length).forEach(({id,...patch})=>Object.assign(next.comps.find(c=>c.id===id),patch));
  next.comps[next.comps.indexOf(owner)]=plan.comp;Object.assign(next.params,plan.params);
  const solved=solveSyringe(next.comps,next.params);assert.ok(solved.ok,solved.message);
  const review=inspectMountingChange(base,next);assert.ok(review.ok,review.issues.join(' '));
  assert.equal(review.changes.length,0,'same end connection must not ask to redrill the clamp');
  assert.ok(solveSyringe(normalizeSnapshot(toSnapshot(next.comps,{params:next.params},1,next)).comps,next.params).ok,'save/reopen');
  next.comps.find(c=>c.type==='syringe').a.u+=3;
  assert.ok(inspectMountingChange(base,next).changes.length,'actual clamp movement still reviewed');
}
const impossible=structuredClone(base);impossible.params[rod.lenParam]=1000;impossible.comps.find(c=>c.type==='syringe').b.u=1000;
assert.equal(solveSyringe(impossible.comps,impossible.params).ok,false);
console.log('Standard syringe rod resize: stale pose, end identity, reachable lengths, persistence and clamp review passed');
