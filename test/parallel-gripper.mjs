import assert from 'node:assert/strict';
import {getExample} from '../js/blocks/examples.js';
import {motorTypeAt} from '../js/blocks/motor-tools.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {compileTopology} from '../js/core/topology.js';
import {solveTopology} from '../js/multilink/solver.js';
import {builtinTemplate,normalizeTemplate,instantiateTemplate,mountModule} from '../js/blocks/module-ops.js';
import {compileAssembly,solveAssembly,outputPose} from '../js/blocks/assembly.js';
import {exportLinksAsSvg,exportLinksAsDxf} from '../js/blocks/exporters.js';
const clone=x=>JSON.parse(JSON.stringify(x)),near=(a,b)=>Math.abs(a-b)<1e-6;
const s=normalizeSnapshot(clone(getExample('parallel-gripper').snapshot)),original=JSON.stringify(s);
const parallel=p=>['Left','Right'].every(side=>near(p[`PG${side}Top`].x,p[`PG${side}Pin`].x)&&near(p[`PG${side}Top`].y-p[`PG${side}Pin`].y,48));
for(const arm of [24,28]){
 const edited=clone(s);edited.params.PG_ARM=arm;
 const t=compileTopology(edited.comps,{params:edited.params},new Set());
 for(const reverse of [false,true])for(let i=0;i<=120;i++){
  const a=reverse?30-i*.5:-30+i*.5;
  const r=solveTopology(t,{thetaDeg:a,motorAngles:{'1':a}});
  assert.ok(r.isValid&&parallel(r.points),`arm ${arm}, angle ${a}: both jaws parallel`);
 }
}
const t=compileTopology(s.comps,{params:s.params},new Set());
assert.ok(!parallel(solveTopology(t,{thetaDeg:-60,motorAngles:{'1':-60}}).points),'Outside the advertised branch, solvable does not mean parallel');
const broken=clone(s);broken.params.PG_ARM=0;
const bad=compileTopology(broken.comps,{params:broken.params},new Set());
assert.ok(!solveTopology(bad,{thetaDeg:0}).isValid,'Degenerate arm is rejected');
assert.equal(motorTypeAt(s.comps,'PGLeftAxis'),'mg995');
assert.ok(!s.comps.some(c=>c.type==='bar'&&c.isInput),'Fixed frame must not become a motor');
const restored=normalizeSnapshot(JSON.parse(JSON.stringify({comps:s.comps,params:s.params,modules:s.modules})));
assert.equal(restored.params.PG_ARM,24);
assert.equal(restored.comps.find(c=>c.id==='PGGearLeft').servoStart,-30);
const files=[],emit=(text,name)=>files.push({text,name}),points=solveTopology(t,{thetaDeg:0}).points;
exportLinksAsSvg(s.comps,points,s.params,{},[],null,emit);exportLinksAsDxf(s.comps,points,s.params,{},[],null,emit);
assert.ok(files.some(f=>f.name.endsWith('.svg'))&&files.some(f=>f.name.endsWith('.dxf')));
assert.ok(files.every(f=>!/(NaN|Infinity)/.test(f.text)));
assert.equal(JSON.stringify(s),original);
assert.ok(normalizeTemplate(builtinTemplate('parallel-gripper')).ok);
const wrist=instantiateTemplate(builtinTemplate('single-axis-wrist'),{counter:0,usedMotorIds:[],existingTokens:new Set(),place:{x:0,y:0}});
const tokens=new Set([...wrist.comps.flatMap(c=>[c.id,c.p1?.id,c.p2?.id]),...Object.keys(wrist.params)]);
const claw=instantiateTemplate(builtinTemplate('parallel-gripper'),{counter:wrist.counter,usedMotorIds:['1'],existingTokens:tokens,place:{x:200,y:0}});
assert.ok(claw.comps.every(c=>!tokens.has(c.id)));
assert.equal(claw.comps.find(c=>c.type==='gear'&&c.p1.type==='motor').p1.physicalMotor,'2');
const comps=[...wrist.comps,...claw.comps],modules=[wrist.module,claw.module],params={...wrist.params,...claw.params};
const m=mountModule(comps,modules,claw.module.id,{module:wrist.module.id,output:'tool'},params,{activeMotor:'1',theta:0,motorAngles:{'1':0,'2':0}});
assert.ok(m.ok);
const asm=compileAssembly(m.comps,m.modules,{params});
for(const angle of [-45,0,60]){
 const r=solveAssembly(asm,{thetaDeg:0,motorAngles:{'1':angle,'2':20}}),o=outputPose(wrist.module,'tool',r.points,m.comps),b=r.points[claw.module.base];
 assert.ok(r.isValid&&near(o.x,b.x)&&near(o.y,b.y));
}
assert.equal(normalizeSnapshot({kind:'blocks',v:1,comps:m.comps,modules:m.modules,params}).modules.find(x=>x.id===claw.module.id).mount.to.module,wrist.module.id);
console.log('parallel-gripper: sampled parallelism, edited arm, branch boundary, exports, roundtrip and wrist attachment passed');
