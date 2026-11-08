/**
 * blocks / example-controller
 *
 * 課堂範例選單、教學卡與 snapshot 載入流程。
 */

import { BLOCK_EXAMPLES, EXAMPLE_GROUPS, getExample, getExampleLesson, loadUnitStarts } from './examples.js?v=20261005_parallel';
import { normalizeSnapshot } from './schema.js';
import { offerExample } from './example-entry.js';
import { isPracticeLesson } from './status-text.js';

export function createExampleController({ applySnapshot, insertModule, notify, closeExamples = () => {}, isMobile, showBuildPanel, onLesson = () => {} }) {
  let activeExampleId = '';
  let pendingDialog = null;

  // 起始練習檔資料懶載入：只重試一次；載入後仍沒有這個編號（例如 unit2-start）就回報找不到，不再重試。
  function requestLoad(id, lazyLoaded = false) {
    const example = getExample(id);
    if (!example && !lazyLoaded && /^((unit\d+|syringe-[a-z]+)-start|servo-plate-[a-z]+)$/.test(id)) return loadUnitStarts().then(() => requestLoad(id, true)), true;
    if (!example && lazyLoaded) { notify('找不到範例'); return false; }
    if (!example || pendingDialog) return false;
    pendingDialog = offerExample({ example, loadExample: load, insertModule: moduleId => { closeExamples(); return insertModule(moduleId); }, onDismiss: () => { pendingDialog = null; } });
    return true;
  }

  function renderLessonCard(example) {
    const card = document.getElementById('exampleLessonCard');
    if (!card) return;
    // 翻斗使用共用驅動／組立 UI；短教學由學習目錄開啟，不常駐遮住畫布。
    if (example?.id === 'tipping-bucket') { card.dataset.lessonVisible = 'false'; card.style.display = 'none'; return; }
    if (!example) { activeExampleId = ''; card.dataset.lessonVisible = 'false'; if (!card.classList?.contains('workflow-active')) card.style.display = 'none'; return; }
    const lesson = getExampleLesson(example.id);
    const group = EXAMPLE_GROUPS.find(item => item.id === lesson.group);
    card.dataset.lessonVisible = 'true';
    if (Number(example.snapshot?.params?.gripperWorkflow) !== 1) card.style.display = '';
    const fields = {
      exampleLessonTitle: example.title,
      exampleLessonMeta: [lesson.level, group?.label].filter(Boolean).join(' · '),
      exampleLessonUse: lesson.use || example.note || '',
      exampleLessonLearn: lesson.learn || ''
    };
    Object.entries(fields).forEach(([id, value]) => { const element = document.getElementById(id); if (element) element.textContent = value; });
    const tasks = document.getElementById('exampleLessonTasks');
    if (tasks) {
      tasks.textContent = '';
      (lesson.try || []).forEach(task => { const item = document.createElement('li'); item.textContent = task; tasks.appendChild(item); });
    }
  }

  function load(id) {
    const example = getExample(id);
    if (!example) return false;
    const snapshot = normalizeSnapshot(example.snapshot);
    if (!snapshot) { notify('⚠️ 範例格式不正確'); return false; }
    applySnapshot(snapshot, { source: 'example' });
    activeExampleId = example.id;
    onLesson(example);
    if (Number(snapshot.params?.gripperWorkflow) === 1) {
      const card = document.getElementById('exampleLessonCard');
      if (card) card.dataset.lessonVisible = 'false';
    } else renderLessonCard(example);
    notify('📘 已載入：' + example.title);
    closeExamples();
    if (isMobile()) showBuildPanel();
    return true;
  }

  function snapshotApplied(snapshot, source) {
    if (source === 'undo') return;
    onLesson(null);
    if (Number(snapshot?.params?.gripperWorkflow) === 1) {
      activeExampleId = 'gear-gripper';
      const card = document.getElementById('exampleLessonCard');
      if (card) card.dataset.lessonVisible = 'false';
      return;
    }
    activeExampleId = '';
    renderLessonCard(null);
  }

  // 範例清單（專案 → 範例…）：目錄資料只在需要時載入；桌機與手機同一份。
  async function populate() {
    const list = document.getElementById('exampleList');
    if (!list) return;
    const { renderExampleCatalog } = await import('./example-catalog.js');
    renderExampleCatalog(list, BLOCK_EXAMPLES, requestLoad);
  }

  function restoreLesson(id) {
    const example = getExample(id);
    activeExampleId = example?.id || '';
    renderLessonCard(example);
    onLesson(example || null);
  }

  // 起始練習檔資料第一次開「範例」才載入，載入後補上清單。
  const openExamples = async () => {
    document.getElementById('examplesDialog').showModal();
    await loadUnitStarts();
    await populate();
  };

  const isPractice = id => !!id && isPracticeLesson(getExampleLesson(id));

  return { populate, openExamples, isPractice, load, requestLoad, renderLessonCard, snapshotApplied, restoreLesson, get activeExampleId() { return activeExampleId; } };
}
