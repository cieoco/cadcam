import {pointDisplayName,partDisplayName} from '../js/blocks/display-labels.js';
// 範例選單、教學卡與 snapshot 載入流程驗收。
import { createExampleController } from '../js/blocks/example-controller.js';
import { check, report } from './_harness.mjs';
import { BLOCK_EXAMPLES, loadUnitStarts } from '../js/blocks/examples.js?v=20261005_parallel';
import { CATALOG_GROUPS, CATALOG_FAMILIES, CATALOG_RECOMMENDATIONS, getCatalogVariant } from '../js/blocks/example-catalog.js';
import { startupSize } from '../tools/startup-size.mjs';

class FakeElement {
  constructor(tag = 'div') { this.tag = tag; this.children = []; this.style = {}; this.dataset = {}; this.textContent = ''; this.value = ''; }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener(name, fn) { (this.events ||= {})[name] = fn; }
  setAttribute() {}
  append(...children) { this.children.push(...children); }
  showModal() { this.open = true; }
  close() { this.open = false; }
  remove() { this.removed = true; }
  focus() {}
  set textContent(value) { this.text = value; this.children = []; }
  get textContent() { return this.text; }
}
const ids = new Map([
  ['exampleList', Object.assign(new FakeElement(), { querySelector() { return null; } })], ['exampleLessonCard', new FakeElement()],
  ['exampleLessonTitle', new FakeElement()], ['exampleLessonMeta', new FakeElement()],
  ['exampleLessonUse', new FakeElement()], ['exampleLessonLearn', new FakeElement()],
  ['exampleLessonTasks', new FakeElement('ul')]
]);
globalThis.document = {
  body: new FakeElement('body'),
  getElementById: id => ids.get(id) || null,
  createElement: tag => new FakeElement(tag)
};
let applied = null, message = '';
const controller = createExampleController({
  applySnapshot: snapshot => { applied = snapshot; }, notify: text => { message = text; },
  closeMobileMenu: () => {}, isMobile: () => false, showBuildPanel: () => {}
});
await controller.populate();
check('範例控制器依分類建立範例清單（電腦與手機同一份）', ids.get('exampleList').children.length > 1 && ids.get('exampleList').children.every(child => child.className === 'example-section'));
const descendants = node => node.children.flatMap(child => [child, ...descendants(child)]);
const entries = () => descendants(ids.get('exampleList'));
const catalogIds = CATALOG_FAMILIES.flatMap(family => family.variants.map(item => item.id));
const snapshots = JSON.stringify(BLOCK_EXAMPLES);
// 61 = 55 個啟動即有的範例＋4 個馬達／舵機座板及2個力臂範例（隨起始檔按需載入，載入前目錄只顯示 55 個）。
check('61 個公開範例各有唯一主要位置，沒有遺失或多餘 ID', catalogIds.length === 61 && new Set(catalogIds).size === 61 && BLOCK_EXAMPLES.every(example => catalogIds.includes(example.id)));
check('五個用途依確認順序排列，工具練習另列', CATALOG_GROUPS.map(group => group.label).join('、') === '傳動與變速、升降與伸縮、夾取與搬運、往復與特殊運動、行走機構' && CATALOG_FAMILIES.every(family => CATALOG_GROUPS.some(group => group.id === family.group) || family.group === 'tools'));
check('推薦使用同 ID 捷徑，不複製主要入口', entries().filter(node => node.dataset.exampleId).length === 55 && entries().filter(node => node.dataset.exampleRef).length === CATALOG_RECOMMENDATIONS.length);
check('能力標示保留手動、固定、局部與待完成界限', getCatalogVariant('iq-wheel-grabber').capability === '手動調姿' && getCatalogVariant('iq-passive-combined').capability === '固定組立' && getCatalogVariant('crank-catapult-study').capability === '局部示意' && getCatalogVariant('slider-crank-practice').capability === '待完成練習');
check('通用夾爪保留原理說明', !getCatalogVariant('gear-gripper').source && CATALOG_FAMILIES.find(family => family.id === 'clawbot').variants.some(item => item.id === 'gear-gripper'));
const brandText=/(?:\bvex\b|\biq\b|linq|clawbot|m\.a\.d\.\s*box|fling)/i;
const visibleExamples=BLOCK_EXAMPLES.map(e=>[e.title,e.note,e.adjustmentNote,e.lesson,e.snapshot.projectName,e.snapshot.modules?.map(m=>m.name),e.snapshot.comps.map(c=>c.name)]);
const visibleCatalog=CATALOG_FAMILIES.map(f=>[f.title,f.note,f.variants.map(v=>[v.title,v.source])]);
check('範例與目錄只顯示機構通用名稱，保留內部識別碼',!brandText.test(JSON.stringify([visibleExamples,visibleCatalog])));
const lift=BLOCK_EXAMPLES.find(e=>e.id==='iq-linq-lift').snapshot;
check('可見接點與零件名稱沿既有name，不改穩定ID',!brandText.test(pointDisplayName(lift.comps,'LinqAxis'))&&!brandText.test(partDisplayName(lift.comps,'LinqMotorGear'))&&pointDisplayName(lift.comps,'A')==='A'&&lift.comps.some(c=>c.p1?.id==='LinqAxis'));
check('目錄不進入首次載入', !startupSize().paths.includes('js/blocks/example-catalog.js'));
await controller.populate();
check('重建目錄不重複入口、不改原作品資料', entries().filter(node => node.dataset.exampleId).length === 55 && JSON.stringify(BLOCK_EXAMPLES) === snapshots);
await loadUnitStarts(); const withStarts = JSON.stringify(BLOCK_EXAMPLES); await controller.populate();
check('八份教學起始檔另列且各保留原 ID', entries().filter(node => node.dataset.exampleId).length === 69 && entries().some(node => node.dataset.exampleGroup === 'lessons'));
check('教學起始檔與公開作品在目錄呈現後皆保持原內容', JSON.stringify(BLOCK_EXAMPLES) === withStarts);
controller.renderLessonCard(null);
check('初始化時隱藏教學卡', ids.get('exampleLessonCard').style.display === 'none');
check('範例 snapshot 可正規化並保留 32 mm 曲柄', controller.load('fourbar-crank-rocker') && applied?.comps?.length > 0 && applied.params?.LL1 === 32);
check('載入後更新教學卡與通知', ids.get('exampleLessonCard').style.display === '' && ids.get('exampleLessonTitle').textContent.includes('四連桿') && message.includes('已載入'));
check('控制器記錄目前範例 id', controller.activeExampleId === 'fourbar-crank-rocker');
controller.renderLessonCard(null);
check('開啟外部作品時清除舊教學卡與範例身分', ids.get('exampleLessonCard').style.display === 'none' && controller.activeExampleId === '');
check('清除後仍可載入下一個範例', controller.load('gear-pair') && controller.activeExampleId === 'gear-pair' && ids.get('exampleLessonCard').style.display === '' && ids.get('exampleLessonTitle').textContent.includes('齒輪'));
controller.snapshotApplied({ params: {} });
check('套用無任務 marker 的快照會清掉過期教學卡', ids.get('exampleLessonCard').style.display === 'none' && controller.activeExampleId === '');
controller.snapshotApplied({ params: { gripperWorkflow: 1 } });
check('套用夾爪任務快照不會把一般教學卡重新打開', ids.get('exampleLessonCard').style.display === 'none' && controller.activeExampleId === 'gear-gripper');

controller.restoreLesson('slider-crank');
check('復原能還原對應的課程身分', controller.activeExampleId === 'slider-crank');
controller.snapshotApplied({ params: {} }, 'undo');
check('復原作品過程不提前清除課程', controller.activeExampleId === 'slider-crank');
controller.restoreLesson('');
check('復原到非課程作品會清除任務', controller.activeExampleId === '');
globalThis.window = { document: globalThis.document };
const previous = applied;
check('清單要求載入時先詢問、不直接套用', controller.requestLoad('parallel-fourbar') && applied === previous);
check('對話框開啟時不重複建立', controller.requestLoad('gear-gripper') === false && document.body.children.length === 1);
const pending = document.body.children[0];
pending.children.find(e => e.textContent === '保留目前作品').onclick();
check('取消保留作品', applied === previous && pending.removed);
controller.requestLoad('parallel-fourbar');
document.body.children[1].children.find(e => e.textContent === '載入此範例').onclick();
check('取消後可重選同一範例並確認載入', applied !== previous && controller.activeExampleId === 'parallel-fourbar');
report('example-controller');
