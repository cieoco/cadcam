// 針筒安裝三步驟：純邏輯（步驟、缺項、孔名、建議方式、試推）與假 DOM 驅動的同一張表單。
import assert from 'node:assert/strict';
import {installProgress,holeNames,holeName,partLabels,suggestMountMode,strokeCheck,installSummary,confirmLine,INSTALL_STEPS} from '../js/blocks/syringe-install-steps.js';

// ---------- 純邏輯 ----------
assert.deepEqual(INSTALL_STEPS,['① 針筒固定在哪裡？','② 推桿要推哪個孔？','③ 調整位置，試推看看']);
{
 let p=installProgress({});assert.equal(p.step,1);assert.deepEqual(p.missing,['① 選針筒固定的零件','② 選推桿的孔']);assert.equal(p.ready,false);
 p=installProgress({frameId:'Plate',frameFixed:false});assert.equal(p.step,1);assert.deepEqual(p.missing,['① 把所選零件設為不動的底座','② 選推桿的孔']);
 p=installProgress({frameId:'Plate',frameFixed:true});assert.equal(p.step,2);assert.deepEqual(p.missing,['② 選推桿的孔']);
 assert.equal(confirmLine(p),'還差：② 選推桿的孔');
 p=installProgress({frameId:'Plate',frameFixed:true,output:true,planOk:false});assert.equal(p.step,3);assert.deepEqual(p.missing,[]);assert.equal(p.ready,false);
 assert.equal(confirmLine({...p,message:'固定式仍須短連桿。'}),'還不能安裝：固定式仍須短連桿。');
 p=installProgress({frameId:'Plate',frameFixed:true,output:true,onFrame:false,planOk:true});assert.deepEqual(p.missing,['③ 把固定環移回所選零件上']);assert.equal(p.ready,false);
 p=installProgress({frameId:'Plate',frameFixed:true,output:true,planOk:true});assert.equal(p.ready,true);
 assert.equal(confirmLine({...p,summary:'X。'}),'將建立：X。');
 // 回頭修改只能回到已答過的步驟，不能跳到還沒解鎖的步驟。
 assert.equal(installProgress({frameId:'Plate',frameFixed:true,output:true,requested:1}).step,1);
 assert.equal(installProgress({frameId:'Plate',frameFixed:true,output:true,requested:2}).step,2);
 assert.equal(installProgress({frameId:'Plate',frameFixed:true,requested:3}).step,2);
 assert.equal(installSummary({frame:'矩形板材',hole:'孔格桿件・第 3 孔',mode:'fixed-axis',face:'front'}),'針筒固定在「矩形板材」，推桿接「孔格桿件・第 3 孔」，針筒固定不動（兩顆螺絲），裝在板子前面。');
 assert.match(installSummary({frame:'A',hole:'B',mode:'pivot',face:'back'}),/只鎖一顆螺絲當轉軸.*後面/);
}
{
 const bar=[{key:'p2',u:96,v:0},{key:'p1',u:0,v:0},...Array.from({length:11},(_,i)=>({key:`H${i}`,u:8*(i+1),v:0}))];
 const n=holeNames(bar);assert.equal(n.get('p1'),'第 1 孔');assert.equal(n.get('H1'),'第 3 孔');assert.equal(n.get('p2'),'第 13 孔');
 assert.equal(holeName('孔格桿件',bar,bar.find(h=>h.key==='H1')),'孔格桿件・第 3 孔');
 const plate=[];for(let r=0;r<3;r++)for(let c=0;c<16;c++)plate.push({key:`${r}_${c}`,u:8*c,v:8*r});
 const m=holeNames(plate);assert.equal(m.get('0_0'),'第 1 排第 1 孔');assert.equal(m.get('2_4'),'第 3 排第 5 孔');
 for(const t of [...n.values(),...m.values()])assert.doesNotMatch(t,/mm|\d+\.\d/,'plain hole names never show coordinates');
 const labels=partLabels([{id:'B1',type:'bar',name:'孔格桿件'},{id:'B2',type:'bar',name:'孔格桿件'},{id:'P',type:'triangle',name:'矩形板材'},{id:'L1',type:'bar'}]);
 assert.equal(labels.get('B1'),'孔格桿件（1）');assert.equal(labels.get('B2'),'孔格桿件（2）');assert.equal(labels.get('P'),'矩形板材');assert.equal(labels.get('L1'),'L1');
}
{
 assert.equal(suggestMountMode({'fixed-axis':true,pivot:false}).mode,'fixed-axis');
 const s=suggestMountMode({'fixed-axis':false,pivot:true});assert.equal(s.mode,'pivot');assert.match(s.text,/^建議：針筒可以擺動（只鎖一顆螺絲當轉軸），因為/);
 assert.equal(suggestMountMode({'fixed-axis':true,pivot:true}).mode,null);assert.equal(suggestMountMode({}),null);
 assert.equal(strokeCheck({ok:true},20),'✓ 可以從 0 推到 20 mm');
 assert.equal(strokeCheck({ok:false,atMm:12,message:'連桿無解。'},20),'✗ 推到 12 mm 會卡住：連桿無解。');
 assert.equal(strokeCheck({ok:false,message:'初始無解。'},20),'✗ 目前推不動：初始無解。');
}
console.log('syringe install steps: progress, missing items, plain hole names, part labels, mode suggestion and stroke check passed');

