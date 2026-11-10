// Pack C3 of docs/SDD-CONNECTION-INTEGRITY.md: load-time hints for I1, I3 and I5 (js/blocks/integrity-hints.js).
// Drives the hint component through a fake DOM and the shared state S, the same way app.js does after a work is applied.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeSnapshot, alignSavedInputPhase} from '../js/blocks/schema.js';
import {readStoredProject} from '../js/blocks/project-envelope.js';
import {BLOCK_EXAMPLES, loadUnitStarts} from '../js/blocks/examples.js';
import {S} from '../js/blocks/state.js';
import {FABRICATION_DEFAULTS} from '../js/blocks/fabrication-profile.js';

class FakeElement {
  constructor(tag = 'div') { this.tag = tag; this.children = []; this.style = {}; this.dataset = {}; this.attributes = {}; this._text = ''; this.id = ''; }
  get textContent() { return this._text + this.children.map(c => typeof c === 'string' ? c : c.textContent).join(''); }
  set textContent(v) { this._text = v; this.children = []; }
  replaceChildren(...c) { this._text = ''; this.children = c; }
  append(...c) { this.children.push(...c); }
  after() {}
  setAttribute(k, v) { this.attributes[k] = v; }
  buttons() { return this.children.flatMap(c => typeof c === 'string' ? [] : c.tag === 'button' ? [c] : c.buttons()); }
}
const nodes = new Map();
globalThis.document = {head: new FakeElement('head'), getElementById: id => nodes.get(id) || null,
  createElement: tag => { const e = new FakeElement(tag); return new Proxy(e, {set(t, k, v) { t[k] = v; if (k === 'id') nodes.set(v, t); return true; }}); }};
nodes.set('solveBanner', Object.assign(new FakeElement(), {after: n => nodes.set('integrityHint', n)}));
const Hints = await import('../js/blocks/integrity-hints.js');
const Repairs = await import('../js/blocks/integrity-repairs.js');
await loadUnitStarts();

const read = rel => JSON.parse(readFileSync(new URL(`./fixtures/${rel}`, import.meta.url), 'utf8'));
const load = rel => { const raw = read(rel); delete raw._note; delete raw._base; if (raw.fabrication == null) raw.fabrication = structuredClone(FABRICATION_DEFAULTS); const n = normalizeSnapshot(readStoredProject(structuredClone(raw))); if (!n) throw new Error(`normalizeSnapshot rejected ${rel}`); return alignSavedInputPhase(n); };
// Same field mapping as app.js applySnapshot.
function openWork(norm) {
  Object.assign(S, {comps: norm.comps, modules: Array.isArray(norm.modules) ? norm.modules : [], fabrication: norm.fabrication, counter: norm.counter || 0, mode: 'design',
    activeMotor: String(norm.activeMotor || '1'), motorAngles: {...(norm.motorAngles || {})}, undoStack: [],
    topo: {params: norm.params || {}, tracePoint: norm.tracePoint || '', tracePoints: norm.tracePoints || [], referencePoint: norm.referencePoint || '', dimensions: norm.dimensions || [], loads: norm.loads, gravity: norm.gravity}});
}
const snapshot = () => JSON.stringify([S.comps, S.modules, S.topo]);
let undo, notes, saved;
const api = () => ({S, pause() {}, pushUndo() { undo.push(snapshot()); }, rebuild() {}, draw() {}, notify: m => notes.push(m), save() { saved++; }});
function open(rel) { openWork(typeof rel === 'string' ? load(rel) : rel); undo = []; notes = []; saved = 0; return Hints.run('check', api()); }
const el = () => nodes.get('integrityHint');
const shownText = () => el().style.display === 'block' ? el().textContent : '';
const labels = () => el().buttons().map(b => b.textContent);
const click = text => { const b = el().buttons().find(b => b.textContent === text); assert.ok(b, `button ${text} in [${labels()}]`); return b.onclick(); };
const enabledIssues = () => Repairs.findings(Repairs.workOf(S));
const NAMES_ONLY = /[A-Za-z]+\d+_H\d|Ghost|Deleted|\bBlank\d+\b/;

