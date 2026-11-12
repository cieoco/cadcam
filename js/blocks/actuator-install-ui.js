import * as View from './view.js';
import {actuatorMountSettings,normalizeFabricationProfile,planFabricationProfile} from './fabrication-profile.js';
import {makeStandardBlank,isOutputBlank,isStandardBar} from './standard-blank.js';
import {inspectLinkExport,inspectPlateExport} from './exporters.js';
import {deriveMotorMounts} from './build-plan.js';
import {pointDisplayName} from './display-labels.js';
import {actuatorChoices,actuatorHostPoints,actuatorPoint,planMotorInstallation,quickMotorChoices} from './actuator-installation.js';
import {signedNumberInput,showNumber,readNumber} from './numeric-input.js';
import {motorCarrierFrame,resolveMotorOrientation} from './motor-orientation.js';
import {sheetMode,setSheet,visibleUserRect} from './mobile-workspace.js';
import {confirmEditorKey} from './editor-confirm-key.js';
import {planMotorDrop} from './motor-drop.js';
import {offPlateMotors,offPlateMessage} from './motor-release.js';
const ns='http://www.w3.org/2000/svg';
const el=(tag,text,parent)=>{const n=document.createElement(tag);if(text)n.textContent=text;parent?.append(n);return n;};
const label=c=>c?.name || c?.id || '尚未選擇';

