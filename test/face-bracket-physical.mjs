import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bracketFixture} from './fixtures/face-bracket-fixture.mjs';
import {buildMountSurfaces} from '../js/blocks/mount-surfaces.js';
import {planFaceBrackets} from '../js/blocks/face-bracket-geometry.js';
import {faceBracketBoxes,faceBracketScrews} from '../js/blocks3d/face-brackets.js';
import {transformBracketInstance} from '../js/blocks/bracket-physical.js';
import {auditBracketPhysical} from './fixtures/bracket-physical-audit.mjs';
import {orthogonalExportExtras,withAdapterNodes} from '../js/blocks/orthogonal-joint.js';
import {inspectLinkExport,inspectFrameExport} from '../js/blocks/exporters.js';
import {frameConnectorNodes} from '../js/blocks/model.js';
import {buildPlan,hardwareList} from '../js/blocks/build-plan.js';
import {realMountExamples} from '../js/blocks/face-mate-examples.js';
import {buildFacePlacement} from '../js/blocks/face-placement.js';
import {mountFacePlacement} from '../js/blocks/face-mount.js';
import {compileAssembly,solveAssembly,outputPose} from '../js/blocks/assembly.js';
import {pointCoords} from '../js/blocks/model.js';
import {faceBracketPlan} from '../js/blocks/face-bracket-extras.js';
import {buildOrthogonalChildren,applyMatrix4} from '../js/blocks3d/orthogonal-3d.js';
let f;
if(process.argv[2])f=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
else {
 const {hosts,children}=realMountExamples(),h=hosts[0],c=children[0];
 f={comps:[...h.instance.comps,...c.instance.comps],modules:[h.instance.module,c.instance.module],params:{...h.instance.params,...c.instance.params}};
 const selection={hostFace:'back',childFace:'bottom',alignU:0,alignV:0,offsetU:0,offsetV:0,gap:0,quarterTurns:1,brackets:{enabled:true,offsets:{},childPart:'frame'}};
 const record=buildFacePlacement({host:h,child:c,selection}).record;
 const face={version:1,...record.transform,selection:record.selection,hostThicknessMm:4,childThicknessMm:4};
 f.modules[1].mount=mountFacePlacement(f.comps,f.modules,c.surface.moduleId,{hostId:h.surface.moduleId,outputId:h.surface.outputId,face},f.params).mount;
}
const child=f.modules.find(m=>m.mount?.face),host=f.modules.find(m=>m.id===child.mount.to.module);
const opts={stockMm:f.fabrication?.cnc?.stockThicknessMm||4,exportSettings:f.fabrication?.export||{}};
const drilling=faceBracketPlan(f.comps,f.modules,f.params,child,opts);assert.ok(drilling.ok,drilling.reason);
const design=outputPose(host,child.mount.to.output,pointCoords(f.comps),f.comps);
const comp=f.comps.find(c=>c.id===drilling.host.compId);
for(const thetaDeg of [0,20,40]) {
 const asm=compileAssembly(f.comps,f.modules,{params:f.params});
 const solved=solveAssembly(asm,{thetaDeg,motorAngles:{}});assert.ok(solved.isValid);
 const current=outputPose(host,child.mount.to.output,solved.points,f.comps);
 const r=(current.a-design.a)*Math.PI/180;
 const hostCenter=12+child.mount.face.hostThicknessMm/2;
 const world=p=>({x:current.x+(p.x-design.x)*Math.cos(r)-(p.y-design.y)*Math.sin(r),y:current.y+(p.x-design.x)*Math.sin(r)+(p.y-design.y)*Math.cos(r),z:p.z+hostCenter});
 const own=f.comps.find(c=>c.moduleId===child.id);
 const scene=buildOrthogonalChildren({...f,inputs:{pts:solved.points},mainModel:{sticks:[{id:comp.id,z:12}]},
   plates:[{moduleId:child.id,plane:child.id,thicknessMm:child.mount.face.childThicknessMm}],...opts,
   buildModel:()=>({gears:[{id:own.id,z:0}]})})[0];
 assert.equal(scene.brackets.length,drilling.brackets.length*2);
 assert.equal(scene.screws.length,drilling.brackets.length*2,'F1 face bracket screws are missing');
 const pack=buildPlan({...f,cnc:{stockThicknessMm:opts.stockMm},exportSettings:opts.exportSettings});
 assert.ok(hardwareList(pack).some(r=>r.spec.includes('帶牙金屬角碼')&&r.qty===drilling.brackets.length),'F1 face bracket BOM is missing');
 const planes={},actualHoles=[];
 const hostN={x:0,y:0,z:1},childN={x:scene.matrix[8],y:scene.matrix[9],z:scene.matrix[10]};
 const innerProduct=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
 for(const b of scene.brackets) {
   const isHost=b.wingId.endsWith('wing:host'),surface=isHost?drilling.host:drilling.child;
   const n=isHost?hostN:childN;
   const mid=isHost?world({x:0,y:0,z:0}):applyMatrix4(scene.matrix,{x:0,y:0,z:-child.mount.face.childThicknessMm/2});
   const sgn=innerProduct({x:b.center.x-mid.x,y:b.center.y-mid.y,z:b.center.z-mid.z},n)>0?1:-1;
   const z=sgn>0?surface.box.max.z:surface.box.min.z;
   const contact=isHost?world({x:0,y:0,z}):applyMatrix4(scene.matrix,{x:0,y:0,z:z-child.mount.face.childThicknessMm/2});
   const h=(isHost?drilling.hostHoles:drilling.childHoles).find(h=>h.holePairId===b.holePairId);
   planes[b.holePairId]={contact,normal:{x:n.x*sgn,y:n.y*sgn,z:n.z*sgn},thicknessMm:surface.box.max.z-surface.box.min.z};
   actualHoles.push({holePairId:h.holePairId,center:isHost?world({x:h.x,y:h.y,z}):applyMatrix4(scene.matrix,{x:h.x,y:h.y,z:z-child.mount.face.childThicknessMm/2}),axis:planes[b.holePairId].normal,diameterMm:h.diameterMm});
 }
 const bom=hardwareList(pack).filter(r=>r.spec===drilling.spec.label||/角碼/.test(r.note)).map(r=>({...r,qty:r.spec===drilling.spec.label?r.qty:Number(/角碼 (\d+)/.exec(r.note)?.[1])}));
 assert.deepEqual(auditBracketPhysical({boxes:scene.brackets,screws:scene.screws,plates:planes,holes:actualHoles,hardware:bom,count:drilling.brackets.length,spec:drilling.spec}),[],`real F1 at ${thetaDeg}`);
 const extras=orthogonalExportExtras(f.comps,f.modules,f.params,opts);
 const link=inspectLinkExport(comp,Math.hypot(comp.p2.x-comp.p1.x,comp.p2.y-comp.p1.y),opts.exportSettings,extras.linkHoles[comp.id]);
 const nodes=withAdapterNodes(child.id,frameConnectorNodes(f.comps.filter(c=>c.moduleId===child.id)),extras);
 const frame=inspectFrameExport(nodes,opts.exportSettings);
 for(const [out,source] of [[link,drilling.hostHoles],[frame,drilling.childHoles]]) {
   for(const h of source){const emitted=out.holes.find(q=>q.holePairId===h.holePairId);assert.ok(emitted,'export preserves paired IDs');assert.equal(emitted.id,h.id);assert.equal(emitted.r,1.6);}
 }
 drilling.brackets.forEach((b,i)=>[b.hostHole,b.childHole].forEach((p,j)=>{
   const point=j?applyMatrix4(scene.matrix,{...p,z:p.z-child.mount.face.childThicknessMm/2}):world(p);
   const box=scene.brackets[i*2+j],d={x:box.hole.center.x-point.x,y:box.hole.center.y-point.y,z:box.hole.center.z-point.z};
   const dot=a=>d.x*a.x+d.y*a.y+d.z*a.z;
   assert.ok(box.axes.slice(0,2).every(a=>Math.abs(dot(a))<1e-5),'both holes must remain coaxial with stock at every pose');
   assert.ok(Math.abs(dot(box.hole.axis)-box.size.z/2)<1e-5,'wing contact surface must touch stock without gap or penetration');
 }));
}
console.log('face bracket alignment: both wings flush and coaxial at 0/20/40 degrees, including legacy references');


