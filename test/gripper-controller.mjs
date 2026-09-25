// 夾爪任務卡的表單、姿態與 marker 行為驗收。
import { createGripperController } from '../js/blocks/gripper-controller.js';
import { getExample } from '../js/blocks/examples.js';
import { check, report } from './_harness.mjs';

class FakeElement {
  constructor() {
    this.style = { setProperty(name, value) { this[name] = value; } };
    this.dataset = {};
    this.value = '';
    this.textContent = '';
    this.disabled = false;
    this.handlers = {};
    const classes = new Set();
    this.classList = {
      toggle: (name, on) => on ? classes.add(name) : classes.delete(name),
      contains: name => classes.has(name)
    };
  }
  addEventListener(name, fn) { this.handlers[name] = fn; }
  click() { this.handlers.click?.({ target: this, preventDefault: () => { this.prevented = true; } }); }
}

const ids = new Map([
  'exampleLessonCard', 'exampleLessonContent', 'gripperWorkflowContent', 'gripperObjectWidth',
  'gripperClearance', 'gripperPlanStatus', 'gripperEstimatedGap', 'gripperOpenBtn',
  'gripperCloseBtn', 'gripperDownloadBtn', 'workRangeCard'
].map(id => [id, new FakeElement()]));
const canvas = new FakeElement();
ids.get('workRangeCard').parentElement = canvas;
ids.get('exampleLessonCard').offsetHeight = 240;
globalThis.document = { getElementById: id => ids.get(id) || null, activeElement: null };

const example = getExample('gear-gripper').snapshot;
let params = { ...example.params };
let pose = null;
let editing = false;
let undoCount = 0, rebuildCount = 0, drawCount = 0, pauseCount = 0;
const controller = createGripperController({
  getComps: () => example.comps,
  getParams: () => params,
  rebuild: () => { rebuildCount++; },
  draw: () => { drawCount++; },
  pause: () => { pauseCount++; },
  pushUndo: () => { undoCount++; },
  setPose: (theta, motor) => { pose = { theta, motor }; },
  getSnapshot: () => ({ ...example, params }),
  isEditing: () => editing
});

controller.sync();
check('marker 啟用夾爪任務卡並求出預設計畫', controller.isActive() && controller.currentPlan().ok && ids.get('gripperObjectWidth').value === 50);
ids.get('gripperOpenBtn').click();
check('張開按鈕使用計畫角度與馬達', pose?.theta === controller.currentPlan().open.theta && pose?.motor === controller.currentPlan().motor);
const before = params.gripperObjectWidth;
ids.get('gripperObjectWidth').handlers.input({ target: { value: '151' } });
check('無效尺寸立即阻止流程，但未污染已提交參數', !controller.currentPlan().ok && controller.range() === null && params.gripperObjectWidth === before);
const beforeCommitDraws = drawCount;
ids.get('gripperObjectWidth').handlers.change({ target: { value: '151' } });
check('有效數字提交時先記錄 undo 並觸發一次重建', undoCount === 1 && rebuildCount === 1 && drawCount === beforeCommitDraws + 1 && pauseCount >= 1);
params = { ...params, gripperObjectWidth: 50, gripperClearance: 10 };
controller.sync();
check('套用新 snapshot 清除舊草稿並重算', controller.currentPlan().ok && ids.get('gripperObjectWidth').value === 50);
const beforeDragUndo = undoCount;
controller.previewWidth(70);
controller.previewWidth(80);
check('拖曳預覽更新物件但不改存檔或堆積復原', controller.reference().width === 80 && params.gripperObjectWidth === 50 && undoCount === beforeDragUndo);
controller.commitWidth(80);
check('一次拖曳只提交一筆復原', params.gripperObjectWidth === 80 && undoCount === beforeDragUndo + 1);
controller.previewWidth(150);
check('不可達尺寸保留物件以便拖回', !controller.currentPlan().ok && controller.reference().width === 150);
controller.cancelPreview();
check('取消拖曳回到已保存尺寸', controller.reference().width === 80 && controller.currentPlan().ok);
const download = ids.get('gripperDownloadBtn');
download.tagName = 'A';
download.click();
const downloadedRecord = decodeURIComponent(download.href.split(',').slice(1).join(','));
const embedded = JSON.parse(downloadedRecord.match(/```json\n([\s\S]+?)\n```/)[1]);
check('原生下載連結的記錄與內嵌 snapshot 同為本次80mm', download.download.includes('-80mm-') && downloadedRecord.includes('物件寬度：80 mm') && embedded.params.gripperObjectWidth === 80);
controller.previewWidth(150); download.click();
check('無效計畫阻止下載舊連結', download.prevented === true);
controller.cancelPreview();
check('任務卡顯示時為手機畫布保留實際高度', canvas.classList.contains('gripper-card-visible') && canvas.style['--gripper-card-space'] === '256px');
editing = true;
controller.syncVisibility();
check('選取零件時隱藏任務卡並釋放畫布', ids.get('exampleLessonCard').classList.contains('workflow-hidden') && !canvas.classList.contains('gripper-card-visible'));
editing = false;
controller.syncVisibility();
check('結束編輯後回復任務卡', !ids.get('exampleLessonCard').classList.contains('workflow-hidden') && canvas.classList.contains('gripper-card-visible'));
params = { theta: 0 };
controller.sync();
check('移除 marker 關閉工作流程卡', !controller.isActive() && ids.get('exampleLessonCard').style.display === 'none');
check('一般作品還原既有量測及畫布', !canvas.classList.contains('gripper-workflow-active') && !canvas.classList.contains('gripper-card-visible'));

report('gripper-controller');
