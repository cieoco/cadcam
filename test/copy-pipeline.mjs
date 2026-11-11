// Pack O4 of docs/SDD-OPERATION-PIPELINE.md: copy / mirror runs on the shared edit pipeline (planCopy via runEdit).
//   node test/copy-pipeline.mjs      (test/fixtures/delete-blocked.json, motor-off-plate.json, built-in six-bar-lift)
import {check,report} from './_harness.mjs';
import {session,fixture,example,noInternalId,roundTrips} from './_pipeline-rig.mjs';
const R='../js/blocks/';
const {commitCopy,planCopy}=await import(R+'member-copy.js');
const {pointKeysFor}=await import(R+'part-types.js');
const MR=await import(R+'motor-release.js');

const blocked=fixture('delete-blocked.json');
const repaired=(()=>{const back=MR.planMotorReturn(blocked,MR.offPlateMotors(blocked.comps)[0].id);return {...blocked,comps:back.comps,params:back.params};})();
// returns {s, error}: error is what the copy dialog would show ('' = applied)
const copy=(w,id,mode='copy',sel={})=>{const s=session(w,sel);const selects=[];
  const host={...s.host,rebuild(){s.log.rebuild++;selects.push('rebuild');}};
  const error=commitCopy(host,{id,mode,positions:{},settings:{}});return {s,error,msgs:s.log.msgs};};
const pointIds=comps=>new Set(comps.flatMap(c=>pointKeysFor(c).map(k=>c[k]?.id)));

// ---------------------------------------------------------------- a connected part: the part only, new ids, not connected
{const {s,error,msgs}=copy(blocked,'Blank136');
 const added=s.S.comps.slice(blocked.comps.length),orig=pointIds(blocked.comps);
 check('copy connected: applied, exactly one new part appended, the originals untouched',error===''&&added.length===1&&JSON.stringify(s.S.comps.slice(0,blocked.comps.length))===JSON.stringify(blocked.comps));
 check('copy connected: new ids, no shared point, all free (not connected to anything)',added[0].id!==('Blank136')&&pointKeysFor(added[0]).every(k=>!orig.has(added[0][k].id)&&added[0][k].type==='floating'));
 check('copy connected: placed beside the original (not on top of it)',(x=>Math.abs(x.p1.x-blocked.comps.find(c=>c.id==='Blank136').p1.x)>8)(added[0]));
 check('copy connected: exactly one pushUndo before the write, restoring the work exactly',s.log.undo===1&&s.log.undoSnap===s.orig);
 check('copy connected: one line that says it is a copy beside the original, not connected, selected',msgs.length===1&&msgs[0]==='已複製「孔格桿件」，副本放在原件旁邊並已選取；沒有和任何零件相接。'&&noInternalId(msgs[0]),msgs.join('|'));
 check('copy connected: the counter moved on so the next new id does not collide',s.S.counter>blocked.counter);
 check('copy connected: the saved work normalizes back unchanged',roundTrips(s));}

// ---------------------------------------------------------------- a motor's output bar: no second motor, and it is said
{const motorsOf=comps=>comps.filter(c=>c.type==='motor'||c.physicalMotor||pointKeysFor(c).some(k=>c[k]?.physicalMotor)).length;
 const {s,error,msgs}=copy(repaired,'Blank135');
 const added=s.S.comps.slice(repaired.comps.length)[0];
 check('copy motor bar: applied and the copy is an ordinary bar',error===''&&!!added&&!added.isInput&&!added.physicalMotor&&!added.motorMount&&pointKeysFor(added).every(k=>!added[k].physicalMotor));
 check('copy motor bar: there is still exactly the same number of motors',motorsOf(s.S.comps)===motorsOf(repaired.comps));
 check('copy motor bar: the message says the motor was not copied',msgs.length===1&&/馬達沒有一起複製，副本不會自己轉。$/.test(msgs[0])&&noInternalId(msgs[0]),msgs.join('|'));
 check('copy motor bar: one undo restores exactly',s.log.undo===1&&s.log.undoSnap===s.orig);}

