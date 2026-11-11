/**
 * blocks / hole-owner  (pack O3-D of docs/SDD-OPERATION-PIPELINE.md)
 *
 * 選到孔／端點時，標明「這是誰的孔」：接點面板標題改成白話名稱（「孔格桿件」第3孔；共用接點＝接點（2 個零件共用））並列出共用的零件，
 * 圖上用既有的閃示畫法標出所屬零件（共用時全部標出）。按需載入；標籤沿用手機選單的 nodeLabel，不另寫一套。
 */
import {nodeLabel} from './overlap-picker.js';
import {ownersOfPoint,distinctLabels} from './selection-target.js';

const flashOwners = ids => import('./integrity-hints.js').then(m => m.run('flash', {far: ids, canon: []})).catch(() => {});

/** fresh＝剛換選到這個點（才閃示；同一點重畫面板不重複閃）。回傳 {label, owners} 供測試。 */
export function showHoleOwner(S, editor, fresh, {flash = flashOwners} = {}) {
  const id = S.selectedNodeId;
  let label = '', owners = [];
  try { owners = ownersOfPoint(S.comps, S.modules || [], id); label = owners.length ? nodeLabel(S.comps, id) : ''; } catch (_) { return null; }
  const title = editor.querySelector?.('.re-title');
  if (title) {
    title.textContent = label || '接點';
    title.title = owners.length > 1 ? distinctLabels(owners, S.topo.params).join('、') : '';
    title.dataset.holeOwner = owners.map(c => c.id).join(' ');
  }
  if (fresh && owners.length) flash(owners.map(c => c.id));
  return {label, owners};
}
