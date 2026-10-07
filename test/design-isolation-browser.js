// 由 design-isolation.html 在真實 blocks iframe 裡執行，使用同一份 state／事件處理器。
import { S } from '../js/blocks/state.js';
import * as Tools from '../js/blocks/tools.js';
import * as View from '../js/blocks/view.js';
const api = window.blocks, lines = [];
let passed = 0, failed = 0;
const check = (label, ok) => { lines.push(`${ok ? 'PASS' : 'FAIL'} ${label}`); ok ? passed++ : failed++; };
const hidden = () => JSON.stringify(S.comps.filter(c => c.moduleId === 'B'));
const selectBar = () => {
  document.querySelector('[data-link-id="barA"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'mouse', button: 0 }));
  document.getElementById('stageSvg').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'mouse', button: 0 }));
};
const clickTab = id => {
  const tab = [...document.querySelectorAll('#designTabs [role="tab"]')].find(t => t.textContent.includes(`設計 ${id}`));
  if (!tab) throw new Error('找不到分頁 ' + id);
  tab.click();
};
try {
  check(`載入作品聚焦 A，控制馬達也必須是 A 的 M1（focus=${S.designFocus}, motor=${S.activeMotor}）`, S.designFocus === 'A' && S.activeMotor === '1');
  check('載入後不能顯示隱藏模組的 M2 按鈕', ![...document.querySelectorAll('#motorSwitch button')].some(b => b.textContent === 'M2'));
  const before = hidden();
  check('兩個模組重疊，但 SVG 只提供 A 的命中區', !!document.querySelector('[data-link-id="barA"]') && !document.querySelector('[data-link-id="barB"]'));
  check('吸附只會選到目前分頁的點', Tools.nearestNodeId({ x: 80, y: 0 }, ['A0']) === 'A1');
  selectBar();
  check('重疊位置選取 A，不選到 B', S.selectedLinkId === 'barA');
  clickTab('B');
  check('切頁會清除舊選取', !S.selectedLinkId && !S.selectedNodeId);
  api.deleteSelectedPart();
  check('切頁後刪除不會刪掉上一頁零件', S.comps.some(c => c.id === 'barA') && hidden() === before);
  clickTab('A');
  selectBar();
  api.deleteSelectedPart();
  check('刪除 A 不影響隱藏 B', !S.comps.some(c => c.id === 'barA') && hidden() === before);
  api.undo();
  check('復原恢復 A，B 的資料保持不變', S.comps.some(c => c.id === 'barA') && hidden() === before);
  clickTab('A');
  const svg = document.getElementById('stageSvg');
  const frameHandle = [...svg.querySelectorAll('g')].find(g => g.querySelector('title')?.textContent.startsWith('機架：'));
  const origin = svg.createSVGPoint(); origin.x = View.TX(-20); origin.y = View.TY(0);
  const client = origin.matrixTransform(svg.getScreenCTM());
  const pointer = (type, x, y) => new PointerEvent(type, { bubbles: true, pointerId: 3, pointerType: 'mouse', button: 0, clientX: x, clientY: y });
  const startX = S.comps.find(c => c.id === 'barA').p1.x;
  frameHandle.dispatchEvent(pointer('pointerdown', client.x, client.y));
  svg.dispatchEvent(pointer('pointermove', client.x + 40, client.y + 20));
  await new Promise(resolve => requestAnimationFrame(resolve));
  svg.dispatchEvent(pointer('pointerup', client.x + 40, client.y + 20));
  check('拖曳機架只移動 A，重疊的 B 不動', S.comps.find(c => c.id === 'barA').p1.x !== startX && hidden() === before);
  api.undo();
  check('復原機架拖曳，B 仍完全不變', S.comps.find(c => c.id === 'barA').p1.x === startX && hidden() === before);
  // 新畫一根連桿，終點故意落在隱藏 B 的接點；B 與 A 重疊，所以先把 A 畫布移到新的空白設計。
  api.newDesign();
  check('空白新設計不吸附隱藏模組', Tools.nearestNodeId({ x: 0, y: 0 }) === null);
  clickTab('A');
  const count = S.comps.length;
  const oldIds = new Set(S.comps.map(c => c.id));
  api.addLink();
  check('新零件歸入 A，沒有改寫 B', S.comps.length > count && S.comps.filter(c => !oldIds.has(c.id)).every(c => c.moduleId === 'A') && hidden() === before);
  api.undo();
  check('復原新增零件不改寫 B', S.comps.length === count && hidden() === before);
  await api.setMode('bench');
  check('組立模式包含兩個模組', api.designDebug().comps.includes('barA') && api.designDebug().comps.includes('barB'));
  check('組立模式恢復所有馬達控制按鈕', [...document.querySelectorAll('#motorSwitch button')].map(b => b.textContent).join(',') === 'M1,M2');
  api.benchSelect('B');
  await api.setMode('design');
  check('組立回設計只顯示選中的 B', S.designFocus === 'B' && !document.querySelector('[data-link-id="barA"]') && !!document.querySelector('[data-link-id="barB"]'));
} catch (e) { check('測試執行完成：' + e.stack, false); }
clearTimeout(S.autosaveTimer);
window.parent.finishIsolationTest(`${lines.join('\n')}\n\n${passed} passed, ${failed} failed`);