// ---------- 假 DOM：驅動實際安裝表單（不含畫布拖曳，瀏覽器另行驗收） ----------
class FakeEl{
 constructor(tag){this.tagName=String(tag).toUpperCase();this.childNodes=[];this.parentElement=null;this.attrs={};this.dataset={};this.style={};this.hidden=false;this.disabled=false;this.value='';this.checked=false;this._text='';this.listeners={};
  this.classList={set:new Set(),add:(...c)=>c.forEach(x=>this.classList.set.add(x)),toggle:(c,on)=>{if(on??!this.classList.set.has(c))this.classList.set.add(c);else this.classList.set.delete(c);},contains:c=>this.classList.set.has(c)};}
 get children(){return this.childNodes;}
 get textContent(){return this._text+this.childNodes.map(n=>n.textContent).join('');}
 set textContent(t){this._text=String(t??'');for(const n of this.childNodes)n.parentElement=null;this.childNodes=[];}
 set className(v){this.classList.set=new Set(String(v).split(/\s+/).filter(Boolean));}
 get className(){return [...this.classList.set].join(' ');}
 append(...ns){for(const n of ns){n.parentElement?.childNodes.splice(n.parentElement.childNodes.indexOf(n),1);n.parentElement=this;this.childNodes.push(n);}}
 prepend(...ns){for(const n of ns.reverse()){n.parentElement?.childNodes.splice(n.parentElement.childNodes.indexOf(n),1);n.parentElement=this;this.childNodes.unshift(n);}}
 insertBefore(n,ref){n.parentElement?.childNodes.splice(n.parentElement.childNodes.indexOf(n),1);const i=ref?this.childNodes.indexOf(ref):-1;n.parentElement=this;if(i<0)this.childNodes.push(n);else this.childNodes.splice(i,0,n);}
 before(...ns){const p=this.parentElement;for(const n of ns)p.insertBefore(n,this);}
 after(...ns){const p=this.parentElement;let ref=p.childNodes[p.childNodes.indexOf(this)+1];for(const n of ns)p.insertBefore(n,ref);}
 remove(){this.parentElement?.childNodes.splice(this.parentElement.childNodes.indexOf(this),1);this.parentElement=null;}
 replaceChildren(...ns){for(const n of this.childNodes)n.parentElement=null;this.childNodes=[];this._text='';this.append(...ns);}
 setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return k in this.attrs?this.attrs[k]:null;}hasAttribute(k){return k in this.attrs;}removeAttribute(k){delete this.attrs[k];}
 toggleAttribute(k,on){if(on??!(k in this.attrs))this.attrs[k]='';else delete this.attrs[k];}
 addEventListener(t,f){(this.listeners[t]??=[]).push(f);}removeEventListener(){}
 closest(tag){let n=this;while(n&&n.tagName!==tag.toUpperCase())n=n.parentElement;return n;}
 querySelector(tag){return walk(this).find(n=>n!==this&&n.tagName===tag.toUpperCase())||null;}
 getBoundingClientRect(){return {left:0,top:0,right:600,bottom:400,width:600,height:400};}
 focus(){}select(){}
 show(){this.open=true;}showModal(){this.open=true;}close(){if(!this.open&&this.closed)return;this.open=false;this.closed=true;this.onclose?.();}
}
const walk=n=>[n,...n.childNodes.flatMap(walk)];
const body=new FakeEl('body'),listeners={};
globalThis.document={body,createElement:t=>new FakeEl(t),createElementNS:(_,t)=>new FakeEl(t),getElementById:id=>walk(body).find(n=>n.id===id)||null,addEventListener(){},removeEventListener(){},activeElement:null};
globalThis.window={addEventListener(){},removeEventListener(){}};globalThis.innerWidth=1280;
globalThis.ResizeObserver=class{observe(){}disconnect(){}};

