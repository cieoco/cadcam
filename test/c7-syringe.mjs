// Pack C7 of docs/SDD-CONNECTION-INTEGRITY.md: syringe end queries on the relations index, I9 (a syringe end is resolvable and lies inside
// its carrier, no lattice-hole requirement) and syringe release/reconnect through the shared commit gate.
//   node test/c7-syringe.mjs
import {readFileSync} from 'node:fs';
import {check,report} from './_harness.mjs';
import {S} from '../js/blocks/state.js';
import {BLOCK_EXAMPLES,getExample,loadUnitStarts} from '../js/blocks/examples.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {pointCoords} from '../js/blocks/model.js';
import {buildRelations} from '../js/blocks/relations.js';
import {checkWork} from '../js/blocks/integrity.js';
import {findings,describeIssue,ENABLED,sourceOf} from '../js/blocks/integrity-repairs.js';
import {integrityGate,loadIntegrity,setIntegrityForTest} from '../js/blocks/integrity-gate.js';
import {planSyringeDisconnect} from '../js/blocks/syringe-operations.js';
import {createSyringeEditor} from '../js/blocks/syringe-editor.js';
import {attachmentPoint} from '../js/core/syringe.js';
await loadUnitStarts();
await loadIntegrity();

const clone=v=>structuredClone(v);
const json=rel=>JSON.parse(readFileSync(new URL(`./fixtures/${rel}`,import.meta.url),'utf8'));
const work=s=>({comps:s.comps,modules:s.modules||[],params:s.params||s.topo?.params||{},topo:s.topo||{}});
const norm=raw=>normalizeSnapshot(clone(raw));
const ex=id=>work(norm(BLOCK_EXAMPLES.find(e=>e.id===id).snapshot));
const fixW=name=>{const {_note,_base,...rest}=json(`integrity/${name}.json`);return {...rest,topo:{...rest}};};
const i9=w=>checkWork(w).filter(i=>i.code==='I9');
const syr=w=>w.comps.find(c=>c.type==='syringe');
const comp=(w,id)=>w.comps.find(c=>c.id===id);
const hasInternalId=t=>/H\d+[A-Z][A-Za-z]*|I\d\b/.test(t);

// ---------------------------------------------------------------- 1. endsOn replaces the duplicated attachedHoles scans
{
  // the pre-C7 copy that lived in grid-rule.js and grid-plate.js
  const old=(comps,owner)=>comps.filter(c=>c.type==='syringe').flatMap(c=>['a','b'].map(k=>c[k])).filter(r=>r&&r.componentId===owner.id&&Number.isFinite(r.u)&&Number.isFinite(r.v)).map(r=>({x:r.u,y:r.v}));
  let n=0,bad=[];
  for(const e of BLOCK_EXAMPLES){
    const s=norm(e.snapshot),extra=[{type:'syringe',id:'Zs',a:{componentId:s.comps[0]?.id,u:NaN,v:3},b:{componentId:s.comps[0]?.id,u:4,v:5}},{type:'bar',id:'Zb',a:{componentId:s.comps[0]?.id,u:1,v:1}}];
    const comps=[...s.comps,...extra],rel=buildRelations({comps});
    for(const o of comps){n++;const a=JSON.stringify(old(comps,o)),b=JSON.stringify(rel.endsOn(o.id).map(e=>({x:e.u,y:e.v})));if(a!==b)bad.push(e.id+':'+o.id);}
  }
  check(`endsOn answers exactly what the old attachedHoles scan did (${n} parts of ${BLOCK_EXAMPLES.length} examples + non-finite and non-syringe ends)`,n>500&&bad.length===0,bad.slice(0,3).join(';'));
  const gr=readFileSync(new URL('../js/blocks/grid-rule.js',import.meta.url),'utf8'),gp=readFileSync(new URL('../js/blocks/grid-plate.js',import.meta.url),'utf8');
  check('grid-rule.js and grid-plate.js no longer scan syringe a/b themselves',!/\['a', *'b'\]/.test(gr)&&!/\['a', *'b'\]/.test(gp)&&gr.includes('endsOn')&&gp.includes('endsOn'));
  const h=ex('hydraulic-h01'),s=syr(h),rel=buildRelations(h);
  check('endsOn lists both ends of a syringe with their local coordinates',rel.endsOn(s.a.componentId).some(e=>e.by===s.id&&e.key==='a'&&e.u===s.a.u&&e.v===s.a.v)&&rel.endsOn(s.b.componentId).some(e=>e.by===s.id&&e.key==='b'));
}

