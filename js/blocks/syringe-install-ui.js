import * as View from './view.js';
import {installationChoices,planPlacedSyringe,rotateClampAboutEar,outputHoleModes} from './syringe-installation.js';
import {SYRINGE_EAR_MM,attachmentFrame,attachmentPoint,syringeAttachmentHoles,syringeAttachmentHole} from '../core/syringe.js';
import {scanSyringe} from './syringe-operations.js';
import {syringeShape} from './syringe-shape.js';
import {frameConnectorNodes} from './model.js';
import {inspectFrameExport} from './exporters.js';
import {createPlateGeometry} from './plate-geometry.js';
import {syringePositionOnFrame} from './syringe-position.js';
import {diskOutline} from './disk-plate.js';
import {signedNumberInput,showNumber,readNumber} from './numeric-input.js';
import {confirmMountingChange} from './mounting-review-ui.js';
import {INSTALL_STEPS,MODE_TEXT,installProgress,partLabels,holeNames,holeName,suggestMountMode,strokeCheck,installSummary,confirmLine} from './syringe-install-steps.js';

const ns='http://www.w3.org/2000/svg';
const el=(tag,text,parent)=>{const n=document.createElement(tag);if(text)n.textContent=text;parent?.append(n);return n;};
// 同一張表單、同一份候選：三個問題依序出現，步驟由目前的安裝請求推得，不另存解鎖狀態。
export function openSyringeInstallation({stage=null,redraw=()=>{},source,points,existing=null,newId,motion={},confirm,remove,advancedSettings,setFrame=null,review=(result,notify,ask)=>confirmMountingChange(source,{...source,comps:result.comps,params:result.params},{notify,ask})}){
 document.getElementById('syringeInstallation')?.close();
 let base=structuredClone(source),choices=installationChoices(base.comps,base.params),names=partLabels(base.comps);
 let result=null,closed=false,revision=0,viewer=null,sceneTimer=null,checkTimer=null,preview3d=false,dragging=false,focusClamp=!!existing,focusBox=null,dragOffset=null,viewBox=null;
 // pendingFrame：學生點了還會動的零件，等「設為不動的底座」；viewStep：回頭修改已答過的步驟。
 let pendingFrame='',viewStep=null,frameNote='',modeTouched=!!existing,suggestion=null,suggestKey='',shownStep=0,outputNote='';
 const holeModes=new Map();
 const request={id:existing&&base.comps.some(c=>c.id===existing.id)?existing.id:null,newId:newId || existing?.id,
  mountMode:existing?.mountMode==='pivot'?'pivot':'fixed-axis',pivotEar:existing?.mountMode==='pivot'?existing.pivotEar:undefined,
  b:existing?.b?{...existing.b}:null,face:existing?.installation?.face || 'front',spacerMm:existing?.installation?.spacerMm ?? null,extension:existing?.extension ?? 10,position:existing?attachmentPoint(existing.a,base.comps,base.params,points):null,axisDeg:existing?.axisDeg ?? 0,frameId:existing?.a?.componentId || ''};
 // A canvas-picked candidate retains its custom specification before insertion.
 if(existing&&!request.id){base.comps.push(structuredClone(existing));request.id=existing.id;}
 let autoAxis=!existing,outputOptions=[],approvedRevision=null;
 const dialog=el('dialog');dialog.id='syringeInstallation';dialog.className='syringe-install install-direct'+(stage?' install-canvas':'');
 dialog.setAttribute('aria-label','針筒安裝');
 const head=el('header',null,dialog);el('strong','針筒安裝',head);const cancel=el('button','取消',head);
 const stepList=el('ol',null,dialog);stepList.className='install-steps';stepList.setAttribute('aria-label','安裝步驟');
 const stepButtons=[1,2,3].map(k=>{const b=el('button','',el('li',null,stepList));b.type='button';b.dataset.installStep=k;b.onclick=()=>{viewStep=k;update();};return b;});
 const preview=el('section',null,dialog);preview.className='install-preview';preview.setAttribute('aria-label','安裝預覽');
 const svg=document.createElementNS(ns,'svg');preview.append(svg);svg.setAttribute('aria-label','放置針筒、拖動位置與方向把手');svg.setAttribute('role','group');
 const space=el('div',null,preview);space.className='install-three';space.hidden=true;
 const zoom=el('button','看整個機構',preview);zoom.className='install-zoom';zoom.onclick=()=>{focusClamp=!focusClamp;focusBox=null;update();};
 const hint=el('p','',preview);hint.className='install-hint';
 const body=el('section',null,dialog);body.className='install-options';
 const panels=INSTALL_STEPS.map((title,i)=>{const s=el('section',null,body);s.dataset.installPanel=String(i+1);s.setAttribute('aria-label',title);el('h3',title,s);return s;});
 const [pickPanel,outputPanel,adjustPanel]=panels;
 const field=(p,text,type='select')=>{const label=el('label',text,p),n=el(type,null,label);n.setAttribute('aria-label',text);if(type==='input'){n.type='number';n.step='0.1';}return n;};
 const option=(s,text,value)=>{const o=el('option',text,s);o.value=value;};
 // ① 針筒固定在哪裡？
 el('p','點畫布上框起來的板子或桿件。筒身要鎖在不會動的零件上，推桿才推得動機構。',pickPanel);
 const frameStatus=el('p','',pickPanel);frameStatus.setAttribute('role','status');frameStatus.dataset.installFrameStatus='';
 const setFrameButton=el('button','把它設為不動的底座',pickPanel);setFrameButton.type='button';setFrameButton.dataset.installSetFrame='';setFrameButton.setAttribute('aria-label','把它設為不動的底座');
 const frame=field(pickPanel,'或從清單選零件');frame.setAttribute('aria-label','針筒固定的零件');frame.parentElement.classList.add('wide');
 // ② 推桿要推哪個孔？
 el('p','點畫布上橘色圈起來的孔。它在會動的零件上，推桿推它就會帶動機構。',outputPanel);
 const outputStatus=el('p','',outputPanel);outputStatus.setAttribute('role','status');outputStatus.dataset.installOutputStatus='';
 const outputChoices=el('div',null,outputPanel);outputChoices.className='install-faces';
 const rod=field(outputPanel,'或從清單選零件');rod.setAttribute('aria-label','推桿接的零件');
 const end=field(outputPanel,'孔');end.setAttribute('aria-label','推桿接的孔');
 // ③ 調整位置，試推看看
 const check=el('p','',adjustPanel);check.className='install-check';check.setAttribute('role','status');check.dataset.installCheck='';
 const trialPanel=el('div',null,adjustPanel),positionPanel=el('div',null,adjustPanel);
 const nudge=el('div',null,positionPanel);nudge.className='install-nudge';
 const stepSize=field(positionPanel,'每次移動');option(stepSize,'1 mm','1');option(stepSize,'5 mm','5');
 const shift=(dx,dy)=>{if(!request.position)return;const owner=choices.frames.find(c=>c.id===request.frameId),f=owner&&attachmentFrame(owner,base.params,points),d=Number(stepSize.value);
  const along=false;
  request.position=onFrame({x:request.position.x+d*(along?dx*f.x:dx),y:request.position.y+d*(along?dx*f.y:dy)});changed();update();};
 const nudges=[['← 左移',-1,0],['↑ 上移',0,1],['↓ 下移',0,-1],['右移 →',1,0]].map(([text,x,y])=>{const b=el('button',text,nudge);b.onclick=()=>shift(x,y);return b;});
 const precise=el('details',null,positionPanel);el('summary','精確座標與角度',precise);
 const px=field(precise,'固定位置 X (mm)','input'),py=field(precise,'固定位置 Y (mm)','input');
 const angle=field(precise,'推進方向角度 (°)','input');angle.step='1';
 for(const n of [px,py,angle])signedNumberInput(n);
 const rotationOptions=el('div',null,precise),keepEar=field(rotationOptions,'保留第一耳孔調角度','input'),drilled=field(rotationOptions,'保留已鑽的固定孔','input');keepEar.type=drilled.type='checkbox';keepEar.checked=true;drilled.closest('label').hidden=!existing;
 drilled.onchange=()=>{request.keepOldHoles=drilled.checked;update();};
 const setAngle=value=>{if(keepEar.checked&&request.position&&Number.isFinite(value)&&Number.isFinite(request.axisDeg))Object.assign(request,rotateClampAboutEar(request.position,request.axisDeg,value));else request.axisDeg=value;autoAxis=false;};
 const snap=el('button','移到所選機架',positionPanel);
 const outputCoords=el('p','',precise);
 const caveat=el('details',null,adjustPanel);caveat.dataset.installCaveat='';el('summary','⚠ 製作前請核對固定環尺寸',caveat);
 el('p',`筒身與固定環夾牢，固定環再鎖到底座上，兩個耳孔相距 ${2*SYRINGE_EAR_MM} mm。現有參考固定環的環壁、耳孔與 M3 墊片會互相干涉，固定架要改製並對照實物核對；筒身目前只能鎖在不動的零件上。`,caveat);
 // 進階：安裝方式與前後（收合）
 const advanced=el('details',null,adjustPanel);advanced.dataset.installAdvanced='';const advancedSummary=el('summary','',advanced);
 const modeGroup=el('fieldset',null,advanced);modeGroup.className='install-modes';el('legend','針筒怎麼固定？',modeGroup);
 const modeInputs=[['fixed-axis','筒身方向不變、推桿直直推；推桿接短連桿，再由短連桿帶動擺臂時用。'],['pivot','推桿直接接在會轉的零件上，筒身跟著擺；只鎖一顆螺絲當轉軸，另一耳不鎖。']].map(([value,why])=>{
  const label=el('label',null,modeGroup),input=el('input',null,label),text=el('span',null,label);input.type='radio';input.name='syringeMountMode';input.value=value;el('strong',MODE_TEXT[value],text);el('small',why,text);
  input.onchange=()=>{if(!input.checked)return;request.mountMode=value;modeTouched=true;preview3d=false;changed();update();};return input;});
 const modeHint=el('p','',advanced);modeHint.dataset.installSuggestion='';
 // 可轉安裝：同一個雙耳固定環，只鎖一耳。沿推進方向（固定環往推桿）看，+1 是左耳、-1 是右耳。
 const ear=field(advanced,'鎖哪一顆螺絲（左／右）');option(ear,'左邊那顆（沿推桿方向看）','1');option(ear,'右邊那顆（沿推桿方向看）','-1');ear.parentElement.classList.add('wide');
 ear.onchange=()=>{request.pivotEar=Number(ear.value)===-1?-1:1;preview3d=false;changed();update();};
 const faceRow=el('div',null,advanced);faceRow.className='install-faces';
 const faces=['front','back'].map((face,i)=>{const b=el('button',i?'針筒裝在板子後面':'針筒裝在板子前面',faceRow);b.onclick=()=>{request.face=face;update();};return b;});
 const toggle=el('button','查看 3D',trialPanel);toggle.onclick=()=>{preview3d=!preview3d;update();};
 const auto=field(trialPanel,'套筒高度');option(auto,'自動估算（優先對齊）','auto');option(auto,'自行輸入套筒長度','manual');auto.value=request.spacerMm===null?'auto':'manual';
 const spacer=field(trialPanel,'套筒長度 (mm)','input');spacer.min=0;spacer.max=100;spacer.value=request.spacerMm ?? 5;
 const stroke=field(trialPanel,'試動伸出量 (mm)','input');stroke.type='range';stroke.min=0;stroke.step='.1';stroke.max=existing?.spec.stroke ?? 20;stroke.value=request.extension;
 const reading=el('output','',trialPanel),mountStatus=el('p','',trialPanel);mountStatus.setAttribute('role','status');
 const scan=el('button','檢查全行程',trialPanel),scanStatus=el('p','尚未檢查全行程。',trialPanel);scanStatus.setAttribute('role','status');
 const installationMore=el('details',null,adjustPanel);el('summary','更多：安裝、規格與檢查',installationMore);
 const clampSlide=el('div',null,positionPanel);clampSlide.className='install-clamp-slide';
 const offset=field(clampSlide,'固定環在筒身上的位置','input');offset.type='range';offset.min=6;offset.step='0.1';
 const offsetReading=el('output','',clampSlide);
 el('p','往左靠筒尾，往右靠推桿；只調筒身穿過固定環的位置，底板固定孔不移動。',clampSlide);
 precise.before(clampSlide);precise.append(snap);
 offset.oninput=()=>{request.barrelOffsetMm=readNumber(offset);changed();update();};
 const more=advancedSettings?el('button','其他尺寸與加工設定',installationMore):null;
 if(more)more.onclick=()=>{if(!result?.ok)return;const c=result.syringe;dialog.close();advancedSettings(c);};
 if(remove){const del=el('button','刪除這支針筒',installationMore);del.onclick=()=>{if(remove()!==false)dialog.close();};}
 installationMore.querySelector('summary').after(toggle,auto.parentElement,spacer.parentElement,mountStatus,scan,scanStatus);
 trialPanel.prepend(stroke.parentElement,reading);
 const footer=el('footer',null,dialog),notes=el('div',null,footer),next=el('button','確認安裝',footer);notes.className='install-notes';
 const missingLine=el('p','',notes);missingLine.setAttribute('role','status');missingLine.dataset.installMissing='';
 const error=el('p',null,notes);error.setAttribute('role','status');error.className='install-error';
 cancel.onclick=()=>dialog.close();
 next.onclick=()=>{if(result?.ok&&!result.temporary&&!pendingFrame){if(!review(result,message=>{error.textContent=message;},()=>{if(approvedRevision===revision)return true;approvedRevision=revision;next.textContent='確認更新固定孔';error.textContent='固定孔將依候選位置更新；再次確認才套用，取消會保留原孔。';return false;}))return;const accepted=confirm(result);if(accepted!==false)dialog.close();else error.textContent='作品已變更，請關閉後重新安裝。';}};
 const changed=()=>{scanStatus.textContent='設定已變更，請重新檢查全行程。';};
 const holes=c=>syringeAttachmentHoles(c,base.params);
 const plainHole=(c,h)=>c&&h?holeName(names.get(c.id),holes(c),h):'';
 // ② 每個候選孔先用放置規則預查兩種安裝方式（結果快取，作品或底座換了才重算）；推不動的孔灰色、不能點。
 const modesOf=(c,h)=>{const k=`${request.frameId}|${c.id}|${h.key}`;if(!holeModes.has(k))holeModes.set(k,outputHoleModes(base.comps,base.params,request.frameId,{componentId:c.id,u:h.u,v:h.v}));return holeModes.get(k);};
 const canPush=(c,h)=>{const m=modesOf(c,h);return m['fixed-axis']||m.pivot;};
 const stuck=c=>`「${names.get(c.id)}」還沒有推得動的孔：它要有一端接在固定的孔上當擺臂，或當短連桿接到這樣的擺臂，針筒才推得動。`;
 function fillLists(){
  frame.replaceChildren();option(frame,'請選零件','');choices.frames.forEach(c=>option(frame,names.get(c.id),c.id));choices.rods.forEach(c=>option(frame,`${names.get(c.id)}（會動，需設為底座）`,c.id));
  rod.replaceChildren();option(rod,'請選會動的零件','');choices.rods.forEach(c=>option(rod,names.get(c.id),c.id));
 }
 // 「把它設為不動的底座」已提交到作品（可復原）；表單改用提交後的作品，候選與原作品一致。
 function load(next,pts){
  base=structuredClone(next);if(request.id&&existing&&!base.comps.some(c=>c.id===request.id))base.comps.push(structuredClone(existing));
  points=pts;choices=installationChoices(base.comps,base.params);names=partLabels(base.comps);viewBox=null;focusBox=null;suggestKey='';holeModes.clear();fillLists();
 }
 fillLists();
 const selectFrame=id=>{outputNote='';request.frameId=id;const c=choices.frames.find(c=>c.id===id);request.position=c?{...attachmentFrame(c,base.params,points).p}:null;if(!existing)autoAxis=true;focusBox=null;preview3d=false;viewStep=null;changed();update();};
 frame.onchange=()=>{frameNote='';if(choices.rods.some(c=>c.id===frame.value)){pendingFrame=frame.value;update();return;}pendingFrame='';selectFrame(frame.value);};
 setFrameButton.onclick=async()=>{
  const id=pendingFrame;if(!id||!setFrame)return;setFrameButton.disabled=true;frameNote='正在設為底座…';update();
  let r;try{r=await setFrame(id);}catch(e){r={ok:false,message:e.message};}
  if(closed)return;setFrameButton.disabled=false;
  if(!r?.ok){frameNote=r?.message||'沒有設為底座，請改選其他零件。';update();return;}
  load(r.source,r.points);pendingFrame='';frameNote='已設為不動的底座，可按復原還原。';selectFrame(id);
 };
 const setPosition=()=>{request.position={x:readNumber(px),y:readNumber(py)};changed();update();};
 px.oninput=py.oninput=setPosition;
 angle.onchange=()=>{setAngle(readNumber(angle));changed();update();};
 snap.onclick=()=>{if(request.position){request.position=onFrame(request.position);changed();update();}};
 const setRod=()=>{const c=choices.rods.find(c=>c.id===rod.value);if(c)connectOutput(c,holes(c).find(h=>h.key===end.value)?.key||'p1');else{request.b=null;changed();update();}};
 rod.onchange=setRod;end.onchange=setRod;
 auto.onchange=spacer.oninput=()=>{request.spacerMm=auto.value==='auto'?null:spacer.value.trim()===''?NaN:Number(spacer.value);changed();update();};
 stroke.oninput=()=>{if(!result?.ok)return;request.extension=Number(stroke.value);update();};
 scan.onclick=()=>{if(!result?.ok)return;const r=scanSyringe(result.comps,result.params,result.syringe.id,.5,motion);scanStatus.textContent=r.ok?r.message:`${r.atMm??''} mm：${r.message}`;};
 function renderDrawing(){
  svg.replaceChildren();const cs=result?.ok?result.comps:base.comps,P=result?.ok?result.points:points,step=shownStep;
  const draw=(tag,attrs)=>{const n=document.createElementNS(ns,tag);for(const [k,value] of Object.entries(attrs))n.setAttribute(k,value);svg.append(n);return n;};
  const pos=p=>P?.[p?.id] || p;
  const poly=(ring,color)=>draw('polygon',{points:ring.map(p=>`${p.x},${-p.y}`).join(' '),fill:color,stroke:'#64748b','stroke-width':.8});
  const line=(a,b,width,color)=>draw('line',{x1:a.x,y1:-a.y,x2:b.x,y2:-b.y,stroke:color,'stroke-width':width,'stroke-linecap':'round'});
  const bounds=cs.flatMap(c=>c.shape==='disk'?diskOutline(c,pos(c.p1)):[c.p1,c.p2,c.p3].filter(Boolean).map(pos));
  if(!viewBox&&bounds.length){const xs=bounds.map(p=>p.x),ys=bounds.map(p=>-p.y),x=Math.min(...xs)-70,y=Math.min(...ys)-45;viewBox=[x,y,Math.max(...xs)-x+55,Math.max(...ys)-y+45];}
  if(focusClamp&&request.position&&!focusBox){
   const a=request.position,len=existing?.spec.bodyLength ?? 72;
   const pad=Math.max(105,len+40),w=pad*2,h=pad*1.6;focusBox=[a.x-w/2,-a.y-h/2,w,h];
  }
  const box=stage?(()=>{const a=View.worldFromScreen(0,0);return [a.x,-a.y,View.W/View.getScale(),View.H/View.getScale()];})():focusClamp?focusBox||viewBox:viewBox;
  if(box)svg.setAttribute('viewBox',box.join(' '));
  const rect=svg.getBoundingClientRect(),unit=box?Math.max(box[2]/Math.max(1,rect.width),box[3]/Math.max(1,rect.height)):1;
  // ① 標出可選的零件：藍框是已固定的底座，褐色虛框是還會動、要先設為底座的零件。
  const isFrame=id=>choices.frames.some(f=>f.id===id),picked=pendingFrame||request.frameId;
  const mark=(n,color,strong)=>{n.setAttribute('stroke',color);n.setAttribute('stroke-opacity',strong?'.85':'.5');
   if(n.tagName==='line')n.setAttribute('stroke-width',String(Math.max(8,(strong?16:11)*unit)));
   else{n.setAttribute('stroke-width',String((strong?3:2)*unit));n.setAttribute('fill',color);n.setAttribute('fill-opacity',strong?'.2':'.08');if(!strong)n.setAttribute('stroke-dasharray',`${6*unit} ${4*unit}`);}};
  try{const g=inspectFrameExport(frameConnectorNodes(cs),base.fabrication?.export || {});g?.outlines.forEach(r=>{const n=poly(r,stage?'transparent':'#e2e8f0');if(stage)n.setAttribute('stroke','transparent');if(choices.frames.length===1){n.setAttribute('data-install-member',choices.frames[0].id);if(step===1)mark(n,'#0284c7',picked===choices.frames[0].id);}});}catch{/* Candidate failure is shown in the status, never applied. */}
  const firstMemberIndex=svg.childNodes.length;
  for(const c of cs.filter(c=>['bar','triangle'].includes(c.type))){
   const selected=c.id===request.frameId,color=c.id===request.b?.componentId?'#e88d27':selected?'#0284c7':c.type==='bar'?'#94a3b8':'#f3b35a';
   const members=c.shape==='disk'?[poly(diskOutline(c,pos(c.p1)),color)]:c.type==='bar'?[line(pos(c.p1),pos(c.p2),8,color)]:createPlateGeometry(c,[c.p1,c.p2,c.p3].map(pos)).outlines.map(r=>poly(r,color));
   if(c.shape==='disk')members.forEach(n=>n.setAttribute('fill-opacity','.2'));
   if(stage)members.forEach(n=>{
    const moved=result?.ok&&!isFrame(c.id)&&[c.p1,c.p2,c.p3].filter(Boolean).some(p=>{const a=points?.[p.id]||p,b=P?.[p.id]||p;return Math.hypot(a.x-b.x,a.y-b.y)>.01;});
    n.setAttribute('fill','transparent');n.setAttribute('stroke',moved?'#e88d27':'transparent');n.setAttribute('stroke-width',moved?'2':'8');if(moved)n.setAttribute('stroke-dasharray','3 2');
   });
   if(step===1&&(isFrame(c.id)||choices.rods.some(r=>r.id===c.id)))members.forEach(n=>mark(n,isFrame(c.id)?'#0284c7':'#b45309',picked===c.id));
   members.forEach(n=>{n.setAttribute('data-install-member',c.id);n.style.cursor='pointer';});
   for(const p of holes(c)){
    const q=pos(p),dot=draw('circle',{cx:q.x,cy:-q.y,r:3,fill:stage?'transparent':'white',stroke:stage?'transparent':color,'stroke-width':1});
    if(isFrame(c.id)||step===1)dot.setAttribute('data-install-member',c.id);
   }
  }
  if(step===1){
   const size=44*unit;
   for(const c of [...choices.frames,...choices.rods].filter(c=>c.type==='bar')){
    const hit=line(pos(c.p1),pos(c.p2),size,'transparent');hit.setAttribute('data-install-member',c.id);
   }
  }
  // ② 橘色圈是會動零件上可接推桿的孔；已選的孔填滿。
  if(step===2){
   const ids=new Set(),chosen=request.b&&syringeAttachmentHole(choices.rods.find(c=>c.id===request.b.componentId),base.params,request.b);
   const usable=choices.rods.flatMap(c=>holes(c).filter(p=>canPush(c,p)).map(p=>[c,p])),usableIds=new Set(usable.map(([,p])=>p.id));
   // 灰點先畫在下層；同一個孔只要有一個零件推得動就是橘色可點。
   for(const c of choices.rods)for(const p of holes(c)){if(usableIds.has(p.id)||ids.has('grey:'+p.id))continue;ids.add('grey:'+p.id);const q=pos(p);draw('circle',{cx:q.x,cy:-q.y,r:3.5,fill:'#e2e8f0',stroke:'#94a3b8','stroke-width':1,'data-install-unusable':p.id});}
   for(const [c,p] of usable){
    if(ids.has(p.id))continue;ids.add(p.id);const q=pos(p);
    const r=22*unit;
    draw('circle',{cx:q.x,cy:-q.y,r:5,fill:chosen?.id===p.id?'#e88d27':'white',stroke:'#e88d27','stroke-width':2});
    const hit=draw('circle',{cx:q.x,cy:-q.y,r,fill:'transparent','data-quick-output':p.id,role:'button',tabindex:0,'aria-label':`連接 ${plainHole(c,p)}`});
    hit.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pickOutput(p.id);}};
   }
  }
  if(!request.position)return;
  const firstMember=svg.childNodes[firstMemberIndex],actuatorStart=svg.childNodes.length;
  const posDraft=request.position&&[request.position.x,request.position.y].every(Number.isFinite)?request.position: (attachmentFrame(choices.frames.find(c=>c.id===request.frameId),base.params,points)?.p || {x:0,y:0});
  const shape=result?.ok?syringeShape(result.syringe,cs,result.params,P):null;
  const theta=shape?.angle ?? (Number.isFinite(request.axisDeg)?request.axisDeg:0)*Math.PI/180;
  const A=shape?.a || posDraft,at=t=>({x:A.x+Math.cos(theta)*t,y:A.y+Math.sin(theta)*t});
  const tip=shape?.b || at((existing?.spec.lmin ?? 95)+request.extension);
  const bodyLength=existing?.spec.bodyLength ?? 72,diameter=existing?.spec.outerDiameter ?? 17.5;
  const rear=request.barrelOffsetMm ?? existing?.installation?.barrelOffsetMm ?? bodyLength*.7;
  line(A,tip,existing?.spec.rodDiameter ?? 8,'#a89f92');line(at(-rear),at(bodyLength-rear),diameter,request.position?'#b4d6d0':'#d7e5e4');
  if(request.position){const side={x:-Math.sin(theta)*SYRINGE_EAR_MM,y:Math.cos(theta)*SYRINGE_EAR_MM};line({x:A.x-side.x,y:A.y-side.y},{x:A.x+side.x,y:A.y+side.y},8,'#647574');
   if(shape?.pivot){const nx=-Math.sin(theta),ny=Math.cos(theta),s=shape.pivotEar,free={x:shape.anchor.x-2*SYRINGE_EAR_MM*s*nx,y:shape.anchor.y-2*SYRINGE_EAR_MM*s*ny};
    draw('circle',{cx:free.x,cy:-free.y,r:3.5,fill:'white',stroke:'#64748b','stroke-width':1,'stroke-dasharray':'2 2'});
    draw('circle',{cx:shape.anchor.x,cy:-shape.anchor.y,r:4.5,fill:'#0e7490',stroke:'white','stroke-width':1.5});}}
  if(firstMember)for(const node of [...svg.childNodes].slice(actuatorStart))svg.insertBefore(node,firstMember);
  const dot=(p,color,data,label)=>{
   const group=draw('g',{});group.style.cursor='grab';
   const visible=draw('circle',{cx:p.x,cy:-p.y,r:8*unit,fill:color,stroke:'white','stroke-width':2*unit});group.append(visible);
   const text=draw('text',{x:p.x,y:-p.y-14*unit,'font-size':12*unit,fill:color,stroke:'white','stroke-width':3*unit,'paint-order':'stroke','text-anchor':'middle','pointer-events':'none'});text.textContent=label;group.append(text);
   const hit=draw('circle',{cx:p.x,cy:-p.y,r:22*unit,fill:'transparent',[data]:'true',role:'button',tabindex:0,'aria-label':label});group.append(hit);
   hit.onkeydown=e=>{const keys={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]};if(!keys[e.key])return;e.preventDefault();if(data==='data-install-angle'){setAngle(request.axisDeg+(keys[e.key][0]||keys[e.key][1]));changed();update();}else shift(...keys[e.key]);svg.querySelector(`[${data}]`)?.focus();};
  };
  if(request.position){if(request.mountMode!=='pivot'&&request.b){const distance=Math.max(65,66*unit),center=keepEar.checked?rotateClampAboutEar(A,request.axisDeg,request.axisDeg).ear:A,handle={x:center.x+Math.cos(theta)*distance,y:center.y+Math.sin(theta)*distance};line(A,handle,1.5*unit,'#e87911');const arrow=at(distance-10*unit),normal={x:-Math.sin(theta)*5*unit,y:Math.cos(theta)*5*unit};poly([handle,{x:arrow.x+normal.x,y:arrow.y+normal.y},{x:arrow.x-normal.x,y:arrow.y-normal.y}],'#e87911');dot(handle,'#e87911','data-install-angle','轉方向');}dot(shape?.anchor||A,'#0284c7','data-install-position',request.mountMode==='pivot'?'轉軸位置':'固定環位置');}

 }
 const pointer=e=>{const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());return {x:p.x,y:-p.y};};
 const onFrame=p=>syringePositionOnFrame(choices.frames.find(c=>c.id===request.frameId),base.params,points,p,base)||p;
 const drag=e=>{const p=pointer(e);if(dragging==='position')request.position=onFrame({x:p.x+(dragOffset?.x||0),y:p.y+(dragOffset?.y||0)});else if(dragging==='angle'&&request.position){const center=keepEar.checked?rotateClampAboutEar(request.position,request.axisDeg,request.axisDeg).ear:request.position;setAngle(Math.round(Math.atan2(p.y-center.y,p.x-center.x)*180/Math.PI));}changed();update();};
 function connectOutput(c,k){
  const h=holes(c).find(h=>h.key===k);if(!h)return;request.b={componentId:c.id,u:h.u,v:h.v};outputOptions=[];viewStep=null;frameNote='';outputNote='';changed();update();
 }
 function pickOutput(id){
  outputOptions=choices.rods.flatMap(c=>holes(c).filter(h=>h.id===id&&canPush(c,h)).map(h=>({c,k:h.key})));
  if(outputOptions.length===1)connectOutput(outputOptions[0].c,outputOptions[0].k);else update();
 }
 svg.onpointerdown=e=>{
  e.preventDefault();e.stopPropagation();
  const output=e.target.getAttribute('data-quick-output');if(output){pickOutput(output);return;}
  if(e.target.hasAttribute('data-install-angle')&&request.position)dragging='angle';
  else if(e.target.hasAttribute('data-install-position')&&request.position)dragging='position';
  else {
   const id=e.target.getAttribute('data-install-member');
   // ① 點已固定的零件就選它並放下固定環；點還會動的零件只標出來，等學生按「設為不動的底座」。
   if(choices.frames.some(c=>c.id===id)){request.frameId=id;focusBox=null;if(shownStep===1){pendingFrame='';frameNote='';viewStep=null;}}
   else {const c=choices.rods.find(c=>c.id===id);if(c){if(shownStep===1){pendingFrame=c.id;frameNote='';update();}else{const h=holes(c).find(h=>h.type!=='fixed'&&canPush(c,h));if(h)connectOutput(c,h.key);else{outputNote=stuck(c);update();}}}return;}
   dragging='position';
  }
  const p=pointer(e);dragOffset=e.target.hasAttribute('data-install-position')&&request.position?{x:request.position.x-p.x,y:request.position.y-p.y}:null;
  if(e.isTrusted)svg.setPointerCapture(e.pointerId);drag(e);
 };
 svg.onpointermove=e=>{if(dragging)drag(e);};
 svg.onpointerup=svg.onpointercancel=()=>{const was=dragging;dragging=false;dragOffset=null;if(was)update();};
 async function scene(token){
  if(!result?.ok)return;const candidate=result;
  try{
   const {buildSyringeInstallPreview}=await import('./syringe-install-preview.js');
   if(closed||token!==revision)return;
   const out=buildSyringeInstallPreview({...candidate,fabrication:base.fabrication,motion}),s=out.model?.syringes?.find(s=>s.id===candidate.syringe.id);
   if(!s){mountStatus.textContent='安裝材料未能建立，請回工作區核對機架。';return;}
   const f=s.mount?.fasteners?.[0];
   const reasons={missing_frame_holes:'此機架尚無配對孔，需另外設計固定座',frame_alignment:'固定孔未對齊',barrel_clearance:'套筒太短，筒身會碰到機架',clamp_diameter:'筒身超出參考管夾內徑',mount_hole_diameter:'固定孔小於參考 M3 軸／螺絲直徑',clamp_fastener_clearance:'24 mm 配對孔已對齊；現有參考環壁與耳孔／M3 墊片干涉，固定架待改製核對'};
   mountStatus.textContent=(f?`${request.mountMode==='pivot'?'只鎖一顆螺絲當轉軸（另一耳不鎖）':'兩顆螺絲固定'} · 裝在板子${request.face==='back'?'後面':'前面'} · 套筒 ${f.spacerHeight.toFixed(1)} mm。`:reasons[s.mount?.reason] || '固定座待核對。')+(s.alignmentMm===null?' 推桿高度未驗證。':Math.abs(s.alignmentMm)>.1?` 推桿與連接件差 ${Math.abs(s.alignmentMm).toFixed(1)} mm，請調整套筒或連接件疊放層。`:' 推桿與連接件中心層已對齊。');
   if(preview3d){if(!viewer){const {createViewer}=await import('../blocks3d/viewer.js');if(closed||token!==revision)return;viewer=createViewer(space);}viewer.update(out.model);}
  }catch(e){if(!closed&&token===revision)mountStatus.textContent=`安裝預覽未完成：${e.message}`;}
 }
 function update(){
  revision++;approvedRevision=null;next.textContent='確認安裝';clearTimeout(sceneTimer);clearTimeout(checkTimer);
  if(autoAxis&&request.position&&request.b){const p=attachmentPoint(request.b,base.comps,base.params,points);if(p){request.axisDeg=Math.atan2(p.y-request.position.y,p.x-request.position.x)*180/Math.PI;autoAxis=false;}}
  const positionOK=request.position&&[request.position.x,request.position.y,request.axisDeg].every(Number.isFinite);
  const owner=choices.frames.find(c=>c.id===request.frameId),f=owner&&attachmentFrame(owner,base.params,points);
  let onSelectedFrame=!!(positionOK&&f);
  if(onSelectedFrame){const projected=onFrame(request.position);onSelectedFrame=Math.hypot(projected.x-request.position.x,projected.y-request.position.y)<1e-6;}
  result=onSelectedFrame&&request.b?planPlacedSyringe(base,request,points,motion):null;
  // 建議安裝方式：用同一個規劃器試另一種方式（拖曳中不算）。目前方式推不動、另一種推得動時預選一次；學生自己選過就不覆寫。
  const choiceKey=result&&!dragging?JSON.stringify([request.frameId,request.b,request.position,request.axisDeg]):'';
  if(choiceKey&&choiceKey!==suggestKey){
   suggestKey=choiceKey;const other=request.mountMode==='pivot'?'fixed-axis':'pivot',alt=planPlacedSyringe(base,{...request,mountMode:other},points,motion);
   suggestion=suggestMountMode({[request.mountMode]:!!result.ok&&!result.temporary,[other]:!!alt.ok&&!alt.temporary});
   // 目前位置兩種都推不動時，改用孔的接法判斷：只有一種接法可行就先選它，位置在 ③ 再調。
   const rodC=choices.rods.find(c=>c.id===request.b.componentId),hole=rodC&&syringeAttachmentHole(rodC,base.params,request.b),st=hole&&modesOf(rodC,hole);
   if(!suggestion?.mode&&st&&st['fixed-axis']!==st.pivot)suggestion=suggestMountMode(st);
   if(!modeTouched&&suggestion?.mode&&suggestion.mode!==request.mountMode){request.mountMode=suggestion.mode;modeTouched=true;preview3d=false;update();return;}
  }else if(!request.b)suggestion=null;
  const pivot=request.mountMode==='pivot';
  zoom.disabled=!request.position;zoom.textContent=focusClamp?'看整個機構':'放大固定環';zoom.setAttribute('aria-pressed',String(focusClamp));
  ear.closest('label').hidden=!pivot;
  frame.value=pendingFrame||request.frameId;rod.value=request.b?.componentId||'';end.replaceChildren();
  const selectedRod=choices.rods.find(c=>c.id===request.b?.componentId),rodHoles=selectedRod?holeNames(holes(selectedRod)):new Map();
  for(const h of holes(selectedRod))option(end,rodHoles.get(h.key)+(request.frameId&&!canPush(selectedRod,h)?'（推不動）':''),h.key);
  const chosenHole=syringeAttachmentHole(selectedRod,base.params,request.b);end.value=chosenHole?.key||'';
  outputCoords.textContent=chosenHole?`推桿孔：沿零件第一孔→第二孔 ${chosenHole.u.toFixed(1)} mm、偏移 ${chosenHole.v.toFixed(1)} mm。`:'';
  ear.value=String(result?.ok&&result.syringe?.pivotEar===-1||request.pivotEar===-1&&!(result?.ok)?-1:1);
  rotationOptions.hidden=pivot;angle.disabled=pivot;angle.closest('label').hidden=pivot;
  const lineFrame=false;
  nudges[0].textContent=lineFrame?'往第一孔':'← 左移';nudges[3].textContent=lineFrame?'往第二孔':'右移 →';nudges[1].hidden=nudges[2].hidden=lineFrame;
  nudges.forEach(b=>b.disabled=!request.position);
  offset.max=(existing?.spec.bodyLength ?? 72)-6;
  if(document.activeElement!==offset)showNumber(offset,request.barrelOffsetMm ?? existing?.installation?.barrelOffsetMm ?? (existing?.spec.bodyLength ?? 72)*.7);
  offsetReading.textContent=`距筒尾 ${Number(offset.value).toFixed(1)} mm`;
  outputChoices.replaceChildren();for(const {c,k} of outputOptions){const b=el('button',`連接 ${plainHole(c,holes(c).find(h=>h.key===k))}`,outputChoices);b.onclick=()=>connectOutput(c,k);}
  faces.forEach((b,i)=>b.setAttribute('aria-pressed',String(request.face===(i?'back':'front'))));
  // 打到一半的數字（例如只有「-」）在請求裡是 NaN，不能被重畫蓋掉；欄位在未顯示的步驟裡也一樣。
  for(const [input,value] of [[px,request.position?.x],[py,request.position?.y],[angle,request.axisDeg]])if(document.activeElement!==input&&!Number.isNaN(value))showNumber(input,value);
  const planOk=!!result?.ok&&!result.temporary;
  const prog=installProgress({frameId:pendingFrame||request.frameId,frameFixed:!pendingFrame&&!!owner&&!!request.position,output:!!request.b,onFrame:!positionOK||onSelectedFrame,planOk,requested:viewStep});
  const stepChanged=prog.step!==shownStep;shownStep=prog.step;
  panels.forEach((p,i)=>{p.hidden=i+1!==prog.step;});
  const frameName=names.get(request.frameId)||'',holeText=plainHole(selectedRod,chosenHole);
  stepButtons.forEach((b,i)=>{const k=i+1,done=k<prog.auto&&k<3,value=k===1?frameName:holeText;
   b.textContent=done?`✓ ${'①②'[i]} ${value}`:['① 固定在哪','② 推哪個孔','③ 調整試推'][i];b.disabled=k>prog.auto;b.classList.toggle('done',done);
   b.setAttribute('aria-label',INSTALL_STEPS[i]+(done?`已選「${value}」，按此更改`:''));
   if(k===prog.step)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
  frameStatus.textContent=[pendingFrame?`「${names.get(pendingFrame)}」現在還會動；針筒要鎖在不動的零件上，推的時候才不會跟著跑。${setFrame?'':'請先在零件操作把它設為機架。'}`:'',!pendingFrame&&!choices.frames.length?'這個作品還沒有不動的零件：點一個板子或桿件，再把它設為不動的底座。':'',frameNote].filter(Boolean).join(' ');
  setFrameButton.hidden=!pendingFrame||!setFrame;
  outputStatus.textContent=prog.step!==2?'':outputNote||(choices.rods.some(c=>holes(c).some(h=>canPush(c,h)))?'':'目前沒有推得動的孔：會動的零件還沒接到底座。先把一根桿的一端接在固定的孔上當擺臂（推桿可直接推擺臂上的孔），或再用短連桿接到擺臂（推桿推短連桿的端孔）。');
  modeInputs.forEach(n=>{n.checked=n.value===request.mountMode;});
  modeHint.textContent=suggestion?.text||'';
  advancedSummary.textContent=`進階：${MODE_TEXT[request.mountMode]}・裝在板子${request.face==='back'?'後面':'前面'}`;
  const planMessage=request.position&&!positionOK?'請輸入完整的座標與角度數字。':result&&!result.ok?result.message:'';
  missingLine.textContent=confirmLine({...prog,message:planMessage,summary:prog.ready?installSummary({frame:frameName,hole:holeText,mode:request.mountMode,face:request.face}):''});
  error.textContent='';
  next.disabled=!prog.ready;
  snap.disabled=!request.frameId||!request.position;
  if(!planOk)mountStatus.textContent=request.frameId?'固定位置尚未有效，請調整後查看 3D。':'請選擇管夾固定的機架。';
  toggle.disabled=stroke.disabled=scan.disabled=!result?.ok;if(more)more.disabled=!planOk;spacer.parentElement.hidden=auto.value==='auto';reading.textContent=`伸出 ${request.extension.toFixed(1)} / ${result?.syringe?.spec.stroke ?? stroke.max} mm`;
  if(result?.syringe)stroke.max=result.syringe.spec.stroke;
  const show3d=preview3d&&planOk;space.hidden=!show3d;svg.toggleAttribute('hidden',!!show3d);if(stage){svg.style.display=show3d?'none':'';space.style.height=show3d?'180px':'';}toggle.textContent=preview3d?'回到平面':'查看 3D';
  hint.textContent=prog.step===1?(pendingFrame?'按下方「把它設為不動的底座」，或改點藍框的零件。':'點畫布上框起來的板子或桿件（藍框是已固定的）。'):prog.step===2?`${frameNote}點畫布上橘色圈起來的孔，推桿會接在那裡；灰色的孔推不動機構。`:pivot?'拖藍點移動轉軸，拖「試動伸出量」試推。':'拖藍點移固定環、橘點轉方向，拖「試動伸出量」試推。';
  const shown=check.textContent;
  check.textContent=!request.b||!request.position?'':planOk?(/^[✓✗] 推|^✓/.test(shown)?shown:'正在試推…'):`✗ 目前推不動：${planMessage||'請調整位置或方向。'}`;
  if(!show3d)renderDrawing();
  if(planOk){mountStatus.textContent='正在核對安裝高度…';const token=revision,candidate=result;sceneTimer=setTimeout(()=>scene(token),100);
   // 即時試推：沿用「檢查全行程」的同一個掃描，停手 250 ms 後才跑，只顯示結果、不改作品。
   checkTimer=setTimeout(()=>{if(closed||token!==revision)return;check.textContent=strokeCheck(scanSyringe(candidate.comps,candidate.params,candidate.syringe.id,.5,motion),candidate.syringe.spec.stroke);},250);}
  if(stepChanged&&stage)globalThis.requestAnimationFrame?.(keepVisible);
 }
 const fitCanvas=()=>{if(!stage)return;const r=stage.getBoundingClientRect(),panel=dialog.getBoundingClientRect(),ctm=stage.getScreenCTM();if(!ctm)return;const a=new DOMPoint(r.left,r.top).matrixTransform(ctm.inverse()),b=new DOMPoint(innerWidth<=600?r.right:panel.left-12,innerWidth<=600?panel.top-12:r.bottom).matrixTransform(ctm.inverse());const ps=base.comps.flatMap(c=>[c.p1,c.p2,c.p3].filter(Boolean).map(p=>points?.[p.id]||p));if(ps.length&&b.x>a.x&&b.y>a.y)View.fit({minX:Math.min(...ps.map(p=>p.x))-30,maxX:Math.max(...ps.map(p=>p.x))+30,minY:Math.min(...ps.map(p=>p.y))-20,maxY:Math.max(...ps.map(p=>p.y))+20},{x:a.x,y:a.y,width:b.x-a.x,height:b.y-a.y});};
 // 換步驟時面板高度會變；只有零件被面板蓋住才重新置中，不打斷學生自己縮放的畫面。
 const keepVisible=()=>{if(closed||svg.hasAttribute('hidden'))return;const m=svg.getScreenCTM(),r=dialog.getBoundingClientRect();if(!m)return;
  const covered=base.comps.flatMap(c=>[c.p1,c.p2,c.p3].filter(Boolean).map(p=>points?.[p.id]||p)).some(p=>{const q=new DOMPoint(p.x,-p.y).matrixTransform(m);return q.x>r.left&&q.x<r.right&&q.y>r.top&&q.y<r.bottom;});if(covered)fitCanvas();};
 const syncCanvas=()=>{if(!stage)return;const r=stage.getBoundingClientRect();Object.assign(svg.style,{position:'fixed',left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',zIndex:'1100',touchAction:'none'});};
 const stopView=stage?View.onViewChange(()=>{redraw();syncCanvas();renderDrawing();}):()=>{};
 const escape=e=>{if(e.key==='Escape'){e.stopPropagation();dialog.close();}};document.addEventListener('keydown',escape,true);
 const resize=new ResizeObserver(()=>{if(!closed&&!svg.hasAttribute('hidden')){syncCanvas();renderDrawing();}});
 dialog.onclose=()=>{closed=true;revision++;clearTimeout(sceneTimer);clearTimeout(checkTimer);resize.disconnect();stopView();document.removeEventListener('keydown',escape,true);window.removeEventListener('resize',syncCanvas);svg.remove();viewer?.dispose();dialog.remove();};
 document.body.append(dialog);if(stage){document.body.append(svg);zoom.hidden=true;preview.append(hint);dialog.show();syncCanvas();update();fitCanvas();window.addEventListener('resize',syncCanvas);svg.onwheel=e=>{e.preventDefault();View.zoomAt(stage,e.clientX,e.clientY,e.deltaY<0?1.1:1/1.1);};}else{dialog.showModal();update();}
 resize.observe(stage||svg);
 return dialog;
}
