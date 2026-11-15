/** Millimetre heights for connected stacks; unrelated stock never changes a joint. */
export function jointAxialLayout(parts,{minimumPitch=6,clearanceMm=2,motorMounts=new Map(),motorTypes=new Map()}={}){
 const parent=parts.map((_,i)=>i),root=i=>parent[i]===i?i:parent[i]=root(parent[i]),byId=new Map(parts.map((p,i)=>[p.id,i])),owners=new Map();
 const join=(a,b)=>{if(a!==undefined&&b!==undefined)parent[root(a)]=root(b);};
 parts.forEach((p,i)=>{for(const id of p.joints || []){join(i,owners.get(id));owners.set(id,i);}if(p.mesh)join(i,byId.get(p.mesh));});
 motorMounts.forEach(m=>join(byId.get(m.frameBody),byId.get(m.outputBody)));
 const groups=new Map();parts.forEach((p,i)=>{const key=root(i);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);});
 const heights=new Map();
 for(const group of groups.values()){
  const lo=Math.min(0,...group.map(p=>p.layer)),hi=Math.max(0,...group.map(p=>p.layer)),steps=new Map(),z=new Map([[0,0]]);
  for(let layer=lo;layer<hi;layer++){
   const neighbors=group.filter(p=>p.layer===layer||p.layer===layer+1),thickness=Math.max(0,...neighbors.map(p=>p.thicknessMm));
   let gap=clearanceMm;
   motorMounts.forEach((m,id)=>{const a=group.find(p=>p.id===m.frameBody),b=group.find(p=>p.id===m.outputBody);if(a&&b&&motorTypes.get(id)==='mg995'&&layer>=Math.min(a.layer,b.layer)&&layer<Math.max(a.layer,b.layer))gap=Math.max(gap,4);});
   steps.set(layer,Math.max(minimumPitch,thickness+gap));
  }
  for(let l=0;l<hi;l++)z.set(l+1,z.get(l)+steps.get(l));
  for(let l=-1;l>=lo;l--)z.set(l,z.get(l+1)-steps.get(l));
  for(const p of group)heights.set(p.id,z.get(p.layer));
 }
 return heights;
}
