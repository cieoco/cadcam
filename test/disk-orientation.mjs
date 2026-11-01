import assert from 'node:assert/strict';
import {diskOrientationMark} from '../js/blocks/disk-orientation.js';
import {pivotTurntableSnapshot} from '../js/blocks/disk-turntable-example.js';
import {buildSyringeInstallPreview} from '../js/blocks/syringe-install-preview.js';
import {applyMatrix4} from '../js/blocks3d/orthogonal-3d.js';
import {exportLinksAsSvg,exportLinksAsDxf} from '../js/blocks/exporters.js';
const source=structuredClone(pivotTurntableSnapshot),before=JSON.stringify(source),poses=[];
for(const extension of [0,10,20]){
 const work=structuredClone(source);work.comps.find(c=>c.type==='syringe').extension=extension;
 const {model,points}=buildSyringeInstallPreview(work),moving=model.materialParts.find(p=>p.partId==='H8Turn'),fixed=model.materialParts.find(p=>p.partId==='H8Frame');
 assert.equal(moving.diskMark.fixed,false);assert.equal(fixed.diskMark.fixed,true);
 assert.ok(!('diskMark' in moving.geometry),'display metadata is outside the fabrication geometry');
 const mark=diskOrientationMark(moving.diskMark.radius,false),tip=applyMatrix4(moving.pose.matrix,{...mark.ink[1][0],z:0});
 const a=points.H8O,b=points.H8B,v={x:tip.x-a.x,y:tip.y-a.y},u={x:b.x-a.x,y:b.y-a.y};
 assert.ok(Math.abs(v.x*u.y-v.y*u.x)<1e-5&&v.x*u.x+v.y*u.y>0,'arrow follows the output hole');
 const ref=diskOrientationMark(fixed.diskMark.radius,true,fixed.diskMark.angle),tick=applyMatrix4(fixed.pose.matrix,{...ref.ink[0][0],z:0});
 assert.ok(tick.y>a.y,'fixed tick points up in the assembly plane');poses.push({tip,tick});
}
assert.ok(Math.hypot(poses[0].tip.x-poses[2].tip.x,poses[0].tip.y-poses[2].tip.y)>30,'arrow makes rotation visible at the rim');
assert.deepEqual(poses[0].tick,poses[2].tick,'fixed reference does not follow the driven plate');
for(const radius of [10,70,210,1000])for(const fixed of [false,true]){
 const p=diskOrientationMark(radius,fixed,Math.PI/4);assert.equal(p.ink.length,fixed?1:2);assert.ok(p.ink.flat().every(v=>Number.isFinite(v.x)&&Number.isFinite(v.y)));
}
const comp=source.comps.find(c=>c.id==='H8Turn');
const outputs=()=>[exportLinksAsSvg,exportLinksAsDxf].map(fn=>{let text='';fn([comp],{},source.params,{holeDiameterMm:3.2},[],null,t=>text=t);return text;});
const initial=outputs();buildSyringeInstallPreview(source);assert.deepEqual(outputs(),initial,'display marks never enter SVG/DXF');
assert.equal(JSON.stringify(source),before,'no snapshot mutation');
console.log('Disk orientation: arrow follows solved plate, fixed tick stays still, finite small/large marks, separate display metadata and unchanged SVG/DXF passed');