// ---------------------------------------------------------------- 1. motor off plate: same texts and repairs as the old banner
for (const action of ['把馬達放回座板原孔', '讓馬達離開座板（改成獨立固定點）']) {
  assert.equal(open('motor-off-plate.json'), 1);
  assert.equal(el().style.display, 'block');
  assert.match(shownText(), /馬達軸心不在「矩形板材」的原孔（長向第4、直向第5孔）上，畫面與製作會對不起來。請選「把馬達放回座板原孔」或「讓馬達離開座板（改成獨立固定點）」，也可以刪除馬達。/);
  assert.deepEqual(labels(), ['把馬達放回座板原孔', '讓馬達離開座板（改成獨立固定點）', '說明', '先不處理']);
  assert.equal(el().buttons()[0].className, 'tool-btn primary'); assert.equal(el().buttons()[1].className, 'tool-btn');
  assert.equal(el().attributes['aria-label'], '作品檢查提示');
  const original = snapshot();
  assert.equal(click(action), true, notes.join(' '));
  assert.equal(undo.length, 1, `${action}: one undo step`); assert.equal(undo[0], original, `${action}: undo restores the opened work`);
  assert.equal(enabledIssues().length, 0, `${action}: no enabled issue left`); assert.equal(el().style.display, 'none'); assert.ok(saved >= 1);
}

// ---------------------------------------------------------------- 2. generic I1 (a point copy not at its hole / not at the shared point)
{
  assert.equal(open('integrity/i1-shared-end-5mm.json'), 1);
  assert.match(shownText(), /橘色.*藍色.*相差 5 mm/); assert.ok(el().children[0].children[0].textContent.includes('端點'), 'one-line summary first'); assert.ok(!NAMES_ONLY.test(shownText()), shownText());
  const [back, leave] = labels();
  assert.match(back, /^把端點接回「.+」$/, 'shared bar end, not a hole'); assert.match(leave, /^讓它離開「.+」（改用自己的接點）$/);
  for (const which of [back, leave]) {
    open('integrity/i1-shared-end-5mm.json');
    const original = snapshot(); assert.equal(click(which), true, notes.join(' '));
    assert.equal(undo.length, 1); assert.equal(undo[0], original); assert.equal(enabledIssues().length, 0, which); assert.equal(el().style.display, 'none');
  }
  // 放回：端點回到共用點的位置，只掛在它上面的 Bar2 剛性跟著移動（長度不變）；離開：端點保持原位並改用新接點。
  const bars = () => [S.comps.find(c => c.id === 'Bar1'), S.comps.find(c => c.id === 'Bar2')];
  open('integrity/i1-shared-end-5mm.json'); click(back);
  let [b1, b2] = bars();
  assert.deepEqual([b1.p2.id, b2.p1.id, b1.p2.x, b2.p1.x], ['J', 'J', 100, 100]); assert.equal(b2.p2.x, 195, 'Bar2 moved rigidly'); assert.equal(b2.p2.x - b2.p1.x, 95, 'Bar2 keeps its length');
  open('integrity/i1-shared-end-5mm.json'); click(leave);
  [b1, b2] = bars();
  assert.equal(b1.p2.id, 'J'); assert.equal(b1.p2.x, 100); assert.notEqual(b2.p1.id, 'J'); assert.equal(b2.p1.x, 105, 'pose is kept'); assert.equal(b2.p2.x, 200);
}

// ---------------------------------------------------------------- 3. I3 / I5 dangling references: one repair that clears the link, never deletes parts
for (const [file, pattern] of [['i3-frame-body-missing', /馬達承載零件已經不存在/], ['i5-carrier-deleted', /馬達承載零件已經不存在/],
  ['i5-syringe-missing-comp', /端接在已經不存在的零件上/], ['i5-trace-point-missing', /指向已經不存在的點/]]) {
  assert.ok(open(`integrity/${file}.json`) >= 1, `${file}: hint shown`);
  assert.match(shownText(), pattern, file); assert.ok(!NAMES_ONLY.test(shownText()), `${file}: ${shownText()}`);
  assert.deepEqual(labels().filter(l => l !== '清除失效的連結' && l !== '說明' && l !== '先不處理'), [], file);
  const count = S.comps.length, original = snapshot();
  assert.equal(click('清除失效的連結'), true, `${file}: ${notes.join(' ')}`);
  assert.equal(S.comps.length, count, `${file}: no part is deleted`); assert.equal(undo.length, 1); assert.equal(undo[0], original);
  assert.equal(enabledIssues().length, 0, `${file}: clean after repair`); assert.equal(el().style.display, 'none');
}
// 矛盾但沒有安全自動修法的 I3：只說明，不給修復按鈕。
for (const file of ['i3-carrier-frame-differ', 'i3-duplicate-part-id']) {
  assert.ok(open(`integrity/${file}.json`) >= 1, file); assert.deepEqual(labels(), ['說明', '先不處理'], `${file}: explanation only`);
}

