import assert from 'node:assert/strict';
import {BLOCK_EXAMPLES,getExample,loadUnitStarts} from '../js/blocks/examples.js';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
import {compileTopology} from '../js/core/topology.js';
import {solveTopology} from '../js/multilink/solver.js';
await loadUnitStarts();
const e=getExample('block-gear-gripper');assert.equal(e.catalog,'blocks');
assert.deepEqual(BLOCK_EXAMPLES.filter(e=>e.catalog==='blocks').map(e=>e.id).sort(),['block-gear-gripper','four-wheel-chassis']);
const s=normalizeSnapshot(e.snapshot);assert.ok(s);
assert.equal(s.comps.length,5);
const gears=s.comps.filter(c=>c.type==='gear');assert.equal(gears.length,2);
assert.ok(gears.some(c=>c.motorType==='mg995'));assert.equal(gears[1].mesh,gears[0].id);
assert.deepEqual(gears.map(c=>[c.teeth,c.module]),[[18,4],[18,4]]);
const frame=s.comps.find(c=>c.standardBlank?.kind==='plate');assert.ok(frame);
const arms=s.comps.filter(c=>c.standardBlank?.kind==='arms');assert.equal(arms.length,2);
for(let i=0;i<2;i++){
 const ids=new Set([arms[i].p1.id,arms[i].p2.id,arms[i].p3.id,...arms[i].holes.map(h=>h.id)]);
 assert.ok(gears[i].holes.every(h=>ids.has(h.id)),'each jaw retains two pins to its own gear');
}
const topology=compileTopology(s.comps,{params:s.params},new Set());
for(let theta=0;theta<=90;theta+=5){const r=solveTopology(topology,theta,s.params);assert.notEqual(r?.valid,false,`angle ${theta}`);}
const again=normalizeSnapshot(toSnapshot(s.comps,{...s,params:s.params},s.counter));
assert.deepEqual(again.comps,s.comps);assert.deepEqual(again.params,s.params);
const before=JSON.stringify(e.snapshot);s.comps[0].name='試改';assert.equal(JSON.stringify(e.snapshot),before,'loaded work does not edit stored example');
console.log('block-built example: original five parts, 18/18 m4 gears, two-pin jaws, servo motion, roundtrip and independent edits');
