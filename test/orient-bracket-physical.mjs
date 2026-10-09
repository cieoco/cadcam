import assert from 'node:assert/strict';
import {S,B,fresh,motor,solveAt,ex,ed} from './_bench-setup.mjs';
import * as OJ from '../js/blocks/orthogonal-joint.js';
import {buildPlan,hardwareList} from '../js/blocks/build-plan.js';
import {auditPhysical} from './_bracket-audit.mjs';
import {faceCandidateModel} from '../js/blocks/face-candidate.js';
import {FABRICATION_DEFAULTS} from '../js/blocks/fabrication-profile.js';
import {toSnapshot,normalizeSnapshot} from '../js/blocks/schema.js';
import {writeFileSync,mkdirSync} from 'node:fs';
import {usesFaceExport,faceFileExportData,validateFaceExport,faceBuildPackHtml} from '../js/blocks/face-export.js';
import * as E from '../js/blocks/exporters.js';
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
// Independent column-major point/vector transforms: never use box contact as
// the expected stock plane, or production validation as the expected result.
const at=(m,p)=>({x:m[0]*p.x+m[4]*p.y+m[8]*p.z+m[12],y:m[1]*p.x+m[5]*p.y+m[9]*p.z+m[13],z:m[2]*p.x+m[6]*p.y+m[10]*p.z+m[14]});
const normal=m=>({x:m[8],y:m[9],z:m[10]}),negative=v=>({x:-v.x,y:-v.y,z:-v.z});
const [host,child]=fresh('fourbar-lift','gear-gripper'),params=structuredClone(S.topo.params);
const bar=S.comps.find(c=>c.moduleId===host.id&&c.id.startsWith('ToolBrace'));
const st=B.connect(S.comps,S.modules,child.id,{module:host.id,port:`edge:${bar.id}:R`},params,motor,{joint:'bracket-m3'});
assert.ok(st.ok);
const comps=st.comps.map(c=>c.id===bar.id?{...c,stock:{...c.stock,thicknessMm:6}}:c),opts={stockMm:3};
const layout=OJ.adapterLayout(comps,st.modules,child.id,params,opts);
assert.equal(layout.physical?.length,2,'orient layout must own shared physical instances');
const plan=buildPlan({comps,modules:st.modules,params,exportSettings:ex,cnc:{stockThicknessMm:3}});
const screws=OJ.bracketScrews(comps,st.modules,child.id,solveAt(comps,st.modules,params).points,params,{...opts,plan});
assert.deepEqual(screws.map(s=>s.lengthMm).sort(),[6,6,8,8],'each plate selects its own shared screw length');
assert.ok(hardwareList(plan).some(r=>r.spec==='M3×8'&&/角碼/.test(r.note)));
console.log('orient physical source and mixed stock screw lengths passed');
const custom={...structuredClone(FABRICATION_DEFAULTS.joint),bracket:{longLegMm:14,shortLegMm:10,widthMm:7,thicknessMm:1.5,holeEndMm:3.5}};
const variants=[st,B.benchAdjust(st.comps,st.modules,child.id,'side',params),B.benchAdjust(st.comps,st.modules,child.id,'stand',params)];
variants.push(B.benchAdjust(variants[2].comps,variants[2].modules,child.id,'face',params));
assert.ok(variants.every(v=>v.ok),variants.map(v=>v.reason).join('; '));
assert.deepEqual(variants.map(v=>v.modules.find(m=>m.id===child.id).mount.orient.edge),['host','host','child','child']);
assert.deepEqual(variants.slice(2).map(v=>v.modules.find(m=>m.id===child.id).mount.orient.face),[1,-1]);
function measureScene(scene,plan,childId,hostPartId) {
 const adapter=scene.catalog.extras.adapters.find(a=>a.moduleId===childId),model=scene.model;
 const physicalParts=model.materialParts.filter(p=>p.connectionId===adapter.connectionId),plateParts=model.materialParts.filter(p=>[hostPartId,`${childId}-frame`].includes(p.partId));
 assert.equal(physicalParts.length,12,'all six hardware pieces have shared geometry/pose');assert.equal(plateParts.length,2);
 const plates={},holes=[];
 for(const p of plateParts){
  const n=normal(p.pose.matrix),own=p.partId===`${childId}-frame`,sign=own?-1:(dot(n,model.brackets.find(b=>b.moduleId===childId&&b.id.includes('wing:host')).hole.axis)>0?1:-1),out=sign<0?negative(n):n;
  for(const h of p.geometry.holes.filter(h=>h.connectionId===adapter.connectionId)){
   const contact=at(p.pose.matrix,{x:h.x,y:h.y,z:sign>0?p.geometry.thicknessMm:0});
   plates[h.holePairId]={normal:out,contact,thicknessMm:p.geometry.thicknessMm};holes.push({holePairId:h.holePairId,center:contact,axis:out,diameterMm:h.r*2});
  }
 }
 const hardware=hardwareList({...plan,joints:plan.joints.filter(j=>j.connectionId===adapter.connectionId),parts:[],motors:[]});
 for(const h of hardware)assert.ok(hardwareList(plan).some(r=>r.spec===h.spec&&r.qty>=h.qty));
 return {boxes:model.brackets.filter(b=>b.moduleId===childId),screws:model.screws.filter(s=>s.moduleId===childId),plates,holes,hardware,count:2,spec:adapter.spec,machiningTolerance:.005};
}
 let measurements,lastWork;
