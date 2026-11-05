import {S} from './state.js';
import {pointDimensions} from './point-dimensions.js';
import {memberDimensionValue} from './member-dimensions.js';
import {sheetMode,sheetState,setSheet} from './mobile-workspace.js';

let nodeId=null,choice='';
/** Selected holes reuse member dimensions and the same setter as the member panel. */
export function pointDimensionEditor({member,redraw,comps}){
  const host=document.getElementById('roleEditor');if(!host)return null;
  let row=document.getElementById('pointDimensionEditor');
  if(!row){
    row=document.createElement('div');row.id='pointDimensionEditor';
    row.style.cssText='flex:1 1 100%;min-width:0;display:grid;gap:6px';
    row.innerHTML='<label>修改零件孔距 <select aria-label="要修改的零件孔距" style="width:100%;min-width:0;min-height:44px;font-size:16px"></select></label><label data-value>孔距 <input aria-label="所選零件孔距（mm）" type="number" min="8" max="2000" step="0.1" style="width:96px;min-height:44px;font-size:16px"> mm</label><small data-hint></small>';
    host.insertBefore(row,host.querySelector('.node-role-row'));
  }
  const active=S.mode==='design'&&!S.mateMode&&S.selectedNodeId;
  const choices=active?pointDimensions(comps,S.selectedNodeId):[];
  row.hidden=!choices.length;row.style.display=choices.length?'grid':'none';
  if(nodeId!==S.selectedNodeId){nodeId=S.selectedNodeId;choice='';}
  if(!choices.some(d=>d.key===choice))choice=choices.length===1?choices[0].key:'';
  if(!choices.length)return null;
  const select=row.querySelector('select'),input=row.querySelector('input'),hint=row.querySelector('[data-hint]');
  select.replaceChildren();
  if(choices.length>1){const option=document.createElement('option');option.value='';option.textContent='選擇要修改的零件';select.append(option);}
  for(const d of choices){const option=document.createElement('option');option.value=d.key;option.textContent=d.optionLabel;select.append(option);}
  select.value=choice;select.onchange=()=>{choice=select.value;redraw();};
  select.parentElement.hidden=choices.length===1;
  const dimension=choices.find(d=>d.key===choice);
  row.querySelector('[data-value]').hidden=!dimension;
  if(!dimension){hint.textContent='此接點連著多個零件，先選要改哪一片。';return null;}
  const comp=comps.find(c=>c.id===dimension.componentId),value=memberDimensionValue(comp,S.topo.params,dimension.id);
  input.value=value;input.disabled=!!dimension.lock;
  hint.textContent=dimension.lock||'拖圖上孔距把手或輸入數字；保留其他零件孔距。';
  const selectedNode=nodeId,key=choice;
  const commit=v=>{if(S.selectedNodeId===selectedNode&&choice===key){member.setDimensionValue(comp.id,dimension.id,v);redraw();}};
  input.onchange=()=>commit(input.value);
  const activate=()=>{if(sheetMode()&&sheetState()==='collapsed')setSheet('half');input.focus();input.select();};
  return dimension.lock?null:{comp,dimension,value,input,commit,activate};
}
