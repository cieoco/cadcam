import { check, report } from './_harness.mjs';
import { getExample } from '../js/blocks/examples.js';
import { updatePointCoordsById } from '../js/blocks/model.js';
import { normalizeSnapshot } from '../js/blocks/schema.js';
import { S } from '../js/blocks/state.js';
import { createMemberEditor } from '../js/blocks/member-editor.js';

class FakeElement {
  constructor() {
    this.children = [];
    this.style = {};
    this.parentElement = { style: {} };
    this.value = '';
    this.textContent = '';
    this.checked = false;
    this.disabled = false;
    this.attributes = {};
    this.title = '';
  }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
}

const elements = new Map();
globalThis.document = {
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, new FakeElement());
    return elements.get(id);
  },
  createElement() { return new FakeElement(); }
};
const el = id => document.getElementById(id);
const fixture = () => normalizeSnapshot(getExample('gear-gripper').snapshot);

let counts;
let notices;
const editor = createMemberEditor({
  pause: () => { counts.pause++; },
  pushUndo: () => { counts.undo++; },
  rebuild: () => { counts.rebuild++; },
  draw: () => { counts.draw++; },
  reshapeTriangle: () => { counts.reshape++; },
  updatePointCoordsById: (id, x, y) => updatePointCoordsById(S.comps, id, x, y),
  notify: message => { notices.push(message); }
});

function reset(comps, params = {}) {
  S.comps = comps;
  S.topo = { params: { theta: 0, ...params } };
  S.selectedLinkId = null;
  S.selectedTriangleId = null;
  S.selectedSliderId = null;
  S.selectedGearId = null;
  S.triSide = 'g';
  counts = { pause: 0, undo: 0, rebuild: 0, draw: 0, reshape: 0 };
  notices = [];
}

const simpleBar = () => ({
  type: 'bar', id: 'Bar1', p1: { id: 'A', type: 'fixed', x: 0, y: 0 },
  p2: { id: 'B', type: 'floating', x: 18, y: 0 }, lenParam: 'L'
});
const barParams = { L: 18 };

check('valid bar change applies 18 + 8 = 26 with one undo and model point update', (() => {
  const bar = simpleBar();
  reset([bar], barParams);
  S.selectedLinkId = 'Bar1';
  editor.change(8);
  return S.topo.params.L === 26 && bar.p2.x === 26 && bar.p2.y === 0
    && counts.undo === 1 && counts.pause === 1 && counts.rebuild === 1 && counts.draw === 1;
})());

check('invalid bar edit causes no mutation and no undo', (() => {
  const bar = simpleBar();
  reset([bar], barParams);
  S.selectedLinkId = 'Bar1';
  const before = JSON.stringify({ comps: S.comps, params: S.topo.params });
  editor.setValue(7);
  return JSON.stringify({ comps: S.comps, params: S.topo.params }) === before
    && counts.undo === 0 && counts.rebuild === 0 && notices.length === 1;
})());

check('zero delta does not create undo or rebuild', (() => {
  const bar = simpleBar();
  reset([bar], barParams);
  S.selectedLinkId = 'Bar1';
  editor.change(0);
  return bar.p2.x === 18 && counts.undo === 0 && counts.rebuild === 0;
})());

check('exact decimal bar edits preserve tenths', (() => {
  const bar = simpleBar();
  reset([bar], barParams);
  S.selectedLinkId = 'Bar1';
  editor.setValue('26.34');
  return S.topo.params.L === 26.3 && bar.p2.x === 26.3 && counts.undo === 1;
})());

check('default mirrored jaw tip edit changes both properties only with one undo', (() => {
  const s = fixture();
  reset(s.comps, s.params);
  S.selectedTriangleId = 'LeftJaw';
  S.triSide = 'tip';
  const pointsBefore = JSON.stringify(S.comps.map(c => [c.p1, c.p2, c.p3]));
  const paramsBefore = JSON.stringify(S.topo.params);
  editor.setValue(55.5);
  const left = S.comps.find(c => c.id === 'LeftJaw');
  const right = S.comps.find(c => c.id === 'RightJaw');
  return left.jawTipLength === 55.5 && right.jawTipLength === 55.5
    && JSON.stringify(S.comps.map(c => [c.p1, c.p2, c.p3])) === pointsBefore
    && JSON.stringify(S.topo.params) === paramsBefore && counts.undo === 1
    && counts.rebuild === 1 && counts.reshape === 0;
})());

