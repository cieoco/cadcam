import {BOX_DEFAULTS,BOX_NAMES} from './box-config.js';
import {boxesInWork} from './box-generator.js';
import {planBoxChange} from './box-operations.js';
import {boxLayout,boxFile} from './box-files.js';
import {candidateMaterialFaces} from './face-candidate-view.js';

export function openBoxDialog({source,initialRoot='',onConfirm}){
 const dialog=document.createElement('dialog');dialog.className='box-maker';
 dialog.innerHTML=`<style>
 .box-maker{box-sizing:border-box;width:min(1040px,calc(100vw - 16px));max-height:calc(100dvh - 16px);padding:0;border:1px solid #ccd8dd;border-radius:14px;color:#294451;background:#fff}
 .box-maker::backdrop{background:#18384966}.box-maker[open]{display:flex;flex-direction:column}.box-maker *{box-sizing:border-box}
 .box-maker header,.box-maker footer{display:flex;align-items:center;gap:8px;padding:8px 12px;flex:none}.box-maker h2{font-size:18px;margin:0;flex:1}.box-maker button{min-height:44px;border:1px solid #bfced3;border-radius:8px;background:#fff;color:#294451;padding:6px 12px;font-size:14px;cursor:pointer}.box-maker button:disabled{opacity:.5;cursor:default}
 .box-maker .box-body{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,360px);gap:16px;padding:0 12px 12px;overflow:auto;min-height:0}.box-maker .box-visual{min-width:0}.box-maker svg{display:block;width:100%;height:330px;background:#f0f6f5;border-radius:10px}.box-maker .box-fields{display:grid;grid-template-columns:minmax(0,1fr) 110px;align-items:center;gap:6px 8px}.box-maker label{font-size:14px;overflow-wrap:anywhere}.box-maker input,.box-maker select{min-height:44px;min-width:0;width:100%;font-size:16px;border:1px solid #bfced3;border-radius:8px;padding:6px}.box-maker p{font-size:13px;line-height:1.5;margin:8px 0}.box-maker summary{padding:12px 0;cursor:pointer;font-size:14px}.box-maker .box-tabs{display:flex;gap:6px;margin-bottom:6px}.box-maker .box-tabs [aria-pressed=true]{background:#e0efea;border-color:#267366}.box-maker .box-error{color:#a52e2e}.box-maker footer{border-top:1px solid #dbe3e5;justify-content:flex-end;padding-bottom:max(8px,env(safe-area-inset-bottom))}.box-maker .box-confirm{background:#216f65;color:white}.box-maker .box-files{display:flex;gap:6px;flex-wrap:wrap}
 @media(max-width:700px){.box-maker .box-body{display:flex;flex-direction:column;gap:8px}.box-maker svg{height:clamp(170px,27dvh,240px)}.box-maker header{padding:6px 10px}.box-maker .box-body{padding:0 10px 8px}}
 </style><header><h2>卡榫盒子</h2><button type="button" data-close aria-label="關閉卡榫盒子">關閉</button></header>
 <div class="box-body"><section class="box-visual"><div class="box-tabs"><button type="button" data-view="assembled" aria-pressed="true">組合預覽</button><button type="button" data-view="flat" aria-pressed="false">五片展開</button></div><svg role="img" aria-label="盒體預覽"></svg><p data-summary></p><p data-panel-list hidden></p></section>
 <section><label>編輯盒體<select aria-label="編輯盒體"></select></label><p>尺寸以盒內可用空間計算，單位 mm。</p><div class="box-fields" data-basic></div><details><summary>接頭與底板設定</summary><div class="box-fields" data-advanced></div><p>每側一組 M3 螺絲、螺母與墊片，共 4 組。底板外伸不計入內部尺寸。</p></details><p data-status role="status" aria-live="polite"></p><details><summary>製作與下載</summary><p>四面側板以雙榫及 M3 螺絲鎖到底板；角落貼合。底板外伸保留料寬。</p><div class="box-files"><button type="button" data-file="svg" disabled>下載 SVG</button><button type="button" data-file="dxf" disabled>下載 DXF</button></div><p>未做切縫補償；板厚、五金與配合請先試切核對。展開圖由上到下為底板、前板、後板、左板、右板；請依機台幅面排版。</p></details></section></div>
 <footer><button type="button" data-close>取消</button><button type="button" class="box-confirm" disabled>加入作品</button></footer>`;
 document.body.append(dialog);
 const q=s=>dialog.querySelector(s),svg=q('svg'),status=q('[data-status]'),confirm=q('.box-confirm'),select=q('select');
 const options=[{id:'',name:'＋ 新增盒體'},...boxesInWork(source)];for(const item of options){const o=document.createElement('option');o.value=item.id;o.textContent=item.name;select.append(o);}select.value=options.some(o=>o.id===initialRoot)?initialRoot:'';
 const definitions=[['lengthMm','內部長度',false],['widthMm','內部寬度',false],['heightMm','內部高度',false],['thicknessMm','板材厚度',false],['flangeMm','底板外伸',true],['tabWidthMm','榫寬',true],['tabPitchMm','雙榫中心距',true],['clearanceMm','插槽總間隙',true],['screwLengthMm','螺絲長度',true]],fields={};
 for(const [key,label,advanced] of definitions){const l=document.createElement('label'),input=document.createElement('input');input.type='number';input.step='any';input.inputMode='decimal';input.id=`box-${key}`;input.setAttribute('aria-label',`${label}（mm）`);l.htmlFor=input.id;l.textContent=label;fields[key]=input;q(advanced?'[data-advanced]':'[data-basic]').append(l,input);input.addEventListener('input',schedule);}
 let timer,serial=0,plan=null,view='assembled',closed=false;
 const setStatus=(text,error=false)=>{status.textContent=text;status.classList.toggle('box-error',error);};
 const setEnabled=on=>{confirm.disabled=!on;dialog.querySelectorAll('[data-file]').forEach(b=>b.disabled=!on);};
 function close(){if(closed)return;closed=true;serial++;clearTimeout(timer);dialog.close();dialog.remove();}
 dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 function reset(){const p=options.find(o=>o.id===select.value)?.settings || BOX_DEFAULTS;for(const [k,input] of Object.entries(fields))input.value=p[k];confirm.textContent=select.value?'套用修改':'加入作品';schedule();}
 select.onchange=reset;
 function schedule(){const at=++serial;clearTimeout(timer);plan=null;setEnabled(false);svg.replaceChildren();q('[data-summary]').textContent='';q('[data-panel-list]').textContent='';setStatus('正在檢查尺寸與接合…');timer=setTimeout(()=>update(at),180);}
 async function update(at){
  const p=Object.fromEntries(Object.entries(fields).map(([k,i])=>[k,i.value.trim()===''?NaN:Number(i.value)]));
  try{const result=await planBoxChange(source,p,{rootPart:select.value || null});if(closed||at!==serial)return;
   if(!result.ok){setStatus(result.reason,true);return;}plan=result;setEnabled(true);setStatus('幾何檢查通過；實物配合與承載待驗證。');render();
  }catch(e){if(!closed&&at===serial)setStatus(`無法產生盒體：${e.message}`,true);}
 }
 function node(tag,attrs,text){const el=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));if(text)el.textContent=text;svg.append(el);return el;}
 function render(){
  svg.replaceChildren();q('[data-panel-list]').hidden=view!=='flat';if(!plan)return;
  const p=plan.preview.settings || plan.preview.work.comps[0].boxPanel.settings;
  q('[data-summary]').textContent=`內部 ${p.lengthMm} × ${p.widthMm} × ${p.heightMm} mm · 5 片板 · 板厚 ${p.thicknessMm} mm`;
  const path=r=>r.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ')+'Z';
  if(view==='flat'){
   const layout=boxLayout(plan.preview.work),maxX=Math.max(...layout.panels.map(p=>p.x+p.width)),maxY=Math.max(...layout.panels.map(p=>p.y+p.height));svg.setAttribute('viewBox',`0 0 ${maxX+70} ${maxY+10}`);
   q('[data-panel-list]').textContent=layout.panels.map(p=>`${p.name}：${Number(p.width.toFixed(2))} × ${Number(p.height.toFixed(2))} mm`).join('；');
   for(const p of layout.panels){node('path',{d:[...p.outlines,...p.cutouts.map(c=>c.points)].map(path).join(' '),fill:p.role==='base'?'#a8d8f1':'#efcc9e',stroke:'#476775','stroke-width':.5,'fill-rule':'evenodd'});for(const h of p.holes)node('circle',{cx:h.x,cy:h.y,r:h.r,fill:'#f0f6f5',stroke:'#476775','stroke-width':.4});node('text',{x:p.x+p.width+3,y:p.y+p.height/2,'font-size':7,fill:'#294451'},`${BOX_NAMES[p.role]} ${Number(p.width.toFixed(2))}×${Number(p.height.toFixed(2))}`);}
  }else{
   const project=p=>({x:.7*p.x-.7*p.y,y:.35*p.x+.35*p.y-.85*p.z}),faces=candidateMaterialFaces(plan.preview.model),all=faces.flatMap(f=>f.rings.flat()).map(project),xs=all.map(p=>p.x),ys=all.map(p=>p.y),loX=Math.min(...xs),loY=Math.min(...ys),w=Math.max(...xs)-loX,h=Math.max(...ys)-loY;svg.setAttribute('viewBox',`${loX-12} ${loY-12} ${w+24} ${h+24}`);
   faces.sort((a,b)=>{const depth=f=>f.rings.flat().reduce((n,p)=>n+p.x+p.y+p.z,0)/f.rings.flat().length;return depth(a)-depth(b);}).forEach(f=>node('path',{d:f.rings.map(r=>path(r.map(project))).join(' '),fill:f.color || '#d7b17b',stroke:'#476775','stroke-width':.35,'fill-rule':'evenodd','fill-opacity':.85}));
  }
 }
 dialog.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;dialog.querySelectorAll('[data-view]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn===b)));render();});
 dialog.querySelectorAll('[data-file]').forEach(b=>b.onclick=()=>{if(!plan)return;try{const format=b.dataset.file,text=boxFile(plan.preview.work,format),url=URL.createObjectURL(new Blob([text],{type:format==='svg'?'image/svg+xml':'application/dxf'})),a=document.createElement('a');a.href=url;a.download=`open-box-${format==='svg'?'panels.svg':'panels.dxf'}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){setStatus(e.message,true);}});
 confirm.onclick=async()=>{if(!plan||confirm.disabled)return;setEnabled(false);try{const error=await onConfirm(plan);if(error){setStatus(error,true);return;}close();}catch(e){setStatus(e.message,true);}};
 dialog.showModal();reset();return {close};
}
