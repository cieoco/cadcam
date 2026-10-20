import {installationChoices,planSyringeInstallation} from './syringe-installation.js';
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
  a:existing?.a?{...existing.a}:null,b:existing?.b?{...existing.b}:null,face:existing?.installation?.face || 'front',spacerMm:existing?.installation?.spacerMm ?? null,extension:existing?.extension ?? 10};
 // A canvas-picked candidate retains its custom specification before insertion.
 if(existing&&!request.id){base.comps.push(structuredClone(existing));request.id=existing.id;}
 const dialog=el('dialog');dialog.id='syringeInstallation';dialog.className='syringe-install';
 dialog.setAttribute('aria-label','針筒安裝');
 const head=el('header',null,dialog),title=el('strong','針筒安裝',head),cancel=el('button','取消',head);
 const nav=el('nav',null,dialog);nav.setAttribute('aria-label','安裝步驟');
 const names=['選機架','面與位置','接推桿','預覽試動'];
 const tabs=names.map((name,i)=>{const b=el('button',`${i+1} ${name}`,nav);b.onclick=()=>{if(i<=step){step=i;update();}};return b;});
 const preview=el('section',null,dialog);preview.className='install-preview';preview.setAttribute('aria-label','安裝預覽');
 const svg=document.createElementNS(ns,'svg');preview.append(svg);svg.setAttribute('aria-label','點選零件與拖動管夾位置');svg.setAttribute('role','img');
 const space=el('div',null,preview);space.className='install-three';space.hidden=true;
 const hint=el('p','',preview);hint.className='install-hint';
 const body=el('section',null,dialog);body.className='install-options';
 const panels=names.map((name,i)=>{const p=el('section',null,body);el('h3',`${i+1} · ${name}`,p);return p;});
 const field=(p,text,type='select')=>{const label=el('label',text,p),n=el(type,null,label);n.setAttribute('aria-label',text);if(type==='input'){n.type='number';n.step='0.1';}return n;};
 const option=(s,text,value)=>{const o=el('option',text,s);o.value=value;};
 const frame=field(panels[0],'筒身固定在哪個零件？');option(frame,'請選固定機架','');
 choices.frames.forEach(c=>option(frame,labelOf(c),c.id));frame.value=request.a?.componentId || '';
 el('p','選零件清單，或點上方機架。棒狀承托與機架做成同一片。',panels[0]);
 const faceRow=el('div',null,panels[1]);faceRow.className='install-faces';
 const faces=['front','back'].map((face,i)=>{const b=el('button',i?'背面':'正面',faceRow);b.onclick=()=>{request.face=face;update();};return b;});
 el('p','正面／背面以這張設計的板面為準；可在最後一步查看 3D。',panels[1]);
 const u=field(panels[1],'距機架第一孔 (mm)','input'),slide=field(panels[1],'沿桿移動','input');slide.type='range';slide.step='.1';
 const v=field(panels[1],'板件橫向偏移 (mm)','input');
 el('p','也可拖動預覽中的藍色管夾定位點。兩孔間距 28 mm，固定孔徑 3.5 mm。',panels[1]);
 const rod=field(panels[2],'推桿接哪個短連桿？');option(rod,'請選活動短連桿','');choices.rods.forEach(c=>option(rod,labelOf(c),c.id));rod.value=request.b?.componentId || '';
 const end=field(panels[2],'連接端孔');option(end,'第一孔','0');option(end,'第二孔','1');
 end.value=request.b?.u>0?'1':'0';
 el('p','推桿與短連桿用轉軸連接，保留轉動。可直接點預覽中短連桿的端孔。',panels[2]);
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
 next.onclick=()=>{if(step<3){step++;update();}else if(result?.ok){const accepted=confirm(result);if(accepted!==false)dialog.close();else error.textContent='作品已變更，請關閉後重新安裝。';}};
 const changed=()=>{scanStatus.textContent='設定已變更，請重新檢查全行程。';};
 frame.onchange=()=>{request.a=frame.value?{componentId:frame.value,u:0,v:0}:null;changed();update();};
 const setU=value=>{if(request.a)request.a.u=value;changed();update();};
 u.oninput=()=>setU(u.value.trim()===''?NaN:Number(u.value));slide.oninput=()=>setU(Number(slide.value));
 v.oninput=()=>{request.a.v=v.value.trim()===''?NaN:Number(v.value);changed();update();};
 const setRod=()=>{const c=choices.rods.find(c=>c.id===rod.value);request.b=c?{componentId:c.id,u:end.value==='1'?Number(base.params[c.lenParam]):0,v:0}:null;changed();update();};
 rod.onchange=setRod;end.onchange=setRod;
 auto.onchange=spacer.oninput=()=>{request.spacerMm=auto.value==='auto'?null:spacer.value.trim()===''?NaN:Number(spacer.value);changed();update();};
 stroke.oninput=()=>{request.extension=Number(stroke.value);update();};
 scan.onclick=()=>{if(!result?.ok)return;const r=scanSyringe(result.comps,result.params,result.syringe.id,.5,motion);scanStatus.textContent=r.ok?r.message:`${r.atMm??''} mm：${r.message}`;};
 let viewBox=null;
 function renderDrawing(){
  svg.replaceChildren();const cs=result?.ok?result.comps:base.comps,P=result?.ok?result.points:points;
  const draw=(tag,attrs)=>{const n=document.createElementNS(ns,tag);for(const [k,value] of Object.entries(attrs))n.setAttribute(k,value);svg.append(n);return n;};
  const pos=p=>P?.[p?.id] || p;
  const poly=(ring,color)=>draw('polygon',{points:ring.map(p=>`${p.x},${-p.y}`).join(' '),fill:color,stroke:'#64748b','stroke-width':.8});
  const line=(a,b,width,color)=>draw('line',{x1:a.x,y1:-a.y,x2:b.x,y2:-b.y,stroke:color,'stroke-width':width,'stroke-linecap':'round'});
  const bounds=cs.flatMap(c=>[c.p1,c.p2,c.p3].filter(Boolean).map(pos));
  if(!viewBox&&bounds.length){const xs=bounds.map(p=>p.x),ys=bounds.map(p=>-p.y),x=Math.min(...xs)-70,y=Math.min(...ys)-45;viewBox=[x,y,Math.max(...xs)-x+55,Math.max(...ys)-y+45];}
  if(viewBox)svg.setAttribute('viewBox',viewBox.join(' '));
  try{const g=inspectFrameExport(frameConnectorNodes(cs),base.fabrication?.export || {});g?.outlines.forEach(r=>poly(r,'#e2e8f0'));}catch{/* Candidate failure is shown in the status, never applied. */}
  for(const c of cs.filter(c=>['bar','triangle'].includes(c.type))){
   const selected=step<2?c.id===request.a?.componentId:c.id===request.b?.componentId,color=selected?'#0284c7':c.type==='bar'?'#94a3b8':'#f3b35a';
   const members=c.type==='bar'?[line(pos(c.p1),pos(c.p2),8,color)]:createPlateGeometry(c,[c.p1,c.p2,c.p3].map(pos)).outlines.map(r=>poly(r,color));
   members.forEach(n=>{n.style.cursor='pointer';n.onclick=()=>{if(step===0&&choices.frames.some(f=>f.id===c.id)){frame.value=c.id;frame.onchange();}};});
   for(const [i,p] of [c.p1,c.p2].entries()){
    const q=pos(p),dot=draw('circle',{cx:q.x,cy:-q.y,r:3,fill:'white',stroke:color,'stroke-width':1});
    if(step===2&&choices.rods.some(r=>r.id===c.id)){const hit=draw('circle',{cx:q.x,cy:-q.y,r:9,fill:'transparent',stroke:'none'});hit.style.cursor='pointer';hit.onclick=()=>{rod.value=c.id;end.value=String(i);setRod();};}
   }
  }
  if(result?.ok){const s=syringeShape(result.syringe,cs,result.params,P),at=t=>({x:s.a.x+Math.cos(s.angle)*t,y:s.a.y+Math.sin(s.angle)*t});line(s.a,s.b,6,'#a89f92');line(at(s.start),at(s.end),s.r*2,'#b4d6d0');
   const side={x:-Math.sin(s.angle)*14,y:Math.cos(s.angle)*14};line({x:s.a.x-side.x,y:s.a.y-side.y},{x:s.a.x+side.x,y:s.a.y+side.y},8,'#647574');
  }
  if(request.a){const a=attachmentPoint(request.a,cs,base.params,P);if(a&&Number.isFinite(a.x)&&Number.isFinite(a.y)){draw('circle',{cx:a.x,cy:-a.y,r:6,fill:'#0284c7',stroke:'white','stroke-width':2});draw('circle',{cx:a.x,cy:-a.y,r:14,fill:'transparent','data-install-seat':'true'});}}
 }
 const drag=e=>{if(step!==1||!request.a)return;const pt=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse()),owner=base.comps.find(c=>c.id===request.a.componentId),f=attachmentFrame(owner,base.params,points);if(!f)return;
  const dx=pt.x-f.p.x,dy=-pt.y-f.p.y;request.a.u=Math.round(Math.max(0,Math.min(f.length,dx*f.x+dy*f.y))*10)/10;request.a.v=owner.type==='triangle'?Math.round((-dx*f.y+dy*f.x)*10)/10:0;changed();update();};
 svg.onpointerdown=e=>{if(step!==1||!e.target.hasAttribute('data-install-seat'))return;dragging=true;svg.setPointerCapture(e.pointerId);drag(e);};
 svg.onpointermove=e=>{if(dragging)drag(e);};svg.onpointerup=svg.onpointercancel=()=>{dragging=false;};
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
  const owner=choices.frames.find(c=>c.id===request.a?.componentId),f=owner&&attachmentFrame(owner,base.params,points);
  u.value=Number.isFinite(request.a?.u)?request.a.u:'';u.min=0;u.max=slide.max=f?.length || 0;slide.value=u.value;u.disabled=slide.disabled=owner?.type==='anchor';v.value=request.a?.v ?? 0;v.parentElement.hidden=owner?.type!=='triangle';
  result=request.a&&request.b?planSyringeInstallation(base,request,points,motion):null;
  error.textContent=result&&!result.ok?result.message:'';
  back.disabled=step===0;next.textContent=step===3?'確認安裝':'下一步';
  next.disabled=step<2?!request.a||!Number.isFinite(request.a.u)||!f||request.a.u<0||request.a.u>f.length:!result?.ok;
  scan.disabled=!result?.ok;if(more)more.disabled=!result?.ok;spacer.parentElement.hidden=auto.value==='auto';reading.textContent=`伸出 ${request.extension.toFixed(1)} / ${result?.syringe?.spec.stroke ?? stroke.max} mm`;
  if(result?.syringe){stroke.max=result.syringe.spec.stroke;for(const [key,input] of Object.entries(advancedFields))if(document.activeElement!==input)input.value=key==='axisDeg'?result.syringe.axisDeg:result.syringe.spec[key];}
  const show3d=step===3&&preview3d&&result?.ok;space.hidden=!show3d;svg.toggleAttribute('hidden',!!show3d);toggle.textContent=preview3d?'回到平面':'查看 3D';
  hint.textContent=step===0?'點固定機架，或由下方清單選取':step===1?'拖動藍點放管夾；兩孔與承托會跟著移動':step===2?'選短連桿與端孔，避免點到重疊零件':'候選預覽；確認安裝後才更改作品';
  if(result&&!result.ok)hint.textContent='設定無法求解，顯示原機構；尚未套用。';
  if(!show3d)renderDrawing();if(step===3&&result?.ok){mountStatus.textContent='正在核對安裝高度…';const token=revision;sceneTimer=setTimeout(()=>scene(token),100);}
 }
 dialog.onclose=()=>{closed=true;revision++;clearTimeout(sceneTimer);viewer?.dispose();dialog.remove();};
 document.body.append(dialog);dialog.showModal();update();
 return dialog;
}
