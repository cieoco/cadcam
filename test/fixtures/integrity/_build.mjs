// Regenerates the small fixtures in this folder (pack C0 of docs/SDD-CONNECTION-INTEGRITY.md).
//   node test/fixtures/integrity/_build.mjs --write
// Each fixture is a normalized Blocks snapshot (what checkWork receives, minus `topo`) edited as little as possible
// from a built-in example. Edits are applied AFTER normalizeSnapshot on purpose: normalizeSnapshot rejects or renames
// some of these corruptions (duplicate hole ids, bad fusions), and checkWork must see the damaged data as saved.
// `_note` says what the fixture is; `_base` names the unedited source so the test can confirm the base is clean.
import {writeFileSync} from 'node:fs';
import {BLOCK_EXAMPLES,loadUnitStarts} from '../../../js/blocks/examples.js';
import {normalizeSnapshot,alignSavedInputPhase} from '../../../js/blocks/schema.js';
import {compileAssembly,solveAssembly} from '../../../js/blocks/assembly.js';
import {solveSyringe} from '../../../js/blocks/syringe-operations.js';
import {planPlacedSyringe} from '../../../js/blocks/syringe-installation.js';
import {attachmentPoint} from '../../../js/core/syringe.js';
import {diskTurntableSnapshot} from '../../../js/blocks/disk-turntable-example.js';

await loadUnitStarts();
const OUT=new URL('./',import.meta.url),KEYS=['p1','p2','p3','m1','m2'];
const example=id=>normalizeSnapshot(structuredClone(BLOCK_EXAMPLES.find(e=>e.id===id).snapshot));
const disk=()=>normalizeSnapshot(structuredClone(diskTurntableSnapshot));
const comp=(s,id)=>s.comps.find(c=>c.id===id);
// Move every copy of a shared point id so the edit does not create an I1 by accident.
const moveId=(s,id,x,y)=>{for(const c of s.comps)for(const k of KEYS)if(c[k]?.id===id){c[k].x=x;c[k].y=y;}};
const files=new Map();
function put(name,note,base,s){
  const {warnings,...rest}=s;
  files.set(name,{_note:note,_base:base,kind:'blocks',v:1,...rest});
}

// I1 (synthetic): two bars share end id J, but their copies of J are 5 mm apart.
put('i1-shared-end-5mm','Synthetic: Bar1.p2 and Bar2.p1 both use id J but sit at (100,0) and (105,0); I1 contradiction.',null,{
  comps:[
    {type:'bar',id:'Bar1',name:'左桿',color:'#3498db',p1:{id:'J0',type:'floating',x:0,y:0},p2:{id:'J',type:'floating',x:100,y:0},lenParam:'L1',isInput:false,fixedLen:true},
    {type:'bar',id:'Bar2',name:'右桿',color:'#e74c3c',p1:{id:'J',type:'floating',x:105,y:0},p2:{id:'J2',type:'floating',x:200,y:0},lenParam:'L2',isInput:false,fixedLen:true}],
  modules:[],params:{L1:100,L2:95},counter:0,tracePoint:'',tracePoints:[],referencePoint:'',activeMotor:'1',motorAngles:{}});

// I2: the same point id carries two different physicalMotor values.
{const s=example('competition-fourbar-lift');comp(s,'Anchor1').p1.physicalMotor='2';
 put('i2-conflicting-motors','competition-fourbar-lift with Anchor1.p1 (id O1) claiming motor 2 while LiftCrank.p1 (same id O1) claims motor 1; I2 contradiction.',{example:'competition-fourbar-lift'},s);}

// I3a: motorMount.frameBody names a comp that does not exist (plate-hosted, no motorCarrier).
{const s=example('motor-plate-tt');comp(s,'ServoArm').motorMount.frameBody='GhostPlate';
 put('i3-frame-body-missing','motor-plate-tt with ServoArm.motorMount.frameBody renamed to a non-existent comp GhostPlate; I3 dangling.',{example:'motor-plate-tt'},s);}
