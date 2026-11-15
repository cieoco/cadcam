import assert from 'node:assert/strict';
import {makeStandardBlank,resizeStandardBlank} from '../js/blocks/standard-blank.js';
import {holeWorld} from '../js/core/local-holes.js';
import {planResize} from '../js/blocks/resize-plan.js';
import {fourWheelChassisSnapshot} from '../js/blocks/four-wheel-chassis-example.js';
import {synchronizeDesignInstances} from '../js/blocks/design-instances.js';
import {refreshFaceMounts} from '../js/blocks/face-mount-refresh.js';
import {compileAssembly,solveAssembly} from '../js/blocks/assembly.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {storedProject} from '../js/blocks/project-envelope.js';
import {TAB_NUT_DEFAULTS} from '../js/blocks/tab-nut-geometry.js';
import {tabNutPlans} from '../js/blocks/tab-nut-plan.js';

const point=(a,b)=>assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-7,`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const center=c=>({x:(c.p2.x+c.p3.x)/2,y:(c.p2.y+c.p3.y)/2});
for(const angle of [0,37,123])for(const axis of ['g','r1'])for(const basis of ['start','center','end']){
 const made=makeStandardBlank({kind:'plate',lengthMm:64,heightMm:48,origin:{x:10.25,y:-5.5}}),c=made.comp;
 const t=angle*Math.PI/180,origin={...c.p1};for(const key of ['p2','p3']){const u=c[key].x-origin.x,v=c[key].y-origin.y;c[key].x=origin.x+u*Math.cos(t)-v*Math.sin(t);c[key].y=origin.y+u*Math.sin(t)+v*Math.cos(t);}
 const h=c.holes.find(h=>h.u===24&&h.v===24),location=holeWorld(c,h),anchor={id:'Used',type:'anchor',p1:{id:h.id,type:'fixed',...location}},before=JSON.stringify([c,made.params]);
 const r=resizeStandardBlank(c,made.params,axis,axis==='g'?48:32,{basis,comps:[c,anchor]});assert.ok(r.ok,r.message);
 if(basis==='start')point(r.comp.p1,c.p1);else if(basis==='center')point(center(r.comp),center(c));else point(r.comp[axis==='g'?'p2':'p3'],c[axis==='g'?'p2':'p3']);
 point(holeWorld(r.comp,r.comp.holes.find(q=>q.id===h.id)),location);
 assert.equal(new Set(r.comp.holes.map(h=>h.id)).size,r.comp.holes.length);
 assert.equal(JSON.stringify([c,made.params]),before);
 const expanded=resizeStandardBlank(r.comp,{...made.params,...r.params},axis,axis==='g'?64:48,{basis,comps:[r.comp,anchor]});assert.ok(expanded.ok,expanded.message);point(expanded.comp.p1,c.p1);point(expanded.comp.p3,c.p3);assert.equal(new Set(expanded.comp.holes.map(h=>h.id)).size,expanded.comp.holes.length);
}
const work=fourWheelChassisSnapshot(),before=JSON.stringify(work),source=work.comps.find(c=>c.id==='Blank3'),motor=work.comps.filter(c=>c.moduleId==='Mod1'&&c.motorMount),locations=motor.map(c=>({...c.p1}));
// Non-grid changes preserve connected motor-hole identity and position too.
for(const height of [32,40,39.5]){
 const r=planResize(work,{componentId:source.id,id:'r1',raw:height,basis:'center'});assert.ok(r.ok,r.message);const board=r.comps.find(c=>c.id===source.id);point(center(board),center(source));
 for(const [i,m]of motor.entries()){const hole=[...board.holes,...board.standardBlank.mountHoles||[]].find(h=>h.id===m.p1.id);assert.ok(hole);point(holeWorld(board,hole),locations[i]);point(r.comps.find(c=>c.id===m.id).p1,locations[i]);}
 const synced=synchronizeDesignInstances({...work,...r});assert.ok(synced.ok,synced.reason);assert.equal(synced.params['Blank3.H_139'],height);
 const modules=refreshFaceMounts(synced.comps,synced.modules,synced.params,{stockMm:3,exportSettings:work.fabrication.export}).modules;
 assert.ok(solveAssembly(compileAssembly(synced.comps,modules,{params:synced.params}),{thetaDeg:0,motorAngles:{'1':0,'2':0,'3':0,'4':0}}).isValid);
 assert.ok(normalizeSnapshot(storedProject({...work,...synced,modules})));
}
const tiny=planResize(work,{componentId:source.id,id:'r1',raw:8,basis:'center'});assert.equal(tiny.ok,false,'a board cannot shrink past its motor mount');assert.equal(JSON.stringify(work),before);
const fixed=structuredClone(source),shared={id:'Other',type:'bar',p1:{...fixed.p1},p2:{id:'Other.end',type:'fixed',x:fixed.p1.x+5,y:fixed.p1.y+10},lenParam:'Other.len'};
assert.equal(resizeStandardBlank(fixed,work.params,'r1',32,{basis:'center',comps:[fixed,shared]}).ok,false,'a shared fixed primary hole cannot move');
const watched=work.comps.find(c=>c.id==='Blank3').holes.find(h=>h.v===0);
assert.equal(planResize(work,{componentId:source.id,id:'r1',raw:32,basis:'center',topo:{tracePoint:watched.id}}).ok,false,'traced points cannot silently disappear');
assert.equal(JSON.stringify(work),before);
console.log('resize basis: fixed A/B/C and center, rotated boards, connected motor holes, non-grid dimensions, unique IDs, shared sides, solve/save and refusals passed');
