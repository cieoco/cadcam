import {S} from '../js/blocks/state.js';
import * as View from '../js/blocks/view.js';
import {hydraulicSnapshot} from './fixtures/hinged-syringe.mjs';
import {hydraulicSnapshot as h01Snapshot} from '../js/blocks/hydraulic-example.js';
import {snapshot as resizeSnapshot} from './fixtures/syringe-end-resize.mjs';
import {scanSyringe} from '../js/blocks/syringe-operations.js';
import {decodeShareString,encodeSnapshot} from '../js/share-codec.js';
import {getExample} from '../js/blocks/examples.js';
import {builtinTemplate,instantiateTemplate} from '../js/blocks/module-ops.js';
const b=window.blocks,api=b.gripperPilot,lines=[],q=s=>document.querySelector(s.replace('#syringeDialog','#syringeDialog[open]')),click=s=>q(s).click();
const assert=(condition,name)=>{if(!condition)throw Error(name);lines.push('PASS '+name);};
const field=(name,value)=>{const n=q(`#syringeDialog [name="${name}"]`);n.value=value;n.dispatchEvent(new Event('input',{bubbles:true}));};
const button=text=>[...document.querySelectorAll('#syringeDialog[open] button')].find(n=>n.textContent===text).click();
const close=()=>button('取消');
const waitDialog=async()=>{for(let i=0;i<100&&!document.querySelector('#syringeInstallation[open],#syringeDialog[open]');i++)await new Promise(resolve=>setTimeout(resolve,20));};
const settings=async()=>{[...document.querySelectorAll('#syringeControls button')].find(n=>n.textContent==='針筒設定').click();await waitDialog();};
const addFixed=async()=>{b.addFixedSyringe();await waitDialog();};
const stroke=value=>{const n=q('#syringeControls input');n.value=value;n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));};
const initial=()=>api.reopen(structuredClone(hydraulicSnapshot));
const saved=[];const originalClick=HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click=function(){if(this.download){saved.push({name:this.download,url:this.href});return;}originalClick.call(this);};
try{
 // Follow the actual unit 8/9 install flow with new actuator IDs, not the completed examples.
 for(const [num,x,y,angle] of [[1,-100,-60,0],[2,59.27,100.62,153.57],[3,-26,253.37,.62]]){
  api.reopen(structuredClone(getExample(`hydraulic-h0${num}-practice`).snapshot));
  assert(!S.comps.some(c=>c.type==='syringe'),`unit practice H0${num} starts unpowered`);
  await addFixed();
  const install=()=>document.querySelector('#syringeInstallation[open]');
  const choose=(label,value)=>{const n=install().querySelector(`[aria-label="${label}"]`);if(n.closest('details'))n.closest('details').open=true;n.focus();n.value=value;n.dispatchEvent(new Event(n.tagName==='SELECT'?'change':'input',{bubbles:true}));};
  const press=text=>[...install().querySelectorAll('button')].find(b=>b.textContent===text).click();
  choose('筒身固定在哪個零件？',`H${num}Frame`);
  choose('固定位置 X (mm)','-');
  assert(install().querySelector('[aria-label="固定位置 X (mm)"]').value==='-','partial minus survives editing');
  choose('固定位置 X (mm)',x);choose('固定位置 Y (mm)',y);choose('推進方向角度 (°)',angle);press('移到所選機架');
  choose('推桿接哪個零件？',num===3?'H3Upper':`H${num}Coupler`);choose('連接端孔','0');press('檢查全行程');
  assert(install().textContent.includes('41 點幾何採樣通過'),`H0${num} student placement full stroke`);press('確認安裝');
  assert(S.comps.filter(c=>c.type==='syringe').length===1,`H0${num} student installation committed`);
  api.reopen(decodeShareString(encodeSnapshot(api.snapshot())));
  assert(scanSyringe(S.comps,S.topo.params,S.comps.find(c=>c.type==='syringe').id).ok,`H0${num} student work reopens`);
  if(num===2){
   await settings();install().querySelector('details').open=true;press('其他尺寸與加工設定');
   const originalMin=S.comps.find(c=>c.type==='syringe').spec.lmin;
   button('孔位 145.89 mm');button('掃描候選全行程');
   assert(q('#syringeDialog [role=status]').textContent.includes('41'),'H02 new actuator retains lesson hole presets');
   button('確認套用');
   assert(S.comps.find(c=>c.type==='syringe').spec.lmin===originalMin,'rounded display preserves untouched syringe precision');
   assert(S.topo.params.H2Arm===145.892&&Math.abs(S.topo.params.H2Arm+S.topo.params.H2Tail-250)<1e-6,'H02 hole comparison preserves 250 mm reach');
   b.undo();assert(S.topo.params.H2Arm!==145.892,'H02 hole comparison undo');
  }
 }
 // Unit 10: ordinary student design must be selectable without loading a replacement gripper.
 const grip=structuredClone(getExample('hydraulic-h03').snapshot);
 const lift=instantiateTemplate(builtinTemplate('hydraulic-lift'),{counter:100,existingTokens:[],usedMotorIds:[],place:{x:500,y:0}});
 api.reopen({...grip,comps:[...grip.comps,...lift.comps],modules:[lift.module],params:{...grip.params,...lift.params},rootDesignName:'學生夾爪',assemblyMembers:['#root',lift.module.id]});
 await b.setMode('bench');
 const prepare=()=>[...document.querySelectorAll('#assemblyMembership button')].find(n=>n.textContent==='準備接合');
 assert(!!prepare(),'unit 10 root design exposes prepare connection');
 const beforePrepare=api.snapshot();prepare().click();
 const ready=api.snapshot(),gm=S.modules.find(m=>m.name==='學生夾爪');
 assert(!!gm&&S.comps.filter(c=>grip.comps.some(g=>g.id===c.id)).every(c=>c.moduleId===gm.id),'prepare retains whole student gripper');
 assert(!!q('#benchFaceWizard')&&q('#mateTree').textContent.includes('學生夾爪'),'prepared gripper is selected and connection preview available');
 b.undo();
 assert(JSON.stringify(api.snapshot())===JSON.stringify(beforePrepare)&&!!prepare(),'one undo restores original root and membership');
 api.reopen(decodeShareString(encodeSnapshot(ready)));await b.setMode('bench');
 assert(S.modules.some(m=>m.name==='學生夾爪')&&!prepare(),'prepared design survives save and reopen');
 await b.setMode('design');
 api.reopen(structuredClone(resizeSnapshot));b.selectLink('Link13');
 const resize=value=>{const n=q('#memberDimensionInput');n.value=value;n.dispatchEvent(new Event('change',{bubbles:true}));};
 resize('48');
 assert(S.topo.params.LL13===48&&S.comps.find(c=>c.type==='syringe').b.u===48,'L3 input preserves second-hole syringe joint');
 assert(scanSyringe(S.comps,S.topo.params,'Syringe1').ok,'resized user linkage completes full stroke');
 const resized=api.snapshot();stroke(20);assert(S.comps.find(c=>c.type==='syringe').extension===20,'resized linkage responds to syringe slider');
 b.undo();b.undo();assert(S.topo.params.LL13===40&&S.comps.find(c=>c.type==='syringe').b.u===40,'undo restores length and attachment together');
 api.reopen(decodeShareString(encodeSnapshot(resized)));
 assert(S.topo.params.LL13===48&&scanSyringe(S.comps,S.topo.params,'Syringe1').ok,'resized linkage save/share/reopen remains connected');
 b.selectLink('Link13');b.changeLen(8);
 assert(S.topo.params.LL13===56&&S.comps.find(c=>c.type==='syringe').b.u===56&&scanSyringe(S.comps,S.topo.params,'Syringe1').ok,'plus button preserves end joint');
 b.setLen(48);assert(S.comps.find(c=>c.type==='syringe').b.u===48&&scanSyringe(S.comps,S.topo.params,'Syringe1').ok,'legacy length action preserves end joint');
 initial();assert(!!q('[data-syringe="HSyringe"]'),'H01 visible in real app');
 const r0=q('#syringeReadout').textContent;stroke(40);assert(S.comps.find(c=>c.type==='syringe').extension===40&&q('#syringeReadout').textContent!==r0,'slider drives solved pose');
 b.undo();assert(S.comps.find(c=>c.type==='syringe').extension===20,'stroke undo restores accepted value');
 await settings();field('bU','60');close();assert(S.comps[2].b.u===80,'cancel leaves model intact');
 await settings();field('bU','60');button('掃描候選全行程');assert(q('#syringeDialog [role=status]').textContent.includes('81'),'scan candidate only');button('確認套用');assert(S.comps[2].b.u===60,'confirm changes local attachment');
 b.undo();assert(S.comps[2].b.u===80,'attachment undo');
 await settings();field('bU','5');button('確認套用');assert(q('#syringeDialog')&&S.comps[2].b.u===80,'unreachable candidate rejected');close();
 await settings();field('stroke','100');field('outerDiameter','15.873');field('aU','10.123');field('clearance','0.73');button('確認套用');
 const before=api.snapshot();stroke(100);assert(S.comps[2].extension===before.comps[2].extension&&Number(q('#syringeControls input').value)===before.comps[2].extension,'invalid stroke retains actual extension and slider');
 assert(q('#syringeNotice').textContent.length>10,'invalid stroke explains failure');
 api.reopen(decodeShareString(encodeSnapshot(api.snapshot())));assert(S.comps[2].spec.outerDiameter===15.873&&S.comps[2].a.u===10.123&&S.fabrication.syringeMount.clearanceMm===0.73,'save/share/reopen preserves measurements and local attachments');
 await settings();button('刪除針筒');assert(!S.comps.some(c=>c.type==='syringe')&&q('#syringeControls').hidden,'delete removes actuator and controls');
 b.undo();assert(S.comps.some(c=>c.type==='syringe'),'delete undo restores actuator');
 initial();await settings();button('刪除針筒');b.addSyringe();
 const svg=q('#stageSvg'),ctm=svg.getScreenCTM(),point=(x,y)=>new DOMPoint(View.TX(x),View.TY(y)).matrixTransform(ctm);
 const tap=(x,y)=>{const p=point(x,y);svg.dispatchEvent(new PointerEvent('pointerdown',{clientX:p.x,clientY:p.y,bubbles:true,pointerType:'touch'}));};
 tap(0,-80);tap(80,0);assert(!!q('#syringeDialog'),'touch A/B picking opens candidate');button('確認套用');assert(S.comps.some(c=>c.type==='syringe'&&c.a.componentId==='HFrame'&&c.b.componentId==='HArm'),'new actuator retains real owners');
 initial();const beforeRepick=JSON.stringify(api.snapshot()),originalSpec=structuredClone(S.comps[2].spec);
 await settings();button('在圖上換孔位');tap(0,-80);tap(60,0);
 assert(JSON.stringify(api.snapshot())===beforeRepick,'hinged repick is only a candidate');button('確認套用');
 assert(S.comps.filter(c=>c.type==='syringe').length===1&&S.comps[2].id==='HSyringe'&&Math.abs(S.comps[2].b.u-60)<0.1,'hinged repick keeps the existing actuator instead of duplicating it');
 assert(S.comps[2].spec.outerDiameter===originalSpec.outerDiameter&&!S.comps[2].spec.calibrated,'repick keeps measured body dimensions but clears calibration');
 b.undo();assert(JSON.stringify(api.snapshot())===beforeRepick,'hinged repick has one undo');
 // One installation form: draft/cancel/confirm use the same work and undo.
 {
  const blank=structuredClone(h01Snapshot);blank.comps=blank.comps.filter(c=>c.type!=='syringe');api.reopen(blank);
  const original=JSON.stringify(api.snapshot()),ib=text=>[...document.querySelectorAll('#syringeInstallation[open] button')].find(n=>n.textContent===text).click();
  const select=(label,value)=>{const n=q('#syringeInstallation[open]').querySelector(`[aria-label="${label}"]`);n.value=value;n.dispatchEvent(new Event('change',{bubbles:true}));};
  const input=(label,value)=>{const n=q('#syringeInstallation[open]').querySelector(`[aria-label="${label}"]`);n.value=value;n.dispatchEvent(new Event('input',{bubbles:true}));};
  const put=()=>{
   const canvas=q('#syringeInstallation[open] svg'),seat=blank.comps.find(c=>c.id==='H1Frame').p1,p=new DOMPoint(seat.x,-seat.y).matrixTransform(canvas.getScreenCTM());
   canvas.querySelector('[data-install-member="H1Frame"]').dispatchEvent(new PointerEvent('pointerdown',{clientX:p.x,clientY:p.y,pointerId:17,pointerType:'touch',bubbles:true}));
   canvas.dispatchEvent(new PointerEvent('pointerup',{pointerId:17,bubbles:true}));
  };
  const connect=()=>{select('筒身固定在哪個零件？','H1Frame');put();input('推進方向角度 (°)','0');select('推桿接哪個零件？','H1Coupler');select('連接端孔','0');};
  await addFixed();
  const quickSvg=q('#syringeInstallation[open] svg'),seat=blank.comps.find(c=>c.id==='H1Frame').p1;
  const screen=new DOMPoint(seat.x,-seat.y).matrixTransform(quickSvg.getScreenCTM());
  quickSvg.querySelector('[data-install-member="H1Frame"]').dispatchEvent(new PointerEvent('pointerdown',{clientX:screen.x,clientY:screen.y,bubbles:true}));
  const coupler=blank.comps.find(c=>c.id==='H1Coupler');
  quickSvg.querySelector(`[data-quick-output="${coupler.p1.id}"]`).dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
  assert(![...q('#syringeInstallation[open]').querySelectorAll('button')].find(n=>n.textContent==='確認安裝').disabled,'two graphical picks produce a valid fixed syringe candidate');
  assert(JSON.stringify(api.snapshot())===original,'quick syringe preview leaves source intact');ib('確認安裝');
  assert(Math.abs(S.comps.find(c=>c.type==='syringe')?.axisDeg)<1e-6,'quick direction follows the picked hole');b.undo();
  assert(JSON.stringify(api.snapshot())===original,'quick syringe installation has one undo');
  await addFixed();assert(!!q('#syringeInstallation[open]'),'new fixed syringe opens actuator placement');
  assert(!q('#syringeInstallation[open] [aria-label="筒身固定在哪個零件？"]').closest('section').hidden,'frame selection is available in the same form');
  assert([...q('#syringeInstallation[open]').querySelectorAll('button')].find(n=>n.textContent==='確認安裝').disabled,'cannot place actuator before selecting frame');
  select('筒身固定在哪個零件？','H1Frame');put();input('推進方向角度 (°)','0');
  const draftSvg=q('#syringeInstallation[open] svg').innerHTML;
  assert(q('#syringeInstallation[open] [aria-label="試動伸出量 (mm)"]').disabled,'unmounted actuator cannot be trial driven');
  assert([...q('#syringeInstallation[open]').querySelectorAll('button')].find(n=>n.textContent==='檢查全行程').disabled,'unmounted actuator cannot pass a scan');
  input('試動伸出量 (mm)','20');assert(q('#syringeInstallation[open] svg').innerHTML===draftSvg,'unmounted trial cannot move the links');
  assert(!q('#syringeInstallation[open] nav')&&!q('#syringeInstallation[open]').textContent.includes('調整安裝'),'one form replaces wizard and duplicate adjustment entrances');
  assert(q('#syringeInstallation[open] svg [data-install-member="H1Coupler"]'),'coupler remains drawn');
  assert(JSON.stringify(api.snapshot())===original,'placement, direction and trial do not edit the work');
  select('推桿接哪個零件？','H1Coupler');select('連接端孔','0');input('試動伸出量 (mm)','20');ib('檢查全行程');assert(q('#syringeInstallation[open]').textContent.includes('41 點'),'fixed connected actuator full stroke passes');ib('背面');ib('取消');await new Promise(resolve=>setTimeout(resolve,0));assert(JSON.stringify(api.snapshot())===original,'cancel preserves original work');
  await addFixed();connect();ib('確認安裝');await new Promise(resolve=>setTimeout(resolve,0));
  const placed=S.comps.find(c=>c.type==='syringe');assert(placed?.b.componentId==='H1Coupler'&&placed.installation.face==='front'&&placed.axisDeg===0,'confirm preserves placement, angle and real owners');
  assert(!S.comps.some(c=>c.id.startsWith('SyringePlacementReference')),'temporary placement reference never saved');
  b.undo();assert(!S.comps.some(c=>c.type==='syringe'),'one undo removes the entire installation');
  await addFixed();connect();ib('背面');ib('確認安裝');await new Promise(resolve=>setTimeout(resolve,0));
  api.reopen(decodeShareString(encodeSnapshot(api.snapshot())));assert(S.comps.find(c=>c.type==='syringe').installation.face==='back','face survives save/share/reopen');
  await settings();ib('其他尺寸與加工設定');await new Promise(resolve=>setTimeout(resolve,0));assert(!!q('#syringeDialog'),'existing advanced dimensions and fabrication remain available');close();
 }
 // Existing fixed and pivot disk installations are directly editable without changing workflows.
 for(const name of ['hydraulic-h07','hydraulic-h08']){
  api.reopen(structuredClone(getExample(name).snapshot));const before=JSON.stringify(api.snapshot());
  const old=structuredClone(S.comps.find(c=>c.type==='syringe'));
  await settings();const d=q('#syringeInstallation[open]'),handle=d.querySelector('[data-install-position]');
  assert(!!handle&&!d.querySelector('nav'),`${name} opens directly on the placement handle`);
  assert(!!d.querySelector('[data-install-angle]')===(name==='hydraulic-h07'),`${name} only fixed installation exposes direction`);
  const x=Number(d.querySelector('[aria-label="固定位置 X (mm)"]').value);
  handle.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  assert(Math.abs(Number(d.querySelector('[aria-label="固定位置 X (mm)"]').value)-x-1)<.011,`${name} handle nudges disk mount 1 mm`);
  if(name==='hydraulic-h08'){
   // The original pivot shares an existing plate hole. A 1 mm offset would overlap it.
   [...d.querySelectorAll('button')].find(n=>n.textContent==='確認安裝').click();
   assert(JSON.stringify(api.snapshot())===before&&d.querySelector('.install-error').textContent.includes('孔重疊'),'overlapping pivot hole is refused without writing work');
   for(let i=0;i<7;i++)d.querySelector('[data-install-position]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  }
  const moved=d.querySelector('[aria-label="固定位置 X (mm)"]').value;
  d.querySelector('svg').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:0,clientY:0}));
  assert(d.querySelector('[aria-label="固定位置 X (mm)"]').value===moved,`${name} blank preview does not move the clamp`);
  const offset=d.querySelector('[aria-label="固定環在筒身上的位置"]');offset.value='45';offset.dispatchEvent(new Event('input',{bubbles:true}));
  assert(JSON.stringify(api.snapshot())===before,`${name} movement and clamp slide remain a candidate`);
  const commit=[...d.querySelectorAll('button')].find(n=>n.textContent==='確認安裝');assert(!commit.disabled,`${name} edited mount can be confirmed`);commit.click();
  const changed=S.comps.find(c=>c.id===old.id);
  assert(changed.installation.barrelOffsetMm===45&&JSON.stringify(changed.b)===JSON.stringify(old.b),`${name} clamp slide preserves output attachment`);
  const accepted=api.snapshot();b.undo();assert(JSON.stringify(api.snapshot())===before,`${name} one undo restores mount and barrel position`);
  api.reopen(decodeShareString(encodeSnapshot(accepted)));assert(S.comps.find(c=>c.id===old.id).installation.barrelOffsetMm===45,`${name} edited installation survives sharing`);
  await settings();[...q('#syringeInstallation[open]').querySelectorAll('button')].find(n=>n.textContent==='取消').click();
 }
 initial();await new Promise(resolve=>setTimeout(resolve,0));b.togglePlay();for(let i=0;i<20&&S.comps[2].extension===20;i++)await new Promise(resolve=>setTimeout(resolve,100));b.togglePlay();assert(S.comps[2].extension!==20,'time based play advances extension');
 const held=S.comps[2].extension;await new Promise(resolve=>setTimeout(resolve,150));assert(S.comps[2].extension===held,'pause stops hydraulic frame loop');
 initial();
 for(const action of [b.exportLinksSvg,b.exportLinksDxf]){
  await action();const dialog=q('dialog[aria-label="匯出範圍與零件清單"]');
  const download=[...dialog.querySelectorAll('button')].find(n=>n.textContent==='確認下載');
  assert(!download.disabled,'export scope lists downloadable hydraulic parts');download.click();
  [...dialog.querySelectorAll('button')].find(n=>n.textContent==='完成').click();
 }
 await b.downloadBuildPack();assert(saved.filter(f=>f.name.endsWith('.svg')).length===4&&saved.filter(f=>f.name.endsWith('.dxf')).length===4&&saved.some(f=>f.name.endsWith('.html')),'existing export actions produce hydraulic files and pack: '+saved.map(f=>f.name).join(', '));
 const pack=await (await fetch(saved.find(f=>f.name.endsWith('.html')).url)).text();assert(pack.includes('未依實物校正')&&pack.includes('78.')===false&&pack.includes('80.000'),'downloaded pack has calibration warning and actual B hole');
 api.reopen({kind:'blocks',v:1,comps:[],params:{},counter:0});assert(q('#syringeControls').hidden,'opening empty work hides stale controls');
 initial();b.fitView();
 parent.hydraulicResult(lines.join('\n')+`\n${lines.length}/${lines.length} passed`);
}catch(e){parent.hydraulicResult(lines.join('\n')+'\nFAIL '+e.stack);}finally{HTMLAnchorElement.prototype.click=originalClick;}
