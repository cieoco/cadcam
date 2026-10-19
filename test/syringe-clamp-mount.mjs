import assert from 'node:assert/strict';
import {getExample} from '../js/blocks/examples.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {frameConnectorNodes} from '../js/blocks/model.js';
import {syringeClampShape} from '../js/blocks/syringe-shape.js';
import {attachmentPoint} from '../js/core/syringe.js';
import {inspectFrameExport,svgForFrameGeometry,dxfForFrameGeometry} from '../js/blocks/exporters.js';
import {syringeClampInstallation} from '../js/blocks3d/syringe-scene.js';
import {inside} from '../js/blocks/part-fusion.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<.002,`${a} != ${b}`);
for(const name of ['hydraulic-h01','hydraulic-h02','hydraulic-h03','hydraulic-h04','hydraulic-h05','hydraulic-h06']){
 const n=normalizeSnapshot(getExample(name).snapshot),before=JSON.stringify(n);
 for(const s of n.comps.filter(c=>c.type==='syringe')){
  const own=n.comps.filter(c=>c.moduleId===s.moduleId),nodes=frameConnectorNodes(own),g=inspectFrameExport(nodes,{});
  const holes=g.holes.filter(h=>h.layer==='SYRINGE_CLAMP');assert.equal(holes.length,2,name);
  near(Math.hypot(holes[0].x-holes[1].x,holes[0].y-holes[1].y),28);
  const a=attachmentPoint(s.a,own,n.params),angle=s.axisDeg*Math.PI/180;
  syringeClampShape().feet.forEach((f,i)=>{
   const h=holes.find(h=>h.id===`${s.id}_clamp_${i}`);near(h.r,1.75);
   near(h.x,a.x-Math.sin(angle)*f.hole.y);near(h.y,a.y+Math.cos(angle)*f.hole.y);
   // Every ear vertex and a 3 mm hole margin remain inside the SAME frame.
   for(const p of f.outline){const q={x:a.x+Math.cos(angle)*p.x-Math.sin(angle)*p.y,y:a.y+Math.sin(angle)*p.x+Math.cos(angle)*p.y};assert.ok(g.outlines.some(r=>inside(q,r)),name);}
   for(let j=0;j<32;j++){const t=j*Math.PI/16,q={x:h.x+(h.r+3)*Math.cos(t),y:h.y+(h.r+3)*Math.sin(t)};assert.ok(g.outlines.some(r=>inside(q,r)),name);}
  });
  const svg=svgForFrameGeometry(g,'frame'),dxf=dxfForFrameGeometry(g,'frame');
  assert.ok(svg.includes('SYRINGE_CLAMP')&&svg.includes(`${s.id}_clamp_0`));
  assert.ok(dxf.includes('SYRINGE_CLAMP'));
 }
 assert.equal(JSON.stringify(n),before,'derived geometry must not edit snapshots');
}
// Unknown names, a mid-bar seat, translation and rotation use geometry, not Hxx IDs.
const custom=normalizeSnapshot(getExample('hydraulic-h01').snapshot),s=custom.comps.find(c=>c.type==='syringe');
s.id='CustomClamp';s.a.u=25;const t=.4;
for(const c of custom.comps){for(const p of [c.p1,c.p2,c.p3].filter(Boolean)){const {x,y}=p;p.x=100+x*Math.cos(t)-y*Math.sin(t);p.y=-50+x*Math.sin(t)+y*Math.cos(t);}if(c.type==='syringe')c.axisDeg+=t*180/Math.PI;}
const nodes=frameConnectorNodes(custom.comps),a=attachmentPoint(s.a,custom.comps,custom.params);
const pair=nodes.filter(p=>p.holeLayer==='SYRINGE_CLAMP');assert.equal(pair.length,2);near((pair[0].x+pair[1].x)/2,a.x);near((pair[0].y+pair[1].y)/2,a.y);
assert.equal(frameConnectorNodes(custom.comps.filter(c=>c!==s)).filter(p=>p.holeLayer==='SYRINGE_CLAMP').length,0,'removing clamp removes derived holes');
// Local lands remain a closed outline after arbitrary user placement/rotation.
for(let deg=0;deg<360;deg+=30){
 const cs=structuredClone(custom.comps),angle=deg*Math.PI/180;
 for(const c of cs){for(const p of [c.p1,c.p2,c.p3].filter(Boolean)){const {x,y}=p;p.x=x*Math.cos(angle)-y*Math.sin(angle)+.123;p.y=x*Math.sin(angle)+y*Math.cos(angle)-.456;}if(c.type==='syringe')c.axisDeg+=deg;}
 const g=inspectFrameExport(frameConnectorNodes(cs),{});
 assert.equal(g.outlines.length,1);assert.equal(g.holes.filter(h=>h.layer==='SYRINGE_CLAMP').length,2);
}
// Missing holes / insufficient barrel clearance cannot masquerade as fastened.
const shape={id:'S',fixed:true,a:{x:0,y:0},angle:0,r:8.75,clamp:syringeClampShape()},I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
assert.equal(syringeClampInstallation({},shape,10,I).reason,'missing_frame_holes');
assert.equal(syringeClampInstallation({},{...shape,r:20},30,I).reason,'clamp_diameter');
const fake={materialParts:[{partId:'frame',geometry:{thicknessMm:4,holes:[{id:'S_clamp_0',x:0,y:-14},{id:'S_clamp_1',x:0,y:14}]},pose:{matrix:I}}]};
assert.equal(syringeClampInstallation(fake,shape,10,I).reason,'barrel_clearance');
const mount=syringeClampInstallation(fake,shape,20,I);assert.equal(mount.status,'reference');assert.equal(mount.fasteners.length,2);
console.log('Pipe clamps: H01–H06 hole alignment, ear support, SVG/DXF, custom geometry and missing/low support checks passed');
