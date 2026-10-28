import assert from 'node:assert/strict';
import {BOX_DEFAULTS,BOX_ROLES,normalizeBoxPanel} from '../js/blocks/box-config.js';
import {checkedBox,boxesInWork} from '../js/blocks/box-generator.js';
import {planBoxChange} from '../js/blocks/box-operations.js';
import {storedProject,readStoredProject} from '../js/blocks/project-envelope.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {encodeSnapshot,decodeShareString} from '../js/share-codec.js';
import {applyMatrix4} from '../js/blocks3d/orthogonal-3d.js';
import {faceFileExportData} from '../js/blocks/face-export.js';
import {boxLayout,boxFile} from '../js/blocks/box-files.js';
import {exportLinksAsSvg,exportLinksAsDxf} from '../js/blocks/exporters.js';
import {tabNutPlans} from '../js/blocks/tab-nut-plan.js';
import {buildPlan,hardwareList} from '../js/blocks/build-plan.js';
import {compositeToTemplate,normalizeTemplate,instantiateComposite} from '../js/blocks/module-ops.js';
import {buildFaceCandidate,validateFaceCandidate,faceCandidateModel} from '../js/blocks/face-candidate.js';
import {memberStock,planMemberStock} from '../js/blocks/member-stock.js';
import {planMemberDimension} from '../js/blocks/member-dimensions.js';

// B2: the default is now auto joint count; this file keeps testing the original one-set-per-edge box.
const BASE={...BOX_DEFAULTS,jointsPerEdge:1};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const worldBounds=(candidate,role)=>{
 const id=candidate.work.comps.find(c=>c.boxPanel?.role===role).id,part=candidate.model.materialParts.find(p=>p.partId===id);
 const pts=part.geometry.outlines.flat().flatMap(p=>[0,part.geometry.thicknessMm].map(z=>applyMatrix4(part.pose.matrix,{...p,z})));
 return Object.fromEntries(['x','y','z'].map(k=>[k,[Math.min(...pts.map(p=>p[k])),Math.max(...pts.map(p=>p[k]))]]));
};
for(const settings of [BASE,{...BASE,lengthMm:60,widthMm:60,heightMm:25},{...BASE,lengthMm:400,widthMm:400,heightMm:120},{...BASE,thicknessMm:3.5,screwLengthMm:14},{...BASE,thicknessMm:2.5}]){
 const result=await checkedBox(settings);assert.equal(result.saveable,true,result.reason);
 assert.equal(result.work.comps.length,5);assert.equal(result.work.modules.filter(m=>m.mount).length,4);
 assert.deepEqual(result.validation.material.findings,[]);assert.equal(result.model.pins.length,0);
 const bounds=Object.fromEntries(BOX_ROLES.map(r=>[r,worldBounds(result,r)]));
 near(bounds.right.x[0]-bounds.left.x[1],settings.lengthMm);near(bounds.front.y[0]-bounds.back.y[1],settings.widthMm);
 near(bounds.front.z[1]-bounds.base.z[1],settings.heightMm);
 near(bounds.base.x[1]-bounds.base.x[0],settings.lengthMm+2*settings.thicknessMm+2*settings.flangeMm);
 const disk=storedProject({...result.work,kind:'blocks',v:1});assert.equal(disk.comps,undefined);assert.ok(disk.requires.includes('box-panel-v1'));
 const reopened=normalizeSnapshot(decodeShareString(encodeSnapshot(disk)));assert.ok(reopened);
 for(const c of reopened.comps){assert.deepEqual(c.boxPanel,result.work.comps.find(x=>x.id===c.id).boxPanel);near(memberStock(c).thicknessMm,settings.thicknessMm);}
 assert.ok(tabNutPlans(reopened.comps,reopened.modules,reopened.params).every(p=>p.ok));
}
for(const patch of [{lengthMm:0},{widthMm:NaN},{heightMm:24},{thicknessMm:4},{tabPitchMm:180},{tabWidthMm:20,tabPitchMm:12},{screwLengthMm:8}])assert.notEqual((await checkedBox({...BASE,...patch})).saveable,true,JSON.stringify(patch));
assert.equal(normalizeBoxPanel({v:2,role:'base',rootPart:'x',settings:BASE}),null);
const raw=await checkedBox(BASE),w=raw.work,data=faceFileExportData(w),files=[];
for(const fn of [exportLinksAsSvg,exportLinksAsDxf])fn(data.comps,data.points,data.params,data.settings,data.mounts,data.extras,(text,name)=>files.push({text,name}));
assert.equal(files.length,10);const baseSvg=files.find(f=>f.name==='BoxBase.svg').text;
assert.equal((baseSvg.match(/data-layer="TAB_NUT_SLOT"/g)||[]).length,8);
assert.equal((baseSvg.match(/data-layer="TAB_NUT_BOLT"/g)||[]).length,4);
assert.ok(!baseSvg.includes('data-layer="HOLE"')); // Construction anchors must not drill the box.
const slots=[...baseSvg.matchAll(/<path d="([^"]+)" data-layer="TAB_NUT_SLOT"/g)].map(m=>[...m[1].matchAll(/-?\d+(?:\.\d+)?/g)].map(v=>Number(v[0])));
for(const values of slots){const xs=values.filter((_,i)=>i%2===0),ys=values.filter((_,i)=>i%2);const sizes=[Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)].sort((a,b)=>a-b);near(sizes[0],3.15);near(sizes[1],8.15);}
const layout=boxLayout(w);assert.equal(layout.geometry.outlines.length,5);assert.equal(layout.geometry.cutouts.length,8);assert.equal(layout.geometry.holes.length,4);
assert.match(boxFile(w,'svg'),/NO KERF COMPENSATION/);assert.match(boxFile(w,'dxf'),/\$INSUNITS\n70\n4/);
const bom=hardwareList(buildPlan({...w,extras:data.extras}));assert.equal(bom.find(x=>x.spec==='M3×12').qty,4);assert.equal(bom.find(x=>x.spec.includes('螺母')).qty,4);assert.equal(bom.find(x=>x.spec.includes('墊片')).qty,4);