// ---------------------------------------------------------------- 2. I9 shadow: zero on everything legal
{
  const files=['motor-off-plate','connected-resize'].map(f=>norm(json(`${f}.json`)));
  const bad=[];let n=0,ends=0;
  for(const s of [...BLOCK_EXAMPLES.map(e=>norm(e.snapshot)),...files]){if(!s)continue;n++;ends+=s.comps.filter(c=>c.type==='syringe').length*2;for(const i of i9(work(s)))bad.push(i.message);}
  check(`zero I9 (any severity) on ${n} built-in examples and the two user files (${ends} syringe ends)`,n>=72&&ends>=20&&bad.length===0,bad[0]);
}

// ---------------------------------------------------------------- 3. I9 positives (legal placements are never flagged)
{
  const off=fixW('p4-syringe-off-lattice'),a=syr(off).a;
  check('arbitrary non-lattice position on a disk: no I9',Math.abs(a.u%8)>1e-6&&i9(off).length===0,JSON.stringify(i9(off)[0]?.message));
  const nh=fixW('p4-syringe-new-fixed-hole');
  check('newly added fixed hole: no I9',i9(nh).length===0);
  check('frame mounting and end hole on a hydraulic example: no I9',['hydraulic-h01','hydraulic-h08'].every(id=>i9(ex(id)).length===0));
  const w=ex('hydraulic-h01'),s=syr(w),rod=comp(w,s.b.componentId),len=w.params[rod.lenParam];
  const atEnd=clone(w);syr(atEnd).b={componentId:rod.id,u:len,v:0};
  check('rod end hole (u = bar length): no I9',i9(atEnd).length===0);
  const mid=clone(w);syr(mid).b={componentId:rod.id,u:len/2,v:0};
  check('any point on the bar centreline inside the hole distance: no I9',i9(mid).length===0);
  const edge=clone(off);const d=comp(edge,syr(edge).a.componentId),r=(d.diameterMm||100)/2;syr(edge).a={...syr(edge).a,u:r,v:0};
  check('exactly on the disk edge is inside',i9(edge).length===0);
}

// ---------------------------------------------------------------- 4. I9 negatives
{
  const out=fixW('i9-syringe-outside-part'),i=i9(out);
  check('end outside a disk outline: I9 contradiction naming the part',i.length>0&&i[0].severity==='contradiction'&&i[0].ref?.what==='syringeEnd'&&i[0].parts.includes(syr(out).id),JSON.stringify(i));
  const w=ex('hydraulic-h01'),s=syr(w),rod=comp(w,s.b.componentId),len=w.params[rod.lenParam];
  const far=clone(w);syr(far).b={componentId:rod.id,u:len+30,v:0};
  const f=i9(far);check('end beyond the bar hole distance: I9 contradiction',f.length===1&&f[0].severity==='contradiction'&&f[0].ref.end==='b',JSON.stringify(f));
  const side=clone(w);syr(side).b={componentId:rod.id,u:len/2,v:7};
  check('end off the bar centreline (not a hole): I9 contradiction',i9(side).length===1);
  const plate=ex('adjustment-repair'),sp=syr(plate),tri=comp(plate,sp.a.componentId);
  check('plate example precondition: syringe clamp sits on a plate',tri?.type==='triangle'&&i9(plate).length===0);
  const t=clone(plate);syr(t).a={...sp.a,u:5000,v:5000};
  check('end far outside a plate outline: I9 contradiction',i9(t).some(x=>x.severity==='contradiction'&&x.ref.end==='a'));
  const inPlate=clone(plate);syr(inPlate).a={...sp.a,u:sp.a.u+1.5,v:sp.a.v};
  check('moving the clamp to another spot inside the plate (not a hole): no I9',i9(inPlate).length===0);
  const gone=clone(w);syr(gone).b={componentId:'NoSuchPart',u:0,v:0};
  const codes=checkWork(gone).filter(x=>x.parts.includes(syr(gone).id)).map(x=>x.code);
  check('carrier gone: reported once as I5, not as I9',codes.includes('I5')&&!codes.includes('I9'),codes.join());
  const loose=clone(w);syr(loose).b={componentId:'',u:0,v:0,position:{x:10,y:10}};
  check('released end with only a position: nothing to resolve, no I9 and no I5',!checkWork(loose).some(x=>['I5','I9'].includes(x.code)&&x.parts.includes(syr(loose).id)));
}

