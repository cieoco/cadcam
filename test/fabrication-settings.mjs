import assert from 'node:assert/strict';

class FakeElement {
  constructor() { this.value = ''; this.textContent = ''; this.handlers = {}; this.blurs = 0; }
  addEventListener(name, fn) { this.handlers[name] = fn; }
  blur() { this.blurs += 1; }
}

const inputs = {
  export: new Map(), ttMount: new Map(), mg995Mount: new Map(), source: [new FakeElement(), new FakeElement()],
};
const exportKeys = ['barWidthMm', 'holeDiameterMm', 'frameMarginMm', 'frameHoleDiameterMm', 'ttShaftFlatDiameterMm', 'ttShaftFlatThicknessMm'];
const ttKeys = ['shaftDiameterMm', 'screwDiameterMm', 'screwOffsetXMm', 'screwSpacingMm', 'locatorDiameterMm', 'locatorOffsetXMm', 'locatorOffsetYMm'];
const mgKeys = ['bodyLengthMm', 'bodyWidthMm', 'shaftOffsetMm', 'screwDiameterMm', 'screwSpanMm', 'screwSpacingMm', 'cableNotchWidthMm', 'cableNotchDepthMm'];
for (const key of exportKeys) inputs.export.set(key, [new FakeElement(), new FakeElement()]);
for (const key of ttKeys) inputs.ttMount.set(key, [new FakeElement(), new FakeElement()]);
for (const key of mgKeys) inputs.mg995Mount.set(key, [new FakeElement(), new FakeElement()]);

const allFields = [...inputs.export.values(), ...inputs.ttMount.values(), ...inputs.mg995Mount.values()].flat();
const local = new Map([
  ['cadcam.blocks.exportSettings', JSON.stringify({ holeDiameterMm: 8, frameHoleDiameterMm: 6 })],
  ['cadcam.blocks.ttMountSettings.v7', JSON.stringify({ shaftDiameterMm: 7 })],
  ['cadcam.blocks.mg995MountSettings.v1', JSON.stringify({ bodyWidthMm: 23 })],
]);
let writes = 0;
globalThis.localStorage = {
  getItem: key => local.get(key) ?? null,
  setItem: () => { writes += 1; },
};
globalThis.document = {
  getElementById(id) {
    if (id === 'frameMarginInput') return inputs.export.get('frameMarginMm')[0];
    if (id === 'frameHoleInput') return inputs.export.get('frameHoleDiameterMm')[0];
    return null;
  },
  querySelectorAll(selector) {
    if (selector === '[data-fabrication-source]') return inputs.source;
    const match = selector.match(/^\[data-(export|tt-mount|mg995-mount)-setting="([^"]+)"\]$/);
    if (match) return inputs[match[1] === 'export' ? 'export' : match[1] === 'tt-mount' ? 'ttMount' : 'mg995Mount'].get(match[2]) || [];
    if (selector.includes('[data-export-setting]')) return allFields;
    return [];
  },
};

const { S } = await import('../js/blocks/state.js');
const Settings = await import('../js/blocks/settings.js');
let counts = { pause: 0, undo: 0, autosave: 0, draw: 0 };
const notices = [];
Settings.init({
  pause: () => { counts.pause += 1; },
  pushUndo: () => { counts.undo += 1; },
  scheduleAutosave: () => { counts.autosave += 1; },
  draw: () => { counts.draw += 1; },
  notify: message => notices.push(message),
});
Settings.loadExportSettings();
Settings.loadTtMountSettings();
Settings.loadMg995MountSettings();

assert.equal(S.fabrication.export.holeDiameterMm, 8);
assert.equal(S.fabrication.ttMount.shaftDiameterMm, 7);
assert.equal(S.fabrication.mg995Mount.bodyWidthMm, 23);
assert.equal(inputs.export.get('holeDiameterMm')[1].value, 8, 'desktop and narrow forms sync');
assert.equal(writes, 0, 'legacy preferences are read but never overwritten by project edits');

assert.equal(Settings.setExportSetting('holeDiameterMm', '5'), true);
assert.equal(S.fabrication.export.holeDiameterMm, 5);
assert.deepEqual(counts, { pause: 1, undo: 1, autosave: 1, draw: 1 }, 'one valid commit is one transaction');
assert.equal(Settings.setExportSetting('holeDiameterMm', '5'), false);
assert.deepEqual(counts, { pause: 1, undo: 1, autosave: 1, draw: 1 }, 'same value makes no transaction');
assert.equal(Settings.setTtMountSetting('locatorOffsetYMm', ''), false, 'empty zero-capable field is rejected');
assert.equal(S.fabrication.ttMount.locatorOffsetYMm, 0);
assert.equal(Settings.setExportSetting('holeDiameterMm', 'not-a-number'), false);
assert.equal(S.fabrication.export.holeDiameterMm, 5);
assert.equal(notices.length, 2);
assert.equal(writes, 0);

const field = inputs.export.get('holeDiameterMm')[0];
field.value = '37';
let prevented = 0;
field.handlers.keydown({ key: 'Escape', currentTarget: field, preventDefault: () => { prevented += 1; } });
assert.equal(field.value, 5);
assert.equal(field.blurs, 1);
assert.equal(prevented, 1);
assert.deepEqual(counts, { pause: 1, undo: 1, autosave: 1, draw: 1 }, 'Escape only restores the committed project value');

field.handlers.keydown({ key: 'Enter', currentTarget: field, preventDefault: () => { prevented += 1; } });
assert.equal(field.blurs, 2, 'Enter hands commit to the existing change/blur path');
assert.ok(inputs.source.every(element => element.textContent === '目前作品的加工設定'));

console.log('fabrication settings: legacy migration, strict transaction, sync and cancel passed');
