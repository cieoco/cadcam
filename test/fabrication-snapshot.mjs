import assert from 'node:assert/strict';
import { getExample } from '../js/blocks/examples.js';
import { normalizeSnapshot, toSnapshot } from '../js/blocks/schema.js';
import { encodeSnapshot, decodeShareString } from '../js/share-codec.js';
import { FABRICATION_DEFAULTS } from '../js/blocks/fabrication-profile.js';
import { gripperBuildRecord, planGripper } from '../js/blocks/gripper-workflow.js';

const base = normalizeSnapshot(getExample('gear-gripper').snapshot);
assert.equal(base.fabrication, null, 'legacy example remains distinguishable from a project profile');

const profile = structuredClone(FABRICATION_DEFAULTS);
profile.export.holeDiameterMm = 5;
profile.export.frameHoleDiameterMm = 6.5;
profile.ttMount.shaftDiameterMm = 7.2;
profile.mg995Mount.bodyWidthMm = 22.4;

const saved = toSnapshot(base.comps, { params: base.params }, base.counter, {
  activeMotor: base.activeMotor,
  motorAngles: base.motorAngles,
  fabrication: profile,
});
assert.deepEqual(saved.fabrication, profile, 'manual save/autosave/undo collector includes the complete profile');

const restored = normalizeSnapshot(decodeShareString(encodeSnapshot(saved)));
assert.deepEqual(restored.fabrication, profile, 'share round-trip keeps all three fabrication groups');
assert.equal(restored.fabrication.export.holeDiameterMm, 5, 'receiver preference cannot replace project hole diameter');

const partial = structuredClone(saved);
partial.fabrication = { v: 1, export: { holeDiameterMm: 8 } };
const completed = normalizeSnapshot(partial);
assert.equal(completed.fabrication.export.holeDiameterMm, 8);
assert.equal(completed.fabrication.export.barWidthMm, FABRICATION_DEFAULTS.export.barWidthMm);
assert.deepEqual(completed.fabrication.ttMount, FABRICATION_DEFAULTS.ttMount);
assert.ok(completed.warnings.some(message => message.includes('fabrication.export.barWidthMm')));

const unsupported = structuredClone(saved);
unsupported.fabrication.v = 99;
assert.equal(normalizeSnapshot(unsupported), null, 'unsupported profile rejects the whole incoming work');
const invalid = structuredClone(saved);
invalid.fabrication.export.holeDiameterMm = '';
assert.equal(normalizeSnapshot(invalid), null, 'invalid known value rejects the whole incoming work');

const record = gripperBuildRecord(planGripper(base.comps, base.params), saved);
const embedded = JSON.parse(record.match(/```json\n([\s\S]+?)\n```/)[1]);
assert.deepEqual(embedded.fabrication, profile, 'fabrication profile reaches the embedded build-record snapshot');

console.log('fabrication snapshot: save/share/migration/rejection/build-record passed');
