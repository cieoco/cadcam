/** 共用剛性桿件尺寸列：選取 → 預檢整筆修改 → 一次復原 → 重算。 */
import { S } from './state.js';
import { memberDimensions, memberDimensionValue, planMemberDimension, mirroredJaw, dimensionLock } from './member-dimensions.js';

export function createMemberEditor({ pause, pushUndo, rebuild, draw, reshapeTriangle, updatePointCoordsById, notify }) {
  let mirror = true;
  const el = id => document.getElementById(id);
  const selected = () => S.comps.find(c => c.id === (S.selectedTriangleId || S.selectedLinkId));
  const dimensionId = () => S.selectedTriangleId ? S.triSide : 'g';
  function sync() {
    const comp = selected();
    const dimensions = memberDimensions(comp);
    const active = dimensions.length > 0;
    const input = el('memberDimensionInput'), hint = el('memberDimensionHint');
    if (!input) return;
    input.style.display = active ? '' : 'none';
    el('lenValue').style.display = active ? 'none' : '';
    hint.style.display = active ? '' : 'none';
    el('memberMirrorLabel').style.display = 'none';
    ['lenMinusBtn', 'lenPlusBtn'].forEach(key => { el(key).disabled = false; });
    if (!active) return;
    if (comp.type === 'bar' || !dimensions.some(d => d.id === dimensionId())) S.triSide = 'g';
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
    input.value = Number(memberDimensionValue(comp, S.topo.params, id).toFixed(1));
    input.max = id === 'tip' ? '160' : '2000';
    input.setAttribute('aria-label', dimension.label);
    const lock = dimensionLock(comp, S.comps, id);
    input.disabled = Boolean(lock);
    ['lenMinusBtn', 'lenPlusBtn'].forEach(key => { el(key).disabled = Boolean(lock); });
    el('lenMinusBtn').title = `${dimension.label} 減少 8 mm`;
    el('lenPlusBtn').title = `${dimension.label} 增加 8 mm`;
    hint.textContent = lock || (id === 'tip'
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
    if (comp) setValue(memberDimensionValue(comp, S.topo.params, dimensionId()) + delta);
  }
  return { sync, selected, selectDimension, setValue, change, setMirror(value) { mirror = Boolean(value); sync(); } };
}
