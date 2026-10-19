import assert from 'node:assert/strict';
import { collectPickCandidates } from '../js/blocks/overlap-picker.js';
import * as Input from '../js/blocks/input.js';
import { S } from '../js/blocks/state.js';
const noop=()=>{};
class Element {
  constructor(attrs={},rect={left:90,top:90,width:20,height:20}) { this.attrs=attrs;this.rect=rect;this.style={};this.children=[];this.events={}; }
  getAttribute(k){return this.attrs[k]??null;} setAttribute(k,v){this.attrs[k]=v;}
  getBoundingClientRect(){return this.rect;}
  addEventListener(k,fn){this.events[k]=fn;} appendChild(c){this.children.push(c);return c;}
  showModal(){this.open=true;} close(){this.open=false;this.events.close?.();} remove(){this.removed=true;}
}
const body=new Element();
globalThis.document={body,createElement:()=>new Element(),getElementById:()=>null};
globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noop;
const motor=new Element({'data-id':'O','data-motor-hit':'O'});
const ring=new Element({'data-motor-hit':'O'},{left:76,top:76,width:48,height:48});
const gear=new Element({'data-pick-component':'G'}), jaw=new Element({'data-pick-component':'J'});
const hidden=new Element({'data-id':'hidden'},{left:0,top:0,width:0,height:0});
const listeners=[];
let nodes=[motor,ring,hidden], hit=[jaw,gear];
const svg={getBoundingClientRect:()=>({left:0,top:0,right:390,bottom:600}),
 querySelectorAll:()=>nodes,contains:e=>hit.includes(e),ownerDocument:{elementsFromPoint:()=>hit},
 addEventListener:(type,fn,capture)=>listeners.push({type,fn,capture:capture===true}),setPointerCapture:noop};
const comps=[{id:'G',type:'gear',motorType:'mg995',p1:{id:'O'}},{id:'J',type:'triangle'}];
let choices=collectPickCandidates(svg,112,100,comps);
assert.deepEqual(choices.map(c=>c.id),['O','J','G']);
assert.match(choices[0].label,/舵機軸心/);
assert.equal(collectPickCandidates(svg,-1,100,comps).length,0);
nodes=[];hit=[gear];assert.equal(collectPickCandidates(svg,100,100,comps).length,1);
nodes=[motor,ring];hit=[jaw,gear];
let selected='',opened=0;
Object.assign(S,{mode:'design',comps,placingMotor:false,pickBars:null,drawingLink:false,drawingTriangle:false,drawingPolygon:false,mateMode:false,dragId:null,dragLinkId:null,dragFrame:false});
Input.init({svg,draw:noop,rebuild:noop,pause:noop,mobilePrompt:()=>true,worldFromEvent:e=>({x:e.clientX,y:e.clientY}),
 snapshotStr:()=>'',updateUndoBtn:noop,openMobileEditPanel:()=>opened++,closeMobileEditPanel:noop,
 nodeDownEntry:(_,id)=>{selected='node:'+id;},selectOverlapComponent:id=>{selected='component:'+id;},pointCoords:()=>({})});
function fire(type,id=1,x=100,y=100,target=motor){
 const e={type,pointerId:id,pointerType:'touch',button:0,clientX:x,clientY:y,target,preventDefault:noop,
 stopPropagation(){this.stopped=true;},stopImmediatePropagation(){this.stopped=true;this.immediate=true;}};
 for(const h of listeners.filter(h=>h.type===type).sort((a,b)=>Number(b.capture)-Number(a.capture))){
  if(e.stopped&&!h.capture)break;h.fn(e);if(e.immediate)break;
 }
}
const latest=()=>body.children.at(-1);
const before=JSON.stringify(S.comps);
fire('pointerdown');assert.equal(body.children.length,0,'no dialog while finger is down');
fire('pointerup');assert.equal(latest().open,true);
latest().children.find(c=>c.textContent?.includes('舵機軸心')).events.click();
assert.equal(selected,'node:O');assert.equal(opened,1);
fire('pointerdown');fire('pointerup');latest().children.find(c=>c.textContent?.includes('夾指')).events.click();assert.equal(selected,'component:J');
fire('pointerdown');fire('pointerup');latest().children.at(-1).events.click();assert.equal(selected,'component:J');
assert.equal(JSON.stringify(S.comps),before,'selection/cancel never changes geometry');
const count=body.children.length;
fire('pointerdown');fire('pointercancel');assert.equal(body.children.length,count);
fire('pointerdown');fire('pointerdown',2,130,100);fire('pointerup');fire('pointerup',2,130,100);assert.equal(body.children.length,count,'pinch must not open picker');
fire('pointerdown');fire('pointermove',1,120,100);fire('pointerup',1,120,100);assert.equal(selected,'node:O','deliberate drag resumes node routing');assert.equal(body.children.length,count);
hit=[];selected='';fire('pointerdown');fire('pointerup');assert.equal(selected,'node:O');assert.equal(body.children.length,count,'single motor selects directly');
console.log('PASS overlapping motor/body candidates, deduplication, selection, cancel, touch release, pinch and drag routing');
