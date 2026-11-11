// Pack O4 of docs/SDD-OPERATION-PIPELINE.md: slider delete / release / 換固定端 / 翻面 on the shared edit pipeline.
//   node test/slider-pipeline.mjs      (built-in slider-crank example + test/fixtures/delete-blocked.json, motor-off-plate.json)
import {check,report} from './_harness.mjs';
import {session,fixture,example,noInternalId,roundTrips,normalizeSnapshot} from './_pipeline-rig.mjs';
const R='../js/blocks/';
const {deleteSelectedPart}=await import(R+'delete-part.js');
const {splitSelected}=await import(R+'connect-ops.js');
const {S:shared}=await import(R+'state.js');
const Model=await import(R+'model.js');
const {createSliderEditor}=await import(R+'slider-editor.js');
const MR=await import(R+'motor-release.js');

const crank=example('slider-crank');
const del=(w,sel)=>{const s=session(w,sel);const ok=deleteSelectedPart({...s.host,closeMobileEditPanel(){},setSliderDetailRows(){}});return {...s,ok,msgs:s.log.msgs};};

// ---------------------------------------------------------------- delete
{const r=del(crank,{selectedSliderId:'Slider1'});
 check('delete: only the slider goes, the bars and anchors stay',r.ok&&r.ids().join()===crank.comps.map(c=>c.id).filter(i=>i!=='Slider1').join()&&r.ids().includes('Link2')&&r.log.undo===1&&r.log.undoSnap===r.orig);
 check('delete: its rail length parameter goes with it, the others stay',!('SL1' in r.S.topo.params)&&'LL1' in r.S.topo.params&&'LL2' in r.S.topo.params);
 check('delete: one line, says the bar was kept, no internal id',r.msgs.length===1&&/^已刪除「滑軌」。原本相接的 1 個零件保留，接孔已放開。$/.test(r.msgs[0])&&noInternalId(r.msgs[0]),r.msgs.join('|'));
 check('delete: the saved work normalizes back unchanged',roundTrips(r));
 const hole=del(crank,{selectedNodeId:'P3'});
 check('delete: selecting the joint shared with the bar does not guess (nothing changes, no undo, one line)',!hole.changed&&hole.log.undo===0&&hole.msgs.length===1&&/共用/.test(hole.msgs[0])&&noInternalId(hole.msgs[0]),hole.msgs.join('|'));}

// ---------------------------------------------------------------- release: split the bar from the slider
{const s=session(crank,{selectedNodeId:'P3'});const ok=splitSelected({...s.host});
 check('release: the bar lets go of the slider, both stay',ok&&s.S.comps.length===crank.comps.length&&s.log.undo===1&&s.log.undoSnap===s.orig);
 check('release: one line naming both in plain words',s.log.msgs.length===1&&/已把「(桿件|滑軌)」從這個接點分開/.test(s.log.msgs[0])&&noInternalId(s.log.msgs[0]),s.log.msgs.join('|'));
 check('release: the slider and the bar no longer share a point',(x=>x[0].p3.id!==x[1].p2.id)([s.S.comps.find(c=>c.id==='Slider1'),s.S.comps.find(c=>c.id==='Link2')]));
 const lone=session(crank,{selectedNodeId:'Sa'});const refused=splitSelected({...lone.host});
 check('release refusal: a point of one part says so, changes nothing, no undo',!refused&&!lone.changed&&lone.log.undo===0&&lone.log.msgs.length===1,lone.log.msgs.join('|'));}

