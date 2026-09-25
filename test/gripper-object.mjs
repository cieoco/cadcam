import assert from 'node:assert/strict';
import { createGripperObject, resizeObjectWidth } from '../js/blocks/gripper-object.js';
import { getExample } from '../js/blocks/examples.js';
import { normalizeSnapshot } from '../js/blocks/schema.js';
import { planGripper } from '../js/blocks/gripper-workflow.js';
import { compileTopology } from '../js/core/topology.js';
import { solveTopology } from '../js/multilink/solver.js';

class Node {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; this.listeners = {}; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k]; }
  appendChild(n) { this.children.push(n); n.parent = this; }
  addEventListener(k, fn) { (this.listeners[k] ||= []).push(fn); }
  closest() { return this.attrs['data-gripper-resize'] ? this : this.parent?.closest(); }
  querySelector(selector) { const side = selector.match(/="(.+)"/)?.[1]; return this.all().find(n => n.attrs['data-gripper-resize'] === side); }
  all() { return this.children.flatMap(n => [n, ...n.all()]); }
  focus() {}
  getScreenCTM() { return { a: 0.5 }; }
  setPointerCapture(id) { this.captured = id; }
  releasePointerCapture() { this.captured = null; }
}
const doc = new Node('document');
doc.createElementNS = (_, tag) => new Node(tag);
globalThis.document = doc;
const svg = new Node('svg');
const snapshot = normalizeSnapshot(getExample('gear-gripper').snapshot);
const plan = planGripper(snapshot.comps, snapshot.params);
const topo = compileTopology(snapshot.comps, { params: { ...snapshot.params } }, new Set());
const solve = theta => solveTopology(topo, { thetaDeg: theta }).points;
let reference = { width: 50, clearance: 10, center: plan.closed.center };
let editing = false, commits = [], previews = [], cancels = 0;
const view = createGripperObject({ svg, project: p => ({ x: p.x, y: -p.y }),
  worldFromEvent: e => ({ x: e.x, y: 0 }), getReference: () => reference,
  getComps: () => snapshot.comps, isEditing: () => editing,
  previewWidth: w => previews.push(w), commitWidth: w => commits.push(w), cancelPreview: () => cancels++, pause() {} });
const update = view.draw(solve(plan.open.theta));
const rect = svg.all().find(n => n.tag === 'rect');
const fixedRect = { ...rect.attrs };
update(solve(plan.closed.theta));
assert.deepEqual(rect.attrs, fixedRect, 'animation must not move the reference object');
assert.ok(svg.all().some(n => n.textContent === '目前爪尖淨距 50.0 mm'));
const right = svg.all().find(n => n.attrs['data-gripper-resize'] === 'right');
assert.equal(right.attrs.role, 'slider');
assert.equal(right.children[0].attrs.r, '40', '20 screen-pixel target radius at 0.5 SVG scale');
let stopped = 0;
const event = extra => ({ target: right, pointerId: 1, button: 0, preventDefault() {}, stopImmediatePropagation() { stopped++; }, ...extra });
const fire = (target, name, e) => target.listeners[name].forEach(fn => fn(e));
fire(svg, 'pointerdown', event());
fire(svg, 'pointermove', event({ x: reference.center.x + 35 }));
fire(svg, 'pointermove', event({ x: reference.center.x + 40 }));
assert.deepEqual(previews, [70, 80]); assert.deepEqual(commits, []);
fire(svg, 'pointerup', event());
assert.deepEqual(commits, [80]); assert.ok(stopped >= 4);
fire(svg, 'pointerdown', event()); fire(svg, 'pointercancel', event());
assert.equal(cancels, 1); assert.deepEqual(commits, [80]);
fire(svg, 'pointerdown', event()); fire(doc, 'keydown', event({ key: 'Escape' }));
assert.equal(cancels, 2);
fire(doc, 'keydown', event({ key: 'ArrowRight' }));
assert.deepEqual(commits, [80, 51]);
assert.equal(resizeObjectWidth(10000, 0), 150); assert.equal(resizeObjectWidth(0, 0), 10);
editing = true; assert.equal(view.draw(solve(0)), null);
editing = false; reference = null; assert.equal(view.draw(solve(0)), null);
console.log('PASS gripper-object: fixed reference, live gap, drag commit/cancel, keyboard, touch target, hidden outside task');
