/**
 * blocks / example-controller
 *
 * 課堂範例選單、教學卡與 snapshot 載入流程。
 */

import { BLOCK_EXAMPLES, EXAMPLE_GROUPS, getExample, getExampleLesson } from './examples.js?v=20261005_parallel';
import { normalizeSnapshot } from './schema.js';
import { offerExample } from './example-entry.js';

export function createExampleController({ applySnapshot, insertModule, notify, closeExamples = () => {}, isMobile, showBuildPanel, onLesson = () => {} }) {
  let activeExampleId = '';
  let pendingDialog = null;

  function requestLoad(id) {
    const example = getExample(id);
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

  // 範例清單（專案 → 範例…）：電腦與手機同一份，依分類列出。
  function populate() {
    const list = document.getElementById('exampleList');
    const groupById = Object.fromEntries(EXAMPLE_GROUPS.map(group => [group.id, group]));
    BLOCK_EXAMPLES.forEach(example => {
      const lesson = getExampleLesson(example.id);
      const groupId = groupById[lesson.group] ? lesson.group : 'challenge';
      if (list) {
        let section = list.querySelector(`[data-example-group="${groupId}"]`);
        if (!section) {
          section = document.createElement('div'); section.className = 'example-section'; section.dataset.exampleGroup = groupId;
          const title = document.createElement('div'); title.className = 'example-group-title'; title.textContent = groupById[groupId]?.label || '挑戰';
          section.appendChild(title); list.appendChild(section);
        }
        const button = document.createElement('button'); button.type = 'button'; button.className = 'example-btn'; button.textContent = `${lesson.level || '探索'}｜${example.title}`;
        button.title = lesson.use || example.note || ''; button.addEventListener('click', () => requestLoad(example.id)); section.appendChild(button);
      }
    });
    renderLessonCard(null);
  }

  function restoreLesson(id) {
    const example = getExample(id);
    activeExampleId = example?.id || '';
    renderLessonCard(example);
    onLesson(example || null);
  }

  return { populate, load, requestLoad, renderLessonCard, snapshotApplied, restoreLesson, get activeExampleId() { return activeExampleId; } };
}
