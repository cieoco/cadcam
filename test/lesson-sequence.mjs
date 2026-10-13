import assert from 'node:assert/strict';
import { assemblyLessonSnapshot } from '../js/blocks/assembly-lesson-example.js';
import { DEFAULT_SEQUENCE,prepareLessonSequence,sequenceAnglesAt } from '../js/blocks/lesson-sequence.js';
const source=structuredClone(assemblyLessonSnapshot),steps=structuredClone(DEFAULT_SEQUENCE),start={'1':0,'2':0};
const before=JSON.stringify({source,steps,start});
const plan=prepareLessonSequence(source,steps,start); assert.equal(plan.ok,true);
assert.equal(JSON.stringify({source,steps,start}),before);
assert.deepEqual(sequenceAnglesAt(plan,0).angles,start);
assert.deepEqual(sequenceAnglesAt(plan,1.5).angles,{'1':-20,'2':0});
assert.deepEqual(sequenceAnglesAt(plan,4).angles,{'1':-20,'2':30});
assert.deepEqual(sequenceAnglesAt(plan,6).angles,{'1':40,'2':30});
assert.deepEqual(sequenceAnglesAt(plan,100).angles,{'1':-20,'2':0});
for(const angle of [61,NaN,Infinity]){const bad=structuredClone(steps);bad[0].angle=angle;assert.equal(prepareLessonSequence(source,bad,start).ok,false);}
for(const seconds of [0,0.1,6,NaN]){const bad=structuredClone(steps);bad[0].seconds=seconds;assert.equal(prepareLessonSequence(source,bad,start).ok,false);}
const detached=structuredClone(source);detached.modules[1].mount=null;assert.equal(prepareLessonSequence(detached,steps,start).ok,false);
const broken=structuredClone(source);broken.params.LL3=10;assert.equal(prepareLessonSequence(broken,steps,start).ok,false);
const narrow=structuredClone(source);narrow.comps.find(c=>c.id==='Link1').servoEnd=10;assert.equal(prepareLessonSequence(narrow,steps,start).ok,false);
assert.equal(prepareLessonSequence(source,steps,{'1':0,'2':80}).ok,false);
console.log('PASS sequence endpoint/interpolation, invalid targets/durations, detached/broken assembly, servo limits and nonmutation');
