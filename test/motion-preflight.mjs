import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BLOCK_EXAMPLES } from '../js/blocks/examples.js';
import { compileTopology } from '../js/core/topology.js';
import { solveTopology } from '../js/multilink/solver.js';
import { compileAssembly, solveAssembly } from '../js/blocks/assembly.js';
import { motionPoseIssue, inspectMotionRange } from '../js/blocks/solve-health.js';
const example = () => structuredClone(BLOCK_EXAMPLES.find(e => e.id === 'slider-crank').snapshot);
const setup = s => {
  const compiled = compileTopology(s.comps, { params: s.params }, new Set());
  return { comps: s.comps, theta: 0, plan: { mode: 'rotate' },
    solveAt: (thetaDeg, _prevPoints) => solveTopology(compiled, { thetaDeg, _prevPoints }) };
};
const good = example(), before = JSON.stringify(good);
assert.equal(inspectMotionRange(setup(good)).ok, true);
assert.equal(JSON.stringify(good), before, 'preflight must not mutate the work');
const loose = example();
loose.comps.push({ type: 'bar', id: 'Extra', lenParam: 'ExtraLength',
  p1: { id: 'P3', type: 'floating', x: 120, y: 0 }, p2: { id: 'Loose', type: 'floating', x: 120, y: 40 } });
loose.params.ExtraLength = 40;
const looseSetup = setup(loose), looseSol = looseSetup.solveAt(0);
assert.equal(looseSol.isValid, true, 'reproduce legacy fallback coordinates');
assert.ok(looseSol.points.Loose);
assert.equal(inspectMotionRange(looseSetup).code, 'underconstrained');
// Two more constrained bars are a supported six-body mechanism, not an error by count.
const six = example();
for (const [id, start, x] of [['ExtraA', 'O', 0], ['ExtraB', 'P3', 120]]) {
  six.comps.push({ type: 'bar', id, lenParam: id, p1: { id: start, type: start === 'O' ? 'fixed' : 'floating', x, y: 0 },
    p2: { id: 'Q', type: 'floating', x: 60, y: 80 } });
  six.params[id] = 100;
}
assert.equal(inspectMotionRange(setup(six)).ok, true, 'valid extra bars remain playable');
const bad = example(); bad.params.LL2 = 40;
const failure = inspectMotionRange(setup(bad));
assert.equal(failure.ok, false);
assert.equal(failure.code, 'invalid_pose');
assert.ok(Number.isFinite(failure.angle));
const shortRail = example(); shortRail.comps.find(c => c.type === 'slider').p2.x = 90; shortRail.params.SL1 = 45;
assert.equal(inspectMotionRange(setup(shortRail)).ok, false, 'rail travel limit is enforced');
assert.equal(inspectMotionRange({ ...setup(good), plan: { mode: 'rock', lo: 0, hi: 0 } }).code, 'no_range');
assert.equal(inspectMotionRange({ ...setup(good), solveAt: () => { throw Error('failure'); } }).ok, false);
assert.equal(motionPoseIssue(good.comps, { isValid: true, points: {} }).code, 'missing_points');
assert.equal(motionPoseIssue([], { isValid: false, errorReason: '桿件 Extra 無法保持設定長度' }).message, '桿件 Extra 無法保持設定長度');
// Assembly must propagate the flag; a complete set of fallback points is insufficient.
loose.comps.forEach(c => c.moduleId = 'Bad');
const asm = compileAssembly(loose.comps, [{ id: 'Bad', name: 'Bad', base: 'O' }], { params: loose.params });
const asmSol = solveAssembly(asm, { thetaDeg: 0 });
assert.equal(motionPoseIssue(loose.comps, asmSol).code, 'underconstrained');
const fixture = JSON.parse(readFileSync(new URL('./fixtures/assembly/lift-gripper.json', import.meta.url)));
const validAsm = compileAssembly(fixture.comps, fixture.modules, { params: fixture.params });
assert.equal(motionPoseIssue(fixture.comps, solveAssembly(validAsm, { thetaDeg: 0, motorAngles: { '1': 30, '2': 0 } })), null);
// Environmental targets must not make a complete mechanism underconstrained.
const intake = structuredClone(BLOCK_EXAMPLES.find(e => e.id === 'competition-roller-intake').snapshot);
const intakeSetup = setup(intake);
assert.equal(motionPoseIssue(intake.comps, intakeSetup.solveAt(0)), null);
assert.equal(inspectMotionRange({...intakeSetup,plan:{mode:'rock',lo:0,hi:90}}).ok,true);
const withLoose = structuredClone(intake);
withLoose.comps.push({type:'bar',id:'LooseArm',lenParam:'LooseLength',p1:{...intake.comps.find(c=>c.id==='IntakeArm').p3},p2:{id:'LooseEnd',type:'floating',x:70,y:150}});
withLoose.params.LooseLength=30;
assert.equal(inspectMotionRange({...setup(withLoose),plan:{mode:'rock',lo:0,hi:90}}).code,'underconstrained');
const mixed = structuredClone(intake);
mixed.comps.push(...good.comps.map(c=>({...c,moduleId:'Slider'})));
const mixedAssembly=compileAssembly(mixed.comps,[{id:'Slider',name:'Slider',base:'O',outputs:[]}],{params:{...mixed.params,...good.params}});
assert.equal(motionPoseIssue(mixed.comps,solveAssembly(mixedAssembly,{thetaDeg:0})),null);
console.log('motion-preflight: passed');
