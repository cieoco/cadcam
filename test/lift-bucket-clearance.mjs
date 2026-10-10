import {getExample} from '../js/blocks/examples.js';
import {faceCandidateModel} from '../js/blocks/face-candidate.js';
import {checkMaterialInterference} from '../js/blocks/material-interference.js';
import {planParallelLift} from '../js/blocks/parallel-lift-workflow.js';
import {prepareRigidGroupInterface} from '../js/blocks/rigid-group-interface.js';
import {isFixedMountPart} from '../js/blocks/part-types.js';
import {check,report} from './_harness.mjs';
const w=structuredClone(getExample('lift-bucket').snapshot),ids=['LeftSide','RightSide-frame','Floor-frame','Back-frame'];
for(const arm of [32,64,120]){
 const s=structuredClone(w);s.params.LL1=s.params.LL2=arm;let ok=true,count=0;
 for(let angle=0;angle<=80;angle+=2){const scene=faceCandidateModel({work:s},{theta:angle,motorAngles:{'1':angle}}),r=checkMaterialInterference(scene.model);ok&&=scene.solveValidity.valid&&ids.every(id=>r.coverage.checkedPartIds.includes(id))&&r.findings.length===0&&!r.coverage.notSupported.some(x=>x.code!=='material_representation_not_supported');count++;}
 check(`${arm}mm臂0–80度每2度${count}點實際板件無穿透`,ok);
}
const detached=prepareRigidGroupInterface(w,{operationVersion:1,action:'detach',hostId:'RigidGroup',groupId:'group-side'});
const old=prepareRigidGroupInterface(detached.candidateSnapshot,{operationVersion:1,action:'attach',hostId:'RigidGroup',groupId:'group-side',target:{module:'Lift',output:'tool'}});
check('舊同層接合真實干涉不被略過',!old.ok&&old.issues[0].message.includes('干涉'));
check('非法負間距拒絕',!prepareRigidGroupInterface(detached.candidateSnapshot,{operationVersion:1,action:'attach',hostId:'RigidGroup',groupId:'group-side',target:{module:'Lift',output:'tool'},faceGapMm:-1}).ok);
const plate=w.comps.find(c=>c.id==='LeftSide');check('固定多孔板可選面',isFixedMountPart(plate));const moving=structuredClone(plate);moving.p2.type='floating';check('活動多孔板不能充當固定安裝端',!isFixedMountPart(moving));
const low=structuredClone(w);low.params.LL1=low.params.LL2=120;low.params.parallelEndHeight=117.6;low.modules.find(m=>m.id==='RigidGroup').mount.face.selection.gap=6;check('長臂高位6mm仍有干涉須拒絕',!planParallelLift(low).ok);
const material=faceCandidateModel({work:w},{theta:30}).model.materialParts;const left=material.find(p=>p.partId==='LeftSide'),host=material.find(p=>p.partId==='Link3');
check('實際材料表面間距12mm',Math.abs(left.pose.matrix[14]-host.pose.matrix[14]-host.geometry.thicknessMm-12)<1e-6);
const cached=planParallelLift(w);cached.validation.assemblySampleCount=-1;check('快取結果不可被呼叫者污染',planParallelLift(w).validation.assemblySampleCount>0);
report('lift-bucket-clearance');
