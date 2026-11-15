import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {encodeSnapshot,decodeShareString} from '../js/share-codec.js';
import {planSplit,mergeDropped} from '../js/blocks/connect-ops.js';
import {firstGearPinTargets,planFirstGearPin} from '../js/blocks/gear-first-pin.js';
import {gearPinMember} from '../js/blocks/gear-pin-connection.js';
import {rotateGearPinnedMember} from '../js/blocks/gear-pin-preview.js';
import {planGearPinConnection} from '../js/blocks/gear-pin-plans.js';
import {pointCoords,previewPointConnection} from '../js/blocks/model.js';
import {compileTopology} from '../js/core/topology.js';
import {solveTopology} from '../js/multilink/solver.js';
import {planInsertPin} from '../js/blocks/pin-ops.js';
import {runEdit} from '../js/blocks/edit-pipeline.js';
import {checkWork} from '../js/blocks/integrity.js';
import {pinPoints} from '../js/core/pin-lock.js';
import {nodeLabel} from '../js/blocks/overlap-picker.js';
import {loadIntegrity} from '../js/blocks/integrity-gate.js';
await loadIntegrity();
globalThis.document={getElementById:()=>null};
const source=normalizeSnapshot(JSON.parse(readFileSync(new URL('./fixtures/gear-arm-on-plate.json',import.meta.url)))),arm=source.comps.find(c=>c.id==='Blank68'),plate=source.comps.find(c=>c.id==='Blank1'),gear=source.comps.find(c=>c.id==='Gear65'),platePin='Blank1_H24_40',gearPin='Gear65_mount0';
assert.match(nodeLabel(source.comps,platePin),/矩形板材.*彎桿.*共用孔/);assert.equal(nodeLabel(source.comps,gearPin),'「齒輪」固定孔');
assert.equal(arm.p2.id,platePin);assert.equal(gearPinMember(source.comps,source.params,arm.p1.id),null,'actual first joint belongs to plate, never inferred as gear');
const split=planSplit(source,platePin);assert.ok(split.ok,split.message);const detached={...source,comps:split.comps,counter:source.counter+1},free=split.comps.find(c=>c.id===arm.id),from=free.p2.id;
assert.notEqual(from,platePin);assert.deepEqual(split.comps.find(c=>c.id===plate.id),plate,'plate hole IDs/geometry remain intact');assert.deepEqual(split.params,source.params);
for(const k of ['p1','p2','p3'])assert.deepEqual({x:free[k].x,y:free[k].y},{x:arm[k].x,y:arm[k].y},'rigid shape/pose retained');
const reopened=normalizeSnapshot(decodeShareString(encodeSnapshot(detached)));assert.notEqual(reopened.comps.find(c=>c.id===arm.id).p2.id,platePin,'reopen does not reconnect to plate');assert.deepEqual(reopened.comps.find(c=>c.id===plate.id).holes,plate.holes);
const drop={comps:structuredClone(detached.comps),topo:{params:detached.params},points:pointCoords(detached.comps),theta:0,angles:{}};
const targets=firstGearPinTargets(detached,drop,from,platePin);assert.equal(targets.length,1);assert.equal(targets[0].id,gearPin);assert.ok(!targets.some(t=>t.id===platePin),'underlying plate never takes the gear drop');assert.ok(targets.every(t=>!t.label.includes('Blank')&&!t.label.includes('Gear65')),'target picker uses readable part/hole labels');
const connected=planFirstGearPin(detached,drop,from,gearPin,gear.id);assert.ok(connected.ok,connected.message);assert.equal(connected.comps.find(c=>c.id===arm.id).p2.id,gearPin);assert.deepEqual(connected.params,source.params);assert.deepEqual(connected.comps.find(c=>c.id===plate.id),plate);
const bad=planFirstGearPin(source,{...drop,comps:source.comps,points:pointCoords(source.comps)},arm.p1.id,gearPin,gear.id);assert.equal(bad.ok,false);assert.match(bad.message,/目前接在「矩形板材」.*還未接到齒輪/);assert.equal(source.comps.find(c=>c.id===arm.id).p2.id,platePin);
// First pin connects immediately with no picker/prompt; the second pin asks exactly once.
{
 const state={comps:structuredClone(detached.comps),topo:{params:{...detached.params}},modules:[],theta:0,motorAngles:{}},undos=[];let prompts=0;
 globalThis.confirm=()=>{prompts++;return true;};
 const host={S:state,transient(){},pushUndo:()=>undos.push(structuredClone(state.comps)),pause(){},rebuild(){},draw(){}};
 assert.equal(mergeDropped({...host,from,to:platePin,drop,chooseTarget:()=>assert.fail('gear/plate picker must not open')}),true);assert.equal(prompts,0);assert.equal(undos.length,1);assert.equal(state.comps.find(c=>c.id===arm.id).p2.id,gearPin);
 const candidate=structuredClone(state.comps),rotation=rotateGearPinnedMember(candidate,state.topo.params,arm.p1.id,{x:-40,y:128},{snapDistance:5});assert.ok(rotation.candidate);
 const second={comps:candidate,points:pointCoords(candidate),topo:state.topo,theta:0,angles:{},gearPin:rotation.candidate};
 assert.equal(mergeDropped({...host,from:rotation.candidate.from,to:rotation.candidate.to,drop:second,chooseTarget:()=>assert.fail('second pin uses only its fixation prompt')}),true);assert.equal(prompts,0);assert.equal(undos.length,2);assert.deepEqual(undos[0],detached.comps);assert.equal(undos[1].find(c=>c.id===arm.id).p2.id,gearPin);
}
// Only genuinely overlapping gear targets require a choice; cancel/stale stay reversible.
for(const mode of ['cancel','gear','stale']){
 const base=structuredClone(detached),extra=structuredClone(gear);extra.id='GearOther';extra.name='另一齒輪';extra.p1={...extra.p1,id:'OtherCenter',physicalMotor:'2'};extra.p2={...extra.p2,id:'OtherPin'};delete extra.motorMount;extra.holes=extra.holes.map((h,i)=>({...h,id:'OtherMount'+i}));base.comps.push(extra);
 const d={...drop,comps:structuredClone(base.comps),points:pointCoords(base.comps)},choices=firstGearPinTargets(base,d,from,platePin);assert.equal(choices.length,2);assert.ok(choices.every(t=>t.gearId));
 const state={comps:structuredClone(base.comps),topo:{params:{...base.params}},modules:[],theta:0,motorAngles:{},mode:'design',designFocus:'#root'},undos=[],notes=[];let choose;
 mergeDropped({S:state,from,to:platePin,drop:d,chooseTarget:(items,apply)=>{assert.equal(items.length,2);choose=apply;},transient:m=>notes.push(m),pushUndo:()=>undos.push(structuredClone(state.comps)),pause(){},rebuild(){},draw(){}});
 assert.deepEqual(state.comps,base.comps);assert.equal(undos.length,0);
 if(mode==='cancel')continue;
 if(mode==='stale'){state.designFocus='another';assert.equal(choose(choices[0]),false);assert.equal(undos.length,0);assert.deepEqual(state.comps,base.comps);assert.match(notes[0],/作品已變更/);continue;}
 assert.equal(choose(choices.find(t=>t.gearId===gear.id)),true,notes.join('|'));assert.equal(undos.length,1);assert.deepEqual(undos[0],base.comps);assert.equal(state.comps.find(c=>c.id===arm.id).p2.id,gearPin);
}
// An occupied or cross-module gear target fails instead of falling back to the plate.
for(const mode of ['occupied','module']){
 const w=structuredClone(detached),g=w.comps.find(c=>c.id===gear.id);if(mode==='module')g.moduleId='other';else w.comps.push({type:'anchor',id:'UsedPin',p1:{id:gearPin,type:'fixed',x:-40,y:-8}});
 const d={...drop,comps:w.comps,points:pointCoords(w.comps)},r=planFirstGearPin(w,d,from,gearPin,gear.id);assert.equal(r.ok,false);assert.equal(w.comps.find(c=>c.id===arm.id).p2.id,from);
}
// Actual user's 136/64 mm, 138° arm now locks its interior hole without altering dimensions.
const work={...detached,...connected},moved=rotateGearPinnedMember(work.comps,work.params,arm.p1.id,{x:-40,y:128},{snapDistance:5});assert.ok(moved.candidate);assert.equal(moved.candidate.from,'Blank68_A0_13');assert.equal(moved.candidate.to,'Gear65_mount1');
const locked=planGearPinConnection(connected,{comps:work.comps,points:pointCoords(work.comps),theta:0,angles:{}},moved.candidate);assert.ok(locked.ok,locked.message);assert.deepEqual(locked.params,source.params);
const a=solveTopology(compileTopology(locked.comps,{params:{...locked.params}},new Set()),{thetaDeg:0}),b=solveTopology(compileTopology(locked.comps,{params:{...locked.params}},new Set()),{thetaDeg:25});assert.ok(a.isValid&&!a.isUnderconstrained&&b.isValid&&!b.isUnderconstrained);assert.ok(Math.hypot(a.points[arm.p1.id].x-b.points[arm.p1.id].x,a.points[arm.p1.id].y-b.points[arm.p1.id].y)>1);
assert.equal(previewPointConnection(detached.comps,{params:detached.params},free.p1.id,free.holes[0].id).ok,false,'same-part self connection guard remains');
// Downloaded actual case (2): gear seed retained ~4 degrees after reopening at
// theta zero. The first insertion must normalize that target frame, not relax I1.
function actualReopenedCase(){
 const w=structuredClone(source),g=w.comps.find(c=>c.id==='Gear65'),h=w.comps.find(c=>c.id==='Gear66'),a=w.comps.find(c=>c.id==='Blank68');
 Object.assign(g.p2,{x:-24.034671971538693,y:9.052758730017327});Object.assign(h.p2,{x:63.930656056922615,y:5.894482539965345});
 Object.assign(a.p1,{x:-47.89569047512999,y:127.73996021345984});Object.assign(a.p2,{id:'Gear65_mount0',x:-38.947241269982676,y:-7.965328028461311});Object.assign(a.p3,{x:-23.144346920845273,y:159.16242021037556});
 a.standardBlank.arms[1].holes=5;a.holes=a.holes.filter(p=>!/_A1_[5-7]$/.test(p.id));a.holes.find(p=>p.u===104&&p.v===0).id='Gear65_mount1';
 Object.assign(w.params,{'Blank68.H':40,'Blank68.D':167.87321317349603});
 const b=structuredClone(a);b.id='Blank68_70';b.sign=-1;b.gParam+='_70';b.r1Param+='_70';b.r2Param+='_70';b.p1={id:'Blank68.A_70',type:'floating',x:182.9496169309535,y:125.37228966931256};b.p2={id:'Blank68_70.unpin',type:'floating',x:180.16261053083215,y:-10.59915069713233};b.p3={id:'Blank68.C_70',type:'floating',x:156.7991748853464,y:155.64033190562748};b.holes.forEach(p=>p.id+='_70');
 w.comps.push(b);Object.assign(w.params,{'Blank68.G_70':136,'Blank68.H_70':40,'Blank68.D_70':167.87321317349603});w.counter=70;return w;
}
for(const reverse of [false,true])for(const sourceOffset of [0,1.1]){
 const w=actualReopenedCase(),original=JSON.stringify(w),solved=solveTopology(compileTopology(w.comps,{params:{...w.params}},new Set()),{thetaDeg:0}),points={...pointCoords(w.comps),...solved.points};
 if(sourceOffset){const displayed=structuredClone(w.comps.find(c=>c.id==='Blank68_70'));for(const k of ['p1','p2','p3'])displayed[k].x+=sourceOffset;for(const p of pinPoints(displayed))points[p.id]={x:p.x,y:p.y};}
 assert.equal(checkWork(w).filter(i=>i.code==='I1').length,0);
 const req=reverse?{ownerId:'Gear66',otherId:'Blank68_70',from:'Gear66_mount0',to:'Blank68_70.unpin'}:{ownerId:'Blank68_70',otherId:'Gear66',from:'Blank68_70.unpin',to:'Gear66_mount0'};
 const candidate=planInsertPin({...w,points,theta:0,motorAngles:{}},req);assert.ok(candidate.ok,candidate.message);assert.equal(JSON.stringify(w),original,'display frame sync is candidate-only');assert.equal(checkWork({...w,...candidate}).filter(i=>i.code==='I1').length,0,'no new I1 at the 1.1 mm stale gear frame');
 assert.deepEqual(candidate.params,w.params);for(const id of ['Gear65','Gear66'])assert.equal(candidate.comps.find(c=>c.id===id).phase,w.comps.find(c=>c.id===id).phase,'gear phase retained');
 const c=candidate.comps.find(c=>c.id==='Blank68_70'),at=points.Gear66_mount0;assert.equal(c.p2.id,'Gear66_mount0');assert.ok(Math.hypot(c.p2.x-at.x,c.p2.y-at.y)<1e-6);
 for(const [a,b,k]of [[c.p1,c.p2,c.gParam],[c.p1,c.p3,c.r1Param],[c.p2,c.p3,c.r2Param]])assert.ok(Math.abs(Math.hypot(a.x-b.x,a.y-b.y)-w.params[k])<1e-6,'selected member stays rigid');
 for(const k of ['p1','p2','p3']){const p=candidate.comps.find(c=>c.id==='Blank68')[k],q=points[p.id];assert.ok(Math.hypot(p.x-q.x,p.y-q.y)<1e-6,'already attached arm keeps its displayed pose');}
 const state={comps:structuredClone(w.comps),topo:{params:{...w.params}},modules:w.modules||[],fabrication:w.fabrication,counter:70},undos=[],notes=[];
 assert.equal(runEdit({name:'放入插銷',plan:work=>planInsertPin({...work,theta:0,motorAngles:{}},req),host:{S:state,points,transient:m=>notes.push(m),pushUndo:()=>undos.push(JSON.stringify([state.comps,state.topo.params])),pause(){},rebuild(){},draw(){}}}),true,notes.join('|'));
 assert.equal(undos.length,1);assert.equal(undos[0],JSON.stringify([w.comps,w.params]));assert.equal(checkWork({comps:state.comps,params:state.topo.params}).filter(i=>i.code==='I1').length,0);assert.ok(normalizeSnapshot({...w,comps:state.comps,params:state.topo.params}));
}
if(process.argv.includes('--fixture')){
 const loose=structuredClone(detached),l=loose.comps.find(c=>c.id===arm.id);for(const k of ['p1','p2','p3']){l[k].x-=64;l[k].y-=24;}
 const dir='output/gear-arm-lock/user-case';mkdirSync(dir,{recursive:true});const links=[];
 for(const [key,w,label] of [['original',source,'原作品副本：首孔接底板（先分開連接）'],['detached',detached,'已解除底板：保持原姿態'],['loose',loose,'兩步試用：右端從 (-104,-32) 拖到 (-40,-8)，直接接齒輪']]){writeFileSync(`${dir}/${key}.json`,JSON.stringify(w,null,2));links.push(`<p><a href="../../../blocks.html#m=${encodeSnapshot(w)}">${label}</a></p>`);}
 writeFileSync(`${dir}/index.html`,`<!doctype html><meta charset="utf-8"><title>實際彎桿首孔接合驗收</title><h1>實際彎桿首孔接合驗收</h1><p>原作品未修改。自由彎桿的右端新孔 ${from} 拖到 (-40,-8) 即直接接齒輪，不詢問底板。之後拖左端到 (-40,128)，內部孔會對齊另一齒輪孔 (-40,24)。</p>${links.join('')}`);
}
console.log('Actual arm-on-plate regression: faithful detach/reopen, gear-first priority without picker, one second-pin prompt, true gear ambiguity/cancel/stale/undo, preserve plate and dimensions, local second pin and driven motion passed');
