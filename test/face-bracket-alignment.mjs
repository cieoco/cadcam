import assert from 'node:assert/strict';
import fs from 'node:fs';
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
 drilling.brackets.forEach((b,i)=>[b.hostHole,b.childHole].forEach((p,j)=>{
   const point=j?applyMatrix4(scene.matrix,{...p,z:p.z-child.mount.face.childThicknessMm/2}):world(p);
   const box=scene.brackets[i*2+j],d={x:box.hole.center.x-point.x,y:box.hole.center.y-point.y,z:box.hole.center.z-point.z};
   const dot=a=>d.x*a.x+d.y*a.y+d.z*a.z;
   assert.ok(box.axes.slice(0,2).every(a=>Math.abs(dot(a))<1e-5),'both holes must remain coaxial with stock at every pose');
   assert.ok(Math.abs(dot(box.hole.axis)-box.size.z/2)<1e-5,'wing contact surface must touch stock without gap or penetration');
 }));
}
console.log('face bracket alignment: both wings flush and coaxial at 0/20/40 degrees, including legacy references');

