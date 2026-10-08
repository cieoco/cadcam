import assert from 'node:assert/strict';
import { autoFitFaces } from '../js/blocks/face-auto-fit.js';
import { transformMatePoint } from '../js/blocks/face-mate.js';
const plate={box:{min:{x:-30,y:-20,z:-1.5},max:{x:30,y:20,z:1.5}},outlines:[[{x:-30,y:-20},{x:30,y:-20},{x:30,y:20},{x:-30,y:20}]]};
const broad=f=>['top','bottom'].includes(f);
for(const hostFace of ['top','bottom','left','right','front','back']) for(const childFace of ['top','bottom','left','right','front','back']) for(const quarterTurns of [0,1,2,3]) {
 const selection={hostFace,childFace,quarterTurns,gap:5,offsetU:0,offsetV:0};
 const before=JSON.stringify(selection),result=autoFitFaces(plate,plate,selection);
 assert.equal(JSON.stringify(selection),before);
 if(broad(hostFace)===broad(childFace)){assert.equal(result.ok,false);continue;}
 assert.equal(result.ok,true,result.reason); assert.ok(Math.abs(result.mate.rotation[2][2])<1e-6);
 assert.equal(result.selection.offsetV,0);assert.equal(result.selection.gap,0);
 // Selected edge center is exactly on the selected stock face, including thickness.
 const point=transformMatePoint(result.mate,result.mate.child.center);
 for(const k of ['x','y','z'])assert.ok(Math.abs(point[k]-result.mate.host.center[k])<1e-6);
 assert.deepEqual(autoFitFaces(plate,plate,result.selection).selection,result.selection);
}
const selection={hostFace:'back',childFace:'bottom',rotationDeg:90,gap:0,offsetU:0,offsetV:0};
assert.equal(autoFitFaces(plate,plate,selection).selection.offsetV,0,'regression: do not move child vertically onto wrong host face');
assert.equal(autoFitFaces(plate,plate,{...selection,offsetV:1000}).selection.offsetV,0,'recenter when edge is outside material');
console.log('edge fit: face pairs, perpendicularity, exact stock contact, wrong-axis regression and no-contact rejection passed');
import { planFaceBrackets } from '../js/blocks/face-bracket-geometry.js';
const fitted=autoFitFaces(plate,plate,{hostFace:'front',childFace:'bottom',gap:5});
const drilling=planFaceBrackets(plate,plate,fitted.mate);
assert.ok(drilling.brackets.length>0,'reverse edge-to-face generates bracket candidates');
for(const b of drilling.brackets){
 const world=transformMatePoint(fitted.mate,b.childHole);
 for(const k of ['x','y','z'])assert.ok(Math.abs(world[k]-b.childHoleWorld[k])<1e-6,'reverse drilling coordinates must agree');
}
