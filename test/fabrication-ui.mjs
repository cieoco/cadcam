// L4c：CNC（刀徑、板厚）與 drive（輪轂、舵盤）可在設定面板修改，隨作品保存。
import { check, report } from './_harness.mjs';
import { readFileSync } from 'node:fs';

class FakeElement { constructor() { this.value = ''; this.textContent = ''; } addEventListener() {} blur() {} }
const cncKeys = ['toolDiameterMm', 'stockThicknessMm'];
const driveKeys = ['ttHubCenterMm', 'ttHubScrewMm', 'ttHubScrewSpacingMm', 'hornCenterMm', 'hornScrewMm', 'hornScrewCount', 'hornScrewCircleMm'];
const inputs = { cnc: new Map(cncKeys.map(k => [k, [new FakeElement()]])), drive: new Map(driveKeys.map(k => [k, [new FakeElement()]])) };
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.document = {
  getElementById: () => null,
  querySelectorAll(selector) {
    const m = selector.match(/^\[data-(cnc|drive)-setting="([^"]+)"\]$/);
    if (m) return inputs[m[1]].get(m[2]) || [];
    return [];
  },
};
const { S } = await import('../js/blocks/state.js');
const Settings = await import('../js/blocks/settings.js');
const notes = [];
Settings.init({ draw() {}, pushUndo() {}, pause() {}, scheduleAutosave() {}, notify: m => notes.push(m) });

check('settings 匯出 setCncSetting／setDriveSetting', typeof Settings.setCncSetting === 'function' && typeof Settings.setDriveSetting === 'function');
if (typeof Settings.setCncSetting === 'function') {
  check('改刀徑 2 mm → 寫進作品加工設定', Settings.setCncSetting('toolDiameterMm', '2') === true && S.fabrication.cnc.toolDiameterMm === 2);
  check('改後欄位同步顯示', inputs.cnc.get('toolDiameterMm')[0].value == 2);
  check('改舵盤螺絲數 6', Settings.setDriveSetting('hornScrewCount', '6') === true && S.fabrication.drive.hornScrewCount === 6);
  check('螺絲數 2.5 被拒絕並提示、作品不變', Settings.setDriveSetting('hornScrewCount', '2.5') === false && S.fabrication.drive.hornScrewCount === 6 && notes.length > 0);
  check('刀徑保留 0.001：3.175', Settings.setCncSetting('toolDiameterMm', '3.175') === true && S.fabrication.cnc.toolDiameterMm === 3.175);
}
const html = readFileSync(new URL('../blocks.html', import.meta.url), 'utf8');
check('blocks.html 有刀徑與板厚欄位', cncKeys.every(k => html.includes(`data-cnc-setting="${k}"`)));
check('blocks.html 有 7 個輪轂／舵盤欄位', driveKeys.every(k => html.includes(`data-drive-setting="${k}"`)));
check('欄位呼叫 window.blocks.setCncSetting／setDriveSetting', html.includes('window.blocks.setCncSetting(') && html.includes('window.blocks.setDriveSetting('));
const app = readFileSync(new URL('../js/blocks/app.js', import.meta.url), 'utf8');
check('window.blocks 暴露 setCncSetting／setDriveSetting', /setCncSetting:\s*Settings\.setCncSetting/.test(app) && /setDriveSetting:\s*Settings\.setDriveSetting/.test(app));
report('fabrication-ui');
