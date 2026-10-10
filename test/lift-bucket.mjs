import {liftBucketSnapshot as build} from '../js/blocks/lift-bucket-builder.js';
import { getExample } from '../js/blocks/examples.js';
import { planParallelLift } from '../js/blocks/parallel-lift-workflow.js';
import { prepareParallelLiftOperation as prepare,createParallelLiftOperationSession } from '../js/blocks/parallel-lift-operations.js';
import {prepareRigidGroupInterface} from '../js/blocks/rigid-group-interface.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {encodeSnapshot,decodeShareString} from '../js/share-codec.js';
import {check,report} from './_harness.mjs';
const w=structuredClone(getExample('lift-bucket').snapshot),before=JSON.stringify(w);
const request=parameters=>({operationVersion:1,action:'updateTask',parameters});
check('範例等於共用操作生成結果',JSON.stringify(build(getExample('parallel-fourbar').snapshot))===before);
check('既有兩案例組成12零件5模組',w.comps.length===12&&w.modules.length===5&&planParallelLift(w).ok);
check('單馬達無翻轉自由度',w.comps.filter(c=>c.isInput).length===1&&!w.comps.some(c=>c.id==='Drive'));
for(const arm of [48,64,120]){const r=prepare(w,request({armLengthMm:arm,startHeightMm:10,endHeightMm:arm*.8}));check(`調臂長${arm}後材料保持姿態`,r.ok&&r.validation.assemblySampleCount>1&&r.candidateSnapshot.params.LL2===arm);}
check('不可達高度拒絕',!prepare(w,request({endHeightMm:100})).ok);
for(const change of [s=>s.params.LL2=32,s=>s.modules[0].outputs[0].at='D',s=>s.modules.find(m=>m.id==='Floor').mount=null,s=>s.modules.find(m=>m.id==='RigidGroup').mount.to.output='missing']){const bad=structuredClone(w);change(bad);check('不等長／錯輸出／斷接拒絕',!planParallelLift(bad).ok);}
const detached=prepareRigidGroupInterface(w,{operationVersion:1,action:'detach',hostId:'RigidGroup',groupId:'group-side'});
check('拆下仍可動升降臂且明列未安裝',detached.ok&&planParallelLift(detached.candidateSnapshot).validation.groupMount==='detached');
const attached=prepareRigidGroupInterface(detached.candidateSnapshot,{operationVersion:1,action:'attach',hostId:'RigidGroup',groupId:'group-side',target:{module:'Lift',output:'tool'}});
check('装回恢復跟隨驗證',attached.ok&&planParallelLift(attached.candidateSnapshot).ok);
check('保存／分享重開',planParallelLift(normalizeSnapshot(decodeShareString(encodeSnapshot(w)))).ok);
check('來源不被修改',JSON.stringify(w)===before);
let current=w,undo=[];const session=createParallelLiftOperationSession({getSnapshot:()=>current,applySnapshot:s=>{undo.push(current);current=s;}});
session.prepare(request({armLengthMm:64}));session.cancel();check('取消候選不修改',JSON.stringify(current)===before&&!session.confirm().ok);
session.prepare(request({armLengthMm:64}));check('確認單筆復原',session.confirm().ok&&undo.length===1&&current.params.LL1===64);current=undo.pop();check('復原全組幾何',JSON.stringify(current)===before);
check('AI建立同一範例',prepare(null,{operationVersion:1,action:'createFromExample',exampleId:'lift-bucket'}).ok);
check('不完整整合作品明確拒絕',!planParallelLift({params:{liftBucket:1}}).ok);
report('lift-bucket');
