import {S} from './state.js';
import {planWheel} from './wheel.js';
import {confirmMountingChange} from './mounting-review-ui.js';
export function openWheel(){
 const motors=S.comps.filter(c=>c.type==='motor'&&c.motorType==='tt');
 const dialog=document.createElement('dialog');dialog.style.cssText='max-width:340px;width:calc(100% - 40px);border:1px solid #bacbd4;border-radius:16px;padding:20px';
 dialog.innerHTML='<h3>TT 輪子</h3><label>接到馬達 <select aria-label="輪子馬達"></select></label><p><label>直徑 <input aria-label="輪子直徑" type="number" min="20" max="2000" step="0.1" value="65" style="width:90px"> mm</label></p><p><label>輪寬 <input aria-label="輪子寬度" type="number" min="1" max="100" step="0.1" value="15" style="width:90px"> mm</label></p><p>外購輪子外形；軸孔沿用 TT 雙扁孔設定，配合與防脫待實量。</p><p role="status"></p><button data-cancel>取消</button> <button data-add>裝上輪子</button>';
 const select=dialog.querySelector('select'),status=dialog.querySelector('[role=status]');
 for(const m of motors){const o=document.createElement('option');o.value=m.id;o.textContent=`TT · M${m.physicalMotor}（${m.p1.x.toFixed(1)}, ${m.p1.y.toFixed(1)}）`;select.append(o);}
 const diagram=document.createElementNS('http://www.w3.org/2000/svg','svg');diagram.setAttribute('viewBox','0 0 300 120');diagram.setAttribute('aria-label','點選要裝輪子的馬達');diagram.style.cssText='width:100%;height:120px;background:#f2f6f8;border-radius:10px';select.parentElement.after(diagram);
 const preview=()=>{
  diagram.replaceChildren();const xs=motors.map(m=>m.p1.x),ys=motors.map(m=>m.p1.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),scale=Math.min(180/Math.max(1,maxX-minX),50/Math.max(1,maxY-minY));
  for(const m of motors){const x=60+(m.p1.x-minX)*scale,y=75-(m.p1.y-minY)*scale;const g=document.createElementNS(diagram.namespaceURI,'g');g.setAttribute('role','button');g.setAttribute('tabindex','0');g.setAttribute('aria-label',`選擇馬達 M${m.physicalMotor}`);g.style.cursor='pointer';const chosen=m.id===select.value;g.innerHTML=`<circle cx="${x}" cy="${y}" r="26" fill="${chosen?'#374151':'#e8b940'}" stroke="${chosen?'#008878':'#776b42'}" stroke-width="3"/><text x="${x}" y="${y+5}" text-anchor="middle" fill="${chosen?'white':'#243b42'}">M${m.physicalMotor}</text>`;g.onclick=()=>{select.value=m.id;preview();};g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();g.onclick();}};diagram.append(g);}
 };select.onchange=preview;preview();
 for(const b of dialog.querySelectorAll('button'))b.style.cssText='min-height:44px;min-width:90px';
 const sourceKey=()=>JSON.stringify([S.comps,S.topo.params,S.modules,S.fabrication]);const before=sourceKey();
 const close=()=>{dialog.close();dialog.remove();};dialog.querySelector('[data-cancel]').onclick=close;dialog.addEventListener('cancel',()=>dialog.remove());
 const add=dialog.querySelector('[data-add]');add.disabled=!motors.length;if(!motors.length)status.textContent='請先新增一顆尚未接輸出的 TT 馬達。';
 add.onclick=()=>{
  if(sourceKey()!==before){status.textContent='作品已變更，請關閉後重新選取。';return;}
  const inputs=dialog.querySelectorAll('input');if([...inputs].some(i=>!i.value.trim())){status.textContent='請填入輪徑與輪寬。';return;}
  const work={comps:S.comps,params:S.topo.params,modules:S.modules,fabrication:S.fabrication};
  const plan=planWheel(work,{motorId:select.value,diameterMm:Number(inputs[0].value),widthMm:Number(inputs[1].value)},{motorAngles:{...S.motorAngles,[S.activeMotor]:S.theta}});
  if(!plan.ok){status.textContent=plan.message;return;}
  if(!confirmMountingChange(work,{...work,comps:plan.comps,params:plan.params},{notify:message=>{status.textContent=message;}}))return;
  window.blocks.pause();window.blocks.pushUndo();S.comps=plan.comps;S.topo.params=plan.params;S.selectedLinkId=plan.wheelId;
  window.blocks.rebuild();window.blocks.selectLink(plan.wheelId);window.blocks.draw();window.blocks.scheduleAutosave();close();
 };document.body.append(dialog);dialog.showModal();
}
