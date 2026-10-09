// The actual parent receiver preserves saved endpoints across changed presets.
import assert from 'node:assert/strict';
import { openFaceWizard } from '../js/blocks/face-wizard-ui.js';
import { LOAD_GRAPH_TOKEN } from '../js/module-url.js';

let receiver, iframe, committed;
const messages = [], notices = [];
class Element {
  constructor(tag) {
    this.style = {}; this.listeners = {}; this.children = [];
    if (tag === 'iframe') { iframe = this; this.contentWindow = { postMessage: data => messages.push(data) }; }
  }
  setAttribute() {} append(...children) { this.children.push(...children); } remove() {}
  addEventListener(type, handler) { this.listeners[type] = handler; } showModal() {}
  close() { this.listeners.close?.(); }
}
globalThis.document = { createElement: tag => new Element(tag), body: new Element('body') };
globalThis.window = { addEventListener: (type, handler) => { if (type === 'message') receiver = handler; }, removeEventListener() {} };
globalThis.location = { origin: 'https://example.test' };
globalThis.matchMedia = () => ({ matches: false });
const fixed = (id, x) => ({ id, type: 'fixed', x, y: 0 });
const comps = ['H', 'C'].map((id, i) => ({ id, type: 'bar', moduleId: i ? 'Child' : 'Host', p1: fixed(`${id}a`, 0), p2: fixed(`${id}b`, i ? 40 : 80), stock: { widthMm: 18, thicknessMm: 4, material: 'plywood' }, lenParam: `${id}L`, snapLength: false }));
comps.push({ id: 'Extra', type: 'anchor', moduleId: 'Child', p1: fixed('extra', 100) });
const modules = [{ id: 'Host', name: '宿主', base: 'Ha', outputs: [{ id: 'out', at: 'Ha', body: { kind: 'bar', id: 'H' } }], mount: null, faceParts: { part: 'frame', face: 'left' } },
  { id: 'Child', name: '子模組', base: 'Ca', outputs: [], mount: null, faceParts: { part: 'frame', face: 'left' } }];
const initialMount = { to: { module: 'Host', output: 'out' }, face: { version: 1, childPart: 'C', rotation: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], translation: { x: 45, y: 0, z: 4 }, hostThicknessMm: 4, childThicknessMm: 4,
  selection: { hostFace: 'top', childFace: 'bottom', alignU: 1, alignV: 0, offsetU: 5, offsetV: 0, gap: 0, quarterTurns: 0 } } };
const args = { comps, modules, params: { HL: 80, CL: 40 }, childId: 'Child', exportSettings: { stockThicknessMm: 4 }, stockMm: 4, initialMount, startAtPlacement: true,
  isCurrent: () => true, commit: draft => { committed = draft; }, say: text => notices.push(text) };
const before = JSON.stringify(args);
const send = data => receiver({ origin: location.origin, source: iframe.contentWindow, data });
const confirmSelection=async selection=>{await send({type:'face-wizard-preview',loadGraph:LOAD_GRAPH_TOKEN,requestId:1,selection});const candidate=messages.at(-1).candidate;assert.ok(candidate?.saveable,JSON.stringify(candidate));await send({type:'face-wizard-confirm',loadGraph:LOAD_GRAPH_TOKEN,candidateId:candidate.candidateId,selectionRevision:candidate.selectionRevision});};
openFaceWizard(args);
send({ type: 'face-wizard-ready', loadGraph: LOAD_GRAPH_TOKEN });
let init = messages.at(-1);
assert.equal(init.type, 'face-wizard-init', notices.join('\n'));
assert.equal(init.hosts[init.host].surface.compId, 'H', '原宿主不因預選 frame 被濾掉');
assert.equal(init.hosts[init.host].defaultFace, 'top');
assert.equal(init.children[0].surface.compId, 'C'); assert.equal(init.selection.childFace, 'bottom');
assert.equal(init.configured, true); assert.equal(init.startAtPlacement, true);
await confirmSelection({ ...init.selection, host: init.host, child: 0 });
assert.equal(committed.modules[1].mount.face.childPart, 'C');
assert.equal(committed.modules[1].mount.face.selection.brackets, undefined);
assert.equal(committed.modules[1].mount.face.translation.x, 45);
assert.equal(JSON.stringify(args), before);

committed = undefined;
const legacy = structuredClone(initialMount); delete legacy.face.childPart;
openFaceWizard({ ...args, initialMount: legacy });
send({ type: 'face-wizard-ready', loadGraph: LOAD_GRAPH_TOKEN }); init = messages.at(-1);
assert.equal(init.startAtPlacement, false); assert.equal(init.configured, false);
assert.ok(init.children.some(c => c.surface.kind === 'frame'));
const selected = init.children.findIndex(c => c.surface.compId === 'C'); assert.ok(selected >= 0);
await confirmSelection({ ...init.selection, host: init.host, child: selected });
assert.equal(committed.modules[1].mount.face.childPart, 'C', '舊紀錄必須經可見選擇後明確保存');
assert.equal(legacy.face.childPart, undefined);

committed = undefined;
openFaceWizard(args); send({ type: 'face-wizard-cancel' });
assert.equal(committed, undefined); assert.equal(JSON.stringify(args), before);
const bad = structuredClone(initialMount); bad.face.childPart = 'deleted';
openFaceWizard({ ...args, initialMount: bad });
send({ type: 'face-wizard-ready', loadGraph: LOAD_GRAPH_TOKEN }); init = messages.at(-1);
assert.equal(init.startAtPlacement, false); assert.equal(init.configured, false);
assert.ok(notices.at(-1).includes('不存在'));
assert.equal(committed, undefined);
await confirmSelection({ ...init.selection, host: init.host, child: init.children.findIndex(c => c.surface.compId === 'C') });
assert.equal(committed.modules[1].mount.face.childPart, 'C'); assert.equal(bad.face.childPart, 'deleted');
committed = undefined;
const badHost = structuredClone(initialMount); badHost.to.output = 'deleted';
openFaceWizard({ ...args, initialMount: badHost });
send({ type: 'face-wizard-ready', loadGraph: LOAD_GRAPH_TOKEN }); init = messages.at(-1);
assert.equal(init.host, -1); assert.equal(init.configured, false); assert.equal(init.startAtPlacement, false);
assert.equal(init.children[0].surface.compId, 'C');
const repairedHost=init.hosts.findIndex(h=>h.surface.compId==='H');assert.ok(repairedHost>=0);
assert.equal(init.hosts.filter(h=>h.surface.kind==='frame').length,1,'the new frame entry does not hide the old output repair choice');
assert.equal(committed, undefined);
await confirmSelection({ ...init.selection, host: repairedHost, child: 0 });
assert.equal(committed.modules[1].mount.to.output, 'out'); assert.equal(badHost.to.output, 'deleted');
assert.equal(JSON.stringify(args), before);
console.log('connection-reselect: saved host/child, explicit no-fastener confirm, legacy choice, cancellation and missing endpoint passed');
