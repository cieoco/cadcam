import assert from 'node:assert/strict';
import {frameGroundAxis,planFrameGroundChange} from '../js/blocks/frame-ground.js';
import {S} from '../js/blocks/state.js';
import * as Panels from '../js/blocks/panels.js';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const single=[{id:'A',x:0,y:0}],pair=[{id:'B',x:8,y:0},...single];
assert.equal(planFrameGroundChange(single,'angle',5).ok,false);
assert.equal(planFrameGroundChange(single,'length',8).ok,false);
const rotated=planFrameGroundChange(pair,'angle',5);
assert.equal(rotated.id,'B');near(rotated.x,8*Math.cos(Math.PI/36));near(rotated.y,8*Math.sin(Math.PI/36));
near(Math.hypot(rotated.x,rotated.y),8); // Small steps must not snap back to the original 8 mm grid.
const roundTrip=planFrameGroundChange([single[0],rotated],'angle',-5);near(roundTrip.x,8);near(roundTrip.y,0);
const negative=planFrameGroundChange(pair,'angle',100);
assert.equal(frameGroundAxis([negative,...single]).target.id,'B'); // Crossing x=0 must not swap the edited axis.
near(frameGroundAxis([negative,...single]).angle,100);
let moving=pair[0];for(let i=0;i<72;i++){const next=planFrameGroundChange([single[0],moving],'angle',5);assert.equal(next.ok,true,next.reason);moving=next;}near(moving.x,8);near(moving.y,0);
const coincident=[single[0],{id:'B',x:0,y:0}];
assert.equal(planFrameGroundChange(coincident,'angle',5).ok,false);
assert.equal(planFrameGroundChange(coincident,'length',8).ok,true);
assert.equal(planFrameGroundChange(pair,'length',-8).ok,false);
const snapshot=toSnapshot([single[0],rotated].map((p,i)=>({id:`Anchor${i}`,type:'anchor',p1:{...p,type:'fixed'}})),{params:{}},2);
near(normalizeSnapshot(JSON.parse(JSON.stringify(snapshot))).comps[1].p1.y,rotated.y);

const elements=new Map(['frameEditor','frameLengthVal','frameAngleVal','frameAxisHint','frameLengthMinus','frameLengthPlus','frameAngleMinus','frameAnglePlus'].map(id=>[id,{style:{},textContent:'',disabled:false}]));
globalThis.document={getElementById:id=>elements.get(id)||null};
let shown=single;
Panels.init({pointCoords:()=>({A:single[0],Foreign:{x:100,y:100}}),pointIsGround:()=>true,frameGroundInfo:()=>frameGroundAxis(shown)});
S.frameEditorOpen=true;Panels.updateFrameEditor();
assert.equal(elements.get('frameAnglePlus').disabled,true);assert.equal(elements.get('frameLengthPlus').disabled,true);
assert.equal(elements.get('frameAngleVal').textContent,'—');assert.match(elements.get('frameAxisHint').textContent,/只有一個固定軸/);
shown=pair;Panels.updateFrameEditor();assert.equal(elements.get('frameAnglePlus').disabled,false);assert.equal(elements.get('frameLengthVal').textContent,'8 mm');
shown=[negative,...single];Panels.updateFrameEditor();assert.equal(elements.get('frameAngleVal').textContent,'100°');
shown=coincident;Panels.updateFrameEditor();assert.equal(elements.get('frameAnglePlus').disabled,true);assert.equal(elements.get('frameLengthPlus').disabled,false);
console.log('PASS fixed-axis editing: unavailable single/coincident angles, precise 5° rotation, stable pair, scoped inspector and save round-trip');
