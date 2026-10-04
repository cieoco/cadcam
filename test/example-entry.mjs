import assert from 'node:assert/strict';
import { requestedExample, offerExampleFromUrl } from '../js/blocks/example-entry.js';

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.events = {}; }
  setAttribute() {}
  append(...children) { this.children.push(...children); }
  addEventListener(name, fn) { this.events[name] = fn; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  remove() { this.removed = true; }
  focus() { this.focused = true; }
}
function setup(query) {
  let loaded = [], notices = [], cleaned = '';
  const document = { body: new Element('body'), createElement: tag => new Element(tag) };
  offerExampleFromUrl({ document, location: { href: 'https://example.org/cadcam/blocks.html' + query },
    history: { state: { keep: 1 }, replaceState(state, _, url) { assert.equal(state.keep, 1); cleaned = url; } },
    loadExample: id => loaded.push(id), notify: text => notices.push(text) });
  return { document, loaded, notices, clean: () => cleaned, dialog: document.body.children[0] };
}
for (const id of ['fourbar-crank-rocker', 'fourbar-missing-coupler']) {
  const s = setup('?example=' + id + '&keep=yes');
  assert.deepEqual(s.loaded, [], 'Opening a teaching link must not replace existing work');
  s.dialog.children.find(e => e.textContent === '載入此範例').onclick();
  assert.deepEqual(s.loaded, [id]);
  assert.equal(s.dialog.removed, true);
  assert.ok(s.clean().endsWith('?keep=yes'));
}
const cancelled = setup('?example=fourbar-missing-coupler');
cancelled.dialog.children.find(e => e.textContent === '保留目前作品').onclick();
assert.deepEqual(cancelled.loaded, []);
assert.equal(cancelled.dialog.removed, true);
const escape = setup('?example=fourbar-crank-rocker');
escape.dialog.events.cancel({ preventDefault() {} });
assert.deepEqual(escape.loaded, []);
assert.equal(escape.dialog.removed, true);
assert.equal(setup('').dialog, undefined);
assert.equal(setup('?example=not-a-real-example').notices.length, 1);
assert.equal(setup('?example=fourbar-crank-rocker#shared-work').dialog, undefined);
assert.equal(requestedExample('https://example.org/?example=invalid'), null);
console.log('example-entry: confirmed loading, cancellation, Escape, invalid IDs, URL cleanup and share priority passed');
