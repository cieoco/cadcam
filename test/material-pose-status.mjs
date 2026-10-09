import assert from 'node:assert/strict';
import {createMaterialPoseStatus} from '../js/blocks/material-pose-status.js';
const scene=x=>({geometryKey:'shape',solveValidity:{valid:true},materialParts:[{partId:'A',pose:{matrix:[x]}}]});
const controller=createMaterialPoseStatus();let checks=0;
const compute=async m=>{checks++;return {geometryKey:m.geometryKey,poseRevision:m.poseRevision,status:'pass',findings:[],coverage:{notSupported:[]}};};
controller.observe(scene(0));await controller.check(compute);assert.equal(controller.snapshot().status,'pass');
controller.observe(scene(1),{isPlaying:true});await controller.check(compute);assert.equal(checks,1);assert.equal(controller.snapshot().status,'not_checked');
controller.observe(scene(1));await controller.check(compute);assert.equal(checks,2);assert.equal(controller.snapshot().status,'pass');
let resolve;controller.observe(scene(2));const waiting=controller.check(m=>new Promise(r=>{resolve=()=>r({geometryKey:m.geometryKey,poseRevision:m.poseRevision,status:'pass'});}));
controller.observe(scene(3));resolve();await waiting;assert.equal(controller.snapshot().status,'not_checked','old awaited pose cannot turn newer pose green');
await controller.check(compute);assert.equal(controller.snapshot().status,'pass');
controller.observe(scene(3),{isCandidate:true});await controller.check(compute);assert.equal(controller.snapshot().status,'not_checked','preview candidate is deferred to W5a');
controller.observe(scene(3));const pauseGuard=controller.check(m=>new Promise(r=>{resolve=()=>r({geometryKey:m.geometryKey,poseRevision:m.poseRevision,status:'pass'});}));
controller.observe(scene(3),{isPlaying:true});resolve();await pauseGuard;assert.equal(controller.snapshot().status,'not_checked','play invalidates even an unchanged pose');
console.log('material pose: pause/revision/candidate/await guards');

import {materialSolveValidity} from '../js/blocks/material-pose-status.js';
const moving=[{type:'bar',p1:{id:'a',type:'fixed'},p2:{id:'b',type:'moving'}}];
assert.equal(materialSolveValidity(moving,{isValid:true,points:{a:{x:0,y:0}}}).valid,false);
assert.equal(materialSolveValidity(moving,null).valid,false);
controller.observe(scene(4));await controller.check(compute);assert.equal(controller.snapshot().status,'pass');
controller.observe({...scene(4),solveValidity:{valid:false,reason:'unsolved_pose'}});await controller.check(compute);assert.equal(controller.snapshot().status,'not_checked');
controller.observe(scene(4));await controller.check(compute);assert.equal(controller.snapshot().status,'pass');
controller.observe(scene(5));const invalidGuard=controller.check(m=>new Promise(r=>{resolve=()=>r({geometryKey:m.geometryKey,poseRevision:m.poseRevision,status:'pass'});}));
controller.observe({...scene(5),solveValidity:{valid:false}});resolve();await invalidGuard;assert.equal(controller.snapshot().status,'not_checked','invalid current solve cannot accept previous solved matrices');

controller.observe(scene(6));await controller.check(()=>undefined);assert.equal(controller.snapshot().status,'not_supported');assert.equal(controller.snapshot().checking,false);
controller.observe(scene(7));await controller.check(m=>({status:'pass',geometryKey:m.geometryKey,poseRevision:m.poseRevision+1,findings:[]}));assert.equal(controller.snapshot().status,'not_supported');assert.equal(controller.snapshot().checking,false,'invalid reply clears its own pending token');
