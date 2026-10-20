// 液壓 P2-1 追加：H05 的夾爪疊在升降臂前面（疊放層 zlift），組立干涉面板在 升降 0/10/20 × 夾爪 0/10/20 都不報撞。
// 用面板同一套函式：材料干涉 buildMaterialScene＋checkMaterialInterference，平面干涉 resolveSpacers＋findInterference。
import assert from 'node:assert/strict';
import {hydraulicLiftGripSnapshot as SNAP} from '../js/blocks/hydraulic-assembly-example.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {compileAssembly,solveAssembly,rebakeModules} from '../js/blocks/assembly.js';
import {prepareConnectionWork} from '../js/blocks/connection-work.js';
import {buildPartGeometryCatalog} from '../js/blocks/part-geometry.js';
import {buildPreviewModelInputs} from '../js/blocks/preview-model-inputs.js';
import {buildMaterialScene} from '../js/blocks3d/material-scene.js';
import {planeInputs} from '../js/blocks3d/orthogonal-3d.js';
import {computeBodyLayers} from '../js/blocks3d/scene-model.js';
import {motorPointIds,pointCoords} from '../js/blocks/model.js';
import {motorTypeAt} from '../js/blocks/motor-tools.js';
import {buildMotorMounts,buildMotorExportMounts} from '../js/blocks/motor-mounts.js';
import {FABRICATION_DEFAULTS} from '../js/blocks/fabrication-profile.js';
import {materialSolveValidity} from '../js/blocks/material-pose-status.js';
import {DEFAULT_PLATE_RADIUS_WORLD} from '../js/blocks/plate-geometry.js';
import {resolveSpacers,findInterference} from '../js/blocks/interference.js';
import {checkMaterialInterference} from '../js/blocks/material-interference.js';
import {collectSceneIds,prepareRenderScene} from '../js/blocks/render-scene.js';
let pass=0;const ok=(cond,msg)=>{assert.ok(cond,msg);pass++;console.log('PASS',msg);};

const load=snap=>{const n=normalizeSnapshot(snap),rb=rebakeModules(n.comps,n.modules,n.params);return {...n,comps:rb.comps,modules:rb.modules};};
// 組立台「目前姿態」的干涉檢查：照 app.js push3DNow／bench-ui 的順序建材料場景（含 render-scene 的疊放層），再跑兩種檢查。
function panel(n,ext){
  const work={comps:structuredClone(n.comps),modules:structuredClone(n.modules),params:{...n.params},fabrication:structuredClone(FABRICATION_DEFAULTS)};
  for(const [id,e] of Object.entries(ext))work.comps.find(c=>c.id===id).extension=e;
  work.topo={params:work.params};work.stockMm=Number(work.fabrication.cnc.stockThicknessMm);work.exportSettings=work.fabrication.export||{};work.joint=work.fabrication.joint;
  const prepared=prepareConnectionWork(work.comps,work.modules,work.topo,{stockMm:work.stockMm,exportSettings:work.exportSettings});work.modules=prepared.modules;work.params=work.topo.params;
  const asm=compileAssembly(work.comps,work.modules,work.topo),sol=solveAssembly(asm,{thetaDeg:0,motorAngles:{}});
  const validity=materialSolveValidity(work.comps,sol);if(!validity.valid)return {validity};
  const ids=motorPointIds(work.comps),groundIds=new Set(work.comps.flatMap(c=>[c.p1,c.p2,c.p3].filter(p=>p&&['fixed','motor'].includes(p.type)).map(p=>p.id)));
  const mounts=buildMotorMounts({motorIds:ids,groundIds,staticPoints:pointCoords(work.comps),comps:work.comps,compiledSteps:prepared.compiled.steps,sliderMountInfo:()=>null,isHiddenSliderRailPoint:()=>false,motorTypeForCenter:id=>motorTypeAt(work.comps,id)});
  const exportMounts=buildMotorExportMounts({comps:work.comps,pts:pointCoords(work.comps),motorCenterIds:ids,motorMounts:mounts,typeForCenter:id=>motorTypeAt(work.comps,id),ttSettings:work.fabrication.ttMount||FABRICATION_DEFAULTS.ttMount,mg995Settings:work.fabrication.mg995Mount||FABRICATION_DEFAULTS.mg995Mount});
  const catalog=buildPartGeometryCatalog({...work,mounts:exportMounts});
  const sceneIds=collectSceneIds({compiled:prepared.compiled,comps:work.comps,motorPointIds:ids});
  prepareRenderScene({compiled:prepared.compiled,comps:work.comps,points:sol.points,frameGeometry:catalog.parts.frame||null,sceneIds,computeBodyLayers,motorAssemblyLayerForBody:()=>null,motorMounts:mounts});
  const inputs=buildPreviewModelInputs({comps:work.comps,params:work.params,theta:0,links:prepared.compiled.visualization.links,polygons:prepared.compiled.visualization.polygons||[],points:sol.points,groundIds,motorCenterIds:ids,motorTypes:new Map([...ids].map(id=>[id,motorTypeAt(work.comps,id)])),motorMounts:mounts,
    sliderTravelStart:c=>c.travelStart||0,sliderTravelEnd:c=>c.travelEnd||100,sliderBodyLength:c=>c.bodyLen||60,rackBodyHeight:c=>c.bodyHeight||20,rackPhaseShift:()=>0,pulleyRadius:()=>32,pulleyPinRadius:()=>20});
  const args={comps:work.comps,modules:work.modules,params:work.params,exportSettings:{...work.exportSettings,drive:work.fabrication.drive||FABRICATION_DEFAULTS.drive},cnc:work.fabrication.cnc,mounts:exportMounts,joint:work.joint};
  const {plan}=resolveSpacers(args);
  const model=buildMaterialScene({...work,catalog,inputs:planeInputs(inputs,work.comps,work.modules,null),allPlanes:inputs,points:sol.points,asm,plan,hullR:DEFAULT_PLATE_RADIUS_WORLD,solveValidity:validity});
  return {validity,model,plan,material:checkMaterialInterference({...model,poseRevision:1}),plane:findInterference({...args,plan,pose:{'1':0}})};
}

