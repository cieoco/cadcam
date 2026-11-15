/** Read actual, saved rigid contacts. Never move a board to make a joint fit. */
import {planTabNutGeometry,tabNutEdge,segmentDistance} from './tab-nut-geometry.js';
import {transformMatePoint} from './face-mate.js';
import {inside} from './part-fusion.js';
import {isHoleUsed} from './used-holes.js';
import {idCounts} from '../core/local-holes.js';
import {isFixedMountPart} from './part-types.js';

const axes=['x','y','z'],epsilon=1e-5;
const identity=()=>({rotation:[[1,0,0],[0,1,0],[0,0,1]],translation:{x:0,y:0,z:0}});
export function inverseTabFace(face){
 const rotation=face.rotation[0].map((_,i)=>face.rotation.map(r=>r[i]));
 const translation=Object.fromEntries(axes.map((k,i)=>[k,-rotation[i].reduce((s,v,j)=>s+v*face.translation[axes[j]],0)]));
 return {rotation,translation};
}
function compose(a,b){return {rotation:a.rotation.map(row=>b.rotation[0].map((_,j)=>row.reduce((s,v,k)=>s+v*b.rotation[k][j],0))),translation:transformMatePoint(a,b.translation)};}
/** Only fixed face-mounted chains with the same root may gain extra physical contacts. */
export function tabModulePose(modules,id,comps,seen=new Set()){
 if(seen.has(id))return null;seen.add(id);const m=modules.find(m=>m.id===id);if(!m)return null;
 if(!m.mount)return {...identity(),root:id};
 if(!m.mount.face)return null;
 const output=modules.find(h=>h.id===m.mount.to.module)?.outputs?.find(o=>o.id===m.mount.to.output);
 if(!comps?.some(c=>c.id===output?.body?.id&&isFixedMountPart(c)))return null;
 const parent=tabModulePose(modules,m.mount.to.module,comps,seen);if(!parent)return null;
 return {...compose(parent,m.mount.face),root:parent.root};
}
export function relativeTabFace(modules,hostId,childId,comps){
 const a=tabModulePose(modules,hostId,comps),b=tabModulePose(modules,childId,comps);
 return a&&b&&a.root===b.root?compose(inverseTabFace(a),b):null;
}
export function actualTabContact(host,child,face){
 if(Math.abs(face.rotation?.[2]?.[2])>epsilon)return null;
 const find=(h,c,f,reversed)=>{
  const matches=[];
  for(const childFace of ['front','back','left','right']){
   const edge=tabNutEdge(c,childFace);if(!edge)continue;
   const p=transformMatePoint(f,{...edge.a,z:0}),q=transformMatePoint(f,{...edge.b,z:0});
   const inward=f.rotation[2][0]*edge.v.x+f.rotation[2][1]*edge.v.y;
   for(const hostFace of ['top','bottom']){const z=h.box[hostFace==='top'?'max':'min'].z,sign=hostFace==='top'?1:-1;
    if(Math.abs(p.z-z)<epsilon&&Math.abs(q.z-z)<epsilon&&inward*sign>1-epsilon)matches.push({host:h,child:c,reversed,face:{...f,selection:{...face.selection,hostFace,childFace,gap:0}}});
   }
  }return matches;
 };
 const candidates=[...find(host,child,face,false),...find(child,host,inverseTabFace(face),true)];
 return candidates.length===1?candidates[0]:null;
}
function omittable(surface,comps,modules,params){
 const c=comps.find(c=>c.id===surface.compId);if(!c?.standardBlank)return new Set();
 const special=new Set((c.standardBlank.mountHoles||[]).map(h=>h.id));
 // Identity maps describe a copy; they are not physical uses of every grid hole.
 const physicalModules=modules.map(({designInstance,...m})=>m),use=idCounts(comps,physicalModules);
 return new Set((c.holes||[]).filter(h=>/_H\d+_\d+(?:_|$)/.test(h.id)&&h.u%8===0&&h.v%8===0&&h.diameter===3.2&&!special.has(h.id)&&!isHoleUsed(c,h,comps,{modules:physicalModules,params,use})).map(h=>h.id));
}
const near=(h,r,web)=>inside(h,r)||r.some((a,i)=>segmentDistance(h,a,r[(i+1)%r.length])<(h.r||h.diameterMm/2)+web-1e-6);
/** Grid-hole suppression is derived machining data, not removal of editable points. */
export function planActualTabContact({host,child,face,connectionId,settings,comps,modules,params}){
 const contact=actualTabContact(host,child,face);
 if(!contact)return {ok:false,reason:'目前兩板沒有唯一的直邊與板面垂直接觸；保留位置，請先調整定位。',connectionId};
 const surfaces={host:contact.host,child:contact.child},eligible={};
 for(const role of ['host','child'])eligible[role]=omittable(surfaces[role],comps,modules,params);
 const trimmed=role=>({...surfaces[role],holes:surfaces[role].holes.filter(h=>!eligible[role].has(h.id))});
 const plan=planTabNutGeometry({host:trimmed('host'),child:trimmed('child'),face:contact.face,settings,connectionId});
 if(!plan.ok)return {...plan,...surfaces};
 plan.omittedHoles={host:[],child:[]};
 for(const role of ['host','child']){
  const base=surfaces[role],g=plan[role+'Geometry'],added=g.holes.filter(h=>!base.holes.some(b=>b.id===h.id&&b.x===h.x&&b.y===h.y)),removed=new Set(base.holes.filter(h=>eligible[role].has(h.id)&&plan.features[role].some(r=>near(h,r,plan.settings.minWebMm))).map(h=>h.id));
  g.holes=[...structuredClone(base.holes.filter(h=>!removed.has(h.id))),...added];
  plan.omittedHoles[role]=[...removed];
 }
 return {...plan,...surfaces,actualContact:true,reversed:contact.reversed};
}