// Independent stock-plane audit covers both slot counts, reverse leg assignment,
// all stock thicknesses, custom metal sizes, and two non-commuting pose transforms.
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const point=(R,T,p)=>({x:R[0][0]*p.x+R[0][1]*p.y+R[0][2]*p.z+T.x,y:R[1][0]*p.x+R[1][1]*p.y+R[1][2]*p.z+T.y,z:R[2][0]*p.x+R[2][1]*p.y+R[2][2]*p.z+T.z});
const vector=(R,p)=>point(R,{x:0,y:0,z:0},p);
const surface=(span,T,minY=-60)=>({moduleId:'stock',outlines:[[{x:-span/2,y:minY},{x:span/2,y:minY},{x:span/2,y:60},{x:-span/2,y:60}]],holes:[],cutouts:[],box:{min:{x:-span/2,y:minY,z:-T/2},max:{x:span/2,y:60,z:T/2}}});
let cases=0;
for(const count of [2,3])for(const thickness of [3,4,6])for(const reversed of [false,true])for(const faceSide of [-1,1])for(const custom of [false,true,'thick']) {
  let host=surface(120,thickness),child=surface(count===2?44:90,thickness+1,0);
  let R=[[1,0,0],[0,0,-faceSide],[0,faceSide,0]],T={x:0,y:0,z:faceSide*thickness/2};
  if(reversed){[host,child]=[child,host];R=R[0].map((_,i)=>R.map(row=>row[i]));T=vector(R,{x:-T.x,y:-T.y,z:-T.z});}
  const joint=custom?{bracket:{widthMm:custom==='thick'?3:8,thicknessMm:custom==='thick'?5:2,longLegMm:15,shortLegMm:11,holeEndMm:3.5}}:undefined;
  const expectedSpec={...(custom?joint.bracket:{widthMm:7,thicknessMm:1.2,longLegMm:13,shortLegMm:9.5,holeEndMm:3.5}),label:custom?`M3 帶牙金屬角碼 15×11×${custom==='thick'?3:8}`:'M3 帶牙金屬角碼 13×9.5×7'};
  const planned=planFaceBrackets(host,child,{rotation:R,translation:T},{},true,{joint,connectionId:'connection:audit'});
  assert.ok(planned.ok,planned.reason);assert.equal(planned.brackets.length,count);
  for(const key of Object.keys(expectedSpec))assert.equal(planned.spec[key],expectedSpec[key],'requested fabrication specification');
  for(const shift of [-.02,.02])assert.equal(planFaceBrackets(host,child,{rotation:R,translation:{...T,[reversed?'y':'z']:T[reversed?'y':'z']+shift}},{},true,{joint}).ok,false,'physical plan rejects .02 mm gap/penetration');
  assert.equal(planFaceBrackets(host,child,{rotation:R,translation:T},{},true,{joint:{bracket:{holeEndMm:20}}}).ok,false,'physical plan rejects hole outside wing');
  const boxes=faceBracketBoxes(planned),screws=faceBracketScrews(planned),holes=[];
  const n={x:R[0][2],y:R[1][2],z:R[2][2]},planes={};
  const hostHoles=planned.hostHoles,childHoles=planned.childHoles;
  for(const b of boxes) {
    const isHost=b.wingId.endsWith('wing:host');
    const normal=isHost?{x:0,y:0,z:b.center.z>0?1:-1}:Object.fromEntries(['x','y','z'].map(k=>[k,n[k]*(dot({x:b.center.x-T.x,y:b.center.y-T.y,z:b.center.z-T.z},n)>0?1:-1)]));
    const plate=isHost?host:child;
    const contact=isHost?{x:0,y:0,z:normal.z>0?plate.box.max.z:plate.box.min.z}:point(R,T,{x:0,y:0,z:dot(normal,n)>0?plate.box.max.z:plate.box.min.z});
    planes[b.holePairId]={normal,contact,thicknessMm:plate.box.max.z-plate.box.min.z};
    const local=(isHost?hostHoles:childHoles).find(h=>h.holePairId===b.holePairId);
    const expectedCenter=isHost?{x:local.x,y:local.y,z:contact.z}:point(R,T,{x:local.x,y:local.y,z:dot(normal,n)>0?plate.box.max.z:plate.box.min.z});
    for(const k of ['x','y','z'])assert.ok(Math.abs(local.center[k]-expectedCenter[k])<1e-6,'drilling connection-frame center');
    assert.ok(Math.abs(dot(local.axis,normal)-1)<1e-6,'drilling connection-frame axis');
    holes.push({holePairId:local.holePairId,center:isHost?{x:local.x,y:local.y,z:contact.z}:point(R,T,{x:local.x,y:local.y,z:dot(normal,n)>0?plate.box.max.z:plate.box.min.z}),axis:normal,diameterMm:local.diameterMm});
  }
  const rows=[{spec:planned.spec.label,qty:count}];
  for(const key of new Set(screws.map(s=>s.spec)))rows.push({spec:key,qty:screws.filter(s=>s.spec===key).length});
  const args={boxes,screws,holes,plates:planes,hardware:rows,count,spec:expectedSpec};
  assert.deepEqual(auditBracketPhysical(args),[],`independent audit ${count}/${thickness}/${reversed}/${custom}`);
  assert.ok(auditBracketPhysical({...args,holes:holes.slice(1)}).length,'missing hole rejected');
  const wrongAxis=structuredClone(boxes);wrongAxis[0].hole.axis=wrongAxis[0].axes[0];
  assert.ok(auditBracketPhysical({...args,boxes:wrongAxis}).length,'wrong axis rejected');
  const excess=structuredClone(boxes);excess[1].size.z*=2;
  for(const k of ['x','y','z'])excess[1].center[k]+=excess[1].axes[2][k]*planned.spec.thicknessMm/2;
  assert.ok(auditBracketPhysical({...args,boxes:excess}).includes('wing overlap limited to bend'),'excess bend overlap rejected');
  const outsideHole=structuredClone(boxes);outsideHole[0].hole.center={...outsideHole[0].center};
  for(const k of ['x','y','z'])outsideHole[0].hole.center[k]+=outsideHole[0].axes[1][k]*outsideHole[0].size.y;
  assert.ok(auditBracketPhysical({...args,boxes:outsideHole}).includes('thread circle within wing material'),'hole outside wing negative');
  const overlap=structuredClone(boxes);
  const first=overlap[0],second=overlap[1],plane=planes[first.holePairId];
  for(const k of ['x','y','z'])second.center[k]-=plane.normal[k]*3;
  assert.ok(auditBracketPhysical({...args,boxes:overlap}).length,'wing crossing stock negative');
  const gap=structuredClone(boxes);for(const k of ['x','y','z'])gap[0].center[k]+=planes[gap[0].holePairId].normal[k];
  assert.ok(auditBracketPhysical({...args,boxes:gap}).length,'detached bracket rejected');
  assert.ok(auditBracketPhysical({...args,hardware:rows.filter(r=>!r.spec.startsWith('M3×'))}).length,'wrong BOM rejected');
  assert.ok(auditBracketPhysical({...args,hardware:rows.map(r=>({...r,qty:r.qty+1}))}).length,'wrong BOM quantity rejected');
  const wrongScrew=structuredClone(screws);wrongScrew[0].lengthMm+=2;
  assert.ok(auditBracketPhysical({...args,screws:wrongScrew}).length,'wrong screw specification rejected');
  // Measurements after two independent rigid poses; normals use no translations.
  const A=[[0,-1,0],[1,0,0],[0,0,1]],B=[[1,0,0],[0,0,-1],[0,1,0]],U={x:12,y:-7,z:19},V={x:-14,y:31,z:8};
  const posed=planned.physical.map(b=>transformBracketInstance(transformBracketInstance(b,p=>point(A,U,p),p=>vector(A,p)),p=>point(B,V,p),p=>vector(B,p)));
  const mv=p=>point(B,V,point(A,U,p)),rot=p=>vector(B,vector(A,p));
  const nested={...args,boxes:posed.flatMap(b=>b.wings.map(w=>w.box)),screws:posed.flatMap(b=>b.wings.map(w=>w.screw)),holes:holes.map(h=>({...h,center:mv(h.center),axis:rot(h.axis)})),plates:Object.fromEntries(Object.entries(planes).map(([id,p])=>[id,{...p,contact:mv(p.contact),normal:rot(p.normal)}]))};
  assert.deepEqual(auditBracketPhysical(nested),[],'nested rigid pose audit');
  assert.deepEqual(nested.boxes.map(b=>b.id),boxes.map(b=>b.id),'stable IDs across poses');
  const rounded=holes.map(h=>({...h,center:Object.fromEntries(['x','y','z'].map(k=>[k,Math.round(h.center[k]*1000)/1000]))}));
  assert.deepEqual(auditBracketPhysical({...args,holes:rounded,tolerance:.005}),[],'three decimal fabrication output');
  cases++;
}
console.log(`physical audit: ${cases} slot/stock/reverse/spec cases, nested poses and deliberate negative controls`);

