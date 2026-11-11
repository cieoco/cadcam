// User report 2026-11-12 「為什麼齒輪沒有直接連上馬達呢」: dragging the centre of a free DRIVER gear onto an independent motor's shaft makes that gear the motor's output.
// The whole train (meshed gears, chains, coaxial gears, rack + guide pins) moves rigidly; the data shape is planMotorInstallation's.   node test/gear-onto-motor.mjs
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {check,report} from './_harness.mjs';
import * as Store from '../js/blocks/storage.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {storedProject} from '../js/blocks/project-envelope.js';
import {planDraggedMotorOutput} from '../js/blocks/motor-drop.js';
import {connectDraggedMotorOutput} from '../js/blocks/motor-drop-ui.js';
import {compileTopology} from '../js/core/topology.js';
import {solveTopology} from '../js/multilink/solver.js';
import {localHoles} from '../js/core/local-holes.js';

globalThis.document={getElementById:()=>null};globalThis.window={confirm:()=>true};
const clone=v=>structuredClone(v);
const raw=JSON.parse(readFileSync(new URL('./fixtures/gear-onto-motor.json',import.meta.url),'utf8'));await Store.prepareMotorParts(raw);
const W=normalizeSnapshot(clone(raw)),SHAFT='Blank88_H24_24';
const src=(w=W)=>({comps:w.comps,params:w.params,modules:w.modules,fabrication:w.fabrication,counter:w.counter});
const get=(w,id)=>w.comps.find(c=>c.id===id);
const plan=(from,w=W)=>planDraggedMotorOutput(src(w),from,SHAFT,{},{thetaDeg:0});
const ang=(p,c)=>Math.atan2(p.y-c.y,p.x-c.x);
const solveAt=(comps,params,deg)=>solveTopology(compileTopology(comps,{params},new Set()),{thetaDeg:deg,motorAngles:{1:deg}});
const spin=(comps,params,a,b,c)=>{const out=[];for(let i=0;i<12;i++){const r=solveAt(comps,params,i*30);if(!r.isValid||r.isUnderconstrained)return null;out.push([ang(r.points[a.p2.id],r.points[a.p1.id]),ang(r.points[b.p2.id],r.points[b.p1.id])]);}return out;};
const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));

// 1. success on the user's fixture
const original=JSON.stringify(W.comps),r=plan('GC89');
check('drop gear centre on the shaft: planned ok',r.matched&&r.ok&&!!r.simulation?.ok,r.message);
check('planner is pure (source untouched)',JSON.stringify(W.comps)===original);
const g1=get(r,'Gear89')||r.comps.find(c=>c.id==='Gear89'),g2=r.comps.find(c=>c.id==='Gear90'),o1=get(W,'Gear89'),o2=get(W,'Gear90'),m0=get(W,'Motor90');
check('gear centre takes the shaft point id; independent motor part is consumed into the gear',g1.p1.id===SHAFT&&g1.p1.physicalMotor==='1'&&g1.motorMount?.frameBody==='Blank88'&&g1.motorMount.center===SHAFT&&g1.motorMount.partId==='Motor90'&&!r.comps.some(c=>c.type==='motor'));
const dx=g1.p1.x-o1.p1.x,dy=g1.p1.y-o1.p1.y;
check('gear centre lands exactly on the shaft',Math.abs(g1.p1.x-m0.p1.x)<1e-9&&Math.abs(g1.p1.y-m0.p1.y)<1e-9);
check('both gears translated by the same vector; centre distance stays 72 mm',Math.abs(g2.p1.x-o2.p1.x-dx)<1e-9&&Math.abs(g2.p1.y-o2.p1.y-dy)<1e-9&&Math.abs(g1.p2.x-o1.p2.x-dx)<1e-9&&Math.abs(Math.hypot(g2.p1.x-g1.p1.x,g2.p1.y-g1.p1.y)-72)<1e-6);
check('driven gear keeps its mesh; its axle is held on the frame (like the built-in gear examples)',g2.mesh==='Gear89'&&g2.p1.type==='fixed'&&g2.p1.id==='GC90');
const plate=r.comps.find(c=>c.id==='Blank88');
check('plate mount holes consistent (motor hole still listed, mount point kept)',plate.motorMountPoint===SHAFT&&plate.standardBlank.mountHoles.some(h=>h.id===SHAFT)&&localHoles(plate).concat(plate.standardBlank.mountHoles).some(h=>h.id===SHAFT));
const sp=spin(r.comps,r.params,g1,g2);
check('compile + solve valid at 12 angles',!!sp);
check('driver follows the motor; Gear90 turns the opposite way at 1:1',!!sp&&sp.every(([a,b],i)=>Math.abs(wrap(a-sp[0][0]-i*30*Math.PI/180))<1e-6&&Math.abs(wrap(b-sp[0][1]+i*30*Math.PI/180))<1e-6));
check('success sentence is plain words, no internal ids',/^已把「.*18 齒齒輪」接到馬達輸出軸；嚙合的齒輪一起移到位/.test(r.message)&&!/Gear|GC\d|Blank\d/.test(r.message),r.message);

