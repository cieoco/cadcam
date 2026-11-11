// 開檔即顯示存檔姿勢（2026-11-10）：作用中馬達載入時為 0°，θ=0 的求解姿勢必須等於存檔座標。
// 與 app 的 applySnapshot 相同：normalizeSnapshot 後 alignSavedInputPhase。
// SAVED_POSE 為 main 1098c7f1 上 θ=0 已與存檔姿勢一致的內建範例；之後不得退步，也不得因開檔而改相位。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BLOCK_EXAMPLES,loadUnitStarts} from '../js/blocks/examples.js';
import {normalizeSnapshot,alignSavedInputPhase} from '../js/blocks/schema.js';
import {readStoredProject} from '../js/blocks/project-envelope.js';
import {compileAssembly,solveAssembly} from '../js/blocks/assembly.js';

const SAVED_POSE=["bell-crank-gripper","parallel-gripper","hydraulic-h01","hydraulic-h02","hydraulic-h03","hydraulic-h07","hydraulic-h05","hydraulic-h06","hydraulic-h08","wiper-single","wiper-missing-coupler","fourbar-crank-rocker","fourbar-missing-coupler","fourbar-double-crank","fourbar-double-rocker","tipping-bucket","parallel-fourbar","slider-crank","pantograph","quick-return","gear-gripper","jansen-leg","competition-fourbar-lift","competition-roller-intake","slider-crank-practice","assembly-lift-gripper","assembly-lift-gripper-practice","lift-bucket","single-servo-claw","single-axis-wrist","six-bar-lift","continuous-roller-intake","crank-catapult-study","guided-scissor-lift","clawbot-geared-lift","clawbot-lift-gripper","clawbot-lift-gripper-practice","iq-mad-box","iq-passive-fork","iq-passive-spatula","iq-passive-combined","iq-wheel-grabber","iq-linq-lift","hydraulic-h01-practice","hydraulic-h02-practice","hydraulic-h03-practice","tab-nut-m3","unit7-start","unit11-start","unit12-start","syringe-fixed-start","syringe-pivot-start","servo-plate-arm","servo-plate-fourbar","motor-plate-tt","motor-plate-n20","torque-arm-direct","torque-arm-geared"];
const keys=['p1','p2','p3'];
const openPose=s=>solveAssembly(compileAssembly(s.comps,s.modules,{params:s.params}),{thetaDeg:0,motorAngles:{...s.motorAngles,[String(s.activeMotor||'1')]:0}});
const worst=(s,sol)=>Math.max(0,...s.comps.filter(c=>!c.moduleId).flatMap(c=>keys.map(k=>c[k]).filter(p=>p?.id&&sol.points?.[p.id]&&Number.isFinite(p.x)).map(p=>Math.hypot(sol.points[p.id].x-p.x,sol.points[p.id].y-p.y))));
await loadUnitStarts();
let checked=0;
for(const e of BLOCK_EXAMPLES){
 const raw=new Map(e.snapshot.comps.map(c=>[c.id,c])),s=alignSavedInputPhase(normalizeSnapshot(structuredClone(e.snapshot)));
 for(const c of s.comps)if(c.type==='bar'&&c.isInput)assert.equal(Number(c.phaseOffset||0),Number(raw.get(c.id)?.phaseOffset||0),`${e.id}:${c.id} phase unchanged on open`);
 if(!SAVED_POSE.includes(e.id))continue;
 const sol=openPose(s);assert.ok(sol&&sol.isValid!==false,`${e.id} opens solvable`);assert.ok(worst(s,sol)<0.01,`${e.id} opens at its saved pose (${worst(s,sol)})`);checked++;
}
assert.equal(checked,SAVED_POSE.length,'every listed example still present');

// 學生原檔：輸入桿存檔角度與相位 0 不符；開檔以存檔姿勢為準，馬達→Blank135.A 為 131°。
const file=JSON.parse(readFileSync(new URL('./fixtures/connected-resize.json',import.meta.url),'utf8'));
assert.equal(readStoredProject(structuredClone(file)).comps.find(c=>c.id==='Blank135').phaseOffset,0,'fixture keeps its inconsistent saved phase');
const s=alignSavedInputPhase(normalizeSnapshot(structuredClone(file))),sol=openPose(s);
assert.ok(sol.isValid!==false);assert.ok(worst(s,sol)<0.01,`student work opens at its saved pose (${worst(s,sol)})`);
const A=sol.points['Blank135.A'],O=sol.points.Blank133_H24_32;assert.ok(Math.abs(Math.atan2(A.y-O.y,A.x-O.x)*180/Math.PI-131.04)<0.1,'Blank135 at 131°');
console.log(`saved pose: ${checked} built-in examples and the student work open at their saved pose; no example phase changed`);
