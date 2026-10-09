// Independent measurement: stock planes, box extents, drilling axes and BOM.
// No production validation functions or shared construction math are imported.
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const length=v=>Math.hypot(v.x,v.y,v.z);
const offAxis=(a,b,n)=>{const q=sub(a,b),d=dot(q,n);return length({x:q.x-d*n.x,y:q.y-d*n.y,z:q.z-d*n.z});};
const interval=(box,n)=>{const c=dot(box.center,n),h=['x','y','z'].reduce((s,k,i)=>s+Math.abs(dot(box.axes[i],n))*box.size[k]/2,0);return [c-h,c+h];};

export function auditBracketPhysical({boxes,screws,plates,holes,hardware,count,spec,tolerance=1e-6,machiningTolerance=tolerance}) {
  const errors=[],check=(ok,label)=>{if(!ok)errors.push(label);};
  check(boxes.length===count*2,'wing count'); check(screws.length===count*2,'screw count');
  check(holes.length===count*2,'paired drilling count');
  for(const box of boxes) {
    const plate=plates[box.holePairId];
    if(!plate){check(false,'missing stock plane');continue;}
    const n=plate.normal,plane=dot(plate.contact,n),range=interval(box,n);
    check(Math.abs(length(n)-1)<tolerance,'unit plate normal');
    check(Math.abs(range[0]-plane)<tolerance&&Math.abs(range[1]-plane-spec.thicknessMm)<tolerance,'wing flush and outside stock');
    check(Math.abs(Math.abs(dot(box.hole.axis,n))-1)<tolerance,'thread axis');
    check(box.hole.diameterMm===3,'M3 thread diameter');
    check(box.axes.every((ax,i)=>{
      const half=box.size[['x','y','z'][i]]/2,offset=Math.abs(dot(sub(box.hole.center,box.center),ax));
      return Math.abs(dot(ax,box.hole.axis))>1-tolerance ? offset<=half+tolerance : offset+box.hole.diameterMm/2<=half+tolerance;
    }),'thread circle within wing material');
    const h=holes.find(h=>h.holePairId===box.holePairId);
    check(!!h,'missing paired hole');
    if(h){check(h.diameterMm===3.2,'stock clearance diameter');check(Math.abs(Math.abs(dot(h.axis,n))-1)<tolerance,'stock hole axis');check(offAxis(box.hole.center,h.center,n)<machiningTolerance,'paired coaxial holes');}
    const screw=screws.find(s=>s.holePairId===box.holePairId);
    check(!!screw,'missing screw');
    if(screw){
      const delta=sub(screw.tip,screw.head),expected=[6,8,10,12,16,20,25,30,35,40].find(l=>l>=plate.thicknessMm+spec.thicknessMm)||Math.ceil(plate.thicknessMm+spec.thicknessMm);
      check(Math.abs(dot(screw.head,n)-(plane-plate.thicknessMm))<tolerance,'screw head on stock exterior');
      check(offAxis(screw.head,box.hole.center,n)<tolerance&&offAxis(screw.tip,box.hole.center,n)<tolerance,'screw coaxial');
      check(dot(delta,n)>0&&Math.abs(length(delta)-expected)<tolerance&&screw.lengthMm===expected&&screw.spec===`M3×${expected}`,'screw direction and standard length');
    }
  }
  const grouped=new Map();screws.forEach(s=>grouped.set(s.spec,(grouped.get(s.spec)||0)+1));
  grouped.forEach((qty,key)=>check(hardware.some(r=>r.spec===key&&r.qty===qty),'BOM screw specification and count'));
  check(hardware.some(r=>r.spec===spec.label&&r.qty===count),'BOM bracket count');
  for(const slot of new Set(boxes.map(b=>b.slotId))) {
    const pair=boxes.filter(b=>b.slotId===slot);
    if(pair.length!==2){check(false,'two wings per slot');continue;}
    const overlap=pair[0].axes.map(n=>{const [a,b]=interval(pair[0],n),[c,d]=interval(pair[1],n);return Math.min(b,d)-Math.max(a,c);});
    check(overlap.every(v=>v>=-tolerance),'wings meet at corner');
    check(overlap.reduce((v,d)=>v*Math.max(0,d),1)<=spec.widthMm*spec.thicknessMm**2+tolerance,'wing overlap limited to bend');
    pair.forEach((box,i)=>{
      const other=plates[pair[1-i].holePairId];
      if(other)check(interval(box,other.normal)[0]>=dot(other.contact,other.normal)-tolerance,'wing outside other stock');
    });
  }
  return errors;
}
