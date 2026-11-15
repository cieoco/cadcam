import assert from 'node:assert/strict';
import {placementFrame,PLACEMENT_PLANES} from '../js/blocks/placement-plane.js';
import {orthogonalMatrix,applyMatrix4,buildOrthogonalChildren} from '../js/blocks3d/orthogonal-3d.js';
import {planeOf} from '../js/blocks/assembly.js';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
import {storedProject} from '../js/blocks/project-envelope.js';
import {createDesignInstance,synchronizeDesignInstances} from '../js/blocks/design-instances.js';
import {placedFaceSelection,placedModuleAxes} from '../js/blocks/face-placement-direction.js';
import {solveFaceMate} from '../js/blocks/face-mate.js';
const work={counter:1,comps:[{id:'Bar',type:'bar',moduleId:'Source',p1:{id:'A',x:0,y:0,type:'fixed'},p2:{id:'B',x:40,y:0,type:'fixed'},fixedLen:true,lenParam:'L'}],modules:[{id:'Source',name:'板',base:'A',outputs:[],mount:null,placementPlane:'xy'}],topo:{params:{L:40},assemblyMembers:['Source']}};
for(const plane of PLACEMENT_PLANES){
 const f=placementFrame(plane),matrix=orthogonalMatrix(f),a=applyMatrix4(matrix,{x:10,y:20,z:0});
 assert.deepEqual(a,plane==='xy'?{x:10,y:20,z:0}:plane==='xz'?{x:10,y:0,z:20}:{x:0,y:10,z:20});
 const cross={x:f.d.y*f.n.z-f.d.z*f.n.y,y:f.d.z*f.n.x-f.d.x*f.n.z,z:f.d.x*f.n.y-f.d.y*f.n.x};assert.deepEqual(cross,f.m);
 const w=structuredClone(work);w.modules[0].placementPlane=plane;assert.equal(planeOf(w.comps,w.modules,'Source'),'Source');
 const saved=storedProject(toSnapshot(w.comps,w.topo,1,{modules:w.modules}));assert.ok(saved.requires.includes('placement-plane-v1'));assert.equal(normalizeSnapshot(saved).modules[0].placementPlane,plane);
 const children=buildOrthogonalChildren({comps:w.comps,modules:w.modules,params:w.topo.params,inputs:{pts:{A:w.comps[0].p1,B:w.comps[0].p2}},mainModel:{},buildModel:i=>({points:i.pts})});assert.equal(children.length,1);assert.deepEqual(children[0].matrix,matrix);
}
const repeated=createDesignInstance(work,'Source',{x:100,y:0});repeated.modules[1].placementPlane='yz';const synced=synchronizeDesignInstances(repeated);assert.equal(synced.modules[0].placementPlane,'xy');assert.equal(synced.modules[1].placementPlane,'yz');
const invalid=toSnapshot(work.comps,work.topo,1,{modules:work.modules});invalid.modules[0].placementPlane='bad';assert.equal(normalizeSnapshot(invalid),null);
console.log('placement planes passed');
for(const host of PLACEMENT_PLANES)for(const child of PLACEMENT_PLANES){
 const selected=placedFaceSelection(host,child);assert.ok(selected.error<1e-10);
 const box={min:{x:-20,y:-10,z:-1.5},max:{x:20,y:10,z:1.5}};
 const mate=solveFaceMate({...selected,hostBox:box,childBox:box});
 const h=orthogonalMatrix(placementFrame(host)),c=orthogonalMatrix(placementFrame(child));
 for(let col=0;col<3;col++)for(let row=0;row<3;row++)assert.ok(Math.abs([0,1,2].reduce((s,k)=>s+h[k*4+row]*mate.rotation[k][col],0)-c[col*4+row])<1e-10,'entering mating preserves the chosen world orientation');
 const w=structuredClone(work);w.modules[0].placementPlane=host;const axes=placedModuleAxes({...w,params:w.topo.params},'Source');assert.equal(placedFaceSelection(axes,child).error,selected.error);
}
console.log('all nine placement-to-mating direction pairs preserved');
