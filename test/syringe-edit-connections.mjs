import assert from 'node:assert/strict';
import {syringeAttachmentHoles} from '../js/core/syringe.js';
import {S} from '../js/blocks/state.js';
import {getExample} from '../js/blocks/examples.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {pointCoords} from '../js/blocks/model.js';
import {createSyringeEditor} from '../js/blocks/syringe-editor.js';
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
 querySelectorAll(){return [];}
 appendChild(n){this.append(n);return n;}
 getScreenCTM(){return {a:1,b:0,d:1,inverse(){return this;}};}
 querySelector(tag){return walk(this).find(n=>n!==this&&n.tagName===tag.toUpperCase())||null;}
 getBoundingClientRect(){return {left:0,top:0,right:600,bottom:400,width:600,height:400};}
 focus(){}select(){}
 show(){this.open=true;}showModal(){this.open=true;}close(){if(!this.open&&this.closed)return;this.open=false;this.closed=true;this.onclose?.();}
}
const walk=n=>[n,...n.childNodes.flatMap(walk)];

const body=new FakeEl('body');
globalThis.document={body,createElement:t=>new FakeEl(t),createElementNS:(_,t)=>new FakeEl(t),addEventListener(){},removeEventListener(){},activeElement:null};
globalThis.matchMedia=()=>({matches:false});globalThis.requestAnimationFrame=()=>{};
const host=new FakeEl('div'),svg=new FakeEl('svg');body.append(host);host.append(svg);
const snap=normalizeSnapshot(structuredClone(getExample('hydraulic-h01').snapshot));
S.comps=snap.comps;S.topo.params=snap.params;S.fabrication=snap.fabrication;S.modules=[];S.mode='design';S.designFocus=null;
for(const key of ['selectedLinkId','selectedNodeId','selectedTriangleId','selectedSliderId','selectedGearId'])S[key]=null;
let commits=0;
const editor=createSyringeEditor({svg,comps:()=>S.comps,params:()=>S.topo.params,points:()=>pointCoords(S.comps),motion:()=>({}),is3D:()=>false,showEditor(){},draw(){},pause(){},pushUndo(){commits++;},rebuild(){},seed(){},save(){},notify(){},previewStroke(){},stroke(){}});
const syringe=S.comps.find(c=>c.type==='syringe');editor.open(syringe.id);editor.sync(true);
const by=pred=>walk(host).find(pred),button=t=>by(n=>n.tagName==='BUTTON'&&n.textContent===t),select=label=>by(n=>n.attrs['aria-label']===label);
assert.ok(button('雙孔固定')&&button('單孔可轉')&&!button('在圖上更換推桿孔').hidden);
const original=JSON.stringify(S.comps);
button('單孔可轉').onclick();editor.sync(true);
assert.equal(commits,0,'mode needing a different output is a draft, not an invalid write');
assert.equal(button('單孔可轉').getAttribute('aria-pressed'),'true','requested mode remains visible while reconnecting');
button('取消修改').onclick();assert.equal(JSON.stringify(S.comps),original);
editor.close();
const pivot=normalizeSnapshot(structuredClone(getExample('hydraulic-h08').snapshot));S.comps=pivot.comps;S.topo.params=pivot.params;S.fabrication=pivot.fabrication;
const actuator=S.comps.find(c=>c.type==='syringe'),arm=S.comps.find(c=>c.id===actuator.b.componentId);arm.holes=[{id:'extra',type:'floating',u:12,v:0,diameter:3.2}];
editor.open(actuator.id);editor.sync(true);
const output=select('推桿連接孔');output.value=JSON.stringify({componentId:arm.id,u:12,v:0});output.onchange();editor.sync(true);
assert.equal(commits,0,'output choice only previews');
const confirm=button('確認套用');
assert.ok(!confirm.parentElement.hidden,by(n=>n.className==='syringe-edit-status').textContent);
confirm.onclick();assert.equal(commits,1);assert.equal(S.comps.find(c=>c.id===actuator.id).b.u,12);
const roundtrip=normalizeSnapshot({comps:S.comps,params:S.topo.params});assert.equal(roundtrip.comps.find(c=>c.id===actuator.id).b.u,12);
console.log('syringe connection edits: visible actions, invalid mode draft, cancel, local-hole reconnect, one commit and save round-trip passed');