// Exercise the scene builder's actual recursive parent matrix, not only a pose adapter.
const nestedFixture=bracketFixture(), second=bracketFixture();
const renamed=JSON.parse(JSON.stringify(second.comps.filter(c=>c.moduleId==='Child')).replaceAll('Child','Grand').replaceAll('Anchor','GrandAnchor').replaceAll('C0','G0').replaceAll('C1','G1').replaceAll('C2','G2'));
nestedFixture.comps.push({type:'bar',id:'MiddleBar',moduleId:'Child',p1:{id:'B0',type:'fixed',x:-60,y:20},p2:{id:'B1',type:'fixed',x:60,y:20},stock:{widthMm:60,thicknessMm:3}},...renamed);
nestedFixture.modules[1].outputs=[{id:'middle',at:'B0',body:{kind:'bar',id:'MiddleBar'}}];
nestedFixture.modules.push({id:'Grand',name:'巢狀底板',base:'G0',outputs:[],mount:null});
const getSurface=(id,kind)=>buildMountSurfaces({...nestedFixture,moduleId:id,drilling:true,thicknessMm:3}).surfaces.find(s=>s.kind===kind);
const ref=s=>({surface:s,box:{min:Object.fromEntries(['x','y','z'].map(k=>[k,s.box.min[k]-(s.box.max[k]+s.box.min[k])/2])),max:Object.fromEntries(['x','y','z'].map(k=>[k,s.box.max[k]-(s.box.max[k]+s.box.min[k])/2]))}});
for(const [own,parent,output,brackets] of [['Child','Host','plate',false],['Grand','Child','middle',true]]) {
 const host=getSurface(parent,'output'),childSurface=getSurface(own,'frame');
 const selection={hostFace:'top',childFace:'back',alignU:0,alignV:0,offsetU:0,offsetV:0,gap:0,quarterTurns:0,...(brackets?{brackets:{enabled:true,childPart:'frame',offsets:{}}}:{})};
 const placed=buildFacePlacement({host:ref(host),child:ref(childSurface),selection});assert.ok(placed.ok,placed.reason);
 const face={version:1,childPart:'frame',...placed.record.transform,selection:placed.record.selection,hostThicknessMm:3,childThicknessMm:3};
 const mounted=mountFacePlacement(nestedFixture.comps,nestedFixture.modules,own,{hostId:parent,outputId:output,face},nestedFixture.params);assert.ok(mounted.ok,mounted.reason);
 nestedFixture.modules.find(m=>m.id===own).mount=mounted.mount;
}
const nestedPlan=faceBracketPlan(nestedFixture.comps,nestedFixture.modules,nestedFixture.params,nestedFixture.modules[2]);assert.ok(nestedPlan.ok,nestedPlan.reason);
const scenes=buildOrthogonalChildren({...nestedFixture,inputs:{pts:pointCoords(nestedFixture.comps)},mainModel:{sticks:[{id:'HostBar',z:12}]},plates:[{moduleId:'Child',plane:'Child',thicknessMm:3},{moduleId:'Grand',plane:'Grand',thicknessMm:3}],buildModel:input=>input.pts.G0?{gears:[{id:'GrandAnchor0',z:0}]}:{gears:[{id:'Anchor0',z:0}],sticks:[{id:'MiddleBar',z:10}]}});
const parent=scenes.find(s=>s.id==='Child'),grand=scenes.find(s=>s.id==='Grand');assert.ok(parent&&grand,'actual nested child scenes exist');
const planes={},holes=[];
for(const b of grand.brackets) {
 const host=b.wingId.endsWith('wing:host'),matrix=host?parent.matrix:grand.matrix,surface=host?nestedPlan.host:nestedPlan.child;
 const axis={x:matrix[8],y:matrix[9],z:matrix[10]},mid=applyMatrix4(matrix,{x:0,y:0,z:host?11.5:-1.5});
 const sign=dot({x:b.center.x-mid.x,y:b.center.y-mid.y,z:b.center.z-mid.z},axis)>0?1:-1;
 const z=(sign>0?surface.box.max.z:surface.box.min.z)+(host?11.5:-1.5),normal={x:axis.x*sign,y:axis.y*sign,z:axis.z*sign};
 const h=(host?nestedPlan.hostHoles:nestedPlan.childHoles).find(h=>h.holePairId===b.holePairId);
 planes[b.holePairId]={normal,contact:applyMatrix4(matrix,{x:0,y:0,z}),thicknessMm:3};
 holes.push({holePairId:h.holePairId,center:applyMatrix4(matrix,{x:h.x,y:h.y,z}),axis:normal,diameterMm:h.diameterMm});
}
const nestedPack=buildPlan({...nestedFixture,cnc:{stockThicknessMm:3}}),nestedBom=hardwareList(nestedPack).filter(r=>r.spec===nestedPlan.spec.label||/角碼/.test(r.note)).map(r=>({...r,qty:r.spec===nestedPlan.spec.label?r.qty:Number(/角碼 (\d+)/.exec(r.note)?.[1])}));
assert.deepEqual(auditBracketPhysical({boxes:grand.brackets,screws:grand.screws,plates:planes,holes,hardware:nestedBom,count:nestedPlan.brackets.length,spec:nestedPlan.spec}),[],'recursive nested scene and BOM independent audit');
console.log('recursive face scene: parent and grandchild stock planes / paired drilling / screws / BOM audited');