const {openSyringeInstallation}=await import('../js/blocks/syringe-install-ui.js');
const {planPlacedSyringe,installationChoices}=await import('../js/blocks/syringe-installation.js');
const {planMemberFrame}=await import('../js/blocks/member-frame.js');
const {makeStandardBlank}=await import('../js/blocks/standard-blank.js');
const {normalizeSnapshot}=await import('../js/blocks/schema.js');
const {getExample}=await import('../js/blocks/examples.js');
const {attachmentFrame,attachmentPoint,syringeAttachmentHoles}=await import('../js/core/syringe.js');
const all=d=>walk(d);
const by=(d,pred)=>all(d).find(pred);
const aria=(d,label)=>by(d,n=>n.attrs['aria-label']===label);
const panel=(d,k)=>by(d,n=>n.dataset.installPanel===String(k));
const shown=d=>[1,2,3].filter(k=>!panel(d,k).hidden);
const missing=d=>by(d,n=>'installMissing' in n.dataset).textContent;
const confirmButton=d=>by(d,n=>n.tagName==='BUTTON'&&n.textContent==='確認安裝');
const choose=(d,label,value)=>{const n=aria(d,label);n.value=value;n.onchange();};
const wait=ms=>new Promise(r=>setTimeout(r,ms));

// 1) H01 練習：清單選底座與推桿孔，結果與直接規劃同一請求完全相同。
{
 const s=normalizeSnapshot(structuredClone(getExample('hydraulic-h01-practice').snapshot)),source={comps:s.comps,params:s.params,fabrication:s.fabrication};
 let accepted=null;
 const d=openSyringeInstallation({source,points:null,newId:'Syringe1',confirm:r=>{accepted=r;return true;},review:()=>true});
 assert.deepEqual(shown(d),[1],'opens at ① only');
 assert.equal(missing(d),'還差：① 選針筒固定的零件、② 選推桿的孔');assert.equal(confirmButton(d).disabled,true);
 assert.ok(aria(d,'針筒固定的零件')&&!aria(d,'針筒固定的零件').closest('section').hidden,'fallback frame list is in the visible step');
 const frameId='H1Frame',frame=s.comps.find(c=>c.id===frameId);
 choose(d,'針筒固定的零件',frameId);
 assert.deepEqual(shown(d),[2],'frame answered → ②');assert.equal(missing(d),'還差：② 選推桿的孔');
 const stepOne=by(d,n=>n.dataset.installStep==1);assert.match(stepOne.textContent,/^✓ ① /);assert.equal(stepOne.disabled,false);
 const rod=s.comps.find(c=>c.id==='H1Coupler');
 choose(d,'推桿接的零件',rod.id);
 const holeOptions=all(aria(d,'推桿接的孔')).filter(n=>n.tagName==='OPTION').map(n=>n.textContent);
 assert.ok(holeOptions.length>=2&&holeOptions.every(t=>/^第 \d+ (排第 \d+ )?孔$/.test(t)),`plain hole names: ${holeOptions}`);
 assert.deepEqual(shown(d),[3],'hole answered → ③');
 assert.equal(confirmButton(d).disabled,false);
 assert.match(missing(d),/^將建立：針筒固定在「H1Frame」，推桿接「H1Coupler・第 1 孔」，針筒固定不動（兩顆螺絲），裝在板子前面。$/);
 assert.match(by(d,n=>n.dataset.installStep==2).textContent,/^✓ ② H1Coupler・第 1 孔$/);
 // 同一請求直接交給規劃器，輸出的 comps／params 完全相同。
 const position={...attachmentFrame(frame,s.params,null).p},b={componentId:rod.id,u:0,v:0},tip=attachmentPoint(b,s.comps,s.params,null);
 const direct=planPlacedSyringe(structuredClone(source),{id:null,newId:'Syringe1',mountMode:'fixed-axis',pivotEar:undefined,b,face:'front',spacerMm:null,extension:10,position,axisDeg:Math.atan2(tip.y-position.y,tip.x-position.x)*180/Math.PI,frameId},null,{});
 assert.ok(direct.ok,direct.message);
 await wait(300);
 assert.equal(by(d,n=>'installCheck' in n.dataset).textContent,'✓ 可以從 0 推到 20 mm','live check reuses the full-stroke scan');
 confirmButton(d).onclick();
 assert.ok(accepted,'confirm passes the candidate');assert.deepEqual(accepted.comps,direct.comps);assert.deepEqual(accepted.params,direct.params);
 assert.ok(d.closed,'confirm closes the panel');
}

