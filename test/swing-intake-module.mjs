import {getExample} from '../js/blocks/examples.js';
import {builtinTemplate,normalizeTemplate,instantiateTemplate,mountModule,unmountModule} from '../js/blocks/module-ops.js';
import {compileTopology} from '../js/core/topology.js';
import {solveTopology} from '../js/multilink/solver.js';
import {compileAssembly,solveAssembly,outputPose} from '../js/blocks/assembly.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {check,report} from './_harness.mjs';
const source=getExample('competition-roller-intake').snapshot, before=JSON.stringify(source);
const t=builtinTemplate('swing-intake');
check('same source geometry, environmental object excluded',JSON.stringify(t.comps)===JSON.stringify(source.comps.filter(c=>c.type!=='workpiece')));
check('template has fixed base and body-bound tip',normalizeTemplate(t).ok&&t.base==='FRAME_BL'&&t.outputs[0].body.id==='IntakeArm');
const failures=s=>{const topo=compileTopology(s.comps,{params:s.params},new Set());let n=0;for(let a=0;a<=90;a+=.5)if(!solveTopology(topo,{thetaDeg:a,motorAngles:{'1':a}}).isValid)n++;return n;};
for(const length of [64,68,72]){const s=structuredClone(t);s.params.INTAKE_COUPLER=length;check(`coupler ${length}: 181 poses solve`,failures(s)===0);}
const bad=structuredClone(t);bad.params.INTAKE_COUPLER=1;
check('unreachable short coupler fails',failures(bad)>0);
const host=instantiateTemplate(builtinTemplate('single-axis-wrist'),{counter:0,usedMotorIds:[],existingTokens:new Set(),place:{x:0,y:0}});
const tokens=new Set([...host.comps.flatMap(c=>[c.id,c.p1?.id,c.p2?.id]),...Object.keys(host.params)]);
const child=instantiateTemplate(t,{counter:host.counter,usedMotorIds:['1'],existingTokens:tokens,place:{x:400,y:0}});
check('insert allocates independent motor',child.comps.find(c=>c.isInput).physicalMotor==='2');
const params={...host.params,...child.params};
const mounted=mountModule([...host.comps,...child.comps],[host.module,child.module],child.module.id,{module:host.module.id,output:'tool'},params,{activeMotor:'1',theta:0,motorAngles:{'1':0,'2':0}});
check('intake mounts without replacing host',mounted.ok&&mounted.modules.length===2);
const saved=normalizeSnapshot(JSON.parse(JSON.stringify({kind:'blocks',v:1,comps:mounted.comps,modules:mounted.modules,params})));
check('mount survives save/reopen',saved.modules.find(m=>m.id===child.module.id).mount.to.module===host.module.id);
const asm=compileAssembly(saved.comps,saved.modules,{params:saved.params});
for(const a of [-30,0,45])for(const b of [0,45,90]){
 const r=solveAssembly(asm,{thetaDeg:a,motorAngles:{'1':a,'2':b}});
 const o=outputPose(host.module,'tool',r.points,saved.comps),p=r.points[child.module.base];
 check(`host ${a}, intake ${b}: mounted base follows`,r.isValid&&Math.hypot(o.x-p.x,o.y-p.y)<1e-6);
}
check('detach succeeds',unmountModule(saved.comps,saved.modules,child.module.id,saved.params,{activeMotor:'1',theta:0,motorAngles:{'1':0,'2':0}}).ok);
check('source remains unchanged',JSON.stringify(source)===before);
report('swing-intake-module');
