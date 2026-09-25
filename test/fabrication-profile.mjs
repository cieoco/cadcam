import assert from 'node:assert/strict';
import {
  FABRICATION_DEFAULTS,
  FABRICATION_VERSION,
  normalizeFabricationProfile,
  planFabricationProfile,
} from '../js/blocks/fabrication-profile.js';

assert.equal(FABRICATION_VERSION, 1);
assert.deepEqual(FABRICATION_DEFAULTS, {
  v: 1,
  export: {
    barWidthMm: 18, holeDiameterMm: 12.96, frameMarginMm: 18, frameHoleDiameterMm: 12.96,
    ttShaftFlatDiameterMm: 5.4, ttShaftFlatThicknessMm: 3.7,
  },
  ttMount: {
    shaftDiameterMm: 6, screwDiameterMm: 3, screwOffsetXMm: -20.6, screwSpacingMm: 17.3,
    locatorDiameterMm: 4, locatorOffsetXMm: -11.18, locatorOffsetYMm: 0,
  },
  mg995Mount: {
    bodyLengthMm: 41.2, bodyWidthMm: 20.2, shaftOffsetMm: 10, screwDiameterMm: 3.2,
    screwSpanMm: 49.5, screwSpacingMm: 10, cableNotchWidthMm: 8, cableNotchDepthMm: 4,
  },
});
assert.equal(Object.isFrozen(FABRICATION_DEFAULTS), true);
assert.equal(Object.isFrozen(FABRICATION_DEFAULTS.export), true);

const missing = normalizeFabricationProfile(undefined);
assert.equal(missing.ok, true);
assert.equal(missing.status, 'missing');
assert.deepEqual(missing.profile, FABRICATION_DEFAULTS);
assert.ok(missing.warnings.length > 0);

const nonDefault = {
  v: 1,
  export: {
    barWidthMm: 35.25, holeDiameterMm: 5, frameMarginMm: 26.5, frameHoleDiameterMm: 7.25,
    ttShaftFlatDiameterMm: 8.5, ttShaftFlatThicknessMm: 4.25,
  },
  ttMount: {
    shaftDiameterMm: 7.25, screwDiameterMm: 2.75, screwOffsetXMm: -14.5, screwSpacingMm: 19.25,
    locatorDiameterMm: 3.75, locatorOffsetXMm: -9.25, locatorOffsetYMm: 1.5,
  },
  mg995Mount: {
    bodyLengthMm: 42.25, bodyWidthMm: 21.5, shaftOffsetMm: 11.25, screwDiameterMm: 3.5,
    screwSpanMm: 51.25, screwSpacingMm: 11.5, cableNotchWidthMm: 9.25, cableNotchDepthMm: 4.5,
  },
};
const original = JSON.parse(JSON.stringify(nonDefault));
const full = normalizeFabricationProfile(nonDefault);
assert.deepEqual(nonDefault, original, 'normalization must not mutate its input');
assert.equal(full.ok, true);
assert.equal(full.status, 'present');
assert.deepEqual(full.profile, nonDefault, 'complete profile round-trips all three groups');
assert.deepEqual(full.warnings, []);
assert.deepEqual(normalizeFabricationProfile(full.profile).profile, full.profile);

const partial = normalizeFabricationProfile({
  v: 1,
  export: { holeDiameterMm: 5, futureExportSetting: 2 },
  futureGroup: {},
});
assert.equal(partial.ok, true);
assert.equal(partial.status, 'present');
assert.equal(partial.profile.export.holeDiameterMm, 5);
assert.equal(partial.profile.export.barWidthMm, 18);
assert.deepEqual(partial.profile.ttMount, FABRICATION_DEFAULTS.ttMount);
assert.ok(partial.warnings.some(w => w.includes('futureGroup')));
assert.ok(partial.warnings.some(w => w.includes('futureExportSetting')));
assert.ok(partial.warnings.some(w => w.includes('fabrication.export.barWidthMm')));
assert.ok(partial.warnings.some(w => w.includes('fabrication.ttMount.shaftDiameterMm')));

const unknownVersion = normalizeFabricationProfile({ ...nonDefault, v: 2 });
assert.equal(unknownVersion.ok, false);
assert.equal(unknownVersion.status, 'invalid');
for (const invalidRoot of [null, [], 'profile', 1, true]) {
  assert.equal(normalizeFabricationProfile(invalidRoot).ok, false, `reject root ${String(invalidRoot)}`);
}
for (const badGroup of [null, [], 'export']) {
  assert.equal(normalizeFabricationProfile({ v: 1, export: badGroup }).ok, false);
}

const invalidValues = ['', null, true, false, NaN, Infinity, -Infinity, '5'];
for (const [group, key] of [
  ['export', 'barWidthMm'], ['export', 'holeDiameterMm'], ['export', 'frameMarginMm'],
  ['export', 'frameHoleDiameterMm'], ['export', 'ttShaftFlatDiameterMm'], ['export', 'ttShaftFlatThicknessMm'],
  ['ttMount', 'shaftDiameterMm'], ['ttMount', 'screwDiameterMm'], ['ttMount', 'screwOffsetXMm'],
  ['ttMount', 'screwSpacingMm'], ['ttMount', 'locatorDiameterMm'], ['ttMount', 'locatorOffsetXMm'],
  ['ttMount', 'locatorOffsetYMm'],
  ['mg995Mount', 'bodyLengthMm'], ['mg995Mount', 'bodyWidthMm'], ['mg995Mount', 'shaftOffsetMm'],
  ['mg995Mount', 'screwDiameterMm'], ['mg995Mount', 'screwSpanMm'], ['mg995Mount', 'screwSpacingMm'],
  ['mg995Mount', 'cableNotchWidthMm'], ['mg995Mount', 'cableNotchDepthMm'],
]) {
  for (const value of invalidValues) {
    const source = JSON.parse(JSON.stringify(FABRICATION_DEFAULTS));
    source[group][key] = value;
    assert.equal(normalizeFabricationProfile(source).ok, false, `reject ${group}.${key}=${String(value)}`);
  }
}

