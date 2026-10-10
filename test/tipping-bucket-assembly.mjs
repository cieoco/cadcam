import {prepareTippingBucketOperation as prepare,createTippingBucketOperationSession} from '../js/blocks/tipping-bucket-operations.js';
import {planTippingBucket} from '../js/blocks/tipping-bucket-workflow.js';
import {getExample} from '../js/blocks/examples.js';
import {faceCandidateModel} from '../js/blocks/face-candidate.js';
import {faceBracketPlan} from '../js/blocks/face-bracket-extras.js';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
import {encodeSnapshot,decodeShareString} from '../js/share-codec.js';
import {check,report} from './_harness.mjs';
const clone=structuredClone,source=clone(getExample('tipping-bucket').snapshot),before=JSON.stringify(source);
const request=(parameters={},action='updateTask')=>({operationVersion:1,action,...(action==='createFromExample'?{exampleId:'tipping-bucket'}:{}),parameters});
for(const mutate of [s=>s.comps.find(c=>c.id==='Drive').servoEnd=-140,s=>s.comps.find(c=>c.id==='LeftSide').stock.widthMm=2,s=>s.modules.find(m=>m.id==='RightSide').mount.to.module='Driver',s=>delete s.modules.find(m=>m.id==='Back').mount.face.selection.brackets,s=>s.comps.find(c=>c.id==='FloorAnchorA').p1.frameStock.widthMm=60,s=>s.modules.find(m=>m.id==='Back').mount.face.translation.x+=10,s=>s.comps.find(c=>c.id==='Support').p2.x=4]){const s=clone(source);mutate(s);const r=prepare(s,request());check('錯誤角度／接合／孔位／固定軸拒絕且無候選',!r.ok&&!r.candidateSnapshot);}
for(const s of [null,{...source,comps:[null]},{...source,modules:[null,null,null,null]},{...source,params:null}])check('公開組立入口 malformed 不 throw',!planTippingBucket(s).ok);
const valid=prepare(null,request({},'createFromExample'));check('新範例真正四模組MG995',valid.ok&&valid.candidateSnapshot.modules.length===4&&valid.candidateSnapshot.comps.find(c=>c.id==='Drive').motorType==='mg995');
check('主孔與完整組立採樣分開明列',valid.validation.sampleCount===201&&valid.validation.assemblySampleCount===21&&valid.validation.assemblyStepDeg===5);
check('真幾何內腔90×50×60',Object.entries({depth:90,height:50,width:60}).every(([k,v])=>Math.abs(valid.validation.cavityMm[k]-v)<1e-6));
for(const [a,b]of [[-100,0],[-40,-40],[-1,-4]]){const r=prepare(source,request({stowAngleDeg:a,dumpAngleDeg:b}));check('反向／零行程／非整除精確終點',r.ok&&r.plan.start.theta===a&&r.plan.end.theta===b&&(a!==b||r.validation.assemblySampleCount===1));}
for(const angle of [0,-50,-100]){const scene=faceCandidateModel({work:source},{theta:angle,motorAngles:{'1':angle}});check(`真材料${angle}°含四板與MG995`,scene.solveValidity.valid&&['LeftSide','RightSide-frame','Floor-frame','Back-frame'].every(id=>scene.model.materialParts.some(p=>p.partId===id&&p.geometry.outlines.length&&p.geometry.holes.length>=2))&&scene.model.motors.some(m=>m.type==='mg995'));}
for(const id of ['Floor','RightSide','Back']){const p=faceBracketPlan(source.comps,source.modules,source.params,source.modules.find(m=>m.id===id),{stockMm:3,joint:source.fabrication.joint});check(id+'角碼與成對加工孔實際生成',p.ok&&p.physical.length>=2&&p.hostHoles.length===p.childHoles.length);}
const modified=prepare(source,request({dumpAngleDeg:-80}));const n=normalizeSnapshot(modified.candidateSnapshot),saved=toSnapshot(n.comps,{params:n.params},n.counter,{modules:n.modules,fabrication:n.fabrication});check('共用servo角唯一來源、v1保存重開',modified.ok&&saved.v===1&&!Object.hasOwn(saved.params,'bucketDumpAngle')&&saved.comps.find(c=>c.id==='Drive').servoEnd===-80&&prepare(saved,request()).ok);check('分享重開四板接合',prepare(decodeShareString(encodeSnapshot(saved)),request()).ok);
check('來源完全未改寫',JSON.stringify(source)===before);
let current=clone(source),undo=[];const session=createTippingBucketOperationSession({getSnapshot:()=>current,applySnapshot:s=>{undo.push(current);current=s;}});session.prepare(request({dumpAngleDeg:-80}));check('預覽無作品更改',JSON.stringify(current)===before);check('確認一次undo',session.confirm().applied&&undo.length===1);current=undo.pop();check('undo恢復完整組立',JSON.stringify(current)===before);session.prepare(request({dumpAngleDeg:-80}));session.cancel();check('候選取消不提交',!session.confirm().ok&&JSON.stringify(current)===before);session.prepare(request({dumpAngleDeg:-80}));current.comps.find(c=>c.id==='Drive').servoEnd=-70;check('來源變更過期',session.confirm().issues[0].code==='STALE_SOURCE');
check('未驗證限制明列',valid.validation.scope.unchecked.includes('material_discharge')&&valid.validation.scope.unchecked.includes('assembly_between_samples')&&valid.validation.scope.support==='single_side');
report('tipping-bucket-assembly');