// 2. the real commit: one undo restores exactly; stale result ignored; selection and message
{
  const state={comps:W.comps,topo:{params:W.params},modules:W.modules,fabrication:W.fabrication,undoStack:[],theta:0,motorAngles:{},selectedNodeId:null};
  const snap=()=>JSON.stringify(state.comps),expected=snap();let message='',redraws=0;
  // the drag moved the pair and was cancelled (state restored) before the commit: the post-drag candidate must not matter
  const moved=clone(W.comps);for(const c of moved)if(c.type==='gear')for(const k of ['p1','p2']){c[k].x+=3;c[k].y-=5;}
  const args={S:state,fromId:'GC89',toId:SHAFT,candidate:{...src(),comps:moved},points:{GC89:{x:99,y:55},[SHAFT]:{x:W.comps.find(c=>c.type==='motor').p1.x,y:W.comps.find(c=>c.type==='motor').p1.y}},before:original,expected,snapshotStr:snap,rebuild(){},draw(){redraws++;},notify:m=>message=m,selectLink(){assert.fail('a gear is not selected as a link');},updateUndoBtn(){}};
  connectDraggedMotorOutput({...args,expected:'stale'});
  check('stale result: nothing changes, no undo',state.undoStack.length===0&&snap()===expected);
  connectDraggedMotorOutput(args);
  check('commit: exactly one undo entry, the gear is the output, one sentence',state.undoStack.length===1&&state.undoStack[0]===original&&state.comps.find(c=>c.id==='Gear89').p1.id===SHAFT&&/已把「.*」接到馬達輸出軸/.test(message),message);
  check('one undo restores everything exactly',JSON.stringify(JSON.parse(state.undoStack[0]))===original&&JSON.stringify(W.comps)===original);
  const W2={...W,comps:state.comps,params:state.topo.params};
  const n=normalizeSnapshot({kind:'blocks',v:1,comps:clone(state.comps),params:clone(state.topo.params),fabrication:W.fabrication});
  check('normalizeSnapshot round trip keeps the result',!!n&&JSON.stringify(n.comps.find(c=>c.id==='Gear89').p1)===JSON.stringify(W2.comps.find(c=>c.id==='Gear89').p1)&&!!spin(n.comps,n.params,n.comps.find(c=>c.id==='Gear89'),n.comps.find(c=>c.id==='Gear90')));
  // save in the motor-part shape and reopen
  const snapOut={kind:'blocks',v:1,comps:clone(state.comps),params:clone(state.topo.params),modules:[],fabrication:W.fabrication,counter:W.counter};
  const text=JSON.stringify(storedProject(await Store.toStoredShape(snapOut)),null,2),file=JSON.parse(text),proj=file.kind==='blocks-envelope'?file.project:file;
  check('saved file uses the motor-part shape (motor part drives Gear89, no legacy field left on the gear)',file.requires?.includes('motor-part-v2')&&proj.comps.some(c=>c.type==='motor'&&c.drives?.body==='Gear89')&&!('physicalMotor' in proj.comps.find(c=>c.id==='Gear89')));
  const again=JSON.parse(text);await Store.prepareMotorParts(again);const B=normalizeSnapshot(again);
  const gb=B.comps.find(c=>c.id==='Gear89'),ga=state.comps.find(c=>c.id==='Gear89');
  // documented in motor-part.js: the default model 'tt' is not written back onto non-bar outputs; key order is irrelevant
  const eq=(a,b)=>{try{assert.deepEqual(a,b);return true;}catch{return false;}},noTt=g=>{const x=clone(g);if(x.motorType==='tt')delete x.motorType;return x;};
  check('reopen: gear data equals (centre, mount, partners; default model tt not repeated)',eq(noTt(gb),noTt(ga))&&eq(B.comps.find(c=>c.id==='Gear90'),state.comps.find(c=>c.id==='Gear90')));
  const sa=spin(state.comps,state.topo.params,ga,state.comps.find(c=>c.id==='Gear90')),sb=spin(B.comps,B.params,gb,B.comps.find(c=>c.id==='Gear90'));
  check('reopen: solves identically at 12 angles',!!sa&&JSON.stringify(sa)===JSON.stringify(sb));
}

