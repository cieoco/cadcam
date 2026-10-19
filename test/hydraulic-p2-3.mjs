// 液壓第二期 P2-3（PLAN-HYDRAULIC-ARM C3＋H05 完整版）：旋轉底盤＋直角立在轉盤上的升降＋夾爪，三支針筒的三軸手臂。
// 干涉面板同 hydraulic-p2-1b；另要求 markAllPlaneZlift（app 與測試共用）讓直角平面的疊放層也生效。
import assert from 'node:assert/strict';
import {hydraulicArmSnapshot as SNAP} from '../js/blocks/hydraulic-assembly-example.js';
import {assemblySyringeControls,planAssemblyExtensions} from '../js/blocks/assembly-syringe.js';
import {markAllPlaneZlift} from '../js/blocks/render-scene.js';
import {readFileSync} from 'node:fs';
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
function panel(n,ext,{zlift=true}={}){
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
  // 對照組模擬 app 修正前：只有目前檢視平面有疊放層，直角平面全部 0。
  if(!zlift)[...prepared.compiled.visualization.links,...(prepared.compiled.visualization.polygons||[])].forEach(o=>{o._zlift=0;});
  if(zlift)markAllPlaneZlift(prepared.compiled.visualization.links,prepared.compiled.visualization.polygons||[],work.comps);
  const inputs=buildPreviewModelInputs({comps:work.comps,params:work.params,theta:0,links:prepared.compiled.visualization.links,polygons:prepared.compiled.visualization.polygons||[],points:sol.points,groundIds,motorCenterIds:ids,motorTypes:new Map([...ids].map(id=>[id,motorTypeAt(work.comps,id)])),motorMounts:mounts,
    sliderTravelStart:c=>c.travelStart||0,sliderTravelEnd:c=>c.travelEnd||100,sliderBodyLength:c=>c.bodyLen||60,rackBodyHeight:c=>c.bodyHeight||20,rackPhaseShift:()=>0,pulleyRadius:()=>32,pulleyPinRadius:()=>20});
  const args={comps:work.comps,modules:work.modules,params:work.params,exportSettings:{...work.exportSettings,drive:work.fabrication.drive||FABRICATION_DEFAULTS.drive},cnc:work.fabrication.cnc,mounts:exportMounts,joint:work.joint};
  const {plan}=resolveSpacers(args);
  const model=buildMaterialScene({...work,catalog,inputs:planeInputs(inputs,work.comps,work.modules,null),allPlanes:inputs,points:sol.points,asm,plan,hullR:DEFAULT_PLATE_RADIUS_WORLD,solveValidity:validity});
  return {validity,model,plan,material:checkMaterialInterference({...model,poseRevision:1}),plane:findInterference({...args,plan,pose:{'1':0}})};
}


