import { check, report } from './_harness.mjs';
import { getExample } from '../js/blocks/examples.js';
import { normalizeSnapshot, toSnapshot } from '../js/blocks/schema.js';
import { S } from '../js/blocks/state.js';
import { createMemberEditor } from '../js/blocks/member-editor.js';
import { createJawTipHandle } from '../js/blocks/jaw-tip-handle.js';
import { jawCenterline } from '../js/blocks/plate-geometry.js';

class FakeElement {
  constructor(tag = 'g') {
    this.tag = tag;
    this.children = [];
    this.parentElement = null;
    this.style = {};
    this.attributes = {};
    this.listeners = new Map();
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.textContent = '';
  }
  appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
  replaceChildren(...children) { this.children = []; children.forEach(child => this.appendChild(child)); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(name, callback, capture = false) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push({ callback, capture });
  }
  dispatch(name, event) {
    for (const { callback } of this.listeners.get(name) || []) callback(event);
  }
  closest(selector) {
    let node = this;
    while (node) {
      if (selector === '[data-jaw-tip]' && node.getAttribute?.('data-jaw-tip')) return node;
      node = node.parentElement;
    }
    return null;
  }
  getScreenCTM() { return { a: 1 }; }
  setPointerCapture(id) { this.captured = id; }
  releasePointerCapture(id) { if (this.captured === id) this.captured = null; }
  querySelector(selector) { return selector === '[data-jaw-tip]' ? this.children.find(c => c.getAttribute('data-jaw-tip')) || null : null; }
  focus() { this.focused = true; }
}

const elements = new Map();
const documentListeners = new Map();
globalThis.document = {
  getElementById(id) {
    if (!elements.has(id)) {
      const element = new FakeElement('div');
      if (id === 'memberMaterial') element.parentElement = new FakeElement('label');
      elements.set(id, element);
    }
    return elements.get(id);
  },
  createElement: tag => new FakeElement(tag),
  createElementNS: (_namespace, tag) => new FakeElement(tag),
  addEventListener(name, callback, capture = false) {
    if (!documentListeners.has(name)) documentListeners.set(name, []);
    documentListeners.get(name).push({ callback, capture });
  },
  dispatch(name, event) {
    for (const { callback } of documentListeners.get(name) || []) callback(event);
  }
};

let counts;
let notices;
let editor;
let handle;
let svg;
let group;
let fixture;

function setup({ mirror = true, tipLength = null } = {}) {
  fixture = normalizeSnapshot(getExample('gear-gripper').snapshot);
  const comps = fixture.comps;
  if (tipLength !== null) {
    comps.filter(c => c.shape === 'jaw').forEach(c => { c.jawTipLength = tipLength; });
  }
  S.comps = comps;
  S.topo = { params: { theta: 0, ...fixture.params } };
  S.counter = fixture.counter;
  S.selectedLinkId = null;
  S.selectedTriangleId = 'LeftJaw';
  S.selectedSliderId = null;
  S.selectedGearId = null;
  S.triSide = 'tip';
  counts = { pause: 0, undo: 0, rebuild: 0, draw: 0, reshape: 0 };
  notices = [];
  editor = createMemberEditor({
    pause: () => { counts.pause++; },
    pushUndo: () => { counts.undo++; },
    rebuild: () => { counts.rebuild++; },
    draw: () => { counts.draw++; },
    reshapeTriangle: () => { counts.reshape++; },
    updatePointCoordsById: () => {},
    notify: message => { notices.push(message); }
  });
  editor.setMirror(mirror);
  svg = new FakeElement('svg');
  handle = createJawTipHandle({
    svg,
    project: p => ({ x: p.x, y: p.y }),
    worldFromEvent: e => e.world,
    editor,
    getParams: () => S.topo.params
  });
  const points = Object.fromEntries(comps.flatMap(c => ['p1', 'p2', 'p3']
    .filter(key => c[key]?.id && Number.isFinite(c[key].x) && Number.isFinite(c[key].y))
    .map(key => [c[key].id, { x: c[key].x, y: c[key].y }])));
  handle.draw(points);
  group = svg.children.find(c => c.getAttribute('data-jaw-tip'));
  return { points };
}

