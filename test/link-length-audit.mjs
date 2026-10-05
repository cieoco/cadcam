import assert from 'node:assert/strict';
import { BLOCK_EXAMPLES, getExample } from '../js/blocks/examples.js';
import { compileAssembly, solveAssembly } from '../js/blocks/assembly.js';
import { mountModule, unmountModule } from '../js/blocks/module-ops.js';

let frames = 0, lengths = 0;
function verify(f, asm, sol) {
 if (!sol.isValid) return;
 frames++;
 for (const c of f.comps.filter(c=>c.type==='bar')) {
  const a=sol.points[c.p1.id], b=sol.points[c.p2.id], length=asm.params[c.lenParam];
  if (!a || !b || !Number.isFinite(length)) continue;
  assert.ok(Math.abs(Math.hypot(b.x-a.x,b.y-a.y)-length)<1e-3, c.id);
  lengths++;
 }
}
for (const e of BLOCK_EXAMPLES) {
 const f=e.snapshot, asm=compileAssembly(f.comps,f.modules||[],{params:f.params});
 for (const mode of ['cold','forward','reverse']) {
  let prev;
  for (let i=0;i<=72;i++) {
   const sol=solveAssembly(asm,{thetaDeg:mode==='reverse'?360-i*5:i*5,_prevPoints:mode==='cold'?undefined:prev});
   verify(f,asm,sol);
   if(sol.isValid) prev=sol.points;
  }
 }
}
let f=structuredClone(getExample('assembly-lift-gripper-practice').snapshot);
for (let i=0;i<20;i++) {
 const angle=-40+i*5, motor={activeMotor:'1',theta:angle,motorAngles:{'2':30}};
 for (const mounted of [true,false]) {
  const r=mounted?mountModule(f.comps,f.modules,'Grip1',{module:'Lift1',output:'tool'},f.params,motor)
   :unmountModule(f.comps,f.modules,'Grip1',f.params,motor);
  assert.ok(r.ok,r.reason); f={...f,comps:r.comps,modules:r.modules};
  const asm=compileAssembly(f.comps,f.modules,{params:f.params});
  const sol=solveAssembly(asm,{thetaDeg:angle,motorAngles:{'1':angle,'2':30}});
  assert.ok(sol.isValid);
  verify(f,asm,sol);
  assert.ok(Math.abs(sol.points.D.x-sol.points.C.x)<1e-6);
  assert.ok(Math.abs(sol.points.D.y-sol.points.C.y-72)<1e-6);
 }
}
// 多加一支無法滿足的閉環桿，不可再把伸縮後的結果當成有效解。
f=structuredClone(getExample('assembly-lift-gripper-practice').snapshot);
f.comps=f.comps.filter(c=>c.moduleId==='Lift1'); f.modules=f.modules.filter(m=>m.id==='Lift1');
f.comps.push({type:'bar',id:'Brace',moduleId:'Lift1',p1:{...f.comps[0].p1},p2:{...f.comps.find(c=>c.id==='Link2').p2},lenParam:'BR',fixedLen:true});
f.params.BR=100;
const asm=compileAssembly(f.comps,f.modules,{params:f.params});
assert.equal(solveAssembly(asm,{thetaDeg:30,motorAngles:{'1':30}}).isValid,false);
console.log(`link-length-audit: ${frames} valid frames, ${lengths} length checks; 20 mount/unmount cycles; conflicting brace rejected`);