const source={kind:'blocks',v:1,counter:12,params:{existing:77,theta:23},comps:[{id:'Other',type:'anchor',p1:{id:'O',type:'fixed',x:0,y:0}}],modules:[],assemblyMembers:['#root']},before=structuredClone(source);
assert.equal((await planBoxChange({...source,modules:undefined},BASE)).ok,true);
const first=await planBoxChange(source,BASE);assert.equal(first.ok,true,first.reason);assert.deepEqual(source,before);assert.deepEqual(first.work.comps[0],source.comps[0]);assert.equal(first.work.params.theta,23);assert.equal(first.work.assemblyMembers.length,6);
const second=await planBoxChange(first.work,{...BASE,lengthMm:160});assert.equal(second.ok,true,second.reason);assert.equal(boxesInWork(second.work).length,2);
assert.equal(new Set(second.work.comps.map(c=>c.id)).size,11);assert.equal(new Set(second.work.modules.map(m=>m.id)).size,10);
const changed=await planBoxChange(second.work,{...BASE,lengthMm:150,widthMm:90},{rootPart:first.rootPart});assert.equal(changed.ok,true,changed.reason);
assert.deepEqual(changed.work.comps.filter(c=>c.boxPanel?.rootPart===second.rootPart),second.work.comps.filter(c=>c.boxPanel?.rootPart===second.rootPart));
assert.deepEqual(changed.work.comps.filter(c=>c.boxPanel?.rootPart===first.rootPart).map(c=>c.id).sort(),first.work.comps.filter(c=>c.boxPanel).map(c=>c.id).sort());
assert.equal(changed.work.params.existing,77);assert.equal(changed.work.params.theta,23);
assert.deepEqual(changed.work.modules.map(m=>m.id),second.work.modules.map(m=>m.id));
assert.deepEqual(changed.work.comps.map(c=>c.id),second.work.comps.map(c=>c.id));
const template=compositeToTemplate(changed.work.comps,changed.work.modules,changed.work.params,first.rootModule);assert.equal(normalizeTemplate(storedProject(template)).ok,true);
const copy=instantiateComposite(template,{counter:90,place:{x:700,y:200}});const copyBase=copy.comps.find(c=>c.boxPanel.role==='base');assert.ok(copy.comps.every(c=>c.boxPanel.rootPart===copyBase.id));assert.ok(tabNutPlans(copy.comps,copy.modules,copy.params).every(p=>p.ok));
const future=storedProject({...raw.work,kind:'blocks'});future.requires.push('box-panel-v2');assert.equal(readStoredProject(future),null);
assert.equal(planMemberDimension(copyBase,copy.params,'g',80).ok,false);assert.equal(planMemberStock(copyBase,'widthMm',80).ok,false);

// Whole box follows a moving host using existing face mounts; resizing a mounted box fails explicitly.
const motor={type:'bar',id:'MotorArm',moduleId:'Motor',fixedLen:true,isInput:true,physicalMotor:'1',motorType:'n20',p1:{id:'MA',type:'motor',physicalMotor:'1',x:0,y:0},p2:{id:'MB',type:'floating',x:80,y:0},lenParam:'ML',stock:{widthMm:18,thicknessMm:3,material:'unspecified'}};
const mountedSource={...first.work,comps:[motor,...first.work.comps.filter(c=>c.boxPanel)],modules:[{id:'Motor',name:'驅動桿',base:'MA',outputs:[{id:'arm',at:'MB',body:{kind:'bar',id:'MotorArm'}}],mount:null},...first.work.modules],params:{...first.work.params,ML:80}};
const joined=buildFaceCandidate(mountedSource,{childId:first.rootModule,hostEndpoint:{moduleId:'Motor',outputId:'arm',partId:'MotorArm'},childEndpoint:{partId:first.rootPart},selection:{hostFace:'top',childFace:'bottom',alignU:0,alignV:0,offsetU:0,offsetV:0,gap:6,quarterTurns:0}});
assert.equal(joined.ok,true,joined.reason);
let referencePoints;
for(const theta of [0,45,90]){
 const scene=faceCandidateModel(joined,{theta});assert.equal(scene.solveValidity.valid,true);
 const parts=scene.model.materialParts.filter(p=>joined.work.comps.some(c=>c.id===p.partId&&c.boxPanel));assert.equal(parts.length,5);
 const points=parts.map(p=>applyMatrix4(p.pose.matrix,{x:0,y:0,z:0}));
 if(!referencePoints)referencePoints=points;
 else{
  assert.ok(points.some((p,i)=>Math.hypot(p.x-referencePoints[i].x,p.y-referencePoints[i].y,p.z-referencePoints[i].z)>1));
  for(let i=1;i<5;i++)near(Math.hypot(points[i].x-points[0].x,points[i].y-points[0].y,points[i].z-points[0].z),Math.hypot(referencePoints[i].x-referencePoints[0].x,referencePoints[i].y-referencePoints[0].y,referencePoints[i].z-referencePoints[0].z));
 }
}
assert.equal((await planBoxChange(joined.work,BASE,{rootPart:first.rootPart})).ok,false);
console.log('PASS box maker: five panels, inside dimensions, voids, four joints, bounds, SVG/DXF/BOM, isolation, resize, shares, composite rename, mounted group');