const snapshot = () => JSON.stringify(toSnapshot(S.comps, S.topo, S.counter));
const event = (pointerId, world = null, extra = {}) => ({
  pointerId, clientX: 10, clientY: 10, button: 0, target: group, world,
  defaultPrevented: false, stopped: false,
  preventDefault() { this.defaultPrevented = true; },
  stopImmediatePropagation() { this.stopped = true; },
  ...extra
});

function startDrag(id = 7) {
  svg.dispatch('pointerdown', event(id));
}

function moveAlong(directionLength, id = 7, perpendicularOffset = 0) {
  const jaw = S.comps.find(c => c.id === 'LeftJaw');
  const [drive, pivot, corner, end] = jawCenterline(
    [jaw.p1, jaw.p2, jaw.p3].map(p => ({ x: p.x, y: p.y })), jaw.jawTurnSign, jaw.jawTipLength
  );
  const dx = end.x - corner.x, dy = end.y - corner.y;
  const length = Math.hypot(dx, dy);
  svg.dispatch('pointermove', event(id, {
    x: corner.x + dx / length * directionLength - dy / length * perpendicularOffset,
    y: corner.y + dy / length * directionLength + dx / length * perpendicularOffset
  }, { clientX: 20, clientY: 10 }));
  return { drive, pivot, corner, end };
}

check('drag projects along the existing direction, clamps to 160, previews without snapshot mutation, then commits once to both jaws', (() => {
  setup();
  const before = snapshot();
  const paramsBefore = JSON.stringify(S.topo.params);
  startDrag();
  moveAlong(220);
  const previewUnchanged = snapshot() === before && JSON.stringify(S.topo.params) === paramsBefore;
  svg.dispatch('pointerup', event(7));
  const left = S.comps.find(c => c.id === 'LeftJaw');
  const right = S.comps.find(c => c.id === 'RightJaw');
  return previewUnchanged && left.jawTipLength === 160 && right.jawTipLength === 160
    && JSON.stringify(S.topo.params) === paramsBefore && counts.undo === 1 && counts.rebuild === 1;
})());

check('drag clamps the projected length to 8 mm', (() => {
  setup();
  startDrag(8);
  moveAlong(-30, 8, 70);
  svg.dispatch('pointerup', event(8));
  return S.comps.find(c => c.id === 'LeftJaw').jawTipLength === 8
    && S.comps.find(c => c.id === 'RightJaw').jawTipLength === 8 && counts.undo === 1;
})());

for (const cancelBy of ['pointercancel', 'Escape', 'lostpointercapture']) {
  check(`${cancelBy} cancels preview without changing snapshot or adding undo`, (() => {
    setup();
    const before = snapshot();
    startDrag(9);
    moveAlong(145, 9);
    const previewUnchanged = snapshot() === before;
    if (cancelBy === 'Escape') {
      document.dispatch('keydown', event(9, null, { key: 'Escape' }));
    } else if (cancelBy === 'lostpointercapture') {
      svg.dispatch(cancelBy, event(9));
    } else {
      svg.dispatch(cancelBy, event(9));
    }
    return previewUnchanged && snapshot() === before && counts.undo === 0;
  })());
}

check('mirror disabled commits only the selected jaw', (() => {
  setup({ mirror: false });
  const paramsBefore = JSON.stringify(S.topo.params);
  startDrag(10);
  moveAlong(120, 10);
  svg.dispatch('pointerup', event(10));
  return S.comps.find(c => c.id === 'LeftJaw').jawTipLength === 120
    && S.comps.find(c => c.id === 'RightJaw').jawTipLength === undefined
    && JSON.stringify(S.topo.params) === paramsBefore && counts.undo === 1;
})());

check('pointer click without movement preserves a fractional saved length', (() => {
  setup({ tipLength: 107.3 });
  const before = snapshot();
  startDrag(11);
  svg.dispatch('pointerup', event(11));
  return snapshot() === before && S.comps.find(c => c.id === 'LeftJaw').jawTipLength === 107.3
    && S.comps.find(c => c.id === 'RightJaw').jawTipLength === 107.3 && counts.undo === 0;
})());

report('jaw-tip-handle');
