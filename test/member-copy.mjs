import assert from 'node:assert/strict';
import {planMemberCopy,copyMemberGeometry} from '../js/blocks/member-copy.js';
import {planBarFusion} from '../js/blocks/bar-fusion-plan.js';
import {inspectBarFusionData} from '../js/core/bar-fusion.js';
import {toSnapshot,normalizeSnapshot} from '../js/blocks/schema.js';
import {compileTopology} from '../js/core/topology.js';
import {solveTopology} from '../js/multilink/solver.js';
import {exportLinksAsSvg,exportLinksAsDxf} from '../js/blocks/exporters.js';

const p=(id,x,y,type='floating')=>({id,x,y,type});
const stock={widthMm:18,thicknessMm:4,material:'plywood'};
const bar={type:'bar',id:'Link1',p1:{...p('A',0,0,'motor'),physicalMotor:'1'},p2:p('B',80,0),fixedLen:true,lenParam:'L1',isInput:true,physicalMotor:'1',motorMount:{center:'A',frameBody:'External'},stock,holes:[{id:'H',distParam:'H1'}]};
const params={L1:80,H1:24};
const before=JSON.stringify({bar,params});
const input={comps:[bar],params,id:bar.id,positions:{A:{x:10,y:20},B:{x:10,y:100}}};
const copy=planMemberCopy(input);assert.ok(copy.ok,copy.reason);
assert.equal(JSON.stringify({bar,params}),before,'planning does not mutate source');
const c=copy.comps[0];
assert.notEqual(c.id,bar.id);assert.notEqual(c.p1.id,bar.p1.id);assert.notEqual(c.lenParam,bar.lenParam);assert.notEqual(c.holes[0].id,'H');
assert.equal(c.p1.type,'floating');assert.equal(c.isInput,false);assert.equal(c.motorMount,undefined);assert.equal(c.physicalMotor,undefined);assert.equal(c.p1.physicalMotor,undefined);
assert.equal(c.p2.y-c.p1.y,80,'copy the visible pose');assert.deepEqual(c.stock,stock);assert.equal(copy.params[c.holes[0].distParam],24);
copy.params[c.lenParam]=100;assert.equal(params.L1,80,'independent dimensions');
const again=planMemberCopy({...input,comps:[bar,...copy.comps],params:{...params,...copy.params},counter:0});
assert.ok(again.ok);assert.notEqual(again.comps[0].id,c.id,'collision-safe IDs even with stale counter');

const plate={type:'triangle',id:'Plate1',p1:p('T1',0,0),p2:p('T2',70,20),p3:p('T3',15,60),gParam:'G',r1Param:'R1',r2Param:'R2',sign:1,shapeMode:'polygon',stock,vertices:[{solve:true,ref:'p1'},{solve:true,ref:'p2'},{solve:false,u:50,v:45,hole:true},{solve:true,ref:'p3'}]};
const pp={G:Math.hypot(70,20),R1:Math.hypot(15,60),R2:Math.hypot(55,40)};
for(const mode of ['copy','mirror-x','mirror-y'])for(const shape of ['polygon','jaw']) {
  const src=shape==='jaw'?{...plate,shape:'jaw',jawTurnSign:1,jawTipLength:45}:plate;
  const r=planMemberCopy({comps:[src],params:pp,id:src.id,mode});assert.ok(r.ok,r.reason);
  const dst=r.comps[0],mirrored=mode!=='copy';
  assert.equal(dst.sign,mirrored?-1:1);assert.equal(dst.vertices[2].v,mirrored?-45:45);
  if(shape==='jaw')assert.equal(dst.jawTurnSign,mirrored?-1:1);
  const sg=copyMemberGeometry(r.source[0],pp),dg=copyMemberGeometry(dst,r.params);
  const a=r.source[0].p1,b=dst.p1;
  const transform=q=>({x:b.x+(mode==='mirror-x'?-1:1)*(q.x-a.x),y:b.y+(mode==='mirror-y'?-1:1)*(q.y-a.y)});
  for(const h of sg.holes){const expected=transform(h);assert.ok(dg.holes.some(q=>Math.hypot(q.x-expected.x,q.y-expected.y)<1e-6),'shape holes reflected');}
  for(const point of sg.sourcePoints){const expected=transform(point);assert.ok(dg.sourcePoints.some(q=>Math.hypot(q.x-expected.x,q.y-expected.y)<1e-6),'outline and jaw tip reflected');}
  const snapshot=toSnapshot([src,...r.comps],{params:{...pp,...r.params}},r.counter);
  const restored=normalizeSnapshot(snapshot);assert.ok(restored);assert.equal(restored.comps.length,2);
  assert.deepEqual(restored.comps[1].vertices,dst.vertices);
  // 尚未安裝的自由零件沿用作者座標；固定兩孔後才要求求解器解出第三孔。
  const installed={...restored.comps[1],p1:{...dst.p1,type:'fixed'},p2:{...dst.p2,type:'fixed'}};
  const solved=solveTopology(compileTopology([installed],{params:restored.params},new Set()),{thetaDeg:0});
  assert.ok(solved.isValid,solved.errorReason);
  assert.ok(Math.hypot(solved.points[dst.p3.id].x-dst.p3.x,solved.points[dst.p3.id].y-dst.p3.y)<1e-6,'mirrored branch solves after mounting');
  for(const exporter of [exportLinksAsSvg,exportLinksAsDxf]){const files=[];exporter(r.comps,{},r.params,{},[],null,(text,name)=>files.push({text,name}));assert.equal(files.length,1);assert.ok(files[0].text.length>0);}
}
const one={...bar,p1:p('A',0,0),isInput:false};delete one.holes;delete one.physicalMotor;delete one.motorMount;
const two={...one,id:'Link2',p1:p('B',80,0),p2:p('C',80,60),lenParam:'L2'};
const fp={L1:80,L2:60};
const fused=planBarFusion([one,two],['Link1','Link2'],fp);assert.ok(fused.ok,fused.reason);
for(const mode of ['copy','mirror-x','mirror-y']){
 const r=planMemberCopy({comps:fused.comps,params:fp,id:'Link2',mode});assert.ok(r.ok,r.reason);assert.equal(r.comps.length,2);
 const root=r.comps.find(c=>c.barFusion);assert.ok(inspectBarFusionData(r.comps,root,r.params).ok);
 assert.equal(r.comps[0].p2.id,r.comps[1].p1.id,'keep internal shared holes');
 assert.equal(root.barFusion.points.find(p=>p.id===r.comps[1].p2.id).y,mode==='copy'?60:-60);
 assert.ok(normalizeSnapshot(toSnapshot([...fused.comps,...r.comps],{params:{...fp,...r.params}},r.counter)));
}
const scoped=planMemberCopy({comps:[{...plate,moduleId:'Mod1'}],modules:[{id:'Mod1'}],params:pp,id:plate.id});
assert.equal(scoped.comps[0].moduleId,'Mod1');
assert.equal(planMemberCopy({comps:[{...plate,fusedWith:'Gear1'}],params:pp,id:plate.id}).ok,false);
assert.equal(planMemberCopy({...input,mode:'unknown'}).ok,false);
assert.equal(planMemberCopy({...input,params:{L1:NaN,H1:24}}).ok,false);
console.log('member-copy: independent IDs and dimensions, current pose, reflections, jaw/shape holes, union, module, normalization, solve and SVG/DXF passed');
