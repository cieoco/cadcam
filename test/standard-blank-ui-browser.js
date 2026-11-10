import {S} from '../js/blocks/state.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {encodeSnapshot,decodeShareString} from '../js/share-codec.js';
const b=window.blocks,api=b.gripperPilot,lines=[];
const assert=(yes,name)=>{if(!yes)throw Error(name);lines.push('PASS '+name);};
const svg=document.getElementById('stageSvg'),panel=()=>document.getElementById('standardBlankPanel');
const empty={kind:'blocks',v:1,counter:0,comps:[],params:{theta:0}};
const field=(name,value)=>{const n=panel().querySelector(`[aria-label="${name}"]`);n.value=String(value);n.dispatchEvent(new Event('input',{bubbles:true}));};
const button=name=>[...panel().querySelectorAll('button')].find(n=>n.textContent===name).click();
const point=n=>{const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};};
const pointerType=innerWidth<700?'touch':'mouse';
const send=(target,type,p,id=51)=>target.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:id,isPrimary:true,pointerType,button:0,clientX:p.x,clientY:p.y}));
const body=()=>svg.querySelector('[data-blank-preview]');
try{
 for(const kind of ['bar','plate','l']){
  api.reopen(structuredClone(empty));await b.openStandardBlank(kind);
  assert(S.comps.length===0&&S.standardBlankDraft,'opening only previews '+kind);
  assert(!panel().textContent.includes('確認新增'),'no second confirmation '+kind);
  field(kind==='l'?'橫臂孔數':'長向孔數',11);
  if(kind!=='bar')field(kind==='l'?'直臂孔數':'寬向孔數',7);
  assert(S.comps.length===0,'numeric entry remains preview '+kind);
  button('放到畫布');assert(S.comps.length===0,'place button waits for canvas '+kind);
  const count=S.undoStack.length,p=point(body()),end={x:p.x+30,y:p.y+15};
  send(body(),'pointerdown',p);send(svg,'pointermove',end);
  assert(S.comps.length===0,'body drag remains preview until release '+kind);
  send(svg,'pointerup',end);
  assert(S.comps.length===1&&!S.standardBlankDraft&&panel().hidden,'body release creates once '+kind);
  const c=S.comps[0];assert(S.topo.params[c.lenParam||c.gParam]===80,'numeric size retained '+kind);
  assert((kind==='bar'?S.selectedLinkId:S.selectedTriangleId)===c.id,'new part stays selected '+kind);
  assert(S.undoStack.length===count+1,'one creation undo '+kind);
  const reopened=normalizeSnapshot(decodeShareString(encodeSnapshot(api.snapshot())));
  assert(reopened.comps[0].standardBlank.kind===kind&&reopened.params[c.lenParam||c.gParam]===80,'share reopen retains shape and dimensions '+kind);
  b.undo();assert(S.comps.length===0,'undo removes created part '+kind);
  await b.openStandardBlank(kind);const h=svg.querySelector('[data-dimension-handle="blank-create-length"]'),hp=point(h.querySelector('circle')),he={x:hp.x+45,y:hp.y};
  send(h,'pointerdown',hp);send(svg,'pointermove',he);send(svg,'pointercancel',he);
  assert(S.comps.length===0&&S.standardBlankDraft,'cancel dimension drag does not add '+kind);
  const h2=svg.querySelector('[data-dimension-handle="blank-create-length"]'),hp2=point(h2.querySelector('circle'));
  send(h2,'pointerdown',hp2);send(svg,'pointermove',{x:hp2.x+45,y:hp2.y});send(svg,'pointerup',{x:hp2.x+45,y:hp2.y});
  assert(S.comps.length===1&&!S.standardBlankDraft,'dimension release creates '+kind);
  assert(S.topo.params[S.comps[0].lenParam||S.comps[0].gParam]%8===0,'drag keeps integer hole grid '+kind);
 }
 api.reopen(structuredClone(empty));await b.openStandardBlank('plate');
 field('長向孔數',0);let p=point(body());send(body(),'pointerdown',p);send(svg,'pointerup',p);
 assert(S.comps.length===0&&S.standardBlankDraft,'invalid field cannot place stale candidate');
 field('長向孔數',6);field('長向孔距 mm',40.25);field('位置 X mm','');
 assert(panel().querySelector('[data-blank-place]').disabled,'empty coordinate rejected');
 field('位置 X mm',12.25);field('位置 Y mm',-5.75);
 const before=JSON.stringify(api.snapshot()),origin={...S.standardBlankDraft.origin};p=point(body());send(body(),'pointerdown',p);send(svg,'pointermove',{x:p.x+30,y:p.y});send(svg,'pointercancel',{x:p.x+30,y:p.y});
 assert(JSON.stringify(api.snapshot())===before&&S.standardBlankDraft.origin.x===origin.x,'cancel body drag keeps work and position');
 p=point(body());send(body(),'pointerdown',p);send(svg,'pointerup',p);
 assert(S.comps.length===1&&S.comps[0].p1.x===12.25&&S.topo.params[S.comps[0].gParam]===40.25,'click preview places exact decimal size and position');
 b.undo();await b.openStandardBlank('l');button('取消');assert(S.comps.length===0&&!S.standardBlankDraft,'cancel whole preview creates nothing');
 await b.openStandardBlank('bar');const h=svg.querySelector('[data-dimension-handle="blank-create-length"]');p=point(h.querySelector('circle'));send(h,'pointerdown',p);send(svg,'pointerup',p);
 assert(S.comps.length===0&&S.standardBlankDraft,'click dimension only focuses field');button('取消');
 const key=(name,target=document.body,more={})=>target.dispatchEvent(new KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true,...more}));
 for(const kind of ['bar','plate','l']){
  api.reopen(structuredClone(empty));S.undoStack=[];await b.openStandardBlank(kind);
  key('Enter',document.body,{isComposing:true});key('Enter',document.body,{repeat:true});assert(!S.comps.length,'IME/repeat do not place '+kind);
  field('長向孔距 mm',40.25);key('Enter');assert(S.comps.length===1&&!S.standardBlankDraft&&S.topo.params[S.comps[0].lenParam||S.comps[0].gParam]===40.25,'Enter places exact '+kind);b.undo();assert(!S.comps.length,'Enter '+kind+' one undo');
 }
 await b.openStandardBlank('plate');field('長向孔數',0);key('Enter');assert(!S.comps.length&&S.standardBlankDraft,'Enter respects invalid blank validation');button('取消');
 parent.actuatorResult(lines.join('\n')+`\n${lines.length}/${lines.length} passed (${pointerType})`);
}catch(error){parent.actuatorResult(lines.join('\n')+'\nFAIL '+error.stack);}
