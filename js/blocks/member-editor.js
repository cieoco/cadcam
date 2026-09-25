/** 共用剛性桿件尺寸列：選取 → 預檢整筆修改 → 一次復原 → 重算。 */
import { S } from './state.js';
import { memberDimensions, memberDimensionValue, planMemberDimension, mirroredJaw, dimensionLock } from './member-dimensions.js';
import { MATERIALS, memberStock, planMemberStock } from './member-stock.js';

export function createMemberEditor({ pause, pushUndo, rebuild, draw, reshapeTriangle, updatePointCoordsById, notify, holeDiameter = () => 12.96 }) {
  let mirror = true;
  let tipDraft = null;
  const el = id => document.getElementById(id);
  const selected = () => S.comps.find(c => c.id === (S.selectedTriangleId || S.selectedLinkId));
  const displayComp = comp => comp && tipDraft?.ids.includes(comp.id) ? { ...comp, jawTipLength: tipDraft.value } : comp;
  const dimensionId = () => S.triSide || 'g';
  function sync() {
    const comp = selected();
    if (tipDraft && tipDraft.selectedId !== comp?.id) tipDraft = null;
    const dimensions = memberDimensions(comp);
    const active = dimensions.length > 0;
    const input = el('memberDimensionInput'), hint = el('memberDimensionHint');
    if (!input) return;
    input.style.display = active ? '' : 'none';
    el('lenValue').style.display = active ? 'none' : '';
    hint.style.display = active ? '' : 'none';
    el('memberMirrorLabel').style.display = 'none';
    const material = el('memberMaterial');
    if (material) {
      material.parentElement.style.display = active ? '' : 'none';
      material.replaceChildren(...MATERIALS.map(item => {
        const option = document.createElement('option'); option.value = item.id; option.textContent = item.label; return option;
      }));
      material.value = memberStock(comp).material;
    }
    ['lenMinusBtn', 'lenPlusBtn'].forEach(key => { el(key).disabled = false; });
    if (!active) return;
    if (!dimensions.some(d => d.id === dimensionId())) S.triSide = 'g';
    const id = dimensionId();
    const dimension = dimensions.find(d => d.id === id);
    const selector = el('triSideSelect');
    selector.replaceChildren(...dimensions.map(d => {
      const option = document.createElement('option'); option.value = d.id; option.textContent = d.label;
      return option;
    }));
    selector.value = id;
    selector.style.display = '';
    selector.title = '選擇孔距或外形尺寸；畫布會標示對應位置';
    input.value = Number(memberDimensionValue(displayComp(comp), S.topo.params, id).toFixed(1));
    input.min = String(dimension.min ?? 8);
    input.max = String(dimension.max ?? (id === 'tip' ? 160 : 2000));
    input.setAttribute('aria-label', dimension.label);
    const lock = dimensionLock(comp, S.comps, id);
    input.disabled = Boolean(lock);
    ['lenMinusBtn', 'lenPlusBtn'].forEach(key => { el(key).disabled = Boolean(lock); });
    el('lenMinusBtn').title = `${dimension.label} 減少 ${dimension.step ?? 8} mm`;
    el('lenPlusBtn').title = `${dimension.label} 增加 ${dimension.step ?? 8} mm`;
    hint.textContent = lock || (id === 'width' ? '板寬控制桿身寬度／板邊留量，不移動連接孔；馬達安裝處可能較寬。'
      : id === 'thickness' ? '板厚用於 3D 疊放與製作記錄；材料僅為註記，尚未驗證強度。'
      : id === 'tip'
      ? '外形尺寸：只改爪端，不移動連接孔；開口會重新計算。'
      : '連接孔距：改變剛性零件的幾何；折彎處不會自行轉動。');
    if (mirroredJaw(comp, S.comps, S.topo.params)) {
      el('memberMirrorLabel').style.display = '';
      el('memberMirror').checked = mirror;
    }
    el('lenTitle').textContent = comp.type === 'bar' ? '連桿' : comp.shape === 'jaw' ? '夾爪板' : '桿件／板件';
  }
  function selectDimension(id) {
    if (!memberDimensions(selected()).some(d => d.id === id)) return;
    S.triSide = id;
    pause(); draw();
  }
  function setValue(raw) {
    const comp = selected();
    if (!comp) return;
    const id = dimensionId();
    const dimension = memberDimensions(comp).find(d => d.id === id);
    if (dimension?.stockKey) { setStock(dimension.stockKey, raw); return; }
    const lock = dimensionLock(comp, S.comps, id);
    if (lock) { notify(lock); sync(); return; }
    const partner = mirror && mirroredJaw(comp, S.comps, S.topo.params);
    const targets = partner ? [comp, partner] : [comp];
    const plans = targets.map(c => planMemberDimension(c, S.topo.params, id, raw));
    const failure = plans.find(plan => !plan.ok);
    if (failure) { notify(failure.message); sync(); return; }
    if (targets.every(c => Math.abs(memberDimensionValue(c, S.topo.params, id) - plans[0].value) < 0.001)) { sync(); return; }
    pause(); pushUndo();
    targets.forEach((c, index) => {
      Object.assign(S.topo.params, plans[index].params);
      Object.assign(c, plans[index].properties);
      if (id === 'tip') return;
      if (c.type === 'triangle') reshapeTriangle(c);
      else {
        const dx = c.p2.x - c.p1.x, dy = c.p2.y - c.p1.y, length = Math.hypot(dx, dy) || 1;
        updatePointCoordsById(c.p2.id, c.p1.x + (dx || (dy ? 0 : 1)) / length * plans[index].value, c.p1.y + dy / length * plans[index].value);
      }
    });
    rebuild(); draw();
  }
  function change(delta) {
    const comp = selected();
    const dimension = memberDimensions(comp).find(d => d.id === dimensionId());
    if (comp) setValue(memberDimensionValue(comp, S.topo.params, dimensionId()) + (dimension?.step ? Math.sign(delta) * dimension.step : delta));
  }
  function setStock(key, raw) {
    const comp = selected();
    if (!comp || !['bar', 'triangle'].includes(comp.type)) return;
    const partner = mirror && mirroredJaw(comp, S.comps, S.topo.params);
    const targets = partner ? [comp, partner] : [comp];
    const plans = targets.map(c => planMemberStock(c, key, raw, { holeDiameterMm: holeDiameter(c) }));
    const failure = plans.find(plan => !plan.ok);
    if (failure) { notify(failure.message); sync(); return; }
    if (targets.every((c, i) => JSON.stringify(memberStock(c)) === JSON.stringify(plans[i].stock))) { sync(); return; }
    pause(); pushUndo();
    targets.forEach((c, i) => { c.stock = plans[i].stock; });
    rebuild(); draw();
  }
  function beginTipPreview() {
    const comp = selected();
    if (comp?.shape !== 'jaw') return false;
    pause(); S.triSide = 'tip';
    const partner = mirror && mirroredJaw(comp, S.comps, S.topo.params);
    tipDraft = { selectedId: comp.id, ids: [comp.id, ...(partner ? [partner.id] : [])], value: memberDimensionValue(comp, S.topo.params, 'tip') };
    draw(); return true;
  }
  function previewTip(value) {
    if (!tipDraft || selected()?.id !== tipDraft.selectedId) return;
    const plan = planMemberDimension(selected(), S.topo.params, 'tip', value);
    if (!plan.ok) return;
    tipDraft.value = plan.value; draw();
  }
  function finishTipPreview(cancel = false) {
    const draft = tipDraft; tipDraft = null;
    if (!cancel && draft && selected()?.id === draft.selectedId) { S.triSide = 'tip'; setValue(draft.value); }
    else draw();
  }
  return { sync, selected, displayComp, selectDimension, setValue, change, beginTipPreview, previewTip, finishTipPreview,
    setMaterial: raw => setStock('material', raw), setMirror(value) { mirror = Boolean(value); sync(); } };
}