// 3. refusals: nothing changes, one plain line each
{
  const d=plan('GC90');
  check('driven gear: say to drag the driver or release the mesh first',d.matched&&!d.ok&&/被帶動的齒輪/.test(d.message)&&/分開咬合/.test(d.message)&&!/Gear\d|GC\d/.test(d.message),d.message);
  const w=clone(W);w.comps.push({type:'bar',id:'BarX',p1:{id:'GP90',type:'floating',x:194.5,y:64.27},p2:{id:'BX2',type:'floating',x:260,y:64.27},fixedLen:true,lenParam:'LX'});w.params.LX=66;
  const a=plan('GC89',w);
  check('gear train attached to another part: refused in plain words',a.matched&&!a.ok&&/已接上其他零件/.test(a.message),a.message);
  const f=clone(W);get(f,'Gear90').p1.type='fixed';
  check('gear train already on a fixed hole: refused',!plan('GC89',f).ok&&/固定孔/.test(plan('GC89',f).message));
  const pin=plan('GP89');
  check('a joint that is no output (gear pin): says what is wrong, not "several parts"',pin.matched&&!pin.ok&&/不是桿件的端孔或齒輪的中心/.test(pin.message)&&!/多個零件/.test(pin.message),pin.message);
  const plateHole=planDraggedMotorOutput(src(),'Blank88.C',SHAFT,{},{});
  check('a plate corner is no output either',plateHole.matched&&!plateHole.ok&&/不是桿件的端孔或齒輪的中心/.test(plateHole.message));
  const share=clone(W);share.comps.push({type:'bar',id:'B1',p1:{id:'GC89',type:'floating',x:90,y:64},p2:{id:'B1b',type:'floating',x:150,y:64},fixedLen:true,lenParam:'L1'});share.params.L1=60;
  const sh=plan('GC89',share);
  check('several parts share the joint: the existing sentence is kept',sh.matched&&!sh.ok&&/接孔對應多個零件/.test(sh.message),sh.message);
  const unfixed=clone(W);for(const k of ['p1','p2'])get(unfixed,'Blank88')[k].type='floating';
  const pl=plan('GC89',unfixed);
  check('existing planner refusal passes through (gear output needs a fixed plate)',pl.matched&&!pl.ok&&/固定承載板/.test(pl.message),pl.message);
  const other=clone(W);get(other,'Gear89').moduleId='m2';
  check('other module: refused',!plan('GC89',other).ok);
}

// 4. longer train (3 gears, a chain) and a rack with guide pins all move together
{
  const w=clone(W);const g=clone(get(w,'Gear90'));Object.assign(g,{id:'Gear91',mesh:'Gear90',radiusParam:'GR91',pinRadiusParam:'GPR91',p1:{id:'GC91',type:'floating',x:g.p1.x+72,y:g.p1.y},p2:{id:'GP91',type:'floating',x:g.p1.x+72+32,y:g.p1.y}});g.holes=g.holes.map(h=>({...h,id:h.id.replace('90','91')}));
  w.comps.push(g);w.params.GR91=36;w.params.GPR91=32;
  const c=plan('GC89',w);
  const ok3=c.ok&&['Gear90','Gear91'].every(id=>{const a=get(w,id),b=c.comps.find(x=>x.id===id);return Math.abs(b.p1.x-a.p1.x-(c.comps.find(x=>x.id==='Gear89').p1.x-get(w,'Gear89').p1.x))<1e-9&&b.p1.type==='fixed';});
  const s3=c.ok&&spin(c.comps,c.params,c.comps.find(x=>x.id==='Gear89'),c.comps.find(x=>x.id==='Gear91'));
  check('three-gear chain: every gear moves by the same vector; Gear91 turns the same way as the driver',ok3&&!!s3&&s3.every(([a,b],i)=>Math.abs(wrap(a-s3[0][0]-i*30*Math.PI/180))<1e-6&&Math.abs(wrap(b-s3[0][1]-i*30*Math.PI/180))<1e-6),c.message);
  const rk=clone(W);rk.comps.push({type:'anchor',id:'RackGuideT',p1:{id:'RGT',type:'fixed',x:70,y:20}},{type:'rack',id:'RackT',color:'#16a085',p1:{id:'RKT',type:'floating',x:90,y:30},pinion:'Gear89',lenParam:'RKLT',axisDeg:0,sign:1,bodyHeight:22,slot:{length:128,width:5,offset:0},framePins:['RGT']});rk.params.RKLT=172;
  const q=plan('GC89',rk),vx=q.ok&&q.comps.find(x=>x.id==='Gear89').p1.x-get(rk,'Gear89').p1.x;
  check('rack with its guide pin moves with the pinion and stays valid',q.ok&&Math.abs(q.comps.find(x=>x.id==='RackT').p1.x-90-vx)<1e-9&&Math.abs(q.comps.find(x=>x.id==='RackGuideT').p1.x-70-vx)<1e-9&&q.comps.find(x=>x.id==='RackGuideT').p1.type==='fixed'&&q.simulation.ok,q.message);
}
report('gear-onto-motor');
