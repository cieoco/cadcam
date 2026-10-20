import {syringeShape} from '../blocks/syringe-shape.js';
import {planeOf} from '../blocks/assembly.js';
import {IDENTITY_4,applyMatrix4} from './orthogonal-3d.js';

// Read-only appearance adapter. Solved x/y are in the owning assembly plane;
// child matrices already include ancestors. Never apply the host transform twice.
// The plunger lies on its rod's centre plane. Hardware uses the actual frame
// hole poses; it never invents a second support plate or changes the mechanism.
const inPlane=(m,p)=>{const x=p.x-m[12],y=p.y-m[13],z=p.z-m[14];return {x:m[0]*x+m[1]*y+m[2]*z,y:m[4]*x+m[5]*y+m[6]*z,z:m[8]*x+m[9]*y+m[10]*z};};
export function syringeClampInstallation(model,shape,z,matrix){
 if(!shape.fixed)return null;
 if(shape.r>shape.clamp.innerRadius)return {status:'unverified',reason:'clamp_diameter',fasteners:[]};
 const fasteners=[];
 for(const [i,foot] of shape.clamp.feet.entries()){
  const id=`${shape.id}_clamp_${i}`,part=model.materialParts?.find(p=>p.geometry.holes.some(h=>h.id===id));
  if(!part)return {status:'unverified',reason:'missing_frame_holes',fasteners:[]};
  const hole=part.geometry.holes.find(h=>h.id===id),m=part.pose.matrix;
  const bottom=inPlane(matrix,applyMatrix4(m,{...hole,z:0}));
  const top=inPlane(matrix,applyMatrix4(m,{...hole,z:part.geometry.thicknessMm}));
  const x=shape.a.x-Math.sin(shape.angle)*foot.hole.y,y=shape.a.y+Math.cos(shape.angle)*foot.hole.y;
  if(Math.hypot(top.x-x,top.y-y)>.02||Math.hypot(top.x-bottom.x,top.y-bottom.y)>.02)
   return {status:'unverified',reason:'frame_alignment',fasteners:[]};
  const sign=shape.mountSide || 1;
  const nearZ=sign*(sign===1?top.z:bottom.z),farZ=sign*(sign===1?bottom.z:top.z);
  const seatZ=sign*z+shape.clamp.baseZ,spacerHeight=seatZ-nearZ;
  if(spacerHeight<0||nearZ>sign*z-shape.r-1)
   return {status:'unverified',reason:'barrel_clearance',fasteners:[]};
  fasteners.push({holeId:id,framePartId:part.partId,x:foot.hole.x,y:foot.hole.y,
   frameBottomZ:farZ-sign*z,frameTopZ:nearZ-sign*z,seatZ:shape.clamp.baseZ,spacerHeight,
   diameter:3,headDiameter:5.5,headHeight:2,washerDiameter:6.5,washerThickness:.6,nutDiameter:6.4,nutHeight:2.4});
 }
 return {status:'reference',fasteners};
}
export function assemblySyringeShapes(model,comps,modules,params,points,{flatten=false}={}){
  const items=[];
  for(const c of comps.filter(c=>c.type==='syringe')){
    const plane=flatten?null:planeOf(comps,modules,c),child=plane?(model.orthogonal||[]).find(p=>p.id===plane):null;
    if(plane&&!child)continue;
    const scene=child?.model||model,matrix=child?.matrix||IDENTITY_4;
    const owner=comps.find(o=>o.id===c.b.componentId);
    const rod=(scene.sticks||[]).find(p=>p.id===owner?.id)
      ||(scene.plates||[]).find(p=>owner?.p3&&p.ids?.join(',')===[owner.p1.id,owner.p2.id,owner.p3.id].join(','));
    const shape=syringeShape(c,comps,params,points);if(!shape)continue;
    const rodZ=rod?rod.z+rod.thickness/2:16,mountSide=c.installation?.face==='back'?-1:1;
    let z=rodZ;
    const part=model.materialParts?.find(p=>p.geometry.holes.some(h=>h.id===`${c.id}_clamp_0`));
    if(c.installation&&part){
      const hole=part.geometry.holes.find(h=>h.id===`${c.id}_clamp_0`);
      const surface=inPlane(matrix,applyMatrix4(part.pose.matrix,{...hole,z:mountSide===1?part.geometry.thicknessMm:0})).z;
      const minimum=Math.max(0,shape.r+1+shape.clamp.baseZ);
      const automatic=Math.max(minimum,mountSide*(rodZ-surface)+shape.clamp.baseZ);
      const spacer=c.installation.spacerMm ?? automatic;
      z=surface+mountSide*(spacer-shape.clamp.baseZ);
    }
    shape.mountSide=mountSide;
    items.push({...shape,z,rodZ,alignmentMm:rod?z-rodZ:null,matrix:[...matrix],moduleId:c.moduleId,plane,mount:syringeClampInstallation(model,shape,z,matrix),
      worldA:applyMatrix4(matrix,{...shape.a,z}),worldB:applyMatrix4(matrix,{...shape.b,z}),
      coverage:'appearance_only'});
  }
  return items;
}
