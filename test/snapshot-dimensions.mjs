import assert from 'node:assert/strict';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
import {installedFrameFixture} from './fixtures/face-host-frame-fixture.mjs';
import {rootFrameFixture} from './fixtures/face-host-frame-fixture.mjs';
import {f1AssemblyFixture} from './fixtures/f1-assembly-fixture.mjs';
import {faceCandidateModel,freezeData} from '../js/blocks/face-candidate.js';
import {faceFileExportData} from '../js/blocks/face-export.js';
import * as E from '../js/blocks/exporters.js';
import * as Store from '../js/blocks/storage.js';
import * as Tools from '../js/blocks/tools.js';
import {S} from '../js/blocks/state.js';
import {planMemberDimension} from '../js/blocks/member-dimensions.js';
import {createModuleEditor} from '../js/blocks/module-editor.js';
import {prepareConnectionWork} from '../js/blocks/connection-work.js';
import {buildMotorMounts} from '../js/blocks/motor-mounts.js';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const original=installedFrameFixture('planar',{stablePlanar:false});
const raw=toSnapshot(original.comps,original.topo,0,{modules:original.modules,fabrication:original.fabrication});
const reopened=normalizeSnapshot(raw);
assert.equal(original.params.LIFT_ARM_1,140);
assert.equal(reopened.params.LIFT_ARM_1,140,'opening the original builtin must preserve its 140 mm arm');
assert.equal(reopened.params.LIFT_TOOL_DIAG_1,original.params.LIFT_TOOL_DIAG_1,'derived diagonal must retain all saved precision');
for(const comp of original.comps.filter(c=>c.type==='bar'||c.type==='triangle'))for(const key of [comp.lenParam,comp.gParam,comp.r1Param,comp.r2Param].filter(Boolean))assert.equal(reopened.params[key],original.params[key],key);
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);
const same=(a,b)=>{if(typeof a==='number'&&typeof b==='number')near(a,b);else if(a&&b&&typeof a==='object'&&typeof b==='object'){assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort());for(const k of Object.keys(a))same(a[k],b[k]);}else assert.deepEqual(a,b);};
const point=(m,h)=>({x:m[0]*h.x+m[4]*h.y+m[12],y:m[1]*h.x+m[5]*h.y+m[13],z:m[2]*h.x+m[6]*h.y+m[14]});
const inverse=(m,p)=>{const [x,y,z]=[p.x-m[12],p.y-m[13],p.z-m[14]];return {x:m[0]*x+m[1]*y+m[2]*z,y:m[4]*x+m[5]*y+m[6]*z};};
const snapshot=w=>toSnapshot(w.comps,w.topo || {params:w.params},0,{modules:w.modules,fabrication:w.fabrication});
const work=n=>({...n,topo:{params:n.params}});
// All length flags are interaction metadata, not permission to quantize files.
for(const flags of [{},{fixedLen:true},{fixedLen:true,snapLength:false}]){
 const c={type:'bar',id:'B',p1:{id:'A',type:'fixed',x:0,y:0},p2:{id:'B0',x:29,y:0},lenParam:'L',...flags};
 for(const value of [29,29.123456789,1.125])assert.equal(normalizeSnapshot({kind:'blocks',v:1,comps:[c],params:{L:value}}).params.L,value);
 for(const value of [undefined,null,'',false,-1,0,NaN,Infinity,'bad']){
  const n=normalizeSnapshot({kind:'blocks',v:1,comps:[c],params:{L:value}});assert.equal(n.params.L,29);assert.ok(n.warnings.some(w=>w.includes('尺寸 L')&&w.includes('29 mm')));
 }
 const missing=structuredClone(c);missing.p2.x=0;assert.equal(normalizeSnapshot({kind:'blocks',v:1,comps:[missing],params:{L:-5}}).params.L,8);
}
const triangle={type:'triangle',id:'T',p1:{id:'A',type:'fixed',x:0,y:0},p2:{id:'B',x:60,y:0},p3:{id:'C',x:60,y:100},gParam:'G',r1Param:'R1',r2Param:'R2',snapLength:false};
const inferred=normalizeSnapshot({kind:'blocks',v:1,comps:[triangle],params:{G:null,R1:'bad',R2:-1}});
assert.equal(inferred.params.G,60);assert.equal(inferred.params.R1,Math.hypot(60,100));assert.equal(inferred.params.R2,100);assert.equal(inferred.warnings.filter(w=>w.startsWith('尺寸 ')).length,3);
assert.equal(planMemberDimension(triangle,{G:60,R1:Math.hypot(60,100),R2:100},'g',60.123).value,60.1,'explicit editor still submits one decimal');
// Execute the real tools creation route, rather than duplicating snapLego.
Object.assign(S,{comps:[],modules:[],topo:{params:{}},counter:0,drawingLink:false,polygonPoints:[{pos:{x:0,y:0}},{pos:{x:29,y:0}}]});
let undoCount=0;Tools.init({svg:{style:{}},clearBanner(){},pushUndo(){undoCount++;},rebuild(){},draw(){},selectLink(){}});Tools.finishPolygonDraw();
assert.equal(S.topo.params.LL1,32);assert.equal(S.comps[0].p2.x,32);assert.equal(undoCount,1);
// Actual storage/download/share entry points and app undo normalization route.
const memory=new Map(),blobs=new Map(),downloads=[];
globalThis.localStorage={setItem:(k,v)=>memory.set(k,v),getItem:k=>memory.get(k),removeItem:k=>memory.delete(k)};
globalThis.location={origin:'https://example.test',pathname:'/blocks.html',hash:''};
globalThis.URL.createObjectURL=b=>{const id=`blob:${blobs.size}`;blobs.set(id,b);return id;};globalThis.URL.revokeObjectURL=()=>{};
globalThis.document={body:{appendChild(){}},createElement:()=>({click(){downloads.push({name:this.download,blob:blobs.get(this.href)});},remove(){}})};
const app=readFileSync('js/blocks/app.js','utf8'),undoBody=app.match(/function undo\(\) \{([\s\S]*?)\n\}/)[1];
const applyUndo=new Function('S','Store','undoLessons','applySnapshot','exampleController','updateUndoBtn',undoBody);
// A real UI insertion/rebuild leaves implicit motor direction to the shared
// planner. Opening must not synthesize a different explicit direction.
Object.assign(S,{comps:[],modules:[],topo:{params:{}},counter:0});
createModuleEditor({viewCenter:()=>({x:0,y:0}),pushUndo(){},rebuild(){const p=prepareConnectionWork(S.comps,S.modules,S.topo);S.modules=p.modules;},draw(){},transient(){}}).insertBuiltin('fourbar-lift');
assert.ok(S.comps.some(c=>c.isInput&&!c.motorMount));
const inserted={comps:structuredClone(S.comps),modules:structuredClone(S.modules),params:structuredClone(S.topo.params),fabrication:original.fabrication},insertOpen=normalizeSnapshot(snapshot(inserted));
const im=faceCandidateModel({work:inserted},{theta:20}),om=faceCandidateModel({work:work(insertOpen)},{theta:20});
same(im.catalog.parts.frame.cutouts,om.catalog.parts.frame.cutouts);
mkdirSync('output/framework-stabilization/w4b-dimensions',{recursive:true});
writeFileSync('output/framework-stabilization/w4b-dimensions/legacy-motor-orientation.json',JSON.stringify({route:'createModuleEditor.insertBuiltin→prepareConnectionWork→toSnapshot→normalizeSnapshot',beforeComps:inserted.comps,afterComps:insertOpen.comps,beforeCutouts:im.catalog.parts.frame.cutouts,afterCutouts:om.catalog.parts.frame.cutouts},null,2));
const motorPoints={O:{x:0,y:0},E:{x:30,y:40},T:{x:60,y:30},A:{x:-40,y:0}};
const motorBar=(id,first,last,motor,extra={})=>({type:'bar',id,isInput:true,physicalMotor:motor,lenParam:`L${id}`,p1:{id:first,type:first==='O'?'motor':'floating',physicalMotor:motor,...motorPoints[first]},p2:{id:last,type:'floating',...motorPoints[last]},...extra});
const motorPlan=comps=>buildMotorMounts({comps,motorIds:new Set(['O','E']),groundIds:new Set(['O','A']),staticPoints:motorPoints,compiledSteps:[],sliderMountInfo:()=>null,isHiddenSliderRailPoint:()=>false,motorTypeForCenter:()=> 'mg995'});
for(const orientation of [undefined,'horizontal','vertical','follow-frame'])for(const reversed of [false,true]){
 const comps=[motorBar('First','O','E','1',{motorMount:{motor:'1',center:'O',outputBody:'First',orientation:'horizontal'}}),motorBar('Second','E','T','2',{motorCarrier:'Carrier',motorMount:{motor:'2',center:'E',outputBody:'Second',frameBody:'Carrier',...(orientation?{orientation}:{}),reversed}}),{type:'bar',id:'Carrier',lenParam:'LC',p1:{id:'A',type:'fixed',...motorPoints.A},p2:{id:'E',type:'floating',...motorPoints.E}}];
 const norm=normalizeSnapshot({kind:'blocks',v:1,comps,params:{LFirst:50,LSecond:Math.hypot(30,10),LC:Math.hypot(70,40)}});
 same([...motorPlan(comps)],[...motorPlan(norm.comps)]);
 assert.equal(motorPlan(norm.comps).get('E').outputBody,'Second','coincident M1 endpoint never steals M2 source');assert.equal(motorPlan(norm.comps).get('E').frameBody,'Carrier');
 assert.equal(norm.comps[1].motorMount.orientation,orientation);
}
for(const carrier of [undefined,'Carrier'])for(const reversed of [false,true])for(const partial of [false,true]){
 const comps=[motorBar('First','O','A','1',{motorMount:{motor:'1',center:'O',outputBody:'First',orientation:'horizontal'}}),motorBar('Second','E','T','2',{...(carrier?{motorCarrier:carrier}:{}),...(partial?{motorMount:{motor:'2',center:'E',outputBody:'Second',...(carrier?{frameBody:carrier}:{}),reversed}}:{})})];
 const normalized=normalizeSnapshot({kind:'blocks',v:1,comps,params:{LFirst:40,LSecond:Math.hypot(30,10)}});same([...motorPlan(comps)],[...motorPlan(normalized.comps)]);
 assert.equal(normalized.comps[1].motorMount?.orientation,undefined);if(!partial)assert.equal(normalized.comps[1].motorMount,undefined);
}
async function files(source,pose){
 const data=faceFileExportData(source,pose),start=downloads.length;
 for(const [links,frame] of [[E.exportLinksAsSvg,E.exportFrameAsSvg],[E.exportLinksAsDxf,E.exportFrameAsDxf]]){links(data.comps,data.points,data.params,data.settings,data.mounts,data.extras);for(const f of data.frames)frame(f.nodes,data.settings,f.mounts,f.name);}
 return Promise.all(downloads.slice(start).map(async d=>({name:d.name,text:await d.blob.text()})));
}
const circles=f=>{
 if(f.name.endsWith('.svg'))return [...f.text.matchAll(/<circle\b([^>]*)\/>/g)].map(([,s])=>{const a=Object.fromEntries([...s.matchAll(/([\w-]+)="([^"]*)"/g)].map(([,k,v])=>[k,v]));return {id:a['data-hole-id'],pair:a['data-hole-pair-id'],x:Number(a.cx),y:Number(a.cy)};});
 const rows=f.text.trimEnd().split(/\r?\n/),out=[];let c;for(let i=0;i<rows.length;i+=2){const code=Number(rows[i]),v=rows[i+1];if(code===0){if(c)out.push(c);c=v==='CIRCLE'?{}:null;}else if(c){if(code===10)c.x=Number(v);if(code===20)c.y=Number(v);if(code===999&&v.startsWith('HOLE_TRACE ')){const h=JSON.parse(v.slice(11));c.id=h.id;c.pair=h.holePairId;}}}return out;
};
const fixtures=[['f1',f1AssemblyFixture()],['builtin-planar-frame',original],['f3-root-frame',rootFrameFixture()]];
mkdirSync('output/framework-stabilization/w4b-dimensions',{recursive:true});
for(const [name,source] of fixtures){
 const raw=snapshot(source),before=JSON.stringify(raw);freezeData(raw);const n=normalizeSnapshot(raw);assert.equal(JSON.stringify(raw),before,'frozen input unchanged');
 const again=normalizeSnapshot(snapshot(work(n)));assert.deepEqual(again.params,n.params);assert.deepEqual(again.comps,n.comps);assert.deepEqual(again.modules,n.modules,'normalization idempotent');
 Store.saveLocal(raw);assert.deepEqual(normalizeSnapshot(Store.loadLocal()).params,n.params);
 location.hash=new URL(Store.buildShareUrl(raw)).hash;assert.deepEqual(normalizeSnapshot(Store.readShareFromHash()).params,n.params);
 const start=downloads.length;Store.downloadJson(raw);assert.deepEqual(normalizeSnapshot(JSON.parse(await downloads[start].blob.text())).params,n.params);
 let restored;applyUndo({undoStack:[JSON.stringify(raw)]},Store,new Map(),(result,opts)=>{restored=result;assert.deepEqual(opts,{recordUndo:false,fit:false,source:'undo'});},{restoreLesson(){}},()=>{});assert.deepEqual(restored.params,n.params);
 for(const theta of [0,20,40]){
  const pose={theta,motorAngles:{'1':theta,'2':10,'3':15}},a=faceCandidateModel({work:source},pose),b=faceCandidateModel({work:work(n)},pose);
  assert.ok(a.solveValidity.valid&&b.solveValidity.valid,name);assert.deepEqual(a.catalog.diagnostics,[]);assert.deepEqual(b.catalog.diagnostics,[],'original builtin remains manufacturable after reopening');
  // Independent rigid-member distances expose any shared rebake/rounding drift.
  for(const c of source.comps.filter(c=>c.type==='bar'||c.type==='triangle'))for(const [p,q,key] of [[c.p1,c.p2,c.lenParam||c.gParam],[c.p1,c.p3,c.r1Param],[c.p2,c.p3,c.r2Param]])if(key&&source.params[key]&&b.points[p.id]&&b.points[q.id])near(Math.hypot(b.points[p.id].x-b.points[q.id].x,b.points[p.id].y-b.points[q.id].y),source.params[key]);
  assert.deepEqual(Object.keys(b.points),Object.keys(a.points));for(const [id,p] of Object.entries(a.points))for(const k of ['x','y'])near(b.points[id][k],p[k]);
  assert.equal(b.model.materialParts.length,a.model.materialParts.length);
  for(const p of a.model.materialParts){const q=b.model.materialParts.find(q=>q.partId===p.partId);assert.ok(q);same(q.geometry,p.geometry);p.pose.matrix.forEach((v,i)=>near(q.pose.matrix[i],v));for(const h of p.geometry.holes){const w=point(p.pose.matrix,h),v=point(q.pose.matrix,q.geometry.holes.find(x=>x.id===h.id));for(const k of ['x','y','z'])near(v[k],w[k]);}}
  const af=await files(source,pose),bf=await files(work(n),pose);assert.deepEqual(bf,af,`${name} actual SVG/DXF bytes preserve dimensions and all traces including implicit motor features`);
  // Serialized drills must lie on measured world physical hole axes/centres.
  for(const box of b.model.brackets){const plate=b.model.materialParts.find(p=>p.geometry.holes.some(h=>h.holePairId===box.holePairId)),h=plate.geometry.holes.find(h=>h.holePairId===box.holePairId),local=inverse(plate.pose.matrix,box.hole.center);near(local.x,h.x,.005);near(local.y,h.y,.005);for(const fmt of ['svg','dxf']){const drill=bf.filter(f=>f.name.endsWith(`.${fmt}`)).flatMap(circles).find(x=>x.id===h.id);assert.ok(drill);near(drill.x,local.x,.005);near(drill.y,local.y,.005);}}
 }
 writeFileSync(`output/framework-stabilization/w4b-dimensions/ui-${name}-raw.blocks.json`,JSON.stringify(raw,null,2));writeFileSync(`output/framework-stabilization/w4b-dimensions/ui-${name}-reopened.blocks.json`,JSON.stringify(snapshot(work(n)),null,2));
}
writeFileSync('output/framework-stabilization/w4b-dimensions/expected-dimensions.json',JSON.stringify({arm:140,diagonal:original.params.LIFT_TOOL_DIAG_1,jaws:Object.fromEntries(Object.entries(original.params).filter(([k])=>/^(LJ_|RJ_)/.test(k)))},null,2));
console.log('F1/original builtin planar→frame/F3: frozen/idempotent, save/share/app-undo, actual tools snap, 0/20/40 independent dimensions/poses/world drills and public SVG/DXF bytes passed');
