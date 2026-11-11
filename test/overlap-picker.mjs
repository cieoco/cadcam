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
globalThis.document=Object.assign(new EventTarget(),{body,createElement:()=>new Element(),getElementById:()=>null});
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
// 積木化範例：淡化的未用格孔不和實際接點搶選取；只有淡化格孔時只留最近一個。
{const used=new Element({'data-id':'D'}),idle1=new Element({'data-id':'H1','data-unused':''},{left:95,top:90,width:20,height:20}),idle2=new Element({'data-id':'H2','data-unused':''},{left:80,top:90,width:20,height:20});
const q=sel=>[used,idle1,idle2].find(e=>sel.includes(`"${e.attrs['data-id']}"`)&&(!sel.includes('data-unused')||'data-unused' in e.attrs))||null;
const s2={...svg,querySelectorAll:()=>[used,idle1,idle2],querySelector:q,ownerDocument:{elementsFromPoint:()=>[]}};
assert.deepEqual(collectPickCandidates(s2,100,100,[]).map(c=>c.id),['D']);
const s3={...s2,querySelectorAll:()=>[idle1,idle2]};assert.deepEqual(collectPickCandidates(s3,104,100,[]).map(c=>c.id),['H1']);}
// 點在格孔中心，20px外的既有接點不能把它排除；真正重疊的未用孔也都保留。
{const joint=new Element({'data-id':'D'},{left:97,top:97,width:6,height:6}),a=new Element({'data-id':'H1','data-unused':''},{left:117,top:97,width:6,height:6}),b=new Element({'data-id':'H2','data-unused':''},{left:117,top:97,width:6,height:6});
const ns=[joint,a,b],s={...svg,querySelectorAll:()=>ns,querySelector:sel=>ns.find(e=>sel.includes(`"${e.attrs['data-id']}"`)&&(!sel.includes('data-unused')||'data-unused' in e.attrs))||null,ownerDocument:{elementsFromPoint:()=>[]}};
assert.deepEqual(collectPickCandidates(s,120,100,[]).map(c=>c.id),['D','H1','H2']);
assert.deepEqual(collectPickCandidates(s,100,100,[]).map(c=>c.id),['D']);}
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
const axisChoice=latest().children.find(c=>c.textContent?.includes('舵機軸心'));
axisChoice.events.click({detail:1});assert.equal(selected,'','touch release click must not choose newly opened dialog');
axisChoice.events.pointerdown();axisChoice.events.click({detail:1});
assert.equal(selected,'node:O');assert.equal(opened,1);
assert.equal(S.preDragSnap,null,'selection after release leaves no obsolete autosave baseline');
fire('pointerdown');fire('pointerup');latest().children.find(c=>c.textContent?.includes('夾指')).events.click({detail:0});assert.equal(selected,'component:J');
fire('pointerdown');fire('pointerup');latest().children.at(-1).events.click({detail:0});assert.equal(selected,'component:J');
assert.equal(JSON.stringify(S.comps),before,'selection/cancel never changes geometry');
const count=body.children.length;
fire('pointerdown');fire('pointercancel');assert.equal(body.children.length,count);
fire('pointerdown');fire('pointerdown',2,130,100);fire('pointerup');fire('pointerup',2,130,100);assert.equal(body.children.length,count,'pinch must not open picker');
fire('pointerdown');fire('pointermove',1,120,100);fire('pointerup',1,120,100);assert.equal(selected,'node:O','deliberate drag resumes node routing');assert.equal(body.children.length,count);
hit=[];selected='';fire('pointerdown');fire('pointerup');assert.equal(selected,'node:O');assert.equal(body.children.length,count,'single motor selects directly');

const endpoint=new Element({'data-id':'B'}), ownBar=new Element({'data-pick-component':'L'});
comps.push({id:'L',type:'bar',p1:{id:'A'},p2:{id:'B'}});
nodes=[endpoint];hit=[ownBar];selected='';
assert.deepEqual(collectPickCandidates(svg,123,100,comps).map(c=>c.id),['B'],'near endpoint prefers its own hole over its bar');
assert.deepEqual(collectPickCandidates(svg,125,100,comps).map(c=>c.id),['L'],'bar body remains selectable outside hole tolerance');
fire('pointerdown',1,123,100,ownBar);fire('pointerup',1,123,100,ownBar);
assert.equal(selected,'node:B');assert.equal(body.children.length,count,'plain endpoint opens directly, without ambiguity dialog');
nodes=[endpoint,new Element({'data-id':'C'})];
assert.equal(collectPickCandidates(svg,100,100,comps).filter(c=>c.kind==='node').length,2,'nearby holes remain separate choices');
nodes=[endpoint];hit=[ownBar,gear];
assert.deepEqual(collectPickCandidates(svg,100,100,comps).map(c=>c.id),['B','G'],'unrelated overlapping component stays selectable');

