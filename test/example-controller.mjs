// 範例選單、教學卡與 snapshot 載入流程驗收。
import { createExampleController } from '../js/blocks/example-controller.js';
import { check, report } from './_harness.mjs';

class FakeElement {
  constructor(tag = 'div') { this.tag = tag; this.children = []; this.style = {}; this.dataset = {}; this.textContent = ''; this.value = ''; }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener() {}
}
const ids = new Map([
  ['exampleSelect', new FakeElement('select')], ['exampleLessonCard', new FakeElement()],
  ['exampleLessonTitle', new FakeElement()], ['exampleLessonMeta', new FakeElement()],
  ['exampleLessonUse', new FakeElement()], ['exampleLessonLearn', new FakeElement()],
  ['exampleLessonTasks', new FakeElement('ul')]
]);
globalThis.document = {
  getElementById: id => ids.get(id) || null,
  createElement: tag => new FakeElement(tag)
};
let applied = null, message = '';
const controller = createExampleController({
  applySnapshot: snapshot => { applied = snapshot; }, notify: text => { message = text; },
  closeMobileMenu: () => {}, isMobile: () => false, showBuildPanel: () => {}
});
controller.populate();
check('範例控制器依分類建立桌面選單', ids.get('exampleSelect').children.length > 1 && ids.get('exampleSelect').children.every(child => child.tag === 'optgroup'));
check('初始化時隱藏教學卡', ids.get('exampleLessonCard').style.display === 'none');
check('範例 snapshot 可正規化並套用', controller.load('fourbar-crank-rocker') && applied?.comps?.length > 0 && applied.params?.LL1 === 32);
check('載入後更新教學卡與通知', ids.get('exampleLessonCard').style.display === '' && ids.get('exampleLessonTitle').textContent.includes('四連桿') && message.includes('已載入'));
check('控制器記錄目前範例 id', controller.activeExampleId === 'fourbar-crank-rocker');

report('example-controller');
