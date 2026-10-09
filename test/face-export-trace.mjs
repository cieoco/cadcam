import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {f1AssemblyFixture,f1NestedFixture} from './fixtures/f1-assembly-fixture.mjs';
import * as E from '../js/blocks/exporters.js';
import {faceFileExportData,validateFaceExport,faceBuildPackHtml,createFaceExportCoordinator} from '../js/blocks/face-export.js';
import {freezeData} from '../js/blocks/face-candidate.js';
import {buildPackHtml,hardwareList} from '../js/blocks/build-plan.js';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
import {fusionCandidates} from '../js/blocks/part-fusion.js';
import {motorMountPatternRotDegForCenter as planMotorPatternRotDeg} from '../js/blocks/motor-mounts.js';
// Execute the actual app wrapper used by drawMotorMountHoles.rotationForCenter.
// A pure-adapter-only test cannot detect a removed consumer symbol.
const appSource=readFileSync('js/blocks/app.js','utf8'),wrapper=appSource.match(/function motorMountPatternRotDegForCenter\(id,pts,mount=null\)\{([\s\S]*?)\n\}/);
assert.ok(wrapper,'formal 2D rotation consumer retains its delegate');assert.match(appSource,/rotationForCenter:[^\n]*motorMountPatternRotDegForCenter/);
const rotation=new Function('planMotorPatternRotDeg','S','computeMotorRotDeg','id','pts','mount',wrapper[1]);
nearRotation();
function nearRotation(){const comps=[{type:'bar',isInput:true,motorCarrier:'Carrier',p1:{id:'A',physicalMotor:'1'},p2:{id:'C'}},{type:'bar',id:'Carrier',p1:{id:'A'},p2:{id:'B'}}],pts={A:{x:0,y:0},B:{x:0,y:10}};assert.equal(rotation(planMotorPatternRotDeg,{comps},()=>25,'A',pts,null),-270);assert.equal(rotation(planMotorPatternRotDeg,{comps:[]},()=>25,'A',pts,{rotDeg:40}),-50);}
const blobs=new Map(),downloads=[];
globalThis.URL.createObjectURL=blob=>{const key=`blob:${blobs.size}`;blobs.set(key,blob);return key;};
globalThis.URL.revokeObjectURL=()=>{};
globalThis.document={body:{appendChild(){}},createElement:()=>({click(){downloads.push({name:this.download,blob:blobs.get(this.href)});},remove(){}})};
const decode=s=>s.replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const attrs=s=>Object.fromEntries([...s.matchAll(/([\w-]+)="([^"]*)"/g)].map(([,k,v])=>[k,decode(v)]));
const svgCircles=text=>[...text.matchAll(/<circle\b([^>]*)\/>/g)].map(([,s])=>{const a=attrs(s);return {...a,x:Number(a.cx),y:Number(a.cy),r:Number(a.r),id:a['data-hole-id'],partId:a['data-part-id'],holePairId:a['data-hole-pair-id']};});
function dxfCircles(text){
 const lines=text.trimEnd().split(/\r?\n/),entities=[];let entity=null;assert.equal(lines.length%2,0,'DXF group/value framing survives external ID newlines');
 for(let i=0;i<lines.length;i+=2){const [code,value]=[Number(lines[i]),lines[i+1]];if(code===0){if(entity)entities.push(entity);entity=value==='CIRCLE'?{}:null;}else if(entity){if(code===10)entity.x=Number(value);if(code===20)entity.y=Number(value);if(code===40)entity.r=Number(value);if(code===999&&value.startsWith('HOLE_TRACE '))Object.assign(entity,JSON.parse(value.slice(11)));}}
 if(entity)entities.push(entity);return entities;
}
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b} (tolerance ${t})`);
// Independent inverse: transpose the rigid rotation, subtract the translation.
const inverse=(m,p)=>{const x=p.x-m[12],y=p.y-m[13],z=p.z-m[14];return {x:m[0]*x+m[1]*y+m[2]*z,y:m[4]*x+m[5]*y+m[6]*z,z:m[8]*x+m[9]*y+m[10]*z};};
const localHole=(h,g,catalog)=>{if(g.kind!=='triangle')return h;const [a,b]=g.binding.pointIds.map(id=>catalog.homePoints[id]),angle=Math.atan2(b.y-a.y,b.x-a.x),c=Math.cos(angle),s=Math.sin(angle);return {...h,x:(h.x-a.x)*c+(h.y-a.y)*s,y:-(h.x-a.x)*s+(h.y-a.y)*c};};
async function actualFiles(source,pose){
 const data=faceFileExportData(source,pose),start=downloads.length;
 for(const [links,frame] of [[E.exportLinksAsSvg,E.exportFrameAsSvg],[E.exportLinksAsDxf,E.exportFrameAsDxf]]){links(data.comps,data.points,data.params,data.settings,data.mounts,data.extras);for(const f of data.frames)frame(f.nodes,data.settings,f.mounts,f.name);}
 return {data,files:await Promise.all(downloads.slice(start).map(async d=>({...d,text:await d.blob.text()})))};
}
function checkFiles(files,catalog,model){
 const parsed=files.flatMap(f=>(f.name.endsWith('.svg')?svgCircles(f.text):dxfCircles(f.text)).map(h=>({...h,format:f.name.endsWith('.svg')?'svg':'dxf'})));
 for(const g of Object.values(catalog.parts).filter(g=>['frame','mounted-frame','bar','triangle','gear','fusion'].includes(g.kind)))for(const h of g.holes){
  if(h.layer==='TT_SHAFT_FLAT')continue; // Intentional shaft path, not a circle.
  for(const format of ['svg','dxf']){const matches=parsed.filter(q=>q.id===h.id&&q.format===format);assert.equal(matches.length,1,`${format}: ${h.id} must appear once in actual downloaded circles`);const q=localHole(matches[0],g,catalog);assert.equal(q.partId,g.id);near(q.x,h.x,.005);near(q.y,h.y,.005);near(q.r,h.r,.005);assert.equal(q.holePairId,h.holePairId);if(format==='dxf')assert.deepEqual(q.axis,{x:0,y:0,z:1});}
 }
 // Posed box axis/center, not production.ok, determines each plate drill.
 for(const box of model.brackets){
  const pair=box.holePairId,plate=model.materialParts.find(p=>p.geometry.holes.some(h=>h.holePairId===pair)),hole=plate.geometry.holes.find(h=>h.holePairId===pair);
  const measured=inverse(plate.pose.matrix,box.hole.center),n=box.hole.axis,m=plate.pose.matrix;
  // Inspectors preserve their existing three-decimal machining coordinates.
  near(measured.x,hole.x,.005);near(measured.y,hole.y,.005);near(Math.abs(n.x*m[8]+n.y*m[9]+n.z*m[10]),1);near(box.hole.diameterMm,3);near(hole.r*2,3.2);
  for(const format of ['svg','dxf']){const q=localHole(parsed.find(h=>h.holePairId===pair&&h.format===format),plate.geometry,catalog);near(q.x,measured.x,.005);near(q.y,measured.y,.005);}
  const screw=model.screws.find(s=>s.holePairId===pair),v={x:screw.tip.x-screw.head.x,y:screw.tip.y-screw.head.y,z:screw.tip.z-screw.head.z};near(Math.hypot(v.x,v.y,v.z),screw.lengthMm);near(Math.abs((v.x*n.x+v.y*n.y+v.z*n.z)/screw.lengthMm),1);assert.equal(screw.spec,`M3×${screw.lengthMm}`);
 }
 assert.ok(parsed.some(h=>h.layer==='MG995_HORN_SCREW'||h['data-purpose']==='MG995_HORN_SCREW'));
}
function checkPack(result){
 const html=faceBuildPackHtml(result),json=JSON.parse(html.match(/id="manufacturingTrace">([\s\S]*?)<\/script>/)[1]);
 for(const k of ['geometryKey','poseRevision','sourceRevision'])assert.equal(json.validation[k],k==='geometryKey'?result.model.geometryKey:result[k]);
 assert.match(html,/id="materialValidation" data-status="fail"/);assert.match(html,/僅目前單一有效求解姿態/);assert.match(html,/未檢查項目/);
 const visible=html.replace(/<script[\s\S]*?<\/script>/g,'');assert.ok(!visible.includes('（undefined）'),'CNC uses the semantic hole purpose if layer is absent');assert.ok(!visible.includes(result.sourceRevision));assert.ok(!visible.includes(result.model.geometryKey),'large revisions stay machine-readable only');
 const rows=[...html.matchAll(/<tr( data-connection-id[^>]*)>/g)].map(([,a])=>attrs(a)),instances=result.plan.joints.flatMap(j=>j.physical || []);assert.equal(rows.length,6);assert.equal(instances.length,3);assert.equal(json.physical[0].instances.length,3);
 for(const b of instances)for(const w of b.wings){const row=rows.find(r=>r['data-wing-id']===w.id);assert.ok(row);for(const [key,v] of Object.entries({'instance-id':b.id,'hole-pair-id':w.plateHole.holePairId,'plate-hole-id':w.plateHole.id,'thread-hole-id':w.box.hole.id,'screw-id':w.screw.id,'screw-spec':w.screw.spec}))assert.equal(row[`data-${key}`],v);near(Number(row['data-plate-diameter-mm']),3.2);near(Number(row['data-thread-diameter-mm']),3);near(Number(row['data-screw-length-mm']),w.screw.lengthMm);}
 const hw=hardwareList(result.plan,{modules:result.work.modules});assert.equal(hw.find(r=>r.spec===instances[0].wings[0].screw.spec).qty,6);return html;
}
function reopen(f){const norm=normalizeSnapshot(toSnapshot(f.comps,{params:f.params},5,{modules:f.modules,fabrication:f.fabrication,activeMotor:'2',motorAngles:{'1':20,'2':12}}));assert.ok(norm);return {...norm,topo:{params:norm.params},exportSettings:norm.fabrication.export,joint:norm.fabrication.joint,stockMm:norm.fabrication.cnc.stockThicknessMm};}
const custom=f1AssemblyFixture();Object.assign(custom.fabrication.joint.bracket,{longLegMm:14,shortLegMm:10,thicknessMm:1.5});Object.assign(custom.fabrication.mg995Mount,{cableNotchWidthMm:9,cableNotchDepthMm:5,screwSpacingMm:11});custom.params.LIFT_ARM_1+=2;
const sources=[reopen(f1AssemblyFixture()),reopen(custom),reopen(f1NestedFixture())],evidence='output/framework-stabilization/w5a-export';mkdirSync(evidence,{recursive:true});let first;
for(const [i,source] of sources.entries())for(const pose of [{theta:0,motorAngles:{'1':0,'2':0}},{theta:20,motorAngles:{'1':20,'2':0}},{theta:40,motorAngles:{'1':40,'2':0}},{theta:12,motorAngles:{'1':20,'2':12}}]){
 const frozen=freezeData(structuredClone(source)),before=JSON.stringify(frozen),result=await validateFaceExport(frozen,pose);assert.ok(result.ok,result.reason);assert.equal(result.validation.material.findings.length,pose.theta===40?3:2,'original F1 collisions remain');
 const {files,data}=await actualFiles(frozen,pose);checkFiles(files,data.catalog,result.model);const html=checkPack(result);assert.equal(JSON.stringify(frozen),before);
 assert.equal(result.plan.motors.length,2);assert.deepEqual(result.plan.motors.map(m=>m.plate),[i===2?'Mod1-frame':'frame','Mod3-frame']);
 for(const frame of data.frames){const geometry=E.inspectFrameExport(frame.nodes,data.settings,frame.mounts),part=data.catalog.parts[frame.name];assert.equal(geometry.cutouts.filter(c=>c.layer==='MG995_SLOT').length,frame.mounts.filter(m=>m.kind==='mg995').length);assert.equal(geometry.holes.length,part.holes.length);assert.deepEqual(geometry.cutouts.map(c=>c.points),part.cutouts.map(c=>c.points),'custom machining slot equals actual scene material');}
 if(pose.theta===0&&i<2){for(const f of files)writeFileSync(`${evidence}/${i?'custom':'default'}-${f.name}`,f.text);writeFileSync(`${evidence}/${i?'custom':'default'}-pack.html`,html);}if(i===0&&pose.theta===0)first=result;
}
console.log('actual SVG/DXF circles, inverse-world paired axes, machining slots, per-instance HTML/BOM: default/custom/resize/reopen/nested 0/20/40/M2 passed');
const tt=structuredClone(sources[0]);tt.comps.find(c=>c.type==='bar'&&c.isInput).motorType='tt';Object.assign(tt.fabrication.ttMount,{shaftDiameterMm:6.4,screwSpacingMm:18,locatorDiameterMm:4.4});
const ttResult=await validateFaceExport(tt,{theta:20,motorAngles:{'1':20,'2':0}});assert.ok(ttResult.ok,ttResult.reason);const ttFiles=await actualFiles(tt,{theta:20,motorAngles:{'1':20,'2':0}});checkFiles(ttFiles.files,ttFiles.data.catalog,ttResult.model);assert.equal(ttResult.plan.motors[0].type,'tt');near(ttFiles.data.catalog.parts.frame.holes.find(h=>h.layer==='TT_SHAFT').r,3.2);
const fused=structuredClone(sources[0]);for(const plate of fused.comps.filter(c=>c.shape==='jaw')){const candidates=fusionCandidates(fused.comps,plate);assert.equal(candidates.length,1);plate.fusedWith=candidates[0].id;}
const fusedResult=await validateFaceExport(fused,{theta:20,motorAngles:{'1':20,'2':0}});assert.ok(fusedResult.ok,fusedResult.reason);const fusedFiles=await actualFiles(fused,{theta:20,motorAngles:{'1':20,'2':0}});checkFiles(fusedFiles.files,fusedFiles.data.catalog,fusedResult.model);assert.equal(Object.values(fusedFiles.data.catalog.parts).filter(p=>p.kind==='fusion').length,2);
const changed=structuredClone(sources[0]);changed.fabrication.mg995Mount.cableNotchWidthMm=10;const next=await validateFaceExport(changed,{theta:20,motorAngles:{'1':20,'2':0}});assert.ok(next.ok);assert.notEqual(next.model.geometryKey,first.model.geometryKey);assert.notEqual(next.sourceRevision,first.sourceRevision);
const staleHtml=buildPackHtml(next.plan,{modules:next.work.modules,validation:first.validation,validationRevision:{sourceRevision:next.sourceRevision,geometryKey:next.model.geometryKey,poseRevision:next.poseRevision}});assert.match(staleHtml,/report_revision_mismatch/);assert.match(staleHtml,/data-status="not_checked"/);
assert.match(buildPackHtml(next.plan,{modules:next.work.modules}),/report_missing/);
const planeOnly={...next.validation,status:'fail',material:{...next.validation.material,findings:[]},checks:[{code:'in_plane_interference',findings:[{message:'獨立同平面負例'}]}]};assert.match(buildPackHtml(next.plan,{modules:next.work.modules,validation:planeOnly,validationRevision:planeOnly}),/跨面材料 0 處、同平面 1 處[\s\S]*獨立同平面負例/);
const invalid=structuredClone(sources[0]);invalid.modules.at(-1).mount.face.selection.gap=1;const bad=await validateFaceExport(invalid,{});assert.equal(bad.ok,false);assert.match(bad.reason,/角碼孔暫停輸出/);assert.throws(()=>faceFileExportData(invalid),/角碼孔暫停輸出/);
const invalidExtras={diagnostics:[{code:'face_fastener_invalid',reason:'invalid requested hole'}]};for(const fn of [E.exportLinksAsSvg,E.exportLinksAsDxf])assert.throws(()=>fn([],{}, {},{},[],invalidExtras),/角碼孔暫停輸出/);assert.throws(()=>buildPackHtml({diagnostics:invalidExtras.diagnostics}),/角碼孔暫停輸出/);
const id='trace"<&\n999\nCIRCLE',pair='pair\r\n"<&',nodes=[{id,x:0,y:0},{id:'B',x:30,y:0}],start=downloads.length;E.exportFrameAsSvg(nodes,{},[],'frame');E.exportFrameAsDxf(nodes,{},[],'frame');
const escaped=await Promise.all(downloads.slice(start).map(d=>d.blob.text()));assert.equal(svgCircles(escaped[0])[0].id,id);assert.equal(dxfCircles(escaped[1])[0].id,id);assert.equal(svgCircles(escaped[0]).length,2);assert.equal(dxfCircles(escaped[1]).length,2);
const extras={linkHoles:{Safe:[{u:10,v:0,diameterMm:3.2,id,holePairId:pair}]}},bar={type:'bar',id:'Safe',p1:{id:'A',x:0,y:0},p2:{id:'B',x:30,y:0}},last=downloads.length;E.exportLinksAsSvg([bar],{}, {},{},[],extras);E.exportLinksAsDxf([bar],{}, {},{},[],extras);
for(const d of downloads.slice(last)){const text=await d.blob.text(),p=d.name.endsWith('svg')?svgCircles(text):dxfCircles(text);assert.equal(p.find(h=>h.id===id)?.holePairId,pair);}
const injection=structuredClone(first.plan),wing=injection.joints.find(j=>j.physical).physical[0].wings[0];wing.id=id;wing.plateHole.holePairId=pair;wing.screw.id='</script><img src=x onerror="bad">';const escapedHtml=buildPackHtml(injection,{modules:first.work.modules});const row=attrs(escapedHtml.match(/<tr( data-connection-id[^>]*)>/)[1]);assert.equal(row['data-wing-id'],id);assert.equal(row['data-hole-pair-id'],pair);assert.equal((escapedHtml.match(/<script\b/g) || []).length,1);assert.ok(!escapedHtml.includes('<img src=x'));
console.log('fresh/stale/missing report, in-plane findings, invalid requested geometry and escaped actual XML/DXF trace passed');
let source=structuredClone(sources[0]),pose={theta:20,motorAngles:{'1':20,'2':0}},playing=true,saved=0,notices=0,release;
const before=JSON.stringify(source),coordinator=createFaceExportCoordinator({readSource:()=>source,readPose:()=>pose,isPlaying:()=>playing,pause:()=>{playing=false;},notify:()=>notices++,download:r=>{checkPack(r);saved++;}});
assert.ok((await coordinator.run()).ok);assert.equal(saved,1);assert.equal(JSON.stringify(source),before,'download/pause never mutates work or autosave input');
for(const mutate of [()=>source.fabrication.export.barWidthMm+=1,()=>pose.theta+=1,()=>playing=true]){
 const race=createFaceExportCoordinator({readSource:()=>source,readPose:()=>pose,isPlaying:()=>playing,pause:()=>{playing=false;},validate:(s,p)=>new Promise(resolve=>{release=async()=>resolve(await validateFaceExport(s,p));}),download:()=>saved++});
 const pending=race.run();assert.equal((await race.run()).ok,false);mutate();await release();assert.equal((await pending).ok,false);assert.equal(race.pending(),false);assert.equal(saved,1);source=structuredClone(sources[0]);pose={theta:20,motorAngles:{'1':20,'2':0}};playing=false;
}
const forged=createFaceExportCoordinator({readSource:()=>source,readPose:()=>pose,pause:()=>{},validate:async()=>first,download:()=>saved++});assert.equal((await forged.run()).ok,false);assert.equal(saved,1);assert.ok(notices);
const staleModel=createFaceExportCoordinator({readSource:()=>source,readPose:()=>pose,pause:()=>{},validate:async(s,p)=>{const r=structuredClone(await validateFaceExport(s,p));r.validation.geometryKey='old geometry';return r;},download:()=>saved++});assert.equal((await staleModel.run()).ok,false);assert.equal(saved,1);
console.log('production coordinator: pause/one-clone validation, duplicate clicks, source/pose/play races and old report rejection passed');
