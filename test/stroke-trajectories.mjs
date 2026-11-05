import assert from 'node:assert/strict';
import {scopeTrajectories,sampleStroke} from '../js/blocks/trajectory.js';
import {traceSegments,traceSweeps} from '../js/blocks/motion.js';
import {memberSweepSegments} from '../js/blocks/member-sweep.js';
import {workRangeFromTrace} from '../js/blocks/measurement.js';
import {diskTurntableSnapshot,pivotTurntableSnapshot} from '../js/blocks/disk-turntable-example.js';
import {hydraulicSnapshot} from '../js/blocks/hydraulic-example.js';
import {hydraulicArmSnapshot} from '../js/blocks/hydraulic-assembly-example.js';
import {createSimulationScope} from '../js/blocks/simulation-scope.js';
import {compileTopology} from '../js/core/topology.js';
import {compileAssembly} from '../js/blocks/assembly.js';
import {getExample} from '../js/blocks/examples.js';
function traces(work,id,ids,mode='design'){
 const compiled=compileTopology(work.comps,work),modules=work.modules||[],assembly=modules.length?compileAssembly(work.comps,modules,work):null;
 const scope=createSimulationScope({comps:work.comps,modules,topo:work,compiled,assembly,mode,designFocus:'#root'});
 return scopeTrajectories({scope,params:work.params,ids,syringeId:id,motion:{thetaDeg:0,motorAngles:{}},sweepMotor:'1'});
}
for(const source of [hydraulicSnapshot,diskTurntableSnapshot,pivotTurntableSnapshot]){
 const w=structuredClone(source),syr=w.comps.find(c=>c.type==='syringe'),arm=w.comps.find(c=>c.id===(syr.outputId||syr.b.componentId)),ids=[w.tracePoint,arm.p1.id],before=JSON.stringify(w),start=performance.now();
 const [moving,center]=traces(w,syr.id,ids);
 assert.equal(JSON.stringify(w),before,'sampling is read-only');
 assert.ok(moving.results.length>=49&&moving.results.length<=51);assert.ok(moving.results.every(r=>r.isValid));
 assert.equal(moving.results[0].inputValue,0);assert.equal(moving.results.at(-1).inputValue,syr.spec.stroke);
 assert.ok(moving.results.every(r=>r.inputUnit==='mm'&&r.theta===undefined));
 assert.equal(traceSegments(moving).length,1);assert.ok(workRangeFromTrace(moving).distance>1);
 assert.equal(traceSegments(center).length,0);assert.equal(workRangeFromTrace(center),null);
 assert.equal(memberSweepSegments(moving.results,arm.p1.id,arm.p2.id).length,moving.results.length);
 if(arm.shape==='disk')for(const r of moving.results)assert.ok(Math.abs(Math.hypot(r.B.x-r.points[arm.p1.id].x,r.B.y-r.points[arm.p1.id].y)-w.params[arm.lenParam])<1e-5);
 console.log(syr.id,moving.results.length,'samples',Math.round(performance.now()-start),'ms');
 const renamed=JSON.parse(JSON.stringify(w).replaceAll('H','Renamed'));assert.equal(JSON.stringify(traces(renamed,'Renamed'+syr.id.slice(1),ids.map(x=>'Renamed'+x.slice(1))).map(t=>t.results)),JSON.stringify([moving,center].map(t=>t.results)).replaceAll('H','Renamed'));
}
const big=structuredClone(diskTurntableSnapshot);big.params.H7Crank=43;
assert.ok(traceSegments(traces(big,'H7Syringe',['H7B'])[0]).length,'edited disk radius has a path');
const pair=traces(diskTurntableSnapshot,'H7Syringe',['H7B','H7P','missing']);
assert.ok(workRangeFromTrace(pair[1]).distance>19.9,'any moving point, including a linear rod end, can be traced');
assert.ok(workRangeFromTrace(pair[1]).spanY<1e-6);
assert.ok(pair[0].results.every((r,i)=>r.points===pair[1].results[i].points),'all selected points share the same samples');
assert.deepEqual(traceSegments(pair[2]),[]);
const arm=structuredClone(hydraulicArmSnapshot),before=JSON.stringify(arm);
for(const s of arm.comps.filter(c=>c.type==='syringe')){
 const t=traces(arm,s.id,['H7B','H2C'],'bench');assert.ok(t[0].results.some(r=>r.isValid));
}
assert.equal(JSON.stringify(arm),before,'assembly sweep keeps every other actuator and its stored pose');
const sampled=[];const limited=sampleStroke({stroke:10,current:5,segments:10,solve:(v)=>{sampled.push(v);return {ok:v>=3&&v<=7,points:{P:{x:v,y:0}}};}});
assert.deepEqual(sampled,[5,4,3,2,6,7,8]);assert.deepEqual(limited.map(r=>r.isValid),[false,true,true,true,true,true,false]);
assert.equal(sampleStroke({stroke:10,current:5,solve:()=>({ok:false})}).length,1);
const split={results:[0,1,null,3,4].map(x=>({isValid:x!==null,B:x===null?null:{x,y:0}}))};assert.equal(traceSegments(split).length,2,'never bridge invalid samples');
assert.equal(workRangeFromTrace(split).partial,true);
const motor=getExample('fourbar-crank-rocker').snapshot,compiled=compileTopology(motor.comps,motor),scope={comps:motor.comps,compiled,modules:[]};
assert.deepEqual(scopeTrajectories({scope,params:motor.params,ids:['D'],motion:{thetaDeg:0,motorAngles:{}},sweepMotor:'1'}),traceSweeps(compiled,{...compiled.params,motorAngles:{},sweepMotor:'1'},['D'],0,360,5));
console.log('stroke trajectories passed');
