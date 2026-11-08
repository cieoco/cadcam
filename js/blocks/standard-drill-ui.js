/**
 * blocks / standard-drill-ui
 *
 * 標準孔格件的「開孔」切換（懶載入，由 grid-marks 的選取面板同步呼叫）：
 * 預設只開用到的孔；「全部格孔」給要做成可重複使用套件的學生。只在非預設時存 standardBlank.drill='all'。
 * 判定在 used-holes.js；本檔只把結果接到選取面板，修改沿用 pushUndo → 自動存檔 → 重畫。
 */
import {machinedComps} from './used-holes.js';

const CHOICES = [['used', '只開用到的孔（預設）'], ['all', '全部格孔']];

/** 目前會開的孔數／全部格位數（含桿端與板角的求解點）。 */
export function drillCounts(S, comp) {
  const machined = machinedComps(S.comps, S.modules, S.topo?.params).find(c => c.id === comp.id) || comp;
  const ends = ['p1', 'p2', 'p3'].filter(k => comp[k]).length;
  return { drilled: (machined.holes || []).length + ends - (machined.undrilled || []).length, total: (comp.holes || []).length + ends };
}

export function setStandardDrill(comp, value) {
  if (value === 'all') comp.standardBlank.drill = 'all';
  else delete comp.standardBlank.drill;
}

export function syncDrillSwitch(S, blocks = globalThis.window?.blocks) {
  if (typeof document === 'undefined') return;
  const comp = S.comps.find(c => c.id === (S.selectedTriangleId || S.selectedLinkId));
  const anchor = document.getElementById('standardBlankEdit');
  let row = document.getElementById('standardBlankDrillRow');
  if (!comp?.standardBlank || !anchor) { if (row) row.hidden = true; return; }
  if (!row) {
    row = document.createElement('label');
    row.id = 'standardBlankDrillRow';
    row.append('開孔');
    const select = document.createElement('select');
    select.id = 'standardBlankDrill';
    select.dataset.blankDrill = '';
    select.setAttribute('aria-label', '開孔');
    for (const [value, text] of CHOICES) { const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option); }
    const note = document.createElement('small');
    note.id = 'standardBlankDrillNote';
    row.append(select, note);
  }
  if (anchor.nextElementSibling !== row) anchor.after(row);
  row.hidden = false;
  const select = row.querySelector('select'), note = row.querySelector('small'), { drilled, total } = drillCounts(S, comp);
  select.value = comp.standardBlank.drill === 'all' ? 'all' : 'used';
  note.textContent = ` 目前開 ${drilled}／${total} 孔`;
  select.onchange = () => {
    const target = S.comps.find(c => c.id === comp.id);
    if (!target?.standardBlank || (target.standardBlank.drill === 'all') === (select.value === 'all')) return;
    blocks?.pushUndo?.();
    setStandardDrill(target, select.value);
    blocks?.scheduleAutosave?.();
    blocks?.draw?.();
  };
}
