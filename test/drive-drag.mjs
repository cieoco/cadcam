// Drag-to-drive (js/blocks/drive-drag.js): in a mechanism with a motor, dragging a coupler or rocker point/body turns the input
// angle so that point follows the pointer; bar lengths and connections never change (user file 2026-11-11, four-bar on a plate).
//   node test/drive-drag.mjs
import {readFileSync} from 'node:fs';
import {check,report} from './_harness.mjs';
import {S} from '../js/blocks/state.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {compileTopology} from '../js/core/topology.js';
import {solveTopology} from '../js/multilink/solver.js';
import {driveTo,bodyProbe,pullTip} from '../js/blocks/drive-drag.js';

const raw=JSON.parse(readFileSync(new URL('./fixtures/fourbar-drag-rocker.json',import.meta.url)));
const w=normalizeSnapshot(raw.project||raw),compiled=compileTopology(w.comps,{params:w.params},new Set());
const before=JSON.stringify([w.comps,w.params]);
const solveAt=t=>solveTopology(compiled,{thetaDeg:t,motorAngles:{1:t}});
let range=null;
const host={solveAt:(t,seed)=>solveTopology(compiled,{thetaDeg:t,motorAngles:{1:t},_prevPoints:seed}),seed:()=>solveAt(S.theta).points,range:()=>range,
  setTheta:t=>{S.theta=t;},displayCoords:()=>solveAt(S.theta).points,pointCoords:()=>({}),updateMotorSwitcher:()=>{}};
S.activeMotor='1';
const at=(id,t)=>solveAt(t).points[id];
const near=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

// rocker top joint: aim at where it is at 40° → theta goes there
S.theta=0;let target=at('Blank110.B',40);
let ok=driveTo(host,p=>p['Blank110.B'],target);
check('dragging the rocker joint turns the input (a rocker point is reached at two input angles; either is fine)',ok&&S.theta!==0,`theta ${S.theta}`);
check('the dragged joint ends near the pointer',near(at('Blank110.B',S.theta),target)<0.6,near(at('Blank110.B',S.theta),target).toFixed(2));
// a hole on the rocker
S.theta=0;target=at('Blank111_H24_0',-30);
check('dragging a hole on the rocker works the same way',driveTo(host,p=>p['Blank111_H24_0'],target)&&Math.abs(S.theta+30)<1.5,`theta ${S.theta}`);
// body grab point on the coupler
S.theta=10;const coupler=w.comps.find(c=>c.id==='Blank110');const pts10=solveAt(10).points;
const grab={x:(pts10['Blank107.B'].x+pts10['Blank110.B'].x)/2,y:(pts10['Blank107.B'].y+pts10['Blank110.B'].y)/2+3};
const probe=bodyProbe(host,coupler,grab);
check('grabbing the coupler body gives a probe that follows the input',typeof probe==='function'&&near(probe(pts10),grab)<1e-6);
const p50=solveAt(50).points,goal=probe(p50);
check('dragging the coupler body brings the grabbed point to the pointer',driveTo(host,probe,goal)&&near(probe(solveAt(S.theta).points),goal)<0.6,`theta ${S.theta} d ${near(probe(solveAt(S.theta).points),goal).toFixed(2)}`);
// frame plate: does not move with the input → not a drive drag
S.theta=0;
check('the frame plate is not driven (probe is null)',bodyProbe(host,w.comps.find(c=>c.id==='Blank105'),at('Blank105_H40_40',0))===null);
check('a frame hole is not driven',driveTo(host,p=>p['Blank105_H40_40'],{x:0,y:0})===false&&S.theta===0);
// servo-like range: theta stays inside
S.theta=0;range={lo:-10,hi:10};
driveTo(host,p=>p['Blank110.B'],at('Blank110.B',40));
check('a limited input range is respected',S.theta<=10+1e-9&&S.theta>0,`theta ${S.theta}`);range=null;
// nothing in the work changed
check('lengths and connections are unchanged (only the input angle moves)',JSON.stringify([w.comps,w.params])===before);
S.comps=structuredClone(w.comps); S.topo={params:{...w.params}};
const last=S.comps.find(c=>c.id==='Blank111'), preceding=S.comps.find(c=>c.id==='Blank110');
const goalHole={x:last.p2.x+8,y:last.p2.y+8};
check('a connected frame hole stays in drive mode',!pullTip(host,last.p2.id,goalHole));
last.p2={...last.p2,id:'free-tip'};
const elbowBefore={...last.p1}, rootBefore={...preceding.p1};
check('one pull moves the free tip and the shared elbow',pullTip(host,last.p2.id,goalHole)
  && near(last.p2,goalHole)<1e-6 && near(last.p1,elbowBefore)>1 && near(last.p1,preceding.p2)<1e-6);
pullTip(host,last.p2.id,{x:500,y:300});
check('out-of-reach motion preserves both bar lengths and the upstream pivot',
  [last,preceding].every(c=>Math.abs(near(c.p1,c.p2)-w.params[c.lenParam])<1e-6) && near(rootBefore,preceding.p1)<1e-6);
report('drive-drag');
