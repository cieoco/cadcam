// Run after performance-baseline.mjs. Both releases receive identical snapshots.
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
import {normalizeSnapshot as baselineNormalize} from '../output/framework-stabilization/w4a-cache/baseline-1537242/js/blocks/schema.js';
import {f1AssemblyFixture,f1NestedFixture} from '../test/fixtures/f1-assembly-fixture.mjs';
const fixtures=[];
for(const [name,make] of [['F1',f1AssemblyFixture],['F3',f1NestedFixture]]){
 const f=make(),raw=toSnapshot(f.comps,{params:f.params},3,{modules:f.modules,fabrication:f.fabrication,activeMotor:'1',motorAngles:{'2':0}});
 const canonical=baselineNormalize(raw),snapshot=toSnapshot(canonical.comps,{params:canonical.params},3,{modules:canonical.modules,fabrication:canonical.fabrication,activeMotor:'1',motorAngles:{'2':0}});
 const old=baselineNormalize(snapshot),current=normalizeSnapshot(snapshot);
 for(const key of ['comps','modules','params'])assert.deepEqual(current[key],old[key],`${name}: same ${key} in both releases`);
 fixtures.push({name,sha256:createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),snapshot});
}
mkdirSync('test/fixtures/performance',{recursive:true});
writeFileSync('test/fixtures/performance/common.json',JSON.stringify({version:1,baselineSha:'153724267f360ac04141c04989b520be09bbc241',normalization:'Canonical baseline dimensions and explicit motor defaults; same input for both releases',fixtures},null,2)+'\n');
console.log('Prepared identical F1/F3 snapshots; baseline/current dimensions, members and mounts match.');
