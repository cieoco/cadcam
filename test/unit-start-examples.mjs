// 單元起始練習檔（第四、五、六、七、十一、十二單元）：延遲載入、重複呼叫不重複登記、內容符合各課假設。
import { check, report } from './_harness.mjs';
import { getExample, getExampleLesson, loadUnitStarts, BLOCK_EXAMPLES } from '../js/blocks/examples.js';
import { normalizeSnapshot } from '../js/blocks/schema.js';
import { compileAssembly, solveAssembly } from '../js/blocks/assembly.js';
import { rackGuideTravel } from '../js/blocks/rack-limits.js';
import { offerExampleFromUrl } from '../js/blocks/example-entry.js';
import { UNIT_STARTS } from '../js/blocks/unit-starts.js';
import { planSyringeInstallation } from '../js/blocks/syringe-installation.js';
import { scanSyringe } from '../js/blocks/syringe-operations.js';
const ids = ['unit4-start', 'unit5-start', 'unit6-start', 'unit7-start', 'unit11-start', 'unit12-start', 'syringe-fixed-start', 'syringe-pivot-start'];
check('載入前清單沒有單元起始檔（不在啟動資料）', ids.every(id => !getExample(id)));
const before = BLOCK_EXAMPLES.length;
const [first, second] = [loadUnitStarts(), loadUnitStarts()];
check('重複呼叫共用同一個載入', first === second);
await first;
check('載入後八個起始檔進入清單（含針筒單元的兩個）', ids.every(id => getExample(id)) && BLOCK_EXAMPLES.length === before + ids.length);
await loadUnitStarts();
check('再次載入不重複登記', BLOCK_EXAMPLES.length === before + ids.length && new Set(BLOCK_EXAMPLES.map(e => e.id)).size === BLOCK_EXAMPLES.length);
check('每個起始檔標為練習並說明內容與第一步', ids.every(id => { const l = getExampleLesson(id); return l.group === 'challenge' && l.level === '練習' && l.use && l.try.length; }));
// 網址深連結：起始檔還沒載入時先載入再開「載入此範例」視窗；先前已知的範例仍是同步。
class Element { constructor(tag) { this.tag = tag; this.children = []; } setAttribute() {} append(...c) { this.children.push(...c); } addEventListener() {} showModal() { this.open = true; } close() {} remove() {} focus() {} }
const deepLink = id => {
  const document = { body: new Element('body'), createElement: tag => new Element(tag) };
  const result = offerExampleFromUrl({ document, location: { href: 'https://example.org/blocks.html?example=' + id }, history: { state: null, replaceState() {} }, loadExample: () => true, notify: () => {} });
  return { document, result };
};
{
  const sync = deepLink('fourbar-crank-rocker');
  check('既有範例的網址深連結仍同步開啟視窗', sync.document.body.children[0]?.open === true);
  const lazy = deepLink('unit5-start');
  await lazy.result;
  check('起始檔的網址深連結等載入後開啟視窗', lazy.document.body.children[0]?.children[0]?.textContent === '第五單元：已存好的齒輪對');
}
check('十二單元的起始檔都不同，且都有教學資料', new Set(UNIT_STARTS.map(u => u.example)).size === 12 && UNIT_STARTS.every(u => getExample(u.example)));

