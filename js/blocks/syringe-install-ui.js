import {installationChoices,planPlacedSyringe} from './syringe-installation.js';
import {attachmentFrame,attachmentPoint} from '../core/syringe.js';
import {scanSyringe} from './syringe-operations.js';
import {syringeShape} from './syringe-shape.js';
import {frameConnectorNodes} from './model.js';
import {inspectFrameExport} from './exporters.js';
import {createPlateGeometry} from './plate-geometry.js';
import {syringePositionOnFrame} from './syringe-position.js';
import {diskOutline} from './disk-plate.js';
import {actuatorSteps} from './actuator-installation.js';
import {signedNumberInput,showNumber,readNumber} from './numeric-input.js';

const ns='http://www.w3.org/2000/svg';
const el=(tag,text,parent)=>{const n=document.createElement(tag);if(text)n.textContent=text;parent?.append(n);return n;};
const labelOf=c=>c.name || c.id;
export function openSyringeInstallation({source,points,existing=null,newId,motion={},confirm,remove,advancedSettings}){
 const base=structuredClone(source),choices=installationChoices(base.comps,base.params);
 let step=existing&&source.comps.some(c=>c.id===existing.id)?3:0,furthest=step,result=null,closed=false,revision=0,viewer=null,sceneTimer=null,preview3d=false,dragging=false,focusClamp=!!existing,focusBox=null,dragOffset=null;
 const request={id:existing&&base.comps.some(c=>c.id===existing.id)?existing.id:null,newId:newId || existing?.id,
  mountMode:existing?.mountMode==='pivot'?'pivot':'fixed-axis',pivotEar:existing?.mountMode==='pivot'?existing.pivotEar:undefined,
  a:existing?.a?{...existing.a}:null,b:existing?.b?{...existing.b}:null,face:existing?.installation?.face || 'front',spacerMm:existing?.installation?.spacerMm ?? null,extension:existing?.extension ?? 10,position:existing?attachmentPoint(existing.a,base.comps,base.params,points):null,axisDeg:existing?.axisDeg ?? 0,frameId:existing?.a?.componentId || ''};
 // A canvas-picked candidate retains its custom specification before insertion.
 if(existing&&!request.id){base.comps.push(structuredClone(existing));request.id=existing.id;}
 let quick=true,quickStage=existing?'ready':'frame',autoAxis=!existing,outputOptions=[];
 step=3;
 const dialog=el('dialog');dialog.id='syringeInstallation';dialog.className='syringe-install';
 dialog.setAttribute('aria-label','針筒安裝');
 const head=el('header',null,dialog),title=el('strong','針筒安裝',head),cancel=el('button','取消',head);
 const nav=el('nav',null,dialog);nav.setAttribute('aria-label','安裝步驟');
 const names=actuatorSteps;
 const tabs=names.map((name,i)=>{const b=el('button',`${i+1} ${name}`,nav);b.onclick=()=>{if(i<=furthest){step=i;update();}};return b;});
 const preview=el('section',null,dialog);preview.className='install-preview';preview.setAttribute('aria-label','安裝預覽');
 const svg=document.createElementNS(ns,'svg');preview.append(svg);svg.setAttribute('aria-label','放置針筒、拖動位置與方向把手');svg.setAttribute('role','group');
 const space=el('div',null,preview);space.className='install-three';space.hidden=true;
 const zoom=el('button','看整個機構',preview);zoom.className='install-zoom';zoom.onclick=()=>{focusClamp=!focusClamp;focusBox=null;update();};
 const hint=el('p','',preview);hint.className='install-hint';
 const body=el('section',null,dialog);body.className='install-options';
 const quickPanel=el('section',null,body),quickHint=el('p',null,quickPanel),quickOptions=el('div',null,quickPanel);
 quickOptions.className='install-faces';
 const moveClamp=el('button','移動固定環',quickPanel);
 moveClamp.onclick=()=>{quick=false;step=1;furthest=3;focusClamp=true;focusBox=null;preview3d=false;frame.value=request.frameId;update();};
 const reselect=el('button','換固定位置／孔位',quickPanel),adjust=el('button','調整安裝',quickPanel);
 reselect.onclick=()=>{quickStage='frame';preview3d=false;outputOptions=[];update();};
 adjust.onclick=()=>{quick=false;installationMore.open=true;step=existing?3:0;furthest=result?.ok?3:0;frame.value=request.frameId;rod.value=request.b?.componentId||'';end.value=request.b?.u>0?'1':'0';update();};
 const panels=names.map((name,i)=>{const p=el('section',null,body);el('h3',`${i+1} · ${name}`,p);return p;});
 const field=(p,text,type='select')=>{const label=el('label',text,p),n=el(type,null,label);n.setAttribute('aria-label',text);if(type==='input'){n.type='number';n.step='0.1';}return n;};
 const option=(s,text,value)=>{const o=el('option',text,s);o.value=value;};
 const mode=field(body,'固定環與底板的連接');option(mode,'固定安裝 · 雙孔鎖固','fixed-axis');option(mode,'可轉安裝 · 固定環只鎖一顆螺絲','pivot');
 const modeHint=el('p','',body);body.prepend(mode.parentElement,modeHint);
 // 可轉安裝：同一個雙耳固定環，只鎖一耳。沿推進方向（固定環往推桿）看，+1 是左耳、-1 是右耳。
 const ear=field(body,'鎖哪一耳（沿推進方向看）');option(ear,'鎖左耳 · 另一耳（右）不鎖','1');option(ear,'鎖右耳 · 另一耳（左）不鎖','-1');modeHint.after(ear.parentElement);mode.parentElement.classList.add('wide');ear.parentElement.classList.add('wide');
 ear.onchange=()=>{request.pivotEar=Number(ear.value)===-1?-1:1;preview3d=false;changed();update();};
 mode.value=request.mountMode;mode.onchange=()=>{request.mountMode=mode.value;preview3d=false;changed();update();};
 el('p','先選針筒的固定機架，可點預覽中的零件或使用清單；下一步再放針筒、調位置與角度。',panels[0]);
 const positionHint=el('p','',panels[1]);
 const nudge=el('div',null,panels[1]);nudge.className='install-nudge';
 const stepSize=field(panels[1],'每次移動');option(stepSize,'1 mm','1');option(stepSize,'5 mm','5');
 const shift=(dx,dy)=>{if(!request.position)return;const owner=choices.frames.find(c=>c.id===request.frameId),f=owner&&attachmentFrame(owner,base.params,points),d=Number(stepSize.value);
  const along=owner?.type==='bar'&&owner.shape!=='disk';
  request.position=onFrame({x:request.position.x+d*(along?dx*f.x:dx),y:request.position.y+d*(along?dx*f.y:dy)});changed();update();};
 const nudges=[['← 左移',-1,0],['↑ 上移',0,1],['↓ 下移',0,-1],['右移 →',1,0]].map(([text,x,y])=>{const b=el('button',text,nudge);b.onclick=()=>shift(x,y);return b;});
 const precise=el('details',null,panels[1]);el('summary','精確座標與角度',precise);
 const px=field(precise,'固定位置 X (mm)','input'),py=field(precise,'固定位置 Y (mm)','input');
 const angle=field(precise,'推進方向角度 (°)','input');angle.step='1';
 for(const n of [px,py,angle])signedNumberInput(n);
 const directionRow=el('div',null,panels[1]);directionRow.className='install-faces';
 for(const [text,value] of [['向右',0],['向上',90],['向左',180],['向下',-90]]){const b=el('button',text,directionRow);b.onclick=()=>{request.axisDeg=value;changed();update();};}
 const directionHint=el('p','拖橘色方向把手旋轉，或輸入角度。箭頭是推桿伸出的方向；接上連桿時不會自動改成另一個角度。',panels[1]);
 const frame=field(panels[0],'筒身固定在哪個零件？');option(frame,'請選固定機架','');
 choices.frames.forEach(c=>option(frame,labelOf(c),c.id));frame.value=request.frameId;
 const frameSummary=el('p','',panels[3]);
 const snap=el('button','移到所選機架',panels[1]);
 const faceRow=el('div',null,panels[0]);faceRow.className='install-faces';
 const faces=['front','back'].map((face,i)=>{const b=el('button',i?'背面':'正面',faceRow);b.onclick=()=>{request.face=face;update();};return b;});
 el('p','筒身與固定環夾牢，固定環再接到所選固定機架。雙耳參考孔距 28 mm；可轉安裝同一個固定環只鎖一耳當轉軸、另一耳不鎖；孔徑與實際夾持方式仍需核對。活動承載零件尚未支援。',panels[0]);
 const rod=field(panels[2],'推桿接哪個零件？');option(rod,'請選活動連桿／圓盤','');choices.rods.forEach(c=>option(rod,labelOf(c),c.id));rod.value=request.b?.componentId || '';
 const end=field(panels[2],'連接端孔');option(end,'第一孔','0');option(end,'第二孔','1');
 end.value=request.b?.u>0?'1':'0';
 el('p','選推桿接孔；此時只標記連接位置。完成下一步的機架固定後才能試動。',panels[2]);
 const toggle=el('button','查看 3D',panels[3]);toggle.onclick=()=>{preview3d=!preview3d;update();};
 const auto=field(panels[3],'套筒高度');option(auto,'自動估算（優先對齊）','auto');option(auto,'自行輸入套筒長度','manual');auto.value=request.spacerMm===null?'auto':'manual';
 const spacer=field(panels[3],'套筒長度 (mm)','input');spacer.min=0;spacer.max=100;spacer.value=request.spacerMm ?? 5;
 const stroke=field(panels[3],'試動伸出量 (mm)','input');stroke.type='range';stroke.min=0;stroke.step='.1';stroke.max=existing?.spec.stroke ?? 20;stroke.value=request.extension;
 const reading=el('output','',panels[3]),mountStatus=el('p','',panels[3]);mountStatus.setAttribute('role','status');
 const scan=el('button','檢查全行程',panels[3]),scanStatus=el('p','尚未檢查全行程。',panels[3]);scanStatus.setAttribute('role','status');
 const advanced=el('details',null,panels[3]);el('summary','進階：針筒規格與軸向',advanced);
 const clampSlide=el('div',null,panels[1]);clampSlide.className='install-clamp-slide';
 const offset=field(clampSlide,'固定環在筒身上的位置','input');offset.type='range';offset.min=6;offset.step='0.1';
 const offsetReading=el('output','',clampSlide);
 el('p','往左靠筒尾，往右靠推桿；只調筒身穿過固定環的位置，底板固定孔不移動。',clampSlide);
 precise.before(clampSlide);precise.append(directionRow,directionHint,snap);
 panels[1].querySelector('h3').hidden=true;
 offset.oninput=()=>{request.barrelOffsetMm=readNumber(offset);changed();update();};
 el('p','筒身與固定環保持夾牢；此距離調整筒身穿過固定環的位置，不改 A–B 安裝距離。止滑、夾緊方式與單螺絲轉軸五金尚待實物核對。',advanced);
 const advancedFields={};
 for(const [key,text] of [['outerDiameter','筒身外徑 (mm)'],['bodyLength','筒身長度 (mm)'],['rodDiameter','推桿寬度 (mm)'],['lmin','最短安裝距離（沿筒身軸，mm）'],['stroke','有效行程 (mm)'],['axisDeg','固定軸向 (°)']]){
  const input=field(advanced,text,'input');advancedFields[key]=input;
  if(key==='axisDeg')signedNumberInput(input);
  input.onchange=()=>{const value=readNumber(input);if(key==='axisDeg')request.axisDeg=value;else request.spec={...request.spec,[key]:value};changed();update();};
 }
 el('p','此處檢查幾何運動與安裝高度；管夾、五金、完整干涉與承載仍需實物核對。',panels[3]);
 const more=advancedSettings?el('button','其他尺寸與加工設定',advanced):null;
 if(more)more.onclick=()=>{if(!result?.ok)return;const c=result.syringe;dialog.close();advancedSettings(c);};
 if(remove){const del=el('button','刪除這支針筒',advanced);del.onclick=()=>{remove();dialog.close();};}
 const installationMore=el('details',null,panels[3]);el('summary','更多：安裝、規格與檢查',installationMore);
 for(const n of [frameSummary,toggle,auto.parentElement,spacer.parentElement,mountStatus,scan,scanStatus,advanced])installationMore.append(n);
 const error=el('p','',body);error.setAttribute('role','status');error.className='install-error';
 const footer=el('footer',null,dialog),back=el('button','上一步',footer),next=el('button','下一步',footer);
 cancel.onclick=()=>dialog.close();back.onclick=()=>{step--;update();};
 next.onclick=()=>{if(step<3){step=step===1&&request.b?3:step+1;furthest=Math.max(furthest,step);update();}else if(result?.ok&&!result.temporary){const accepted=confirm(result);if(accepted!==false)dialog.close();else error.textContent='作品已變更，請關閉後重新安裝。';}};
 const changed=()=>{scanStatus.textContent='設定已變更，請重新檢查全行程。';};
 frame.onchange=()=>{request.frameId=frame.value;changed();update();};
 const setPosition=()=>{request.position={x:readNumber(px),y:readNumber(py)};changed();update();};
 px.oninput=py.oninput=setPosition;
 angle.oninput=()=>{request.axisDeg=readNumber(angle);changed();update();};
 snap.onclick=()=>{if(request.position){request.position=onFrame(request.position);changed();update();}};
 const setRod=()=>{const c=choices.rods.find(c=>c.id===rod.value);request.b=c?{componentId:c.id,u:end.value==='1'?Number(base.params[c.lenParam]):0,v:0}:null;changed();update();};
 rod.onchange=setRod;end.onchange=setRod;
 auto.onchange=spacer.oninput=()=>{request.spacerMm=auto.value==='auto'?null:spacer.value.trim()===''?NaN:Number(spacer.value);changed();update();};
 stroke.oninput=()=>{if(!result?.ok)return;request.extension=Number(stroke.value);update();};
 scan.onclick=()=>{if(!result?.ok)return;const r=scanSyringe(result.comps,result.params,result.syringe.id,.5,motion);scanStatus.textContent=r.ok?r.message:`${r.atMm??''} mm：${r.message}`;};
 let viewBox=null;
 function renderDrawing(){
  svg.replaceChildren();const cs=step>=2&&result?.ok?result.comps:base.comps,P=step>=2&&result?.ok?result.points:points;
  const draw=(tag,attrs)=>{const n=document.createElementNS(ns,tag);for(const [k,value] of Object.entries(attrs))n.setAttribute(k,value);svg.append(n);return n;};
  const pos=p=>P?.[p?.id] || p;
  const poly=(ring,color)=>draw('polygon',{points:ring.map(p=>`${p.x},${-p.y}`).join(' '),fill:color,stroke:'#64748b','stroke-width':.8});
  const line=(a,b,width,color)=>draw('line',{x1:a.x,y1:-a.y,x2:b.x,y2:-b.y,stroke:color,'stroke-width':width,'stroke-linecap':'round'});
  const bounds=cs.flatMap(c=>c.shape==='disk'?diskOutline(c,pos(c.p1)):[c.p1,c.p2,c.p3].filter(Boolean).map(pos));
  if(!viewBox&&bounds.length){const xs=bounds.map(p=>p.x),ys=bounds.map(p=>-p.y),x=Math.min(...xs)-70,y=Math.min(...ys)-45;viewBox=[x,y,Math.max(...xs)-x+55,Math.max(...ys)-y+45];}
  if(step===1&&focusClamp&&request.position&&!focusBox){
   const a=request.position,len=request.spec?.bodyLength ?? existing?.spec.bodyLength ?? 72;
   const pad=Math.max(105,len+40),w=pad*2,h=pad*1.6;focusBox=[a.x-w/2,-a.y-h/2,w,h];
  }
  const box=step===1&&focusClamp?focusBox||viewBox:viewBox;
  if(box)svg.setAttribute('viewBox',box.join(' '));
  const rect=svg.getBoundingClientRect(),unit=box?Math.max(box[2]/Math.max(1,rect.width),box[3]/Math.max(1,rect.height)):1;
  try{const g=inspectFrameExport(frameConnectorNodes(cs),base.fabrication?.export || {});g?.outlines.forEach(r=>poly(r,'#e2e8f0'));}catch{/* Candidate failure is shown in the status, never applied. */}
  const firstMemberIndex=svg.childNodes.length;
  for(const c of cs.filter(c=>['bar','triangle'].includes(c.type))){
   const selected=step!==2?c.id===request.frameId:c.id===request.b?.componentId,color=quick&&c.id===request.b?.componentId?'#e88d27':selected?'#0284c7':c.type==='bar'?'#94a3b8':'#f3b35a';
   const members=c.shape==='disk'?[poly(diskOutline(c,pos(c.p1)),color)]:c.type==='bar'?[line(pos(c.p1),pos(c.p2),8,color)]:createPlateGeometry(c,[c.p1,c.p2,c.p3].map(pos)).outlines.map(r=>poly(r,color));
   if(c.shape==='disk')members.forEach(n=>n.setAttribute('fill-opacity','.2'));
   members.forEach(n=>{n.setAttribute('data-install-member',c.id);n.style.cursor='pointer';n.onclick=()=>{if(step===0&&choices.frames.some(f=>f.id===c.id)){frame.value=c.id;frame.onchange();}};});
   for(const [i,p] of [c.p1,c.p2].entries()){
    const q=pos(p),dot=draw('circle',{cx:q.x,cy:-q.y,r:3,fill:'white',stroke:color,'stroke-width':1});
    if(quick&&choices.frames.some(f=>f.id===c.id))dot.setAttribute('data-install-member',c.id);
    if(step===0&&choices.frames.some(f=>f.id===c.id))dot.onclick=()=>{frame.value=c.id;frame.onchange();};
    if(step===2&&choices.rods.some(r=>r.id===c.id)){const hit=draw('circle',{cx:q.x,cy:-q.y,r:9,fill:'transparent',stroke:'none'});hit.style.cursor='pointer';hit.onclick=()=>{rod.value=c.id;end.value=String(i);setRod();};}
   }
  }
  if(quick&&quickStage==='frame'){
   const size=Math.max(12,44*(viewBox?.[2]||300)/Math.max(240,svg.getBoundingClientRect().width));
   for(const c of choices.frames.filter(c=>c.type==='bar')){
    const hit=line(pos(c.p1),pos(c.p2),size,'transparent');hit.setAttribute('data-install-member',c.id);
   }
  }
  if(quick&&quickStage==='output'){
   const ids=new Set();
   for(const c of choices.rods)for(const k of ['p1','p2']){
    const p=c[k];if(ids.has(p.id))continue;ids.add(p.id);const q=pos(p);
    const r=Math.max(10,22*(viewBox?.[2]||300)/Math.max(240,svg.getBoundingClientRect().width));
    draw('circle',{cx:q.x,cy:-q.y,r:5,fill:'white',stroke:'#e88d27','stroke-width':2});
    const hit=draw('circle',{cx:q.x,cy:-q.y,r,fill:'transparent','data-quick-output':p.id,role:'button',tabindex:0,'aria-label':`連接 ${labelOf(c)} 的${k==='p1'?'第一':'第二'}孔`});
    hit.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pickOutput(p.id);}};
   }
  }
  if((step===0&&!existing)||(quick&&quickStage==='frame'&&!request.position))return;
  const firstMember=svg.childNodes[firstMemberIndex],actuatorStart=svg.childNodes.length;
  const posDraft=request.position&&[request.position.x,request.position.y].every(Number.isFinite)?request.position: (attachmentFrame(choices.frames.find(c=>c.id===request.frameId),base.params,points)?.p || {x:0,y:0});
  const pivotPreview=step===1&&request.mountMode==='pivot'&&request.position&&request.b?planPlacedSyringe(base,request,points,motion):null;
  const shape=pivotPreview?.ok?syringeShape(pivotPreview.syringe,pivotPreview.comps,pivotPreview.params,pivotPreview.points):step>=2&&result?.ok?syringeShape(result.syringe,cs,result.params,P):null;
  const theta=shape?.angle ?? (Number.isFinite(request.axisDeg)?request.axisDeg:0)*Math.PI/180;
  const A=shape?.a || posDraft,at=t=>({x:A.x+Math.cos(theta)*t,y:A.y+Math.sin(theta)*t});
  const tip=shape?.b || at((request.spec?.lmin ?? existing?.spec.lmin ?? 95)+request.extension);
  const bodyLength=request.spec?.bodyLength ?? existing?.spec.bodyLength ?? 72,diameter=request.spec?.outerDiameter ?? existing?.spec.outerDiameter ?? 17.5;
  const rear=request.barrelOffsetMm ?? existing?.installation?.barrelOffsetMm ?? bodyLength*.7;
  line(A,tip,request.spec?.rodDiameter ?? existing?.spec.rodDiameter ?? 8,'#a89f92');line(at(-rear),at(bodyLength-rear),diameter,request.position?'#b4d6d0':'#d7e5e4');
  if(step===1||step===3&&shape){const side={x:-Math.sin(theta)*14,y:Math.cos(theta)*14};line({x:A.x-side.x,y:A.y-side.y},{x:A.x+side.x,y:A.y+side.y},8,'#647574');
   if(shape?.pivot){const nx=-Math.sin(theta),ny=Math.cos(theta),s=shape.pivotEar,free={x:shape.anchor.x-28*s*nx,y:shape.anchor.y-28*s*ny};
    draw('circle',{cx:free.x,cy:-free.y,r:3.5,fill:'white',stroke:'#64748b','stroke-width':1,'stroke-dasharray':'2 2'});
    draw('circle',{cx:shape.anchor.x,cy:-shape.anchor.y,r:4.5,fill:'#0e7490',stroke:'white','stroke-width':1.5});}}
  if(firstMember)for(const node of [...svg.childNodes].slice(actuatorStart))svg.insertBefore(node,firstMember);
  if(step===2&&request.b){const c=cs.find(c=>c.id===request.b.componentId);if(c){const mid={x:(pos(c.p1).x+pos(c.p2).x)/2,y:(pos(c.p1).y+pos(c.p2).y)/2};const label=draw('text',{x:mid.x,y:-mid.y-7,'font-size':8,fill:'#0369a1',stroke:'white','stroke-width':2,'paint-order':'stroke','text-anchor':'middle'});label.textContent=labelOf(c);}}
  const dot=(p,color,data,label)=>{
   const group=draw('g',{});group.style.cursor='grab';
   const visible=draw('circle',{cx:p.x,cy:-p.y,r:8*unit,fill:color,stroke:'white','stroke-width':2*unit});group.append(visible);
   const text=draw('text',{x:p.x,y:-p.y-14*unit,'font-size':12*unit,fill:color,stroke:'white','stroke-width':3*unit,'paint-order':'stroke','text-anchor':'middle','pointer-events':'none'});text.textContent=label;group.append(text);
   const hit=draw('circle',{cx:p.x,cy:-p.y,r:22*unit,fill:'transparent',[data]:'true',role:'button',tabindex:0,'aria-label':label});group.append(hit);
   hit.onkeydown=e=>{const keys={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]};if(!keys[e.key])return;e.preventDefault();if(data==='data-install-angle'){request.axisDeg+=(keys[e.key][0]||keys[e.key][1]);changed();update();}else shift(...keys[e.key]);svg.querySelector(`[${data}]`)?.focus();};
  };
  if(step===1){dot(shape?.anchor||A,'#0284c7','data-install-position',request.mountMode==='pivot'?'轉軸位置':'固定環位置');if(request.mountMode!=='pivot'){const distance=Math.max(65,66*unit),handle=at(distance);line(A,handle,1.5*unit,'#e87911');const arrow=at(distance-10*unit),normal={x:-Math.sin(theta)*5*unit,y:Math.cos(theta)*5*unit};poly([handle,{x:arrow.x+normal.x,y:arrow.y+normal.y},{x:arrow.x-normal.x,y:arrow.y-normal.y}],'#e87911');dot(handle,'#e87911','data-install-angle','轉方向');}}

 }
 const pointer=e=>{const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());return {x:p.x,y:-p.y};};
 const onFrame=p=>syringePositionOnFrame(choices.frames.find(c=>c.id===request.frameId),base.params,points,p)||p;
 const drag=e=>{const p=pointer(e);if(dragging==='position')request.position=onFrame({x:p.x+(dragOffset?.x||0),y:p.y+(dragOffset?.y||0)});else if(dragging==='angle'&&request.position)request.axisDeg=Math.round(Math.atan2(p.y-request.position.y,p.x-request.position.x)*180/Math.PI);changed();update();};
 function connectOutput(c,k){
  if(autoAxis){const p=points?.[c[k].id]||c[k];request.axisDeg=Math.atan2(p.y-request.position.y,p.x-request.position.x)*180/Math.PI;}
  request.b={componentId:c.id,u:k==='p2'?Number(base.params[c.lenParam]):0,v:0};quickStage='ready';outputOptions=[];changed();update();
 }
 function pickOutput(id){
  outputOptions=choices.rods.flatMap(c=>['p1','p2'].filter(k=>c[k].id===id).map(k=>({c,k})));
  if(outputOptions.length===1)connectOutput(outputOptions[0].c,outputOptions[0].k);else update();
 }
 svg.onpointerdown=e=>{
  if(quick){
   if(quickStage==='frame'){
    const id=e.target.getAttribute('data-install-member');
    if(!choices.frames.some(c=>c.id===id))return;
    request.frameId=id;request.position=onFrame(pointer(e));request.b=null;quickStage='output';autoAxis=true;changed();update();
   }else if(quickStage==='output'){const id=e.target.getAttribute('data-quick-output');if(id)pickOutput(id);}
   return;
  }
  if(step!==1)return;if(e.target.hasAttribute('data-install-angle')&&request.position)dragging='angle';else dragging='position';const p=pointer(e);dragOffset=e.target.hasAttribute('data-install-position')&&request.position?{x:request.position.x-p.x,y:request.position.y-p.y}:null;if(e.isTrusted)svg.setPointerCapture(e.pointerId);drag(e);
 };
 svg.onpointermove=e=>{if(dragging)drag(e);else if(step===1&&!request.position&&e.pointerType==='mouse'){request.position=onFrame(pointer(e));renderDrawing();request.position=null;}};
 svg.onpointerup=svg.onpointercancel=()=>{dragging=false;dragOffset=null;};
 async function scene(token){
  if(!result?.ok)return;const candidate=result;
  try{
   const {buildSyringeInstallPreview}=await import('./syringe-install-preview.js');
   if(closed||token!==revision)return;
   const out=buildSyringeInstallPreview({...candidate,fabrication:base.fabrication,motion}),s=out.model?.syringes?.find(s=>s.id===candidate.syringe.id);
   if(!s){mountStatus.textContent='安裝材料未能建立，請回工作區核對機架。';return;}
   const f=s.mount?.fasteners?.[0];
   const reasons={missing_frame_holes:'此機架尚無配對孔，需另外設計固定座',frame_alignment:'固定孔未對齊',barrel_clearance:'套筒太短，筒身會碰到機架',clamp_diameter:'筒身超出參考管夾內徑',mount_hole_diameter:'固定孔小於參考 M3 軸／螺絲直徑'};
   mountStatus.textContent=(f?`${request.mountMode==='pivot'?'單螺絲轉軸參考（只鎖一顆 M3，另一耳不鎖）':'雙孔鎖固參考'} · ${request.face==='back'?'背面':'正面'} · 套筒 ${f.spacerHeight.toFixed(1)} mm。`:reasons[s.mount?.reason] || '固定座待核對。')+(s.alignmentMm===null?' 推桿高度未驗證。':Math.abs(s.alignmentMm)>.1?` 推桿與連接件差 ${Math.abs(s.alignmentMm).toFixed(1)} mm，請調整套筒或連接件疊放層。`:' 推桿與連接件中心層已對齊。');
   if(preview3d){if(!viewer){const {createViewer}=await import('../blocks3d/viewer.js');if(closed||token!==revision)return;viewer=createViewer(space);}viewer.update(out.model);}
  }catch(e){if(!closed&&token===revision)mountStatus.textContent=`安裝預覽未完成：${e.message}`;}
 }
 function update(){
  revision++;clearTimeout(sceneTimer);title.textContent=quick?'針筒安裝':`針筒安裝 · ${step+1}/4`;
  dialog.classList.toggle('install-quick',quick);nav.hidden=quick;quickPanel.hidden=!quick;back.hidden=quick;
  panels.forEach((p,i)=>p.hidden=quick?i!==3:i!==step);tabs.forEach((b,i)=>{b.disabled=i>furthest;b.setAttribute('aria-current',i===step?'step':'false');});
  panels[3].querySelector('h3').hidden=quick;
  const pivot=request.mountMode==='pivot';
  zoom.hidden=quick||step!==1;zoom.disabled=!request.position;zoom.textContent=focusClamp?'看整個機構':'放大固定環';zoom.setAttribute('aria-pressed',String(focusClamp));
  mode.parentElement.hidden=modeHint.hidden=!quick&&step!==0;ear.closest('label').hidden=!pivot||(!quick&&step!==0);
  moveClamp.hidden=quickStage!=='ready';
  modeHint.textContent=pivot?'同一個雙耳固定環，只鎖一顆耳螺絲當轉軸；固定環與筒身一起繞它轉，另一耳不鎖。推桿直接接輸出件活動孔，方向由機構決定。':'固定環用雙孔鎖住，筒身方向不變；推桿經短連桿帶動輸出件。';
  ear.value=String(result?.ok&&result.syringe?.pivotEar===-1||request.pivotEar===-1&&!(result?.ok)?-1:1);
  angle.disabled=pivot;angle.closest('label').hidden=pivot;directionRow.hidden=directionHint.hidden=pivot;advancedFields.axisDeg.closest('label').hidden=pivot;
  positionHint.textContent=pivot?'拖藍色「轉軸位置」，或用按鈕微調；單耳螺絲的位置就是轉軸，筒身方向由接孔決定。':'拖藍色「固定環位置」，拖橘色「轉方向」；也可用下方按鈕微調。';
  const lineFrame=choices.frames.find(c=>c.id===request.frameId)?.type==='bar'&&choices.frames.find(c=>c.id===request.frameId)?.shape!=='disk';
  nudges[0].textContent=lineFrame?'往第一孔':'← 左移';nudges[3].textContent=lineFrame?'往第二孔':'右移 →';nudges[1].hidden=nudges[2].hidden=lineFrame;
  nudges.forEach(b=>b.disabled=!request.position);
  offset.max=(request.spec?.bodyLength ?? existing?.spec.bodyLength ?? 72)-6;
  if(document.activeElement!==offset)showNumber(offset,request.barrelOffsetMm ?? existing?.installation?.barrelOffsetMm ?? (request.spec?.bodyLength ?? existing?.spec.bodyLength ?? 72)*.7);
  offsetReading.textContent=`距筒尾 ${Number(offset.value).toFixed(1)} mm`;
  reselect.hidden=quickStage!=='ready';
  quickHint.textContent=quickStage==='frame'?'點藍灰色固定機架上的位置，放置筒身。':quickStage==='output'?'點活動連桿的端孔。預覽會將推進方向對準此孔。':'拖動伸出量試動；需要換接孔時按「換固定位置／孔位」。';
  if(!choices.frames.length)quickHint.textContent='請先在設計畫布建立固定機架；針筒需要真實承載零件。';
  quickOptions.replaceChildren();for(const {c,k} of outputOptions){const b=el('button',`連接 ${labelOf(c)} 的${k==='p1'?'第一':'第二'}孔`,quickOptions);b.onclick=()=>connectOutput(c,k);}
  faces.forEach((b,i)=>b.setAttribute('aria-pressed',String(request.face===(i?'back':'front'))));
  for(const [input,value] of [[px,request.position?.x],[py,request.position?.y],[angle,request.axisDeg]])if(document.activeElement!==input)showNumber(input,value);
  const positionOK=request.position&&[request.position.x,request.position.y,request.axisDeg].every(Number.isFinite);
  const owner=choices.frames.find(c=>c.id===request.frameId),f=owner&&attachmentFrame(owner,base.params,points);
  let onSelectedFrame=!!(positionOK&&f);
  if(onSelectedFrame){const projected=onFrame(request.position);onSelectedFrame=Math.hypot(projected.x-request.position.x,projected.y-request.position.y)<1e-6;}
  result=step===3&&onSelectedFrame&&request.b?planPlacedSyringe(base,request,points,motion):null;
  frameSummary.textContent=`固定機架：${owner?labelOf(owner):'尚未選擇'}`;
  error.textContent=step>=2&&result&&!result.ok?result.message+(quick?' 請換位置／孔位，或用「調整安裝」修改方向。':step===3&&!result.temporary?' 請回第 2 步調整位置與角度，或第 3 步檢查接孔。':''):'';
  if(step===1&&positionOK&&!onSelectedFrame)error.textContent='固定位置超出所選機架，請拖回板內或按「移到所選機架」。';
  back.disabled=step===0;next.textContent=step===3?'確認安裝':step===1&&request.b?'試動確認':'下一步';
  next.disabled=step===0?!f:step===1?!onSelectedFrame:step===2?!request.b:!result?.ok||result.temporary;
  if(quick&&quickStage!=='ready')next.disabled=true;
  snap.disabled=!request.frameId||!request.position;
  if(step===3&&(!result?.ok||result.temporary))mountStatus.textContent=request.frameId?'固定位置尚未有效，請調整後查看 3D。':'請選擇管夾固定的機架。';
  toggle.disabled=stroke.disabled=scan.disabled=!result?.ok;if(more)more.disabled=!result?.ok||result.temporary;spacer.parentElement.hidden=auto.value==='auto';reading.textContent=`伸出 ${request.extension.toFixed(1)} / ${result?.syringe?.spec.stroke ?? stroke.max} mm`;
  if(result?.syringe){stroke.max=result.syringe.spec.stroke;for(const [key,input] of Object.entries(advancedFields))if(document.activeElement!==input)showNumber(input,key==='axisDeg'?result.syringe.axisDeg:result.syringe.spec[key]);}
  const show3d=step===3&&preview3d&&result?.ok&&!result.temporary;space.hidden=!show3d;svg.toggleAttribute('hidden',!!show3d);toggle.textContent=preview3d?'回到平面':'查看 3D';
  hint.textContent=quick?'固定位置 → 連桿端孔 → 試動確認':step===0?'先選固定機架，再放置針筒':step===1?(pivot?'藍色把手移動轉軸位置':'藍色移動固定環 · 橘色轉方向'):step===2?'只選連接孔；第 4 步確認固定後試動':'選固定機架後才能試動；確認後才更改作品';
  if(step>=2&&result&&!result.ok)hint.textContent=result.temporary?'尚未固定：保留原連桿姿態，不模擬驅動':'連接或固定無效：保留原姿態，不能試動。';
  if(!show3d)renderDrawing();if(step===3&&result?.ok&&!result.temporary){mountStatus.textContent='正在核對安裝高度…';const token=revision;sceneTimer=setTimeout(()=>scene(token),100);}
 }
 const resize=new ResizeObserver(()=>{if(!closed&&step===1&&!svg.hasAttribute('hidden'))renderDrawing();});
 dialog.onclose=()=>{closed=true;revision++;clearTimeout(sceneTimer);resize.disconnect();viewer?.dispose();dialog.remove();};
 document.body.append(dialog);dialog.showModal();update();
 resize.observe(svg);
 return dialog;
}