// ---------------------------------------------------------------- mirror keeps its semantics and says so
for(const [mode,word] of [['mirror-x','左右鏡射'],['mirror-y','上下鏡射']]){
 const {s,error,msgs}=copy(blocked,'Blank133',mode),added=s.S.comps.slice(blocked.comps.length)[0];
 check(`${mode}: a mirrored triangle plate copy is added (sign flipped), nothing else changes`,error===''&&!!added&&added.type==='triangle'&&added.sign===-blocked.comps.find(c=>c.id==='Blank133').sign&&s.S.comps.length===blocked.comps.length+1);
 check(`${mode}: the message says ${word} copy, not connected`,msgs.length===1&&msgs[0].startsWith(`已建立「`)&&msgs[0].includes(`的${word}副本`)&&/沒有和任何零件相接/.test(msgs[0])&&noInternalId(msgs[0]),msgs.join('|'));
 check(`${mode}: one undo restores exactly`,s.log.undo===1&&s.log.undoSnap===s.orig);}

// ---------------------------------------------------------------- a fused set copies as one and says how many pieces
{const six=example('six-bar-lift'),root=six.comps.find(c=>c.barFusionRoot);
 const {s,error,msgs}=copy(six,root.id);
 check('fused: all pieces are copied together (one undo)',error===''&&s.S.comps.length>six.comps.length+1&&s.log.undo===1,error+msgs.join('|'));
 check('fused: the message says how many pieces came along',/整片 \d+ 段一起/.test(msgs[0]||''),msgs.join('|'));}

// ---------------------------------------------------------------- refusals change nothing, push no undo, say one thing in the dialog
{const box=structuredClone(blocked);box.comps.find(c=>c.id==='Blank133').boxPanel=true;
 const a=copy(box,'Blank133');
 check('refusal: a box panel is refused with its sentence, nothing changes, no undo',a.error==='盒體請從「卡榫盒子」新增另一組，或存成組合積木後加入。'&&!a.s.changed&&a.s.log.undo===0&&a.msgs.length===0);
 const fusedGear=structuredClone(blocked);fusedGear.comps.find(c=>c.id==='Blank133').fusedWith='Gx';
 const b=copy(fusedGear,'Blank133');
 check('refusal: a plate fused with a gear is refused',b.error==='這片板已與齒輪合成，請先解除合成再複製。'&&!b.s.changed&&b.s.log.undo===0);
 const c=copy(blocked,'NoSuchPart');
 check('refusal: nothing to copy says so',c.error==='請先選取連桿或板件。'&&!c.s.changed&&c.s.log.undo===0);
 const bad=structuredClone(blocked);bad.params[bad.comps.find(c=>c.id==='Blank136').lenParam]=NaN;
 const d=copy(bad,'Blank136');
 check('refusal: invalid size says so and changes nothing',d.error==='零件尺寸無效，請先修正尺寸。'&&!d.s.changed&&d.s.log.undo===0);}

// ---------------------------------------------------------------- an old problem elsewhere does not block copying
{check('fixture: the work really has the old problem (motor off its plate hole)',MR.offPlateMotors(blocked.comps).length===1);
 const r=copy(blocked,'Blank137'),off=fixture('motor-off-plate.json'),plate=off.comps.find(c=>c.type==='triangle'||c.type==='bar');
 check('old problem: copying still works while the motor is off its plate',r.error===''&&r.s.log.undo===1&&r.s.S.comps.length===blocked.comps.length+1,r.error);
 const r2=copy(off,plate.id);
 check('old problem: same with the other fixture',r2.error===''&&r2.s.log.undo===1,r2.error);}

// ---------------------------------------------------------------- purity
{const w=structuredClone(blocked),before=JSON.stringify(w);
 const p=planCopy({comps:w.comps,params:w.params,modules:[],counter:900},{id:'Blank136'});
 check('plan is pure and names the part to select',p.ok&&JSON.stringify(w)===before&&!!p.comps.find(c=>c.id===p.selectedId)&&p.selectedId!=='Blank136');}
report('copy-pipeline');
