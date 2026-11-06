import {fusionRoot} from '../core/bar-fusion.js';
import {ownedParamKeys} from './part-types.js';
import {detachDeletedAttachments} from './detached-attachments.js';
export function deleteSelectedPart({S,transient,deleteGearChain,pushUndo,pause,closeMobileEditPanel,setSliderDetailRows,rebuild,draw,points}) {
  if(fusionRoot(S.comps,S.selectedLinkId)){transient('請先解除合成，再刪除其中的連桿。');return;}
  if(S.comps.some(c=>c.id===S.selectedTriangleId && c.fusedWith)){transient('請先解除合成，再刪除板件');return;}
  if (S.selectedGearId) { deleteGearChain(S.selectedGearId); return; }
  const id = S.selectedLinkId || S.selectedTriangleId || S.selectedSliderId;
  if (!id) return;
  const comp = S.comps.find(c => c.id === id);
  if (!comp) return;
  if(comp.boxPanel){transient('這是盒體的配對板件，請整組管理；尺寸從「卡榫盒子」修改。');return;}
  pushUndo();
  pause();
  // 刪除前先清掉這個元件佔用的 topo.params（型別表宣告它擁有哪些參數）
  S.comps = detachDeletedAttachments(S.comps,new Set([id]),S.topo.params,points);
  ownedParamKeys(comp).forEach(k => delete S.topo.params[k]);
  S.comps = S.comps.filter(c => c.id !== id);
  S.selectedLinkId = null;
  S.selectedTriangleId = null;
  S.selectedSliderId = null;
  S.selectedNodeId = null;
  closeMobileEditPanel();
  document.getElementById('lenEditor').style.display = 'none';
  document.getElementById('roleEditor').style.display = 'none';
  document.getElementById('servoEditor').style.display = 'none';
  document.getElementById('strokeEditor').style.display = 'none';
  document.getElementById('sliderBaseBtn').style.display = 'none';
  document.getElementById('linkToRailBtn').style.display = 'none';
  setSliderDetailRows(false);
  rebuild(); draw();
}
