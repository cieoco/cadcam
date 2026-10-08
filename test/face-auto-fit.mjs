import assert from 'node:assert/strict';
import { autoFitFaces } from '../js/blocks/face-auto-fit.js';
import { transformMatePoint } from '../js/blocks/face-mate.js';
const plate={box:{min:{x:-30,y:-20,z:-1.5},max:{x:30,y:20,z:1.5}},outlines:[[{x:-30,y:-20},{x:30,y:-20},{x:30,y:20},{x:-30,y:20}]]};
for(const hostFace of ['top','bottom','left','right','front','back']) for(const childFace of ['top','bottom','left','right','front','back']) for(const quarterTurns of [0,1,2,3]) {
 const selection={hostFace,childFace,quarterTurns,gap:5,offsetU:3,offsetV:-4};
 const original=JSON.stringify(selection),result=autoFitFaces(plate,plate,selection);
 assert.equal(result.ok,true);assert.equal(result.mate.ok,true);assert.equal(JSON.stringify(selection),original);
 assert.equal(result.selection.quarterTurns,quarterTurns);
 if(Math.abs(result.mate.rotation[2][2])<1e-6){
  const z=plate.outlines.flat().map(p=>transformMatePoint(result.mate,{...p,z:0}).z);
  assert.ok(Math.min(Math.abs(Math.min(...z)-1.5),Math.abs(Math.max(...z)+1.5))<1e-6);
 }else assert.equal(result.selection.gap,0);
 const again=autoFitFaces(plate,plate,result.selection);
 assert.ok(Math.abs(again.mate.translation.z-result.mate.translation.z)<1e-6);
}
console.log('auto-fit: 144 face/rotation combinations, contact, immutability and idempotence passed');
