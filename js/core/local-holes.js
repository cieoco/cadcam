/** Optional rigid-body local holes. Expansion uses existing triangle constraints. */
export const localHoles=c=>['bar','triangle','gear'].includes(c?.type)?(c.holes || []).filter(h=>Number.isFinite(h.u)&&Number.isFinite(h.v)):[];
export const holeSide=c=>c.standardBlank&&c.p3&&((c.p2.x-c.p1.x)*(c.p3.y-c.p1.y)-(c.p2.y-c.p1.y)*(c.p3.x-c.p1.x))<0?-1:1;
export function holeWorld(c,h){const a=c.p1,b=c.p2,v=h.v*holeSide(c),L=Math.hypot(b.x-a.x,b.y-a.y);if(!L)return {x:a.x,y:a.y};const ux=(b.x-a.x)/L,uy=(b.y-a.y)/L;return {x:a.x+h.u*ux-v*uy,y:a.y+h.u*uy+v*ux};}
export function expandLocalHoles(comps,params){
 const next=comps.map(c=>{const local=new Set(localHoles(c));return local.size?{...c,holes:(c.holes || []).filter(h=>!local.has(h))}:c;}),values={...params},aux=[];
 for(const c of comps)for(const h of localHoles(c)){
  const g=c.type==='gear' ? c.pinRadiusParam || c.pinRadius || Math.hypot(c.p2.x-c.p1.x,c.p2.y-c.p1.y) : c.type==='bar'?c.lenParam:c.gParam;
  const base=Number(params[g] ?? g);
  const a=Math.hypot(h.u,h.v),b=Math.hypot(h.u-base,h.v);values[a]=a;values[b]=b;
  const item={type:'triangle',id:`localHole.${c.id}.${h.id}`,p1:c.p1,p2:c.p2,p3:{id:h.id,type:h.type==='fixed'?'fixed':'floating',...holeWorld(c,h)},gParam:g,r1Param:a,r2Param:b,sign:h.v*holeSide(c)<0?-1:1};
  aux.push(item);next.push(item);
 }
 return {comps:next,params:values,aux};
}

// How many places under the roots mention each string (ids included): the one "who mentions this id" count.
export const idCounts=(...a)=>{const n=new Map,w=v=>{if(typeof v=='string')n.set(v,(n.get(v)||0)+1);else if(v&&typeof v=='object')Object.values(v).forEach(w);};w(a);return n;};

/** Dense standard grids need constraints only at referenced or grounded holes. */
export function passiveLocalHoles(comps,topology){
 const counts=idCounts(comps,{...topology,_wizard_data:null});
 const passive=[];
 const reduced=comps.map(c=>{
  if(!c.standardBlank||localHoles(c).length<128)return c;
  const holes=localHoles(c).filter(h=>h.type==='floating'&&!h.physicalMotor&&counts.get(h.id)===1),skip=new Set(holes);
  if(holes.length)passive.push({p1:c.p1.id,p2:c.p2.id,side:holeSide(c),holes});
  return {...c,holes:(c.holes||[]).filter(h=>!skip.has(h))};
 });
 return {comps:reduced,passive};
}
export function restorePassiveHoles(groups,points){
 for(const c of groups||[]){const a=points[c.p1],b=points[c.p2];if(!a||!b)continue;const L=Math.hypot(b.x-a.x,b.y-a.y);if(!L)continue;
  const ux=(b.x-a.x)/L,uy=(b.y-a.y)/L;
  for(const h of c.holes)points[h.id]={x:a.x+h.u*ux-h.v*c.side*uy,y:a.y+h.u*uy+h.v*c.side*ux};
 }
}

// Retain occupied shaft references for kinematics only; never re-enable machining holes.
export function withMotorShaftHoles(components){return components.map(c=>{const hs=(c.standardBlank?.mountHoles||[]).filter(h=>!components.some(p=>p.id===`localHole.${c.id}.${h.id}`)&&!localHoles(c).some(p=>p.id===h.id)&&components.some(m=>m.motorMount?.frameBody===c.id&&m.motorMount.center===h.id));return hs.length?{...c,holes:[...(c.holes||[]),...hs]}:c;});}