// ---------------------------------------------------------------- 4. no hint for the built-in examples, the user's consistent file and non-enabled rules
{
  let n = 0;
  for (const ex of BLOCK_EXAMPLES) {
    const norm = alignSavedInputPhase(normalizeSnapshot(structuredClone(ex.snapshot)));
    if (!norm) continue;
    assert.equal(open(norm), 0, `example ${ex.id} shows no hint: ${shownText()}`); assert.equal(el().style.display, 'none'); n++;
  }
  assert.ok(n > 60, `scanned ${n} examples`);
  assert.equal(open('connected-resize.json'), 0, 'connected-resize shows no hint');
  assert.equal(open('integrity/i4-phase-mismatch.json'), 0, 'I4 is still shadow');
  assert.equal(open('integrity/i2-conflicting-motors.json'), 0, 'I2 is still shadow');
}

// ---------------------------------------------------------------- 5. stale hint: the work changed after the hint appeared
{
  open('integrity/i5-trace-point-missing.json');
  S.comps = S.comps.map((c, i) => i ? c : {...c, name: `${c.name || c.id} 改`});   // 學生在提示出現後改了作品
  const before = snapshot();
  assert.equal(click('清除失效的連結'), false); assert.equal(undo.length, 0, 'no undo step is pushed'); assert.equal(snapshot(), before, 'work untouched');
  assert.match(notes.join(' '), /作品在提示出現後已經改變/); assert.equal(el().style.display, 'block', 'hint is re-checked, not lost');
  assert.equal(click('清除失效的連結'), true, 'the refreshed hint can be confirmed'); assert.equal(undo.length, 1);
}

// ---------------------------------------------------------------- 6. dismiss and re-show for a new work
{
  open('motor-off-plate.json'); click('先不處理'); assert.equal(el().style.display, 'none');
  Hints.run('check', api()); assert.equal(el().style.display, 'none', 'same work stays dismissed');
  open('integrity/i5-trace-point-missing.json'); assert.equal(el().style.display, 'block', 'another work shows again');
  S.mode = 'bench'; assert.equal(click('清除失效的連結'), false); assert.match(notes.join(' '), /設計模式/); assert.equal(undo.length, 0);
}
// ---------------------------------------------------------------- 7. canvas marks and the status pill's loose-part highlight
{
  const {paintMarks} = Hints, {looseEnds} = await import('../js/blocks/status-text.js');
  const made = [];
  globalThis.document.createElementNS = (ns, tag) => { const e = new FakeElement(tag); e.attrs = {}; e.setAttribute = (k, v) => { e.attrs[k] = v; }; e.remove = () => {}; made.push(e); return e; };
  const layerHost = new FakeElement('svg'); layerHost.querySelector = () => null;
  open('integrity/i1-shared-end-5mm.json');
  const n = paintMarks({...api(), svg: layerHost, project: p => p, points: () => ({})}, [{ids: ['Bar2'], color: '#f97316'}, {ids: ['Bar1'], color: '#2563eb'}]);
  assert.equal(n, 2); assert.deepEqual(made.filter(e => e.dataset.hintPart).map(e => [e.dataset.hintPart, e.attrs.stroke]), [['Bar2', '#f97316'], ['Bar1', '#2563eb']]);
  assert.deepEqual(looseEnds([{id: 'A', name: '桿', p1: {id: 'X'}, p2: {id: 'Y'}}, {id: 'B', p1: {id: 'Y'}, p2: {id: 'Z'}}], {sourceIds: ['X']}).map(c => c.id), ['A']);
}
console.log('integrity hints: I1/I3/I5 hints, repairs with one undo step, stale refusal and no hint on examples passed');
