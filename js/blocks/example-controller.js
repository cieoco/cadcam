/**
 * blocks / example-controller
 *
 * 課堂範例選單、教學卡與 snapshot 載入流程。
 */

import { BLOCK_EXAMPLES, EXAMPLE_GROUPS, getExample, getExampleLesson } from './examples.js';
import { normalizeSnapshot } from './schema.js';

export function createExampleController({ applySnapshot, notify, closeMobileMenu, isMobile, showBuildPanel }) {
  let activeExampleId = '';

  function renderLessonCard(example) {
    const card = document.getElementById('exampleLessonCard');
    if (!card) return;
    if (!example) { card.style.display = 'none'; return; }
    const lesson = getExampleLesson(example.id);
    const group = EXAMPLE_GROUPS.find(item => item.id === lesson.group);
    card.style.display = '';
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
    const select = document.getElementById('exampleSelect');
    const example = getExample(id || select?.value);
    if (!example) return false;
    const snapshot = normalizeSnapshot(example.snapshot);
    if (!snapshot) { notify('⚠️ 範例格式不正確'); return false; }
    applySnapshot(snapshot);
    activeExampleId = example.id;
    renderLessonCard(example);
    notify('📘 已載入：' + example.title);
    if (select) select.value = '';
    closeMobileMenu();
    if (isMobile()) showBuildPanel();
    return true;
  }

  function populate() {
    const select = document.getElementById('exampleSelect');
    const mobileList = document.getElementById('mobileExampleList');
    const groupById = Object.fromEntries(EXAMPLE_GROUPS.map(group => [group.id, group]));
    const desktopGroups = {};
    if (select) EXAMPLE_GROUPS.forEach(group => {
      const optionGroup = document.createElement('optgroup'); optionGroup.label = group.label;
      desktopGroups[group.id] = optionGroup; select.appendChild(optionGroup);
    });
    BLOCK_EXAMPLES.forEach(example => {
      const lesson = getExampleLesson(example.id);
      const groupId = groupById[lesson.group] ? lesson.group : 'challenge';
      if (select) {
        const option = document.createElement('option'); option.value = example.id;
        option.textContent = `${lesson.level || '探索'}｜${example.title}`; option.title = lesson.use || example.note || '';
        (desktopGroups[groupId] || select).appendChild(option);
      }
      if (mobileList) {
        let section = mobileList.querySelector(`[data-example-group="${groupId}"]`);
        if (!section) {
          section = document.createElement('div'); section.className = 'mobile-example-section'; section.dataset.exampleGroup = groupId;
          const title = document.createElement('div'); title.className = 'mobile-example-group-title'; title.textContent = groupById[groupId]?.label || '挑戰';
          section.appendChild(title); mobileList.appendChild(section);
        }
        const button = document.createElement('button'); button.type = 'button'; button.className = 'mobile-example-btn'; button.textContent = example.title;
        button.title = lesson.use || example.note || ''; button.addEventListener('click', () => load(example.id)); section.appendChild(button);
      }
    });
    renderLessonCard(null);
  }

  return { populate, load, renderLessonCard, get activeExampleId() { return activeExampleId; } };
}
