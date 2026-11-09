import assert from 'node:assert/strict';
import {makeStandardBlank,resizeStandardBlank} from '../js/blocks/standard-blank.js';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
import {compileTopology} from '../js/core/topology.js';
import {solveTopology} from '../js/multilink/solver.js';
import {hiddenGridHoles} from '../js/blocks/grid-hole-display.js';
import {inspectPlateExport} from '../js/blocks/exporters.js';
import {encodeSnapshot,decodeShareString} from '../js/share-codec.js';
const made=makeStandardBlank({kind:'plate',columns:32,rows:32});assert.ok(made.ok);
const c=made.comp;c.p1.type='motor';c.p1.physicalMotor='1';c.p2.type='floating';
const drive={type:'bar',id:'Drive',isInput:true,p1:{...c.p1},p2:{...c.p2},lenParam:c.gParam};
const h=c.holes.find(h=>h.u===16&&h.v===8);
const other={type:'bar',id:'Follower',p1:{id:h.id,type:'floating',x:h.u,y:h.v},p2:{id:'Tip',type:'floating',x:48,y:8},lenParam:'FollowLength',fixedLen:true};
const comps=[c,drive,other],params={...made.params,FollowLength:32};
const t=compileTopology(comps,{params:{...params}},new Set());
assert.ok(t._passiveLocalHoles[0].holes.length>1000);
assert.ok(t._wizard_data.length<10,'unused grid holes must not become constraint bodies');
assert.ok(t._wizard_data.some(c=>c.p3?.id===h.id),'connected hole must retain a real constraint');
for(const angle of [0,37,90]){
 const sol=solveTopology(t,{thetaDeg:angle}),r=angle*Math.PI/180;
 for(const hole of c.holes){const p=sol.points[hole.id];assert.ok(p);assert.ok(Math.abs(p.x-(hole.u*Math.cos(r)-hole.v*Math.sin(r)))<1e-5);assert.ok(Math.abs(p.y-(hole.u*Math.sin(r)+hole.v*Math.cos(r)))<1e-5);}
 assert.ok(Math.abs(Math.hypot(sol.points.Tip.x-sol.points[h.id].x,sol.points.Tip.y-sol.points[h.id].y)-32)<1e-5);
}
// Grounding an interior hole must not be optimized away.
const fixed=structuredClone(c);fixed.p1.type='fixed';delete fixed.p1.physicalMotor;fixed.holes[0].type='fixed';
const ft=compileTopology([fixed],{params:{...made.params}},new Set()),fs=solveTopology(ft,{thetaDeg:0});assert.ok(fs.isValid&&!fs.isUnderconstrained);assert.ok(ft._wizard_data.some(c=>c.p3?.id===fixed.holes[0].id));
const saved=normalizeSnapshot(decodeShareString(encodeSnapshot(toSnapshot(comps,{params},1))));assert.ok(saved);assert.equal(saved.comps[0].holes.length,c.holes.length);
assert.equal(inspectPlateExport(c,[c.p1,c.p2,c.p3]).holes.length,1024,'display thinning must not change export geometry');
assert.equal(resizeStandardBlank(c,params,'g',8,{comps}).ok,false,'connected holes still prevent unsafe shrink');
assert.ok(makeStandardBlank({kind:'bar',lengthMm:1600}).ok);
assert.equal(makeStandardBlank({kind:'plate',columns:10000,rows:10000}).ok,false);
const points=solveTopology(t,{thetaDeg:0}).points,bounds={left:-1,top:-1,right:10000,bottom:10000};
const keep=c.holes[20].id,small=hiddenGridHoles(comps,points,{params,keep:[keep],bounds,project:p=>p});
assert.ok(small.size>700);assert.ok(!small.has(h.id)&&!small.has(keep));
const zoom=hiddenGridHoles(comps,points,{params,bounds,project:p=>({x:p.x*4,y:p.y*4})});assert.equal(zoom.size,0,'zooming in restores each grid hole');
c.standardBlank.drill='all';assert.equal(hiddenGridHoles(comps,points,{params,keep:[keep],bounds,project:p=>p}).size,small.size);
assert.equal(inspectPlateExport(c,[c.p1,c.p2,c.p3]).holes.length,1024);
console.log('dense grid: 1024 holes, constraints, poses, save/share, export, shrink refusal and zoom thinning passed');
