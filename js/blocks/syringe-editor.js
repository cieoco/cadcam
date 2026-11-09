/** Daily syringe edits use the main drawing and the existing installation candidate. */
import {S} from './state.js';
import * as View from './view.js';
import {sheetMode,setSheet} from './mobile-workspace.js';
import {dimensionHandle} from './dimension-handle.js';
import {SYRINGE_EAR_MM,attachmentPoint,syringeAttachmentHoles} from '../core/syringe.js';
import {installationChoices,planPlacedSyringe,fixedEarRotation,outputHoleChecks} from './syringe-installation.js';
import {syringePositionOnFrame} from './syringe-position.js';
import {syringeClampFrameNodes,syringeShape} from './syringe-shape.js';
import {scanSyringe} from './syringe-operations.js';
import {commitMountingEdit,confirmMountingChange,mountingWork,mountingCandidate} from './mounting-review-ui.js';
import {holeName} from './syringe-install-steps.js';
import {signedNumberInput,showNumber,readNumber,formatNumber} from './numeric-input.js';

export function createSyringeEditor(h){
 const el=(tag,text,parent)=>{const n=document.createElement(tag);if(text)n.textContent=text;parent?.append(n);return n;};
 const panel=el('section',null,h.svg.parentElement);panel.id='syringeEditor';panel.className='inspector-panel syringe-editor';panel.style.display='none';
 const head=el('header',null,panel);el('strong','針筒',head).className='se-title';const done=el('button','完成',head);
 const quick=el('div',null,panel);quick.className='syringe-connection-actions';
 const modeRow=el('div',null,quick);modeRow.setAttribute('role','group');modeRow.setAttribute('aria-label','固定環固定方式');
 const modeButtons=['fixed-axis','pivot'].map((value,i)=>{const b=el('button',i?'單孔可轉':'雙孔固定',modeRow);b.type='button';b.onclick=()=>changeMode(value);return b;});
 const precise=el('details',null,panel);el('summary','位置與角度數值',precise);
 const fields=el('div',null,precise);fields.className='syringe-position-fields';
 const field=(label,parent=fields,type='input')=>{const row=el('label',label,parent),n=el(type,null,row);n.setAttribute('aria-label',label);if(type==='input'){n.type='number';n.step='.1';n.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();n.blur();}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();sync(true);n.blur();}};}return n;};
 const x=field('位置 X (mm)'),y=field('位置 Y (mm)'),along=field('距第一孔 (mm)'),angle=field('方向 (°)');[x,y,angle].forEach(signedNumberInput);
 const rotationOptions=el('div',null,precise),keepEar=field('保留第一耳孔調角度',rotationOptions),drilled=field('保留已鑽的固定孔',rotationOptions);keepEar.type=drilled.type='checkbox';keepEar.checked=true;
 const status=el('p',null,panel);status.className='syringe-edit-status';status.setAttribute('role','status');
 const approval=el('div',null,panel),confirmHoles=el('button','確認更新固定孔',approval),cancelHoles=el('button','取消修改',approval);approval.hidden=true;
 let awaiting=null;
 const revision=()=>JSON.stringify([S.comps,S.topo.params,S.modules,S.fabrication,S.designFocus,S.mode]);
 const discard=()=>{awaiting=null;approval.hidden=true;};
 confirmHoles.onclick=()=>{const candidate=awaiting;discard();clearPreview();if(!candidate)return;if(candidate.revision!==revision()){message('作品已變更，請重新調整固定環。');sync(true);return;}pending={};pickingKey=null;clearPicks();message('');h.commit(candidate.r.comps,candidate.r.params,candidate.r);h.draw();};
 cancelHoles.onclick=()=>{pending={};pickingKey=null;clearPicks();discard();clearPreview();message('已取消修改。');sync(true);h.draw();};
 const more=el('details',null,panel);el('summary','連接與其他設定',more);
 const connections=el('div',null,more),frame=field('固定在哪裡',connections,'select'),output=field('推桿連接孔',quick,'select'),ear=field('固定耳',connections,'select'),face=field('正反面',connections,'select');
 const opt=(n,label,value)=>{const o=el('option',label,n);o.value=value;};
 const ownerName=o=>{const same=h.comps().filter(c=>(c.name||c.id)===(o.name||o.id));return (o.name||o.id)+(same.length>1?`（第${same.findIndex(c=>c.id===o.id)+1}件）`:'');};
 opt(ear,'左耳','1');opt(ear,'右耳','-1');opt(face,'正面','front');opt(face,'背面','back');
 el('p',`雙耳孔距 ${2*SYRINGE_EAR_MM} mm。現有參考環壁與耳孔／M3 墊片有干涉，固定架待改製核對。`,more);
 const offset=field('固定環距筒尾 (mm)',more),spacer=field('套筒高度 (mm，空白自動)',more);
 const reconnect=el('button','在圖上更換推桿孔',quick);
 const cancelPick=el('button','取消連接修改',quick);cancelPick.hidden=true;
 output.closest('label').before(reconnect);quick.after(status,approval);
 const scan=el('button','檢查全行程',more),advanced=el('button','尺寸與加工設定',more),remove=el('button','刪除針筒',more);
 let selected=null,focus=null,choiceKey='',draft=false,pickingKey=null,pending={};
 const current=()=>h.comps().find(c=>c.id===selected&&c.type==='syringe');
 const project=p=>({x:View.TX(p.x),y:View.TY(p.y)});
 const clearPreview=()=>h.svg.querySelector('[data-clamp-preview]')?.remove();
 const clearPicks=()=>h.svg.querySelector('[data-syringe-pick-holes]')?.remove();
 function previewCandidate(r){
  clearPreview();const host=r.comps.find(o=>o.id===r.syringe.a.componentId),nodes=syringeClampFrameNodes(r.comps.filter(o=>o.type!=='syringe'||o.id===r.syringe.id),[host.p1,host.p2,host.p3].filter(Boolean)),ns='http://www.w3.org/2000/svg',g=document.createElementNS(ns,'g');g.dataset.clampPreview='';g.style.pointerEvents='none';
  for(const n of nodes){const p=project(n),dot=document.createElementNS(ns,'circle');for(const [k,v]of Object.entries({cx:p.x,cy:p.y,r:n.holeDiameterMm*View.getScale()/2,fill:'#fff7ed',stroke:'#d97706','stroke-width':2}))dot.setAttribute(k,v);g.append(dot);}
  const shape=syringeShape(r.syringe,r.comps,r.params,r.points);
  if(shape){const a=project(shape.a),b=project(shape.b),line=document.createElementNS(ns,'line'),dot=document.createElementNS(ns,'circle');for(const [k,v]of Object.entries({x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#d97706','stroke-width':3,'stroke-dasharray':'5 4'}))line.setAttribute(k,v);for(const [k,v]of Object.entries({cx:b.x,cy:b.y,r:7,fill:'#fff7ed',stroke:'#d97706'}))dot.setAttribute(k,v);g.append(line,dot);}
  h.svg.append(g);
 }
 function close(){clearPicks();discard();pickingKey=null;pending={};clearPreview();selected=null;draft=false;panel.style.display='none';h.svg.querySelectorAll('[data-dimension-handle^="syringe-"]').forEach(n=>n.remove());}
 done.onclick=()=>{close();h.draw();};
 const message=t=>{status.textContent=t;};
 function apply(patch,{preview=false}={}){
  const c=current();if(!c)return false;preview=preview||Object.keys(pending).length>0;if(preview)pending={...pending,...patch};discard();clearPreview();h.pause();
  const source={comps:structuredClone(h.comps()),params:{...h.params()},fabrication:structuredClone(S.fabrication),modules:S.modules},points=h.points();
  const request={id:c.id,mountMode:c.mountMode,pivotEar:c.pivotEar,frameId:c.a.componentId,position:attachmentPoint(c.a,source.comps,source.params,points)||c.a.position,b:{...c.b},axisDeg:c.axisDeg??0,extension:c.extension,face:c.installation?.face||'front',spacerMm:c.installation?.spacerMm??null,keepOldHoles:drilled.checked,...pending,...patch};
  if(!source.comps.some(o=>o.id===request.frameId)||!source.comps.some(o=>o.id===request.b.componentId)){pending={...pending,...patch};message('尚未接好：請選固定位置及推桿接孔。');return false;}
  if(!Object.keys(pending).length&&Object.entries(patch).every(([k,v])=>JSON.stringify(v)===JSON.stringify(k==='position'?attachmentPoint(c.a,source.comps,source.params,points):k==='barrelOffsetMm'?c.installation?.barrelOffsetMm??c.spec.bodyLength*.7:k==='spacerMm'?c.installation?.spacerMm??null:k==='frameId'?c.a.componentId:k==='face'?c.installation?.face||'front':c[k]))){message('');sync(true);return true;}
  const owner=source.comps.find(o=>o.id===request.frameId),p=request.position,q=p&&syringePositionOnFrame(owner,source.params,points,p,source);
  if(!p||![p.x,p.y,request.axisDeg].every(Number.isFinite)||!q||Math.hypot(p.x-q.x,p.y-q.y)>1e-6){message('位置需在所選固定零件內，請調整數字或拖動固定環。');sync(true);return false;}
  const r=planPlacedSyringe(source,request,points,h.motion());
  if(!r.ok||r.temporary){message((preview?'尚未套用：':'')+r.message);sync(true);return false;}
  if(!confirmMountingChange(mountingWork(S),mountingCandidate(mountingWork(S),r,h.comps()),{notify:message,ask:()=>{awaiting={r,revision:revision()};approval.hidden=false;message('固定孔將依候選位置更新；請確認，或取消保留原孔。');return false;}})){sync(true);return false;}
  if(preview){awaiting={r,revision:revision()};approval.hidden=false;confirmHoles.textContent='確認連接修改';message('已預覽連接修改，確認後套用。');sync(true);h.draw();return true;}
  pending={};pickingKey=null;message('');h.commit(r.comps,r.params,r);return true;
 }
 x.onchange=y.onchange=()=>apply({position:{x:readNumber(x),y:readNumber(y)}});
 along.onchange=()=>{const c=current();if(c)apply({position:attachmentPoint({...c.a,u:readNumber(along)},h.comps(),h.params(),h.points())});};
 angle.onchange=()=>{const c=current(),patch=keepEar.checked&&c?fixedEarRotation(c,{comps:h.comps(),params:h.params()},h.points(),readNumber(angle)):{axisDeg:readNumber(angle)};if(patch)apply({...patch,keepOldHoles:drilled.checked});};
 offset.onchange=()=>apply({barrelOffsetMm:readNumber(offset)});
 spacer.onchange=()=>apply({spacerMm:spacer.value.trim()===''?null:readNumber(spacer)});
 ear.onchange=()=>{pending={...pending,pivotEar:Number(ear.value)};apply({}, {preview:true});h.draw();};face.onchange=()=>apply({face:face.value});
 frame.onchange=()=>{const c=current(),owner=h.comps().find(o=>o.id===frame.value),p=c&&(attachmentPoint(c.a,h.comps(),h.params(),h.points())||c.a.position),q=p&&syringePositionOnFrame(owner,h.params(),h.points(),p,{comps:h.comps(),params:h.params(),fabrication:S.fabrication});if(q)apply({frameId:frame.value,position:q});};
 function chooseOutput(b){pending={...pending,b};pickingKey=null;apply({}, {preview:true});h.draw();explainOutput(b);if(sheetMode())setSheet('half');}
 output.onchange=()=>{if(output.value)chooseOutput(JSON.parse(output.value));};
 scan.onclick=()=>{const c=current();if(c){h.pause();const r=scanSyringe(h.comps(),h.params(),c.id,.5,h.motion());message(r.ok?r.message:`${r.atMm==null?'':formatNumber(r.atMm)} mm：${r.message}`);}};
 advanced.onclick=()=>{const c=current();close();h.advanced(c);};
 remove.onclick=()=>{const c=current();if(!c)return;if(!commitMountingEdit(S,d=>{d.comps=d.comps.filter(o=>o.id!==c.id);},{pushUndo:h.pushUndo,notify:message}))return;close();h.rebuild();h.draw();h.save();};
 keepEar.onchange=drilled.onchange=()=>{discard();clearPreview();sync(true);h.draw();};
 more.ontoggle=()=>{if(selected)h.draw();};
 function sync(force=false){
  const c=awaiting?.r.syringe||current();
  if(!c||S.mode!=='design'||S.designFocus!==focus||h.is3D()||S.selectedLinkId||S.selectedNodeId||S.selectedTriangleId||S.selectedSliderId||S.selectedGearId||S.frameEditorOpen){close();return;}
  const points=awaiting?.r.points||h.points(),params=awaiting?.r.params||h.params(),comps=awaiting?.r.comps||h.comps(),p=pending.position||attachmentPoint(c.a,comps,params,points)||c.a.position;if(!p)return;
  const shape=syringeShape(c,comps,params,points);if(!shape)return;const theta=shape.angle,u={x:Math.cos(theta),y:Math.sin(theta)};
  const set=(n,v)=>{if(force||document.activeElement!==n)showNumber(n,v);};
  const owner=comps.find(o=>o.id===c.a.componentId),line=false;
  x.closest('label').hidden=y.closest('label').hidden=line;along.closest('label').hidden=!line;set(along,c.a.u);
  set(x,p.x);set(y,p.y);set(angle,pending.axisDeg??c.axisDeg??0);set(offset,c.installation?.barrelOffsetMm??c.spec.bodyLength*.7);
  if(document.activeElement!==spacer){if(c.installation?.spacerMm==null)spacer.value='';else showNumber(spacer,c.installation.spacerMm);}
  const editMode=pending.mountMode||c.mountMode;
  rotationOptions.hidden=editMode==='pivot';angle.closest('label').hidden=editMode==='pivot';ear.closest('label').hidden=editMode!=='pivot';
  modeButtons.forEach((b,i)=>b.setAttribute('aria-pressed',String(editMode===(i?'pivot':'fixed-axis'))));
 ear.value=String(c.pivotEar??1);face.value=c.installation?.face||'front';
  const choices=installationChoices(comps,params),key=JSON.stringify([editMode,params,choices.frames.map(o=>[o.id,o.name]),choices.rods.map(o=>[o.id,o.name,params[o.lenParam]])]);
  if(key!==choiceKey){choiceKey=key;frame.replaceChildren();output.replaceChildren();opt(frame,'未連接','');opt(output,'未連接','');choices.frames.forEach(o=>opt(frame,o.name||o.id,o.id));choices.rods.forEach(o=>syringeAttachmentHoles(o,params).sort((a,b)=>a.v-b.v||a.u-b.u).filter(h=>editMode==='pivot'||['p1','p2'].includes(h.key)).forEach(h=>opt(output,holeName(ownerName(o),syringeAttachmentHoles(o,params),h),JSON.stringify({componentId:o.id,u:h.u,v:h.v}))));}
  frame.value=pending.frameId??c.a.componentId;const ref=pending.b||c.b;output.value=ref.componentId?JSON.stringify({componentId:ref.componentId,u:ref.u,v:ref.v}):'';
  const missing=['a','b'].filter(k=>!attachmentPoint(c[k],comps,params,points));reconnect.hidden=false;cancelPick.hidden=!!awaiting||(!pickingKey&&!Object.keys(pending).length);done.textContent=awaiting||Object.keys(pending).length?'關閉（不套用）':'完成';reconnect.textContent=pickingKey?'正在選孔…':'在圖上更換推桿孔';
  clearPicks();if(pickingKey)drawPickHoles(c,editMode);
  if(missing.length){h.svg.querySelectorAll('[data-dimension-handle^="syringe-"]').forEach(n=>n.remove());return;}
  if(awaiting){h.svg.querySelectorAll('[data-dimension-handle^="syringe-"]').forEach(n=>n.remove());previewCandidate(awaiting.r);return;}
  if(pickingKey||Object.keys(pending).length){h.svg.querySelectorAll('[data-dimension-handle^="syringe-"]').forEach(n=>n.remove());return;}
  if(draft)return;
  h.svg.querySelectorAll('[data-dimension-handle^="syringe-"]').forEach(n=>n.remove());
  const base=JSON.stringify([S.comps,S.topo.params,S.modules,S.fabrication,S.designFocus,S.mode]);
  const accept=patch=>{draft=false;if(base!==JSON.stringify([S.comps,S.topo.params,S.modules,S.fabrication,S.designFocus,S.mode])||!current()){h.draw();return;}apply(patch);h.draw();};
  const reset=()=>{clearPreview();draft=false;showNumber(along,c.a.u);showNumber(x,p.x);showNumber(y,p.y);showNumber(angle,c.axisDeg??0);showNumber(offset,c.installation?.barrelOffsetMm??c.spec.bodyLength*.7);h.previewStroke(c.extension);};
  const previewMount=(center,deg=c.axisDeg)=>{
   clearPreview();const ns='http://www.w3.org/2000/svg',g=document.createElementNS(ns,'g');g.dataset.clampPreview='';g.style.pointerEvents='none';h.svg.append(g);
   const t=(deg??0)*Math.PI/180,add=(tag,attrs)=>{const n=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));g.append(n);};
   const world=q=>({x:center.x+q.x*Math.cos(t)-q.y*Math.sin(t),y:center.y+q.x*Math.sin(t)+q.y*Math.cos(t)});
   if(c.mountMode==='pivot'){const q=project(center);add('circle',{cx:q.x,cy:q.y,r:5,fill:'white',stroke:'#d97706','stroke-width':2});return;}
   for(const foot of shape.clamp.feet){
    add('polygon',{points:foot.outline.map(q=>{const p=project(world(q));return `${p.x},${p.y}`;}).join(' '),fill:'#fff7ed','fill-opacity':.7,stroke:'#d97706','stroke-dasharray':'4 3'});
    const q=project(world(foot.hole));add('circle',{cx:q.x,cy:q.y,r:foot.hole.r*View.getScale(),fill:'white',stroke:'#d97706','stroke-width':2,'data-preview-hole':'true'});
   }
  };
  dimensionHandle(h.svg,{key:'syringe-position',label:c.mountMode==='pivot'?'轉軸':'固定環',point:project(p),direction:{x:1,y:0},value:0,step:1,cancel:reset,plane:{value:p,fromScreen:q=>View.worldFromScreen(q.x,q.y),project,constrain:q=>syringePositionOnFrame(owner,params,points,q,{comps,params,fabrication:S.fabrication})||p,preview:q=>{draft=true;previewMount(q);showNumber(x,q.x);showNumber(y,q.y);if(line){const a=points[owner.p1.id]||owner.p1;showNumber(along,Math.hypot(q.x-a.x,q.y-a.y));}},commit:q=>accept({position:q})}});
  const unit=View.getScale(),pixel=unit*Math.hypot(h.svg.getScreenCTM().a,h.svg.getScreenCTM().b),at=d=>({x:shape.a.x+u.x*d,y:shape.a.y+u.y*d});
  // Same-member relocation uses the same candidate as the existing hole list.
  const rod=comps.find(o=>o.id===c.b.componentId),holes=syringeAttachmentHoles(rod,params).filter(q=>c.mountMode==='pivot'||['p1','p2'].includes(q.key)).map(q=>({ref:{componentId:rod.id,u:q.u,v:q.v},point:attachmentPoint({componentId:rod.id,u:q.u,v:q.v},comps,params,points)})).filter(q=>q.point);
  const nearest=q=>holes.reduce((best,h)=>!best||Math.hypot(q.x-h.point.x,q.y-h.point.y)<Math.hypot(q.x-best.point.x,q.y-best.point.y)?h:best,null);
  if(holes.length>1)dimensionHandle(h.svg,{key:'syringe-output',label:'推桿接孔',point:project(shape.b),direction:{x:1,y:0},value:0,activate:()=>output.focus(),cancel:()=>{output.value=JSON.stringify(c.b);message('');reset();h.draw();},plane:{value:shape.b,fromScreen:q=>View.worldFromScreen(q.x,q.y),project,constrain:q=>nearest(q).point,preview:q=>{draft=true;const b=nearest(q).ref;output.value=JSON.stringify(b);message('沿原零件選孔；放開後預覽，確認才套用。');},commit:q=>{draft=false;if(base!==JSON.stringify([S.comps,S.topo.params,S.modules,S.fabrication,S.designFocus,S.mode])||!current()){h.draw();return;}const b=nearest(q).ref;if(b.u===c.b.u&&b.v===c.b.v){message('');h.draw();return;}chooseOutput(b);}}});
  // Offset from the output hole, so pulling the stroke cannot steal joint selection.
  const strokePoint={x:shape.b.x-u.y*48/pixel,y:shape.b.y+u.x*48/pixel};
  const leader=document.createElementNS('http://www.w3.org/2000/svg','line'),start=project(shape.b),end=project(strokePoint);
  for(const [key,value]of Object.entries({x1:start.x,y1:start.y,x2:end.x,y2:end.y,stroke:'#81aeb8','stroke-width':1,'pointer-events':'none'}))leader.setAttribute(key,value);h.svg.append(leader);
  dimensionHandle(h.svg,{key:'syringe-stroke',label:'伸出量',point:project(strokePoint),direction:{x:u.x*unit,y:-u.y*unit},value:c.extension,min:0,max:c.spec.stroke,activate:h.focusStroke,preview:v=>{draft=true;h.previewStroke(v);},cancel:reset,commit:v=>{draft=false;if(base===JSON.stringify([S.comps,S.topo.params,S.modules,S.fabrication,S.designFocus,S.mode]))h.stroke(c.id,v);h.draw();}});
  if(c.mountMode!=='pivot')dimensionHandle(h.svg,{key:'syringe-angle',label:'安裝方向',point:project(at(Math.max(65,66/pixel))),direction:{x:0,y:0},value:c.axisDeg??0,min:-360,max:360,step:1,activate:()=>{angle.focus();angle.select();},angleCenter:project(keepEar.checked?fixedEarRotation(c,{comps,params},points,c.axisDeg).ear:shape.a),angleAxes:{u:{x:unit,y:0},v:{x:0,y:-unit}},preview:v=>{draft=true;previewMount(keepEar.checked?fixedEarRotation(c,{comps,params},points,v).position:p,v);showNumber(angle,v);},cancel:reset,commit:v=>accept({... (keepEar.checked?fixedEarRotation(c,{comps,params},points,v):{axisDeg:v}),keepOldHoles:drilled.checked}),color:'#d97706'});
  if(more.open){const v=c.installation?.barrelOffsetMm??c.spec.bodyLength*.7;dimensionHandle(h.svg,{key:'syringe-barrel',label:'距筒尾',point:project(at(-v)),direction:{x:-u.x*unit,y:u.y*unit},value:v,min:6,max:c.spec.bodyLength-6,preview:v=>{draft=true;showNumber(offset,v);},cancel:reset,commit:v=>accept({barrelOffsetMm:v})});}
 }
 function cancelConnection(){discard();pending={};pickingKey=null;clearPicks();clearPreview();message('已取消連接修改。');sync(true);h.draw();}
 cancelPick.onclick=cancelConnection;
 function changeMode(value){
  const c=current();if(!c)return;
  if(value===c.mountMode&&!Object.keys(pending).length)return;
  const shape=syringeShape(c,h.comps(),h.params(),h.points());if(!shape)return;
  // Keep the physical clamp location when changing center-based / ear-based attachment.
  const sign=c.pivotEar??1,position=value==='fixed-axis'?shape.a:{x:shape.a.x-Math.sin(shape.angle)*SYRINGE_EAR_MM*sign,y:shape.a.y+Math.cos(shape.angle)*SYRINGE_EAR_MM*sign};
  pending={...pending,mountMode:value,position,axisDeg:shape.angle*180/Math.PI};
  pickingKey=null;apply({}, {preview:true});h.draw();
 }
 function explainOutput(b){
  const c=current();if(!c)return;const mode=pending.mountMode||c.mountMode,checks=outputHoleChecks(h.comps(),h.params(),pending.frameId||c.a.componentId,b),check=checks[mode];
  if(check.ok||check.reason==='distance')return;
  const other=mode==='pivot'?'fixed-axis':'pivot',alternate=checks[other].ok||checks[other].reason==='distance',owner=h.comps().find(o=>o.id===b.componentId);
  message(`${ownerName(owner)}：${alternate?`已選取此孔，請點「${other==='fixed-axis'?'雙孔固定':'單孔可轉'}」預覽接法，再確認。`:check.message}`);
 }
 function pickHoles(c,mode){
  const choices=installationChoices(h.comps(),h.params()),owners=pickingKey==='a'?choices.frames:choices.rods;
  return owners.flatMap(owner=>syringeAttachmentHoles(owner,h.params()).map(hole=>{
   const ref={componentId:owner.id,u:hole.u,v:hole.v},point=attachmentPoint(ref,h.comps(),h.params(),h.points());
   const checks=pickingKey==='a'?null:outputHoleChecks(h.comps(),h.params(),pending.frameId||c.a.componentId,ref),check=checks?.[mode]||{ok:true};
   const usable=!!check.ok||check.reason==='distance';
   return {owner,hole,ref,point,usable};
  })).filter(p=>p.point);
 }
 function drawPickHoles(c,mode){
  const ns='http://www.w3.org/2000/svg',g=document.createElementNS(ns,'g');g.dataset.syringePickHoles='';
  for(const pick of pickHoles(c,mode)){
   const p=project(pick.point),dot=document.createElementNS(ns,'circle');
   const px=Math.hypot(h.svg.getScreenCTM().a,h.svg.getScreenCTM().b)||1;
   for(const [k,v] of Object.entries({cx:p.x,cy:p.y,r:(pick.usable?9:4)/px,fill:pick.usable?'#fff7ed':'#e2e8f0',stroke:pick.usable?'#d97706':'#94a3b8','stroke-width':2/px,'data-syringe-pick':pick.hole.id}))dot.setAttribute(k,v);
   dot.setAttribute('aria-label',holeName(ownerName(pick.owner),syringeAttachmentHoles(pick.owner,h.params()),pick.hole));g.append(dot);
  }
  h.svg.append(g);
 }
 reconnect.onclick=()=>{
  const c=current();if(!c)return;discard();clearPreview();
  pickingKey=!h.comps().some(o=>o.id===(pending.frameId||c.a.componentId))?'a':'b';
  message(pickingKey==='a'?'點選底座孔；可按取消。':'點孔更換推桿連接；灰孔會說明需要的接法。');h.draw();
 };
 h.svg.addEventListener('pointerdown',e=>{
  if(!pickingKey||e.isPrimary===false)return;e.preventDefault();e.stopImmediatePropagation();
  const c=current();if(!c)return;
  const hits=pickHoles(c,pending.mountMode||c.mountMode).map(pick=>{const p=project(pick.point),q=new DOMPoint(p.x,p.y).matrixTransform(h.svg.getScreenCTM());return {...pick,distance:Math.hypot(q.x-e.clientX,q.y-e.clientY)};}).filter(p=>p.distance<=24).sort((a,b)=>a.distance-b.distance);
  if(!hits.length){message('請點橘色可用孔；也可從「推桿連接孔」清單選擇。');return;}
  const closeHits=hits.filter(p=>p.distance-hits[0].distance<2),usable=closeHits.filter(p=>p.usable),candidates=usable.length?usable:closeHits;
  if(candidates.length>1){message(`重疊孔：${[...new Set(candidates.map(p=>ownerName(p.owner)))].join('、')}。請在「推桿連接孔」指定零件。`);output.focus();return;}
  const pick=candidates[0],patch=pickingKey==='a'?{frameId:pick.owner.id,position:pick.point}:{b:pick.ref};
  pending={...pending,...patch};pickingKey=null;apply({}, {preview:true});h.draw();
  if(patch.b)explainOutput(patch.b);
 },true);
 h.svg.addEventListener('pointerdown',e=>{if(selected&&!pickingKey&&e.isPrimary!==false&&!e.target.closest('[data-dimension-handle^="syringe-"],[data-syringe]'))close();},true);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&awaiting){cancelHoles.click();return;}if(e.key==='Escape'&&(pickingKey||Object.keys(pending).length)){cancelConnection();return;}if(e.key==='Escape'&&selected&&!draft&&!panel.contains(e.target)){close();h.draw();}});
 function reveal(){
  if(!selected||!matchMedia('(max-width:1099px) and (max-height:500px), (max-width:700px)').matches)return;const nodes=[...h.svg.querySelectorAll('[data-dimension-handle^="syringe-"]')],bounds=nodes.map(n=>n.getBoundingClientRect());if(!bounds.length)return;
  const bottom=Math.max(...bounds.map(r=>r.bottom)),top=Math.min(...bounds.map(r=>r.top)),limit=document.querySelector('.controls').getBoundingClientRect().top-10,edge=h.svg.getBoundingClientRect().top+10;
  const dy=bottom>limit?Math.max(limit-bottom,edge-top):top<edge?edge-top:0;if(Math.abs(dy)>1){View.panByClient(h.svg,0,dy);h.draw();}
 }
 return {close,sync,open(id){drilled.checked=false;keepEar.checked=true;selected=id;pending={};pickingKey=null;focus=S.designFocus;const c=current(),missing=['a','b'].filter(k=>!attachmentPoint(c[k],h.comps(),h.params(),h.points()));message(missing.length?'未連接：選新的孔位接回；接好前不能模擬。':'');if(missing.length)more.open=true;panel.style.display='flex';h.showEditor();if(sheetMode())setSheet('half');h.draw();requestAnimationFrame(()=>requestAnimationFrame(reveal));}};
}
