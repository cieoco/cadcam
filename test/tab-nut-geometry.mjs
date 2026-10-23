import assert from 'node:assert/strict';
import {TAB_NUT_DEFAULTS,planTabNutGeometry,normalizeTabNut} from '../js/blocks/tab-nut-geometry.js';
import {solveFaceMate} from '../js/blocks/face-mate.js';
import {area,inside} from '../js/blocks/part-fusion.js';
const board=(w,h)=>({outlines:[[{x:-w/2,y:-h/2},{x:w/2,y:-h/2},{x:w/2,y:h/2},{x:-w/2,y:h/2}]],holes:[],cutouts:[],box:{min:{x:-w/2,y:-h/2,z:-1.5},max:{x:w/2,y:h/2,z:1.5}}});
const host=board(60,40),child=board(40,30);
const selection={hostFace:'top',childFace:'back',alignU:0,alignV:0,offsetU:0,offsetV:0,gap:0,quarterTurns:0,fastener:{...TAB_NUT_DEFAULTS}};
const fixture=(changes={},h=host,c=child)=>{const s={...selection,...changes};return {host:h,child:c,face:{...solveFaceMate({...s,hostBox:h.box,childBox:c.box}),selection:s}};};
const a=planTabNutGeometry(fixture());assert.equal(a.ok,true,a.reason);
assert.equal(a.hostGeometry.cutouts.length,2);assert.equal(a.hostGeometry.holes.length,1);
assert.equal(a.childGeometry.outlines.length,1);assert.equal(a.childGeometry.cutouts.length,0);
for(const slot of a.hostGeometry.cutouts){const xs=slot.points.map(p=>p.x),ys=slot.points.map(p=>p.y);assert.ok(Math.abs(Math.max(...xs)-Math.min(...xs)-8.15)<1e-6);assert.ok(Math.abs(Math.max(...ys)-Math.min(...ys)-3.15)<1e-6);}
// Independently sample material: two extended tabs, an open stem and wide nut pocket, intact shoulders.
const r=a.childGeometry.outlines[0];
for(const x of [-12,12])assert.ok(inside({x,y:-16.5},r));
assert.ok(!inside({x:0,y:-14},r));assert.ok(!inside({x:2.6,y:-9},r));assert.ok(inside({x:6,y:-14},r));
const notchArea=3.4*9.5+(5.7-3.4)*2.6;
assert.ok(Math.abs(area(r)-(1200+2*8*3-notchArea))<1e-6);
for(const hostFace of ['top','bottom'])for(const childFace of ['front','back','left','right'])for(let quarterTurns=0;quarterTurns<4;quarterTurns++){
  const big=board(100,100),wide=board(60,60),p=planTabNutGeometry(fixture({hostFace,childFace,quarterTurns},big,wide));assert.equal(p.ok,true,`${hostFace}/${childFace}/${quarterTurns}: ${p.reason}`);
}
for(const f of [fixture({gap:1}),fixture({hostFace:'front'}),fixture({fastener:{...TAB_NUT_DEFAULTS,screwLengthMm:8}}),fixture({fastener:{...TAB_NUT_DEFAULTS,screwLengthMm:40}}),fixture({fastener:{...TAB_NUT_DEFAULTS,alongMm:20}}),fixture({},host,board(20,30))])assert.equal(planTabNutGeometry(f).ok,false);
const drilled=structuredClone(host);drilled.holes=[{x:12,y:0,r:2}];assert.equal(planTabNutGeometry(fixture({},drilled)).ok,false);
// All four notch-box corners are inside, yet the concave boundary crosses its middle.
const concave=structuredClone(child);concave.outlines=[[[-20,-15],[20,-15],[20,-11],[0,-11],[0,-9],[20,-9],[20,15],[-20,15]].map(([x,y])=>({x,y}))];
assert.equal(planTabNutGeometry(fixture({},host,concave)).ok,false,'whole edges must clear concave boundaries');
const t=structuredClone(child);t.box.max.z=2.5;assert.equal(planTabNutGeometry(fixture({},host,t)).ok,false);
for(const value of [0,-1,NaN,Infinity,'3',null])assert.equal(normalizeTabNut({...TAB_NUT_DEFAULTS,tabWidthMm:value}),null);
assert.equal(normalizeTabNut({...TAB_NUT_DEFAULTS,version:2}),null);
assert.equal(normalizeTabNut({...TAB_NUT_DEFAULTS,compensation:'auto'}),null);
console.log('PASS tab-nut geometry: outlines, slot sizes, 32 orientations, material samples and invalid fixtures');
