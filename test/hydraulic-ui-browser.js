import {S} from '../js/blocks/state.js';
import * as View from '../js/blocks/view.js';
import {hydraulicSnapshot} from './fixtures/hinged-syringe.mjs';
import {hydraulicSnapshot as h01Snapshot} from '../js/blocks/hydraulic-example.js';
import {decodeShareString,encodeSnapshot} from '../js/share-codec.js';
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
  const original=JSON.stringify(api.snapshot()),ib=text=>[...document.querySelectorAll('#syringeInstallation button')].find(n=>n.textContent===text).click();
  const select=(index,value)=>{const n=q('#syringeInstallation').querySelectorAll('select')[index];n.value=value;n.dispatchEvent(new Event('change',{bubbles:true}));};
  b.addFixedSyringe();assert(!!q('#syringeInstallation[open]'),'new fixed syringe opens four-step installation');
  select(0,'H1Frame');ib('下一步');ib('背面');ib('下一步');select(1,'H1Coupler');select(2,'0');ib('下一步');
  const trial=q('#syringeInstallation').querySelectorAll('input[type=range]')[1];trial.value=20;trial.dispatchEvent(new Event('input',{bubbles:true}));
  ib('檢查全行程');assert(q('#syringeInstallation').textContent.includes('41 點'),'new candidate full stroke passes');
  assert(JSON.stringify(api.snapshot())===original,'selection, face and trial do not edit the work');
  ib('取消');await new Promise(resolve=>setTimeout(resolve,0));assert(JSON.stringify(api.snapshot())===original,'cancel preserves original work');
  b.addFixedSyringe();select(0,'H1Frame');ib('下一步');ib('下一步');select(1,'H1Coupler');select(2,'0');ib('下一步');ib('確認安裝');await new Promise(resolve=>setTimeout(resolve,0));
  const placed=S.comps.find(c=>c.type==='syringe');assert(placed?.b.componentId==='H1Coupler'&&placed.installation.face==='front','confirm inserts selected fixed installation');
  b.undo();assert(!S.comps.some(c=>c.type==='syringe'),'one undo removes the entire installation');
  b.addFixedSyringe();select(0,'H1Frame');ib('下一步');ib('背面');ib('下一步');select(1,'H1Coupler');select(2,'0');ib('下一步');ib('確認安裝');await new Promise(resolve=>setTimeout(resolve,0));
  api.reopen(decodeShareString(encodeSnapshot(api.snapshot())));assert(S.comps.find(c=>c.type==='syringe').installation.face==='back','face survives save/share/reopen');
  click('#syringeControls button');ib('下一步');ib('下一步');ib('下一步');ib('其他尺寸與加工設定');await new Promise(resolve=>setTimeout(resolve,0));assert(!!q('#syringeDialog'),'existing advanced dimensions and fabrication remain available');close();
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
