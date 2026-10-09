import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {faceCandidateModel} from '../js/blocks/face-candidate.js';
const common=JSON.parse(readFileSync(new URL('./fixtures/performance/common.json',import.meta.url)));
assert.deepEqual(common.fixtures.map(f=>f.name),['F1','F3']);
for(const f of common.fixtures){
 assert.equal(createHash('sha256').update(JSON.stringify(f.snapshot)).digest('hex'),f.sha256);
 const norm=normalizeSnapshot(f.snapshot),again=normalizeSnapshot(norm);
 for(const key of ['comps','modules','params'])assert.deepEqual(norm[key],again[key]);
 for(const theta of [0,20,40])assert.equal(faceCandidateModel({work:norm},{theta,motorAngles:{'2':0}}).solveValidity.valid,true);
 assert.ok(norm.modules.length===(f.name==='F1'?2:3));
}
console.log('fixed performance fixtures: hashes, normalization stability, F1/F3 valid motion');
