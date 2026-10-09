import assert from 'node:assert/strict';
import {getExample} from '../js/blocks/examples.js';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
import {mateTargets,mateConnect} from '../js/blocks/mate-connect.js';
import {faceFileExportData,validateFaceExport,usesFaceExport} from '../js/blocks/face-export.js';
import {moduleFrameExports} from '../js/blocks/assembly.js';
import {faceCandidateModel} from '../js/blocks/face-candidate.js';
import {mkdirSync,writeFileSync} from 'node:fs';
const source=normalizeSnapshot(getExample('assembly-lift-gripper-practice').snapshot),before=JSON.stringify(source);
const target=mateTargets(source.comps,source.modules,'Grip1',source.params).find(t=>t.kind==='bolt'&&t.ok);
assert.ok(target,'lesson must offer a real two-hole target in the wizard');
const joined=mateConnect(source.comps,source.modules,'Grip1',{module:target.module,mate:target.mateId},source.params,{activeMotor:'1',theta:0,motorAngles:{'2':0}});
assert.ok(joined.ok,joined.reason);assert.equal(JSON.stringify(source),before);
const work={...source,...joined};assert.ok(usesFaceExport(work));
for(const theta of [0,20,40]){
 const data=faceFileExportData(work,{theta,motorAngles:{'2':0}}),host=data.catalog.parts.Link3,frame=data.catalog.parts['Grip1-frame'];
 const bolts=moduleFrameExports(work.comps,work.modules,work.params).find(e=>e.moduleId==='Grip1').bolts;
 assert.equal(bolts.length,2);assert.notEqual(bolts[0].id,bolts[1].id);assert.ok(Math.hypot(bolts[0].x-bolts[1].x,bolts[0].y-bolts[1].y)>20);
 for(const id of ['ToolBolt1','ToolBolt2']){
  const a=host.holes.find(h=>h.id===id),b=frame.holes.find(h=>h.id===id);
  assert.ok(a&&b,'both actual materials contain the named bolt hole');assert.equal(a.r,1.6);assert.equal(b.r,1.6);
 }
 const checked=await validateFaceExport(work,{theta,motorAngles:{'2':0}});assert.ok(checked.ok,checked.reason);
 const model=faceCandidateModel({work},{theta,motorAngles:{'2':0}}).model;
 const a=model.materialParts.find(p=>p.partId==='Link3'),b=model.materialParts.find(p=>p.partId==='Grip1-frame');
 const world=(part,id)=>{const h=part.geometry.holes.find(h=>h.id===id),m=part.pose.matrix;return [m[0]*h.x+m[4]*h.y+m[12],m[1]*h.x+m[5]*h.y+m[13]];};
 for(const id of ['ToolBolt1','ToolBolt2'])assert.ok(Math.hypot(...world(a,id).map((v,i)=>v-world(b,id)[i]))<1e-6,'moving host/frame bolt axes stay aligned');
}
for(const distance of [24,100]){const invalid=structuredClone(work);invalid.params.ToolBoltDist2=distance;const rejected=await validateFaceExport(invalid);assert.equal(rejected.ok,false,'overlapping or outside bolt holes cannot export');}
const saved=toSnapshot(work.comps,{params:work.params},0,{modules:work.modules,fabrication:work.fabrication}),opened=normalizeSnapshot(saved);
assert.deepEqual(opened.modules,work.modules);assert.equal(opened.params.ToolBoltDist1,24);assert.equal(opened.params.ToolBoltDist2,48);
mkdirSync('output/framework-stabilization/w5b-lesson',{recursive:true});writeFileSync('output/framework-stabilization/w5b-lesson/ui-practice.blocks.json',JSON.stringify(toSnapshot(source.comps,{params:source.params},0,{modules:source.modules,fabrication:source.fabrication})));
console.log('F4 wizard: two real named host/frame holes, moving poses, export guard, save/open');
