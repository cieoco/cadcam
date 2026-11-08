import {actuatorMountSettings,normalizeFabricationProfile,planFabricationProfile} from './fabrication-profile.js';
import {isOutputBlank} from './standard-blank.js';
import {inspectLinkExport,inspectPlateExport} from './exporters.js';
import {deriveMotorMounts} from './build-plan.js';
import {pointDisplayName} from './display-labels.js';
import {actuatorChoices,actuatorHostPoints,actuatorPoint,planMotorInstallation,quickMotorChoices} from './actuator-installation.js';
import {signedNumberInput,showNumber,readNumber} from './numeric-input.js';
import {motorCarrierFrame,resolveMotorOrientation} from './motor-orientation.js';
const ns='http://www.w3.org/2000/svg';
const el=(tag,text,parent)=>{const n=document.createElement(tag);if(text)n.textContent=text;parent?.append(n);return n;};
const label=c=>c?.name || c?.id || '尚未選擇';

import {confirmMountingChange} from './mounting-review-ui.js';
export function openMotorInstallation({source,points={},motion={},type='mg995',existingId=null,initialOutputId='',motorId='1',confirm,review=(result,notify)=>confirmMountingChange(source,{...source,comps:result.comps,params:result.params,fabrication:result.fabrication},{notify})}){
  const base=structuredClone(source);base.fabrication=normalizeFabricationProfile(base.fabrication).profile;const choices=actuatorChoices(base.comps),old=base.comps.find(c=>c.id===existingId);
  const oldCenter=old?.motorMount?.center || ['p1','p2'].map(k=>old?.[k]).find(p=>p?.physicalMotor)?.id;
  const request={type:old?(old.motorType||'tt'):type,motorId,existingId,hostId:old?(old.motorMount?.frameBody||old.motorCarrier||'world'):'',
    angleDeg:old?.motorMount?.angleDeg??0,hostEnd:'p1',face:old?.motorMount?.face||'back',orientation:old?.motorMount?.orientation||'horizontal',reversed:!!old?.motorMount?.reversed,
    outputId:old?.id||initialOutputId,outputEnd:oldCenter&&old?.p2?.id===oldCenter?'p2':'p1',start:old?.servoStart??0,end:old?.servoEnd??90,
    angle:old?Number(motion.motorAngles?.[old.physicalMotor||old.p1?.physicalMotor]??motion.thetaDeg??0):0};
  const oldHost=choices.hosts.find(c=>c.id===request.hostId);if(oldHost&&oldCenter)request.hostEnd=actuatorHostPoints(oldHost).find(p=>p.id===oldCenter)?.key || 'p1';
  let result=null,viewer=null,closed=false,revision=0,three=false,selectedNode=oldCenter||'';
  const candidates=old?[]:quickMotorChoices(base.comps,initialOutputId);
  const legal=candidates.filter(c=>planMotorInstallation(base,{...request,...c},points,motion).ok);
  if(legal.length===1){Object.assign(request,legal[0]);selectedNode=legal[0].nodeId;}
  const dialog=el('dialog');dialog.id='motorInstallation';dialog.className='syringe-install install-direct';dialog.setAttribute('aria-label','致動元件安裝');
  const head=el('header',null,dialog),title=el('strong','致動元件安裝',head),cancel=el('button','取消',head);
  const preview=el('section',null,dialog);preview.className='install-preview';
  const svg=document.createElementNS(ns,'svg');preview.append(svg);svg.setAttribute('aria-label','承載零件與輸出零件安裝預覽');
  const space=el('div',null,preview);space.className='install-three';space.hidden=true;
  const hint=el('p',null,preview);hint.className='install-hint';
  const body=el('section',null,dialog);body.className='install-options';
  const quickPanel=el('section',null,body),quickSummary=el('p',null,quickPanel),quickChoices=el('div',null,quickPanel);
  quickChoices.className='install-faces';
  const details=el('details',null,body);el('summary','連接與安裝方式',details);details.open=!!old;
  const panels=[0,1,2].map(()=>el('section',null,details));panels.push(el('section',null,body));
  const field=(p,text,kind='select')=>{const l=el('label',text,p),n=el(kind,null,l);n.setAttribute('aria-label',text);if(kind==='input'){n.type='number';n.step='1';}return n;};
  const option=(s,text,value)=>{const o=el('option',text,s);o.value=value;};
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
  const reverse=el('button','本體轉向 180°',panels[1]);reverse.onclick=()=>{request.reversed=!request.reversed;update();};
  el('p','點圖上的孔定位；本體方向只改外殼朝向。',panels[1]);
  const output=field(panels[2],'輸出軸帶動哪個零件？');option(output,'請選輸出零件','');choices.outputs.forEach(c=>option(output,label(c),c.id));output.value=request.outputId;
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
  foot.prepend(error);cancel.onclick=()=>dialog.close();
  next.onclick=()=>{if(result?.ok){if(!review(result,message=>{error.textContent=message;}))return;if(confirm(result)!==false)dialog.close();else error.textContent='作品已變更，請關閉後重新安裝。';}};
  kind.onchange=()=>{request.type=kind.value;update();};
  host.onchange=()=>{request.hostId=host.value;request.orientation=host.value==='world'?'horizontal':'follow-frame';if(host.value==='world')request.face='back';orientation.value=request.orientation;request.hostEnd='p1';hostLocations();update();};
  location.onchange=()=>{request.hostEnd=location.value;update();};
  orientation.onchange=()=>{request.orientation=orientation.value;request.angleDeg=0;update();};
  output.onchange=()=>{request.outputId=output.value;if(choices.outputs.find(c=>c.id===output.value)?.type==='gear'){request.outputEnd='p1';end.value='p1';}update();};
  end.onchange=()=>{request.outputEnd=end.value;update();};
  start.onchange=()=>{request.start=readNumber(start);update();};finish.onchange=()=>{request.end=readNumber(finish);update();};
  trial.oninput=()=>{request.angle=Number(trial.value);update(true);};
  exact.onchange=()=>{const v=readNumber(exact);if(!Number.isFinite(v)||v<Number(trial.min)||v>Number(trial.max)){exact.setCustomValidity(`請填 ${trial.min}–${trial.max}°`);exact.reportValidity();return;}exact.setCustomValidity('');request.angle=v;update(true);};
  exact.oninput=()=>exact.setCustomValidity('');
  toggle.onclick=()=>{three=!three;update(true);};
  scan.onclick=()=>{
    const lo=request.type==='mg995'?Math.min(Number(request.start),Number(request.end)):0,hi=request.type==='mg995'?Math.max(Number(request.start),Number(request.end)):360;
    let count=0;for(let a=lo;a<=hi;a+=1){const r=planMotorInstallation(base,{...request,angle:a},points,motion);if(!r.ok){scanText.textContent=`${a}° 無法求解：${r.message}`;return;}count++;}
    scanText.textContent=`${count} 個角度採樣通過；只代表幾何可解。`;
  };
  function drawing(){
    svg.replaceChildren();const cs=result?.ok?result.comps:base.comps,pts=result?.ok?result.points:points;
    const world=p=>pts[p?.id]||p;
    const ps=cs.flatMap(c=>['p1','p2','p3'].map(k=>world(c[k]))).filter(p=>p&&Number.isFinite(p.x));
    if(!ps.length)return;
    const minX=Math.min(...ps.map(p=>p.x))-75,maxX=Math.max(...ps.map(p=>p.x))+75,minY=Math.min(...ps.map(p=>p.y))-60,maxY=Math.max(...ps.map(p=>p.y))+60;
    svg.setAttribute('viewBox',`${minX} ${-maxY} ${maxX-minX} ${maxY-minY}`);
    const draw=(tag,attrs)=>{const n=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));svg.append(n);return n;};
    const owner=cs.find(c=>c.id===request.hostId),out=cs.find(c=>c.id===request.outputId);
    const at=owner?actuatorPoint(owner,request.hostEnd,pts):out?world(out[request.outputEnd]):null;
    if(at){
      const carrier=motorCarrierFrame(owner,{...at,id:actuatorHostPoints(owner).find(p=>p.key===request.hostEnd)?.id},pts);
      const d=resolveMotorOrientation(request.orientation,{center:{...at,id:actuatorHostPoints(owner).find(p=>p.key===request.hostEnd)?.id},carrier,reversed:request.reversed,angleDeg:request.angleDeg}).dir;
      const n=draw('rect',{x:request.type==='n20'?-6:-7,y:request.type==='n20'?-5:-12,width:request.type==='n20'?12:48,height:request.type==='n20'?10:24,rx:2,fill:request.type==='mg995'?'#7aa0dd':'#e3bc60',stroke:'#40536c',transform:`translate(${at.x} ${-at.y}) rotate(${-Math.atan2(d.y,d.x)*180/Math.PI})`});
      n.setAttribute('opacity','.8');
    }
    for(const c of cs){
      const a=world(c.p1),b=world(c.p2);if(!a||!b)continue;
      const color=c.id===request.outputId?'#e88d27':c.id===request.hostId?'#1686b3':'#a6b4bf';
      if(isOutputBlank(c)){const g=inspectLinkExport(c,base.params[c.lenParam],{...base.fabrication?.export,drive:base.fabrication?.drive}),L=Math.hypot(b.x-a.x,b.y-a.y),ux=(b.x-a.x)/L,uy=(b.y-a.y)/L,world=p=>({x:a.x+p.x*ux-p.y*uy,y:a.y+p.x*uy+p.y*ux});for(const r of g.outlines)draw('path',{d:'M '+r.map(p=>{const q=world(p);return `${q.x} ${-q.y}`;}).join(' L ')+' Z',fill:'#f5ddd1',stroke:color,'data-actuator-part':c.id});for(const cut of g.cutouts)draw('path',{d:'M '+cut.points.map(p=>{const q=world(p);return `${q.x} ${-q.y}`;}).join(' L ')+' Z',fill:'white',stroke:color,'data-output-shaft':c.id});for(const h of g.holes){const q=world(h);draw('circle',{cx:q.x,cy:-q.y,r:h.r,fill:'white',stroke:color,'data-output-horn':/^(MG995_HORN|TT_HUB|N20_HUB)/.test(h.layer)?c.id:''});}}
      else if(c.type==='bar')draw('line',{x1:a.x,y1:-a.y,x2:b.x,y2:-b.y,stroke:color,'stroke-width':12,'stroke-linecap':'round','data-actuator-part':c.id});
      else if(c.type==='gear')draw('circle',{cx:a.x,cy:-a.y,r:base.params[c.radiusParam]||18,fill:'#dce6ed',stroke:color,'stroke-width':3,'data-actuator-part':c.id});
      else if(c.type==='triangle'&&c.standardBlank){const mounts=deriveMotorMounts(cs).filter(m=>m.frameBody===c.id).map(m=>({...m,settings:actuatorMountSettings(base.fabrication,m.kind)})),g=inspectPlateExport(c,['p1','p2','p3'].map(k=>world(c[k])),{},mounts);for(const ring of g.outlines)draw('path',{d:'M '+ring.map(p=>`${p.x} ${-p.y}`).join(' L ')+' Z',fill:'#dcecf0',stroke:color,'data-actuator-part':c.id});for(const cut of g.cutouts)draw('path',{d:'M '+cut.points.map(p=>`${p.x} ${-p.y}`).join(' L ')+' Z',fill:'white',stroke:color});for(const h of g.holes)draw('circle',{cx:h.x,cy:-h.y,r:h.r,fill:'white',stroke:color});}
      else continue;
      const available=c.type==='gear'?[{key:'p1',...c.p1}]:actuatorHostPoints(c).filter(p=>!(c.standardBlank?.mountHoles || []).some(h=>h.id===p.id)||p.id===oldCenter||p.key===request.hostEnd);
      for(const entry of available){const k=entry.key,p=pts[entry.id] || entry;if(!(k==='p1'&&isOutputBlank(c)&&c.isInput&&c.ttOutput==='shaft'&&(c.motorType || 'tt')==='tt'))draw('circle',{cx:p.x,cy:-p.y,r:5,fill:'white',stroke:color,'stroke-width':2});
        if(c.id===request.hostId||c.id===request.outputId)draw('circle',{cx:p.x,cy:-p.y,r:12,fill:'transparent','data-actuator-end':k,'data-owner':c.id});}
    }
    if(!old){
      const radius=22*(maxX-minX)/Math.max(240,svg.getBoundingClientRect().width);
      for(const id of new Set(candidates.map(c=>c.nodeId))){
        const c=base.comps.find(c=>['p1','p2'].some(k=>c[k]?.id===id)),p=world(c?.p1?.id===id?c.p1:c?.p2);if(!p)continue;
        draw('circle',{cx:p.x,cy:-p.y,r:7,fill:id===selectedNode?'#e88d27':'white',stroke:'#0e7490','stroke-width':2});
        const hit=draw('circle',{cx:p.x,cy:-p.y,r:Math.max(12,radius),fill:'transparent','data-quick-node':id,role:'button',tabindex:0,'aria-label':`在${pointDisplayName(base.comps,id)}安裝馬達`});
        hit.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();chooseNode(id);}};
      }
    }
    if(at){const flat=out?.ttOutput==='shaft'&&(out.motorType || 'tt')==='tt';draw('circle',{cx:at.x,cy:-at.y,r:flat?4:3,fill:flat?'none':'#dc3838',stroke:'#dc3838','pointer-events':'none'});}
  }
  function chooseNode(id){
    selectedNode=id;const options=candidates.filter(c=>c.nodeId===id);
    request.outputId='';request.hostId='';
    if(options.length===1)Object.assign(request,options[0]);
    update();
  }
  svg.onpointerdown=e=>{
    const node=e.target.getAttribute('data-quick-node');if(node){chooseNode(node);return;}
    const endKey=e.target.getAttribute('data-actuator-end'),owner=e.target.getAttribute('data-owner');
    if(endKey&&owner===request.hostId){
      const c=(result?.ok?result.comps:base.comps).find(c=>c.id===owner),pts=result?.ok?result.points:points;
      if(c?.standardBlank?.kind==='plate'){const at=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse()),available=actuatorHostPoints(c).filter(p=>!(c.standardBlank.mountHoles || []).some(h=>h.id===p.id)||p.id===oldCenter||p.key===request.hostEnd);request.hostEnd=available.reduce((best,p)=>{const w=actuatorPoint(c,p.key,pts),b=best&&actuatorPoint(c,best.key,pts);return !b||Math.hypot(w.x-at.x,w.y+at.y)<Math.hypot(b.x-at.x,b.y+at.y)?p:best;},null)?.key || endKey;}else request.hostEnd=endKey;
      update();
    }
    else if(endKey&&owner===request.outputId){request.outputEnd=endKey;update();}
  };
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
    result=!invalidSpec&&request.outputId?planMotorInstallation(base,request,points,motion):null;
    title.textContent=`${request.type==='mg995'?'舵機':request.type==='n20'?'N20 減速馬達':'馬達'}安裝`;
    host.value=request.hostId;output.value=request.outputId;hostLocations();location.value=request.hostEnd;end.value=request.outputEnd;orientation.value=request.orientation;
    quickSummary.textContent=request.outputId?`帶動「${label(base.comps.find(c=>c.id===request.outputId))}」・孔 ${selectedNode}；${request.hostId==='world'?'外殼固定在圖面基準（會固定此孔）':`外殼固定在「${label(base.comps.find(c=>c.id===request.hostId))}」`}。`
      :selectedNode?'這個孔連接了多個零件，請選要帶動的零件與承載方式。':candidates.length?'點圖上的孔，選馬達軸心。':'目前沒有可直接安裝的孔，請展開「連接與安裝方式」選承載與輸出零件。';
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
    reading.textContent=`${Number(request.angle.toFixed(2))}°${result?.ok?' · 幾何可解':''}`;
    error.textContent=invalidSpec?invalidSpec.validationMessage:result&&!result.ok?result.message:result?.plateHoles?.length?'板座孔槽為未實量試作；占用格孔已停用，拆除或改方向會重新核對並還原。':'';
    next.disabled=!result?.ok;
    exact.disabled=trial.disabled=!request.hostId||!request.outputId;scan.disabled=toggle.disabled=!result?.ok;
    const show3d=three&&result?.ok;space.hidden=!show3d;svg.toggleAttribute('hidden',!!show3d);toggle.textContent=show3d?'回到 2D':'查看 3D';
    hint.textContent=show3d?'拖模型轉動視角；安裝面與輸出層一起預覽':'點孔選軸心，調整後試動；確認才改作品。';
    if(show3d)showScene(revision);else drawing();
  }
  dialog.onclose=()=>{closed=true;revision++;viewer?.dispose();dialog.remove();};
  document.body.append(dialog);dialog.showModal();update();return dialog;
}
