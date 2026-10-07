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
// 組立操作會丟棄前幀種子：直接在當前角度重解仍須保持平行與定長。
for (const angle of [-40, -26, 0, 20, 30, 45, 60]) {
 const asm = compileAssembly(full.comps, full.modules, {params:full.params});
 const sol = solveAssembly(asm, {thetaDeg:angle,motorAngles:{'1':angle,'2':30}});
 const p = sol.points;
 check(`無前幀重建 ${angle}° 保持平行`, sol.isValid && Math.abs(p.D.x-p.C.x)<1e-6 && Math.abs(p.D.y-p.C.y-72)<1e-6);
 check(`無前幀重建 ${angle}° 保持桿長`, full.comps.filter(c=>c.type==='bar').every(c=>Math.abs(Math.hypot(p[c.p1.id].x-p[c.p2.id].x,p[c.p1.id].y-p[c.p2.id].y)-full.params[c.lenParam])<1e-6));
}
// 升降臂工具箱範例：穿越共線點、反轉、重建以及 309° 都不可翻成交叉分支。
const lift = normalizeSnapshot(getExample('competition-fourbar-lift').snapshot);
const liftAsm = compileAssembly(lift.comps, lift.modules, {params:lift.params});
for (const direction of [1, -1]) {
 let prev = null, stable = true;
 for (let i=0; i<=720; i++) {
  const angle = direction * i;
  const sol = solveAssembly(liftAsm, {thetaDeg:angle,motorAngles:{'1':angle,'2':0},_prevPoints:prev});
  const p = sol.points;
  stable &&= sol.isValid && Math.abs(p.B.x-p.A.x)<1e-6 && Math.abs(p.B.y-p.A.y-72)<1e-6;
  prev = p;
 }
 check(`升降臂方向 ${direction} 連續兩圈維持平行`,stable);
}
for(const angle of [90,180,270,309]) {
 const sol=solveAssembly(liftAsm,{thetaDeg:angle,motorAngles:{'1':angle,'2':0}}), p=sol.points;
 check(`升降臂 ${angle}° 無前幀仍平行`,sol.isValid && Math.abs(p.B.x-p.A.x)<1e-6 && Math.abs(p.B.y-p.A.y-72)<1e-6);
}
report('assembly-lesson');
