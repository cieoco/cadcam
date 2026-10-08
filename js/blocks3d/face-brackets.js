/** Bracket solids and drilling share the same validated wing/axis geometry. */
export function faceBracketBoxes(plan) {
  if(!plan?.ok)return [];
  const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
  const unit=v=>{const n=Math.hypot(v.x,v.y,v.z);return {x:v.x/n,y:v.y/n,z:v.z/n};};
  const center=r=>({x:r.reduce((s,p)=>s+p.x,0)/r.length,y:r.reduce((s,p)=>s+p.y,0)/r.length,z:r.reduce((s,p)=>s+p.z,0)/r.length});
  return plan.brackets.flatMap(b=>b.wings.map((ring,i)=>{
    const c=center(ring),a=sub(ring[1],ring[0]),d=sub(ring[3],ring[0]);
    const u=unit(a),v=unit(d),n={x:u.y*v.z-u.z*v.y,y:u.z*v.x-u.x*v.z,z:u.x*v.y-u.y*v.x};
    const toward=sub(center(b.wings[1-i]),c);
    if(n.x*toward.x+n.y*toward.y+n.z*toward.z<0){n.x*=-1;n.y*=-1;n.z*=-1;}
    const thickness=1.2,shift=p=>({x:p.x+n.x*thickness/2,y:p.y+n.y*thickness/2,z:p.z+n.z*thickness/2});
    return {center:shift(c),axes:[u,v,n],size:{x:Math.hypot(a.x,a.y,a.z),y:Math.hypot(d.x,d.y,d.z),z:thickness},
      hole:{center:shift(i===0?b.hostHole:b.childHoleWorld),axis:n,diameterMm:3.2}};
  }));
}
