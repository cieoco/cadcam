// Pack O4 of docs/SDD-OPERATION-PIPELINE.md: gear delete (one gear only) and release-mesh run on the shared edit pipeline.
//   node test/gear-pipeline.mjs      (built-in gear / rack / compound examples + test/fixtures/delete-blocked.json)
import {check,report} from './_harness.mjs';
import {session,fixture,example,noInternalId,roundTrips,normalizeSnapshot} from './_pipeline-rig.mjs';
const R='../js/blocks/';
const {deleteSelectedPart}=await import(R+'delete-part.js');
const {releaseSelectedMesh,planReleaseMesh,gearLabel}=await import(R+'gear-plan.js');
const {MAD_BOX_EXAMPLE}=await import(R+'iq-mad-box-example.js');
const MR=await import(R+'motor-release.js');

const del=(w,gearId,sel={})=>{const s=session(w,{selectedGearId:gearId,...sel});
  const ok=deleteSelectedPart({...s.host,closeMobileEditPanel(){},setSliderDetailRows(){}});return {...s,ok,msgs:s.log.msgs};};
const release=(w,gearId)=>{const s=session(w,{selectedGearId:gearId});const ok=releaseSelectedMesh(s.host);return {...s,ok,msgs:s.log.msgs};};
const gears=r=>r.S.comps.filter(c=>c.type==='gear');
const train=example('reduction-gear-train'),pair=example('gear-pair'),rackEx=example('rack-pinion');
const mad=normalizeSnapshot(structuredClone(MAD_BOX_EXAMPLE.snapshot));

// ---------------------------------------------------------------- 20. delete ONE gear (the middle of a three-gear train)
{const r=del(train,'GearB');
 check('delete: the middle gear is gone, the other two stay where they were',r.ok&&r.ids().join()==='GearA,GearC'&&gears(r).every(g=>JSON.stringify(g.p1)===JSON.stringify(train.comps.find(c=>c.id===g.id).p1)));
 check('delete: the gear that was driven by it no longer points at it; the driver is untouched',!('mesh' in r.S.comps.find(c=>c.id==='GearC'))&&!('mesh' in r.S.comps.find(c=>c.id==='GearA')));
 check('delete: its own parameters are removed, the others kept',!('GRB' in r.S.topo.params)&&'GRA' in r.S.topo.params&&'GRC' in r.S.topo.params);
 check('delete: exactly one undo taken before the write, and it restores the work exactly',r.log.undo===1&&r.log.undoSnap===r.orig);
 check('delete: exactly one line that says what happened to the driven gear, no internal id',r.msgs.length===1&&r.msgs[0]==='已刪除「24 齒齒輪」。「48 齒齒輪」不再被它帶動，留在原位。'&&noInternalId(r.msgs[0]),r.msgs.join('|'));
 check('delete: the selection and the gear panel are released',r.S.selectedGearId===null);
 check('delete: the saved work normalizes back unchanged',roundTrips(r));}

// delete the driver: the driven gear is kept, not meshed any more
{const r=del(pair,'GearA');
 check('delete driver: the driven gear stays and is independent',r.ok&&r.ids().join()==='GearB'&&!('mesh' in r.S.comps[0]));
 check('delete driver: motor removal and the free driven gear are both said',r.msgs.length===1&&/馬達設定也一起移除/.test(r.msgs[0])&&/不再被它帶動/.test(r.msgs[0])&&noInternalId(r.msgs[0]),r.msgs.join('|'));}
// delete the driven gear: the driver is untouched
{const r=del(pair,'GearB');
 check('delete driven: the driver is untouched and there is nothing else to say',r.ok&&r.ids().join()==='GearA'&&r.msgs.join()==='已刪除「16 齒齒輪」。'&&r.log.undo===1,r.msgs.join('|'));}

// ---------------------------------------------------------------- a rack only exists relative to its pinion: it goes with it, and it is said
{const r=del(rackEx,'Pinion');
 check('rack: pinion, rack and both guide pins are removed together',r.ok&&r.S.comps.length===0&&Object.keys(r.S.topo.params).every(k=>k==='theta'),r.ids().join());
 check('rack: the message names the rack that went with it',r.msgs.length===1&&/齒條（含固定導銷）.*已一起刪除/.test(r.msgs[0])&&noInternalId(r.msgs[0]),r.msgs.join('|'));
 check('rack: one undo restores everything',r.log.undo===1&&r.log.undoSnap===r.orig);}

// ---------------------------------------------------------------- compound (coaxial) train: only the selected gear goes
{const r=del(mad,'MadC');
 check('compound: only the selected gear is deleted (no chain, no orphan sweep)',r.ok&&r.S.comps.length===mad.comps.length-1&&!r.ids().includes('MadC'));
 check('compound: nothing still meshes to the deleted gear',gears(r).every(g=>g.mesh!=='MadC'));
 check('compound: one undo restores exactly',r.log.undo===1&&r.log.undoSnap===r.orig);}

