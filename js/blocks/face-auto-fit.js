import { solveFaceMate, transformMatePoint } from './face-mate.js';

const broad = face => face === 'top' || face === 'bottom';
const dot = (a,b) => a.x*b.x+a.y*b.y+a.z*b.z;
const inside = (p, rings) => rings.some(ring => {
  let hit=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a=ring[i],b=ring[j],dx=b.x-a.x,dy=b.y-a.y;
    const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy || 1)));
    if(Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)<1e-6)return true;
    if((a.y>p.y)!==(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)hit=!hit;
  }
  return hit;
});

/** Edge-to-stock-face contact, never substitute the other board's edge or drill location. */
export function autoFitFaces(host, child, selection) {
  const solve = value => solveFaceMate({ ...value, hostBox: host.box, childBox: child.box });
  const original=solve(selection);
  if(!original.ok)return original;
  if(broad(selection.hostFace) === broad(selection.childFace))return {
    ok:false,reason:'直角貼齊需要一個板面與一個板邊；請選上／下面搭配前／後／左／右面。'
  };
  // The selected face normals oppose each other. This edge/face pairing makes the
  // stock planes perpendicular, including arbitrary in-plane rotation.
  const next={...selection,gap:0};
  const mate=solve(next);
  if(!mate.ok || Math.abs(mate.rotation[2][2])>1e-6)return {ok:false,reason:'此選面無法形成板材直角貼合'};
  const edgeIsHost=!broad(selection.hostFace);
  const edge=edgeIsHost?host:child, face=edgeIsHost?mate.host:mate.child;
  const target=edgeIsHost?child:host;
  if(!edge.outlines?.length || !target.outlines?.length)return {ok:false,reason:'缺少接合板輪廓'};
  const inverse=p=>{const q={x:p.x-mate.translation.x,y:p.y-mate.translation.y,z:p.z-mate.translation.z};return {
    x:mate.rotation[0][0]*q.x+mate.rotation[1][0]*q.y+mate.rotation[2][0]*q.z,
    y:mate.rotation[0][1]*q.x+mate.rotation[1][1]*q.y+mate.rotation[2][1]*q.z
  };};
  const toTarget=p=>edgeIsHost?inverse(p):transformMatePoint(mate,p);
  // Require an actual length of edge to touch material, not just empty box space.
  let contact=false;
  for(const ring of edge.outlines)for(let i=0;i<ring.length;i++) {
    const a={...ring[i],z:0},b={...ring[(i+1)%ring.length],z:0};
    if(Math.abs(dot(a,face.n)-dot(face.center,face.n))>1e-5 || Math.abs(dot(b,face.n)-dot(face.center,face.n))>1e-5)continue;
    for(let t=.1;t<1;t+=.1) {
      const p=toTarget({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:0});
      if(inside(p,target.outlines) && !(target.cutouts || []).some(c=>inside(p,[c.points])))contact=true;
    }
  }
  if(!contact && [next.offsetU,next.offsetV,next.alignU,next.alignV].some(v=>v))return autoFitFaces(host,child,{...next,offsetU:0,offsetV:0,alignU:0,alignV:0});
  if(!contact)return {ok:false,reason:'選定板邊未對到另一板的材料，請調整左右／上下位置或改選板邊。'};
  return {ok:true,selection:next,mate};
}
