// Pack C4 of docs/SDD-CONNECTION-INTEGRITY.md: the commit gate (js/blocks/integrity-gate.js) and the single-source motor answers.
// Real checkWork, real review/commit/delete/release entries; operation-sequences.mjs forces contradictions through every entry.
import {readFileSync} from 'node:fs';
import {execSync} from 'node:child_process';
import {check,report} from './_harness.mjs';
const rd=n=>JSON.parse(readFileSync(new URL('./fixtures/'+n,import.meta.url),'utf8'));
globalThis.window={confirm:()=>true,alert(){}};
const els=new Map(),el=()=>({style:{},dataset:{},children:[],classList:{toggle(){},add(){},remove(){}},setAttribute(){},append(){},replaceChildren(){},querySelector(){return null;},querySelectorAll(){return [];},addEventListener(){}});
globalThis.document={getElementById:id=>{if(!els.has(id))els.set(id,el());return els.get(id);},createElement:el};

const {integrityGate,loadIntegrity}=await import('../js/blocks/integrity-gate.js');
const {confirmMountingChange,commitMountingEdit,mountingWork}=await import('../js/blocks/mounting-review-ui.js');
const {startupSize}=await import('../tools/startup-size.mjs');
const {BLOCK_EXAMPLES,loadUnitStarts}=await import('../js/blocks/examples.js');
const {normalizeSnapshot}=await import('../js/blocks/schema.js');
await loadUnitStarts();

const base=rd('integrity/i1-shared-end-5mm.json');      // Bar1/Bar2 share end J, copies 5 mm apart: an I1 contradiction already
const clone=v=>structuredClone(v);
const work=f=>({comps:clone(f.comps),modules:clone(f.modules||[]),params:clone(f.params||{})});
const consistent=work(base);consistent.comps[1].p1.x=100;                // no contradiction
const broken=clone(consistent);broken.comps[1].p1.x=107;                  // new I1: 7 mm
const msgs=[];const notify=m=>msgs.push(m);

// -- lazy loading: not loaded yet -> the first commit is allowed and starts the load; afterwards the check is synchronous
check('gate allows (and prefetches) while integrity.js is not loaded yet',integrityGate(consistent,broken,notify)===true&&!msgs.length);
await loadIntegrity();
check('startup closure does not contain integrity.js or relations.js (lazy)',(()=>{const p=startupSize().paths;return !p.includes('js/blocks/integrity.js')&&!p.includes('js/blocks/relations.js');})());

// -- new contradiction refused, with part names (C3 label rules) and a highlight request
check('a new I1 contradiction is refused with a message naming both parts',integrityGate(consistent,broken,notify)===false&&/對不起來/.test(msgs[0])&&msgs[0].includes('「左桿」')&&msgs[0].includes('「右桿」')&&!/Bar[12]/.test(msgs[0]),msgs[0]);
check('a consistent candidate is accepted',integrityGate(consistent,clone(consistent),notify)===true);
// -- pre-existing issue never blocks; only the NEW one does
msgs.length=0;
check('pre-existing contradiction does not block an unrelated edit',integrityGate(work(base),(()=>{const w=work(base);w.comps[0].name='renamed';return w;})(),notify)===true&&!msgs.length);
check('worsening the same pre-existing contradiction is not "new"',integrityGate(work(base),(()=>{const w=work(base);w.comps[1].p1.x=109;return w;})(),notify)===true);
{const w=work(base);w.comps.push({id:'Bar3',type:'bar',p1:{id:'K',type:'floating',x:0,y:50},p2:{id:'K2',type:'floating',x:50,y:50}},{id:'Bar4',type:'bar',p1:{id:'K',type:'floating',x:6,y:50},p2:{id:'K3',type:'floating',x:90,y:50}});
 check('a second, new contradiction on top of an existing one is refused',integrityGate(work(base),w,notify)===false);}
// -- notices (I4) never block
{const a=normalizeSnapshot(clone(BLOCK_EXAMPLES.find(e=>e.id==='fourbar-crank-rocker').snapshot)),b=clone(a);
 const crank=b.comps.find(c=>c.isInput);crank.phaseOffset=(crank.phaseOffset||0)+37;     // I4 notice only
 check('a notice-only candidate (I4) is accepted',integrityGate({comps:a.comps,modules:a.modules||[],params:a.params,topo:a},{comps:b.comps,modules:b.modules||[],params:b.params,topo:b},notify)===true);}
// -- I3 contradiction (two motors share one partId) is refused as well
{const f=rd('integrity/i3-duplicate-part-id.json'),ok=work(f);const bad=clone(ok);
 const owners=bad.comps.filter(c=>c.motorMount?.partId);owners.forEach(c=>c.motorMount.partId='MotorX');
 const w0=clone(ok);w0.comps.filter(c=>c.motorMount?.partId).forEach((c,i)=>c.motorMount.partId='MotorX'+i);
 check('a new I3 contradiction (duplicate motor partId) is refused',integrityGate(w0,bad,notify)===false,String(msgs.at(-1)));}

