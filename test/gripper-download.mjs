// Download helper owns the temporary anchor and object URL lifecycle.
import { downloadGripperRecord, gripperRecordLink } from '../js/blocks/gripper-download.js';
import { check, report } from './_harness.mjs';

class FakeAnchor {
  constructor() { this.style = {}; this.clicked = false; this.removed = false; this.parentNode = null; }
  click() { this.clicked = true; }
  remove() { this.removed = true; this.parentNode?.removeChild(this); }
}
const body = {
  children: [],
  appendChild(anchor) { anchor.parentNode = this; this.children.push(anchor); return anchor; },
  removeChild(anchor) { this.children = this.children.filter(child => child !== anchor); anchor.parentNode = null; }
};
const anchors = [];
const documentRef = { body, createElement: tag => { const anchor = tag === 'a' ? new FakeAnchor() : null; if (anchor) anchors.push(anchor); return anchor; } };
const urlsCreated = [], urlsRevoked = [], timers = [];
const urlApi = {
  createObjectURL: blob => { const url = `blob:test-${urlsCreated.length + 1}`; urlsCreated.push({ url, blob }); return url; },
  revokeObjectURL: url => urlsRevoked.push(url)
};
const fixedDate = new Date('2026-09-25T08:15:30.456Z');
const filename = downloadGripperRecord('# record\nwidth 80', 80, {
  documentRef, urlApi, now: () => fixedDate,
  setTimeoutFn: (fn, delay) => timers.push({ fn, delay })
});
const anchor = anchors[0];
check('filename includes width and timestamp', filename === 'gripper-build-record-80mm-20260925T081530.456Z.md');
check('temporary anchor clicks with the expected filename', anchor?.clicked && anchor.download === filename && anchor.href === urlsCreated[0]?.url);
check('download payload contains the record text', await urlsCreated[0].blob.text() === '# record\nwidth 80');
check('anchor is removed after click', anchor?.removed && body.children.length === 0);
check('URL revocation is delayed for browser handoff', timers.length === 1 && timers[0].delay >= 1000 && urlsRevoked.length === 0);
timers[0].fn();
check('delayed cleanup revokes the object URL', urlsRevoked[0] === urlsCreated[0].url);

const failingAnchor = new FakeAnchor();
failingAnchor.click = () => { throw new Error('native handoff failed'); };
const failingDoc = { body, createElement: () => failingAnchor };
let failed = false;
try {
  downloadGripperRecord('record', 50, {
    documentRef: failingDoc, urlApi, now: () => fixedDate,
    setTimeoutFn: (fn, delay) => timers.push({ fn, delay })
  });
} catch (_) { failed = true; }
check('anchor and object URL cleanup are scheduled even if click throws', failed && failingAnchor.removed && timers.length === 2);
const native = gripperRecordLink('物件 80 mm\n# 製作記錄', 80, fixedDate);
check('native link preserves UTF-8 record and a distinct filename', native.filename === filename && decodeURIComponent(native.href.split(',').slice(1).join(',')) === '物件 80 mm\n# 製作記錄');

report('gripper-download');