// 2) 使用者截圖：空白作品放 3×16 標準板與 13 孔桿，沒有固定零件。不叫學生取消，改在表單內設為底座。
{
 const plate=makeStandardBlank({kind:'plate',columns:16,rows:3,n:1}),bar=makeStandardBlank({kind:'bar',columns:13,n:2,origin:{x:0,y:40}});
 const source={comps:[plate.comp,bar.comp],params:{...plate.params,...bar.params},fabrication:{}},original=structuredClone(source);
 assert.equal(installationChoices(source.comps,source.params).frames.length,0);
 const calls=[];
 const setFrame=async id=>{calls.push(id);const plan=planMemberFrame({comps:source.comps,params:source.params,id});return plan.ok?{ok:true,source:{...source,comps:plan.comps},points:null}:plan;};
 const d=openSyringeInstallation({source,points:null,newId:'Syringe1',setFrame,confirm:()=>true,review:()=>true});
 const status=()=>by(d,n=>'installFrameStatus' in n.dataset).textContent,button=by(d,n=>'installSetFrame' in n.dataset);
 assert.doesNotMatch(d.textContent,/取消安裝|請取消/,'never tells the student to cancel');
 assert.match(status(),/還沒有不動的零件/);assert.equal(button.hidden,true);
 const option=all(aria(d,'針筒固定的零件')).find(n=>n.value===plate.comp.id);assert.match(option.textContent,/^矩形板材（會動，需設為底座）$/);
 choose(d,'針筒固定的零件',plate.comp.id);
 assert.deepEqual(shown(d),[1]);assert.match(status(),/^「矩形板材」現在還會動/);assert.equal(button.hidden,false);assert.equal(button.textContent,'把它設為不動的底座');
 assert.equal(missing(d),'還差：① 把所選零件設為不動的底座、② 選推桿的孔');assert.equal(confirmButton(d).disabled,true);
 await button.onclick();
 assert.deepEqual(calls,[plate.comp.id]);assert.deepEqual(source,original,'the panel never edits its source; set-as-frame goes through the work commit');
 assert.ok(!d.closed,'set-as-frame keeps the panel open');assert.deepEqual(shown(d),[2]);assert.match(by(d,n=>n.className==='install-hint').textContent,/已設為不動的底座，可按復原還原/);
 assert.equal(aria(d,'針筒固定的零件').value,plate.comp.id);
 const hits=all(d).filter(n=>n.attrs['data-quick-output']).map(n=>n.attrs['aria-label']);
 assert.ok(hits.includes('連接 孔格桿件・第 3 孔')&&hits.includes('連接 孔格桿件・第 13 孔'),'canvas holes are named in plain words');
 assert.ok(hits.every(t=>!/mm|\d+\.\d/.test(t)));
 choose(d,'推桿接的零件',bar.comp.id);
 assert.deepEqual(shown(d),[3]);assert.equal(confirmButton(d).disabled,true);assert.match(missing(d),/^還不能安裝：/,'a loose bar explains why instead of a silent disabled button');
 assert.match(by(d,n=>'installCheck' in n.dataset).textContent,/^✗ 目前推不動：/);
 d.close();
}
// 設為底座失敗時留在 ①，說明原因，不關閉表單。
{
 const plate=makeStandardBlank({kind:'plate',columns:16,rows:3,n:1}),source={comps:[plate.comp],params:plate.params,fabrication:{}};
 const d=openSyringeInstallation({source,points:null,newId:'Syringe1',setFrame:async()=>({ok:false,message:'這些孔仍由馬達驅動。'}),confirm:()=>true,review:()=>true});
 choose(d,'針筒固定的零件',plate.comp.id);await by(d,n=>'installSetFrame' in n.dataset).onclick();
 assert.deepEqual(shown(d),[1]);assert.match(by(d,n=>'installFrameStatus' in n.dataset).textContent,/這些孔仍由馬達驅動。/);assert.ok(!d.closed);d.close();
}
// 3) 推桿接轉盤孔：同一規劃器判斷固定不動推不動、可以擺動推得動 → 預選可以擺動並說明原因。
{
 const {pivotTurntableSnapshot}=await import('../js/blocks/disk-turntable-example.js');
 const s=normalizeSnapshot(structuredClone(pivotTurntableSnapshot)),old=s.comps.find(c=>c.type==='syringe');
 const source={comps:s.comps.filter(c=>c.id!==old.id),params:s.params,fabrication:s.fabrication};
 let accepted=null;const d=openSyringeInstallation({source,points:null,newId:'Syringe9',confirm:r=>{accepted=r;return true;},review:()=>true});
 choose(d,'針筒固定的零件',old.a.componentId);
 const at=attachmentPoint(old.a,s.comps,s.params,null),px=aria(d,'固定位置 X (mm)'),py=aria(d,'固定位置 Y (mm)');px.value=String(at.x);py.value=String(at.y);px.oninput();
 const output=s.comps.find(c=>c.id===old.b.componentId),hole=syringeAttachmentHoles(output,s.params).find(h=>Math.hypot(h.u-old.b.u,h.v-old.b.v)<1e-6);
 aria(d,'推桿接的孔').value=hole.key;choose(d,'推桿接的零件',output.id);
 const fixedRadio=by(d,n=>n.name==='syringeMountMode'&&n.value==='fixed-axis'),pivotRadio=by(d,n=>n.name==='syringeMountMode'&&n.value==='pivot');
 assert.equal(pivotRadio.checked,true,'suggested swinging mode is preselected');assert.equal(fixedRadio.checked,false);
 assert.match(by(d,n=>'installSuggestion' in n.dataset).textContent,/^建議：針筒可以擺動（只鎖一顆螺絲當轉軸），因為/);
 assert.equal(aria(d,'鎖哪一顆螺絲（左／右）').closest('label').hidden,false,'screw choice only for the swinging mode');
 assert.equal(confirmButton(d).disabled,false,missing(d));
 confirmButton(d).onclick();assert.equal(accepted.syringe.mountMode,'pivot');
 const again=planPlacedSyringe(structuredClone(source),{id:null,newId:'Syringe9',mountMode:'pivot',pivotEar:undefined,b:{componentId:output.id,u:hole.u,v:hole.v},face:'front',spacerMm:null,extension:10,position:{x:at.x,y:at.y},axisDeg:accepted.syringe.axisDeg??0,frameId:old.a.componentId},null,{});
 assert.deepEqual(accepted.comps,again.comps,'same choices, same installation');
}
// 3b) 獨立單元 3B：預設位置兩種都推不動；照課文輸入位置後，才預選可以擺動。
{
 const {loadUnitStarts}=await import('../js/blocks/examples.js');await loadUnitStarts();
 const s=normalizeSnapshot(structuredClone(getExample('syringe-pivot-start').snapshot)),source={comps:s.comps,params:s.params,fabrication:s.fabrication};
 const d=openSyringeInstallation({source,points:null,newId:'Syringe1',confirm:()=>true,review:()=>true});
 choose(d,'針筒固定的零件','H8Frame');aria(d,'推桿接的孔').value='p2';choose(d,'推桿接的零件','H8Turn');
 assert.equal(aria(d,'推桿接的孔').value,'p2');assert.match(by(d,n=>n.dataset.installStep==2).textContent,/H8Turn・第 2 孔$/);
 assert.equal(confirmButton(d).disabled,true);assert.match(by(d,n=>'installCheck' in n.dataset).textContent,/^✗ 目前推不動：/);
 const px=aria(d,'固定位置 X (mm)'),py=aria(d,'固定位置 Y (mm)');px.value='-139.9';py.value='15';px.oninput();
 assert.equal(by(d,n=>n.name==='syringeMountMode'&&n.value==='pivot').checked,true,'swinging mode preselected once it can push');
 assert.equal(confirmButton(d).disabled,false,missing(d));assert.match(missing(d),/^將建立：.*針筒可以擺動/);
 await wait(300);assert.equal(by(d,n=>'installCheck' in n.dataset).textContent,'✓ 可以從 0 推到 20 mm');
 by(d,n=>n.name==='syringeMountMode'&&n.value==='fixed-axis').checked=true;by(d,n=>n.name==='syringeMountMode'&&n.value==='fixed-axis').onchange();
 assert.equal(by(d,n=>n.name==='syringeMountMode'&&n.value==='fixed-axis').checked,true,'the student can still choose the other mode');assert.equal(confirmButton(d).disabled,true);
 assert.equal(aria(d,'鎖哪一顆螺絲（左／右）').closest('label').hidden,true);
 d.close();
}
// 4) 修改既有針筒：直接在 ③，①② 顯示已完成並可點回修改；學生已有的方式不被建議覆寫。
{
 const s=normalizeSnapshot(structuredClone(getExample('hydraulic-h01').snapshot)),old=s.comps.find(c=>c.type==='syringe');
 const d=openSyringeInstallation({source:{comps:s.comps,params:s.params,fabrication:s.fabrication},points:null,existing:structuredClone(old),confirm:()=>true,review:()=>true,remove:()=>true});
 assert.deepEqual(shown(d),[3],'editing opens at ③');
 const [one,two,three]=[1,2,3].map(k=>by(d,n=>n.dataset.installStep==k));
 assert.match(one.textContent,/^✓ ① /);assert.match(two.textContent,/^✓ ② .+・第 \d+ (排第 \d+ )?孔$/);assert.equal(three.attrs['aria-current'],'step');
 assert.equal(confirmButton(d).disabled,false,missing(d));
 two.onclick();assert.deepEqual(shown(d),[2],'completed step can be reopened');assert.equal(two.attrs['aria-current'],'step');
 one.onclick();assert.deepEqual(shown(d),[1]);
 choose(d,'針筒固定的零件',old.a.componentId);assert.deepEqual(shown(d),[3],'answering again returns to ③');
 assert.equal(by(d,n=>n.name==='syringeMountMode'&&n.value===old.mountMode).checked,true);
 d.close();
}
console.log('syringe install panel: one form with ①②③, plain hole names, in-panel set-as-frame, missing items, mode suggestion, editing at ③ and identical installation output passed');
