/** 教材深連結只選範例，不承載課程或作品進度。先還原原作品，確認後才替換。 */
import { BUILTIN_MODULES } from './module-ops.js';
import { getExample, getExampleLesson } from './examples.js?v=20261005_unit2';

export function requestedExample(href) {
  const url = new URL(href);
  // 分享作品優先，避免同一網址有兩個互相衝突的載入來源。
  if (url.hash) return null;
  return getExample(url.searchParams.get('example'));
}

export function offerExampleFromUrl({ loadExample, insertModule, notify = () => {},
  location = window.location, history = window.history, document = window.document } = {}) {
  const url = new URL(location.href);
  if (!url.searchParams.has('example') || url.hash) return;
  const example = requestedExample(url.href);
  const consume = () => {
    url.searchParams.delete('example');
    history.replaceState(history.state, '', url.href);
  };
  if (!example) { consume(); notify('找不到指定範例，已保留目前作品。'); return; }
  return offerExample({ example, loadExample, insertModule, onDismiss: consume, document });
}

/** 選單與深連結共用同一個整份作品載入入口；確認前不修改作品。 */
export function offerExample({ example, loadExample, insertModule, onDismiss = () => {}, document = window.document }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'example-entry-dialog';
  dialog.setAttribute('aria-label', '載入機構範例');
  const heading = document.createElement('h2'); heading.textContent = example.title;
  const message = document.createElement('p');
  message.textContent = '載入會替換整份作品（所有設計分頁與組立），可按復原找回。若要保留作品，請取消後查看「新增 → 現成組件」的可用機構；並非所有範例都有內建模組。';
  const use = document.createElement('p');
  const lesson = getExampleLesson(example.id);
  use.textContent = lesson.use || example.note || '';
  const scope = document.createElement('p');
  scope.textContent = example.adjustmentNote || (example.id === 'parallel-fourbar'
    ? '可調：活動臂長、起終高度。工具架保持姿態，但沿圓弧移動；承載與實物尚未驗證。'
    : example.id === 'gear-gripper'
      ? '可調：目標物寬度、開口餘量。雙齒輪帶動兩爪轉動，並非平行夾爪；接觸與夾持力尚未驗證。'
      : `${lesson.try?.[0] ? `先試：${lesson.try[0]}。` : '載入後可修改尺寸與試播。'}模擬結果不代表可直接加工或實物已驗證。`);
  const accept = document.createElement('button'); accept.type = 'button'; accept.textContent = '載入此範例';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = '保留目前作品';
  const dismiss = () => { onDismiss(); dialog.close(); dialog.remove(); };
  accept.onclick = () => { if (loadExample(example.id) !== false) dismiss(); };
  cancel.onclick = dismiss;
  dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
  dialog.append(heading, use, scope, message);
  const module = typeof insertModule === 'function' && BUILTIN_MODULES.find(m => m.source === example.id);
  if (module) {
    message.textContent = '「載入此範例」會替換整份作品（所有設計分頁與組立），可按復原找回；「加入目前作品」則保留作品並加入下列模組。';
    const note = document.createElement('p');
    note.textContent = `加入「${module.name}」：保留現有作品，沿用模組尺寸與接口；不帶入範例任務設定。${module.variantNote || module.description}`;
    const add = document.createElement('button'); add.type = 'button'; add.textContent = '＋ 加入目前作品';
    add.onclick = () => { if (insertModule(module.id) !== false) dismiss(); };
    dialog.append(note, add);
  }
  dialog.append(accept, cancel);
  document.body.append(dialog); dialog.showModal(); cancel.focus();
  return dialog;
}
