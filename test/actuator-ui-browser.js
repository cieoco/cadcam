import {pointDisplayName} from '../js/blocks/display-labels.js';
import {S} from '../js/blocks/state.js';
import * as Panels from '../js/blocks/panels.js';
import {actuatorSource} from './fixtures/actuator-installation.mjs';
import {encodeSnapshot,decodeShareString} from '../js/share-codec.js';
import * as View from '../js/blocks/view.js';
import {makeStandardBlank} from '../js/blocks/standard-blank.js';
import {FABRICATION_DEFAULTS} from '../js/blocks/fabrication-profile.js';
const b=window.blocks,api=b.gripperPilot,lines=[];
const assert=(condition,name)=>{if(!condition)throw Error(name);lines.push('PASS '+name);};
const dialog=()=>document.querySelector('#motorInstallation');
const button=text=>[...dialog().querySelectorAll('button')].find(n=>n.textContent===text).click();
const field=(label,value,event='change')=>{const n=dialog().querySelector(`[aria-label="${label}"]`);n.value=value;n.dispatchEvent(new Event(event,{bubbles:true}));};
const waitDialog=async()=>{for(let i=0;i<50&&!dialog();i++)await new Promise(r=>setTimeout(r,100));assert(!!dialog(),'installation dialog loaded');};
const configure=()=>{
 [...dialog().querySelectorAll('details')].find(d=>d.querySelector('summary').textContent==='連接與安裝方式').open=true;
 assert(!dialog().querySelector('nav'),'motor has one installation view without step navigation');
 field('外殼固定在哪個零件？','Frame');button('正面');field('軸心位置','p1');field('輸出軸帶動哪個零件？','Arm');
};
if(new URLSearchParams(parent.location.search).has('blankOnly')){await import('./standard-blank-ui-browser.js');}else{
try{
 // Adding a motor must not change meaning just because a separate rod exists.
 for(const type of ['tt','n20','mg995'])for(const reverse of [false,true])for(const entry of ['canvas','numeric']){
  const plate=makeStandardBlank({kind:'plate',columns:16,rows:12,origin:{x:-64,y:-40}}),rod=makeStandardBlank({kind:'bar',n:20,lengthMm:56,origin:{x:-32,y:-80}}),fab=structuredClone(FABRICATION_DEFAULTS);
  fab.drive.n20Spec=1;Object.assign(fab.mg995Mount,{cableNotchWidthMm:6,cableNotchDepthMm:2});
  const comps=[plate.comp,rod.comp];if(reverse)comps.reverse();api.reopen({kind:'blocks',v:1,counter:20,comps,params:{...plate.params,...rod.params},fabrication:fab});S.undoStack=[];b.fitView();
  const before=JSON.stringify(api.snapshot()),beforeRod=JSON.stringify(S.comps.find(c=>c.id===rod.comp.id));b.pickMotorType(type);await waitDialog();
  assert(dialog().textContent.includes('點畫布放馬達軸心'),'mixed design starts placement '+type+' '+entry+' '+reverse);
  assert(dialog().querySelector('[aria-label="輸出軸帶動哪個零件？"]').value==='','mixed design never guesses existing output');
  if(entry==='canvas'){
   const svg=document.getElementById('motorInstallationCanvas'),q=new DOMPoint(0,0).matrixTransform(svg.getScreenCTM());
   const fire=event=>svg.dispatchEvent(new PointerEvent(event,{bubbles:true,cancelable:true,pointerId:901,isPrimary:true,pointerType:innerWidth<700?'touch':'mouse',button:0,clientX:q.x,clientY:q.y}));
   fire('pointerdown');fire('pointercancel');assert(JSON.stringify(api.snapshot())===before&&!S.undoStack.length,'mixed placement cancel preserves both parts');fire('pointerdown');fire('pointerup');
  }else{field('軸心 X (mm)','0');field('軸心 Y (mm)','0');button('依座標放置');}
  const motor=S.comps.find(c=>c.type==='motor');assert(!dialog()&&motor?.motorMount.frameBody===plate.comp.id,'mixed design places motor on plate '+type+' '+entry+' '+reverse);
  assert(JSON.stringify(S.comps.find(c=>c.id===rod.comp.id))===beforeRod,'unselected rod stays unchanged');assert(S.comps.find(c=>c.id===plate.comp.id).standardBlank.mountHoles.length>0,'mixed carrier has actual mounting holes');assert(S.undoStack.length===1,'mixed placement is one undo');
  const saved=api.snapshot();b.undo();assert(JSON.stringify(api.snapshot())===before,'mixed placement undo restores original');api.reopen(decodeShareString(encodeSnapshot(saved)));assert(S.comps.find(c=>c.type==='motor')?.motorMount.frameBody===plate.comp.id,'mixed placement survives reopen');
 }
 api.reopen(structuredClone(actuatorSource));const before=JSON.stringify(api.snapshot());
 b.pickMotorType('mg995');await waitDialog();assert(!!dialog(),'new servo enters installation before changing work');
 assert([...dialog().querySelectorAll('button')].find(n=>n.textContent==='確認安裝').disabled,'two loose endpoints require a choice');
 configure();
 await new Promise(r=>requestAnimationFrame(r));
 assert(dialog().tagName==='SECTION'&&dialog().classList.contains('inspector-panel')&&getComputedStyle(dialog()).position!=='fixed','installation uses ordinary inspector, not a floating dialog');
 assert(dialog().parentElement.matches('.canvas-wrap,#sheetBody'),'installation shares desktop inspector or mobile sheet');
 field('本體偏轉角度 (°)','12.5');assert(document.querySelector('#motorInstallationCanvas [data-motor-rotation]'),'body rotation handle shares the candidate');
 assert(JSON.stringify(api.snapshot())===before,'numeric body angle remains preview only');
 field('本體偏轉角度 (°)','0');
 field('起始角度 (°)','+30','input');dialog().querySelector('[aria-label="起始角度 (°)切換正負"]').click();
 assert(dialog().querySelector('[aria-label="起始角度 (°)"]').value==='-30','servo sign button changes +30 to -30');
 field('結束角度 (°)','+30');button('檢查動作範圍');
 assert(dialog().textContent.includes('61 個角度採樣通過'),'signed servo range is accepted');
 field('起始角度 (°)','0');field('結束角度 (°)','90');
 field('試動角度 (°)','45','input');button('檢查動作範圍');
 assert(dialog().textContent.includes('91 個角度採樣通過'),'servo range solved in candidate');
 assert(JSON.stringify(api.snapshot())===before,'mount, face, connection and trial leave work intact');
 button('查看 3D');
 for(let i=0;i<50&&!dialog().querySelector('canvas');i++)await new Promise(resolve=>setTimeout(resolve,100));
 await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 const canvas=dialog().querySelector('canvas'),box=canvas?.getBoundingClientRect(),preview=dialog().querySelector('.install-preview').getBoundingClientRect();
 assert(!!canvas&&box.height>100&&box.top>=preview.top&&box.bottom<=preview.bottom+1,'candidate 3D viewer renders inside visible preview '+JSON.stringify({box:box?.toJSON(),preview:preview.toJSON()}));button('取消');
 assert(JSON.stringify(api.snapshot())===before,'cancel leaves original work intact');
 b.pickMotorType('mg995');await waitDialog();configure();field('試動角度 (°)','45','input');button('確認安裝');
 const arm=S.comps.find(c=>c.id==='Arm'),frame=S.comps.find(c=>c.id==='Frame');
 assert(!dialog()&&arm.isInput&&arm.motorCarrier==='Frame'&&arm.motorMount.face==='front','confirm installs servo on real carrier and selected face');
 assert(arm.p1.id===frame.p1.id&&frame.motorMountPoint==='A','loose output connects real shared point and explicit mount host: '+JSON.stringify({arm:arm.p1,frame:frame.p1,mount:frame.motorMountPoint}));
 assert(S.theta===45,'confirmed trial angle remains visible');
 const saved=api.snapshot();b.undo();assert(JSON.stringify(api.snapshot())===before,'one undo restores entire installation');
 api.reopen(decodeShareString(encodeSnapshot(saved)));assert(S.comps.find(c=>c.id==='Arm').motorMount.face==='front','save/share/reopen preserves face');
 await b.configureMotorMount('A');assert(!dialog().querySelector('[aria-label="馬達本體方向"]').closest('section').hidden,'existing motor opens directly at body orientation');
 const beforeDirection=JSON.stringify(api.snapshot()),beforeDirectionAngle=S.theta;field('馬達本體方向','vertical');button('本體轉向 180°');
 assert(JSON.stringify(api.snapshot())===beforeDirection,'body orientation preview does not mutate work');button('取消');
 assert(JSON.stringify(api.snapshot())===beforeDirection,'cancel body orientation preserves work');
 await b.configureMotorMount('A');field('馬達本體方向','vertical');button('本體轉向 180°');button('儲存安裝');
 const adjusted=S.comps.find(c=>c.id==='Arm');
 assert(adjusted.motorMount.orientation==='vertical'&&adjusted.motorMount.reversed&&S.theta===beforeDirectionAngle,'orientation saves directly without changing motor angle');
 api.reopen(decodeShareString(encodeSnapshot(api.snapshot())));await b.configureMotorMount('A');
 assert(dialog().querySelector('[aria-label="馬達本體方向"]').value==='vertical'&&[...dialog().querySelectorAll('button')].find(n=>n.textContent==='本體轉向 180°').getAttribute('aria-pressed')==='true','saved body orientation reopens');button('取消');
 await b.configureMotorMount('A');button('背面');button('儲存安裝');assert(S.comps.find(c=>c.id==='Arm').motorMount.face==='back','edit can jump directly to face and save');
 b.undo();assert(S.comps.find(c=>c.id==='Arm').motorMount.face==='front','mount edit undo');
 api.reopen(structuredClone(actuatorSource));b.pickMotorType('tt');await waitDialog();configure();button('檢查動作範圍');assert(dialog().textContent.includes('361 個角度採樣通過'),'TT continuous rotation shares the same flow');button('確認安裝');
 assert(S.comps.find(c=>c.id==='Arm').motorType==='tt','TT installed');
 await b.configureMotorMount('A');field('輸出軸帶動哪個零件？','Frame');
 assert([...dialog().querySelectorAll('button')].find(n=>n.textContent==='儲存安裝').disabled,'same carrier/output cannot save');button('取消');
 api.reopen({kind:'blocks',v:1,params:{GR:20,PR:12},comps:[{type:'gear',id:'Gear',p1:{id:'G',type:'floating',x:0,y:0},p2:{id:'P',type:'floating',x:12,y:0},radiusParam:'GR',pinRadiusParam:'PR',teeth:20,module:2}]});
 S.selectedGearId='Gear';b.setSelectedMotorType('tt','gear');await waitDialog();
 assert(!!dialog()&&!S.comps[0].p1.physicalMotor,'gear face shortcut opens candidate instead of immediately installing');
 assert(dialog().textContent.includes('會固定此孔'),'quick world mount is explicit');button('確認安裝');
 assert(S.comps[0].p1.physicalMotor&&S.comps[0].motorMount.face==='back','gear shortcut confirms through shared installation');
 const loose={...structuredClone(actuatorSource),comps:[structuredClone(actuatorSource.comps[1])]};
 api.reopen(loose);const looseBefore=JSON.stringify(api.snapshot());await b.configureMotorMount(null,'Arm');await waitDialog();
 document.querySelector('#motorInstallationCanvas [data-quick-node="D"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
 assert(dialog().textContent.includes(pointDisplayName(loose.comps,'D'))&&dialog().textContent.includes('會固定此孔'),'clicked endpoint and grounding are previewed');
 assert(JSON.stringify(api.snapshot())===looseBefore,'quick preview leaves source unchanged');button('確認安裝');
 assert(S.comps[0].p2.physicalMotor&&S.comps[0].p2.type==='fixed','quick flow installs at the chosen second endpoint');
 b.undo();assert(JSON.stringify(api.snapshot())===looseBefore,'quick installation has one undo');
 api.reopen(loose);b.pickMotorType('n20');await waitDialog();field('外殼固定在哪個零件？','world');field('輸出軸帶動哪個零件？','Arm');field('試動角度數值 (°)','35.5');button('確認安裝');assert(S.comps[0].motorType==='n20','N20 canvas installation commits');b.undo();assert(JSON.stringify(api.snapshot())===looseBefore,'N20 canvas installation undo');
 // Motor-first uses the same preview/confirm transaction, without pre-existing parts.
 for(const type of ['tt','n20','mg995']){
  api.reopen({kind:'blocks',v:1,counter:0,comps:[],params:{theta:0}});const empty=JSON.stringify(api.snapshot());
  b.pickMotorType(type);await waitDialog();
  assert(dialog().textContent.includes('點畫布放馬達軸心'),'empty design offers motor-first placement');
  field('軸心 X (mm)','12.5');field('軸心 Y (mm)','20');field('新桿孔距 (mm)','64');field('新桿方向 (°)','30');button('預覽輸出桿');
  assert(JSON.stringify(api.snapshot())===empty,'motor-first preview does not mutate design');
  button('取消');assert(JSON.stringify(api.snapshot())===empty,'motor-first cancel leaves no hidden part');
  b.pickMotorType(type);await waitDialog();field('軸心 X (mm)','12.5');field('軸心 Y (mm)','20');field('新桿孔距 (mm)','64');field('新桿方向 (°)','30');button('預覽輸出桿');field('新桿孔距 (mm)','2');assert([...dialog().querySelectorAll('button')].find(n=>n.textContent==='確認安裝').disabled,'invalid new rod cannot commit previous preview');field('新桿孔距 (mm)','64');button('確認安裝');
  assert(S.comps.length===1&&S.comps[0].motorType===type&&S.comps[0].p1.x===12.5&&S.topo.params[S.comps[0].lenParam]===64,'motor-first confirms actual standard output rod and actuator');
  const saved=api.snapshot();b.undo();assert(JSON.stringify(api.snapshot())===empty,'motor-first single undo removes motor and new rod');api.reopen(decodeShareString(encodeSnapshot(saved)));assert(S.comps[0].isInput&&S.comps[0].motorType===type,'motor-first save reopens');
 }
 // Standalone placement uses the same reviewed transaction on pointer release.
 for(const type of ['tt','n20','mg995']){
  api.reopen({kind:'blocks',v:1,counter:0,comps:[],params:{theta:0}});S.undoStack=[]; // Isolate this fixture from identical baselines retained by previous tests.
  const before=JSON.stringify(api.snapshot()),undo=S.undoStack.length;
  b.pickMotorType(type);await waitDialog();
  const canvas=document.getElementById('motorInstallationCanvas'),bounds=canvas.getBoundingClientRect(),at={x:bounds.x+bounds.width*.35,y:bounds.y+bounds.height*.3},end={x:at.x+25,y:at.y+10};
  const fire=(event,p,id=191)=>canvas.dispatchEvent(new PointerEvent(event,{bubbles:true,pointerId:id,isPrimary:true,pointerType:innerWidth<700?'touch':'mouse',button:0,clientX:p.x,clientY:p.y}));
  assert(![...dialog().querySelectorAll('button')].some(n=>!n.hidden&&n.textContent==='儲存馬達'),'new '+type+' has no extra save step');
  fire('pointerdown',at);fire('pointermove',end);assert(JSON.stringify(api.snapshot())===before,'drag '+type+' previews until released');
  fire('pointercancel',end);fire('pointerup',end);assert(JSON.stringify(api.snapshot())===before&&S.undoStack.length===undo,'cancel '+type+' placement leaves no part or undo');
  fire('pointerdown',at);fire('pointermove',end);fire('pointerup',end);
  assert(!dialog()&&S.comps.length===1&&S.comps[0].type==='motor'&&S.comps[0].motorType===type,'release directly adds '+type);
  assert(S.undoStack.length===undo+1&&S.selectedNodeId===S.comps[0].p1.id,'direct '+type+' stays selected with one undo');
  b.undo();assert(JSON.stringify(api.snapshot())===before,'direct '+type+' placement undo');
  b.pickMotorType(type);await waitDialog();const tap=document.getElementById('motorInstallationCanvas');
  for(const event of ['pointerdown','pointerup'])tap.dispatchEvent(new PointerEvent(event,{bubbles:true,pointerId:192,isPrimary:true,pointerType:innerWidth<700?'touch':'mouse',button:0,clientX:at.x,clientY:at.y}));
  assert(!dialog()&&S.comps.length===1,'single click places '+type+' without confirmation');b.undo();
  b.pickMotorType(type);await waitDialog();field('軸心 X (mm)','');button('依座標放置');assert(!!dialog()&&!S.comps.length,'invalid numeric '+type+' placement stays editable');button('取消');
 }
 // A motor can be saved before any rod, then connected and released in the same sidebar.
 for(const type of ['tt','n20','mg995']){
  api.reopen({kind:'blocks',v:1,counter:0,comps:[],params:{theta:0}});const empty=JSON.stringify(api.snapshot());
  b.pickMotorType(type);await waitDialog();field('軸心 X (mm)','12.5');field('軸心 Y (mm)','20');button('依座標放置');
  assert(!dialog()&&S.comps.length===1&&S.comps[0].type==='motor'&&S.comps[0].motorType===type,'standalone '+type+' saves without hidden rod');
  const motorSaved=api.snapshot(),motorId=S.comps[0].id,center=S.comps[0].p1.id;
  const remove=document.getElementById('nodeRemoveMotorBtn');assert(remove.textContent===(type==='mg995'?'刪除舵機':'刪除馬達')&&!remove.closest('details')&&getComputedStyle(remove).display!=='none','standalone '+type+' exposes delete beside adjustment');
  remove.click();for(let i=0;i<50&&S.comps.length;i++)await new Promise(r=>setTimeout(r,20));assert(!S.comps.length,'standalone motor can be deleted');b.undo();assert(S.comps.length===1&&S.comps[0].id===motorId,'standalone deletion undo restores body');
  assert(!!document.querySelector('[data-motor-body]'),'standalone motor is drawn and selectable');
  b.undo();assert(JSON.stringify(api.snapshot())===empty,'standalone save is one undo');api.reopen(decodeShareString(encodeSnapshot(motorSaved)));
  await b.configureMotorMount(center);assert(!!dialog(),'standalone motor reopens existing sidebar');button('先放馬達，再畫輸出桿');field('軸心 X (mm)','12.5');field('軸心 Y (mm)','20');field('新桿孔距 (mm)','64');button('預覽輸出桿');button('儲存安裝');
  assert(!dialog()&&S.comps.length===1&&S.comps[0].isInput&&S.comps[0].motorMount.partId===motorId,'later output joins the same '+type);
  const stable=o=>JSON.stringify(o,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
  const connected=api.snapshot(),rod=structuredClone(S.comps[0]);S.selectedNodeId=rod.motorMount.center;Panels.updateRoleEditor();document.getElementById('nodeRemoveMotorBtn').click();
  assert(S.comps.length===1&&S.comps[0].id===rod.id&&!S.comps[0].isInput&&!S.comps[0].physicalMotor&&!S.comps[0].motorMount&&S.topo.params[rod.lenParam]===64,'delete attached '+type+' preserves rod and length');
  b.undo();assert(stable(api.snapshot())===stable(connected),'attached motor deletion has one undo');
  await b.configureMotorMount(rod.motorMount.center);button('解除輸出連接');assert(stable(api.snapshot())===stable(connected),'release remains a candidate');button('取消');assert(stable(api.snapshot())===stable(connected),'release cancellation preserves work');
  await b.configureMotorMount(rod.motorMount.center);button('解除輸出連接');button('儲存馬達');
  assert(!dialog()&&S.comps.length===2&&S.comps.some(c=>c.type==='motor'&&c.id===motorId)&&S.comps.some(c=>c.id===rod.id&&!c.isInput),'release keeps motor and rod');
  const released=api.snapshot();b.undo();assert(stable(api.snapshot())===stable(connected),'release has one undo');api.reopen(decodeShareString(encodeSnapshot(released)));
  const looseMotor=S.comps.find(c=>c.type==='motor');await b.configureMotorMount(looseMotor.p1.id);field('輸出軸帶動哪個零件？',rod.id);button('儲存安裝');assert(!dialog()&&S.comps.length===1&&S.comps[0].isInput,'released '+type+' reconnects after reopening');
 }
 // Desktop shortcuts reuse the same candidate and deletion transactions.
 api.reopen({kind:'blocks',v:1,counter:0,comps:[],params:{theta:0}});S.undoStack=[];
 const key=(name,target=document.body,more={})=>target.dispatchEvent(new KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true,...more}));
 b.pickMotorType('tt');await waitDialog();
 key('Enter',document.body,{isComposing:true});key('Enter',document.body,{repeat:true});key('Enter',document.body,{ctrlKey:true});
 assert(!S.comps.length&&!!dialog(),'IME, repeat and modified Enter do not confirm');
 key('Enter');assert(S.comps.length===1&&!dialog(),'Enter places standalone motor without extra click');
 const keyMotor=api.snapshot(),keyMotorId=S.comps[0].p1.id;
 await b.configureMotorMount(keyMotorId);key('Delete');assert(S.comps.length===1,'Delete does not remove source behind an installation draft');
 const angle=dialog().querySelector('[aria-label="本體偏轉角度 (°)"]');angle.focus();key('Delete',angle);assert(S.comps.length===1,'Delete in numeric field only edits text');
 angle.value='-';angle.dispatchEvent(new Event('input',{bubbles:true}));key('Enter',angle);assert(!!dialog()&&S.comps[0].motorMount.angleDeg===0,'Enter rejects incomplete decimal input');angle.value='22.5';angle.dispatchEvent(new Event('input',{bubbles:true}));
 key('Enter',angle);assert(!dialog()&&S.comps[0].motorMount.angleDeg===22.5,'Enter saves latest typed motor angle without prior change event');
 S.selectedNodeId=keyMotorId;Panels.updateRoleEditor();document.activeElement.blur();key('Delete',document.body,{isComposing:true});key('Delete',document.body,{repeat:true});assert(S.comps.length===1,'IME and held Delete do not remove work');
 key('Delete');for(let i=0;i<50&&S.comps.length;i++)await new Promise(r=>setTimeout(r,20));assert(!S.comps.length,'Delete removes selected standalone motor');b.undo();assert(S.comps.length===1&&S.comps[0].motorMount.angleDeg===22.5,'keyboard deletion has one undo');
 api.reopen(loose);b.selectLink('Arm');key('Delete');for(let i=0;i<50&&S.comps.length;i++)await new Promise(r=>setTimeout(r,20));assert(!S.comps.length,'Delete removes selected bar');b.undo();assert(S.comps[0].id==='Arm','keyboard bar deletion undo');
 for(const type of ['tt','n20','mg995']){
  api.reopen({kind:'blocks',v:1,counter:2,comps:[structuredClone(actuatorSource.comps[0])],params:{theta:0,F:80}});S.undoStack=[];
  b.pickMotorType(type);await waitDialog();button('在畫布放馬達');field('軸心 X (mm)','120.25');field('軸心 Y (mm)','40.5');field('本體偏轉角度 (°)','17.25');button('依座標放置');b.fitView();
  const svg=document.getElementById('stageSvg'),body=document.querySelector('[data-motor-body]'),rect=body.getBoundingClientRect(),at={clientX:rect.x+rect.width*.7,clientY:rect.y+rect.height*.4},to={clientX:at.clientX+35,clientY:at.clientY-25},a=View.worldFromEvent(svg,at),z=View.worldFromEvent(svg,to),original=api.snapshot(),motor=original.comps.find(c=>c.type==='motor'),undo=S.undoStack.length;
  const fire=(target,event,p)=>target.dispatchEvent(new PointerEvent(event,{bubbles:true,cancelable:true,pointerId:301,isPrimary:true,pointerType:innerWidth<700?'touch':'mouse',button:0,...p}));
  fire(body,'pointerdown',at);fire(svg,'pointerup',at);assert(S.undoStack.length===undo,'click '+type+' only selects');
  fire(document.querySelector('[data-motor-body]'),'pointerdown',at);fire(svg,'pointermove',to);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));fire(svg,'pointerup',to);
  const moved=S.comps.find(c=>c.type==='motor');assert(Math.abs(moved.p1.x-motor.p1.x-(z.x-a.x))<1e-6&&Math.abs(moved.p1.y-motor.p1.y-(z.y-a.y))<1e-6,'drag '+type+' preserves grip offset');
  assert(moved.motorMount.angleDeg===17.25&&JSON.stringify(S.comps.find(c=>c.id==='Frame'))===JSON.stringify(original.comps.find(c=>c.id==='Frame')),'drag '+type+' preserves orientation and nearby frame');
  const movedSaved=api.snapshot();assert(S.undoStack.length===undo+1,'drag '+type+' creates one undo');b.undo();assert(S.comps.find(c=>c.type==='motor').p1.x===motor.p1.x,'drag '+type+' undo restores original');api.reopen(decodeShareString(encodeSnapshot(movedSaved)));assert(S.comps.find(c=>c.type==='motor').p1.x===moved.p1.x,'drag '+type+' survives reopen');
  const snapshot=JSON.stringify(api.snapshot()),cancelCount=S.undoStack.length;fire(document.querySelector('[data-motor-body]'),'pointerdown',at);fire(svg,'pointermove',to);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));fire(svg,'pointercancel',to);assert(JSON.stringify(api.snapshot())===snapshot&&S.undoStack.length===cancelCount,'cancel '+type+' drag restores work');
  const snapWork=api.snapshot();snapWork.comps.find(c=>c.id==='Frame').holes=[{id:'SnapHole',u:40,v:0,diameter:3.2,type:'floating'}];api.reopen(snapWork);b.fitView();
  const frame=S.comps.find(c=>c.id==='Frame'),start=structuredClone(S.comps.find(c=>c.type==='motor')),box=document.querySelector('[data-motor-body]').getBoundingClientRect(),grip={clientX:box.x+box.width*.7,clientY:box.y+box.height*.4};
  const screen=p=>new DOMPoint(View.TX(p.x),View.TY(p.y)).matrixTransform(svg.getScreenCTM()),target={x:(frame.p1.x+frame.p2.x)/2,y:(frame.p1.y+frame.p2.y)/2},sp=screen(start.p1),tp=screen(target),drop={clientX:grip.clientX+tp.x-sp.x+2,clientY:grip.clientY+tp.y-sp.y+1},snapUndo=S.undoStack.length;
  fire(document.querySelector('[data-motor-body]'),'pointerdown',grip);fire(svg,'pointermove',drop);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  assert(S.snapTarget==='SnapHole'&&S.comps.find(c=>c.type==='motor').p1.x===target.x,'snap '+type+' shaft finds local hole from body grip');
  assert(!!svg.querySelector('circle[stroke="#2ecc71"]'),'snap '+type+' shows green target');fire(svg,'pointerup',drop);
  const snapped=api.snapshot(),aligned=snapped.comps.find(c=>c.type==='motor');assert(aligned.p1.x===target.x&&aligned.p1.y===target.y&&aligned.p1.id===start.p1.id&&!aligned.motorMount.frameBody&&S.snapTarget===null,'snap '+type+' aligns without implicit mount');
  assert(S.undoStack.length===snapUndo+1,'snap '+type+' is one undo');b.undo();assert(S.comps.find(c=>c.type==='motor').p1.x===start.p1.x,'snap '+type+' undo restores free position');api.reopen(decodeShareString(encodeSnapshot(snapped)));assert(S.comps.find(c=>c.type==='motor').p1.y===target.y,'snap '+type+' survives reopen');
 }
 // Placement and moving an existing independent motor use the same real carrier holes.
 for(const type of ['tt','n20','mg995']){
  const blank=makeStandardBlank({kind:'plate',columns:16,rows:12,origin:{x:-64,y:-40}}),fab=structuredClone(FABRICATION_DEFAULTS);fab.drive.n20Spec=1;Object.assign(fab.mg995Mount,{cableNotchWidthMm:6,cableNotchDepthMm:2});
  const work={kind:'blocks',v:1,counter:1,comps:[blank.comp],params:blank.params,fabrication:fab};api.reopen(work);S.undoStack=[];
  b.pickMotorType(type);await waitDialog();button('在畫布放馬達');field('軸心 X (mm)','1.25');field('軸心 Y (mm)','0.75');button('依座標放置');
  const mounted=S.comps.find(c=>c.type==='motor'),plate=S.comps.find(c=>c.id===blank.comp.id);assert(mounted?.motorMount.frameBody===plate.id&&plate.standardBlank.mountHoles.length>0,'drop '+type+' creates actual host and occupied holes');assert(!dialog()&&S.undoStack.length===1&&mounted.p1.type==='floating','drop '+type+' saves once without grounding loose plate');
  const saved=api.snapshot();b.undo();assert(!S.comps.some(c=>c.type==='motor')&&!S.comps[0].standardBlank.mountHoles,'drop '+type+' undo removes motor and holes');api.reopen(decodeShareString(encodeSnapshot(saved)));assert(S.comps[0].standardBlank.mountHoles.length>0,'drop '+type+' mount survives reopen');
  await b.configureMotorMount(S.comps.find(c=>c.type==='motor').p1.id);field('外殼固定在哪個零件？','world');const originalConfirm=window.confirm;try{window.confirm=()=>true;button('儲存馬達');}finally{window.confirm=originalConfirm;}assert(!S.comps[0].standardBlank.mountHoles&&!S.comps.find(c=>c.type==='motor').motorMount.frameBody,'drop '+type+' can release housing and restore grid');b.undo();assert(S.comps[0].standardBlank.mountHoles.length>0,'drop '+type+' housing release undo');
  // Start a separate loose body outside the board and drag its grip onto the grid.
  api.reopen(work);S.undoStack=[];b.pickMotorType(type);await waitDialog();button('在畫布放馬達');field('軸心 X (mm)','160');field('軸心 Y (mm)','0');button('依座標放置');b.fitView();
  const motor=structuredClone(S.comps.find(c=>c.type==='motor')),svg=document.getElementById('stageSvg'),body=document.querySelector('[data-motor-body]'),r=body.getBoundingClientRect(),grip={clientX:r.x+r.width*.6,clientY:r.y+r.height*.5};
  const screen=p=>new DOMPoint(View.TX(p.x),View.TY(p.y)).matrixTransform(svg.getScreenCTM()),a=screen(motor.p1),z=screen({x:0,y:0}),drop={clientX:grip.clientX+z.x-a.x,clientY:grip.clientY+z.y-a.y},count=S.undoStack.length;
  const fire=(target,event,p)=>target.dispatchEvent(new PointerEvent(event,{bubbles:true,cancelable:true,pointerId:401,isPrimary:true,pointerType:innerWidth<700?'touch':'mouse',button:0,...p}));
  fire(body,'pointerdown',grip);fire(svg,'pointermove',drop);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));fire(svg,'pointerup',drop);
  for(let i=0;i<100&&!S.comps.find(c=>c.type==='motor')?.motorMount.frameBody;i++)await new Promise(r=>setTimeout(r,20));
  assert(S.comps.find(c=>c.id===motor.id)?.motorMount.frameBody===blank.comp.id,'move '+type+' automatically mounts same motor');assert(S.undoStack.length===count+1,'move '+type+' and machining share one undo');b.undo();assert(S.comps.find(c=>c.id===motor.id).p1.x===160&&!S.comps[0].standardBlank.mountHoles,'move '+type+' undo restores position and grid');
 }
 {
  const blank=makeStandardBlank({lengthMm:80,origin:{x:-40,y:0}}),work={kind:'blocks',v:1,counter:1,comps:[blank.comp],params:blank.params};api.reopen(work);const before=JSON.stringify(api.snapshot());b.pickMotorType('tt');await waitDialog();button('在畫布放馬達');field('軸心 X (mm)','0');field('軸心 Y (mm)','0');button('依座標放置');assert(!!dialog()&&dialog().textContent.includes('座板無法容納')&&JSON.stringify(api.snapshot())===before,'invalid narrow carrier stays editable without drilling');button('取消');assert(JSON.stringify(api.snapshot())===before,'invalid auto mount cancel preserves original');
 }
 // Motor first, then a rod on its shaft: same output contract through canvas and exact input.
 for(const type of ['mg995','tt','n20'])for(const entry of ['canvas','numeric']){
  const {planMotorDrop}=await import('../js/blocks/motor-drop.js'),blank=makeStandardBlank({kind:'plate',columns:16,rows:12,origin:{x:-64,y:-40}}),fab=structuredClone(FABRICATION_DEFAULTS);
  blank.comp.p1.type=blank.comp.p2.type='fixed';fab.drive.n20Spec=1;Object.assign(fab.mg995Mount,{cableNotchWidthMm:6,cableNotchDepthMm:2});
  const work={kind:'blocks',v:1,counter:1,comps:[blank.comp],params:blank.params,fabrication:fab},r=planMotorDrop(work,{type,position:{x:0,y:0},face:'back',orientation:'horizontal',start:0,end:90});assert(r.ok,'output setup '+type+' '+entry);
  api.reopen({...work,comps:r.comps,params:r.params});S.undoStack=[];const motor=S.comps.find(c=>c.type==='motor');await b.openStandardBlank('bar');
  const panel=document.getElementById('standardBlankPanel'),svg=document.getElementById('stageSvg');
  for(const name of ['位置 X mm','位置 Y mm']){const n=panel.querySelector(`[aria-label="${name}"]`);n.value='0';n.dispatchEvent(new Event('input',{bubbles:true}));}
  if(entry==='numeric')panel.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
  else{const p=svg.createSVGPoint();p.x=View.TX(0);p.y=View.TY(0);const q=p.matrixTransform(svg.getScreenCTM());for(const event of ['pointerdown','pointerup'])svg.dispatchEvent(new PointerEvent(event,{bubbles:true,cancelable:true,pointerId:602,isPrimary:true,pointerType:innerWidth<700?'touch':'mouse',button:0,clientX:q.x,clientY:q.y}));}
  for(let i=0;i<100&&!S.comps.some(c=>c.isInput);i++)await new Promise(resolve=>setTimeout(resolve,20));
  const output=S.comps.find(c=>c.isInput);assert(output?.motorMount.partId===motor.id&&!S.comps.some(c=>c.type==='motor'),'new rod becomes existing motor output '+type+' '+entry);
  assert(!dialog()&&panel.hidden&&S.undoStack.length===1,'output placement has no extra confirmation and one undo '+type+' '+entry);
  const saved=api.snapshot();b.togglePlay();assert(document.getElementById('playBtn').classList.contains('playing'),'connected output can play '+type+' '+entry);b.pause();b.undo();assert(S.comps.length===2&&S.comps.some(c=>c.id===motor.id&&c.type==='motor'),'undo restores motor without output '+type+' '+entry);api.reopen(decodeShareString(encodeSnapshot(saved)));assert(S.comps.some(c=>c.isInput&&c.motorMount.partId===motor.id),'output connection reopens '+type+' '+entry);
 }
 // Existing loose rods must take the same path, not the generic transmission merge guard.
 for(const type of ['mg995','tt','n20'])for(const end of ['p1','p2']){
  const {planMotorDrop}=await import('../js/blocks/motor-drop.js'),blank=makeStandardBlank({kind:'plate',columns:16,rows:12,origin:{x:-64,y:-40}}),fab=structuredClone(FABRICATION_DEFAULTS);
  blank.comp.p1.type=blank.comp.p2.type='fixed';fab.drive.n20Spec=1;Object.assign(fab.mg995Mount,{cableNotchWidthMm:6,cableNotchDepthMm:2});
  const work={kind:'blocks',v:1,counter:20,comps:[blank.comp],params:blank.params,fabrication:fab},r=planMotorDrop(work,{type,position:{x:0,y:0},face:'back',orientation:'horizontal',start:0,end:90}),rod=makeStandardBlank({kind:'bar',lengthMm:56,origin:{x:-32,y:-70},n:20});
  api.reopen({...work,comps:[...r.comps,rod.comp],params:{...r.params,...rod.params}});S.undoStack=[];b.fitView();b.draw();
  const before=JSON.stringify(api.snapshot()),motor=S.comps.find(c=>c.type==='motor'),svg=document.getElementById('stageSvg'),screen=p=>new DOMPoint(View.TX(p.x),View.TY(p.y)).matrixTransform(svg.getScreenCTM());
  const from=screen(rod.comp[end]),to=screen(motor.p1),fire=(target,event,p)=>target.dispatchEvent(new PointerEvent(event,{bubbles:true,cancelable:true,pointerId:703,isPrimary:true,pointerType:innerWidth<700?'touch':'mouse',button:0,clientX:p.x,clientY:p.y}));
  const move=async()=>{const node=svg.querySelector(`[data-node-hit="${rod.comp[end].id}"]`);assert(!!node,'existing rod endpoint selectable '+type+' '+end);fire(node,'pointerdown',from);fire(svg,'pointermove',to);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));};
  await move();fire(svg,'pointercancel',to);assert(JSON.stringify(api.snapshot())===before&&!S.undoStack.length,'cancel output drag restores work '+type+' '+end);
  await move();fire(svg,'pointerup',to);for(let i=0;i<100&&!S.comps.some(c=>c.isInput);i++)await new Promise(r=>setTimeout(r,20));
  const out=S.comps.find(c=>c.id===rod.comp.id);assert(out?.isInput&&out.motorMount.partId===motor.id&&!S.comps.some(c=>c.type==='motor'),'existing rod connects to shaft '+type+' '+end);
  assert(S.topo.params[out.lenParam]===56&&out[end].id===motor.p1.id&&S.undoStack.length===1,'drag keeps length and records one undo '+type+' '+end);
  const saved=api.snapshot();b.togglePlay();assert(document.getElementById('playBtn').classList.contains('playing'),'dragged output plays '+type+' '+end);b.pause();b.undo();assert(JSON.stringify(api.snapshot())===before,'output drag undo restores original '+type+' '+end);api.reopen(decodeShareString(encodeSnapshot(saved)));assert(S.comps.some(c=>c.isInput&&c.motorMount.partId===motor.id),'dragged output reopens '+type+' '+end);
 }
 if(!new URLSearchParams(parent.location.search).has('motorOnly')) { // Gear hole: one draft shared by dragging and numeric input.
 const selectGear=()=>{document.querySelector('#stageSvg [data-pick-component="GearB"]').dispatchEvent(new PointerEvent('pointerdown',{pointerType:'mouse',bubbles:true}));document.getElementById('stageSvg').dispatchEvent(new PointerEvent('pointerup',{pointerId:0,bubbles:true}));};
 const gears=await (await fetch(new URL('./fixtures/gear-member-mount.json',import.meta.url))).json();gears.comps=gears.comps.slice(0,2);
 api.reopen(gears);selectGear();
 const radiusInput=document.getElementById('gearPinRadiusVal');radiusInput.value='18.5';radiusInput.dispatchEvent(new Event('change',{bubbles:true}));
 assert(radiusInput.value==='18.5','gear main numeric field retains decimal radius');
 api.reopen(decodeShareString(encodeSnapshot(api.snapshot())));selectGear();assert(radiusInput.value==='18.5','decimal gear radius survives share and reopen');
 api.reopen(gears);selectGear();const holeBefore=JSON.stringify(api.snapshot());
 await b.openGearHolePlacement('manual');
 assert(!document.querySelector('.gear-hole-dialog[open]'),'manual hole editing stays in main canvas');
 const r=document.getElementById('gearPinRadiusVal'),a=document.querySelector('#gearHoleAngleVal input');
 const number=(n,value)=>{n.value=String(value);n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));};
 const svg=document.getElementById('stageSvg');
 for(let i=0;i<50&&!svg.querySelector('[data-dimension-handle="gear-hole"]');i++)await new Promise(r=>setTimeout(r,20));
 const handle=svg.querySelector('[data-dimension-handle="gear-hole"]'),circle=handle.querySelector('circle'),p=new DOMPoint(+circle.getAttribute('cx'),+circle.getAttribute('cy')).matrixTransform(svg.getScreenCTM()),oldR=r.value,oldA=a.value;
 handle.dispatchEvent(new PointerEvent('pointerdown',{pointerId:1,isPrimary:true,clientX:p.x+5,clientY:p.y,bubbles:true}));
 assert(r.value===oldR&&a.value===oldA,'pressing the handle edge does not jump the hole');
 svg.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,isPrimary:true,clientX:p.x-10,clientY:p.y-20,bubbles:true}));
 assert(r.value!==oldR||a.value!==oldA,'dragging synchronizes the existing radius and angle');
 assert(JSON.stringify(api.snapshot())===holeBefore,'dragging remains a candidate');
 svg.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,isPrimary:true,bubbles:true}));
 assert(r.value===oldR&&a.value===oldA&&JSON.stringify(api.snapshot())===holeBefore,'cancelled gesture restores original precision');
 number(r,999);assert(JSON.stringify(api.snapshot())===holeBefore,'invalid radius leaves work untouched');
 number(r,18);number(a,90);assert(S.comps.find(c=>c.id==='GearB').phase===90,'exact angle updates the same hole');
 const placedHole=api.snapshot();b.undo();assert(S.comps.find(c=>c.id==='GearB').phase===0,'one undo restores the prior angle');
 api.reopen(decodeShareString(encodeSnapshot(placedHole)));selectGear();
 assert(document.querySelector('#gearHoleAngleVal input').value==='90','hole placement survives share and reopen');
 await b.openGearHolePlacement('mirror');const hole=document.querySelector('.gear-hole-dialog[open]');
 assert(!hole.querySelector('input,[data-hole-handle]'),'mirror has only its source rule, without a second manual editor');
 [...hole.querySelectorAll('button')].find(n=>n.textContent==='取消').click();
 const teeth=document.querySelector('#gearTeethField');for(let i=0;i<30&&!teeth.querySelector('input');i++)await new Promise(r=>setTimeout(r,20));
 assert(!teeth.querySelector('.nf-hint')&&teeth.querySelector('.nf-reset').hidden,'gear numbers have no redundant hint row or arbitrary reset');
 const teethNumber=teeth.querySelector('.nf-input'),teethSlider=teeth.querySelector('.nf-slider');
 teethNumber.value='16';teethNumber.dispatchEvent(new Event('change',{bubbles:true}));
 assert(S.comps.find(c=>c.id==='GearB').teeth===16&&teethSlider.value==='16','number updates teeth and shared slider');
 teethSlider.value='17';teethSlider.dispatchEvent(new Event('input',{bubbles:true}));teethSlider.dispatchEvent(new Event('change',{bubbles:true}));
 assert(S.comps.find(c=>c.id==='GearB').teeth===17&&teethNumber.value==='17','slider commits through existing numeric action');
 b.undo();assert(S.comps.find(c=>c.id==='GearB').teeth===16,'one slider change has one undo');
 }
 if(!new URLSearchParams(parent.location.search).has('motorOnly')) { // Shared direct editing: draft, exact placement, constraints, undo and persistence.
 const free={kind:'blocks',v:1,counter:1,comps:[{id:'Free',type:'bar',p1:{id:'A',type:'floating',x:0,y:0},p2:{id:'B',type:'floating',x:80,y:0},lenParam:'L',fixedLen:true}],params:{L:80,theta:0}};
 api.reopen(free);b.selectLink('Free');
 for(let i=0;i<50&&!document.querySelector('[data-dimension-handle="member-length"]');i++)await new Promise(r=>setTimeout(r,20));
 const before=JSON.stringify(api.snapshot()),undoCount=S.undoStack.length,svg=document.getElementById('stageSvg');
 const handle=()=>svg.querySelector('[data-dimension-handle="member-length"]');
 const move=()=>{const h=handle(),circle=h.querySelector('circle'),p=new DOMPoint(+circle.getAttribute('cx'),+circle.getAttribute('cy')).matrixTransform(svg.getScreenCTM());h.dispatchEvent(new PointerEvent('pointerdown',{pointerId:81,isPrimary:true,pointerType:'mouse',clientX:p.x,clientY:p.y,bubbles:true}));svg.dispatchEvent(new PointerEvent('pointermove',{pointerId:81,isPrimary:true,pointerType:'mouse',clientX:p.x+40,clientY:p.y,bubbles:true}));};
 move();assert(Number(document.getElementById('memberDimensionInput').value)>80&&JSON.stringify(api.snapshot())===before,'dimension drag updates numeric draft without changing work');
 svg.dispatchEvent(new PointerEvent('pointercancel',{pointerId:81,bubbles:true}));assert(JSON.stringify(api.snapshot())===before&&S.undoStack.length===undoCount,'cancel size drag preserves work and undo');
 move();svg.dispatchEvent(new PointerEvent('pointerup',{pointerId:81,bubbles:true}));const resized=api.snapshot();assert(resized.params.L>80&&S.undoStack.length===undoCount+1,'release size handle commits one undo');
 b.undo();assert(JSON.stringify(api.snapshot())===before,'size drag undo restores exact work');
 api.reopen(decodeShareString(encodeSnapshot(resized)));assert(S.topo.params.L===resized.params.L,'direct dimension survives share/reopen');
 api.reopen(free);b.selectLink('Free');const number=(label,value)=>{const n=document.querySelector(`[aria-label="${label}"]`);n.value=value;n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));};
 number('零件第一孔 X（mm）','20');assert(S.comps[0].p1.x===20&&S.comps[0].p2.x===100&&S.topo.params.L===80,'exact free-part position translates both holes without resizing');b.undo();assert(S.comps[0].p1.x===0,'exact movement has undo');
 const pinned=structuredClone(free);pinned.comps[0].p1.type='fixed';api.reopen(pinned);S.selectedNodeId='B';b.draw();const locked=JSON.stringify(api.snapshot());number('接點 X（mm）','40');assert(JSON.stringify(api.snapshot())===locked,'unreachable numeric coordinate cannot shorten a constrained bar');
 const tri={kind:'blocks',v:1,counter:1,params:{G:80,R1:60,R2:100},comps:[{id:'Tri',type:'triangle',p1:{id:'T1',type:'floating',x:0,y:0},p2:{id:'T2',type:'floating',x:80,y:0},p3:{id:'T3',type:'floating',x:0,y:60},gParam:'G',r1Param:'R1',r2Param:'R2'}]};
 api.reopen(tri);document.querySelector('#stageSvg [data-pick-component="Tri"]').dispatchEvent(new PointerEvent('pointerdown',{pointerType:'mouse',bubbles:true}));document.getElementById('stageSvg').dispatchEvent(new PointerEvent('pointerup',{pointerId:0,bubbles:true}));b.addTriangleOutlinePoint();const shapeBefore=JSON.stringify(api.snapshot());number('外形點沿 A–B（mm）','32.5');assert(S.comps[0].vertices.find(v=>!v.solve).u===32.5&&S.topo.params.R2===100,'outline coordinate changes shape without moving solver holes');b.undo();assert(JSON.stringify(api.snapshot())===shapeBefore,'outline coordinate has one undo');
 // Escape and a second contact cancel a size gesture without adding undo.
 api.reopen(free);b.selectLink('Free');const cancelledUndo=S.undoStack.length;move();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert(S.topo.params.L===80&&S.undoStack.length===cancelledUndo,'Escape cancels size gesture');
 move();svg.dispatchEvent(new PointerEvent('pointerdown',{pointerId:82,isPrimary:false,pointerType:'touch',bubbles:true}));svg.dispatchEvent(new PointerEvent('pointerup',{pointerId:81,bubbles:true}));svg.dispatchEvent(new PointerEvent('pointerup',{pointerId:82,bubbles:true}));assert(S.topo.params.L===80&&S.undoStack.length===cancelledUndo,'second pointer cancels size gesture');
 const stepHandle=(key)=>{const h=svg.querySelector(`[data-dimension-handle="${key}"]`);assert(!!h,`${key} has a graphical control`);h.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));};
 const disk=structuredClone(free);disk.comps[0].shape='disk';disk.comps[0].diameterMm=200;api.reopen(disk);b.selectLink('Free');stepHandle('disk-diameter');assert(S.comps[0].diameterMm===200.1,'disk handle uses diameter validation');b.undo();assert(S.comps[0].diameterMm===200,'disk diameter undo');
 api.reopen(free);b.selectLink('Free');document.getElementById('memberMore').open=true;b.draw();stepHandle('member-width');assert(S.comps[0].stock.widthMm>18,'stock width handle uses stock setter');b.undo();
 const ground=structuredClone(free);ground.comps[0].p1.type=ground.comps[0].p2.type='fixed';api.reopen(ground);S.frameEditorOpen=true;Panels.updateFrameEditor();b.draw();number('機架中心 X（mm）','60');assert(S.comps[0].p1.x===20&&S.comps[0].p2.x===100,'frame numeric move preserves hole distance');b.undo();S.frameEditorOpen=true;Panels.updateFrameEditor();b.draw();stepHandle('frame-widthMm');assert(S.comps[0].p1.frameStock.widthMm>0,'frame width handle keeps stock with fixed nodes');b.undo();
 const rail={kind:'blocks',v:1,counter:1,params:{RL:100,theta:0},comps:[{id:'Rail',type:'slider',lenParam:'RL',p1:{id:'RA',type:'fixed',x:0,y:0},p2:{id:'RB',type:'fixed',x:100,y:0},p3:{id:'RC',type:'floating',x:40,y:0},m1:{id:'RM1',type:'fixed',x:0,y:0},m2:{id:'RM2',type:'fixed',x:160,y:0},carrierLen:160,travelStart:0,travelEnd:80}]};
 api.reopen(rail);svg.querySelector('path[fill="transparent"]').dispatchEvent(new PointerEvent('pointerdown',{pointerType:'mouse',bubbles:true}));document.getElementById('stageSvg').dispatchEvent(new PointerEvent('pointerup',{pointerId:0,bubbles:true}));stepHandle('rail-length');assert(S.topo.params.RL===101,'rail handle edits length');b.undo();svg.querySelector('path[fill="transparent"]').dispatchEvent(new PointerEvent('pointerdown',{pointerType:'mouse',bubbles:true}));document.getElementById('stageSvg').dispatchEvent(new PointerEvent('pointerup',{pointerId:0,bubbles:true}));assert(!svg.querySelector('[data-dimension-handle=travel-start]'),'closed travel settings do not crowd the canvas');document.getElementById('sliderStartRow').closest('details').open=true;b.draw();stepHandle('travel-start');assert(S.comps[0].travelStart===1,'rail travel handle edits allowed start');number('行程終點（mm）','70');assert(S.comps[0].travelEnd===70,'rail end accepts exact input');
 api.reopen({kind:'blocks',v:1,counter:0,params:{theta:0},comps:[]});b.addRackPinion();const rack=S.comps.find(c=>c.type==='rack');stepHandle('rack-length');assert(S.topo.params[rack.lenParam]%8!==0,'rack size can use one mm without eight mm rounding');
 api.reopen(free);b.pickMotorType('n20');await waitDialog();field('外殼固定在哪個零件？','world');field('輸出軸帶動哪個零件？','Free');field('試動角度數值 (°)','35.5');assert(dialog().querySelector('[aria-label="試動角度 (°)"]').value==='35.5'&&dialog().querySelector('output').textContent.includes('35.5'),'N20 exact trial updates same candidate');button('確認安裝');assert(S.comps[0].motorType==='n20','N20 single-view installation commits');b.undo();assert(!S.comps[0].motorType,'N20 installation has one undo');
 }
 b.fitView();parent.actuatorResult(lines.join('\n')+`\n${lines.length}/${lines.length} passed`);
}catch(e){parent.actuatorResult(lines.join('\n')+'\nFAIL '+e.stack);}

}