// I3b: motorCarrier and motorMount.frameBody both present but different.
{const s=example('competition-fourbar-lift');comp(s,'ToolPlate').motorMount.frameBody='LiftFollower';
 put('i3-carrier-frame-differ','competition-fourbar-lift with ToolPlate.motorCarrier=LiftUpright but motorMount.frameBody=LiftFollower; I3 contradiction.',{example:'competition-fourbar-lift'},s);}
// I3c: two motors share one motorMount.partId.
{const s=example('competition-fourbar-lift');
 comp(s,'ToolPlate').motorMount.partId='Motor1';
 comp(s,'LiftCrank').motorMount={motor:'1',partId:'Motor1',center:'O1',outputBody:'LiftCrank',orientation:'horizontal',reversed:false,order:['motor','outputBody']};
 put('i3-duplicate-part-id','competition-fourbar-lift with both motors mounted as partId Motor1 (LiftCrank gets a motorMount without frameBody); I3 for the duplicated partId.',{example:'competition-fourbar-lift'},s);}

// I4: world-frame input bar (fixed centre, no carrier) whose saved angle is 40 deg but phaseOffset stays 0.
{const s=example('fourbar-crank-rocker'),a=comp(s,'Link1').p1,L=s.params.LL1,t=40*Math.PI/180;
 moveId(s,'C',a.x+L*Math.cos(t),a.y+L*Math.sin(t));
 put('i4-phase-mismatch','fourbar-crank-rocker with crank point C moved to 40 deg about A (all copies) while Link1.phaseOffset is still 0; I4.',{example:'fourbar-crank-rocker'},s);}

// I5a: syringe end names a missing comp.
{const s=example('hydraulic-h01');comp(s,'H1Syringe').a.componentId='GhostFrame';
 put('i5-syringe-missing-comp','hydraulic-h01 with H1Syringe.a.componentId = GhostFrame (no such comp); I5 dangling.',{example:'hydraulic-h01'},s);}
// I5b: tracePoint / tracePoints name a missing point.
{const s=example('competition-fourbar-lift');s.tracePoint='GhostPoint';s.tracePoints=['GhostPoint'];
 put('i5-trace-point-missing','competition-fourbar-lift with tracePoint(s) = GhostPoint (no such point); I5 dangling.',{example:'competition-fourbar-lift'},s);}
// I5c: motorCarrier names a deleted comp (frameBody dropped so only the carrier points at it).
{const s=example('competition-fourbar-lift'),t=comp(s,'ToolPlate');t.motorCarrier='DeletedUpright';delete t.motorMount.frameBody;
 put('i5-carrier-deleted','competition-fourbar-lift with ToolPlate.motorCarrier = DeletedUpright (comp removed) and no frameBody; I5 dangling.',{example:'competition-fourbar-lift'},s);}

// I6: two comps with one id (raw data; normalizeSnapshot is not re-applied after the edit).
{const s=example('competition-fourbar-lift');s.comps.push(structuredClone(comp(s,'LiftFollower')));
 put('i6-duplicate-comp-id','competition-fourbar-lift with a second comp also named LiftFollower appended; I6.',{example:'competition-fourbar-lift'},s);}

// I7a: a bar whose two ends share an id.
{const s=example('competition-fourbar-lift');comp(s,'LiftUpright').p2.id='A';
 put('i7-bar-same-end-id','competition-fourbar-lift with LiftUpright.p2.id = A, equal to its p1.id; I7.',{example:'competition-fourbar-lift'},s);}
// I7b: two local holes of one comp share an id (normalizeSnapshot would return null for this).
{const s=example('motor-plate-tt'),arm=comp(s,'ServoArm');arm.holes[1].id=arm.holes[0].id;
 put('i7-duplicate-hole-id','motor-plate-tt with ServoArm local holes [0] and [1] sharing one id; I7.',{example:'motor-plate-tt'},s);}

