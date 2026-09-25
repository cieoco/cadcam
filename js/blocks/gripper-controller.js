/**
 * R1 對稱雙齒輪夾爪任務卡。所有求解交由純 planner，這裡只管理表單、姿態與下載。
 */
import { planGripper, gripperBuildRecord } from './gripper-workflow.js?v=20260925_r1b';
import { downloadGripperRecord, gripperRecordLink } from './gripper-download.js?v=20260925_r1b2';

export function createGripperController({ getComps, getParams, rebuild, draw, pause, pushUndo, setPose, fitView, getSnapshot, isEditing }) {
  let plan = { ok: false, message: '尚未載入夾爪任務。' };
  let active = false;
  let draft = {};
  let referenceCenter = null;

  const el = id => document.getElementById(id);
  const taskEnabled = params => Number(params?.gripperWorkflow) === 1;

  function render() {
    const card = el('exampleLessonCard');
    const lesson = el('exampleLessonContent');
    const workflow = el('gripperWorkflowContent');
    if (!card || !lesson || !workflow) return;
    el('workRangeCard')?.parentElement?.classList.toggle('gripper-workflow-active', active);
    const editing = Boolean(isEditing?.());
    const canvas = el('workRangeCard')?.parentElement;
    canvas?.classList.toggle('gripper-card-visible', active && !editing);
    card.classList.toggle('workflow-active', active);
    card.classList.toggle('workflow-hidden', active && editing);
    lesson.style.display = active ? 'none' : '';
    workflow.style.display = active ? '' : 'none';
    card.style.display = active ? (editing ? 'none' : '') : card.dataset.lessonVisible === 'true' ? '' : 'none';
    if (!active) return;

    const params = getParams() || {};
    const width = el('gripperObjectWidth');
    const clearance = el('gripperClearance');
    if (width && document.activeElement !== width) width.value = draft.gripperObjectWidth ?? params.gripperObjectWidth ?? 50;
    if (clearance && document.activeElement !== clearance) clearance.value = draft.gripperClearance ?? params.gripperClearance ?? 10;
    const status = el('gripperPlanStatus');
    const gap = el('gripperEstimatedGap');
    if (status) {
      status.textContent = plan.ok ? '整段開合可求解，淨距變化連續。' : plan.message;
      status.dataset.state = plan.ok ? 'ok' : 'error';
    }
    if (gap) gap.textContent = plan.ok ? plan.message : '預估淨開口：—';
    ['gripperOpenBtn', 'gripperCloseBtn', 'gripperDownloadBtn'].forEach(id => { const button = el(id); if (button) { button.disabled = !plan.ok; button.setAttribute?.('aria-disabled', String(!plan.ok)); } });
    // 手機沿用同一卡片，但把畫布排在卡片下方，不能遮住機構與可選孔位。
    canvas?.style.setProperty('--gripper-card-space', `${(card.offsetHeight || 0) + 16}px`);
  }

  function recompute() {
    const params = getParams() || {};
    active = taskEnabled(params);
    if (active) {
      const requested = { ...params, ...draft };
      plan = planGripper(getComps() || [], requested);
      // 不可達的尺寸仍能拖回；結構不符則不顯示似乎已驗證的任務物件。
      const referencePlan = plan.ok ? plan : planGripper(getComps() || [], { ...params, gripperObjectWidth: 50, gripperClearance: 10 });
      referenceCenter = referencePlan.ok ? referencePlan.closed.center : null;
    } else {
      plan = { ok: false, message: '尚未載入夾爪任務。' };
      draft = {};
      referenceCenter = null;
    }
    render();
    return plan;
  }

  function sync() {
    draft = {};
    return recompute();
  }

  function updateInput(key, value) {
    if (!active) return;
    pause();
    draft[key] = value === '' ? '' : Number(value);
    recompute();
    if (plan.ok) setPose(plan.open.theta, plan.motor); else draw();
  }

  function commitInput(key, value) {
    if (!active) return;
    const numeric = Number(value);
    if (value !== '' && Number.isFinite(numeric)) {
      if (Number(getParams()[key]) !== numeric) {
        pushUndo();
        getParams()[key] = numeric;
      }
      draft[key] = numeric;
      rebuild();
      if (plan.ok) setPose(plan.open.theta, plan.motor);
      draw();
    }
  }

  function moveTo(which) {
    if (!plan.ok) return;
    pause();
    setPose(which === 'open' ? plan.open.theta : plan.closed.theta, plan.motor);
    fitView?.();
  }

  function download(event) {
    if (!plan.ok) { event?.preventDefault(); return; }
    // 包含尚在編輯的有效數值，記錄數值與內嵌 snapshot 必須相同。
    const snapshot = getSnapshot();
    snapshot.params = { ...snapshot.params, gripperObjectWidth: plan.width, gripperClearance: plan.clearance };
    const text = gripperBuildRecord(plan, snapshot);
    const link = el('gripperDownloadBtn');
    if (link?.tagName === 'A') {
      const file = gripperRecordLink(text, plan.width);
      link.href = file.href;
      link.download = file.filename;
    } else downloadGripperRecord(text, plan.width);
  }

  function isActive() { return active; }
  function currentPlan() { return plan; }
  function range() { return active && plan.ok ? plan.range : null; }
  function moveToOpen() { moveTo('open'); }
  function reference() {
    const width = Number(draft.gripperObjectWidth ?? getParams()?.gripperObjectWidth);
    const clearance = Number(draft.gripperClearance ?? getParams()?.gripperClearance);
    return active && referenceCenter && width >= 10 && width <= 300 && Number.isFinite(clearance)
      ? { width, clearance, center: referenceCenter } : null;
  }
  const previewWidth = value => updateInput('gripperObjectWidth', String(value));
  const commitWidth = value => { pause(); commitInput('gripperObjectWidth', String(value)); };
  const cancelPreview = () => { sync(); if (plan.ok) setPose(plan.open.theta, plan.motor); else draw(); };

  el('gripperObjectWidth')?.addEventListener('input', event => updateInput('gripperObjectWidth', event.target.value));
  el('gripperObjectWidth')?.addEventListener('change', event => commitInput('gripperObjectWidth', event.target.value));
  el('gripperClearance')?.addEventListener('input', event => updateInput('gripperClearance', event.target.value));
  el('gripperClearance')?.addEventListener('change', event => commitInput('gripperClearance', event.target.value));
  el('gripperOpenBtn')?.addEventListener('click', () => moveTo('open'));
  el('gripperCloseBtn')?.addEventListener('click', () => moveTo('closed'));
  el('gripperDownloadBtn')?.addEventListener('click', download);

  return { sync, recompute, isActive, currentPlan, range, moveToOpen, syncVisibility: render, reference, previewWidth, commitWidth, cancelPreview };
}
