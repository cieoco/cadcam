import {createFaceCandidateTransaction,faceCandidateModel} from './face-candidate.js';
import {confirmMountingChange} from './mounting-review-ui.js';
import {applyMatrix4} from '../blocks3d/orthogonal-3d.js';
import {pinPartSupported,motorPinAt} from './pin-ops.js';
import {isFixedMountPart} from './part-types.js';
import {pickPinTargets} from './pin-hit.js';

/** Same candidate/undo/save contract as face placement; first input is a canvas tap. */
export function openParallelPin({childId,dock,pickViewer:viewer,sourceModel,readSource,readPose,commit,onPreview=()=>{},onClose=()=>{},say=()=>{},initialMount=null,displayName=id=>id}){
 let closed=false,revision=0,first=null,pair=null,result=null,model=sourceModel || faceCandidateModel({ok:true,work:readSource(),validation:{checks:[]}},readPose()).model;
 const originalModel=model,source=readSource(),comps=source.comps,child=source.modules.find(m=>m.id===childId);
 if(!child||!viewer?.canvas){say('請先選要組立的設計，等待3D載入完成。');return;}
 const transaction=createFaceCandidateTransaction({readSource,readPose,commit,review:confirmMountingChange});
 const make=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
 const panel=make('section'),hint=make('p'),fields=make('div'),message=make('p'),confirm=make('button','放入插銷'),cancel=make('button','取消'),reset=make('button','重選孔位');reset.hidden=true;
 panel.style.cssText='padding:12px;display:flex;flex-direction:column;gap:10px';panel.dataset.assemblyKind='parallel';message.setAttribute('role','status');confirm.disabled=true;confirm.hidden=true;
 fields.style.cssText='display:grid;gap:8px';for(const b of [confirm,reset,cancel]){b.type='button';b.className='bench-btn';b.style.minHeight='44px';}confirm.classList.add('primary');
 panel.append(make('h2','平行 · 點兩個孔'),hint,fields,message,confirm,reset,cancel);dock.replaceChildren(panel);
 const NS='http://www.w3.org/2000/svg',overlay=document.createElementNS(NS,'svg');overlay.setAttribute('aria-label','平行組立選孔');overlay.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:7';viewer.canvas.parentElement.append(overlay);
 const gap=make('input'),angle=make('input'),locked=make('input');gap.type=angle.type='number';gap.min='0';gap.step=angle.step='any';gap.value=String(initialMount?.face?.selection?.gap ?? 0);angle.value=String(initialMount?.face?.selection?.rotationDeg ?? 0);locked.type='checkbox';locked.checked=!!initialMount?.face?.selection?.pin?.locked;
 const controls=()=>{confirm.hidden=false;fields.replaceChildren();for(const [text,input]of [['間距 mm',gap],['轉向 °',angle],['鎖固插銷',locked]]){const label=make('label',text);label.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:8px';input.setAttribute('aria-label',text);input.style.cssText=input.type==='checkbox'?'width:24px;height:24px':'width:140px;min-width:0;min-height:44px;box-sizing:border-box';label.append(input);fields.append(label);}angle.disabled=locked.checked;};
 function targets(){return (model?.materialParts || []).flatMap(p=>{const c=comps.find(c=>c.id===p.partId);if(!c||!pinPartSupported(c)||!['bar','triangle','rack'].includes(c.type))return [];
  if(c.moduleId===childId&&!isFixedMountPart(c))return [];
  if(pair&&!pair.some(t=>t.ownerId===c.id))return [];
  return p.geometry.holes.flatMap((h,i)=>!h.id||motorPinAt(comps,h.id)||/HORN|HUB|SHAFT|MOTOR|CENTER/.test(h.layer || '')?[]:[{id:h.id,ownerId:c.id,moduleId:c.moduleId,r:h.r,index:i,world:applyMatrix4(p.pose.matrix,{...h,z:p.geometry.thicknessMm}),key:p.pickKey}]);});}
 let screen=[];
 function draw(){if(closed)return;overlay.replaceChildren();const rect=overlay.getBoundingClientRect();screen=[];
  for(const t of targets()){const p=viewer.project(t.world);if(!p)continue;screen.push({...t,...p});const circle=document.createElementNS(NS,'circle');circle.setAttribute('cx',p.x-rect.left);circle.setAttribute('cy',p.y-rect.top);circle.setAttribute('r',first?.id===t.id&&first.ownerId===t.ownerId?7:1.2);circle.setAttribute('fill',t.moduleId===childId?'#139b82':'#3c93d0');circle.setAttribute('fill-opacity','.65');overlay.append(circle);}
 }
 async function preview(){if(!pair||closed)return;const n=++revision;result=null;confirm.disabled=true;message.textContent='檢查對孔與間距…';
  const h=pair.find(t=>t.moduleId!==childId),c=pair.find(t=>t.moduleId===childId),distance=Number(gap.value),turn=Number(angle.value);
  if(!gap.value.trim()||!angle.value.trim()||!Number.isFinite(distance)||distance<0||!Number.isFinite(turn)){message.textContent='請輸入有效間距與轉向。';return;}
  const selection={hostFace:'top',childFace:'bottom',alignU:0,alignV:0,offsetU:0,offsetV:0,gap:distance,quarterTurns:0,rotationDeg:turn,pin:{hostHole:h.id,childHole:c.id,locked:locked.checked,diameterMm:Math.min(3,2*h.r,2*c.r)}};
  const r=await transaction.preview({childId,reselect:!!initialMount,hostEndpoint:{moduleId:h.moduleId,partId:h.ownerId},childEndpoint:{partId:c.ownerId},selection});if(closed||n!==revision)return;
  result=r;if(r.model){model=r.model;onPreview(r);draw();}confirm.disabled=!r.saveable;message.textContent=!r.saveable?r.reason || '目前無法對孔。':r.validation.status==='fail'?'有干涉；可先保存定位再調整。':'兩孔已對齊；插銷與配合尺寸仍需實量。';
 }
 function choose(t){if(closed||pair)return;message.textContent='';if(!first){first=t;reset.hidden=false;hint.textContent=t.moduleId===childId?'再點另一個設計的孔。':'再點要安裝設計的孔。';viewer.setHighlight?.([t.key]);draw();return;}
  if((first.moduleId===childId)===(t.moduleId===childId)){message.textContent='請選另一端設計的孔。';return;}
  pair=[first,t];hint.textContent='兩孔對齊後，可直接確認或微調。';controls();preview();
 }
 let down;
 const start=e=>{down=e.isPrimary!==false?{x:e.clientX,y:e.clientY,id:e.pointerId}:null;};
 const finish=e=>{const d=down;down=null;if(!d||d.id!==e.pointerId||Math.hypot(e.clientX-d.x,e.clientY-d.y)>6||pair)return;const hits=pickPinTargets(screen,{x:e.clientX,y:e.clientY},24);
  if(hits.length===1)choose(hits[0]);else if(hits.length){fields.replaceChildren();for(const t of hits){const c=comps.find(c=>c.id===t.ownerId),b=make('button',`${displayName(t.moduleId)} · ${c?.name || '桿件'} · 孔 ${t.index+1}`);b.style.minHeight='44px';b.onclick=()=>{fields.replaceChildren();choose(t);};b.onpointerenter=()=>viewer.setHighlight?.([t.key]);fields.append(b);}message.textContent='孔位重疊，請選這次要接的零件。';}else message.textContent='請點圖中標示的孔；可轉動視角。';};
 function close(){if(closed)return;closed=true;revision++;transaction.cancel();unsubscribe?.();viewer.canvas.removeEventListener('pointerdown',start);viewer.canvas.removeEventListener('pointerup',finish);viewer.canvas.removeEventListener('pointercancel',abort);viewer.setHighlight?.([]);overlay.remove();panel.remove();onClose();}
 const abort=()=>{down=null;};const unsubscribe=viewer.subscribeProjection?.(draw);viewer.canvas.addEventListener('pointerdown',start);viewer.canvas.addEventListener('pointerup',finish);viewer.canvas.addEventListener('pointercancel',abort);
 for(const input of [gap,angle,locked])input.oninput=()=>{angle.disabled=locked.checked;preview();};
 reset.onclick=()=>{revision++;result=null;first=pair=null;model=originalModel;fields.replaceChildren();message.textContent='';hint.textContent='點要接合的兩個板件孔，先點哪一端都可以。';confirm.disabled=true;confirm.hidden=reset.hidden=true;viewer.setHighlight?.([]);onPreview({model:null});draw();};
 confirm.onclick=async()=>{confirm.disabled=true;const r=await transaction.confirm(result || {});if(r.ok)close();else{message.textContent=r.reason;confirm.disabled=false;}};cancel.onclick=close;
 hint.textContent='點要接合的兩個板件孔，先點哪一端都可以。';draw();
 if(initialMount?.face?.selection.pin){const pin=initialMount.face.selection.pin,list=targets(),a=list.find(t=>t.moduleId===childId&&t.id===pin.childHole),b=list.find(t=>t.moduleId===initialMount.to.module&&t.id===pin.hostHole);if(a&&b){first=a;pair=[a,b];reset.hidden=false;controls();preview();}}
 return {cancel:close};
}
