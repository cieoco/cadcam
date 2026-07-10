import assert from 'node:assert/strict';
import { rackGuideTravel, rackGuideThetaRange } from '../js/blocks/rack-limits.js';
import { normalizeSnapshot } from '../js/blocks/schema.js';
import { compileTopology } from '../js/core/topology.js';
import { solveTopology } from '../js/multilink/solver.js';
const travel=rackGuideTravel(144,5);
assert.equal(travel.separation,11.52);
assert.ok(Math.abs(travel.travel-115.96)<1e-9);
const range=rackGuideThetaRange(30,144,5);
assert.ok(range&&Math.abs((range.hi-range.lo)*Math.PI/180*30-travel.travel)<1e-9);
assert.equal(rackGuideThetaRange(30,20,20),null);
const snap=normalizeSnapshot({kind:'blocks',v:1,comps:[
  {type:'gear',id:'G',p1:{id:'GC',type:'motor',x:0,y:0,physicalMotor:'1'},p2:{id:'GP',type:'floating',x:20,y:0},radiusParam:'GR',teeth:15,module:4},
  {type:'rack',id:'R',p1:{id:'RP',type:'floating',x:30,y:0},pinion:'G',lenParam:'RL',axisDeg:90,holes:[{id:'RH',u:40,v:-10,diameter:5},{id:'RA',role:'endA',v:-10},{id:'RB',role:'endB',v:-10}]}
],params:{GR:30,RL:160}});
assert.equal(snap.comps.find(c=>c.id==='R').holes[0].id,'RH');
const compiled=compileTopology(snap.comps,{params:snap.params},new Set());
const solved=solveTopology(compiled,{thetaDeg:90}).points;
assert.ok(solved.RH&&Math.abs(solved.RH.x-40)<1e-6&&Math.abs(solved.RH.y-(40+15*Math.PI))<1e-6,'齒條孔應隨剛體直線移動');
assert.ok(Math.abs(Math.hypot(solved.RB.x-solved.RA.x,solved.RB.y-solved.RA.y)-160)<1e-6,'兩端主孔距應等於齒條長度參數');
console.log('rack guide limits: ok');
