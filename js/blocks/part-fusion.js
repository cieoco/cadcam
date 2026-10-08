/** Parametric gear/plate fusion. Source components remain the editable mechanism. */
export const area = ring => ring.reduce((s,p,i)=>{const q=ring[(i+1)%ring.length];return s+p.x*q.y-q.x*p.y;},0)/2;
export function inside(p, ring) {
  let hit=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a=ring[i],b=ring[j];
    if((a.y>p.y)!==(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) hit=!hit;
  }
  return hit;
}
const cross=(a,b)=>a.x*b.y-a.y*b.x, sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y});
const lerp=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const key=p=>`${Math.round(p.x*1e6)},${Math.round(p.y*1e6)}`;

/** Polygon boundary union: split crossings, retain only exterior edges, stitch closed loops. */
export function unionOutlines(input) {
  const rings=input.map(r=>area(r)<0?[...r].reverse():r);
  if(rings.some(r=>r.length<3 || r.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))) throw Error('外形座標無效');
  const edges=rings.flatMap((r,owner)=>r.map((a,i)=>({a,b:r[(i+1)%r.length],owner,ts:[0,1]})));
  const put=(e,t)=>{if(t>=-1e-8 && t<=1+1e-8)e.ts.push(Math.max(0,Math.min(1,t)));};
  for(let i=0;i<edges.length;i++) for(let j=i+1;j<edges.length;j++) {
    const a=edges[i],b=edges[j];if(a.owner===b.owner)continue;
    const r=sub(a.b,a.a),s=sub(b.b,b.a),q=sub(b.a,a.a),d=cross(r,s);
    if(Math.abs(d)>1e-10) {
      const t=cross(q,s)/d,u=cross(q,r)/d;
      if(t>=-1e-8&&t<=1+1e-8&&u>=-1e-8&&u<=1+1e-8){put(a,t);put(b,u);}
    } else if(Math.abs(cross(q,r))<1e-8) {
      const project=(p,e)=>{const v=sub(e.b,e.a),w=sub(p,e.a);return (w.x*v.x+w.y*v.y)/(v.x*v.x+v.y*v.y);};
      put(a,project(b.a,a));put(a,project(b.b,a));put(b,project(a.a,b));put(b,project(a.b,b));
    }
  }
  const boundary=new Map(), occupied=p=>rings.some(r=>inside(p,r));
  for(const e of edges) {
    const ts=[...new Set(e.ts.map(t=>Math.round(t*1e10)/1e10))].sort((a,b)=>a-b);
    for(let i=1;i<ts.length;i++) {
      const a=lerp(e.a,e.b,ts[i-1]),b=lerp(e.a,e.b,ts[i]),d=sub(b,a),len=Math.hypot(d.x,d.y);
      if(len<1e-6)continue;
      const m=lerp(a,b,.5),eps=Math.min(1e-5,len/10),n={x:-d.y/len*eps,y:d.x/len*eps};
      if(occupied({x:m.x+n.x,y:m.y+n.y})&&!occupied({x:m.x-n.x,y:m.y-n.y}))boundary.set(`${key(a)}>${key(b)}`,{a,b});
    }
  }
  const remaining=[...boundary.values()], loops=[];
  while(remaining.length) {
    const first=remaining.pop(),ring=[first.a],start=key(first.a);let end=first.b;
    while(key(end)!==start) {
      ring.push(end);const i=remaining.findIndex(e=>key(e.a)===key(end));
      if(i<0)throw Error('合成外框未閉合，請調整重疊位置');
      end=remaining.splice(i,1)[0].b;
    }
    if(Math.abs(area(ring))>1e-5)loops.push(ring);
  }
  return loops;
}

export function fusionPartner(comps, plate) {return comps.find(c=>c.id===plate?.fusedWith && c.type==='gear');}
export function fusionCandidates(comps, plate) {
  if(plate?.type!=='triangle')return [];
  const ids=[plate.p1?.id,plate.p2?.id,plate.p3?.id];
  return comps.filter(c=>c.type==='gear' && c.moduleId===plate.moduleId && ids.includes(c.p1?.id)&&ids.includes(c.p2?.id)
    && !comps.some(p=>p.id!==plate.id && p.fusedWith===c.id)
    && !comps.some(p=>p.type==='rack' && p.pinion===c.id));
}
export function transformFusion(geometry, gear, points) {
  const a=points[gear.p1.id] || gear.p1,b=points[gear.p2.id] || gear.p2;
  const theta=Math.atan2(b.y-a.y,b.x-a.x)-Math.atan2(gear.p2.y-gear.p1.y,gear.p2.x-gear.p1.x);
  const c=Math.cos(theta),s=Math.sin(theta),move=p=>({x:a.x+p.x*c-p.y*s,y:a.y+p.x*s+p.y*c});
  return {...geometry,outline:geometry.outline.map(move),holes:geometry.holes.map(h=>({...h,...move(h)})),cutouts:geometry.cutouts.map(h=>({...h,points:h.points.map(move)}))};
}