const outOfBounds = [
  ['export', 'barWidthMm', 1.99], ['export', 'barWidthMm', 120.01],
  ['export', 'holeDiameterMm', 0.49], ['export', 'holeDiameterMm', 119.01],
  ['export', 'frameMarginMm', 7.99], ['export', 'frameMarginMm', 80.01],
  ['export', 'frameHoleDiameterMm', 0.49], ['export', 'frameHoleDiameterMm', 30.01],
  ['export', 'ttShaftFlatDiameterMm', 0.99], ['export', 'ttShaftFlatDiameterMm', 30.01],
  ['export', 'ttShaftFlatThicknessMm', 0.49], ['export', 'ttShaftFlatThicknessMm', 29.91],
  ['ttMount', 'shaftDiameterMm', 0.49], ['ttMount', 'shaftDiameterMm', 30.01],
  ['ttMount', 'screwDiameterMm', 0.49], ['ttMount', 'screwDiameterMm', 20.01],
  ['ttMount', 'screwOffsetXMm', -120.01], ['ttMount', 'screwOffsetXMm', 120.01],
  ['ttMount', 'screwSpacingMm', -0.01], ['ttMount', 'screwSpacingMm', 80.01],
  ['ttMount', 'locatorDiameterMm', 0.49], ['ttMount', 'locatorDiameterMm', 20.01],
  ['ttMount', 'locatorOffsetXMm', -120.01], ['ttMount', 'locatorOffsetXMm', 120.01],
  ['ttMount', 'locatorOffsetYMm', -80.01], ['ttMount', 'locatorOffsetYMm', 80.01],
  ['mg995Mount', 'bodyLengthMm', 19.99], ['mg995Mount', 'bodyLengthMm', 80.01],
  ['mg995Mount', 'bodyWidthMm', 9.99], ['mg995Mount', 'bodyWidthMm', 40.01],
  ['mg995Mount', 'shaftOffsetMm', -0.01], ['mg995Mount', 'shaftOffsetMm', 40.01],
  ['mg995Mount', 'screwDiameterMm', 0.49], ['mg995Mount', 'screwDiameterMm', 10.01],
  ['mg995Mount', 'screwSpanMm', 19.99], ['mg995Mount', 'screwSpanMm', 80.01],
  ['mg995Mount', 'screwSpacingMm', -0.01], ['mg995Mount', 'screwSpacingMm', 30.01],
  ['mg995Mount', 'cableNotchWidthMm', -0.01], ['mg995Mount', 'cableNotchWidthMm', 20.01],
  ['mg995Mount', 'cableNotchDepthMm', -0.01], ['mg995Mount', 'cableNotchDepthMm', 20.01],
];
for (const [group, key, value] of outOfBounds) {
  const source = JSON.parse(JSON.stringify(FABRICATION_DEFAULTS));
  source[group][key] = value;
  assert.equal(normalizeFabricationProfile(source).ok, false, `reject out-of-bounds ${group}.${key}`);
}

for (const thickness of [5.4, 5.5]) {
  const conflict = JSON.parse(JSON.stringify(FABRICATION_DEFAULTS));
  conflict.export.ttShaftFlatThicknessMm = thickness;
  assert.equal(normalizeFabricationProfile(conflict).ok, false, 'flat thickness must be below flat diameter');
}

const planned = planFabricationProfile(nonDefault, 'export', 'holeDiameterMm', 6.125);
assert.equal(planned.ok, true);
assert.equal(planned.profile.export.holeDiameterMm, 6.13, 'known dimensions normalize to loader precision');
assert.deepEqual(nonDefault, original, 'planning must not mutate the source profile');
assert.equal(planned.profile.ttMount.locatorOffsetYMm, nonDefault.ttMount.locatorOffsetYMm);
assert.equal(planned.profile.mg995Mount.cableNotchDepthMm, nonDefault.mg995Mount.cableNotchDepthMm);
assert.equal(planFabricationProfile(nonDefault, 'export', 'holeDiameterMm', 5).changed, false);
assert.equal(planFabricationProfile(nonDefault, 'export', 'unknown', 5).ok, false);
assert.equal(planFabricationProfile(nonDefault, 'export', 'holeDiameterMm', '').ok, false);
assert.equal(planFabricationProfile(nonDefault, 'export', 'ttShaftFlatDiameterMm', 3).ok, false,
  'a plan that conflicts with the retained flat thickness is rejected');
assert.equal(planFabricationProfile(undefined, 'ttMount', 'shaftDiameterMm', 8).ok, true,
  'a caller may plan from fixed defaults after observing missing status');

assert.equal(globalThis.localStorage, undefined, 'module tests must not require browser storage');
console.log('fabrication profile checks passed');