// I8: bar fusion roots that no longer match their members.
{const s=example('guided-scissor-lift');comp(s,'ScissorUp0').barFusion.members[1]='GhostTip';
 put('i8-fusion-missing-member','guided-scissor-lift with ScissorUp0.barFusion.members listing a missing comp GhostTip; I8.',{example:'guided-scissor-lift'},s);}
{const s=example('guided-scissor-lift');comp(s,'ScissorDown0').barFusion.points[1].id='WrongPoint';
 put('i8-fusion-points-disagree','guided-scissor-lift with ScissorDown0.barFusion.points[1].id changed so it no longer matches the member joint id; I8.',{example:'guided-scissor-lift'},s);}

// I9: syringe end on an existing disk, but (u,v) lies far outside it.
{const s=disk();comp(s,'H7Syringe').a.u=1000;
 put('i9-syringe-outside-part','Disk turntable (H07 base) with H7Syringe.a.u = 1000, outside the 420 mm disk; I9.',{snapshot:'disk-turntable'},s);}

// P3: two motors, both non-zero at save time. Pose comes from the real solver; phase is aligned like app open.
{const s=example('competition-fourbar-lift'),sol=solveAssembly(compileAssembly(s.comps,s.modules,{params:s.params}),{thetaDeg:50,motorAngles:{'1':50,'2':30}});
 if(!sol?.points||sol.isValid===false)throw Error('P3 pose does not solve');
 for(const c of s.comps)for(const k of KEYS)if(c[k]&&sol.points[c[k].id]){c[k].x=sol.points[c[k].id].x;c[k].y=sol.points[c[k].id].y;}
 s.activeMotor='1';s.motorAngles={'2':30};alignSavedInputPhase(s);
 put('p3-two-motors-saved-angles','competition-fourbar-lift saved at motor 1 = 50 deg (phaseOffset aligned) and motor 2 frozen at 30 deg (carrier-relative); legitimate, no I4 contradiction.',{example:'competition-fourbar-lift'},s);}

// P4a: syringe clamp placed 8 mm off the lattice-like original position (the existing syringe-position flow).
{const s=disk(),c=comp(s,'H7Syringe'),points=solveSyringe(s.comps,s.params).points,o=attachmentPoint(c.a,s.comps,s.params,points);
 const m=planPlacedSyringe(s,{id:c.id,frameId:c.a.componentId,position:{x:o.x,y:o.y+8},b:c.b,mountMode:c.mountMode,pivotEar:c.pivotEar,axisDeg:c.axisDeg??0,extension:c.extension,barrelOffsetMm:40.5},points);
 if(!m.ok)throw Error(m.message);
 s.comps=m.comps;s.params=m.params;
 put('p4-syringe-off-lattice','Disk turntable with the syringe clamp moved 8 mm via planPlacedSyringe: a.(u,v) is an arbitrary non-lattice position on the disk; legitimate, no I9.',{snapshot:'disk-turntable'},s);}
// P4b: syringe clamp mounted on a newly added fixed hole of the disk.
{const s=disk(),frame=comp(s,'H7Frame');
 frame.holes=[...(frame.holes||[]),{id:'H7Frame_Hnew',u:100,v:-30,diameter:3.2,type:'fixed'}];
 comp(s,'H7Syringe').a={componentId:'H7Frame',u:100,v:-30};
 put('p4-syringe-new-fixed-hole','Disk turntable with a new fixed local hole H7Frame_Hnew at (100,-30) and the syringe clamp mounted there; legitimate, no I9.',{snapshot:'disk-turntable'},s);}

if(process.argv.includes('--write')){
 for(const [name,obj] of files)writeFileSync(new URL(`${name}.json`,OUT),JSON.stringify(obj,null,1)+'\n');
 console.log(`wrote ${files.size} fixtures`);
}else console.log(`${files.size} fixtures would be written (pass --write)`);