// New same-named members must appear distinctly; a gray hole reports why,
// instead of silently selecting a nearby orange hole.
const originalArm=S.comps.find(c=>c.id===arm.id);originalArm.name='孔格桿件';
const added={type:'bar',id:'NewRod',name:'孔格桿件',p1:{id:'NewA',type:'floating',x:300,y:0},p2:{id:'NewB',type:'floating',x:340,y:0},lenParam:'NewLength',fixedLen:true};
S.comps.push(added);S.topo.params.NewLength=40;editor.sync(true);
assert.ok(output.children.some(n=>n.textContent.includes('第2件')&&n.value.includes('NewRod')));
assert.ok(output.children.some(n=>n.textContent.includes('第1件')));
button('在圖上更換推桿孔').onclick();editor.sync(true);
const dot=walk(svg).find(n=>n.attrs['data-syringe-pick']==='NewB');assert.ok(dot);
globalThis.DOMPoint=class{constructor(x,y){this.x=x;this.y=y;}matrixTransform(){return this;}};
const before=JSON.stringify(S.comps);
svg.listeners.pointerdown[0]({clientX:Number(dot.attrs.cx),clientY:Number(dot.attrs.cy),preventDefault(){},stopImmediatePropagation(){}});
assert.match(by(n=>n.className==='syringe-edit-status').textContent,/第2件.*固定軸/);
assert.equal(JSON.stringify(S.comps),before);assert.equal(commits,1);
console.log('new duplicate-name rod appears; invalid canvas target reports mounting reason without mutating design');
editor.close();
const linked=normalizeSnapshot(structuredClone(getExample('hydraulic-h08').snapshot));
S.comps=linked.comps;S.topo.params=linked.params;S.fabrication=linked.fabrication;
const turn=S.comps.find(c=>c.id==='H8Turn');turn.name='孔格桿件';
S.comps.push({type:'bar',id:'Intermediate',name:'孔格桿件',p1:{...turn.p2},p2:{id:'Tip',type:'floating',x:32,y:16},lenParam:'Intermediate',fixedLen:true});S.topo.params.Intermediate=32;
editor.open('H8Syringe');editor.sync(true);
const initialLinked=JSON.stringify(S.comps);
button('在圖上更換推桿孔').onclick();editor.sync(true);
const tip=walk(svg).find(n=>n.attrs['data-syringe-pick']==='Tip');
svg.listeners.pointerdown[0]({clientX:Number(tip.attrs.cx),clientY:Number(tip.attrs.cy),preventDefault(){},stopImmediatePropagation(){}});
assert.match(by(n=>n.className==='syringe-edit-status').textContent,/第2件.*雙孔固定/);
assert.equal(JSON.stringify(S.comps),initialLinked);
button('取消修改').onclick();editor.sync(true);
assert.equal(JSON.stringify(S.comps),initialLinked);
output.value=JSON.stringify({componentId:'Intermediate',u:32,v:0});output.onchange();editor.sync(true);
assert.match(by(n=>n.className==='syringe-edit-status').textContent,/第2件.*雙孔固定/);
button('雙孔固定').onclick();editor.sync(true);
const linkedConfirm=button('確認套用');
assert.ok(linkedConfirm&&!linkedConfirm.parentElement.hidden,by(n=>n.className==='syringe-edit-status').textContent);
linkedConfirm.onclick();
assert.equal(commits,2);assert.equal(S.comps.find(c=>c.id==='H8Syringe').b.componentId,'Intermediate');
assert.equal(S.comps.find(c=>c.id==='H8Syringe').mountMode,'fixed-axis');
const savedLinked=normalizeSnapshot({comps:S.comps,params:S.topo.params});
assert.equal(savedLinked.comps.find(c=>c.id==='H8Syringe').b.componentId,'Intermediate');
console.log('intermediate bar: canvas selection retains target across mounting mode switch and confirms once');
// Regression: a coincident inapplicable hole must not block the existing arm.
editor.close();
const same=normalizeSnapshot(structuredClone(getExample('hydraulic-h08').snapshot));
S.comps=same.comps;S.topo.params=same.params;S.fabrication=same.fabrication;
const sameArm=S.comps.find(c=>c.id==='H8Turn');sameArm.holes=[{id:'MoveHole',type:'floating',u:12,v:0,diameter:3.2}];
S.comps.push({type:'bar',id:'LooseOverlap',p1:{id:'LooseP',type:'floating',x:0,y:12},p2:{id:'LooseQ',type:'floating',x:40,y:12},lenParam:'LooseLength',fixedLen:true});S.topo.params.LooseLength=40;
editor.open('H8Syringe');editor.sync(true);button('在圖上更換推桿孔').onclick();editor.sync(true);
const move=walk(svg).filter(n=>n.attrs['data-syringe-pick']==='MoveHole').at(-1);
svg.listeners.pointerdown[0]({clientX:+move.attrs.cx,clientY:+move.attrs.cy,preventDefault(){},stopImmediatePropagation(){}});
assert.doesNotMatch(by(n=>n.className==='syringe-edit-status').textContent,/重疊孔/);
assert.equal(output.value,JSON.stringify({componentId:'H8Turn',u:12,v:0}));
(button('取消修改')||button('取消連接修改')).onclick();
// Drag on the original member snaps to an existing hole and uses the list's candidate.
S.comps=S.comps.filter(c=>c.id!=='LooseOverlap');editor.sync(true);
const initialDrag=JSON.stringify(S.comps),countBefore=commits;
const dragHandle=()=>walk(svg).filter(n=>n.dataset.dimensionHandle==='syringe-output').at(-1);
const {TX,TY}=await import('../js/blocks/view.js');
const event=(x,y)=>({pointerId:42,button:0,clientX:TX(x),clientY:TY(y),preventDefault(){},stopImmediatePropagation(){}});
const drag=()=>{dragHandle().listeners.pointerdown[0](event(0,16));svg.listeners.pointermove.forEach(f=>f(event(0,12)));};
drag();assert.equal(JSON.stringify(S.comps),initialDrag);assert.equal(JSON.parse(output.value).u,12);
svg.listeners.pointercancel.forEach(f=>f(event(0,12)));assert.equal(commits,countBefore);assert.equal(JSON.parse(output.value).u,16);
drag();svg.listeners.pointerup.forEach(f=>f(event(0,12)));
assert.equal(commits,countBefore);assert.equal(JSON.stringify(S.comps),initialDrag);
const dragConfirm=button('確認套用');assert.ok(!dragConfirm.parentElement.hidden,by(n=>n.className==='syringe-edit-status').textContent);dragConfirm.onclick();
assert.equal(commits,countBefore+1);assert.equal(S.comps.find(c=>c.id==='H8Syringe').b.u,12);
console.log('same-member overlap regression, snapped drag, cancel and one confirmed edit passed');
// An incomplete mode is editable draft state; no invalid work is committed.
editor.sync(true);const modeBefore=JSON.stringify(S.comps),selectedBefore=output.value,optionCount=output.children.length,commitBefore=commits;
button('雙孔固定').onclick();editor.sync(true);
assert.equal(button('雙孔固定').getAttribute('aria-pressed'),'true');
assert.equal(output.value,selectedBefore);assert.equal(output.children.length,optionCount);
assert.match(by(n=>n.className==='syringe-edit-status').textContent,/尚未套用/);
assert.equal(JSON.stringify(S.comps),modeBefore);assert.equal(commits,commitBefore);
button('雙孔固定').onclick();assert.equal(commits,commitBefore);
console.log('incompatible mounting switch preserves mode, selected hole, options and undo state');

button('取消修改').onclick();editor.sync(true);assert.equal(button('單孔可轉').getAttribute('aria-pressed'),'true');

const beforeDetach=JSON.stringify(S.comps),beforeCommits=commits;
button('解除推桿連接').onclick();assert.equal(JSON.stringify(S.comps),beforeDetach,'disconnect preview is isolated');
button('取消修改').onclick();assert.equal(JSON.stringify(S.comps),beforeDetach);
button('解除推桿連接').onclick();button('確認套用').onclick();editor.sync(true);
assert.equal(commits,beforeCommits+1);assert.equal(S.comps.find(c=>c.type==='syringe').b.componentId,'');
assert.ok(button('在圖上連接推桿孔'));assert.ok(button('解除推桿連接').hidden);
console.log('Disconnect preview, cancel and one confirmed write passed');
