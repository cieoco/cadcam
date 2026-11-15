import assert from 'node:assert/strict';
import { S } from '../js/blocks/state.js';
import * as Model from '../js/blocks/model.js';
import * as Tools from '../js/blocks/tools.js';
import * as Input from '../js/blocks/input.js';
import {planInsertPin,planUnpin,pinPairs} from '../js/blocks/pin-ops.js';

const svg = new EventTarget();
globalThis.document = new EventTarget();
svg.style = {};
svg.appendChild = () => {};
svg.setPointerCapture = () => {};
let selected = '';
let displayOverride = null;
const displayed = () => ({ ...Model.pointCoords(S.comps), ...(displayOverride || {}) });
Tools.init({
  svg, draw() {}, rebuild() {}, pushUndo() {}, pause() {}, cancelMotorMode() {},
  deselectLink() {}, selectLink(id) { selected = id; }, selectTriangle() {}, selectSlider() {},
  setBanner() {}, clearBanner() {}, worldFromEvent: e => e.world,
  pointCoords: () => Model.pointCoords(S.comps), displayPointCoords: displayed,
  nearestDisplayToPoint(world, exclude = [], maxDist = 13) {
    return Object.entries(displayed()).find(([id, p]) =>
      !exclude.includes(id) && Math.hypot(p.x - world.x, p.y - world.y) < maxDist)?.[0] || null;
  },
  snapWorld: () => 13, mobilePrompt: () => false, promptText: desktop => desktop
});

function reset(comps = []) {
  S.comps = comps;
  S.topo = { params: { theta: 0 } };
  S.counter = 0;
  selected = '';
  displayOverride = null;
  Tools.exitDrawLink();
}
function drawLink(from, to) {
  Tools.startDrawLink();
  Tools.startLinkAt(from);
  Tools.finishDrawLink({ world: to });
  return S.comps.find(c => c.id === selected);
}

reset();
let bar = drawLink({ x: 0, y: 0 }, { x: 81, y: 0 });
assert.equal(bar.type, 'bar');
assert.equal(bar.p1.id, 'P1a');
assert.equal(bar.p2.id, 'P1b');
assert.equal(S.topo.params.LL1, 80);

reset([
  { type: 'anchor', id: 'AnchorA', p1: { id: 'A', type: 'fixed', x: 0, y: 0 } },
  { type: 'anchor', id: 'AnchorB', p1: { id: 'B', type: 'fixed', x: 80, y: 0 } }
]);
bar = drawLink({ x: 4, y: 2 }, { x: 77, y: 3 });
assert.equal(bar.p1.id, 'P1a');
assert.deepEqual({x:bar.p1.x,y:bar.p1.y},{x:0,y:0});
assert.equal(bar.p2.id, 'P1b');
assert.deepEqual({x:bar.p2.x,y:bar.p2.y},displayed().B);
assert.equal(S.topo.params[bar.lenParam], 80);

reset([{ type: 'anchor', id: 'AnchorB', p1: { id: 'B', type: 'fixed', x: 81, y: 0 } }]);
bar = drawLink({ x: 0, y: 0 }, { x: 79, y: 2 });
assert.equal(bar.p1.id, 'P1a');
assert.equal(bar.p2.id, 'P1b');
assert.deepEqual({x:bar.p2.x,y:bar.p2.y},displayed().B);
assert.equal(S.topo.params[bar.lenParam], 81);

reset([
  { type: 'bar', id: 'Crank', p1: { id: 'O', type: 'fixed', x: 0, y: 0 },
    p2: { id: 'M', type: 'floating', x: 80, y: 0 }, lenParam: 'R', fixedLen: true },
  { type: 'anchor', id: 'AnchorB', p1: { id: 'B', type: 'fixed', x: 80, y: 80 } }
]);
displayOverride = { M: { x: 0, y: 80 } };
bar = drawLink({ x: 2, y: 79 }, { x: 80, y: 80 });
assert.equal(bar.p1.id, 'P1a');
assert.equal(bar.p1.x, 0);
assert.equal(bar.p1.y, 80);
assert.equal(S.comps[0].p2.y, 0,'aligned creation does not change the existing crank pose');
assert.equal(bar.p2.id, 'P1b');
assert.deepEqual({x:bar.p2.x,y:bar.p2.y},displayed().B);

Input.init({
  svg, draw() {}, rebuild() {}, pause() {}, cancelMotorMode() {}, deselectLink() {}, selectLink() {},
  worldFromEvent: e => e.world, pointCoords: () => Model.pointCoords(S.comps), mobilePrompt: () => false
});
function pointer(type, x, y) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { pointerType: 'mouse', pointerId: 1, button: 0,
    clientX: x, clientY: y, world: { x, y } });
  svg.dispatchEvent(event);
}
reset();
Tools.startDrawLink();
pointer('pointerdown', 0, 0);
pointer('pointerup', 112, 0);
assert.equal(S.comps.length, 1, 'mouse drag should finish on release');
assert.equal(S.topo.params.LL1, 112);

reset();
Tools.startDrawLink();
pointer('pointerdown', 0, 0);
pointer('pointerup', 0, 0);
assert.equal(S.comps.length, 0, 'first click should leave a preview');
pointer('pointerdown', 64, 0);
pointer('pointerup', 64, 0);
assert.equal(S.comps.length, 1, 'second click should finish the bar');
assert.equal(S.topo.params.LL1, 64);

reset();
Tools.startDrawRail();
Tools.startDrawLink();
assert.equal(S.drawingLink, true, 'choosing a different drawing tool should switch modes');
assert.equal(S.drawKind, 'link');
Tools.startDrawLink();
assert.equal(S.drawingLink, false, 'choosing the active tool again should cancel it');

console.log('direct link assembly: free, snapping, moving node, mouse gestures and tool switch passed');

// A slider's moving work hole accepts a pin; its rail endpoints are not ordinary pins.
const slider={type:'slider',id:'Slide',p1:{id:'R1',type:'fixed',x:0,y:0},p2:{id:'R2',type:'fixed',x:80,y:0},p3:{id:'SlideHole',type:'floating',x:40,y:0},m1:{id:'Mount1',type:'fixed',x:8,y:8},m2:{id:'Mount2',type:'fixed',x:72,y:8},lenParam:'RailLength'};
const loose={type:'bar',id:'Loose',p1:{id:'LooseA',type:'floating',x:40,y:0},p2:{id:'LooseB',type:'floating',x:40,y:32},fixedLen:true,lenParam:'LooseLength'},pinWork={comps:[slider,loose],params:{RailLength:80,LooseLength:32}};
assert.equal(planInsertPin(pinWork,{ownerId:'Loose',otherId:'Slide',from:'LooseA',to:'R1'}).ok,false);
const pinned=planInsertPin(pinWork,{ownerId:'Slide',otherId:'Loose',from:'SlideHole',to:'LooseA'});assert.ok(pinned.ok,pinned.message);
assert.equal(pinPairs({...pinWork,...pinned},'R1').length,0);
assert.equal(pinPairs({...pinWork,...pinned},'SlideHole').length,1);
const unplugged=planUnpin({...pinWork,...pinned},{ownerId:'Slide',otherId:'Loose',at:'SlideHole'});assert.ok(unplugged.ok,unplugged.message);
const rail=unplugged.comps.find(c=>c.id==='Slide');for(const k of ['p1','p2','m1','m2'])assert.deepEqual(rail[k],slider[k]);assert.notEqual(rail.p3.id,slider.p3.id);assert.deepEqual(unplugged.params,pinWork.params);
console.log('slider pins: moving work hole only, reverse selection, pair query and unpin preserve rail/mounts passed');
