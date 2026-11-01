import assert from 'node:assert/strict';
import {diskOutline,validateDisk} from '../js/blocks/disk-plate.js';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
import {encodeSnapshot,decodeShareString} from '../js/share-codec.js';
import {compileTopology} from '../js/core/topology.js';
import {solveTopology} from '../js/multilink/solver.js';
import {buildPartGeometryCatalog} from '../js/blocks/part-geometry.js';
import {inspectLinkExport,exportLinksAsSvg,exportLinksAsDxf} from '../js/blocks/exporters.js';
import {planMemberDimension} from '../js/blocks/member-dimensions.js';
import {planMemberCopy,copyMemberGeometry} from '../js/blocks/member-copy.js';
import {planBarFusion} from '../js/blocks/bar-fusion-plan.js';

const disk={type:'bar',shape:'disk',diameterMm:100,id:'Disk1',color:'#3498db',fixedLen:true,
  p1:{id:'A',type:'fixed',x:0,y:0,physicalMotor:'1'},p2:{id:'B',type:'floating',x:30,y:0},
  isInput:true,motorType:'tt',physicalMotor:'1',phaseOffset:0,lenParam:'L'};
const params={L:30,theta:0},near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const saved=normalizeSnapshot(decodeShareString(encodeSnapshot(toSnapshot([disk],{params},1))));
assert.equal(saved.comps[0].shape,'disk');assert.equal(saved.comps[0].diameterMm,100);
assert.equal(saved.comps[0].snapLength,false);
const comp=saved.comps[0],before=JSON.stringify(comp);
for(let theta=0;theta<=360;theta+=15){
  const solved=solveTopology(compileTopology(saved.comps,{params:saved.params},new Set()),{thetaDeg:theta});
  assert.ok(solved.isValid);near(Math.hypot(solved.points.B.x,solved.points.B.y),30);
  near(solved.points.B.x,30*Math.cos(theta*Math.PI/180));
}
for(const d of [100,140]){
  const c={...comp,diameterMm:d},g=inspectLinkExport(c,30,{holeDiameterMm:3.2});
  assert.ok(g.outlines[0].every(p=>Math.abs(Math.hypot(p.x,p.y)-d/2)<1e-6));
  assert.ok(g.holes.some(h=>h.x===30&&h.y===0));assert.ok(g.cutouts.some(h=>h.layer==='TT_SHAFT_FLAT'));
  assert.deepEqual(c.p2,comp.p2);
}
assert.equal(JSON.stringify(comp),before);
assert.equal(validateDisk(comp,30,100,3.2),'');assert.match(validateDisk(comp,49,100,3.2),/邊緣/);
assert.ok(!planMemberDimension(comp,params,'g',49,{holeDiameterMm:3.2}).ok);
assert.equal(planMemberDimension(comp,params,'g',31).params.L,31);
assert.throws(()=>inspectLinkExport({...comp,diameterMm:40},30,{holeDiameterMm:3.2}),/邊緣/);
for(const thickness of [3,5]){
  const catalog=buildPartGeometryCatalog({comps:[{...comp,stock:{thicknessMm:9}}],params,fabrication:{cnc:{stockThicknessMm:thickness}}});
  assert.equal(catalog.parts.Disk1.thicknessMm,thickness);
  near(Math.max(...catalog.parts.Disk1.outlines[0].map(p=>p.x)),50);
}
for(const mode of ['copy','mirror-x','mirror-y']){
  const result=planMemberCopy({comps:[comp],params,counter:1,id:'Disk1',mode});assert.ok(result.ok,result.reason);
  const copy=result.comps.find(c=>c.id!==comp.id);assert.equal(copy.shape,'disk');assert.equal(copy.diameterMm,100);
  assert.notEqual(copy.p1.id,comp.p1.id);assert.equal(copy.isInput,false);
  assert.equal(copyMemberGeometry(copy,result.params).outlines[0].length,128);
}
assert.match(planBarFusion([comp,{...comp,id:'Other'}],['Disk1','Other'],params).reason,/圓盤/);
for(const fn of [exportLinksAsSvg,exportLinksAsDxf]){
 const files=[];fn([comp],{},params,{holeDiameterMm:3.2},[],null,(text,name)=>files.push({text,name}));
 assert.equal(files.length,1);assert.match(files[0].text,/TT_SHAFT_FLAT/);
 assert.ok(files[0].text.includes('50'));assert.ok(files[0].text.includes('30'));
}
assert.equal(diskOutline(comp).length,128);
console.log('disk plate: shared-pivot motion, independent diameter, edge guard, global thickness, persistence, copy/mirror, SVG/DXF passed');
