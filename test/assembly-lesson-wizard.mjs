import assert from 'node:assert/strict';
import {getExample} from '../js/blocks/examples.js';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
import {buildFaceCandidate,faceCandidateModel,validateFaceCandidate} from '../js/blocks/face-candidate.js';
import {buildPartGeometryCatalog} from '../js/blocks/part-geometry.js';
import {faceFileExportData,validateFaceExport} from '../js/blocks/face-export.js';
import {checkMaterialInterference} from '../js/blocks/material-interference.js';
import {applyMatrix4} from '../js/blocks3d/orthogonal-3d.js';
const full=normalizeSnapshot(getExample('assembly-lift-gripper').snapshot);
const source=normalizeSnapshot(getExample('assembly-lift-gripper-practice').snapshot),before=JSON.stringify(source);
const selection=full.modules.find(m=>m.id==='Grip1').mount.face.selection;
const joined=buildFaceCandidate({...source,fabrication:{}},{childId:'Grip1',hostEndpoint:{moduleId:'Lift1',outputId:'tool',partId:'Link3'},childEndpoint:{partId:'frame'},selection});
assert.ok(joined.ok,joined.reason);assert.equal(JSON.stringify(source),before,'preview never changes the practice');
assert.ok((await validateFaceCandidate(joined)).saveable);
// Spare frames are preview-only; they never enlarge the machine frame or enter its manufacturing scope.
const args={...source,fabrication:{}},normal=buildPartGeometryCatalog(args),preview=buildPartGeometryCatalog({...args,includeSpareFrames:true});
assert.ok(preview.parts['Grip1-frame']);assert.equal(normal.parts['Grip1-frame'],undefined);
assert.deepEqual(normal.parts.frame,preview.parts.frame);assert.notEqual(normal.key,preview.key);
assert.ok(preview.parts['Grip1-frame'].holes.some(h=>h.id==='GCB'));
assert.ok(preview.parts['Grip1-frame'].holes.some(h=>h.layer==='TT_SHAFT'));
for(const work of [full,joined.work]){
 let prev=null,first=null;
 for(const lift of [-40,-20,0,20,40,60])for(const grip of [0,15,30]){
  const scene=faceCandidateModel({work},{theta:0,motorAngles:{'1':lift,'2':grip},_prevPoints:prev});
  assert.ok(scene.solveValidity.valid);prev=scene.points;
  const p=scene.points;assert.ok(Math.abs(p.D.x-p.C.x)<1e-6&&Math.abs(p.D.y-p.C.y-72)<1e-6);
  const frame=scene.model.materialParts.find(p=>p.partId==='Grip1-frame'),m=frame.pose.matrix;
  assert.ok(Math.abs(m[9])>0.999999,'claw plate normal is vertical (world Y)');
  const child=scene.model.orthogonal.find(c=>c.id==='Grip1');
  const tips=['LT','RT'].map(id=>applyMatrix4(child.matrix,{...scene.points[id],z:0}));
  const centers=['GCA','GCB'].map(id=>applyMatrix4(child.matrix,{...scene.points[id],z:0}));
  assert.ok(tips.every(t=>Math.abs(t.y-tips[0].y)<1e-6),'left/right closing stays horizontal');
  assert.ok(tips.reduce((n,t)=>n+t.x,0)>centers.reduce((n,t)=>n+t.x,0),'tips face forward, away from the lift base');
  if(grip===0){if(first)assert.ok(Math.abs((m[13]-first.y)-(p.C.y-first.cy))<1e-6);else first={y:m[13],cy:p.C.y};}
  const report=checkMaterialInterference(scene.model);
  assert.notEqual(report.status,'fail',`plate / bracket interference at lift ${lift}, claw ${grip}`);
 }
 const data=faceFileExportData(work),checked=await validateFaceExport(work,{theta:0});
 assert.ok(checked.ok,checked.reason);
 assert.ok(data.catalog.parts.Link3.holes.some(h=>h.connectionId));
 assert.ok(data.catalog.parts['Grip1-frame'].holes.some(h=>h.connectionId));
 const saved=toSnapshot(work.comps,{params:work.params},work.counter,{modules:work.modules,fabrication:work.fabrication});
 const opened=normalizeSnapshot(saved);assert.deepEqual(opened.modules,JSON.parse(JSON.stringify(work.modules)));
 assert.ok(faceCandidateModel({work:opened}).solveValidity.valid);
}
console.log('Lesson 7: spare frame, forward horizontal claw, lift/close samples, brackets, exports and roundtrip passed');