for(const T of [3,4,6])for(const joint of [FABRICATION_DEFAULTS.joint,custom])for(const variant of variants)for(const theta of [0,20,40]){
 const work={comps:structuredClone(variant.comps),modules:structuredClone(variant.modules),topo:{params:structuredClone(params)},fabrication:{...structuredClone(FABRICATION_DEFAULTS),joint:structuredClone(joint),cnc:{...FABRICATION_DEFAULTS.cnc,stockThicknessMm:T}},stockMm:T,joint,exportSettings:ex};
 const hostComp=work.comps.find(c=>c.id===bar.id);hostComp.stock={...hostComp.stock,thicknessMm:T,...(variant.modules.find(m=>m.id===child.id).mount.orient.edge==='child'?{widthMm:24}:{})};
 const scene=faceCandidateModel({work},{theta,motorAngles:{'1':theta,'2':0}});assert.ok(scene.solveValidity.valid);
 const plan=buildPlan({comps:work.comps,modules:work.modules,params:work.topo.params,exportSettings:ex,cnc:work.fabrication.cnc,joint});
 measurements=measureScene(scene,plan,child.id,bar.id);
 assert.deepEqual(auditPhysical(measurements),[],`independent stock/holes/BOM T${T} theta${theta} stand${variant.modules.find(m=>m.id===child.id).mount.orient.edge}`);
 lastWork=work;
}
for(const change of [m=>m.holes.pop(),m=>m.holes[0].axis={x:1,y:0,z:0},m=>m.boxes[0].center.z+=.02,m=>m.hardware.find(h=>/角碼/.test(h.spec)).qty++,m=>m.spec.thicknessMm+=.02]){
 const bad=structuredClone(measurements);change(bad);assert.ok(auditPhysical(bad).length,'independent negative measurement must fail');
}
const invalid={...custom,bracket:{...custom.bracket,holeEndMm:.5}};
const rejected=OJ.adapterLayout(comps,st.modules,child.id,params,{joint:invalid});
assert.equal(rejected.physical.length,0);assert.equal(rejected.hostHoles.length,0);assert.equal(rejected.childHoles.length,0);assert.match(rejected.diagnostics[0].reason,/牙孔/,'invalid requested metal geometry must not emit drilling');
const tilted=structuredClone(st.modules);tilted.find(m=>m.id===child.id).mount.orient.tiltDeg=15;
assert.equal(OJ.adapterLayout(comps,tilted,child.id,params).diagnostics[0].code,'metal_bracket_tilt_unsupported');
// Real recursive orient child on the first mounted frame. Its complete world
// matrix is compared against actual stock/round machining holes, not reparented.
ed.insertBuiltin('gear-gripper');const nested=S.modules.find(m=>![host.id,child.id].includes(m.id));
const nestedComps=[...st.comps,...S.comps.filter(c=>c.moduleId===nested.id)],nestedMods=[...st.modules,nested];
const port=B.autoPorts(nestedComps,nestedMods,child.id,params).find(p=>p.body?.kind==='frame');assert.ok(port);
const connected=B.connect(nestedComps,nestedMods,nested.id,{module:child.id,port:port.id},params,motor,{joint:'bracket-m3'});assert.ok(connected.ok);
const nestedWork={comps:connected.comps,modules:connected.modules,topo:{params:structuredClone(S.topo.params)},fabrication:structuredClone(FABRICATION_DEFAULTS),stockMm:3,joint:FABRICATION_DEFAULTS.joint,exportSettings:ex};
for(const theta of [0,20,40]){
 const scene=faceCandidateModel({work:nestedWork},{theta,motorAngles:{'1':theta,'2':0,'3':0}});assert.ok(scene.solveValidity.valid);
 const plan=buildPlan({comps:nestedWork.comps,modules:nestedWork.modules,params:nestedWork.topo.params,exportSettings:ex,cnc:nestedWork.fabrication.cnc,joint:nestedWork.joint});
 assert.equal(scene.model.orthogonal.length,2);assert.deepEqual(auditPhysical(measureScene(scene,plan,nested.id,`${child.id}-frame`)),[],`nested world measurement ${theta}`);
}
const differing=structuredClone(nestedWork);
const point=differing.comps.filter(c=>c.moduleId===child.id).flatMap(c=>[c.p1,c.p2,c.p3]).find(p=>p&&['fixed','motor'].includes(p.type));point.frameStock={thicknessMm:6};
for(const theta of [0,20,40]){
 const scene=faceCandidateModel({work:differing},{theta,motorAngles:{'1':theta,'2':0,'3':0}}),plan=buildPlan({comps:differing.comps,modules:differing.modules,params:differing.topo.params,exportSettings:ex,cnc:differing.fabrication.cnc,joint:differing.joint});
 assert.equal(scene.catalog.parts[`${child.id}-frame`].thicknessMm,6);
 for(const [id,hostId] of [[child.id,bar.id],[nested.id,`${child.id}-frame`]])assert.deepEqual(auditPhysical(measureScene(scene,plan,id,hostId)),[],`explicit frameStock vs global, nested ${theta}`);
}
const blobs=new Map(),downloads=[];globalThis.URL.createObjectURL=blob=>{const id=`blob:${blobs.size}`;blobs.set(id,blob);return id;};globalThis.URL.revokeObjectURL=()=>{};
globalThis.document={body:{appendChild(){}},createElement:()=>({click(){downloads.push({name:this.download,blob:blobs.get(this.href)});},remove(){}})};
function traceCircles(text,format){
 if(format==='svg')return [...text.matchAll(/<circle\b([^>]*)\/>/g)].map(([,s])=>{const a=Object.fromEntries([...s.matchAll(/([\w-]+)="([^"]*)"/g)].map(([,k,v])=>[k,v]));return {id:a['data-hole-id'],pair:a['data-hole-pair-id'],x:Number(a.cx),y:Number(a.cy),r:Number(a.r)};});
 const rows=text.trimEnd().split(/\r?\n/),out=[];let circle;for(let i=0;i<rows.length;i+=2){const code=Number(rows[i]),value=rows[i+1];if(code===0){if(circle)out.push(circle);circle=value==='CIRCLE'?{}:null;}else if(circle){if(code===10)circle.x=Number(value);if(code===20)circle.y=Number(value);if(code===40)circle.r=Number(value);if(code===999&&value.startsWith('HOLE_TRACE ')){const h=JSON.parse(value.slice(11));circle.id=h.id;circle.pair=h.holePairId;}}}return out;
}
for(const work of [lastWork,nestedWork,differing])for(const theta of [0,20,40]){
 assert.ok(usesFaceExport(work));const pose={theta,motorAngles:{'1':theta,'2':0,'3':0}},data=faceFileExportData(work,pose),start=downloads.length;
 for(const adapter of data.extras.adapters)for(const b of adapter.physical || [])for(const w of b.wings){const h=data.catalog.parts[w.partId].holes.find(h=>h.holePairId===w.plateHole.holePairId);assert.ok(Math.abs(w.plateHole.local.x-h.x)<.005&&Math.abs(w.plateHole.local.y-h.y)<.005,'physical trace carries plate-local drill coordinates');}
 for(const [links,frame] of [[E.exportLinksAsSvg,E.exportFrameAsSvg],[E.exportLinksAsDxf,E.exportFrameAsDxf]]){links(data.comps,data.points,data.params,data.settings,data.mounts,data.extras);for(const f of data.frames)frame(f.nodes,data.settings,f.mounts,f.name);}
 const files=await Promise.all(downloads.slice(start).map(async f=>({...f,text:await f.blob.text()})));
 for(const format of ['svg','dxf']){
  const holes=files.filter(f=>f.name.endsWith(`.${format}`)).flatMap(f=>traceCircles(f.text,format));
  for(const g of Object.values(data.catalog.parts))for(const h of g.holes.filter(h=>h.connectionId&&h.layer!=='M3_THREAD')){
   const found=holes.filter(p=>p.id===h.id);assert.equal(found.length,1,`${format} actual public circle ${h.id}`);assert.equal(found[0].pair,h.holePairId);
   assert.ok(Math.abs(found[0].x-h.x)<.005&&Math.abs(found[0].y-h.y)<.005&&Math.abs(found[0].r-h.r)<.005);
  }
 }
 const result=await validateFaceExport(work,pose);assert.ok(result.ok,result.reason);const html=faceBuildPackHtml(result),trace=JSON.parse(html.match(/id="manufacturingTrace">([\s\S]*?)<\/script>/)[1]);assert.equal(trace.physical.flatMap(j=>j.instances).length,work===lastWork?2:4);
 assert.equal(trace.validation.poseRevision,result.poseRevision);assert.ok(trace.validation.coverage);
}
const badWork=structuredClone(lastWork);badWork.joint=invalid;badWork.fabrication.joint=invalid;
assert.throws(()=>faceFileExportData(badWork),/牙孔|暫停/);assert.equal((await validateFaceExport(badWork,{})).ok,false);
const badTilt=structuredClone(lastWork);badTilt.modules.find(m=>m.id===child.id).mount.orient.tiltDeg=15;assert.throws(()=>faceFileExportData(badTilt),/直角|暫停/);assert.equal((await validateFaceExport(badTilt,{})).ok,false);
assert.ok(usesFaceExport({...lastWork,modules:[...lastWork.modules,{mount:{face:{}}},{mount:{orient:{joint:{kind:'printed'}}}}]}),'existing face+printed guarded export must not fall back to legacy');
mkdirSync('output/framework-stabilization/w4b-orient',{recursive:true});
for(const [name,variant,joint] of [['default',st,FABRICATION_DEFAULTS.joint],['custom',variants[3],custom]]){
 const fixtureComps=structuredClone(variant.comps);fixtureComps.find(c=>c.id===bar.id).stock={...bar.stock,thicknessMm:name==='custom'?6:3,...(name==='custom'?{widthMm:24}:{})};
 if(name==='custom')fixtureComps.filter(c=>c.moduleId===child.id).flatMap(c=>[c.p1,c.p2,c.p3]).find(p=>p&&['fixed','motor'].includes(p.type)).frameStock={thicknessMm:4};
 const saved=toSnapshot(fixtureComps,{params},0,{modules:variant.modules,fabrication:{...structuredClone(FABRICATION_DEFAULTS),joint}});assert.ok(normalizeSnapshot(saved));writeFileSync(`output/framework-stabilization/w4b-orient/ui-${name}.blocks.json`,JSON.stringify(saved,null,2));
}
const badFixture=toSnapshot(st.comps,{params},0,{modules:tilted,fabrication:structuredClone(FABRICATION_DEFAULTS)});assert.equal(normalizeSnapshot(badFixture).modules.find(m=>m.id===child.id).mount.orient.tiltDeg,15);writeFileSync('output/framework-stabilization/w4b-orient/ui-invalid-metal-tilt.blocks.json',JSON.stringify(badFixture,null,2));
console.log('72 production scene measurements; nested/different frameStock 0/20/40, public SVG/DXF + HTML trace and invalid/negative measurements passed');