check('disabling mirror edits only the selected jaw', (() => {
  const s = fixture();
  reset(s.comps, s.params);
  S.selectedTriangleId = 'LeftJaw';
  S.triSide = 'tip';
  editor.setMirror(false);
  editor.setValue(44.4);
  return S.comps.find(c => c.id === 'LeftJaw').jawTipLength === 44.4
    && S.comps.find(c => c.id === 'RightJaw').jawTipLength === undefined
    && counts.undo === 1;
})());

check('gear-driven jaw dimension is rejected and disabled in the editor', (() => {
  const s = fixture();
  reset(s.comps, s.params);
  S.selectedTriangleId = 'LeftJaw';
  S.triSide = 'g';
  editor.sync();
  const inputDisabled = el('memberDimensionInput').disabled;
  const buttonsDisabled = el('lenMinusBtn').disabled && el('lenPlusBtn').disabled;
  const before = JSON.stringify({ comps: S.comps, params: S.topo.params });
  editor.setValue(26);
  return inputDisabled && buttonsDisabled
    && JSON.stringify({ comps: S.comps, params: S.topo.params }) === before
    && counts.undo === 0 && notices.at(-1)?.includes('齒輪');
})());

check('switching from locked jaw to slider hides input and re-enables step buttons', (() => {
  const s = fixture();
  const slider = { type: 'slider', id: 'Slider1', p1: { id: 'SL', x: 0, y: 0 }, lenParam: 'SL1' };
  reset([...s.comps, slider], s.params);
  S.selectedTriangleId = 'LeftJaw';
  S.triSide = 'g';
  editor.sync();
  S.selectedTriangleId = null;
  S.selectedLinkId = 'Slider1';
  editor.sync();
  return el('memberDimensionInput').style.display === 'none'
    && el('lenValue').style.display === ''
    && el('lenMinusBtn').disabled === false && el('lenPlusBtn').disabled === false;
})());

check('leaving tip dimension for another component resets selection to g', (() => {
  const bar = simpleBar();
  const s = fixture();
  reset([...s.comps, bar], { ...s.params, L: 18 });
  S.selectedTriangleId = 'LeftJaw';
  editor.selectDimension('tip');
  S.selectedTriangleId = null;
  S.selectedLinkId = 'Bar1';
  editor.sync();
  return S.triSide === 'g' && el('triSideSelect').value === 'g';
})());

check('stock width, thickness and material mirror without moving pins, one undo per change', (() => {
  const s = fixture(); reset(s.comps, s.params); S.selectedTriangleId = 'LeftJaw'; editor.setMirror(true);
  const geometry = JSON.stringify(S.comps.map(c => [c.p1, c.p2, c.p3]));
  const params = JSON.stringify(S.topo.params);
  editor.selectDimension('width'); editor.setValue(24);
  editor.selectDimension('thickness'); editor.setValue(6);
  editor.setMaterial('plywood');
  return S.comps.filter(c => c.type === 'triangle').every(c => c.stock.widthMm === 24 && c.stock.thicknessMm === 6 && c.stock.material === 'plywood')
    && JSON.stringify(S.comps.map(c => [c.p1, c.p2, c.p3])) === geometry && JSON.stringify(S.topo.params) === params
    && counts.undo === 3 && counts.reshape === 0;
})());
check('stock width rejects insufficient hole margin without mutation or undo', (() => {
  reset([simpleBar()], barParams); S.selectedLinkId = 'Bar1';
  editor.selectDimension('width'); editor.setValue(12);
  return !S.comps[0].stock && counts.undo === 0 && notices.at(-1).includes('連接孔');
})());
check('stock dimensions stay selected on bar sync and increments use their own steps', (() => {
  reset([simpleBar()], barParams); S.selectedLinkId = 'Bar1';
  editor.selectDimension('width'); editor.change(8); editor.sync();
  const widthSelected = el('triSideSelect').value === 'width' && S.comps[0].stock.widthMm === 19;
  editor.selectDimension('thickness'); editor.change(-8); editor.sync();
  return widthSelected && S.comps[0].stock.thicknessMm === 3.5 && S.topo.params.L === 18;
})());
report('member-editor');
