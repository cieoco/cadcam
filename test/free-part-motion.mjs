// A part that is not attached to anything (a bar just placed on the canvas) stays where it is and must not stop the connected
// mechanism from being dragged or played (user file 2026-11-11: plate + motor bar + one loose bar → "解不出").
//   node test/free-part-motion.mjs
import {readFileSync} from 'node:fs';
import {check,report} from './_harness.mjs';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {compileTopology} from '../js/core/topology.js';
import {solveTopology} from '../js/multilink/solver.js';
import {createSimulationScope} from '../js/blocks/simulation-scope.js';
import {motionPoseIssue,inspectMotionRange} from '../js/blocks/solve-health.js';

const raw=JSON.parse(readFileSync(new URL('./fixtures/free-bar-blocks-motor.json',import.meta.url)));
const w=normalizeSnapshot(raw.project||raw);
const scopeOf=comps=>{const topo={params:w.params};return createSimulationScope({comps,modules:[],topo,compiled:compileTopology(comps,topo,new Set()),assembly:null,mode:'design',designFocus:null});};
const scope=scopeOf(w.comps);
check('the loose bar is left out of the moving parts; the plate and motor bar stay in',!scope.moving.some(c=>c.id==='Blank110')&&['Blank105','Blank107'].every(id=>scope.moving.some(c=>c.id===id)),scope.moving.map(c=>c.id).join());
check('the loose bar is still in the scope (drawn and draggable)',scope.comps.some(c=>c.id==='Blank110'));
const solveAt=a=>solveTopology(scope.compiled,{thetaDeg:a,motorAngles:{1:a}});
check('with the full part list the old check still reports the loose bar (other callers unchanged)',!!motionPoseIssue(scope.comps,solveAt(30)));
check('the moving parts solve with no issue at several angles',[0,30,90,200].every(a=>!motionPoseIssue(scope.moving,solveAt(a))));
const range=inspectMotionRange({comps:scope.moving,solveAt:(a)=>solveAt(a),theta:0,plan:{mode:'spin'},stepDeg:10});
check('a full turn plays',range.ok!==false,JSON.stringify(range).slice(0,200));
// once the bar is attached (its end on the motor bar's tip) it takes part again
const tip=w.comps.find(c=>c.id==='Blank107').p2;
const joined=structuredClone(w.comps);joined.find(c=>c.id==='Blank110').p1={...tip};
check('an attached bar is a moving part again',scopeOf(joined).moving.some(c=>c.id==='Blank110'));
// a removed loose bar changes nothing for the rest
check('removing the loose bar gives the same moving parts',JSON.stringify(scopeOf(w.comps.filter(c=>c.id!=='Blank110')).moving.map(c=>c.id))===JSON.stringify(scope.moving.map(c=>c.id)));
report('free-part-motion');
