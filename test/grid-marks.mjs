// 孔格例外的呈現（docs/SDD-GRID-BLOCKS.md G2）：標記位置、面板文字、製作包一節、新增項目比對。跑法：node test/grid-marks.mjs
import assert from 'node:assert/strict';
import { gridIssues } from '../js/blocks/grid-rule.js';
import { issueKey, newIssues, noticeText, markSpecs, panelLines, buildPackSection, addGridToBuildPack, sync, currentIssues, drawMarks } from '../js/blocks/grid-marks.js';

const P = { L48: 48, L50: 50, FL: 48 };
const bar = (id, len, x2) => ({ type: 'bar', id, lenParam: len, p1: { id: id + 'a', type: 'floating', x: 0, y: 0 }, p2: { id: id + 'b', type: 'floating', x: x2, y: 0 } });
const comps = [bar('Ok', 'L48', 48), bar('Off', 'L50', 50)];
const issues = gridIssues(comps, P);
assert.equal(issues.length, 1); assert.equal(issues[0].componentId, 'Off');

// 標記：只有離格零件；位置為 p1／p2 的中點（世界座標）
const pts = { Ooa: { x: 0, y: 0 }, Offa: { x: 10, y: 4 }, Offb: { x: 60, y: 4 } };
const marks = markSpecs(issues, comps, pts);
assert.equal(marks.length, 1); assert.equal(marks[0].id, 'Off'); assert.deepEqual([marks[0].x, marks[0].y], [35, 4]);
assert.deepEqual(markSpecs(issues, comps, {}), [], '沒有座標就不畫');

// 面板文字：只列選到的零件；未離格回空
assert.equal(panelLines(issues, 'Off', comps, []).length, 1);
assert.ok(panelLines(issues, 'Off', comps, [])[0].includes('50'));
assert.deepEqual(panelLines(issues, 'Ok', comps, []), []);

// 新增項目比對：只認新 key；偏差大小改變不算新
assert.deepEqual(newIssues([], issues).map(issueKey), [issueKey(issues[0])]);
assert.deepEqual(newIssues(issues, issues), []);
assert.deepEqual(newIssues(issues, [{ ...issues[0], deviationMm: 1.5 }]), []);
assert.match(noticeText(issues, comps, []), /離開 8 mm 孔格，已標示為例外/);
assert.equal(noticeText([], comps, []), '');

// 機架項目：componentId 為 ''，標在 pointId 位置
const frameIssue = { componentId: '', moduleId: null, type: 'frame', rule: 'R3', subject: '機架固定孔', pointId: 'A', deviationMm: 1, message: 'm' };
assert.deepEqual(markSpecs([frameIssue], comps, { A: { x: 3, y: 5 } }).map(m => [m.id, m.x, m.y]), [['frame:', 3, 5]]);
assert.equal(panelLines([frameIssue], '', comps, []).length, 1);
assert.match(noticeText([frameIssue], comps, []), /機架板/);

// 製作包一節
assert.equal(buildPackSection([], comps, []), '');
const sec = buildPackSection(issues, comps, []);
assert.ok(sec.includes('<h2 id="gridExceptions">孔格例外</h2>') && sec.includes('data-grid-exceptions'));
const html = '<body><h2>CNC 注意事項</h2></body>';
const S = { comps, topo: { params: P }, modules: [] };
const out = addGridToBuildPack(html, S);
assert.ok(out.indexOf('孔格例外') < out.indexOf('CNC 注意事項'));
assert.equal(addGridToBuildPack(html, { comps: [comps[0]], topo: { params: P }, modules: [] }), html, '沒有例外原樣回傳');

// sync：載入後第一次（quiet）不提示；之後新增離格才提示一次；調回格上自動消失
const said = []; let redraws = 0;
const live = { comps: [bar('A', 'L48', 48)], topo: { params: { ...P } }, modules: [] };
assert.equal(sync(live, true, m => said.push(m), () => redraws++), false); assert.deepEqual(said, []);
live.topo.params.L48 = 50; live.comps[0].p2.x = 50;
assert.equal(sync(live, false, m => said.push(m), () => redraws++), true);
assert.equal(said.length, 1); assert.ok(said[0].includes('離開 8 mm 孔格')); assert.equal(redraws, 1);
sync(live, false, m => said.push(m), () => redraws++); assert.equal(said.length, 1, '同一項目不重複提示');
live.topo.params.L48 = 48; live.comps[0].p2.x = 48;
sync(live, false, m => said.push(m)); assert.equal(currentIssues().length, 0, '調回格上即消失');
live.topo.params.L48 = 51;
sync(live, true, m => said.push(m)); assert.equal(said.length, 1, 'quiet（載入／復原）不提示');

// drawMarks 在沒有 DOM 的環境不應被呼叫；有 DOM 時的選擇器由瀏覽器驗收（data-grid-exception、data-grid-marks、data-grid-panel）
assert.equal(typeof drawMarks, 'function');
console.log('grid-marks: ok');