// ---------------------------------------------------------------- 5. hints, repairs and gate wording
{
  check('I9 is enabled for the open-file hint',ENABLED.I9===true);
  const out=fixW('i9-syringe-outside-part'),items=findings(out).filter(x=>x.code==='I9');
  check('hint card: one I9 item with exactly one repair 「解除該端」',items.length===1&&items[0].repairs.length===1&&items[0].repairs[0].label==='解除該端',JSON.stringify(items.map(x=>x.repairs.map(r=>r.label))));
  check('hint wording is plain student Chinese without internal ids',!hasInternalId(items[0]?.text+items[0]?.short),items[0]?.text);
  const before=JSON.stringify(out),r=items[0].repairs[0].plan({comps:clone(out.comps),params:{...out.params},modules:[]});
  const c=r.ok&&r.comps.find(x=>x.id===syr(out).id);
  check('「解除該端」clears only that end, keeps its world position, one candidate (input untouched)',r.ok&&JSON.stringify(out)===before&&!i9({...out,comps:r.comps}).length&&['a','b'].some(k=>c[k].componentId===''&&Number.isFinite(c[k].position?.x)),r.message);
  const k=['a','b'].find(k=>c[k].componentId===''),was=attachmentPoint(syr(out)[k],out.comps,out.params);
  check('...at the place it was before',Math.hypot(c[k].position.x-was.x,c[k].position.y-was.y)<1e-6);
  const gone=ex('hydraulic-h01');syr(gone).b={componentId:'NoSuchPart',u:0,v:0,position:{x:3,y:4}};
  const g=findings(gone).find(x=>x.code==='I5'&&x.repairs.length);
  check('carrier gone keeps the I5 hint with a repair that clears the end',!!g&&g.repairs[0].plan({comps:clone(gone.comps),params:gone.params,modules:[]}).ok);
}
{
  const before=ex('hydraulic-h01'),s=syr(before),rod=comp(before,s.b.componentId),len=before.params[rod.lenParam];
  const bad=clone(before);syr(bad).b={componentId:rod.id,u:len+30,v:0};
  const msgs=[];
  const ok=integrityGate(before,bad,t=>msgs.push(t));
  check('gate refuses an edit that moves a syringe end off its part, in plain Chinese',ok===false&&/未套用/.test(msgs[0])&&!hasInternalId(msgs[0]),msgs[0]);
  const d=describeIssue(bad,i9({...bad,topo:{}})[0],before);
  check('describeIssue names the part by its student-facing name',d.far.length===2&&/針筒|桿/.test(d.text),d.text);
  check('an edit that keeps the end on its part passes',integrityGate(before,clone(before),()=>{})===true);
  const wasBad=clone(bad),again=clone(bad);syr(again).a={...syr(again).a};
  check('an end that was already outside before the edit is not blamed again',integrityGate(wasBad,again,()=>{})===true);
  const two=clone(bad);syr(two).a={componentId:syr(two).a.componentId,u:syr(two).a.u+1000,v:0};
  const hit=comp(two,syr(two).a.componentId);
  if(hit?.type==='bar')check('the other end going bad while one already is: still refused (issue key includes the end)',integrityGate(bad,two,()=>{})===false||i9(two).length<2);
}

