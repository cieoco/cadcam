/** 選取彎桿／多臂件時，把共用「零件編輯」面板的欄位換成「第N臂」的說法與整數欄位（由 member-editor 每次同步後呼叫 ARMS.sync）。 */
import {ARMS} from './standard-blank.js';
import {ARM_345_DEG} from './arm-blank.js';
import {readHoles,readAngle} from './arm-presets.js';
const NAMES={g:'第1臂長',r1:'第2臂長'};
export function syncArmEditor(comp,setDimensionValue){
 if(comp?.standardBlank?.kind!=='arms'||typeof document==='undefined')return;
 const el=id=>document.getElementById(id),arms=comp.standardBlank.arms;
 const box=el('standardBlankEdit');
 if(box){
  box.hidden=false;
  box.replaceChildren(...ARMS.rows(comp).map(([axis,label,value,max,hint],i)=>{
   const row=document.createElement('label'),input=document.createElement('input'),angle=axis.startsWith('angle'),k=angle?Number(axis.slice(5)):i;
   row.textContent=label;row.style.display='block';input.type='number';input.min=1;input.max=max;input.step=1;input.value=Number.isInteger(value)?value:'';input.placeholder=hint;input.dataset.blankEdit=axis;input.setAttribute('aria-label',label);
   input.onchange=()=>{
    const r=(angle?readAngle:readHoles)(input.value,k);
    if(!r.ok){input.setCustomValidity(r.message);input.reportValidity();input.setCustomValidity('');input.value=Number.isInteger(value)?value:'';return;}
    setDimensionValue(comp.id,axis,r.value,{exact:true});
   };
   row.append(input);
   if(angle&&axis==='angle1'&&arms.length===2||angle&&axis==='angle2'){const b=document.createElement('button');b.type='button';b.className='tool-btn';b.textContent='約127°';b.title='3-4-5 角：臂長是5孔的倍數時，端孔會落在方格上';b.onclick=()=>setDimensionValue(comp.id,axis,ARM_345_DEG,{exact:true});row.append(b);}
   return row;
  }));
 }
 // 長度欄／下拉／按鈕的名稱：不顯示「長向孔距 A–B」。
 const select=el('triSideSelect');
 if(select)for(const o of select.options)if(NAMES[o.value])o.textContent=NAMES[o.value];
 const name=NAMES[select?.value];
 if(NAMES[select?.value]){
  const label=el('memberDimensionLabel'),input=el('memberDimensionInput');
  if(label)label.textContent=name;if(input)input.setAttribute('aria-label',name);
  const minus=el('lenMinusBtn'),plus=el('lenPlusBtn');if(minus)minus.title=`${name} 減少 8 mm`;if(plus)plus.title=`${name} 增加 8 mm`;
 }
 const lenEditor=el('lenEditor');if(lenEditor)lenEditor.dataset.selectionSummary=`${comp.name}：${arms.map((a,k)=>`第${k+1}臂${a.holes}孔`).join('、')}（不含中心孔）`;
}
Object.assign(ARMS,{sync:syncArmEditor});