const snap = id => normalizeSnapshot(structuredClone(getExample(id).snapshot));
check('第四單元：空白畫布', snap('unit4-start').comps.length === 0);
{
  const s = snap('unit5-start'), a = s.comps.find(c => c.id === 'GearA'), b = s.comps.find(c => c.id === 'GearB');
  check('第五單元：12／16 齒、左輪 MG995 0°～30°、兩輪固定，還沒有夾指',
    a.teeth === 12 && b.teeth === 16 && a.motorType === 'mg995' && a.servoStart === 0 && a.servoEnd === 30
    && b.p1.type === 'fixed' && !s.comps.some(c => c.type === 'triangle' || c.shape === 'jaw'));
}
{
  const rack = snap('unit6-start').comps.find(c => c.type === 'rack');
  check('第六單元：槽長 144 mm（行程約 117.56），改成 128 mm 約 104.12', rack.slot.length === 144 && Math.abs(rackGuideTravel(rack.slot.length, rack.slot.width).travel - 117.56) < 1e-6 && Math.abs(rackGuideTravel(128, rack.slot.width).travel - 104.12) < 1e-6);
}
{
  const s = snap('unit7-start'), drive = s.comps.find(c => c.motorType === 'mg995');
  check('第七單元：四板翻斗，結束角仍是 −100°', s.modules.length === 4 && drive.servoStart === 0 && drive.servoEnd === -100);
}
{
  const s = snap('unit11-start'), mount = id => s.modules.find(m => m.id === id).mount;
  check('第十一單元：升降與夾爪都還沒接合，各有一支針筒', !mount('Lift') && !mount('Grip') && ['Lift', 'Grip'].every(m => s.comps.filter(c => c.moduleId === m && c.type === 'syringe').length === 1));
  const box = m => { const xs = s.comps.filter(c => c.moduleId === m).flatMap(c => [c.p1, c.p2, c.p3]).filter(Boolean).map(p => p.x); return [Math.min(...xs), Math.max(...xs)]; };
  check('第十一單元：兩個模組左右分開放，不重疊', box('Lift')[1] < box('Grip')[0]);
  const asm = compileAssembly(s.comps, s.modules, { params: s.params });
  check('第十一單元：兩軸針筒可各自求解', solveAssembly(asm, { thetaDeg: 0, motorAngles: {} }).isValid !== false);
}
{
  const s = snap('unit12-start'), mount = id => s.modules.find(m => m.id === id).mount;
  check('第十二單元：夾爪已接在升降上；升降還沒立在轉盤上，旋轉底盤分開', !!mount('Grip')?.to && mount('Grip').to.module === 'Lift' && !mount('Lift') && !mount('Base') && s.modules.some(m => m.id === 'Base'));
  const asm = compileAssembly(s.comps, s.modules, { params: s.params });
  check('第十二單元：可求解', solveAssembly(asm, { thetaDeg: 0, motorAngles: {} }).isValid !== false);
}
// 獨立單元「針筒怎麼控制機構」步驟 3：待安裝的固定／可轉兩個起始檔（H07、H08 去掉針筒）。
for (const [id, source, mode, wrong] of [['syringe-fixed-start', 'hydraulic-h07', 'fixed-axis', 'pivot'], ['syringe-pivot-start', 'hydraulic-h08', 'pivot', 'fixed-axis']]) {
  const s = snap(id), full = snap(source), c = full.comps.find(o => o.type === 'syringe');
  check(`${id}：沒有針筒、其餘零件與 ${source} 相同`, !s.comps.some(o => o.type === 'syringe') && JSON.stringify(s.comps) === JSON.stringify(full.comps.filter(o => o.type !== 'syringe')));
  const r = planSyringeInstallation(s, { id: null, newId: 'Practice', a: c.a, b: c.b, mountMode: mode, axisDeg: c.axisDeg, face: 'front' }, null);
  const scan = r.ok && scanSyringe(r.comps, r.params, 'Practice');
  check(`${id}：照單元步驟能裝上${mode === 'pivot' ? '可轉' : '固定'}針筒，全行程通過`, r.ok && scan.ok && scan.samples.length === 41, r.message);
  check(`${id}：改選另一種安裝會被拒絕（不能試動）`, !planSyringeInstallation(s, { id: null, newId: 'Practice', a: c.a, b: c.b, mountMode: wrong, axisDeg: c.axisDeg, face: 'front' }, null).ok);
}
// 可轉安裝只鎖一耳：左耳、右耳都能裝並通過全行程，筒身落在螺絲的不同側；不指定時預設能動的那一耳。
{
  const s = snap('syringe-pivot-start'), c = snap('hydraulic-h08').comps.find(o => o.type === 'syringe');
  const sides = [1, -1, undefined].map(pivotEar => {
    const r = planSyringeInstallation(s, { id: null, newId: 'Practice', a: c.a, b: c.b, mountMode: 'pivot', pivotEar, face: 'front' }, null);
    const scan = r.ok && scanSyringe(r.comps, r.params, 'Practice');
    check(`syringe-pivot-start：鎖${pivotEar === 1 ? '左' : pivotEar === -1 ? '右' : '預設'}耳，全行程通過`, r.ok && scan.ok && scan.samples.length === 41 && r.syringe.pivotEar === (pivotEar ?? r.syringe.pivotEar), r.message);
    return r.ok && r.syringe.pivotEar;
  });
  check('syringe-pivot-start：預設鎖左耳（pivotEar=1）', sides[2] === 1);
}
report('unit-start-examples');
