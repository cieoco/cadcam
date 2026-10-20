import {S} from '../js/blocks/state.js';
import * as View from '../js/blocks/view.js';
import {hydraulicSnapshot} from './fixtures/hinged-syringe.mjs';
import {hydraulicSnapshot as h01Snapshot} from '../js/blocks/hydraulic-example.js';
import {snapshot as resizeSnapshot} from './fixtures/syringe-end-resize.mjs';
import {scanSyringe} from '../js/blocks/syringe-operations.js';
import {decodeShareString,encodeSnapshot} from '../js/share-codec.js';
import {getExample} from '../js/blocks/examples.js';
const b=window.blocks,api=b.gripperPilot,lines=[],q=s=>document.querySelector(s.replace('#syringeDialog','#syringeDialog[open]')),click=s=>q(s).click();
const assert=(condition,name)=>{if(!condition)throw Error(name);lines.push('PASS '+name);};
const field=(name,value)=>{const n=q(`#syringeDialog [name="${name}"]`);n.value=value;n.dispatchEvent(new Event('input',{bubbles:true}));};
const button=text=>[...document.querySelectorAll('#syringeDialog[open] button')].find(n=>n.textContent===text).click();
const close=()=>button('取消');
const stroke=value=>{const n=q('#syringeControls input');n.value=value;n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));};
const initial=()=>api.reopen(structuredClone(hydraulicSnapshot));
const saved=[];const originalClick=HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click=function(){if(this.download){saved.push({name:this.download,url:this.href});return;}originalClick.call(this);};
try{
 // Follow the actual unit 8/9 install flow with new actuator IDs, not the completed examples.
 for(const [num,x,y,angle] of [[1,-100,-60,0],[2,59.2699,100.61565,153.57],[3,-26,253.36805,.62]]){
  api.reopen(structuredClone(getExample(`hydraulic-h0${num}-practice`).snapshot));
  assert(!S.comps.some(c=>c.type==='syringe'),`unit practice H0${num} starts unpowered`);
  b.addFixedSyringe();
  const install=()=>document.querySelector('#syringeInstallation[open]');
  const choose=(label,value)=>{const n=install().querySelector(`[aria-label="${label}"]`);n.value=value;n.dispatchEvent(new Event(n.tagName==='SELECT'?'change':'input',{bubbles:true}));};
  const press=text=>[...install().querySelectorAll('button')].find(b=>b.textContent===text).click();
  choose('筒身固定在哪個零件？',`H${num}Frame`);press('下一步');
  choose('筒身位置 X (mm)',x);choose('筒身位置 Y (mm)',y);choose('推進方向角度 (°)',angle);press('移到所選機架');press('下一步');
  choose('推桿接哪個短連桿？',num===3?'H3Upper':`H${num}Coupler`);choose('連接端孔','0');press('下一步');press('檢查全行程');
  assert(install().textContent.includes('41 點幾何採樣通過'),`H0${num} student placement full stroke`);press('確認安裝');
  assert(S.comps.filter(c=>c.type==='syringe').length===1,`H0${num} student installation committed`);
  api.reopen(decodeShareString(encodeSnapshot(api.snapshot())));
  assert(scanSyringe(S.comps,S.topo.params,S.comps.find(c=>c.type==='syringe').id).ok,`H0${num} student work reopens`);
  if(num===2){
   click('#syringeControls button');install().querySelector('details').open=true;press('其他尺寸與加工設定');
   button('孔位 145.892 mm');button('掃描候選全行程');
   assert(q('#syringeDialog [role=status]').textContent.includes('41'),'H02 new actuator retains lesson hole presets');
   button('確認套用');
   assert(S.topo.params.H2Arm===145.892&&Math.abs(S.topo.params.H2Arm+S.topo.params.H2Tail-250)<1e-6,'H02 hole comparison preserves 250 mm reach');
   b.undo();assert(S.topo.params.H2Arm!==145.892,'H02 hole comparison undo');
  }
 }
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
 click('#syringeControls button');field('bU','60');close();assert(S.comps[2].b.u===80,'cancel leaves model intact');
 click('#syringeControls button');field('bU','60');button('掃描候選全行程');assert(q('#syringeDialog [role=status]').textContent.includes('81'),'scan candidate only');button('確認套用');assert(S.comps[2].b.u===60,'confirm changes local attachment');
 b.undo();assert(S.comps[2].b.u===80,'attachment undo');
 click('#syringeControls button');field('bU','5');button('確認套用');assert(q('#syringeDialog')&&S.comps[2].b.u===80,'unreachable candidate rejected');close();
 click('#syringeControls button');field('stroke','100');field('outerDiameter','15.873');field('aU','10.123');field('clearance','0.73');button('確認套用');
 const before=api.snapshot();stroke(100);assert(S.comps[2].extension===before.comps[2].extension&&Number(q('#syringeControls input').value)===before.comps[2].extension,'invalid stroke retains actual extension and slider');
 assert(q('#syringeNotice').textContent.length>10,'invalid stroke explains failure');
 api.reopen(decodeShareString(encodeSnapshot(api.snapshot())));assert(S.comps[2].spec.outerDiameter===15.873&&S.comps[2].a.u===10.123&&S.fabrication.syringeMount.clearanceMm===0.73,'save/share/reopen preserves measurements and local attachments');
 click('#syringeControls button');button('刪除針筒');assert(!S.comps.some(c=>c.type==='syringe')&&q('#syringeControls').hidden,'delete removes actuator and controls');
 b.undo();assert(S.comps.some(c=>c.type==='syringe'),'delete undo restores actuator');
 initial();click('#syringeControls button');button('刪除針筒');b.addSyringe();
 const svg=q('#stageSvg'),ctm=svg.getScreenCTM(),point=(x,y)=>new DOMPoint(View.TX(x),View.TY(y)).matrixTransform(ctm);
 const tap=(x,y)=>{const p=point(x,y);svg.dispatchEvent(new PointerEvent('pointerdown',{clientX:p.x,clientY:p.y,bubbles:true,pointerType:'touch'}));};
 tap(0,-80);tap(80,0);assert(!!q('#syringeDialog'),'touch A/B picking opens candidate');button('確認套用');assert(S.comps.some(c=>c.type==='syringe'&&c.a.componentId==='HFrame'&&c.b.componentId==='HArm'),'new actuator retains real owners');
 // Four-step fixed installation: draft/cancel/confirm use the same work and undo.
 {
  const blank=structuredClone(h01Snapshot);blank.comps=blank.comps.filter(c=>c.type!=='syringe');api.reopen(blank);
  const original=JSON.stringify(api.snapshot()),ib=text=>[...document.querySelectorAll('#syringeInstallation[open] button')].find(n=>n.textContent===text).click();
  const select=(label,value)=>{const n=q('#syringeInstallation[open]').querySelector(`[aria-label="${label}"]`);n.value=value;n.dispatchEvent(new Event('change',{bubbles:true}));};
  const input=(label,value)=>{const n=q('#syringeInstallation[open]').querySelector(`[aria-label="${label}"]`);n.value=value;n.dispatchEvent(new Event('input',{bubbles:true}));};
  const put=()=>{
   const canvas=q('#syringeInstallation[open] svg'),seat=blank.comps.find(c=>c.id==='H1Frame').p1,p=new DOMPoint(seat.x,-seat.y).matrixTransform(canvas.getScreenCTM());
   canvas.dispatchEvent(new PointerEvent('pointerdown',{clientX:p.x,clientY:p.y,pointerId:17,pointerType:'touch',bubbles:true}));
   canvas.dispatchEvent(new PointerEvent('pointerup',{pointerId:17,bubbles:true}));
  };
  const connect=()=>{select('筒身固定在哪個零件？','H1Frame');ib('下一步');put();input('推進方向角度 (°)','0');ib('下一步');select('推桿接哪個短連桿？','H1Coupler');select('連接端孔','0');};
  b.addFixedSyringe();assert(!!q('#syringeInstallation[open]'),'new fixed syringe opens actuator placement');
  assert(!q('#syringeInstallation[open] [aria-label="筒身固定在哪個零件？"]').closest('section').hidden,'frame selection is the first step');
  assert([...q('#syringeInstallation[open]').querySelectorAll('button')].find(n=>n.textContent==='下一步').disabled,'cannot place actuator before selecting frame');
  connect();
  const draftSvg=q('#syringeInstallation[open] svg').innerHTML;
  assert(q('#syringeInstallation[open] [aria-label="試動伸出量 (mm)"]').disabled,'unmounted actuator cannot be trial driven');
  assert([...q('#syringeInstallation[open]').querySelectorAll('button')].find(n=>n.textContent==='檢查全行程').disabled,'unmounted actuator cannot pass a scan');
  input('試動伸出量 (mm)','20');assert(q('#syringeInstallation[open] svg').innerHTML===draftSvg,'unmounted trial cannot move the links');
  assert(q('#syringeInstallation[open]').textContent.includes('固定後才能試動'),'assembly confirmation precedes trial');
  assert(q('#syringeInstallation[open] svg [data-install-member="H1Coupler"]'),'coupler remains drawn');
  assert(JSON.stringify(api.snapshot())===original,'placement, direction and trial do not edit the work');
  ib('下一步');input('試動伸出量 (mm)','20');ib('檢查全行程');assert(q('#syringeInstallation[open]').textContent.includes('41 點'),'fixed connected actuator full stroke passes');ib('1 固定外殼');ib('背面');ib('取消');await new Promise(resolve=>setTimeout(resolve,0));assert(JSON.stringify(api.snapshot())===original,'cancel preserves original work');
  b.addFixedSyringe();connect();ib('下一步');ib('確認安裝');await new Promise(resolve=>setTimeout(resolve,0));
  const placed=S.comps.find(c=>c.type==='syringe');assert(placed?.b.componentId==='H1Coupler'&&placed.installation.face==='front'&&placed.axisDeg===0,'confirm preserves placement, angle and real owners');
  assert(!S.comps.some(c=>c.id.startsWith('SyringePlacementReference')),'temporary placement reference never saved');
  b.undo();assert(!S.comps.some(c=>c.type==='syringe'),'one undo removes the entire installation');
  b.addFixedSyringe();connect();ib('1 固定外殼');ib('背面');ib('3 連接輸出');ib('下一步');ib('確認安裝');await new Promise(resolve=>setTimeout(resolve,0));
  api.reopen(decodeShareString(encodeSnapshot(api.snapshot())));assert(S.comps.find(c=>c.type==='syringe').installation.face==='back','face survives save/share/reopen');
  click('#syringeControls button');ib('其他尺寸與加工設定');await new Promise(resolve=>setTimeout(resolve,0));assert(!!q('#syringeDialog'),'existing advanced dimensions and fabrication remain available');close();
 }
 initial();b.togglePlay();await new Promise(resolve=>setTimeout(resolve,400));b.togglePlay();assert(S.comps[2].extension>20,'time based play advances extension');
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
