import assert from 'node:assert/strict';
import {BLOCK_EXAMPLES,getExample,loadUnitStarts} from '../js/blocks/examples.js';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
import {storedProject,prepareMotorParts} from '../js/blocks/project-envelope.js';
import {compileAssembly,solveAssembly} from '../js/blocks/assembly.js';
import {faceCandidateModel} from '../js/blocks/face-candidate.js';
import {checkMaterialInterference} from '../js/blocks/material-interference.js';
import {checkWork} from '../js/blocks/integrity.js';
await loadUnitStarts();await loadUnitStarts();const e=getExample('four-wheel-gripper-car');assert.ok(e);assert.equal(e.catalog,'blocks');assert.equal(BLOCK_EXAMPLES.filter(x=>x.id===e.id).length,1);assert.ok(getExample('four-wheel-chassis'),'standalone chassis is kept');
const w=normalizeSnapshot(e.snapshot),before=JSON.stringify(e.snapshot);assert.ok(w);assert.equal(w.projectName,'四輪夾爪車');assert.equal(w.comps.length,13);assert.equal(w.modules.length,5);assert.equal(w.assemblyMembers.length,5);assert.deepEqual(checkWork(w),[]);
assert.equal(w.comps.filter(c=>c.wheelWidthMm!==undefined).length,4);assert.equal(w.modules.filter(m=>m.designInstance).length,2);
const gripper=w.modules.find(m=>m.mount?.face?.selection.pin);assert.ok(gripper);const selection=gripper.mount.face.selection;assert.equal(selection.gap,4);assert.equal(selection.rotationDeg,-90);assert.equal(selection.pin.hostHole,'Blank137_H144_16_141');assert.equal(selection.pin.childHole,'Blank1_H104_8_143');
const asm=compileAssembly(w.comps,w.modules,{params:w.params}),zero={'1':0,'2':0,'3':0,'4':0,'5':0},home=solveAssembly(asm,{thetaDeg:0,motorAngles:zero});assert.ok(home.isValid);
for(const id of Object.keys(zero)){const r=solveAssembly(asm,{thetaDeg:90,motorAngles:{...zero,[id]:90}});assert.ok(r.isValid,`M${id} solves`);assert.ok(Object.keys(r.points).some(k=>home.points[k]&&Math.hypot(r.points[k].x-home.points[k].x,r.points[k].y-home.points[k].y)>.01),`M${id} changes its output`);}
for(const angle of [0,15,30,45,60,75,90]){const scene=faceCandidateModel({ok:true,work:w,validation:{checks:[]}},{theta:angle,motorAngles:{...zero,'5':angle}});assert.ok(scene.solveValidity.valid);const report=checkMaterialInterference(scene.model);assert.equal(report.findings.length,0,`gripper sample ${angle}° material`);assert.ok(report.coverage.notSupported.length>0,'unknown hardware/fabrication coverage must remain explicit');}
const stored=storedProject(toSnapshot(w.comps,{...w,params:w.params},w.counter,{modules:w.modules,fabrication:w.fabrication,motorAngles:w.motorAngles,activeMotor:w.activeMotor}));await prepareMotorParts(stored);const reopened=normalizeSnapshot(JSON.parse(JSON.stringify(stored)));assert.ok(reopened);assert.deepEqual(reopened.modules, w.modules);assert.deepEqual(reopened.params,w.params);assert.deepEqual(reopened.comps,w.comps);assert.deepEqual(checkWork(reopened),[]);
w.comps[0].name='試改';assert.equal(JSON.stringify(e.snapshot),before,'loading or editing does not change the registered example');
console.log('gripper car: independent catalog entry, five motors, editable shared designs, original pin/hole identities, 4 mm clearance, seven sample poses, coverage honesty and v1 reopen');