// -- shared review / commit entries (drag commit, resize, set-as-frame, motor install, ...) use the same gate
{msgs.length=0;let undo=0;const S={comps:clone(consistent.comps),modules:[],topo:{params:clone(consistent.params)},fabrication:{}};
 check('confirmMountingChange (drag commit, motor install/drop review, bench, chain, fusion) refuses a new contradiction',confirmMountingChange(mountingWork(S),{...mountingWork(S),comps:broken.comps},{notify})===false&&/未套用/.test(msgs[0]));
 const before=S.comps;
 check('commitMountingEdit (resize, set-as-frame, frame holes, plate/gear/slider editors) refuses: work unchanged, no undo entry',commitMountingEdit(S,d=>{d.comps[1].p1.x=107;},{pushUndo:()=>undo++,notify})===false&&undo===0&&S.comps===before&&S.comps[1].p1.x===100);
 check('commitMountingEdit still accepts a consistent edit with one undo entry',commitMountingEdit(S,d=>{d.comps[0].name='ok';},{pushUndo:()=>undo++,notify})===true&&undo===1);}

// -- delete entry
{const {deleteSelectedPart}=await import('../js/blocks/delete-part.js');
 const S=normalizeSnapshot(clone(BLOCK_EXAMPLES.find(e=>e.id==='fourbar-crank-rocker').snapshot));
 Object.assign(S,{topo:{params:S.params},modules:S.modules||[],selectedLinkId:S.comps.find(c=>c.type==='bar'&&!c.isInput).id});
 msgs.length=0;let undo=0;const n=S.comps.length;
 deleteSelectedPart({S,transient:notify,deleteGearChain(){},pushUndo:()=>undo++,pause(){},closeMobileEditPanel(){},setSliderDetailRows(){},rebuild(){},draw(){},points:{}});
 check('delete of an ordinary part is not refused',undo===1&&S.comps.length===n-1&&!msgs.some(m=>/未套用/.test(m)),msgs[0]);}

