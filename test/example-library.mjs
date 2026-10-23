// Every public example must have an explicit acceptance category; additions cannot silently skip this audit.
import assert from 'node:assert/strict';
import {BLOCK_EXAMPLES,getExampleLesson} from '../js/blocks/examples.js';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
import {compileTopology} from '../js/core/topology.js';
import {compileAssembly,solveAssembly} from '../js/blocks/assembly.js';
import {motionPoseIssue,inspectMotionRange} from '../js/blocks/solve-health.js';
import {planMotion} from '../js/blocks/motion.js';
import {scanSyringe} from '../js/blocks/syringe-operations.js';
import {encodeSnapshot,decodeShareString} from '../js/share-codec.js';
import {prepareScopedExport} from '../js/blocks/export-scope.js';
import {FABRICATION_DEFAULTS} from '../js/blocks/fabrication-profile.js';
const groups={
 hydraulic:['hydraulic-h01','hydraulic-h02','hydraulic-h03','hydraulic-h04','hydraulic-h05','hydraulic-h06'],
 incomplete:['hydraulic-h01-practice','hydraulic-h02-practice','hydraulic-h03-practice','wiper-missing-coupler','fourbar-missing-coupler'],
 manual:['pantograph'],empty:['empty-challenge'],static:['tab-nut-m3'],
 motion:['parallel-gripper','wiper-single','fourbar-crank-rocker','fourbar-double-crank','fourbar-double-rocker','tipping-bucket','parallel-fourbar','chebyshev-linkage','slider-crank','quick-return','gear-pair','reduction-gear-train','rack-pinion','gear-gripper','cam-follower','pulley-belt','sprocket-chain','jansen-leg','competition-fourbar-lift','competition-roller-intake','competition-rack-lift','slider-crank-practice','assembly-lift-gripper','assembly-lift-gripper-practice','lift-bucket','single-servo-claw','single-axis-wrist']
};
assert.deepEqual(Object.values(groups).flat().sort(),BLOCK_EXAMPLES.map(e=>e.id).sort());
for(const e of BLOCK_EXAMPLES){
 const before=JSON.stringify(e.snapshot),s=normalizeSnapshot(e.snapshot),lesson=getExampleLesson(e.id);
 assert.ok(lesson.use&&lesson.try?.length,e.id+' actionable instructions');
 const round=normalizeSnapshot(decodeShareString(encodeSnapshot(toSnapshot(s.comps,s,s.counter,s))));
 assert.deepEqual(round.comps,s.comps,e.id+' editable geometry survives sharing');
 assert.deepEqual(round.modules,s.modules,e.id+' connections survive sharing');
 const compiled=compileTopology(s.comps,{params:s.params},new Set());
 const assembly=compileAssembly(s.comps,s.modules,{params:s.params});
 const pose=solveAssembly(assembly,{thetaDeg:0});
 const issue=motionPoseIssue(s.comps,pose);
 if(groups.empty.includes(e.id))assert.equal(issue.code,'invalid_pose');
 else if(e.id==='hydraulic-h03-practice')assert.equal(issue.code,'missing_points'); // No input yet: both jaw branches lack solved points.
 else if([...groups.incomplete,...groups.manual].includes(e.id))assert.equal(issue.code,'underconstrained');
 else if(groups.static.includes(e.id))assert.equal(issue,null,e.id+' fixed assembly pose');
 else if(groups.hydraulic.includes(e.id)){
   const c=s.comps.find(c=>c.type==='syringe');assert.ok(scanSyringe(s.comps,s.params,c.id).ok,e.id+' stroke');
 }else{
   assert.equal(issue,null,e.id+' initial pose');
   const ids=new Set();
   function motors(v){if(!v||typeof v!=='object')return;for(const [k,x] of Object.entries(v)){if(['physicalMotor','physical_motor'].includes(k))ids.add(String(x));else motors(x);}}
   motors(s.comps);if(!ids.size)ids.add('1');
   for(const id of ids){
     const frozen=Object.fromEntries([...ids].map(i=>[i,0]));
     const drive=s.comps.find(c=>c.motorType==='mg995'&&String(c.physicalMotor||c.p1?.physicalMotor)===id);
     const solve=p=>solveAssembly(assembly,p);
     const plan=drive?{mode:'rock',lo:Math.min(drive.servoStart,drive.servoEnd),hi:Math.max(drive.servoStart,drive.servoEnd)}:planMotion(compiled,{params:s.params},0,pose.points,{active:id,frozen},solve);
     const result=inspectMotionRange({comps:s.comps,theta:0,plan,solveAt:(thetaDeg,_prevPoints)=>solve({thetaDeg,_prevPoints,motorAngles:{...frozen,[id]:thetaDeg}})});
     assert.ok(result.ok,`${e.id} M${id}: ${JSON.stringify(result)}`);
   }
 }
 // Match the loader's default fabrication profile; scope is the saved assembly membership.
 const exportSource={...s,topo:s,fabrication:s.fabrication||structuredClone(FABRICATION_DEFAULTS),exportSettings:FABRICATION_DEFAULTS.export};
 for(const format of ['svg','dxf']){
   if(groups.hydraulic.includes(e.id))assert.throws(()=>prepareScopedExport(exportSource,{scope:'assembly'},format),/管夾固定案例.*不輸出加工檔/);
   else if(groups.empty.includes(e.id))assert.throws(()=>prepareScopedExport(exportSource,{scope:'assembly'},format),/沒有零件/);
   else {
     const out=prepareScopedExport(exportSource,{scope:'assembly'},format);
     assert.ok(out.files.length&&out.files.every(f=>!/(NaN|Infinity)/.test(f.text)),e.id+' finite '+format);
     if(['slider-crank','quick-return','slider-crank-practice','cam-follower','pulley-belt','competition-roller-intake'].includes(e.id))assert.ok(out.notices.some(n=>n.includes('未提供獨立板材檔')),e.id+' partial export is disclosed');
   }
 }
 assert.equal(JSON.stringify(e.snapshot),before,e.id+' source unchanged');
 console.log('PASS',e.id,Object.entries(groups).find(([,ids])=>ids.includes(e.id))[0]);
}
console.log(`example-library: ${BLOCK_EXAMPLES.length} public entries checked`);
