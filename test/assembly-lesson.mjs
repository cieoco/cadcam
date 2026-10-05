import { check, report } from './_harness.mjs';
import { getExample } from '../js/blocks/examples.js';
import { normalizeSnapshot } from '../js/blocks/schema.js';
import { mountModule } from '../js/blocks/module-ops.js';
import { compileAssembly, solveAssembly } from '../js/blocks/assembly.js';
const full = normalizeSnapshot(getExample('assembly-lift-gripper').snapshot);
const practice = normalizeSnapshot(getExample('assembly-lift-gripper-practice').snapshot);
check('組立教材不含齒條', full.comps.every(c=>c.type!=='rack'));
check('練習保留兩個未接合模組', practice.modules.length === 2 && practice.modules.every(m => !m.mount));
const r = mountModule(practice.comps, practice.modules, 'Grip1', { module: 'Lift1', output: 'tool' }, practice.params, { activeMotor: '1', theta: 0, motorAngles: { '2': 0 } });
check('學生可透過工具架接點完成組立', r.ok);
for (const f of [full, {...practice, comps:r.comps, modules:r.modules}]) {
 const asm = compileAssembly(f.comps,f.modules,{params:f.params});
 for (const m1 of [-40,0,60]) for (const m2 of [0,30]) {
  let sol=solveAssembly(asm,{thetaDeg:0,motorAngles:{'1':0,'2':0}});
  const steps=Math.max(1,Math.ceil(Math.max(Math.abs(m1),Math.abs(m2))/5));
  for(let i=1;i<=steps;i++) sol=solveAssembly(asm,{thetaDeg:0,motorAngles:{'1':m1*i/steps,'2':m2*i/steps},_prevPoints:sol.points});
  check(`升降${m1} 夾爪${m2}保持接合`,sol.isValid && Math.abs(sol.points.D.x-sol.points.C.x)<1e-6 && Math.abs(sol.points.D.y-sol.points.C.y-72)<1e-6 && Math.hypot(sol.points.GCA.x-sol.points.C.x, sol.points.GCA.y-sol.points.C.y)<1e-6);
 }
}
report('assembly-lesson');
