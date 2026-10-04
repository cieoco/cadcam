import assert from 'node:assert/strict';
import { memberSweepSegments } from '../js/blocks/member-sweep.js';
import { getExample } from '../js/blocks/examples.js';
import { normalizeSnapshot } from '../js/blocks/schema.js';
import { compileTopology } from '../js/core/topology.js';
import { traceSweeps } from '../js/blocks/motion.js';
const model=normalizeSnapshot(getExample('fourbar-crank-rocker').snapshot);
function sweep(length) {
 const params={...model.params,LL3:length};
 const compiled=compileTopology(structuredClone(model.comps),{params},new Set());
 const traces=traceSweeps(compiled,params,['D'],0,360,5);
 return memberSweepSegments(traces[0].results,'B','D');
}
const segments=sweep(80);
assert.ok(segments.length>60);
assert.ok(segments.every(({a,b})=>Math.abs(a.x-20)<1e-7 && Math.abs(a.y)<1e-7 && Math.abs(Math.hypot(b.x-a.x,b.y-a.y)-80)<1e-6));
const span=lines=>{const angles=lines.map(({a,b})=>Math.atan2(b.y-a.y,b.x-a.x));return Math.max(...angles)-Math.min(...angles)};
assert.ok(span(sweep(88))<span(segments),'Changing rocker length updates the swept angular range');
assert.deepEqual(memberSweepSegments([{isValid:false,points:{B:{x:0,y:0},D:{x:1,y:1}}},{isValid:true,points:{B:{x:0,y:0}}}],'B','D'),[]);
const frames=[{isValid:true,points:{C:{x:1,y:2},D:{x:4,y:5}}},{isValid:true,points:{C:{x:2,y:3},D:{x:7,y:9}}}];
assert.deepEqual(memberSweepSegments(frames,'C','D')[1],{a:{x:2,y:3},b:{x:7,y:9}});
console.log('member-sweep: synchronized endpoints, invalid samples, fixed pivot and changed length passed');