// ---------------------------------------------------------------- 換固定端 / 翻面 through the real slider editor
function editorOn(w,sliderId){
  Object.assign(shared,{comps:structuredClone(w.comps),modules:[],counter:w.counter??500,theta:0});shared.topo={params:{...w.params},tracePoints:[],dimensions:[],loads:[]};
  shared.selectedSliderId=sliderId;
  const log={undo:0,msgs:[],snap:null},noop=()=>{};
  const ed=createSliderEditor({pushUndo(){log.undo++;log.snap=JSON.stringify([shared.comps,shared.topo.params]);},notify:m=>log.msgs.push(m),rebuild:noop,draw:noop,pause:noop,cancelMotorMode:noop,deselectGear:noop,openMobileEditPanel:noop,
    updatePointCoordsById:(id,x,y)=>Model.updatePointCoordsById(shared.comps,id,x,y),renderLenEditor:noop,setLenButtonTitles:noop,updatePlateShapeControls:noop});
  return {ed,log,orig:JSON.stringify([shared.comps,shared.topo.params])};
}
{const t=editorOn(crank,'Slider1'),sl=shared.comps.find(c=>c.id==='Slider1'),startA=sl.baseEnd;
 t.ed.toggleSliderBase();
 check('base: the fixed end flips and the travel range is recomputed from the slider position',shared.comps.find(c=>c.id==='Slider1').baseEnd==='p2'&&startA!=='p2'&&t.log.undo===1&&t.log.snap===t.orig);
 check('base: one line that says which end and that the range was recomputed',t.log.msgs.length===1&&t.log.msgs[0]==='固定端換到軌道的 B 端；行程範圍已依滑塊目前位置重新計算。',t.log.msgs.join('|'));
 check('base: the object the panel holds is the same object (keepIdentity)',shared.comps.find(c=>c.id==='Slider1')===sl);
 const again=JSON.stringify([shared.comps,shared.topo.params]);t.ed.toggleSliderBase();
 check('base: pressing again flips back to A (a second, separate undo step)',shared.comps.find(c=>c.id==='Slider1').baseEnd==='p1'&&t.log.undo===2&&again!==JSON.stringify([shared.comps,shared.topo.params]));
 check('base: the saved work normalizes back unchanged',(x=>!!x&&JSON.stringify(x.comps)===JSON.stringify(shared.comps))(normalizeSnapshot((await import(R+'schema.js')).toSnapshot(shared.comps,shared.topo,shared.counter))));}
{const t=editorOn(crank,'Slider1');t.ed.flipSlider();
 check('flip: the side of the solution switches, one undo, restores exactly',shared.comps.find(c=>c.id==='Slider1').sign===-1&&t.log.undo===1&&t.log.snap===t.orig);
 check('flip: one plain line',t.log.msgs.length===1&&t.log.msgs[0]==='已翻面：滑塊改走軌道另一側的位置。'&&noInternalId(t.log.msgs[0]));}
{const t=editorOn(crank,null);const before=JSON.stringify([shared.comps,shared.topo.params]);
 t.ed.flipSlider();t.ed.toggleSliderBase();
 check('no slider selected: nothing changes and no undo (the buttons only show for a selected slider)',t.log.undo===0&&before===JSON.stringify([shared.comps,shared.topo.params]));}

// ---------------------------------------------------------------- an old problem elsewhere does not block slider edits
{const base=fixture('delete-blocked.json');
 check('fixture: the work really has the old problem (motor off its plate hole)',MR.offPlateMotors(base.comps).length===1);
 const w={...base,comps:[...base.comps,...structuredClone(crank.comps).filter(c=>c.type==='slider')],params:{...base.params,...crank.params}};
 const r=del(w,{selectedSliderId:'Slider1'});
 check('old problem: deleting a slider still works',r.ok&&!r.ids().includes('Slider1')&&r.log.undo===1&&!r.msgs.some(m=>m.includes('座板格位')),r.msgs.join('|'));
 const t=editorOn(w,'Slider1');t.ed.flipSlider();
 check('old problem: flipping a slider still works',shared.comps.find(c=>c.id==='Slider1').sign===-1&&t.log.undo===1,t.log.msgs.join('|'));
 const off=fixture('motor-off-plate.json'),w2={...off,comps:[...off.comps,...structuredClone(crank.comps).filter(c=>c.type==='slider')],params:{...off.params,...crank.params}};
 const r2=del(w2,{selectedSliderId:'Slider1'});
 check('old problem: same with the other fixture',r2.ok&&!r2.ids().includes('Slider1')&&r2.log.undo===1,r2.msgs.join('|'));}
report('slider-pipeline');
