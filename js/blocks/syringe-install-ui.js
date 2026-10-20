import {installationChoices,planPlacedSyringe} from './syringe-installation.js';
import {attachmentFrame,attachmentPoint} from '../core/syringe.js';
import {scanSyringe} from './syringe-operations.js';
import {syringeShape} from './syringe-shape.js';
import {frameConnectorNodes} from './model.js';
import {inspectFrameExport} from './exporters.js';
import {createPlateGeometry} from './plate-geometry.js';

const ns='http://www.w3.org/2000/svg';
const el=(tag,text,parent)=>{const n=document.createElement(tag);if(text)n.textContent=text;parent?.append(n);return n;};
const labelOf=c=>c.name || c.id;
export function openSyringeInstallation({source,points,existing=null,newId,motion={},confirm,remove,advancedSettings}){
 const base=structuredClone(source),choices=installationChoices(base.comps,base.params);
 let step=0,result=null,closed=false,revision=0,viewer=null,sceneTimer=null,preview3d=false,dragging=false;
 const request={id:existing&&base.comps.some(c=>c.id===existing.id)?existing.id:null,newId:newId || existing?.id,
  a:existing?.a?{...existing.a}:null,b:existing?.b?{...existing.b}:null,face:existing?.installation?.face || 'front',spacerMm:existing?.installation?.spacerMm ?? null,extension:existing?.extension ?? 10,position:existing?attachmentPoint(existing.a,base.comps,base.params,points):null,axisDeg:existing?.axisDeg ?? 0,frameId:existing?.a?.componentId || ''};
 // A canvas-picked candidate retains its custom specification before insertion.
 if(existing&&!request.id){base.comps.push(structuredClone(existing));request.id=existing.id;}
 const dialog=el('dialog');dialog.id='syringeInstallation';dialog.className='syringe-install';
 dialog.setAttribute('aria-label','針筒安裝');
 const head=el('header',null,dialog),title=el('strong','針筒安裝',head),cancel=el('button','取消',head);
 const nav=el('nav',null,dialog);nav.setAttribute('aria-label','安裝步驟');
 const names=['放針筒','方向角度','接連桿','固定試動'];
 const tabs=names.map((name,i)=>{const b=el('button',`${i+1} ${name}`,nav);b.onclick=()=>{if(i<=step){step=i;update();}};return b;});
 const preview=el('section',null,dialog);preview.className='install-preview';preview.setAttribute('aria-label','安裝預覽');
 const svg=document.createElementNS(ns,'svg');preview.append(svg);svg.setAttribute('aria-label','放置針筒、拖動位置與方向把手');svg.setAttribute('role','img');
 const space=el('div',null,preview);space.className='install-three';space.hidden=true;
 const hint=el('p','',preview);hint.className='install-hint';
 const body=el('section',null,dialog);body.className='install-options';
 const panels=names.map((name,i)=>{const p=el('section',null,body);el('h3',`${i+1} · ${name}`,p);return p;});
 const field=(p,text,type='select')=>{const label=el('label',text,p),n=el(type,null,label);n.setAttribute('aria-label',text);if(type==='input'){n.type='number';n.step='0.1';}return n;};
 const option=(s,text,value)=>{const o=el('option',text,s);o.value=value;};
 el('p','先在上方點一下放置筒身，再拖動藍點調位置。這一步不用選機架。',panels[0]);
 const px=field(panels[0],'筒身位置 X (mm)','input'),py=field(panels[0],'筒身位置 Y (mm)','input');
 const angle=field(panels[1],'推進方向角度 (°)','input');angle.step='1';
 const directionRow=el('div',null,panels[1]);directionRow.className='install-faces';
 for(const [text,value] of [['向右',0],['向上',90],['向左',180],['向下',-90]]){const b=el('button',text,directionRow);b.onclick=()=>{request.axisDeg=value;changed();update();};}
 el('p','拖橘色方向把手旋轉，或輸入角度。箭頭是推桿伸出的方向；接上連桿時不會自動改成另一個角度。',panels[1]);
 const frame=field(panels[3],'筒身固定在哪個零件？');option(frame,'請選固定機架','');
 choices.frames.forEach(c=>option(frame,labelOf(c),c.id));frame.value=request.frameId;
 el('p','先前已放好針筒，現在才決定管夾鎖在哪。選機架不會偷偷移動針筒。',panels[3]);
 const snap=el('button','移到所選機架',panels[3]);
 const faceRow=el('div',null,panels[3]);faceRow.className='install-faces';
 const faces=['front','back'].map((face,i)=>{const b=el('button',i?'背面':'正面',faceRow);b.onclick=()=>{request.face=face;update();};return b;});
 el('p','管夾孔距 28 mm、孔徑 3.5 mm；正反面及套筒可在 3D 核對。',panels[3]);
 const rod=field(panels[2],'推桿接哪個短連桿？');option(rod,'請選活動短連桿','');choices.rods.forEach(c=>option(rod,labelOf(c),c.id));rod.value=request.b?.componentId || '';
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
 const advancedFields={};
 for(const [key,text] of [['outerDiameter','筒身外徑 (mm)'],['bodyLength','筒身長度 (mm)'],['rodDiameter','推桿寬度 (mm)'],['lmin','最短安裝距離 (mm)'],['stroke','有效行程 (mm)'],['axisDeg','固定軸向 (°)']]){
  const input=field(advanced,text,'input');advancedFields[key]=input;
  input.onchange=()=>{const value=input.value.trim()===''?NaN:Number(input.value);if(key==='axisDeg')request.axisDeg=value;else request.spec={...request.spec,[key]:value};changed();update();};
 }
 el('p','此處檢查幾何運動與安裝高度；管夾、五金、完整干涉與承載仍需實物核對。',panels[3]);
 const more=advancedSettings?el('button','其他尺寸與加工設定',advanced):null;
 if(more)more.onclick=()=>{if(!result?.ok)return;const c=result.syringe;dialog.close();advancedSettings(c);};
 if(remove){const del=el('button','刪除這支針筒',advanced);del.onclick=()=>{remove();dialog.close();};}
 const error=el('p','',body);error.setAttribute('role','status');error.className='install-error';
 const footer=el('footer',null,dialog),back=el('button','上一步',footer),next=el('button','下一步',footer);
 cancel.onclick=()=>dialog.close();back.onclick=()=>{step--;update();};
 next.onclick=()=>{if(step<3){step++;update();}else if(result?.ok&&!result.temporary){const accepted=confirm(result);if(accepted!==false)dialog.close();else error.textContent='作品已變更，請關閉後重新安裝。';}};
 const changed=()=>{scanStatus.textContent='設定已變更，請重新檢查全行程。';};
 frame.onchange=()=>{request.frameId=frame.value;changed();update();};
 const setPosition=()=>{request.position={x:px.value.trim()===''?NaN:Number(px.value),y:py.value.trim()===''?NaN:Number(py.value)};changed();update();};
 px.oninput=py.oninput=setPosition;
 angle.oninput=()=>{request.axisDeg=angle.value.trim()===''?NaN:Number(angle.value);changed();update();};
 snap.onclick=()=>{const owner=choices.frames.find(c=>c.id===request.frameId),f=owner&&attachmentFrame(owner,base.params,points);if(!f||!request.position)return;
  const t=Math.max(0,Math.min(f.length,(request.position.x-f.p.x)*f.x+(request.position.y-f.p.y)*f.y));request.position={x:f.p.x+f.x*t,y:f.p.y+f.y*t};changed();update();};
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
  const bounds=cs.flatMap(c=>[c.p1,c.p2,c.p3].filter(Boolean).map(pos));
  if(!viewBox&&bounds.length){const xs=bounds.map(p=>p.x),ys=bounds.map(p=>-p.y),x=Math.min(...xs)-70,y=Math.min(...ys)-45;viewBox=[x,y,Math.max(...xs)-x+55,Math.max(...ys)-y+45];}
  if(viewBox)svg.setAttribute('viewBox',viewBox.join(' '));
  try{const g=inspectFrameExport(frameConnectorNodes(cs),base.fabrication?.export || {});g?.outlines.forEach(r=>poly(r,'#e2e8f0'));}catch{/* Candidate failure is shown in the status, never applied. */}
  const firstMemberIndex=svg.childNodes.length;
  for(const c of cs.filter(c=>['bar','triangle'].includes(c.type))){
   const selected=step===3?c.id===request.frameId:step===2&&c.id===request.b?.componentId,color=selected?'#0284c7':c.type==='bar'?'#94a3b8':'#f3b35a';
   const members=c.type==='bar'?[line(pos(c.p1),pos(c.p2),8,color)]:createPlateGeometry(c,[c.p1,c.p2,c.p3].map(pos)).outlines.map(r=>poly(r,color));
   members.forEach(n=>{n.setAttribute('data-install-member',c.id);n.style.cursor='pointer';n.onclick=()=>{if(step===3&&choices.frames.some(f=>f.id===c.id)){frame.value=c.id;frame.onchange();}};});
   for(const [i,p] of [c.p1,c.p2].entries()){
    const q=pos(p),dot=draw('circle',{cx:q.x,cy:-q.y,r:3,fill:'white',stroke:color,'stroke-width':1});
    if(step===2&&choices.rods.some(r=>r.id===c.id)){const hit=draw('circle',{cx:q.x,cy:-q.y,r:9,fill:'transparent',stroke:'none'});hit.style.cursor='pointer';hit.onclick=()=>{rod.value=c.id;end.value=String(i);setRod();};}
   }
  }
  const firstMember=svg.childNodes[firstMemberIndex],actuatorStart=svg.childNodes.length;
  const posDraft=request.position&&[request.position.x,request.position.y].every(Number.isFinite)?request.position: (viewBox?{x:viewBox[0]+70,y:-(viewBox[1]+viewBox[3]/2)}:{x:0,y:0});
  const theta=(Number.isFinite(request.axisDeg)?request.axisDeg:0)*Math.PI/180;
  const shape=step>=2&&result?.ok?syringeShape(result.syringe,cs,result.params,P):null;
  const A=shape?.a || posDraft,at=t=>({x:A.x+Math.cos(theta)*t,y:A.y+Math.sin(theta)*t});
  const tip=shape?.b || at((request.spec?.lmin ?? existing?.spec.lmin ?? 95)+request.extension);
  const bodyLength=request.spec?.bodyLength ?? existing?.spec.bodyLength ?? 72,diameter=request.spec?.outerDiameter ?? existing?.spec.outerDiameter ?? 17.5;
  line(A,tip,request.spec?.rodDiameter ?? existing?.spec.rodDiameter ?? 8,'#a89f92');line(at(-bodyLength*.7),at(bodyLength*.3),diameter,request.position?'#b4d6d0':'#d7e5e4');
  if(step===3&&shape){const side={x:-Math.sin(theta)*14,y:Math.cos(theta)*14};line({x:A.x-side.x,y:A.y-side.y},{x:A.x+side.x,y:A.y+side.y},8,'#647574');}
  if(firstMember)for(const node of [...svg.childNodes].slice(actuatorStart))svg.insertBefore(node,firstMember);
  if(step===2&&request.b){const c=cs.find(c=>c.id===request.b.componentId);if(c){const mid={x:(pos(c.p1).x+pos(c.p2).x)/2,y:(pos(c.p1).y+pos(c.p2).y)/2};const label=draw('text',{x:mid.x,y:-mid.y-7,'font-size':8,fill:'#0369a1',stroke:'white','stroke-width':2,'paint-order':'stroke','text-anchor':'middle'});label.textContent=labelOf(c);}}
  const dot=(p,color,data)=>{draw('circle',{cx:p.x,cy:-p.y,r:6,fill:color,stroke:'white','stroke-width':2});draw('circle',{cx:p.x,cy:-p.y,r:14,fill:'transparent',[data]:'true'});};
  if(step<2){dot(A,'#0284c7','data-install-position');if(step===1){const handle=at(65);line(A,handle,1.5,'#e87911');const arrow=at(55),normal={x:-Math.sin(theta)*5,y:Math.cos(theta)*5};poly([handle,{x:arrow.x+normal.x,y:arrow.y+normal.y},{x:arrow.x-normal.x,y:arrow.y-normal.y}],'#e87911');dot(handle,'#e87911','data-install-angle');}}
 }
 const pointer=e=>{const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());return {x:p.x,y:-p.y};};
 const drag=e=>{const p=pointer(e);if(dragging==='position')request.position={x:Math.round(p.x*10)/10,y:Math.round(p.y*10)/10};else if(dragging==='angle'&&request.position)request.axisDeg=Math.round(Math.atan2(p.y-request.position.y,p.x-request.position.x)*180/Math.PI);changed();update();};
 svg.onpointerdown=e=>{if(step===0)dragging='position';else if(step===1&&e.target.hasAttribute('data-install-angle'))dragging='angle';else if(step===1&&e.target.hasAttribute('data-install-position'))dragging='position';else return;if(e.isTrusted)svg.setPointerCapture(e.pointerId);drag(e);};
 svg.onpointermove=e=>{if(dragging)drag(e);else if(step===0&&!request.position&&e.pointerType==='mouse'){request.position=pointer(e);renderDrawing();request.position=null;}};
 svg.onpointerup=svg.onpointercancel=()=>{dragging=false;};
 async function scene(token){
  if(!result?.ok)return;const candidate=result;
  try{
   const {buildSyringeInstallPreview}=await import('./syringe-install-preview.js');
   if(closed||token!==revision)return;
   const out=buildSyringeInstallPreview({...candidate,fabrication:base.fabrication,motion}),s=out.model?.syringes?.find(s=>s.id===candidate.syringe.id);
   if(!s){mountStatus.textContent='安裝材料未能建立，請回工作區核對機架。';return;}
   const f=s.mount?.fasteners?.[0];
   const reasons={missing_frame_holes:'此機架尚無配對孔，需另外設計固定座',frame_alignment:'固定孔未對齊',barrel_clearance:'套筒太短，筒身會碰到機架',clamp_diameter:'筒身超出參考管夾內徑'};
   mountStatus.textContent=(f?`${request.face==='back'?'背面':'正面'} · 套筒 ${f.spacerHeight.toFixed(1)} mm。`:reasons[s.mount?.reason] || '固定座待核對。')+(s.alignmentMm===null?' 推桿高度未驗證。':Math.abs(s.alignmentMm)>.1?` 推桿與短連桿差 ${Math.abs(s.alignmentMm).toFixed(1)} mm，請調整套筒或短連桿疊放層。`:' 推桿與短連桿中心層已對齊。');
   if(preview3d){if(!viewer){const {createViewer}=await import('../blocks3d/viewer.js');if(closed||token!==revision)return;viewer=createViewer(space);}viewer.update(out.model);}
  }catch(e){if(!closed&&token===revision)mountStatus.textContent=`安裝預覽未完成：${e.message}`;}
 }
 function update(){
  revision++;clearTimeout(sceneTimer);title.textContent=`針筒安裝 · ${step+1}/4`;
  panels.forEach((p,i)=>p.hidden=i!==step);tabs.forEach((b,i)=>{b.disabled=i>step;b.setAttribute('aria-current',i===step?'step':'false');});
  faces.forEach((b,i)=>b.setAttribute('aria-pressed',String(request.face===(i?'back':'front'))));
  for(const [input,value] of [[px,request.position?.x],[py,request.position?.y],[angle,request.axisDeg]])if(document.activeElement!==input)input.value=Number.isFinite(value)?value:'';
  const positionOK=request.position&&[request.position.x,request.position.y,request.axisDeg].every(Number.isFinite);
  result=positionOK&&request.b?planPlacedSyringe(base,{...request,frameId:step===3?request.frameId:''},points,motion):null;
  error.textContent=step>=2&&result&&!result.ok?result.message+(step===3&&!result.temporary?' 可回前面調整位置，或按「移到所選機架」。':''):'';
  back.disabled=step===0;next.textContent=step===3?'確認安裝':'下一步';
  next.disabled=step<2?!positionOK:step===2?!request.b:!result?.ok||result.temporary;
  snap.disabled=!request.frameId;
  if(step===3&&(!result?.ok||result.temporary))mountStatus.textContent=request.frameId?'固定位置尚未有效，請調整後查看 3D。':'請選擇管夾固定的機架。';
  toggle.disabled=stroke.disabled=scan.disabled=!result?.ok;if(more)more.disabled=!result?.ok||result.temporary;spacer.parentElement.hidden=auto.value==='auto';reading.textContent=`伸出 ${request.extension.toFixed(1)} / ${result?.syringe?.spec.stroke ?? stroke.max} mm`;
  if(result?.syringe){stroke.max=result.syringe.spec.stroke;for(const [key,input] of Object.entries(advancedFields))if(document.activeElement!==input)input.value=key==='axisDeg'?result.syringe.axisDeg:result.syringe.spec[key];}
  const show3d=step===3&&preview3d&&result?.ok&&!result.temporary;space.hidden=!show3d;svg.toggleAttribute('hidden',!!show3d);toggle.textContent=preview3d?'回到平面':'查看 3D';
  hint.textContent=step===0?'點一下放針筒；藍點為筒身定位基準':step===1?'拖橘點調角度；箭頭朝推桿伸出方向':step===2?'只選連接孔；固定完成前不試動':'選固定機架後才能試動；確認後才更改作品';
  if(step>=2&&result&&!result.ok)hint.textContent=result.temporary?'尚未固定：保留原連桿姿態，不模擬驅動':'連接或固定無效：保留原姿態，不能試動。';
  if(!show3d)renderDrawing();if(step===3&&result?.ok&&!result.temporary){mountStatus.textContent='正在核對安裝高度…';const token=revision;sceneTimer=setTimeout(()=>scene(token),100);}
 }
 dialog.onclose=()=>{closed=true;revision++;clearTimeout(sceneTimer);viewer?.dispose();dialog.remove();};
 document.body.append(dialog);dialog.showModal();update();
 return dialog;
}