const n=load(SNAP);
ok(n.modules.length===3,'三個模組：旋轉底盤、升降、夾爪');
const B=n.modules.find(m=>!m.mount),L=n.modules.find(m=>m.mount?.orient),G=n.modules.find(m=>m.mount?.to?.output);
ok(B&&L&&G&&L.mount.to.module===B.id&&G.mount.to.module===L.id,'升降直角裝在底盤上；夾爪裝在升降臂工具端');
ok(L.mount.to.body==='H4Turn','升降立在轉盤（H4Turn）上，跟著轉盤轉');
const syr=id=>n.comps.find(c=>c.type==='syringe'&&c.moduleId===id);
const sB=syr(B.id),sL=syr(L.id),sG=syr(G.id);
ok(sB&&sL&&sG,'三個模組各有一支針筒');
const tool=L.outputs.find(o=>o.id===G.mount.to.output);
const turn=n.comps.find(c=>c.id==='H4Turn');
const solve=e=>{const cs=structuredClone(n.comps);for(const [id,v] of Object.entries(e))cs.find(c=>c.id===id).extension=v;return solveAssembly(compileAssembly(cs,n.modules,{params:n.params}),{thetaDeg:0,motorAngles:{}});};
const ang=(P,a,b)=>Math.atan2(P[b].y-P[a].y,P[b].x-P[a].x)*180/Math.PI;
const wrap=d=>((d%360)+540)%360-180;
let valid=true,yawFollows=true,attached=true,offset=null;const toolY={};let toolOnlyLift=true;
for(const b of [0,5,10,15,20])for(const l of [0,10,20])for(const g of [0,10,20]){
  const s=solve({[sB.id]:b,[sL.id]:l,[sG.id]:g});if(!s.isValid){valid=false;continue;}
  const P=s.points,yaw=s.orthogonal?.[L.id]?.now?.a,t=ang(P,turn.p1.id,turn.p3.id);
  if(!Number.isFinite(yaw))yawFollows=false;else{const d=wrap(yaw-t);if(offset===null)offset=d;else if(Math.abs(wrap(d-offset))>1e-6)yawFollows=false;}
  if(Math.hypot(P[G.base].x-P[tool.at].x,P[G.base].y-P[tool.at].y)>1e-6)attached=false;
  if(toolY[l]===undefined)toolY[l]=P[tool.at].y;else if(Math.abs(toolY[l]-P[tool.at].y)>1e-6)toolOnlyLift=false;
}
ok(valid,'底盤 0/5/10/15/20 × 升降 0/10/20 × 夾爪 0/10/20 共 45 個姿態都可解');
ok(yawFollows,'升降平面的方位角始終等於轉盤角度＋固定差（隨轉盤轉）');
ok(attached,'夾爪始終貼在升降臂工具端');
ok(toolOnlyLift&&toolY[20]-toolY[0]>15,`工具端高度只隨升降針筒改變，推出抬高（${(toolY[20]-toolY[0]).toFixed(1)} mm）`);
const ctl=assemblySyringeControls(n.comps,n.modules);
ok(ctl.map(c=>c.id).join()===[sB.id,sL.id,sG.id].join(),'控制清單依安裝順序：底盤、升降、夾爪');
const all=planAssemblyExtensions(n.comps,n.modules,n.params,{[sB.id]:20,[sL.id]:20,[sG.id]:20},null);
ok(all.ok,`三支同時推到 20 mm 可解（${all.message||''}）`);
ok(turn.stock?.widthMm>=13,`轉盤條寬 ≥ 13 mm，角碼孔不破邊（${turn.stock?.widthMm}）`);

// ---------- 干涉面板：45 個姿態都不撞 ----------
const rows=[];for(const b of [0,10,20])for(const l of [0,20])for(const g of [0,20])rows.push(panel(n,{[sB.id]:b,[sL.id]:l,[sG.id]:g}));
ok(rows.every(r=>r.validity.valid),'面板路徑 12 個姿態都可解');
ok(rows.every(r=>r.material.findings.length===0&&r.material.status!=='fail'),'材料干涉（含直角平面疊放層）都沒有撞到');
ok(rows.every(r=>r.plane.length===0),'平面干涉都沒有撞到');
const ctrl=[0,10,20].map(b=>panel(n,{[sB.id]:b,[sL.id]:0,[sG.id]:0},{zlift:false}));
ok(ctrl.some(r=>r.material.findings.length>0),'對照：不套用直角平面疊放層時確實會報撞（測試不是空檢查）');

// ---------- app、範例、教材 ----------
const app=readFileSync(new URL('../js/blocks/app.js',import.meta.url),'utf8');
ok(/markAllPlaneZlift\(/.test(app),'app 建 3D 前對所有平面套用疊放層（與測試同一函式）');
const ui=readFileSync(new URL('../js/blocks/syringe-ui.js',import.meta.url),'utf8');
ok(/assemblyWork\(/.test(ui),'組立模式的針筒清單包含直角平面上的針筒');
const ex=readFileSync(new URL('../js/blocks/examples.js',import.meta.url),'utf8');
ok(/id:'hydraulic-h06'/.test(ex)&&/hydraulicArmSnapshot/.test(ex),'範例清單登錄 hydraulic-h06（三軸手臂）');
const t=readFileSync(new URL('../teaching-hydraulic.html',import.meta.url),'utf8');
ok(/blocks\.html\?example=hydraulic-h06/.test(t)&&/第六課/.test(t)&&/直角/.test(t),'教材第六課：升降直角立在轉盤上');
console.log(`hydraulic-p2-3: ${pass} passed`);