// 桌機：點一下零件本體、同一處有 2 個以上零件重疊 → 放開後開同一份選單（最上面在前）；拖曳、孔、單一零件、空白不開。
{
  const dl=[];let sel='',normal=0;
  const A=new Element({'data-pick-component':'Top'}),B=new Element({'data-pick-component':'Low'}),hole=new Element({'data-id':'H'});
  for(const e of [A,B,hole])e.closest=sel=>sel.includes('data-id')&&e.attrs['data-id']?e:null;
  let stack=[A,B];
  const dsvg={getBoundingClientRect:()=>({left:0,top:0,right:390,bottom:600}),querySelectorAll:()=>[],querySelector:()=>null,
    contains:e=>[A,B,hole].includes(e),ownerDocument:{elementsFromPoint:()=>stack},
    addEventListener:(type,fn,capture)=>dl.push({type,fn,capture:capture===true}),setPointerCapture:noop};
  const dcomps=[{id:'Top',type:'bar',name:'上桿'},{id:'Low',type:'triangle',name:'下板'}];
  Object.assign(S,{comps:dcomps});
  Input.init({svg:dsvg,draw:noop,rebuild:noop,pause:noop,mobilePrompt:()=>false,worldFromEvent:e=>({x:e.clientX,y:e.clientY}),
   snapshotStr:()=>'',updateUndoBtn:noop,openMobileEditPanel:noop,closeMobileEditPanel:noop,
   nodeDownEntry:noop,selectOverlapComponent:id=>{sel=id;},pointCoords:()=>({})});
  const f=(type,x=100,y=100,target=A,pointerType='mouse')=>{
    const e={type,pointerId:7,pointerType,button:0,clientX:x,clientY:y,target,preventDefault:noop,stopPropagation(){},stopImmediatePropagation(){this.imm=true;}};
    // 零件本體的 handler 會擋掉背景點擊，所以按下／移動只跑 capture 階段。
    for(const h of dl.filter(h=>h.type===type&&(h.capture||type==='pointerup')).sort((a,b)=>Number(b.capture)-Number(a.capture))){h.fn(e);if(e.imm)break;}
    return e;
  };
  const n0=body.children.length;
  const down=f('pointerdown');assert.notEqual(down.imm,true,'desktop press is never swallowed');
  f('pointerup');
  const dlg=body.children.at(-1);assert.equal(body.children.length,n0+1,'click on overlap opens the list');
  assert.deepEqual(dlg.children.filter(c=>c.attrs['data-pick']).map(c=>c.attrs['data-pick']),['Top','Low'],'topmost first');
  assert.match(dlg.children[0].textContent,/這裡有多個物件/);
  dlg.children.find(c=>c.attrs['data-pick']==='Low').events.click({detail:0});assert.equal(sel,'Low','choosing the lower part selects it');
  sel='';f('pointerdown');f('pointerup');body.children.at(-1).children.at(-1).events.click({detail:0});assert.equal(sel,'','cancel leaves selection alone');
  const n1=body.children.length;
  f('pointerdown');f('pointermove',112,100);f('pointerup',112,100);assert.equal(body.children.length,n1,'drag past 6 px never opens the list');
  f('pointerdown');f('pointermove',130,100);f('pointermove',100,100);f('pointerup');assert.equal(body.children.length,n1,'drag and return is still a drag');
  f('pointerdown',100,100,hole);f('pointerup',100,100,hole);assert.equal(body.children.length,n1,'hole click opens no list');
  stack=[A];f('pointerdown');f('pointerup');assert.equal(body.children.length,n1,'lone part opens no list');
  stack=[A,B];f('pointerdown',100,100,A,'touch');f('pointerup',100,100,A,'touch');assert.equal(body.children.length,n1,'touch path left to the phone handler');
  f('pointerdown');f('pointercancel');f('pointerup');assert.equal(body.children.length,n1,'cancelled press opens nothing');
  S.drawingLink=true;f('pointerdown');f('pointerup');S.drawingLink=false;assert.equal(body.children.length,n1,'drawing mode opens nothing');
}
console.log('PASS overlapping motor/body candidates, deduplication, selection, cancel, touch release, pinch and drag routing');
