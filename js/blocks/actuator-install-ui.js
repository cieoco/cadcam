import {pointDisplayName} from './display-labels.js';
import {actuatorChoices,planMotorInstallation,quickMotorChoices} from './actuator-installation.js';
import {signedNumberInput,showNumber,readNumber} from './numeric-input.js';
import {resolveMotorOrientation} from './motor-orientation.js';
const ns='http://www.w3.org/2000/svg';
const el=(tag,text,parent)=>{const n=document.createElement(tag);if(text)n.textContent=text;parent?.append(n);return n;};
const label=c=>c.name || c.id;

import {confirmMountingChange} from './mounting-review-ui.js';
export function openMotorInstallation({source,points={},motion={},type='mg995',existingId=null,initialOutputId='',motorId='1',confirm,review=(result,notify)=>confirmMountingChange(source,{...source,comps:result.comps,params:result.params},{notify})}){
  const base=structuredClone(source),choices=actuatorChoices(base.comps),old=base.comps.find(c=>c.id===existingId);
  const oldCenter=old?.motorMount?.center || ['p1','p2'].map(k=>old?.[k]).find(p=>p?.physicalMotor)?.id;
  const request={type:old?(old.motorType||'tt'):type,motorId,existingId,hostId:old?(old.motorMount?.frameBody||old.motorCarrier||'world'):'',
    angleDeg:old?.motorMount?.angleDeg??0,hostEnd:'p1',face:old?.motorMount?.face||'back',orientation:old?.motorMount?.orientation||'horizontal',reversed:!!old?.motorMount?.reversed,
    outputId:old?.id||initialOutputId,outputEnd:oldCenter&&old?.p2?.id===oldCenter?'p2':'p1',start:old?.servoStart??0,end:old?.servoEnd??90,
    angle:old?Number(motion.motorAngles?.[old.physicalMotor||old.p1?.physicalMotor]??motion.thetaDeg??0):0};
  const oldHost=choices.hosts.find(c=>c.id===request.hostId);if(oldHost&&oldCenter&&oldHost.p2.id===oldCenter)request.hostEnd='p2';
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
  choices.hosts.forEach(c=>option(host,label(c),c.id));host.value=request.hostId;
  const faceRow=el('div',null,panels[0]);faceRow.className='install-faces';
  const faces=['front','back'].map((face,i)=>{const b=el('button',i?'背面':'正面',faceRow);b.onclick=()=>{request.face=face;update();};return b;});
  el('p','藍色承載外殼；正背面決定外殼在哪側。',panels[0]);
  const hostNote=el('p',null,panels[0]);
  const location=field(panels[1],'軸心位置');option(location,'承載桿第一孔','p1');option(location,'承載桿第二孔','p2');location.value=request.hostEnd;
  const orientation=field(panels[1],'馬達本體方向');for(const [v,t] of [['horizontal','水平'],['vertical','垂直'],['follow-frame','沿承載桿']])option(orientation,t,v);orientation.value=request.orientation;
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
  host.onchange=()=>{request.hostId=host.value;request.orientation=host.value==='world'?'horizontal':'follow-frame';if(host.value==='world')request.face='back';orientation.value=request.orientation;update();};
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
    const at=owner?world(owner[request.hostEnd]):out?world(out[request.outputEnd]):null;
    if(at){
      const carrier=owner?{p1:owner.p1.id,a:world(owner.p1),b:world(owner.p2)}:null;
      const d=resolveMotorOrientation(request.orientation,{center:{...at,id:owner?.[request.hostEnd]?.id},carrier,reversed:request.reversed,angleDeg:request.angleDeg}).dir;
      const n=draw('rect',{x:request.type==='n20'?-6:-7,y:request.type==='n20'?-5:-12,width:request.type==='n20'?12:48,height:request.type==='n20'?10:24,rx:2,fill:request.type==='mg995'?'#7aa0dd':'#e3bc60',stroke:'#40536c',transform:`translate(${at.x} ${-at.y}) rotate(${-Math.atan2(d.y,d.x)*180/Math.PI})`});
      n.setAttribute('opacity','.8');
    }
    for(const c of cs){
      const a=world(c.p1),b=world(c.p2);if(!a||!b)continue;
      const color=c.id===request.outputId?'#e88d27':c.id===request.hostId?'#1686b3':'#a6b4bf';
      if(c.type==='bar')draw('line',{x1:a.x,y1:-a.y,x2:b.x,y2:-b.y,stroke:color,'stroke-width':12,'stroke-linecap':'round','data-actuator-part':c.id});
      else if(c.type==='gear')draw('circle',{cx:a.x,cy:-a.y,r:base.params[c.radiusParam]||18,fill:'#dce6ed',stroke:color,'stroke-width':3,'data-actuator-part':c.id});
      else continue;
      for(const k of c.type==='gear'?['p1']:['p1','p2']){const p=world(c[k]);draw('circle',{cx:p.x,cy:-p.y,r:5,fill:'white',stroke:color,'stroke-width':2});
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
    if(at)draw('circle',{cx:at.x,cy:-at.y,r:3,fill:'#dc3838','pointer-events':'none'});
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
    if(endKey&&owner===request.hostId){request.hostEnd=endKey;update();}
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
    n20Note.hidden=request.type!=='n20';
    revision++;if(!trialOnly)scanText.textContent='設定已變更，請重新檢查動作範圍。';
    result=request.outputId?planMotorInstallation(base,request,points,motion):null;
    title.textContent=`${request.type==='mg995'?'舵機':request.type==='n20'?'N20 減速馬達':'馬達'}安裝`;
    host.value=request.hostId;output.value=request.outputId;location.value=request.hostEnd;end.value=request.outputEnd;orientation.value=request.orientation;
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
    reading.textContent=`${request.angle}°${result?.ok?' · 幾何可解':''}`;
    error.textContent=result&&!result.ok?result.message:'';
    next.disabled=!result?.ok;
    exact.disabled=trial.disabled=!request.hostId||!request.outputId;scan.disabled=toggle.disabled=!result?.ok;
    const show3d=three&&result?.ok;space.hidden=!show3d;svg.toggleAttribute('hidden',!!show3d);toggle.textContent=show3d?'回到 2D':'查看 3D';
    hint.textContent=show3d?'拖模型轉動視角；安裝面與輸出層一起預覽':'點孔選軸心，調整後試動；確認才改作品。';
    if(show3d)showScene(revision);else drawing();
  }
  dialog.onclose=()=>{closed=true;revision++;viewer?.dispose();dialog.remove();};
  document.body.append(dialog);dialog.showModal();update();return dialog;
}
