/** Single solved pose: exact polygon material, conservative circular bounds. No S/DOM. */
import {normalizeMaterialVoids,materialCircleContour} from './material-voids.js';
import {ShapeUtils} from '../vendor/shape-utils.js';
import {applyMatrix4} from '../blocks3d/orthogonal-3d.js';
export const MATERIAL_TOLERANCE_MM=1e-7;
const E=MATERIAL_TOLERANCE_MM,N=64;
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const unit=a=>{const l=Math.hypot(a.x,a.y,a.z);return l>1e-10?{x:a.x/l,y:a.y/l,z:a.z/l}:null;};
const axis=m=>({x:m[8],y:m[9],z:m[10]});
const area=r=>Math.abs(ShapeUtils.area(r));
const orient=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const inside=(p,r)=>{let yes=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)yes=!yes;}return yes;};
const intersects=(a,b,c,d)=>orient(a,b,c)*orient(a,b,d)<-E*E&&orient(c,d,a)*orient(c,d,b)<-E*E;
const distanceSegment=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);};
function ringOf(raw){
 const r=raw.map(p=>({x:Number(p.x),y:Number(p.y)}));
 if(r.length>1&&Math.hypot(r[0].x-r.at(-1).x,r[0].y-r.at(-1).y)<E)r.pop();
 if(r.length<3||r.some(p=>!Number.isFinite(p.x+p.y))||area(r)<E)throw Error('invalid_outline');
 for(let i=0;i<r.length;i++)for(let j=i+1;j<r.length;j++)if(j!==i+1&&!(i===0&&j===r.length-1)&&intersects(r[i],r[(i+1)%r.length],r[j],r[(j+1)%r.length]))throw Error('self_intersecting_outline');
 return r;
}
const circle=materialCircleContour;
function triangles(ring,holes){
 const contour=ring.map(p=>({x:p.x,y:p.y})),cuts=holes.map(r=>r.map(p=>({x:p.x,y:p.y})));
 const faces=ShapeUtils.triangulateShape(contour,cuts),points=[...contour,...cuts.flat()];
 const tris=faces.map(f=>f.map(i=>({x:points[i].x,y:points[i].y}))).filter(t=>area(t)>E*E);
 const expected=area(ring)-holes.reduce((n,r)=>n+area(r),0),actual=tris.reduce((n,t)=>n+area(t),0);
 if(!tris.length||expected<=E||Math.abs(expected-actual)>Math.max(1e-5,expected*1e-8))throw Error('material_triangulation_failed');
 return tris;
}
const localCache=new WeakMap();
// Preview candidates clone their geometry. Reuse identical validated material,
// but bound both entry count and mesh size; pose/pair checks always run anew.
const materialCache=new Map(),MAX_MATERIALS=16,MAX_SLABS=125000;let cachedSlabs=0;
// Slabs contain coordinates only. Hole/connection IDs remain on each current
// part for named fastener checks and must never be read from this cache.
const materialKey=g=>JSON.stringify([g.kind,g.thicknessMm,g.outlines,g.cutouts?.map(c=>c.points),g.holes?.map(h=>[h.x,h.y,h.r]),g.solid]);
function localMaterial(g){
 if(localCache.has(g))return localCache.get(g);
 // JSON serializes non-finite numbers as null. Never let an invalid clone
 // reuse a valid contour that happens to contain a coercible null coordinate.
 const finite=Number.isFinite(g.thicknessMm)&&g.outlines?.every(r=>r.every(p=>Number.isFinite(Number(p.x))&&Number.isFinite(Number(p.y))))&&(g.cutouts||[]).every(c=>c.points.every(p=>Number.isFinite(Number(p.x))&&Number.isFinite(Number(p.y))))&&(g.holes||[]).every(h=>[h.x,h.y,h.r].every(Number.isFinite))&&(!g.solid?.profile||g.solid.profile.every(row=>row.every(Number.isFinite)));
 const key=finite?materialKey(g):null,cached=key&&materialCache.get(key);
 if(cached){materialCache.delete(key);materialCache.set(key,cached);localCache.set(g,cached);return cached;}
 if(typeof g.kind!=='string')throw Error('material_kind_missing');
 if(!(g.thicknessMm>E)||!g.outlines?.length)throw Error('material_geometry_missing');
 const rings=g.outlines.map(ringOf),cuts=(g.cutouts || []).map(c=>ringOf(c.points)),holes=g.holes || [];
 for(const h of holes)if(!Number.isFinite(h.x+h.y+h.r)||!(h.r>0))throw Error('invalid_hole');
 for(let i=0;i<rings.length;i++)for(let j=i+1;j<rings.length;j++)if(inside(rings[i][0],rings[j])||inside(rings[j][0],rings[i])||rings[i].some((a,k)=>rings[j].some((b,l)=>intersects(a,rings[i][(k+1)%rings[i].length],b,rings[j][(l+1)%rings[j].length]))))throw Error('overlapping_material_islands');
 const bound=(certain)=>{
  const slabs=[];
  if(g.solid?.kind==='pan-head'){
   const profiles=g.solid.profile.filter(([r])=>r>0).sort((a,b)=>a[1]-b[1]);
   for(let i=1;i<profiles.length;i++){
    const [ra,z0]=profiles[i-1],[rb,z1]=profiles[i];if(z1-z0<=E)continue;
    const radius=certain?Math.min(ra,rb):Math.max(ra,rb);
    for(const triangle of triangles(circle({x:0,y:0,r:radius},!certain),[]))slabs.push({triangle,z0,z1});
   }
   return slabs;
  }
  for(const ring of rings){
   const owned=holes.filter(h=>inside(h,ring)),polys=cuts.filter(r=>inside(r[0],ring));
   for(const h of owned)if(ring.some((a,i)=>distanceSegment(h,a,ring[(i+1)%ring.length])<h.r-E))throw Error('hole_crosses_material_edge');
   const rawRemoved=[...polys,...owned.map(h=>circle(h,certain))];
   const removed=normalizeMaterialVoids(rawRemoved);
   for(const c of removed)if(c.some(p=>!inside(p,ring)))throw Error('cutout_crosses_material_edge');

   let outline=ring;
   if(g.kind==='screw'||g.kind==='pin'){const r=Math.max(...ring.map(p=>Math.hypot(p.x,p.y)));outline=circle({x:0,y:0,r},!certain);}
   for(const triangle of triangles(outline,removed))slabs.push({triangle,z0:0,z1:g.thicknessMm});
  }
  if(holes.some(h=>!rings.some(r=>inside(h,r)))||cuts.some(c=>!rings.some(r=>inside(c[0],r))))throw Error('unassigned_machining_feature');
  return slabs;
 };
 const result={outer:bound(false),inner:bound(true),curved:holes.length>0||g.kind==='pin'||g.kind.startsWith('screw')};
 const size=result.outer.length+result.inner.length;
 if(key&&size<=MAX_SLABS){while(materialCache.size>=MAX_MATERIALS||cachedSlabs+size>MAX_SLABS){const first=materialCache.keys().next().value,old=materialCache.get(first);cachedSlabs-=old.outer.length+old.inner.length;materialCache.delete(first);}materialCache.set(key,result);cachedSlabs+=size;}
 localCache.set(g,result);return result;
}
const boxOf=vertices=>{const min={x:Infinity,y:Infinity,z:Infinity},max={x:-Infinity,y:-Infinity,z:-Infinity};for(const p of vertices){if(p.x<min.x)min.x=p.x;if(p.y<min.y)min.y=p.y;if(p.z<min.z)min.z=p.z;if(p.x>max.x)max.x=p.x;if(p.y>max.y)max.y=p.y;if(p.z>max.z)max.z=p.z;}return {min,max};};
const boxOverlap=(a,b)=>['x','y','z'].every(k=>Math.min(a.max[k],b.max[k])-Math.max(a.min[k],b.min[k])>E);
function prism(slab,m){
 const vertices=[...slab.triangle.map(p=>applyMatrix4(m,{...p,z:slab.z0})),...slab.triangle.map(p=>applyMatrix4(m,{...p,z:slab.z1}))];
 const edges=[sub(vertices[1],vertices[0]),sub(vertices[2],vertices[1]),sub(vertices[0],vertices[2]),sub(vertices[3],vertices[0])];
 const normals=[cross(edges[0],edges[1]),...edges.slice(0,3).map(e=>cross(e,edges[3]))].map(unit).filter(Boolean);
 return {vertices,edges,normals,box:boxOf(vertices)};
}
function sat(a,b){
 if(!boxOverlap(a.box,b.box))return false;
 const axes=[...a.normals,...b.normals,...a.edges.flatMap(e=>b.edges.map(f=>unit(cross(e,f))).filter(Boolean))];
 let depth=Infinity;
 for(const n of axes){const aa=a.vertices.map(v=>dot(v,n)),bb=b.vertices.map(v=>dot(v,n));const overlap=Math.min(Math.max(...aa),Math.max(...bb))-Math.max(Math.min(...aa),Math.min(...bb));if(overlap<=E)return false;depth=Math.min(depth,overlap);}
 return depth;
}
const centerOfOverlap=(a,b)=>Object.fromEntries(['x','y','z'].map(k=>[k,(Math.max(a.box.min[k],b.box.min[k])+Math.min(a.box.max[k],b.box.max[k]))/2]));
const faceIndices=[[0,2,1],[3,4,5],[0,1,4,3],[1,2,5,4],[2,0,3,5]];
const edgeIndices=[[0,1],[1,2],[2,0],[3,4],[4,5],[5,3],[0,3],[1,4],[2,5]];
function witness(a,b){
 const planes=p=>faceIndices.map(ids=>{const origin=p.vertices[ids[0]],raw=unit(cross(sub(p.vertices[ids[1]],origin),sub(p.vertices[ids[2]],origin))),centroid=Object.fromEntries(['x','y','z'].map(k=>[k,p.vertices.reduce((s,v)=>s+v[k],0)/6]));return {origin,n:dot(raw,sub(centroid,origin))>0?{x:-raw.x,y:-raw.y,z:-raw.z}:raw};});
 const ap=planes(a),bp=planes(b),inside=p=>[...ap,...bp].every(f=>dot(f.n,sub(p,f.origin))<=1e-6);
 const candidates=[...a.vertices,...b.vertices].filter(inside);
 for(const [p,other] of [[a,bp],[b,ap]])for(const [i,j] of edgeIndices)for(const f of other){const u=p.vertices[i],v=p.vertices[j],du=dot(f.n,sub(u,f.origin)),dv=dot(f.n,sub(v,f.origin));if(Math.abs(du-dv)<E||du*dv>0)continue;const t=du/(du-dv),q={x:u.x+(v.x-u.x)*t,y:u.y+(v.y-u.y)*t,z:u.z+(v.z-u.z)*t};if(inside(q))candidates.push(q);}
 return candidates.length?Object.fromEntries(['x','y','z'].map(k=>[k,candidates.reduce((s,p)=>s+p[k],0)/candidates.length])):centerOfOverlap(a,b);
}
// Broad phase only: keep original prism order and the same SAT/witness results.
const prismTrees=new WeakMap();
function prismTree(prisms){
 if(prismTrees.has(prisms))return prismTrees.get(prisms);
 const build=rows=>{const box=boxOf((function*(){for(const {p} of rows){yield p.box.min;yield p.box.max;}})());
  if(rows.length<=12)return {box,rows};
  const axis=['x','y','z'].sort((a,b)=>(box.max[b]-box.min[b])-(box.max[a]-box.min[a]))[0];
  rows.sort((a,b)=>(a.p.box.min[axis]+a.p.box.max[axis])-(b.p.box.min[axis]+b.p.box.max[axis])||a.i-b.i);
  const mid=Math.floor(rows.length/2);return {box,left:build(rows.slice(0,mid)),right:build(rows.slice(mid))};
 };const tree=build(prisms.map((p,i)=>({p,i})));prismTrees.set(prisms,tree);return tree;
}
function collision(a,b){
 const tree=a.length*b.length>4096?prismTree(b):null;
 const query=(node,box,out)=>{if(!boxOverlap(node.box,box))return;if(node.rows){for(const r of node.rows)if(boxOverlap(r.p.box,box))out.push(r);}else{query(node.left,box,out);query(node.right,box,out);}};
 for(const p of a){let candidates=b;if(tree){const rows=[];query(tree,p.box,rows);rows.sort((a,b)=>a.i-b.i);candidates=rows.map(r=>r.p);}
  for(const q of candidates){const depth=sat(p,q);if(depth)return {position:witness(p,q),minProjectionOverlapMm:depth};}
 }return null;
}
function prepared(p){
 const m=p.pose?.matrix;
 if(!Array.isArray(m)||m.length!==16||!m.every(Number.isFinite))throw Error('invalid_world_pose');
 const axes=[{x:m[0],y:m[1],z:m[2]},{x:m[4],y:m[5],z:m[6]},axis(m)];
 if(axes.some(n=>Math.abs(dot(n,n)-1)>1e-6)||Math.abs(dot(axes[0],axes[1]))>1e-6||Math.abs(dot(axes[0],axes[2]))>1e-6||Math.abs(dot(axes[1],axes[2]))>1e-6)throw Error('non_rigid_world_pose');
 const l=localMaterial(p.geometry),outer=l.outer.map(s=>prism(s,m));let inner;
 return {part:p,outer,get inner(){return inner ||= l.inner.map(s=>prism(s,m));},box:boxOf((function*(){for(const prism of outer){yield prism.box.min;yield prism.box.max;}})())};
}
const hardware=p=>['bracket-wing','screw','screw-head','nut','washer','pin'].includes(p.geometry.kind);
const pairedId=p=>p.holePairId || p.geometry.holePairId;
function namedShaft(a,b){
 const screw=['screw','pin'].includes(a.geometry.kind)?a:['screw','pin'].includes(b.geometry.kind)?b:null,stock=screw===a?b:a;
 if(!screw||!pairedId(screw))return null;
 const hole=stock.geometry.holes.find(h=>h.holePairId===pairedId(screw));if(!hole)return null;
 const m=screw.pose.matrix,sm=stock.pose.matrix,n=axis(m),normal=axis(sm),origin={x:m[12],y:m[13],z:m[14]},center=applyMatrix4(sm,{...hole,z:0}),d=sub(origin,center),along=dot(d,normal);
 const radius=Math.max(...screw.geometry.outlines.flat().map(p=>Math.hypot(p.x,p.y)));
 const lateral=Math.hypot(d.x-normal.x*along,d.y-normal.y*along,d.z-normal.z*along);
 const validAxis=Math.abs(Math.abs(dot(n,normal))-1)<1e-6&&(!hole.axis || Math.abs(Math.abs(hole.axis.z)-1)<1e-6);
 if(!validAxis)return {status:'fail',reason:'paired_fastener_axis_invalid',position:center};
 if(lateral+radius>hole.r+1e-6)return {status:'fail',reason:'paired_fastener_hits_hole_wall',position:center};
 // The head seat must remain outside the stock, including thread engagement.
 if(stock.geometry.kind!=='bracket-wing'&&along>E&&along<stock.geometry.thicknessMm-E)return {status:'fail',reason:'paired_fastener_head_inside_stock',position:origin};
 const end=along+dot(n,normal)*screw.geometry.thicknessMm;
 if(Math.max(along,end)<stock.geometry.thicknessMm-1e-6||Math.min(along,end)>1e-6)return {status:'fail',reason:'paired_fastener_does_not_reach_hole',position:center};
 return {status:'pass',reason:'named_coaxial_fastener',holePairId:hole.holePairId};
}
function legitimateBend(a,b){
 if(a.geometry.kind!=='bracket-wing'||b.geometry.kind!=='bracket-wing'||!a.bracketId||a.bracketId!==b.bracketId||a.connectionId!==b.connectionId)return false;
 const ma=a.pose.matrix,mb=b.pose.matrix,au={x:ma[0],y:ma[1],z:ma[2]},bu={x:mb[0],y:mb[1],z:mb[2]};
 if(Math.abs(Math.abs(dot(au,bu))-1)>1e-6||Math.abs(dot(axis(ma),axis(mb)))>1e-6)return false;
 const vertices=p=>p.geometry.outlines.flat().flatMap(q=>[applyMatrix4(p.pose.matrix,{...q,z:0}),applyMatrix4(p.pose.matrix,{...q,z:p.geometry.thicknessMm})]);
 const av=vertices(a),bv=vertices(b),axes=[au,{x:ma[4],y:ma[5],z:ma[6]},axis(ma)];
 const overlaps=axes.map(n=>{const aa=av.map(v=>dot(v,n)),bb=bv.map(v=>dot(v,n));return Math.max(0,Math.min(Math.max(...aa),Math.max(...bb))-Math.max(Math.min(...aa),Math.min(...bb)));});
 const width=Math.max(...a.geometry.outlines.flat().map(p=>p.x))-Math.min(...a.geometry.outlines.flat().map(p=>p.x));
 if(overlaps.reduce((v,n)=>v*n,1)>width*a.geometry.thicknessMm*b.geometry.thicknessMm+1e-6)return false;
 for(const [p,other] of [[a,b],[b,a]]){const m=p.pose.matrix,n={x:m[4],y:m[5],z:m[6]},vs=vertices(p).map(v=>dot(v,n)),os=vertices(other).map(v=>dot(v,n)),lo=Math.max(Math.min(...vs),Math.min(...os)),hi=Math.min(Math.max(...vs),Math.max(...os));if(hi-lo>E&&Math.min(lo-Math.min(...vs),Math.max(...vs)-hi)>other.geometry.thicknessMm+1e-6)return false;}
 return true;
}
/** Report covers cross-module material plus all connection hardware neighbors. */
export function checkMaterialInterference({materialParts=[],geometryDiagnostics=[],geometryKey='',poseRevision=0}={}){
 const pairs=[],findings=[],unsupported=geometryDiagnostics.map(d=>({...d,status:'not_supported'})),ready=[];
 for(const part of materialParts)try{ready.push(prepared(part));}catch(e){unsupported.push({status:'not_supported',partId:part.partId,pickKey:part.pickKey,reason:e.message});}
 for(let i=0;i<ready.length;i++)for(let j=i+1;j<ready.length;j++){
  const a=ready[i],b=ready[j],pa=a.part,pb=b.part;
  if(pa.moduleId===pb.moduleId&&!hardware(pa)&&!hardware(pb))continue; // Existing in-plane checker remains responsible.
  const row={pairId:[pa.partId,pb.partId].sort().join('|'),partIds:[pa.partId,pb.partId],pickKeys:[pa.pickKey,pb.pickKey]};
  if((pa.geometry.kind.startsWith('screw')&&pb.geometry.kind.startsWith('screw')&&pairedId(pa)&&pairedId(pa)===pairedId(pb)&&pa.partId.replace(/\/head$/,'')===pb.partId.replace(/\/head$/,''))||legitimateBend(pa,pb)){pairs.push({...row,status:'pass',reason:'same_hardware_legal_contact'});continue;}
  const named=namedShaft(pa,pb);if(named){const result={...row,...named};pairs.push(result);if(result.status==='fail')findings.push(result);continue;}
  if(!boxOverlap(a.box,b.box)){pairs.push({...row,status:'pass',reason:'disjoint_material_bounds'});continue;}
  const possible=collision(a.outer,b.outer);
  if(!possible){pairs.push({...row,status:'pass',reason:'no_positive_material_volume'});continue;}
  const certain=collision(a.inner,b.inner);
  const result={...row,status:certain?'fail':'not_supported',reason:certain?'material_penetration':'circular_boundary_uncertain',...(certain || possible)};
  pairs.push(result);if(certain)findings.push(result);else unsupported.push(result);
 }
 return {status:findings.length?'fail':unsupported.length?'not_supported':materialParts.length?'pass':'not_checked',geometryKey,poseRevision,pairs,findings,coverage:{scope:'single_pose_cross_module_and_connection_hardware',checkedPartIds:ready.map(p=>p.part.partId),notSupported:unsupported,pairsChecked:pairs.length}};
}
