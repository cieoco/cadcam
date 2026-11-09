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
const editor=createSyringeEditor({svg,comps:()=>S.comps,params:()=>S.topo.params,points:()=>pointCoords(S.comps),motion:()=>({}),is3D:()=>false,showEditor(){},draw(){},pause(){},commit(comps,params){commits++;S.comps=comps;S.topo.params=params;},previewStroke(){},stroke(){}});
const syringe=S.comps.find(c=>c.type==='syringe');editor.open(syringe.id);editor.sync(true);
const by=pred=>walk(host).find(pred),button=t=>by(n=>n.tagName==='BUTTON'&&n.textContent===t),select=label=>by(n=>n.attrs['aria-label']===label);
assert.ok(button('雙孔固定')&&button('單孔可轉')&&!button('在圖上更換推桿孔').hidden);
const original=JSON.stringify(S.comps);
button('單孔可轉').onclick();editor.sync(true);
assert.equal(commits,0,'mode needing a different output is a draft, not an invalid write');
assert.equal(button('單孔可轉').getAttribute('aria-pressed'),'true','requested mode remains visible while reconnecting');
button('取消連接修改').onclick();assert.equal(JSON.stringify(S.comps),original);
editor.close();
const pivot=normalizeSnapshot(structuredClone(getExample('hydraulic-h08').snapshot));S.comps=pivot.comps;S.topo.params=pivot.params;S.fabrication=pivot.fabrication;
const actuator=S.comps.find(c=>c.type==='syringe'),arm=S.comps.find(c=>c.id===actuator.b.componentId);arm.holes=[{id:'extra',type:'floating',u:12,v:0,diameter:3.2}];
editor.open(actuator.id);editor.sync(true);
const output=select('推桿連接孔');output.value=JSON.stringify({componentId:arm.id,u:12,v:0});output.onchange();editor.sync(true);
assert.equal(commits,0,'output choice only previews');
const confirm=button('確認連接修改')||button('確認更新固定孔');
assert.ok(!confirm.parentElement.hidden,by(n=>n.className==='syringe-edit-status').textContent);
confirm.onclick();assert.equal(commits,1);assert.equal(S.comps.find(c=>c.id===actuator.id).b.u,12);
const roundtrip=normalizeSnapshot({comps:S.comps,params:S.topo.params});assert.equal(roundtrip.comps.find(c=>c.id===actuator.id).b.u,12);
console.log('syringe connection edits: visible actions, invalid mode draft, cancel, local-hole reconnect, one commit and save round-trip passed');