const n=load(SNAP);
const lift=n.comps.find(c=>c.id==='H2Syringe'),grip=n.comps.find(c=>c.id==='H3Syringe');
const gripComps=n.comps.filter(c=>c.moduleId==='Grip'&&['bar','triangle'].includes(c.type)),liftComps=n.comps.filter(c=>c.moduleId==='Lift'&&['bar','triangle'].includes(c.type));
ok(gripComps.length===5&&gripComps.every(c=>c.zlift===3),'夾爪模組的桿與板整組往外抬 3 層（疊在升降臂前面）');
ok(liftComps.length===3&&liftComps.every(c=>!c.zlift),'升降模組不抬層（臂與連接桿留在原層）');

const sweep=(snap)=>{const m=load(snap),rows=[];
  for(const g of [0,10,20])for(const l of [0,10,20])rows.push({l,g,...panel(m,{[lift.id]:l,[grip.id]:g})});return rows;};
const rows=sweep(SNAP);
ok(rows.every(r=>r.validity.valid),'升降 0/10/20 × 夾爪 0/10/20 九個姿態都可解');
ok(rows.every(r=>r.material.findings.length===0&&r.material.status!=='fail'),'材料干涉（面板用的 3D 材料檢查）九個姿態都沒有撞到');
ok(rows.every(r=>r.plane.length===0),'平面干涉（面板用的 findInterference）九個姿態都沒有撞到');
const cross=rows[0].material.pairs.filter(p=>{const m=id=>n.comps.find(c=>c.id===id)?.moduleId||(id.endsWith('-frame')?id.split('-')[0]:null);const [a,b]=p.pairId.split('|');return m(a)&&m(b)&&m(a)!==m(b);});
ok(cross.length>=6&&cross.every(p=>p.status==='pass'),'跨模組的零件配對（升降臂、連接桿對夾爪各零件）確實有檢查，全部通過');

// 對照組：拿掉夾爪的疊放層，同一套檢查會報撞——證明上面不是檢查沒在看。
const bare=structuredClone(SNAP);bare.comps.forEach(c=>{delete c.zlift;});
const control=sweep(bare);
ok(control.some(r=>r.material.findings.length>0),'對照：不抬層時同一套材料檢查在某些姿態報撞');

// 層次：3D 場景裡夾爪所有零件的底面都在升降臂與連接桿的頂面之上。
const m0=rows[0].model,top=(zs,t)=>Math.max(...zs.map(z=>z+t));
const zOf=id=>{const s=m0.sticks.find(q=>q.id===id);if(s)return s.z;const c=n.comps.find(q=>q.id===id);return m0.plates.find(q=>[c.p1.id,c.p2.id,c.p3.id].every(p=>q.ids.includes(p))).z;};
const liftTop=Math.max(...['H2Arm','H2Coupler'].map(id=>zOf(id)+3)),gripLow=Math.min(...['H3Upper','H3Lower','H3JawA','H3JawB'].map(zOf));
ok(gripLow>=liftTop,`夾爪最低層 z=${gripLow} mm 在升降臂／連接桿頂面 z=${liftTop} mm 之上`);

// 組裝計畫（製作包的層號、墊片、隔柱）不因抬層而改變：同組一起抬，組內相對層序不變。
const planOf=snap=>{const m=load(snap);return panel(m,{[lift.id]:10,[grip.id]:10}).plan.parts.map(p=>[p.name,p.layer,p.zMm]);};
assert.deepEqual(planOf(SNAP),planOf(bare));ok(true,'製作包的層號與 z 不因抬層而變');
console.log(`hydraulic-p2-1b: ${pass} checks passed`);
