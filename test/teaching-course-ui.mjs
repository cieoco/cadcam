import assert from 'node:assert/strict';
import { createTeachingUI } from '../js/blocks/teaching-ui.js';
import { createCourseStart } from '../js/blocks/fourbar-course.js';

class Element {
  constructor(tag = 'div') { this.tag = tag; this.children = []; this.dataset = {}; this.hidden = true; this.checked = false; }
  append(...children) { this.children.push(...children); }
  replaceChildren() { this.children = []; }
  setAttribute(key, value) { this[key] = value; }
  get lastChild() { return this.children.at(-1); }
}
const elements = new Map();
globalThis.document = { body: new Element(), getElementById(id) { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); }, createElement: tag => new Element(tag) };
globalThis.window = { dispatchEvent() {}, blocks: { setMobilePanel() {}, fitView() {} } };
let snapshot = createCourseStart('observe'); snapshot.params.LL3 = 112;
const original = structuredClone(snapshot);
let ui, drawn = false, lastState;
ui = createTeachingUI({
  getSnapshot: () => structuredClone(snapshot), applyLessonSnapshot(value) { ui?.snapshotApplied('lesson'); snapshot = structuredClone(value); ui?.lessonChanged(null); },
  onCourseState: state => { lastState = state; }, loadExample() {}, undo() {}, saveFile() {}, openFile() {}, selectMember() {}, measureSwing() {}, togglePlay() {}, fitView() {}, startLink() { drawn = true; }
});
const all = node => [node, ...node.children.flatMap(all)];
const click = text => { const button = all(document.getElementById('teachingBody')).find(e => e.tag === 'button' && e.textContent === text); assert.ok(button, text); button.onclick(); };
document.getElementById('lessonStart').onclick();
assert.equal(ui.courseActive, true);
assert.equal(snapshot.params.LL3, 80);
click('② 接好半成品');
assert.equal(snapshot.comps.length, 4);
assert.equal(ui.assemblyExpected, true);
assert.equal(lastState.hints, true);
click('開始連接'); assert.equal(drawn, true);
snapshot.comps.push(createCourseStart('observe').comps.find(c => c.id === 'Link2'));
snapshot.comps.at(-1).id = 'Student42';
assert.equal(ui.assemblyExpected, false);
click('檢查連接'); assert.equal(lastState.complete, true);
click('③ 自己完成考驗');
assert.equal(snapshot.comps.length, 4);
assert.equal(ui.rolesEnabled, false);
click('② 接好半成品');
assert.equal(snapshot.comps.at(-1).id, 'Student42', 'Stage switch restores student draft');
document.getElementById('lessonReset').onclick(); assert.equal(snapshot.comps.length, 4);
click('找回重設前作品'); assert.equal(snapshot.comps.at(-1).id, 'Student42');
ui.snapshotApplied('undo'); ui.lessonChanged(null); assert.equal(ui.stage, 'build'); assert.equal(ui.courseActive, true);
click('回到我的作品'); assert.deepEqual(snapshot, original); assert.equal(ui.courseActive, false);
document.getElementById('lessonStart').onclick();
ui.snapshotApplied('file'); assert.equal(ui.courseActive, false, 'External file exits before applying new work');
console.log('teaching-course-ui: stage switching, reset recovery, outside work, undo and external load passed');
