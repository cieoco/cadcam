import { check, report } from './_harness.mjs';
import { getExample } from '../js/blocks/examples.js';
import { normalizeSnapshot } from '../js/blocks/schema.js';
import { mountModule } from '../js/blocks/module-ops.js';
import { compileAssembly, solveAssembly } from '../js/blocks/assembly.js';
const full = normalizeSnapshot(getExample('assembly-lift-gripper').snapshot);
const practice = normalizeSnapshot(getExample('assembly-lift-gripper-practice').snapshot);
check('練習保留兩個未接合模組', practice.modules.length === 2 && practice.modules.every(m => !m.mount));
const r = mountModule(practice.comps, practice.modules, 'Grip1', { module: 'Lift1', output: 'carriage' }, practice.params, { activeMotor: '1', theta: 0, motorAngles: { '2': 0 } });
check('學生可透過滑台接點完成組立', r.ok);
for (const f of [full, {...practice, comps:r.comps, modules:r.modules}]) {
 const asm = compileAssembly(f.comps,f.modules,{params:f.params});
 for (const m1 of [-40,0,60]) for (const m2 of [0,30]) {
  const sol=solveAssembly(asm,{thetaDeg:0,motorAngles:{'1':m1,'2':m2}});
  check(`升降${m1} 夾爪${m2}保持接合`,sol.isValid && Math.hypot(sol.points.GCA.x-sol.points.LiftOutput.x, sol.points.GCA.y-sol.points.LiftOutput.y)<1e-6);
 }
}
report('assembly-lesson');
