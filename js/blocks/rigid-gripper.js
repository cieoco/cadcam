// H03 correction: the former tip is the end of the same rigid plate.
// Use ordinary local shape vertices, shared by selection, 2D, 3D and saving.
export function rigidGripVertices(arm,length,angleDeg){
  const dx=arm.p2.x-arm.p1.x,dy=arm.p2.y-arm.p1.y,d=Math.hypot(dx,dy);
  const ex=arm.p3.x-arm.p1.x,ey=arm.p3.y-arm.p1.y;
  const theta=Math.atan2(ey,ex)+angleDeg*Math.PI/180;
  const x=ex+length*Math.cos(theta),y=ey+length*Math.sin(theta);
  return [{solve:true,ref:'p2'},{solve:true,ref:'p1'},{solve:true,ref:'p3'},
    {solve:false,u:(x*dx+y*dy)/d,v:(-x*dy+y*dx)/d,hole:true}];
}
export function migrateH03RigidGrip(source){
  const syringe=source.find(c=>c?.id==='H3Syringe'&&c.type==='syringe');
  if(!syringe?.passiveTips?.length)return source;
  const edits=syringe.passiveTips.map(t=>({t,arm:source.find(c=>c?.id===t.hostId&&c.type==='triangle')}));
  if(edits.length!==2||edits.some(({t,arm})=>!['H3JawA','H3JawB'].includes(arm?.id)||!arm?.p1||!arm?.p2||!arm?.p3||!Number.isFinite(t.length)||t.length<=0||!Number.isFinite(t.angleDeg)||!(Math.hypot(arm.p2.x-arm.p1.x,arm.p2.y-arm.p1.y)>0)))return source;
  return source.map(c=>{
    if(c===syringe){const {passiveTips,...rest}=c;return {...rest,jawIds:edits.map(e=>e.arm.id)};}
    const edit=edits.find(e=>e.arm===c);
    return edit?{...c,shapeMode:'polyline',vertices:rigidGripVertices(c,edit.t.length,edit.t.angleDeg)}:c;
  });
}