// ---------------------------------------------------------------- 6. release and reconnect through the editor (fake DOM, as syringe-edit-connections.mjs)
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
 querySelectorAll(){return [];}appendChild(n){this.append(n);return n;}
 getScreenCTM(){return {a:1,b:0,d:1,inverse(){return this;}};}
 querySelector(tag){return walk(this).find(n=>n!==this&&n.tagName===tag.toUpperCase())||null;}
 getBoundingClientRect(){return {left:0,top:0,right:600,bottom:400,width:600,height:400};}
 focus(){}select(){}show(){this.open=true;}showModal(){this.open=true;}close(){this.open=false;}
}
const walk=n=>[n,...n.childNodes.flatMap(walk)];
const body=new FakeEl('body');
globalThis.document={body,createElement:t=>new FakeEl(t),createElementNS:(_,t)=>new FakeEl(t),addEventListener(){},removeEventListener(){},activeElement:null};
globalThis.matchMedia=()=>({matches:false});globalThis.requestAnimationFrame=()=>{};
globalThis.window={confirm:()=>true,alert(){}};
{
  const host=new FakeEl('div'),svg=new FakeEl('svg');body.append(host);host.append(svg);
  const snap=norm(getExample('hydraulic-h01').snapshot);
  S.comps=snap.comps;S.topo.params=snap.params;S.fabrication=snap.fabrication;S.modules=[];S.mode='design';S.designFocus=null;
  for(const key of ['selectedLinkId','selectedNodeId','selectedTriangleId','selectedSliderId','selectedGearId'])S[key]=null;
  let commits=0;
  const editor=createSyringeEditor({svg,comps:()=>S.comps,params:()=>S.topo.params,points:()=>pointCoords(S.comps),motion:()=>({}),is3D:()=>false,showEditor(){},draw(){},pause(){},pushUndo(){commits++;},rebuild(){},seed(){},save(){},notify(){},previewStroke(){},stroke(){}});
  const id=S.comps.find(c=>c.type==='syringe').id,orig=clone(S.comps.find(c=>c.id===id).b);
  editor.open(id);editor.sync(true);
  const by=pred=>walk(host).find(pred),button=t=>by(n=>n.tagName==='BUTTON'&&n.textContent===t),status=()=>by(n=>n.className==='syringe-edit-status').textContent;
  const snapshotOf=()=>JSON.stringify([S.comps,S.topo.params]);

  // release passes the gate, writes once, and the released work is clean
  const start=snapshotOf();
  button('解除推桿連接').onclick();
  check('release preview does not touch the work',snapshotOf()===start&&commits===0);
  button('確認套用').onclick();
  check('release goes through: one commit, the rod end is free',commits===1&&S.comps.find(c=>c.id===id).b.componentId==='');
  const released=norm({comps:S.comps,params:S.topo.params});
  check('the released (unconnected) work saves, reloads and has no I5/I9',released&&!checkWork(work(released)).some(x=>['I5','I9'].includes(x.code)));

  // reconnect to the same rod hole: gated, previewed, then one commit
  const output=by(n=>n.attrs['aria-label']==='推桿連接孔');
  output.value=JSON.stringify({componentId:orig.componentId,u:orig.u,v:orig.v});output.onchange();editor.sync(true);
  check('reconnect is a preview until confirmed',commits===1,status());
  button('確認套用').onclick();
  check('reconnect goes through: second commit restores the rod end',commits===2&&S.comps.find(c=>c.id===id).b.componentId===orig.componentId&&S.comps.find(c=>c.id===id).b.u===orig.u,status());

  // refusal: a check that finds a new contradiction stops the release; nothing changes (nothing to undo)
  editor.close();editor.open(id);editor.sync(true);
  const bad={checkWork:w=>w.comps.some(c=>c.type==='syringe'&&c.b.componentId==='')?[{code:'I9',severity:'contradiction',ids:[],parts:[id],message:'x',ref:{what:'syringeEnd',comp:id,end:'b',outside:true}}]:[],describe:(w,i)=>({text:'針筒接點不在零件上',far:[],canon:[],plain:false})};
  setIntegrityForTest(bad);
  const keep=snapshotOf(),c0=commits;
  button('解除推桿連接').onclick();
  check('a refused release writes nothing, leaves no draft to confirm, tells the student why',commits===c0&&snapshotOf()===keep&&/未套用/.test(status())&&/針筒接點不在零件上/.test(status()),status());
  const confirmBtn=button('確認套用');
  check('...and no approval step is left open',!confirmBtn||confirmBtn.parentElement.hidden!==false||commits===c0);
  setIntegrityForTest(null);await loadIntegrity();
  const src=readFileSync(new URL('../js/blocks/syringe-editor.js',import.meta.url),'utf8');
  check('syringe-editor.js uses the shared gate for release (detachOutput) and reconnect (confirmMountingChange)',/function detachOutput\(\)\{[^]*?integrityGate\(/.test(src)&&/confirmMountingChange\(/.test(src));
}

// ---------------------------------------------------------------- 7. parent SDD P2 (complete syringe case): both ends can be released and rebuilt, intermediate work saves
{
  const w=ex('hydraulic-h08'),s=syr(w);
  const rel=planSyringeDisconnect({comps:clone(w.comps),params:w.params},s.id,pointCoords(w.comps));
  check('P2: rod end released by the shared planner, candidate leaves the input untouched',rel.ok&&syr({comps:rel.comps}).b.componentId===''&&syr(w).b.componentId===s.b.componentId);
  const after={...w,comps:rel.comps};
  check('P2: the intermediate work passes the gate and has no I5/I9 (saving and playback checks stay separate)',integrityGate(w,after,()=>{})===true&&!checkWork(after).some(x=>['I5','I9'].includes(x.code)));
  const back=clone(after);syr(back).b=clone(s.b);
  check('P2: reconnecting the original hole passes the gate and restores a clean work',integrityGate(after,back,()=>{})===true&&!i9(back).length);
  const frameFirst=clone(w);syr(frameFirst).b={componentId:'',u:0,v:0,position:{x:1,y:2}};
  check('P2: choosing the fixed side first (rod still unconnected) is legal work',!checkWork(frameFirst).some(x=>['I5','I9'].includes(x.code)));
}
report('c7-syringe');
