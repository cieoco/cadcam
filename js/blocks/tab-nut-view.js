/** Project a shared home-coordinate machining outline into the current 2D member pose. */
export function tabNutPath(geometry,comp,points,project){
  if(!geometry)return null;
  const a=points[comp.p1.id],b=points[comp.p2.id];if(!a||!b)return null;
  const theta=Math.atan2(b.y-a.y,b.x-a.x)-Math.atan2(comp.p2.y-comp.p1.y,comp.p2.x-comp.p1.x),c=Math.cos(theta),s=Math.sin(theta);
  const move=p=>project({x:a.x+(p.x-comp.p1.x)*c-(p.y-comp.p1.y)*s,y:a.y+(p.x-comp.p1.x)*s+(p.y-comp.p1.y)*c});
  const holes=geometry.holes.map(h=>Array.from({length:48},(_,i)=>({x:h.x+h.r*Math.cos(i*Math.PI/24),y:h.y+h.r*Math.sin(i*Math.PI/24)})));
  return [...geometry.outlines,...geometry.cutouts.map(c=>c.points),...holes].map(r=>r.map(move).map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ')+'Z').join(' ');
}