import {confirmMountingChange} from './mounting-review-ui.js';
export function openMotorInstallation({stage=document.getElementById('stageSvg'),redraw=()=>{},source,points={},motion={},type='mg995',existingId=null,initialOutputId='',motorId='1',confirm,review=(result,notify)=>confirmMountingChange(source,{...source,comps:result.comps,params:result.params,fabrication:result.fabrication},{notify})}){
  document.getElementById('motorInstallation')?.close();
  if(!stage)throw Error('找不到原畫布。');
  const base=structuredClone(source);base.fabrication=normalizeFabricationProfile(base.fabrication).profile;const choices=actuatorChoices(base.comps),old=base.comps.find(c=>c.id===existingId);
  const oldCenter=old?.motorMount?.center || ['p1','p2'].map(k=>old?.[k]).find(p=>p?.physicalMotor)?.id;
  const request={type:old?(old.motorType||'tt'):type,motorId,existingId,hostId:old?(old.motorMount?.frameBody||old.motorCarrier||'world'):'',
    angleDeg:old?.motorMount?.angleDeg??0,hostEnd:'p1',face:old?.motorMount?.face||'back',orientation:old?.motorMount?.orientation||'horizontal',reversed:!!old?.motorMount?.reversed,
    outputId:old?.type==='motor'?'':old?.id||initialOutputId,outputEnd:oldCenter&&old?.p2?.id===oldCenter?'p2':'p1',start:old?.servoStart??0,end:old?.servoEnd??90,
    angle:old?Number(motion.motorAngles?.[old.physicalMotor||old.p1?.physicalMotor]??motion.thetaDeg??0):0};
  const oldHost=choices.hosts.find(c=>c.id===request.hostId);if(oldHost&&oldCenter)request.hostEnd=actuatorHostPoints(oldHost).find(p=>p.id===oldCenter)?.key || 'p1';
  let result=null,viewer=null,closed=false,revision=0,three=false,selectedNode=oldCenter||'';
  const candidates=old&&old.type!=='motor'?[]:quickMotorChoices(base.comps,initialOutputId);
  let placing=false,placement=old?.type==='motor'?points[old.p1.id]||old.p1:null,draftId=null,placementError="";
  if(placement)request.position={x:placement.x,y:placement.y};
  let draftNumber=Math.max(Number(source.counter)||0,...base.comps.map(c=>Number(c.id.match(/\d+$/)?.[0])||0))+1;
  while(base.comps.some(c=>c.id==='Blank'+draftNumber))draftNumber++;
  const legal=candidates.filter(c=>planMotorInstallation(base,{...request,...c},points,motion).ok);
  if(!old&&initialOutputId&&legal.length===1){Object.assign(request,legal[0]);selectedNode=legal[0].nodeId;}
  const dialog=el('section');dialog.id='motorInstallation';dialog.className='inspector-panel motor-install-inline';dialog.setAttribute('role','region');dialog.setAttribute('aria-label','致動元件安裝');dialog.dataset.selectionSummary='馬達／舵機：在原畫布放置或改接';
  const head=el('header',null,dialog),title=el('strong','致動元件安裝',head),cancel=el('button','取消',head);
  const preview=el('section',null,dialog);preview.className='install-preview';
  const svg=document.createElementNS(ns,'svg');preview.append(svg);svg.id='motorInstallationCanvas';svg.setAttribute('aria-label','承載零件與輸出零件安裝預覽');
  const space=el('div',null,preview);space.className='install-three';space.hidden=true;
  const hint=el('p',null,preview);hint.className='install-hint';
  const body=el('section',null,dialog);body.className='install-options';
  const quickPanel=el('section',null,body),quickSummary=el('p',null,quickPanel),quickChoices=el('div',null,quickPanel);
  quickChoices.className='install-faces';
  const createOutput=el('button',old?'先放馬達，再畫輸出桿':'在畫布放馬達',quickPanel);createOutput.hidden=!!old&&old.type!=='motor';
  const release=el('button','解除輸出連接',quickPanel);release.hidden=old?.type!=='bar';
  release.onclick=()=>{request.outputId=request.outputId?'':old.id;request.position=null;placement=points[oldCenter]||old?.p1;update();};
  // A shaft dragged off its plate hole: explain and offer the two repairs (release still works).
  const offPlate=old&&offPlateMotors(base.comps).find(i=>i.id===old.id);
  if(offPlate){const note=el('p',offPlateMessage(offPlate),quickPanel);note.className='install-hint';
    for(const [action,text] of [['back','把馬達放回座板原孔'],['leave','讓馬達離開座板（改成獨立固定點）']])el('button',text,quickPanel).onclick=()=>{dialog.close();window.blocks?.motorRelease?.(action,old.id);};}
  const placementFields=el('details',null,body);el('summary','位置與輸出桿',placementFields);placementFields.hidden=true;
  const details=el('details',null,body);el('summary','連接與安裝方式',details);details.open=false;
  const panels=[0,1,2].map(()=>el('section',null,details));panels.push(el('section',null,body));
  const field=(p,text,kind='select')=>{const l=el('label',text,p),n=el(kind,null,l);n.setAttribute('aria-label',text);if(kind==='input'){n.type='number';n.step='1';}return n;};
  const option=(s,text,value)=>{const o=el('option',text,s);o.value=value;};
  const px=field(placementFields,'軸心 X (mm)','input'),py=field(placementFields,'軸心 Y (mm)','input'),pl=field(placementFields,'新桿孔距 (mm)','input'),pa=field(placementFields,'新桿方向 (°)','input');
  for(const n of [px,py,pl,pa]){signedNumberInput(n);n.step='any';}
  pl.value='56';pa.value='0';px.value=String(placement?.x??0);py.value=String(placement?.y??0);
  const placeOnly=el('button',old?'只放馬達':'依座標放置',placementFields);
  placeOnly.onclick=()=>{clearDraft();placement={x:readNumber(px),y:readNumber(py)};request.position=placement;request.outputId='';request.hostId='world';placementError='';placing=false;update();if(!old)submit();};
  if(old?.type==='motor')placementFields.hidden=false;
  const applyPlacement=el('button','預覽輸出桿',placementFields);
  function clearDraft(){if(!draftId)return;base.comps=base.comps.filter(c=>c.id!==draftId);delete base.params[draftId+'.G'];output.querySelector('[data-draft-output]')?.remove();draftId=null;}
  createOutput.onclick=()=>{clearDraft();placementError='';placing=true;placement=null;request.position=null;request.outputId='';request.hostId='world';request.face='back';selectedNode='';placementFields.hidden=false;update();};
  function createDraft(length,angle){
    result=null;next.disabled=true;
    request.position=placement;
    if(!Number.isFinite(angle)){placementError='請填有效的桿件方向。';error.textContent=placementError;return;}
    const made=makeStandardBlank({n:draftNumber,origin:placement,lengthMm:length});if(!made.ok){placementError=made.message;error.textContent=placementError;return;}placementError='';
    clearDraft();const c=made.comp;c.p2.x=placement.x+length*Math.cos(angle*Math.PI/180);c.p2.y=placement.y+length*Math.sin(angle*Math.PI/180);if(source.moduleId)c.moduleId=source.moduleId;
    base.comps.push(c);Object.assign(base.params,made.params);draftId=c.id;selectedNode=c.p1.id;option(output,'新孔格桿件',c.id);output.lastElementChild.dataset.draftOutput='true';request.outputId=c.id;request.outputEnd='p1';request.hostId='world';request.face='back';placing=false;
    showNumber(pl,length);showNumber(pa,angle);update();
  }
  applyPlacement.onclick=()=>{placement={x:readNumber(px),y:readNumber(py)};if(!Object.values(placement).every(Number.isFinite)){result=null;next.disabled=true;placementError='請填有效的軸心座標。';error.textContent=placementError;return;}createDraft(readNumber(pl),readNumber(pa));};
  for(const n of [px,py,pl,pa])n.onchange=()=>{if(draftId)applyPlacement.click();else if(placement){request.position=placement={x:readNumber(px),y:readNumber(py)};update();}};
  const kind=field(panels[0],'致動元件');option(kind,'MG995 舵機','mg995');option(kind,'TT 馬達','tt');option(kind,'N20 減速馬達','n20');kind.value=request.type;
  const host=field(panels[0],'外殼固定在哪個零件？');option(host,'請選承載零件','');option(host,'自動機架（固定在圖面）','world');
  const n20Spec=field(panels[0],'N20 安裝規格');option(n20Spec,'通用模擬（沒有專用孔）','0');option(n20Spec,'前端雙孔＋3 mm軸輪轂試作','1');n20Spec.value=String(base.fabrication.drive.n20Spec);
  n20Spec.onchange=()=>{base.fabrication.drive.n20Spec=Number(n20Spec.value);update();};
  const n20Fields=el('details',null,panels[0]);el('summary','N20 試作孔規格（mm）',n20Fields);
  for(const [group,key,text] of [['n20Mount','bossDiameterMm','凸台讓位孔'],['n20Mount','screwDiameterMm','前座螺絲清孔'],['n20Mount','screwSpacingMm','前座雙孔距'],['drive','n20HubCenterMm','輪轂中心讓位孔'],['drive','n20HubScrewMm','輪轂板上螺絲清孔'],['drive','n20HubCircleMm','輪轂四孔圓徑']]){const n=field(n20Fields,text,'input');n.step='any';n.value=base.fabrication[group][key];n.onchange=()=>{const p=planFabricationProfile(base.fabrication,group,key,Number(n.value));if(!p.ok){n.setCustomValidity(p.message);n.reportValidity();result=null;next.disabled=true;error.textContent=p.message;return;}n.setCustomValidity('');base.fabrication=p.profile;update();};}

  choices.hosts.forEach(c=>option(host,label(c),c.id));host.value=request.hostId;
  const faceRow=el('div',null,panels[0]);faceRow.className='install-faces';
  const faces=['front','back'].map((face,i)=>{const b=el('button',i?'背面':'正面',faceRow);b.onclick=()=>{request.face=face;update();};return b;});
  el('p','藍色承載外殼；正背面決定外殼在哪側。',panels[0]);
  const hostNote=el('p',null,panels[0]);
  const location=field(panels[1],'軸心位置');
  const hostLocations=()=>{location.replaceChildren();const owner=base.comps.find(c=>c.id===request.hostId),parked=new Set((owner?.standardBlank?.mountHoles || []).map(h=>h.id));for(const [i,p]of actuatorHostPoints(owner).entries())if(!parked.has(p.id)||p.id===oldCenter)option(location,owner?.standardBlank?`格位 ${i+1}（${p.x}, ${p.y} mm）`:`承載桿第${i+1}孔`,p.key);location.value=request.hostEnd;};hostLocations();
  const orientation=field(panels[1],'馬達本體方向');for(const [v,t] of [['horizontal','水平'],['vertical','垂直'],['follow-frame','沿承載零件']])option(orientation,t,v);orientation.value=request.orientation;
  const bodyAngle=field(panels[1],'本體偏轉角度 (°)','input');signedNumberInput(bodyAngle);bodyAngle.step='any';
  bodyAngle.onchange=()=>{const v=readNumber(bodyAngle);if(!Number.isFinite(v))return;request.angleDeg=v;update();};
  const reverse=el('button','本體轉向 180°',panels[1]);reverse.onclick=()=>{request.reversed=!request.reversed;update();};
  el('p','點圖上的孔定位；本體方向只改外殼朝向。',panels[1]);
  const output=field(panels[2],'輸出軸帶動哪個零件？');option(output,'尚未連接輸出','');choices.outputs.forEach(c=>option(output,label(c),c.id));output.value=request.outputId;
  const end=field(panels[2],'輸出連接孔');option(end,'第一孔／齒輪軸心','p1');option(end,'第二孔','p2');end.value=request.outputEnd;
  el('p','橘色是輸出零件。獨立連桿可平移對孔；已接好的機構保留共同接點，不會自動拆開或拉動其他零件。',panels[2]);
  const summary=el('p',null,panels[3]);
  const start=field(panels[3],'起始角度 (°)','input'),finish=field(panels[3],'結束角度 (°)','input');
  for(const [n,value] of [[start,request.start],[finish,request.end]]){signedNumberInput(n);showNumber(n,value);}
  const trial=field(panels[3],'試動角度 (°)','input');trial.type='range';trial.step='any';trial.value=request.angle;
  const exact=field(panels[3],'試動角度數值 (°)','input');signedNumberInput(exact);
  const reading=el('output',null,panels[3]),toggle=el('button','查看 3D',panels[3]);
  const scan=el('button','檢查動作範圍',panels[3]),scanText=el('p','尚未檢查動作範圍。',panels[3]);
  el('p','預覽檢查幾何連動；安裝孔、軸長、五金、干涉與扭力仍需核對。',panels[3]);
  const n20Note=el('p','N20 通用模擬：轉速、扭力、固定支架及軸接頭待依實物核對。',body);
  const error=el('p',null,body);error.className='install-error';error.setAttribute('role','status');
  const foot=el('footer',null,dialog),next=el('button',old?'儲存安裝':'確認安裝',foot);
  body.prepend(error);head.after(foot);cancel.onclick=()=>dialog.close();
  function submit(){if(!closed&&result?.ok){if(!review(result,message=>{error.textContent=message;}))return;if(confirm(result)!==false)dialog.close();else error.textContent='作品已變更，請關閉後重新安裝。';}}
  next.onclick=submit;next.setAttribute('aria-keyshortcuts','Enter');next.title='Enter 確認；Esc 取消';placeOnly.setAttribute('aria-keyshortcuts','Enter');
  kind.onchange=()=>{request.type=kind.value;update();};
  host.onchange=()=>{request.hostId=host.value;request.orientation=host.value==='world'?'horizontal':'follow-frame';if(host.value==='world')request.face='back';orientation.value=request.orientation;request.hostEnd='p1';hostLocations();update();};
  location.onchange=()=>{request.hostEnd=location.value;update();};
  orientation.onchange=()=>{request.orientation=orientation.value;request.angleDeg=0;update();};
  output.onchange=()=>{clearDraft();placementError='';placing=false;placement=null;placementFields.hidden=true;request.outputId=output.value;if(choices.outputs.find(c=>c.id===output.value)?.type==='gear'){request.outputEnd='p1';end.value='p1';}update();};
  end.onchange=()=>{request.outputEnd=end.value;update();};
  start.onchange=()=>{request.start=readNumber(start);update();};finish.onchange=()=>{request.end=readNumber(finish);update();};
  trial.oninput=()=>{request.angle=Number(trial.value);update(true);};
  exact.onchange=()=>{const v=readNumber(exact);if(!Number.isFinite(v)||v<Number(trial.min)||v>Number(trial.max)){exact.setCustomValidity(`請填 ${trial.min}–${trial.max}°`);exact.reportValidity();return;}exact.setCustomValidity('');request.angle=v;update(true);};
  exact.oninput=()=>exact.setCustomValidity('');
  toggle.onclick=()=>{three=!three;update(true);};
  scan.onclick=()=>{
    const lo=request.type==='mg995'?Math.min(Number(request.start),Number(request.end)):0,hi=request.type==='mg995'?Math.max(Number(request.start),Number(request.end)):360;
    let count=0;for(let a=lo;a<=hi;a+=1){const r=planMotorInstallation(base,{...request,angle:a},points,motion);if(!r.ok||!r.simulation?.ok){scanText.textContent=`${a}° 無法求解：${r.message||r.simulation?.message}`;return;}count++;}
    scanText.textContent=`${count} 個角度採樣通過；只代表幾何可解。`;
  };
  // Reuse the existing candidate drawing at the main canvas projection.
  let rotation=null,placementDrag=null;
  const placeAt=e=>{const q=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());placement={x:q.x,y:-q.y};request.position=placement;showNumber(px,placement.x);showNumber(py,placement.y);update();};
  const cancelPlacement=()=>{if(!placementDrag)return;placement=placementDrag.before;request.position=placement;placementDrag=null;update();};
  function drawing(){
    svg.replaceChildren();const cs=result?.ok?result.comps:base.comps,pts=result?.ok?result.points:points;
    const world=p=>pts[p?.id]||p;
    const ps=cs.flatMap(c=>['p1','p2','p3'].map(k=>world(c[k]))).filter(p=>p&&Number.isFinite(p.x));

    const minX=Math.min(...ps.map(p=>p.x))-75,maxX=Math.max(...ps.map(p=>p.x))+75,minY=Math.min(...ps.map(p=>p.y))-60,maxY=Math.max(...ps.map(p=>p.y))+60;
    const origin=View.worldFromScreen(0,0);
    svg.setAttribute('viewBox',`${origin.x} ${-origin.y} ${View.W/View.getScale()} ${View.H/View.getScale()}`);
    const draw=(tag,attrs)=>{const n=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));svg.append(n);return n;};
    const owner=cs.find(c=>c.id===request.hostId),out=cs.find(c=>c.id===request.outputId);
    const at=result?.matched&&result.ok?pts[result.center]:owner?actuatorPoint(owner,request.hostEnd,pts):out?world(out[request.outputEnd]):placement;
    if(at){
      const carrier=motorCarrierFrame(owner,{...at,id:actuatorHostPoints(owner).find(p=>p.key===request.hostEnd)?.id},pts);
      const d=resolveMotorOrientation(request.orientation,{center:{...at,id:actuatorHostPoints(owner).find(p=>p.key===request.hostEnd)?.id},carrier,reversed:request.reversed,angleDeg:request.angleDeg}).dir;
      const n=draw('rect',{x:request.type==='n20'?-6:-7,y:request.type==='n20'?-5:-12,width:request.type==='n20'?12:48,height:request.type==='n20'?10:24,rx:2,fill:request.type==='mg995'?'#7aa0dd':'#e3bc60',stroke:'#40536c',transform:`translate(${at.x} ${-at.y}) rotate(${-Math.atan2(d.y,d.x)*180/Math.PI})`});
      n.setAttribute('opacity','.8');
    }
    for(const c of cs){
      const a=world(c.p1),b=world(c.p2);if(!a||!b)continue;
      const color=c.id===request.outputId?'#e88d27':c.id===request.hostId?'#1686b3':'#a6b4bf';
      if(isStandardBar(c)){const g=inspectLinkExport(c,base.params[c.lenParam],{...base.fabrication?.export,drive:base.fabrication?.drive}),L=Math.hypot(b.x-a.x,b.y-a.y),ux=(b.x-a.x)/L,uy=(b.y-a.y)/L,world=p=>({x:a.x+p.x*ux-p.y*uy,y:a.y+p.x*uy+p.y*ux});for(const r of g.outlines)draw('path',{d:'M '+r.map(p=>{const q=world(p);return `${q.x} ${-q.y}`;}).join(' L ')+' Z',fill:'#f5ddd1',stroke:color,'data-actuator-part':c.id});for(const cut of g.cutouts)draw('path',{d:'M '+cut.points.map(p=>{const q=world(p);return `${q.x} ${-q.y}`;}).join(' L ')+' Z',fill:'white',stroke:color,'data-output-shaft':c.id});for(const h of g.holes){const q=world(h);draw('circle',{cx:q.x,cy:-q.y,r:h.r,fill:'white',stroke:color,'data-output-horn':/^(MG995_HORN|TT_HUB|N20_HUB)/.test(h.layer)?c.id:''});}}
      else if(c.type==='bar')draw('line',{x1:a.x,y1:-a.y,x2:b.x,y2:-b.y,stroke:color,'stroke-width':12,'stroke-linecap':'round','data-actuator-part':c.id});
      else if(c.type==='gear')draw('circle',{cx:a.x,cy:-a.y,r:base.params[c.radiusParam]||18,fill:'#dce6ed',stroke:color,'stroke-width':3,'data-actuator-part':c.id});
      else if(c.type==='triangle'&&c.standardBlank){const mounts=deriveMotorMounts(cs).filter(m=>m.frameBody===c.id).map(m=>({...m,settings:actuatorMountSettings(base.fabrication,m.kind)})),g=inspectPlateExport(c,['p1','p2','p3'].map(k=>world(c[k])),{},mounts);for(const ring of g.outlines)draw('path',{d:'M '+ring.map(p=>`${p.x} ${-p.y}`).join(' L ')+' Z',fill:'#dcecf0',stroke:color,'data-actuator-part':c.id});for(const cut of g.cutouts)draw('path',{d:'M '+cut.points.map(p=>`${p.x} ${-p.y}`).join(' L ')+' Z',fill:'white',stroke:color});for(const h of g.holes)draw('circle',{cx:h.x,cy:-h.y,r:h.r,fill:'white',stroke:color});}
      else continue;
      const available=c.type==='gear'?[{key:'p1',...c.p1}]:actuatorHostPoints(c).filter(p=>!(c.standardBlank?.mountHoles || []).some(h=>h.id===p.id)||p.id===oldCenter||p.key===request.hostEnd);
      for(const entry of available){const k=entry.key,p=pts[entry.id] || entry;if(!(k==='p1'&&isOutputBlank(c)&&c.isInput&&c.ttOutput==='shaft'&&(c.motorType || 'tt')==='tt'))draw('circle',{cx:p.x,cy:-p.y,r:5,fill:'white',stroke:color,'stroke-width':2});
        if(c.id===request.hostId||c.id===request.outputId)draw('circle',{cx:p.x,cy:-p.y,r:12,fill:'transparent','data-actuator-end':k,'data-owner':c.id});}
    }
    if(!old||old.type==='motor'){
      const radius=22*(maxX-minX)/Math.max(240,svg.getBoundingClientRect().width);
      for(const id of new Set(candidates.map(c=>c.nodeId))){
        const c=base.comps.find(c=>['p1','p2'].some(k=>c[k]?.id===id)),p=world(c?.p1?.id===id?c.p1:c?.p2);if(!p)continue;
        draw('circle',{cx:p.x,cy:-p.y,r:7,fill:id===selectedNode?'#e88d27':'white',stroke:'#0e7490','stroke-width':2});
        const hit=draw('circle',{cx:p.x,cy:-p.y,r:Math.max(12,radius),fill:'transparent','data-quick-node':id,role:'button',tabindex:0,'aria-label':`在${pointDisplayName(base.comps,id)}安裝馬達`});
        hit.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();chooseNode(id);}};
      }
    }
    if(at){
      const ownerFrame=motorCarrierFrame(owner,{...at,id:actuatorHostPoints(owner).find(p=>p.key===request.hostEnd)?.id},pts);
      const d=resolveMotorOrientation(request.orientation,{center:at,carrier:ownerFrame,reversed:request.reversed,angleDeg:request.angleDeg}).dir;
      const r=52,tip={x:at.x+d.x*r,y:at.y+d.y*r};
      draw('line',{x1:at.x,y1:-at.y,x2:tip.x,y2:-tip.y,stroke:'#d97706','stroke-dasharray':'3 3','pointer-events':'none'});
      draw('circle',{cx:tip.x,cy:-tip.y,r:8/View.getScale(),fill:'#fff',stroke:'#d97706','stroke-width':2/View.getScale(),'data-motor-rotation':'true',role:'button','aria-label':'拖曳調整馬達本體方向'});
    }
    if(at){const flat=out?.ttOutput==='shaft'&&(out.motorType || 'tt')==='tt';draw('circle',{cx:at.x,cy:-at.y,r:flat?4:3,fill:flat?'none':'#dc3838',stroke:'#dc3838','pointer-events':'none'});}
  }
  function chooseNode(id){
    clearDraft();placementError='';placing=false;placement=null;placementFields.hidden=true;selectedNode=id;const options=candidates.filter(c=>c.nodeId===id);
    request.outputId='';request.hostId='';
    if(options.length===1)Object.assign(request,options[0]);
    update();
  }
  svg.onpointerdown=e=>{
    if(placing&&!old){
      if(placementDrag&&placementDrag.id!==e.pointerId){cancelPlacement();return;}
      if(e.button>0||e.isPrimary===false)return;
      placementDrag={id:e.pointerId,before:placement};try{svg.setPointerCapture(e.pointerId);}catch(_){}placeAt(e);e.preventDefault();return;
    }
    if(placing&&!e.target.hasAttribute('data-motor-rotation')){const q=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());const p={x:q.x,y:-q.y};if(!placement){placement=p;request.position=p;showNumber(px,p.x);showNumber(py,p.y);update();}else{const dx=p.x-placement.x,dy=p.y-placement.y;createDraft(Math.round(Math.hypot(dx,dy)),Math.atan2(dy,dx)*180/Math.PI);}e.preventDefault();return;}

    if(e.target.hasAttribute('data-motor-rotation')){
      const cs=result?.ok?result.comps:base.comps,pts=result?.ok?result.points:points,owner=cs.find(c=>c.id===request.hostId),out=cs.find(c=>c.id===request.outputId);
      const at=owner?actuatorPoint(owner,request.hostEnd,pts):pts[out?.[request.outputEnd]?.id]||out?.[request.outputEnd]||placement;
      if(at){const q=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());rotation={id:e.pointerId,at,start:Math.atan2(-q.y-at.y,q.x-at.x),angle:request.angleDeg};svg.setPointerCapture(e.pointerId);e.preventDefault();}return;
    }
    const node=e.target.getAttribute('data-quick-node');if(node){chooseNode(node);return;}
    const endKey=e.target.getAttribute('data-actuator-end'),owner=e.target.getAttribute('data-owner');
    if(endKey&&owner===request.hostId){
      const c=(result?.ok?result.comps:base.comps).find(c=>c.id===owner),pts=result?.ok?result.points:points;
      if(c?.standardBlank?.kind==='plate'){const at=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse()),available=actuatorHostPoints(c).filter(p=>!(c.standardBlank.mountHoles || []).some(h=>h.id===p.id)||p.id===oldCenter||p.key===request.hostEnd);request.hostEnd=available.reduce((best,p)=>{const w=actuatorPoint(c,p.key,pts),b=best&&actuatorPoint(c,best.key,pts);return !b||Math.hypot(w.x-at.x,w.y+at.y)<Math.hypot(b.x-at.x,b.y+at.y)?p:best;},null)?.key || endKey;}else request.hostEnd=endKey;
      update();
    }
    else if(endKey&&owner===request.outputId){request.outputEnd=endKey;update();}
  };
  svg.onpointermove=e=>{if(placementDrag?.id===e.pointerId){placeAt(e);return;}if(!rotation||rotation.id!==e.pointerId)return;const q=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse()),a=Math.atan2(-q.y-rotation.at.y,q.x-rotation.at.x)-rotation.start;request.angleDeg=rotation.angle+Math.atan2(Math.sin(a),Math.cos(a))*180/Math.PI;update();};
  svg.onpointerup=e=>{if(placementDrag?.id===e.pointerId){placeAt(e);placementDrag=null;try{svg.releasePointerCapture(e.pointerId);}catch(_){}submit();return;}if(rotation?.id===e.pointerId){rotation=null;update();}};
  svg.onpointercancel=()=>{cancelPlacement();if(rotation){request.angleDeg=rotation.angle;rotation=null;update();}};
  svg.onlostpointercapture=cancelPlacement;
  async function showScene(token){
    try{
      const [{motorInstallationScene},{createViewer}]=await Promise.all([import('./actuator-install-scene.js'),import('../blocks3d/viewer.js')]);
      if(closed||token!==revision||!result?.ok)return;
      const first=!viewer;if(first)viewer=createViewer(space);viewer.update(motorInstallationScene(result));viewer.resize();if(first)viewer.tiltView(-32,22);
    }catch(e){if(!closed)error.textContent=`3D 預覽未完成：${e.message}`;}
  }
  function update(trialOnly=false){
    n20Note.hidden=request.type!=='n20';n20Spec.closest('label').hidden=request.type!=='n20';n20Fields.hidden=request.type!=='n20'||base.fabrication.drive.n20Spec!==1;n20Note.textContent=base.fabrication.drive.n20Spec===1?'N20 規格套用同作品全部N20。特定前端雙孔試作：參考12×10 mm減速箱、9 mm雙M1.6與3 mm軸；清孔1.8／凸台4.2為改製值，小孔需另鑽。輪轂四M3與側止付不同；螺絲長度、軸向間隙及承載待實量。':'N20 通用模擬：轉速、扭力、固定支架及軸接頭待依實物核對。';
    revision++;if(!trialOnly)scanText.textContent='設定已變更，請重新檢查動作範圍。';
    const invalidSpec=request.type==='n20'&&base.fabrication.drive.n20Spec===1&&n20Fields.querySelector('input:invalid');
    result=!placementError&&!invalidSpec&&(request.outputId||request.position||request.existingId)?planMotorInstallation(base,request,points,motion):null;
    if(result&&!old&&!request.outputId&&request.position&&request.hostId==='world'){
      const drop=planMotorDrop(base,request,points,motion);if(drop.matched)result=drop;
    }
    title.textContent=`${request.type==='mg995'?'舵機':request.type==='n20'?'N20 減速馬達':'馬達'}安裝`;
    if(document.activeElement!==bodyAngle)showNumber(bodyAngle,request.angleDeg);
    host.value=request.hostId;output.value=request.outputId;hostLocations();location.value=request.hostEnd;end.value=request.outputEnd;orientation.value=request.orientation;
    quickSummary.textContent=placing?(!old?'點畫布放馬達軸心，拖曳放開即新增；之後可再接輸出桿。':placement?'已放軸心，可直接儲存馬達；也可點另一端建立輸出桿。':'點畫布放馬達軸心，或輸入座標與孔距。'):request.outputId?`帶動「${label(base.comps.find(c=>c.id===request.outputId))}」・${pointDisplayName(base.comps,selectedNode)||'所選軸心'}；${request.hostId==='world'?'外殼固定在圖面基準（會固定此孔）':`外殼固定在「${label(base.comps.find(c=>c.id===request.hostId))}」`}。`
      :old?.type==='motor'?'尚未連接輸出；點圖上的桿孔，或在連接設定選零件。':old?'已預覽解除輸出；儲存後保留馬達與桿件，可再接回。':selectedNode?'這個孔連接了多個零件，請選要帶動的零件與承載方式。':candidates.length?'點圖上的孔，選馬達軸心。':'可先放馬達，再畫輸出桿。';
    quickChoices.replaceChildren();
    const options=candidates.filter(c=>c.nodeId===selectedNode);
    if(options.length>1)for(const c of options){
      const b=el('button',`帶動 ${label(base.comps.find(o=>o.id===c.outputId))} · 固定於 ${c.hostId==='world'?'圖面':label(base.comps.find(o=>o.id===c.hostId))}`,quickChoices);
      b.setAttribute('aria-pressed',String(request.outputId===c.outputId&&request.hostId===c.hostId));
      b.onclick=()=>{Object.assign(request,c);update();};
    }
    faces.forEach((b,i)=>{b.setAttribute('aria-pressed',String(request.face===(i?'back':'front')));b.disabled=i===0&&request.hostId==='world';});reverse.setAttribute('aria-pressed',String(request.reversed));
    hostNote.textContent=request.hostId==='world'?'外殼固定在圖面基準；自動機架不代表實際固定座已完成。':'外殼相對承載零件固定；若承載零件會動，外殼也跟著動。';
    location.disabled=request.hostId==='world';end.disabled=choices.outputs.find(c=>c.id===request.outputId)?.type==='gear';
    start.closest('label').hidden=finish.closest('label').hidden=!!old||request.type!=='mg995';
    trial.min=request.type==='mg995'?Math.min(Number(request.start),Number(request.end)):0;trial.max=request.type==='mg995'?Math.max(Number(request.start),Number(request.end)):360;trial.value=request.angle;
    if(document.activeElement!==exact)showNumber(exact,request.angle);
    summary.hidden=!old||request.type!=='mg995';summary.textContent=`擺動 ${request.start}–${request.end}°；範圍沿用接點面板的伺服角度。`;
    reading.textContent=`${Number(request.angle.toFixed(2))}°${result?.simulation?.ok?' · 幾何可解':''}`;
    error.textContent=placementError|| (invalidSpec?invalidSpec.validationMessage:result&&!result.ok?result.message:result?.simulation&&!result.simulation.ok?result.simulation.message:result?.plateHoles?.length?`板座孔槽為未實量試作；占用格孔已停用，拆除或改方向會重新核對並還原。${result.fabricationNote?result.fabricationNote+'。':''}`:'');
    release.textContent=request.outputId?'解除輸出連接':'還原輸出連接';
    createOutput.hidden=!!old&&old.type!=='motor'||!old&&placing;
    next.hidden=!old&&!request.outputId;next.disabled=!result?.ok;next.textContent=!request.outputId&&(request.position||old)?'儲存馬達':old?'儲存安裝':'確認安裝';
    exact.disabled=trial.disabled=!request.hostId||!request.outputId;scan.disabled=!result?.ok||!request.outputId;toggle.disabled=!result?.ok;
    const show3d=three&&result?.ok;space.style.height=show3d?'180px':'';space.hidden=!show3d;svg.style.display=show3d?'none':'';svg.toggleAttribute('hidden',!!show3d);toggle.textContent=show3d?'回到 2D':'查看 3D';
    hint.textContent=result?.matched?(result.ok?`放開即固定在${result.hostName}並產生安裝孔槽${result.fabricationNote?`；${result.fabricationNote}`:''}。`:`未安裝：${result.message}`):placing?(!old?'放到板件會自動對孔安裝；空白處只放馬達，可復原。':'點軸心即可儲存；需要輸出桿時再點另一端。'):show3d?'拖模型轉動視角；安裝面與輸出層一起預覽':'點孔選軸心；拖橘色把手轉本體，確認才套用。';
    if(show3d)showScene(revision);else drawing();
  }
  // The same form now lives beside the original canvas; no alternate installation route.
  quickPanel.before(kind.closest('label'));quickPanel.after(faceRow);
  const extra=el('details',null,body);el('summary','試動、尺寸與檢查',extra);extra.append(panels[3],n20Spec.closest('label'),n20Fields,n20Note);
  faceRow.after(bodyAngle.closest('label'));bodyAngle.closest('label').after(start.closest('label'),finish.closest('label'));
  const wrap=stage.parentElement;
  const syncCanvas=()=>{const r=stage.getBoundingClientRect(),w=wrap.getBoundingClientRect();Object.assign(svg.style,{position:'absolute',left:r.left-w.left+'px',top:r.top-w.top+'px',width:r.width+'px',height:r.height+'px',zIndex:'1',touchAction:'none'});};
  const fitCanvas=()=>{const r=stage.getBoundingClientRect(),panel=dialog.getBoundingClientRect(),ctm=stage.getScreenCTM();if(!ctm)return;const a=new DOMPoint(r.left,r.top).matrixTransform(ctm.inverse()),b=new DOMPoint(Math.min(r.right,panel.left-12),r.bottom).matrixTransform(ctm.inverse());const rect=sheetMode()?visibleUserRect(stage):{x:a.x,y:a.y,width:b.x-a.x,height:b.y-a.y};const ps=base.comps.flatMap(c=>[c.p1,c.p2,c.p3].filter(Boolean).map(p=>points[p.id]||p));if(ps.length&&rect?.width>0&&rect.height>0)View.fit({minX:Math.min(...ps.map(p=>p.x))-25,maxX:Math.max(...ps.map(p=>p.x))+60,minY:Math.min(...ps.map(p=>p.y))-30,maxY:Math.max(...ps.map(p=>p.y))+30},rect);};
  const stopView=View.onViewChange(()=>{redraw();syncCanvas();drawing();});
  const resize=new ResizeObserver(()=>{if(!closed){syncCanvas();fitCanvas();drawing();}});
  const escape=e=>{if(e.isComposing||e.keyCode===229)return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();if(rotation){request.angleDeg=rotation.angle;rotation=null;update();}else dialog.close();}else if(!rotation&&!placementDrag)confirmEditorKey(e,dialog,()=>{if(!old&&!request.outputId)placeOnly.click();else if(!next.disabled)next.click();});};
  dialog.onclose=()=>{if(closed)return;closed=true;revision++;resize.disconnect();stopView();document.removeEventListener('keydown',escape,true);viewer?.dispose();svg.remove();dialog.remove();stage.style.opacity=oldOpacity;redraw();};
  dialog.close=()=>dialog.onclose();
  const oldOpacity=stage.style.opacity;stage.style.opacity='.25';
  document.addEventListener('keydown',escape,true);wrap.append(dialog,svg);window.blocks.setMobilePanel('edit');document.body.dataset.mobileEditor='active';if(sheetMode())setSheet('half');syncCanvas();update();fitCanvas();resize.observe(stage);if(!old&&!initialOutputId)createOutput.click();dialog.tabIndex=-1;dialog.focus({preventScroll:true});
  svg.onwheel=e=>{e.preventDefault();View.zoomAt(stage,e.clientX,e.clientY,e.deltaY<0?1.1:1/1.1);};
  return dialog;
}
