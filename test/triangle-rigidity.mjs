import assert from 'node:assert/strict';
import { compileTopology } from '../js/core/topology.js';
import { solveTopology } from '../js/multilink/solver.js';
const fixture = {"comps": [{"type": "anchor", "id": "Anchor1", "p1": {"id": "A1", "type": "fixed", "x": 144.6067698403858, "y": -55.88620740005005}}, {"type": "anchor", "id": "Anchor2", "p1": {"id": "A2", "type": "fixed", "x": -102.85714285714286, "y": -47.99999999999999}}, {"type": "triangle", "id": "Tri3", "color": "#27ae60", "p1": {"id": "A1", "type": "floating", "x": 144.6067698403858, "y": -55.88620740005005}, "p2": {"id": "T3b", "type": "floating", "x": 142.9051149111698, "y": 62.10152234546998}, "p3": {"id": "T3c", "type": "floating", "x": 51.15299748040505, "y": -26.383793402397295}, "gParam": "TG3", "r1Param": "TR1_3", "r2Param": "TR2_3", "sign": 1, "vertices": [{"solve": true, "ref": "p1"}, {"solve": true, "ref": "p2"}, {"solve": true, "ref": "p3"}]}, {"type": "bar", "id": "Link4", "color": "#3498db", "p1": {"id": "A2", "type": "fixed", "x": -102.85714285714286, "y": -47.99999999999999, "physicalMotor": "1"}, "p2": {"id": "T3b", "type": "floating", "x": 142.9051149111698, "y": 62.10152234546998}, "lenParam": "LL4", "isInput": true, "fixedLen": true, "motorType": "tt", "phaseOffset": 24.132385587542338, "physicalMotor": "1", "motorMount": {"motor": "1", "center": "A2", "outputBody": "Link4", "orientation": "horizontal", "order": ["motor", "outputBody"]}}, {"type": "bar", "id": "Link5", "color": "#3498db", "p1": {"id": "A2", "type": "floating", "x": -102.85714285714286, "y": -47.99999999999999}, "p2": {"id": "P5b", "type": "floating", "x": -26.54716943969909, "y": -170.11792643600293}, "lenParam": "LL5", "isInput": false, "fixedLen": true}, {"type": "bar", "id": "Link6", "color": "#3498db", "p1": {"id": "P5b", "type": "floating", "x": -26.54716943969909, "y": -170.11792643600293}, "p2": {"id": "T3c", "type": "floating", "x": 51.15299748040505, "y": -26.383793402397295}, "lenParam": "LL6", "isInput": false, "fixedLen": true}], "params": {"theta": 0, "TG3": 118, "TR1_3": 98, "TR2_3": 215, "LL4": 269, "motorDirection": -1, "LL5": 144, "LL6": 163}};
const compiled = compileTopology(fixture.comps, {params: fixture.params}, new Set());
let rejected = 0;
for (let theta=0;theta<360;theta+=5) {
  const sol=solveTopology(compiled,{thetaDeg:theta});
  if (!sol.isValid) { rejected++; continue; }
  const t=fixture.comps.find(c=>c.type==='triangle');
  for (const [a,b,key] of [['p1','p2','gParam'],['p1','p3','r1Param'],['p2','p3','r2Param']]) {
    const p=sol.points[t[a].id],q=sol.points[t[b].id];
    assert.ok(Math.abs(Math.hypot(p.x-q.x,p.y-q.y)-fixture.params[t[key]])<=1e-3);
  }
}
assert.ok(rejected>0);
// A free rotating plate attached at its base is still a valid rigid body.
const plate=structuredClone(fixture.comps.find(c=>c.type==='triangle'));
const driver={type:'bar',id:'drive',p1:{...plate.p1,type:'fixed'},p2:plate.p2,lenParam:'TG3',isInput:true};
const valid=compileTopology([fixture.comps[0],plate,driver],{params:fixture.params},new Set());
for(let theta=0;theta<360;theta+=5) assert.equal(solveTopology(valid,{thetaDeg:theta}).isValid,true);
console.log('PASS: invalid closed plate rejected; valid rotating plate passes 72 angles');