// -- a work that already has an I1 (user file motor-off-plate): repairs and unrelated edits are never "new" (browser regression of b6ee062)
{const {readStoredProject}=await import('../js/blocks/project-envelope.js'),{alignSavedInputPhase}=await import('../js/blocks/schema.js');
 const {run}=await import('../js/blocks/motor-release.js'),{S}=await import('../js/blocks/state.js');
 const {compileTopology}=await import('../js/core/topology.js'),{solveTopology}=await import('../js/multilink/solver.js');
 const load=()=>alignSavedInputPhase(normalizeSnapshot(readStoredProject(rd('motor-off-plate.json'))));
 const pts=s=>solveTopology(compileTopology(s.comps,{params:{...s.params}},new Set()),{thetaDeg:0,motorAngles:{1:0}}).points;
 for(const action of ['release','back','leave']){
  const s=load(),points=pts(s),notes=[],undo=[];Object.assign(S,{comps:s.comps,modules:[],topo:{params:s.params},fabrication:s.fabrication,counter:139,mode:'design',selectedLinkId:'Blank135'});
  const ok=run(action,{S,pause(){},pushUndo:()=>undo.push(1),rebuild(){},draw(){},notify:m=>notes.push(m),save(){},refresh(){},points:()=>points,motion:{}});
  check(`motor-off-plate: "${action}" is not refused by the gate and makes one undo step`,ok===true&&undo.length===1&&!notes.some(m=>/未套用/.test(m)),notes.join(' '));
 }
 const w0=(()=>{const s=load();return {comps:s.comps,modules:[],params:s.params};})();
 // resizing a bar elsewhere (a bar that is not part of the broken hole) is accepted
 const resized=clone(w0);const other=resized.comps.find(c=>c.type==='bar'&&!c.isInput&&c.p1&&!['Blank135','Motor133'].includes(c.id))||resized.comps.find(c=>c.type==='bar');
 other.name='moved elsewhere';
 check('a work that already has an I1: an unrelated edit is accepted',integrityGate(w0,resized,notify)===true);
 // the same broken hole with different parts involved (the release case) is not new
 const swapped=clone(w0);swapped.comps.forEach(c=>{if(c.type==='bar'&&c.isInput)c.name='renamed';});
 check('a work that already has an I1: same hole, other parts involved, is not new',integrityGate(w0,swapped,notify)===true);
 // a genuinely new I1 on another hole is refused, and the message uses names, not internal ids
 const fresh=clone(w0);{const p=fresh.comps.flatMap(c=>c.type==='bar'||c.type==='triangle'?[c.p1,c.p2]:[]).find(p=>p&&p.id!=='Blank133_H24_32'&&fresh.comps.filter(c=>[c.p1,c.p2,c.p3].some(q=>q?.id===p.id)).length>1);
  if(p){p.x+=9;}else check('fixture has a shared end to break',false);}
 msgs.length=0;
 check('a genuinely new I1 on a different hole is still refused',integrityGate(w0,fresh,notify)===false&&/未套用/.test(msgs[0]),msgs[0]||'');
 check('refusal text uses student-visible names, no internal ids',!/Blank\d|Motor\d|_H\d/.test(msgs[0]||''),msgs[0]);
}
{// the fixture release as the browser did it: independent motor part, no name -> its model
 const {S}=await import('../js/blocks/state.js');
 const w=work(base);w.comps[1].p1.x=107;msgs.length=0;
 check('refusal names parts by their names',integrityGate(consistent,w,notify)===false&&msgs[0].includes('「右桿」'),msgs[0]);
}
// -- wiring that the Node harness cannot drive (app.js / input.js need a browser): the calls must stay in place
const src=n=>readFileSync(new URL('../js/blocks/'+n,import.meta.url),'utf8');
check('app.js mergePoints hands the drop to connect-ops.js, which commits through runEdit (shared gate)',/const mergePoints[\s\S]{0,300}connect-ops\.js/.test(src('app.js'))&&/runEdit\(/.test(src('connect-ops.js'))&&/integrityGate\(/.test(src('edit-pipeline.js')));
check('app.js prefetches integrity.js after the first work is applied',/integrityHints\('check'\);loadIntegrity\(\)/.test(src('app.js')));
check('input.js drag commit goes through confirmMountingChange',/function commitDragUndo[\s\S]{0,300}confirmMountingChange\(/.test(src('input.js')));
check('motor-release.js, delete-part.js and connect-ops.js (through the shared edit-pipeline.js runEdit) ask the gate',/runEdit\(/.test(src('motor-release.js'))&&/runEdit\(/.test(src('delete-part.js'))&&/runEdit\(/.test(src('connect-ops.js'))&&/integrityGate\(/.test(src('edit-pipeline.js')));

// -- every built-in example: ordinary edits are never refused (rename one part; move the whole work rigidly)
{let refused=0,n=0;
 for(const e of BLOCK_EXAMPLES){
  const w=normalizeSnapshot(clone(e.snapshot));if(!w?.comps?.length)continue;n++;
  const a={comps:w.comps,modules:w.modules||[],params:w.params||{},topo:w};
  const renamed=clone(a);renamed.comps[0].name='renamed';
  const moved=clone(a);for(const c of moved.comps)for(const k of ['p1','p2','p3','m1','m2'])if(c[k]){c[k].x+=16;c[k].y-=8;}
  for(const b of [renamed,moved]){msgs.length=0;if(!integrityGate(a,b,notify))refused++;}
 }
 check(`gate never refuses an ordinary edit on any of the ${n} built-in examples`,refused===0,`${refused} refused: ${msgs[0]}`);}

// -- single source for the motor / ground answers (js/blocks/motor-roles.js) and the behaviour changes it brings
{const Model=await import('../js/blocks/model.js'),{motorTypeAt,servoInputAt}=await import('../js/blocks/motor-tools.js'),{buildRelations}=await import('../js/blocks/relations.js');
 const ex=id=>normalizeSnapshot(clone(BLOCK_EXAMPLES.find(e=>e.id===id).snapshot)).comps;
 // fixed: motor-driven gear / cam / pulley axes were labelled "機架固定點" (pointHasMotor knew only bars) but are motors
 for(const [id,pt] of [['gear-pair','GCA'],['cam-follower','CC'],['pulley-belt','PLA']]){
  const comps=ex(id);
  check(`${id}/${pt}: role label is 馬達 (was 機架固定點)`,Model.roleLabel(comps,pt)==='馬達');
  check(`${id}/${pt}: motorPointIds still contains it`,Model.motorPointIds(comps).has(pt));
  check(`${id}/${pt}: relations.motorOf agrees`,buildRelations({comps}).motorOf(pt)?.centerId===pt);
 }
 const gears=ex('parallel-gripper');
 check('mg995 gear axis: motorTypeAt and servoInputAt agree',motorTypeAt(gears,'PGLeftAxis')==='mg995'&&servoInputAt(gears,'PGLeftAxis')?.motorType==='mg995');
 check('declared ground is unchanged: motor/fixed/linear typed points only (locked plates stay "free" for the drag/role code)',Model.isGroundPoint({type:'linear'})&&Model.isGroundPoint({type:'fixed'})&&!Model.isGroundPoint({type:'floating'})&&!Model.isGroundPoint(null));
 check('pointIsGround keeps ignoring plates locked by two fixed holes (relations.isGround counts them: callers needing declared ground stay on isGroundPoint)',Model.pointIsGround(ex('fourbar-crank-rocker'),'Blank7.C')===false&&buildRelations({comps:ex('fourbar-crank-rocker')}).isGround('Blank7.C')===true);}

// -- the replaced implementations and dead alias reads are gone
check('dead alias reads physical_motor / motor_carrier / motorMount.hostBody / slider.driverId are gone from js/blocks',(()=>{
  const out=execSync("grep -rn 'physical_motor\\|motor_carrier\\|motorMount?.hostBody\\|[.]driverId' js/blocks || true",{cwd:new URL('../',import.meta.url),encoding:'utf8'});return !out.trim();})());
report('commit-gate');
