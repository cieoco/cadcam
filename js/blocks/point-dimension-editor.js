import {S} from './state.js';
import {pointDimensions} from './point-dimensions.js';
import {memberDimensionValue} from './member-dimensions.js';
import {sheetMode,sheetState,setSheet} from './mobile-workspace.js';
import {editableNumber,showNumber} from './numeric-input.js';

let nodeId=null,choice='';
/** Selected holes reuse member dimensions and the same setter as the member panel. */
export function pointDimensionEditor({member,redraw,comps,openEditor}){
  const host=document.getElementById('roleEditor');if(!host)return null;
  let row=document.getElementById('pointDimensionEditor');
  if(!row){
    row=document.createElement('div');row.id='pointDimensionEditor';
    row.style.cssText='flex:1 1 100%;min-width:0;display:grid;gap:6px';
    row.innerHTML='<div data-choices role="group" aria-label="選擇要改的孔距" style="display:flex;flex-wrap:wrap;gap:6px"></div><label data-value>孔距 <span data-number></span> mm</label><small data-hint></small>';
    host.insertBefore(row,host.querySelector('.node-role-row'));
  }
  const active=S.mode==='design'&&!S.mateMode&&S.selectedNodeId;
  const choices=active?pointDimensions(comps,S.selectedNodeId):[];
  row.hidden=!choices.length;row.style.display=choices.length?'grid':'none';
  if(nodeId!==S.selectedNodeId){nodeId=S.selectedNodeId;choice='';}
  if(!choices.some(d=>d.key===choice))choice=choices.length===1?choices[0].key:'';
  if(!choices.length)return null;
  const buttons=row.querySelector('[data-choices]'),hint=row.querySelector('[data-hint]');
  const choose=key=>{choice=key;openEditor();redraw();};
  // Keep buttons stable during redraw, so keyboard focus and touch clicks survive.
  if(buttons.dataset.keys!==JSON.stringify(choices.map(d=>d.key))){buttons.replaceChildren();buttons.dataset.keys=JSON.stringify(choices.map(d=>d.key));}
  choices.forEach((d,i)=>{
    let button=buttons.children[i];
    if(!button){button=document.createElement('button');button.type='button';button.style.cssText='min-height:44px;padding:6px 8px;white-space:normal;text-align:left;flex:1 1 120px;min-width:0';buttons.append(button);}
    button.dataset.dimensionChoice=d.key;button.textContent=`${i+1} · ${d.optionLabel}`;
    button.setAttribute('aria-pressed',String(d.key===choice));button.style.background=d.key===choice?'#dff2f6':'';
    button.onclick=()=>choose(d.key);
  });
  const dimension=choices.find(d=>d.key===choice);
  row.querySelector('[data-value]').hidden=!dimension;
  const selection={choices,dimension,choose};
  if(!dimension){hint.textContent='點圖上的編號，或選這裡對應的零件。';return selection;}
  const comp=comps.find(c=>c.id===dimension.componentId),value=memberDimensionValue(comp,S.topo.params,dimension.id);
  hint.textContent=dimension.lock||'拖尺寸把手改孔距，或輸入數字；端孔保留原接點操作。';
  const selectedNode=nodeId,key=choice;
  const commit=(v,exact)=>{if(S.selectedNodeId===selectedNode&&choice===key){member.setDimensionValue(comp.id,dimension.id,v,{exact});showNumber(input,memberDimensionValue(comp,S.topo.params,dimension.id));redraw();}};
  const input=editableNumber(row.querySelector('[data-number]'),value,commit,{label:'所選零件孔距（mm）',min:8,max:2000,disabled:!!dimension.lock});
  const activate=()=>{openEditor();if(sheetMode()&&sheetState()==='collapsed')setSheet('half');input.focus();input.select();};
  return {...selection,comp,value,input,commit,activate};
}
