/** 彎桿／多臂件建立面板（按需載入）：臂數、各臂孔數、夾角按鈕與整數欄位；沿用標準積木的候選、放置與復原。 */
import {makeStandardBlank} from './standard-blank.js';
import {PRESETS_2,PRESETS_3,defaultPanel,panelOptions,angleText,readHoles,readAngle} from './arm-presets.js';
import {sheetMode,setSheet} from './mobile-workspace.js';
import {confirmEditorKey} from './editor-confirm-key.js';

export function openArmBlank({start,update,confirm,cancel}){
 let panel=document.getElementById('standardBlankPanel');
 if(!panel){panel=document.createElement('section');panel.id='standardBlankPanel';document.querySelector('.creation-sections').before(panel);}
 panel.replaceChildren();panel.hidden=false;
 const el=(tag,props={},...kids)=>{const n=document.createElement(tag);Object.assign(n,props);n.append(...kids);return n;};
 const state=defaultPanel(2);let origin={x:0,y:0},problem='';
 panel.append(el('strong',{textContent:'彎桿／多臂件（同平面）'}));
 // 臂數
 const countRow=el('div',{className:'arm-count'});panel.append(countRow);
 const countButtons=[2,3].map(n=>{const b=el('button',{type:'button',className:'tool-btn',textContent:`${n}支臂`});b.dataset.armCount=n;b.onclick=()=>{if(state.count===n)return;const keep=state.holes;Object.assign(state,defaultPanel(n));state.holes=state.holes.map((h,i)=>Number.isInteger(keep[i])&&keep[i]>0?keep[i]:h);problem='';render();push();};countRow.append(b);return b;});
 // 孔數
 const holeBox=el('div',{className:'arm-holes'}),holeInputs=[0,1,2].map(k=>{const input=el('input',{type:'number',min:1,max:64,step:1});input.dataset.armHoles=k;input.setAttribute('aria-label',`第${k+1}臂孔數`);
  input.oninput=()=>{const r=readHoles(input.value,k);if(!r.ok){problem=r.message;report();return;}problem='';state.holes[k]=r.value;push();};
  const label=el('label',{},`第${k+1}臂孔數 `,input);holeBox.append(label);return {input,label};});
 panel.append(holeBox,el('p',{textContent:'孔數不含中心孔；孔距 8 mm。'}));
 // 夾角
 const presetBox=el('div',{className:'arm-presets'}),angleBox=el('div',{className:'arm-angles'}),angleInputs=[1,2].map(k=>{const input=el('input',{type:'number',min:1,max:359,step:1});input.dataset.armAngle=k;input.setAttribute('aria-label',`第${k+1}臂夾角（度）`);
  input.oninput=()=>{const r=readAngle(input.value,k);if(!r.ok){problem=r.message;report();return;}problem='';state.angles[k-1]=r.value;input.placeholder='';push();};
  const label=el('label',{},`第${k+1}臂夾角 `,input,' °');angleBox.append(label);return {input,label};});
 panel.append(el('span',{textContent:'夾角（第1臂為0°）'}),presetBox,angleBox);
 const details=el('details',{},el('summary',{textContent:'位置（mm）'}));panel.append(details);
 const pos=['x','y'].map(key=>{const input=el('input',{type:'number',step:'any',value:0});input.dataset.blankMm='origin'+key.toUpperCase();input.setAttribute('aria-label','位置 '+key.toUpperCase()+' mm');details.append(el('label',{},'位置 '+key.toUpperCase()+' mm ',input));return input;});
 const status=el('p');status.setAttribute('role','status');panel.append(status);
 const actions=el('footer');panel.append(actions);
 const button=(text,click)=>{const b=el('button',{type:'button',className:'tool-btn',textContent:text,onclick:click});actions.append(b);return b;};
 const add=button('放到畫布',()=>{if(add.disabled)return;if(sheetMode())setSheet('collapsed');status.textContent='點畫布放置；拖本體，放開即新增。';});add.dataset.blankPlace='';add.classList.add('primary');
 button('取消',cancel);
 const options=()=>panelOptions(state,origin);
 function report(){
  const r=makeStandardBlank({...options(),n:1}),bad=problem||(r.ok?'':r.message);
  add.disabled=!!bad;status.textContent=bad||`${r.holeCount}孔（含中心孔）；${state.count===2?'彎桿':'三臂件'}，板厚 3 mm。點畫布放置，拖曳放開即新增。`;
 }
 function render(){
  countButtons.forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.armCount)===state.count)));
  holeInputs.forEach(({input,label},k)=>{label.style.display=k>=state.count?'none':'';if(document.activeElement!==input)input.value=state.holes[k];});
  angleInputs.forEach(({input,label},i)=>{label.style.display=i+1>=state.count?'none':'';if(document.activeElement===input)return;const a=state.angles[i];input.value=Number.isInteger(a)?a:'';input.placeholder=Number.isInteger(a)?'':angleText(a);});
  presetBox.replaceChildren();
  (state.count===2?PRESETS_2:PRESETS_3).forEach(p=>{const b=el('button',{type:'button',className:'tool-btn',textContent:p.label});b.dataset.armPreset=p.label;b.onclick=()=>{p.angles.forEach((a,i)=>{state.angles[i]=a;});problem='';render();push();};presetBox.append(b);});
  report();
 }
 function push(){report();if(!add.disabled)update(options());}
 const shown=draft=>{origin=draft.origin||origin;pos.forEach((n,i)=>{if(document.activeElement!==n)n.value=[origin.x,origin.y][i];});report();};
 pos.forEach(n=>n.oninput=()=>{const x=Number(pos[0].value),y=Number(pos[1].value);if(pos.some(p=>p.value.trim()===''||!Number.isFinite(Number(p.value)))){problem='位置請填有效的 X、Y 座標。';report();return;}problem='';origin={x,y};push();});
 const escape=e=>{if(e.isComposing||e.keyCode===229)return;if(e.key==='Escape'){e.preventDefault();cancel();}else confirmEditorKey(e,panel,()=>{if(!add.disabled)confirm();});};
 const closed=()=>{panel.hidden=true;document.removeEventListener('keydown',escape);};
 if(sheetMode())setSheet('half');
 start(options(),{changed:shown,closed,canPlace:()=>!add.disabled});
 panel.hidden=false;document.addEventListener('keydown',escape);render();panel.tabIndex=-1;panel.focus({preventScroll:true});panel.title='Enter 放置目前預覽；Esc 取消';
}
