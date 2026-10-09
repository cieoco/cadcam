import assert from 'node:assert/strict';
import {readConnectionDescriptor,readConnectionDescriptors,readConnectionHost} from '../js/blocks/connection-descriptor.js';
import {freezeData} from '../js/blocks/face-candidate.js';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
import {refreshFaceMounts} from '../js/blocks/face-mount-refresh.js';
import {orthogonalHostBody,orthogonalHostEdge} from '../js/blocks/assembly.js';
import {orthogonalExportExtras} from '../js/blocks/orthogonal-joint.js';
import {unmountModule} from '../js/blocks/module-ops.js';
import {pointCoords} from '../js/blocks/model.js';
import {f1NestedFixture} from './fixtures/f1-assembly-fixture.mjs';
import {attachPartMaterials} from '../js/blocks3d/part-pose.js';
const point=(id,x)=>({id,type:'fixed',x,y:0});
const comps=[{id:'HostBar',type:'bar',moduleId:'Host',p1:point('H0',0),p2:point('H1',120)},{id:'ChildBar',type:'bar',moduleId:'Child',p1:point('C0',0),p2:point('C1',40)}];
const modules=[{id:'Host',base:'H0',outputs:[{id:'out',at:'H1',body:{kind:'bar',id:'HostBar'}}]},{id:'Child',base:'C0',outputs:[],mount:{to:{module:'Host',output:'out'},ref:{x:120,y:0,a:0},home:{'1':20}}}];
const planar=readConnectionDescriptor({comps,modules,childId:'Child'});
assert.equal(planar.ok,true,'valid persisted planar base/output endpoints must be readable without guessing a plate');
assert.equal(planar.child.pointId,'C0');
console.log('planar shared connection read passed');
const read=(list=modules,parts=comps)=>readConnectionDescriptor({comps:parts,modules:list,childId:'Child'}),copy=structuredClone;
assert.equal(planar.child.partId,null,'base point identity does not invent a plate');assert.deepEqual(planar.placement,{ref:modules[1].mount.ref,home:{'1':20},flip:false});assert.equal(planar.capabilities.drilling,false);assert.equal(planar.diagnostics[0].package,'W4b');assert.ok(planar.diagnostics.every(d=>!d.message.includes('W4b')));
const orient={type:'orthogonal',edge:'host',side:-1,childAxisDeg:90,offsetMm:20,tiltDeg:15,joint:{kind:'bracket-m3'}};
const along=copy(modules);along[1].mount={...copy(modules[1].mount),to:{module:'Host',body:'HostBar'},orient};
const d=read(along);assert.ok(d.ok);assert.equal(d.host.source.kind,'body');assert.equal(d.host.side,-1);assert.equal(d.child.partId,'frame');assert.deepEqual(d.placement.orient,orient);assert.deepEqual(d.fastener,{kind:'bracket-m3'});assert.equal(d.capabilities.geometry,false);
const standing=copy(along);standing[1].mount.to={module:'Host',frame:{edge:6}};Object.assign(standing[1].mount.orient,{edge:'child',childEdge:13,face:-1});const stand=read(standing);assert.ok(stand.ok);assert.equal(stand.host.face,'bottom');assert.equal(stand.host.edge,6);assert.equal(stand.child.edge,13);assert.equal(stand.child.face,null,'standing childEdge is not a guessed child face');
const missing=copy(along);missing[1].mount.to.body='gone';assert.equal(read(missing).host.reason.code,'host_part_missing');assert.equal(read(missing).capabilities.placement,true,'keep the saved pose despite a missing endpoint');
const wrongOwner=[...copy(comps).filter(c=>c.id!=='HostBar'),{...copy(comps[0]),moduleId:'Elsewhere'}];assert.equal(read(along,wrongOwner).host.available,false);assert.equal(orthogonalHostBody(wrongOwner,along,along[1].mount),null);assert.equal(orthogonalHostEdge(wrongOwner,along,along[1].mount,pointCoords(wrongOwner),{}),null,'legacy consumer cannot borrow another module body');
const duplicated=[...copy(comps),copy(comps[0])];assert.equal(read(along,duplicated).host.reason.code,'host_part_ambiguous');
const duplicateOutputs=copy(modules);duplicateOutputs[0].outputs.push(copy(duplicateOutputs[0].outputs[0]));assert.equal(read(duplicateOutputs).host.reason.code,'host_output_ambiguous');
const invalidOrient=copy(along);invalidOrient[1].mount.orient.childAxisDeg=NaN;assert.equal(read(invalidOrient).ok,false);assert.ok(read(invalidOrient).diagnostics.some(r=>r.code==='orient_record_invalid'));
const floating=copy(comps);floating[1].p1.type='floating';assert.equal(read(modules,floating).child.available,false,'planar base must remain fixed/motor');
// Match the existing schema point pool: named holes count, unrelated bodies do not.
const drilled=copy(comps);drilled[0].holes=[{id:'NamedDrill',u:60,v:0}];const drillMods=copy(modules);drillMods[0].outputs[0].at='NamedDrill';assert.ok(read(drillMods,drilled).ok);
drillMods[0].outputs[0].body={kind:'points',a:'NamedDrill',b:'H1'};assert.ok(read(drillMods,drilled).ok);assert.equal(read(drillMods,drilled).host.partId,null);
const foreignAt=copy(modules),foreignPoint={id:'Other',moduleId:'Host',type:'anchor',p1:point('OtherPoint',10)};foreignAt[0].outputs[0].at='OtherPoint';assert.equal(read(foreignAt,[...comps,foreignPoint]).host.reason.code,'host_output_point_not_on_body');
// Body kind and target kinds remain distinct; no output/body/frame priority guessing.
const mixed=copy(along);mixed[1].mount.to.output='out';assert.equal(read(mixed).host.reason.code,'host_target_ambiguous');
const kindMismatch=copy(modules);kindMismatch[0].outputs[0].body.kind='triangle';assert.equal(read(kindMismatch).host.reason.code,'host_part_kind_mismatch');
const triangle={id:'Plate',type:'triangle',moduleId:'Host',p1:point('T0',0),p2:point('T1',120),p3:{...point('T2',40),y:40}};
const triMods=copy(along);triMods[1].mount.to={module:'Host',body:'Plate',edge:1};assert.equal(read(triMods,[...comps,triangle]).host.edge,1);triMods[1].mount.to.edge=9;assert.equal(read(triMods,[...comps,triangle]).host.reason.code,'host_edge_invalid');
// Actual Base <- fourbar-lift <- gear-gripper: one planar + one orient.
const f3=f1NestedFixture();f3.modules[1].mount={to:{module:'Base',output:'out'},ref:{x:-180,y:0,a:0},home:{'1':20},flip:true};
f3.modules[2].mount={to:{module:f3.modules[1].id,output:'tool'},ref:copy(f3.modules[2].mount.ref),home:{'1':20,'2':12},orient:{...orient,side:1}};
const initial=readConnectionDescriptors(f3);assert.deepEqual(initial.map(r=>r.sourceFormat),['planar','orient']);assert.ok(initial.every(r=>r.ok));assert.equal(initial[1].host.partId,'ToolBrace_1');
for(const source of [{comps,modules},{comps,modules:along},{comps,modules:standing},f3,f1NestedFixture()]){
 const frozen=freezeData(copy(source)),before=JSON.stringify(frozen),descriptors=readConnectionDescriptors(frozen);assert.equal(JSON.stringify(frozen),before);assert.ok(descriptors.every(r=>r.ok));
 const params=source.params || {},snap=toSnapshot(source.comps,{params},5,{modules:source.modules}),norm=normalizeSnapshot(JSON.parse(JSON.stringify(snap)));assert.ok(norm);assert.deepEqual(readConnectionDescriptors(norm),descriptors,'v1 read/write preserves placement, fastener and endpoint identity');
 descriptors[0].source.ref.x+=1;assert.equal(JSON.stringify(frozen),before,'returned source is an independent clone');
}
// Two confirmed children on one named tool, independent of current presets/order.
const child2={...copy(along[1]),id:'Child2',base:'D0',mount:{...copy(along[1].mount),orient:{...orient,offsetMm:-45}}};
const siblingParts=[...copy(comps),{id:'OtherChild',type:'bar',moduleId:'Child2',p1:point('D0',0),p2:point('D1',40)}],siblings=[...copy(along),child2];
for(const m of siblings)if(m.mount?.orient)m.mount.orient.tiltDeg=0;
const supported=read(siblings,siblingParts);assert.equal(supported.capabilities.geometry,true);assert.equal(supported.capabilities.drilling,true);assert.equal(supported.capabilities.refresh,false,'shared metal geometry capability is not face refresh or a validation pass');
siblings[0].mates={attach:{normalDeg:180},receive:[{id:'left',name:'左位',ref:{kind:'bar',id:'HostBar',side:-1}},{id:'right',name:'右位',ref:{kind:'bar',id:'HostBar',side:1}}]};
const both=readConnectionDescriptors({comps:siblingParts,modules:siblings}),mutated=copy(siblings);mutated.reverse();for(const m of mutated){m.faceParts={part:'frame',face:'left'};if(m.mates){m.mates.attach.normalDeg=90;m.mates.receive.reverse();}}
const sorted=readConnectionDescriptors({comps:siblingParts,modules:mutated}).sort((a,b)=>a.id.localeCompare(b.id));assert.deepEqual(sorted,both.sort((a,b)=>a.id.localeCompare(b.id)),'presets and list order do not rebind saved connections');
const keep='Child2',beforeHoles=orthogonalExportExtras(siblingParts,siblings,{},{stockMm:4}).frameNodes[keep];assert.ok(beforeHoles.length>0);
const detached=unmountModule(copy(siblingParts),copy(siblings),'Child',{},{});assert.ok(detached.ok);assert.deepEqual(readConnectionDescriptor({...detached,childId:keep}),both.find(r=>r.child.moduleId===keep));
assert.deepEqual(orthogonalExportExtras(detached.comps,detached.modules,{},{stockMm:4}).frameNodes[keep],beforeHoles,'removing one connection retains the other existing legacy drill records');
const sized=copy(siblingParts);sized[0].p2.x=180;assert.deepEqual(readConnectionDescriptors({comps:sized,modules:siblings}),readConnectionDescriptors({comps:siblingParts,modules:siblings}),'dimensions never become endpoint identity');
const savedSiblings=normalizeSnapshot(toSnapshot(siblingParts,{params:{}},0,{modules:siblings}));assert.deepEqual(savedSiblings.modules[0].mates,siblings[0].mates);
// The approved face host-frame identity reads successfully; shared face geometry capability is available (not a validation pass).
const faced=f1NestedFixture(),frameRead=readConnectionDescriptor({...faced,childId:faced.modules[1].id});assert.ok(frameRead.ok);assert.equal(frameRead.host.partId,'BaseBar');
faced.modules[2].mount.to={module:faced.modules[1].id,frame:{edge:6}};const frame=readConnectionDescriptor({...faced,childId:faced.modules[2].id});assert.ok(frame.ok);assert.equal(frame.host.source.kind,'frame');assert.equal(frame.capabilities.refresh,true);assert.equal(frame.capabilities.drilling,true);assert.deepEqual(frame.diagnostics,[]);
const prior=JSON.stringify(faced.modules);assert.deepEqual(refreshFaceMounts(faced.comps,faced.modules,faced.params,{stockMm:4}).modules.map(m=>m.mount?.to),faced.modules.map(m=>m.mount?.to));assert.equal(JSON.stringify(faced.modules),prior);
const posed=attachPartMaterials({}, {parts:{},diagnostics:[],key:'read-test'}, {...faced,assemblyScope:true});assert.ok(!posed.geometryDiagnostics.some(d=>d.code==='host_frame_not_supported'),'resolved frame capability no longer advertises the completed bridge');
const ambiguous=copy(faced);delete ambiguous.modules[2].mount.face.childPart;delete ambiguous.modules[2].mount.face.selection.brackets;ambiguous.modules[2].faceParts={part:'frame',face:'bottom'};assert.equal(readConnectionDescriptor({...ambiguous,childId:ambiguous.modules[2].id}).child.reason.code,'legacy_child_endpoint_ambiguous');
console.log('three frozen sources, named holes/body pools, v1 roundtrip, Base-arm-claw, two placements/defaults/sizes/delete/remaining drills and W4b coverage passed');
