/** Display-only ink. Never add these polygons to the fabrication catalog. */
export function diskOrientationMark(radius,fixed=false,angle=0){
  const width=Math.max(2,radius*.045),halo=width*.55;
  const tip=radius*.96,base=fixed?radius*.81:tip-Math.min(radius*.3,Math.max(7,radius*.22));
  const start=fixed?base:radius*.14,half=Math.min(radius*.3,Math.max(4,radius*.15));
  const box=(a,b,w)=>[{x:a,y:-w/2},{x:b,y:-w/2},{x:b,y:w/2},{x:a,y:w/2}];
  const ink=[box(start,fixed?tip:base+width,width)],outline=[box(start-halo,fixed?tip+halo:base+width,width+2*halo)];
  if(!fixed){ink.push([{x:tip,y:0},{x:base,y:half},{x:base,y:-half}]);outline.push([{x:tip+halo,y:0},{x:base-halo,y:half+halo},{x:base-halo,y:-half-halo}]);}
  const c=Math.cos(angle),s=Math.sin(angle),rotate=r=>r.map(p=>({x:p.x*c-p.y*s,y:p.x*s+p.y*c}));
  return {ink:ink.map(rotate),outline:outline.map(rotate)};
}
