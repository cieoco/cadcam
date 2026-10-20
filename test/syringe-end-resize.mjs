import assert from 'node:assert/strict';
import {snapshot} from './fixtures/syringe-end-resize.mjs';
import {planSyringeAttachmentResize} from '../js/core/syringe.js';
import {solveSyringe,scanSyringe} from '../js/blocks/syringe-operations.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {recomputeLengths} from '../js/blocks/model.js';

const original=JSON.stringify(snapshot);
assert.ok(scanSyringe(snapshot.comps,snapshot.params,'Syringe1').ok);
assert.equal(solveSyringe(snapshot.comps,{...snapshot.params,LL13:48}).ok,false,'regression: stale second-hole offset disconnects');
for(const length of [32,48,56]){
  const w=structuredClone(snapshot),bar=w.comps.find(c=>c.id==='Link13');
  const patches=planSyringeAttachmentResize(w.comps,bar,w.params.LL13,length);
  assert.equal(JSON.stringify(w),original,'planning is pure');
  patches.forEach(({id,...patch})=>Object.assign(w.comps.find(c=>c.id===id),patch));
  w.params.LL13=length;
  assert.equal(w.comps.find(c=>c.type==='syringe').b.u,length);
  assert.ok(scanSyringe(w.comps,w.params,'Syringe1').ok,`full stroke at ${length}`);
  const reopened=normalizeSnapshot(JSON.parse(JSON.stringify(w)));
  assert.ok(scanSyringe(reopened.comps,reopened.params,'Syringe1').ok,'roundtrip');
}
const w=structuredClone(snapshot),bar=w.comps.find(c=>c.id==='Link13'),s=w.comps.find(c=>c.type==='syringe');
for(const ref of [{u:0,v:0},{u:20,v:0},{u:40,v:2},{u:48,v:0}]){
  s.b={componentId:bar.id,...ref};
  assert.deepEqual(planSyringeAttachmentResize(w.comps,bar,40,56),[],'first end/interior/offset/stale mounts are not stretched');
}
s.a={componentId:bar.id,u:40,v:0};s.b={componentId:bar.id,u:40,v:0};
assert.deepEqual(planSyringeAttachmentResize(w.comps,bar,40,48),[{id:s.id,a:{...s.a,u:48},b:{...s.b,u:48}}],'both attachments follow their end hole');
const dragged=structuredClone(snapshot),rod=dragged.comps.find(c=>c.id==='Link13');
rod.fixedLen=false;rod.p2.x=rod.p1.x+48;rod.p2.y=rod.p1.y;
recomputeLengths(dragged.comps,{params:dragged.params});
assert.equal(dragged.params.LL13,48);assert.equal(dragged.comps.find(c=>c.type==='syringe').b.u,48);
assert.ok(scanSyringe(dragged.comps,dragged.params,'Syringe1').ok);
const impossible=structuredClone(snapshot);impossible.params.LL13=500;impossible.comps.find(c=>c.type==='syringe').b.u=500;
assert.equal(solveSyringe(impossible.comps,impossible.params).ok,false,'unreachable lengths still fail');
assert.equal(JSON.stringify(snapshot),original);
console.log('Syringe end resize: full stroke, persistence, endpoint/interior rules, drag and unreachable geometry passed');
