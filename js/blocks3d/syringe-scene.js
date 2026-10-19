import {syringeShape} from '../blocks/syringe-shape.js';
import {planeOf} from '../blocks/assembly.js';
import {IDENTITY_4,applyMatrix4} from './orthogonal-3d.js';

// Read-only appearance adapter. Solved x/y are in the owning assembly plane;
// child matrices already include ancestors. Never apply the host transform twice.
// The plunger lies on its rod's centre plane. Clamp seating/fasteners are unverified.
export function assemblySyringeShapes(model,comps,modules,params,points){
  const items=[];
  for(const c of comps.filter(c=>c.type==='syringe')){
    const plane=planeOf(comps,modules,c),child=plane?(model.orthogonal||[]).find(p=>p.id===plane):null;
    if(plane&&!child)continue;
    const scene=child?.model||model,matrix=child?.matrix||IDENTITY_4;
    const owner=comps.find(o=>o.id===c.b.componentId);
    const rod=(scene.sticks||[]).find(p=>p.id===owner?.id)
      ||(scene.plates||[]).find(p=>owner?.p3&&p.ids?.join(',')===[owner.p1.id,owner.p2.id,owner.p3.id].join(','));
    const shape=syringeShape(c,comps,params,points);if(!shape)continue;
    const z=rod?rod.z+rod.thickness/2:16;
    items.push({...shape,z,matrix:[...matrix],moduleId:c.moduleId,plane,
      worldA:applyMatrix4(matrix,{...shape.a,z}),worldB:applyMatrix4(matrix,{...shape.b,z}),
      coverage:'appearance_only'});
  }
  return items;
}