// ---------------------------------------------------------------- refusals change nothing, push no undo, say one thing
{const fused=structuredClone(train);fused.comps.push({type:'triangle',id:'TP',p1:{id:'GPB',type:'floating',x:0,y:0},p2:{id:'TP2',type:'floating',x:10,y:0},p3:{id:'TP3',type:'floating',x:0,y:10},fusedWith:'GearB'});
 const r=del(fused,'GearB');
 check('refusal: a gear fused with a plate keeps its sentence, nothing changes, no undo',!r.ok&&!r.changed&&r.log.undo===0&&r.msgs.join()==='請先解除合成，再刪除齒輪',r.msgs.join('|'));
 const none=del(train,'NoSuchGear');
 check('refusal: a stale gear selection says nothing is selected',!none.ok&&!none.changed&&none.log.undo===0&&none.msgs.length===1&&none.msgs[0].startsWith('沒有選到零件'));}

// ---------------------------------------------------------------- an old problem elsewhere does not block deleting a gear
{const base=fixture('delete-blocked.json');
 check('fixture: the work really has the old problem (motor off its plate hole)',MR.offPlateMotors(base.comps).length===1);
 const w={...base,comps:[...base.comps,...structuredClone(pair.comps)],params:{...base.params,...pair.params}};
 const r=del(w,'GearB');
 check('old problem: deleting a gear still works while the motor is off its plate',r.ok&&!r.ids().includes('GearB')&&r.log.undo===1&&!r.msgs.some(m=>m.includes('座板格位')),r.msgs.join('|'));
 const off=fixture('motor-off-plate.json'),w2={...off,comps:[...off.comps,...structuredClone(pair.comps)],params:{...off.params,...pair.params}};
 const r2=del(w2,'GearA');
 check('old problem: same with the other fixture',r2.ok&&!r2.ids().includes('GearA')&&r2.log.undo===1,r2.msgs.join('|'));}

// ---------------------------------------------------------------- 21. release mesh
{const r=release(pair,'GearB');
 check('release: the gear stays exactly where it was and is no longer meshed',r.ok&&gears(r).every(g=>JSON.stringify(g.p1)===JSON.stringify(pair.comps.find(c=>c.id===g.id).p1)&&!('mesh' in g)));
 check('release: both gears are named in plain words, and the one that lost its driver is said to',r.msgs.length===1&&r.msgs[0]==='已把「16 齒齒輪」和「12 齒齒輪」分開，不再嚙合；齒輪都留在原位。「16 齒齒輪」不再被帶動。'&&noInternalId(r.msgs[0]),r.msgs.join('|'));
 check('release: nothing else changed (parameters, count) and exactly one undo restores',r.S.comps.length===2&&JSON.stringify(r.S.topo.params)===JSON.stringify(pair.params)&&r.log.undo===1&&r.log.undoSnap===r.orig);
 check('release: the gear stays selected so the student can see the result',r.S.selectedGearId==='GearB');
 check('release: saved work normalizes back unchanged',roundTrips(r));}
// the driver selected: same pair, same result
{const r=release(pair,'GearA');
 check('release: selecting the driver releases the same pair',r.ok&&gears(r).every(g=>!('mesh' in g))&&/「12 齒齒輪」和「16 齒齒輪」分開/.test(r.msgs[0]),r.msgs.join('|'));}
// the middle gear of a train lets go of both neighbours
{const r=release(train,'GearB');
 check('release: the middle gear lets go of both neighbours and says so',r.ok&&gears(r).every(g=>!('mesh' in g))&&r.msgs.join()==='已把「24 齒齒輪」、「12 齒齒輪」和「48 齒齒輪」分開，不再嚙合；齒輪都留在原位。「24 齒齒輪」和「48 齒齒輪」不再被帶動。',r.msgs.join('|'));}
// refusals
{const solo=example('rack-pinion'),a=release(solo,'Pinion');
 check('release refusal: a pinion that only meshes with a rack explains why',!a.ok&&!a.changed&&a.log.undo===0&&a.msgs.length===1&&/只和齒條配對/.test(a.msgs[0])&&noInternalId(a.msgs[0]),a.msgs.join('|'));
 const lone=structuredClone(pair);delete lone.comps[1].mesh;const b=release(lone,'GearB');
 check('release refusal: an unmeshed gear says there is nothing to release',!b.ok&&!b.changed&&b.log.undo===0&&b.msgs.length===1&&/沒有和別的齒輪嚙合/.test(b.msgs[0]));
 const c=release(pair,'NoSuchGear');
 check('release refusal: no gear selected says so',!c.ok&&!c.changed&&c.log.undo===0&&c.msgs.join()==='請先選取要分開咬合的齒輪。');}
// pure: the plan never touches the work it is given
{const frozen=structuredClone(train),before=JSON.stringify(frozen);
 const p=planReleaseMesh({comps:frozen.comps,params:frozen.params},'GearB');
 check('plan is pure',p.ok&&JSON.stringify(frozen)===before);}
// names: same teeth get told apart by position, not by an id
{const twins=structuredClone(train);twins.comps.find(c=>c.id==='GearC').teeth=24;
 check('labels: equal teeth are told apart left to right',gearLabel(twins.comps[1],twins.comps)==='「左起第 1 個 24 齒齒輪」'&&gearLabel(twins.comps[2],twins.comps)==='「左起第 2 個 24 齒齒輪」');}
report('gear-pipeline');
