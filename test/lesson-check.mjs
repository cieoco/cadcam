import assert from 'node:assert/strict';
import { getExample } from '../js/blocks/examples.js';
import { normalizeSnapshot, toSnapshot } from '../js/blocks/schema.js';
import { checkSliderLesson } from '../js/blocks/lesson-check.js';
const s = normalizeSnapshot(getExample('slider-crank').snapshot);
const before = JSON.stringify(s);
assert.equal(checkSliderLesson(s).status, 'retry');
assert.equal(JSON.stringify(s), before);
s.params.LL1 = 40; s.params.LL2 = 88;
const pass = checkSliderLesson(s);
assert.equal(pass.status, 'pass'); assert.ok(Math.abs(pass.strokeMm - 80) < 1e-6);
s.params.LL1 = 32; assert.equal(checkSliderLesson(s).status, 'retry');
s.params.LL1 = 40;
const missing = structuredClone(s); missing.comps = missing.comps.filter(c => c.id !== 'Link2');
assert.equal(checkSliderLesson(missing).status, 'unknown');
const short = structuredClone(s); short.params.LL2 = 10;
assert.equal(checkSliderLesson(short).status, 'unknown');
const servo = structuredClone(s); servo.comps.find(c => c.isInput).motorType = 'mg995';
assert.equal(checkSliderLesson(servo).status, 'unknown');
const extra = structuredClone(s); extra.comps.push({type:'bar',id:'loose',p1:{id:'Z',x:0,y:0},p2:{id:'Q',x:20,y:0},lenParam:'ZZ'}); extra.params.ZZ=20;
assert.equal(checkSliderLesson(extra).status, 'unknown');
// Translation and rotation must not turn screen X displacement into measured stroke.
const rotated=structuredClone(s);
for(const c of rotated.comps) for(const key of ['p1','p2','p3','m1','m2']) if(c[key]) {const p=c[key];[p.x,p.y]=[-p.y+200,p.x+100];}
rotated.comps.find(c=>c.isInput).phaseOffset=90;
assert.equal(checkSliderLesson(rotated).status,'pass');
assert.equal(checkSliderLesson(normalizeSnapshot(toSnapshot(s.comps, { params: s.params }, 6))).status,'pass');
console.log('PASS slider task: 60/64/80 mm, missing/invalid/servo/free bar, rigid transform, round trip and nonmutation');



const shortRail=structuredClone(s); shortRail.comps.find(c=>c.type==='slider').p2.x=90; shortRail.params.SL1=45;
assert.equal(checkSliderLesson(shortRail).status,'unknown');
assert.equal(checkSliderLesson(normalizeSnapshot(getExample('slider-crank-practice').snapshot)).status,'unknown');
