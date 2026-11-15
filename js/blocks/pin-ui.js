import {S} from './state.js';
import {pinPoints} from '../core/pin-lock.js';
import {partName} from './selection-target.js';
import {runEdit} from './edit-pipeline.js';
import * as Ops from './pin-ops.js';
import {setSheet,sheetMode} from './mobile-workspace.js';
import {pickPinTargets} from './pin-hit.js';
import {holeSide} from '../core/local-holes.js';

let host,source=null,active=false,selected=null,lastKey='',lastComps,focus,feedback='',scene;
const supported=c=>['bar','triangle','gear','anchor'].includes(c.type);
const locks=(a,b,at)=>[a,b].flatMap(c=>(c.pinLocks||[]).filter(r=>r.at===at&&r.with===(c===a?b.id:a.id)));
const pairs=at=>Ops.pinPairs({comps:S.comps},at).filter(p=>!p.motor).map(p=>S.comps.find(c=>c.id===p.otherId)?.type==='anchor'?p:{...p,ownerId:p.otherId,otherId:p.ownerId});
const name=id=>{const c=S.comps.find(c=>c.id===id);if(!c)return '零件';const n=partName(c),same=S.comps.filter(x=>partName(x)===n);return same.length>1?`${n} ${same.indexOf(c)+1}`:n;};
const el=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
function edit(plan,label){
 feedback='';let result;const ok=runEdit({name:label,plan:w=>(result=plan({...w,theta:S.theta,motorAngles:S.motorAngles})),host:{...host,S,points:host.points(),transient(msg){feedback=msg;host.transient(msg,5000);if(active)hint(msg);renderPanel();},afterCommit(){host.save();}}});
 if(ok){source=null;active=false;host.svg.removeAttribute('data-pin-picking');host.clear();if(result.retarget)host.select(result.retarget[1]);renderPanel();}return ok;
}
function action(kind,pair){edit(w=>Ops[kind](w,pair),kind==='planUnpin'?'拔除插銷':kind==='planPinLock'?'鎖固插銷':'插銷可轉');}
function panel(){let p=document.getElementById('pinEditor');if(!p){p=el('section');p.id='pinEditor';p.style.cssText='display:flex;flex-direction:column;gap:10px;padding:12px;border:1px solid #9db8c9;border-radius:8px';document.getElementById('roleEditor')?.prepend(p);}return p;}
export function renderPanel(){
 if(!host)return;
 const p=panel();if(!p)return;p.parentElement.classList.toggle('pin-placing',active);if(active)p.parentElement.style.display='flex';
 const list=pairs(S.selectedNodeId),key=JSON.stringify([active,source,S.selectedNodeId,selected,list,feedback]);p.hidden=!active&&!list.length;
 if(active||list.length)p.parentElement.dataset.selectionSummary=active?'放入插銷':`插銷：${list.some(x=>x.locked)?'鎖固':list.some(x=>x.limited)?'受另一插銷限制':'可轉'}`;
 const roleRow=p.parentElement.querySelector('.node-role-row'),advanced=document.getElementById('nodeAdvanced');if(roleRow&&advanced){if(list.length)advanced.append(roleRow);else if(roleRow.parentElement===advanced)p.parentElement.insertBefore(roleRow,advanced);}p.parentElement.classList.toggle('pin-connected',list.length>0);
 if(lastComps===S.comps&&lastKey===key&&p.childNodes.length)return;lastComps=S.comps;lastKey=key;p.replaceChildren();if(p.hidden)return;
 p.append(el('strong',active?'放入插銷':'插銷'));
 if(feedback){const note=el('p',feedback);note.setAttribute('role','status');p.append(note);}
 if(active){
  p.append(el('span',source?`已選「${name(source.ownerId)}」的孔；再點另一件的孔。`:'點第一個積木的孔，再點另一個積木的孔。'));
  if(source){const reset=el('button','重選第一孔');reset.type='button';reset.onclick=()=>{source=null;feedback='';host.banner('放入插銷：請點第一個積木的孔。');renderPanel();};p.append(reset);}
  const precise=el('details');precise.append(el('summary','精確選孔'));p.append(precise);
  const body=el('select'),hole=el('select'),use=el('button',source?'放入插銷':'選取第一孔');body.setAttribute('aria-label',source?'第二個積木':'第一個積木');hole.setAttribute('aria-label',source?'第二個孔':'第一個孔');
  for(const c of S.comps.filter(c=>supported(c)&&c.id!==source?.ownerId)){const o=el('option',name(c.id));o.value=c.id;body.append(o);}
  const sync=()=>{hole.replaceChildren();const c=S.comps.find(c=>c.id===body.value);for(const [i,q]of (c?pinPoints(c):[]).entries()){const o=el('option',`第 ${i+1} 孔`);o.value=q.id;hole.append(o);}};body.onchange=sync;sync();use.type='button';use.onclick=()=>selectHole(body.value,hole.value);precise.append(body,hole,use);
  const cancel=el('button','取消');cancel.type='button';cancel.onclick=cancelPin;p.append(cancel);return;
 }
 if(!list.some(x=>x.ownerId===selected?.ownerId&&x.otherId===selected?.otherId||x.ownerId===selected?.otherId&&x.otherId===selected?.ownerId))selected=list[0];
 if(list.length>1){const select=el('select');select.setAttribute('aria-label','插銷連接的兩個零件');list.forEach((x,i)=>{const o=el('option',`${name(x.ownerId)} ↔ ${name(x.otherId)}`);o.value=String(i);o.selected=x===selected;select.append(o);});select.onchange=()=>{selected=list[Number(select.value)];renderPanel();};p.append(select);}
 const pair={...selected,at:S.selectedNodeId},a=S.comps.find(c=>c.id===pair.ownerId),b=S.comps.find(c=>c.id===pair.otherId);if(!a||!b)return;
 p.append(el('span',`${partName(a)} ↔ ${partName(b)}`));
 const locked=locks(a,b,pair.at).length>0,multiple=pinPoints(a).some(q=>q.id!==pair.at&&pinPoints(b).some(r=>q.id===r.id));
 const row=el('div');row.style.cssText='display:flex;gap:6px;flex-wrap:wrap';
 for(const [label,kind,on]of [['可轉','planPinUnlock',!locked],['鎖固','planPinLock',locked],[`拔除「${name(pair.ownerId)}」`,'planUnpin',false]]){const button=el('button',label);button.type='button';button.setAttribute('aria-pressed',String(on));button.onclick=()=>action(kind,pair);if(kind==='planPinLock'&&[a,b].some(c=>c.type==='anchor')){button.disabled=true;button.title='獨立支點只提供轉軸，沒有可鎖定的方向基準。';}if(on)button.style.background='#d9f3f4';row.append(button);}p.append(row);
 const which=el('select');which.setAttribute('aria-label','拔除哪個積木');for(const c of [a,b]){const o=el('option',name(c.id));o.value=c.id;o.disabled=c.type==='anchor';which.append(o);}which.onchange=()=>{selected={ownerId:pair.otherId,otherId:pair.ownerId,at:pair.at};renderPanel();};p.append(which);
 if(multiple)p.append(el('small','另有插銷限制兩件轉動；可拔除其中一支。'));
}
function choose(hits){
 const possible=hits.filter(c=>!source||c.ownerId!==source.ownerId);
 if(!possible.length){host.transient('請選另一個積木的孔。',5000);return;}
 if(possible.length===1){selectHole(possible[0].ownerId,possible[0].id);return;}
 hint('這裡重疊，選要接的積木：',possible.map(c=>({label:name(c.ownerId),run:()=>selectHole(c.ownerId,c.id)})));
}
function screenTargets(){
 if(!scene)return [];
 const m=host.svg.getScreenCTM();if(!m)return [];
 return scene.comps.filter(supported).flatMap(c=>pinPoints(c).flatMap((p,index)=>{
  let q=scene.points[p.id];
  if(!q&&Number.isFinite(p.u)){const a=scene.points[c.p1.id],b=scene.points[c.p2.id];if(a&&b){const len=Math.hypot(b.x-a.x,b.y-a.y),ux=(b.x-a.x)/len,uy=(b.y-a.y)/len,v=p.v*holeSide(c);q={x:a.x+p.u*ux-v*uy,y:a.y+p.u*uy+v*ux};}}
  if(!q)return [];const s=scene.project(q);return [{id:p.id,ownerId:c.id,index,x:m.a*s.x+m.c*s.y+m.e,y:m.b*s.x+m.d*s.y+m.f}];
 }));
}
function selectHole(ownerId,at){
 if(!ownerId||!at)return;
 if(!source){source={ownerId,from:at};S.selectedNodeId=at;host.draw();hint(`已選「${name(ownerId)}」；點另一個積木的孔。`);renderPanel();return;}
 if(ownerId===source.ownerId){host.transient('請選另一個積木的孔。');return;}
 if(source.from===at){cancelPin();host.select(at);renderPanel();return;}
 const request={...source,otherId:ownerId,to:at};
 edit(w=>Ops.planInsertPin(w,request),'放入插銷');
}
function highlight(id){for(const e of host.svg.querySelectorAll('[data-pick-component]'))e.toggleAttribute('data-pin-highlight',e.getAttribute('data-pick-component')===id);}
function hint(text,choices=[]){host.banner(text);const bar=document.getElementById('modeBanner');if(!bar)return;bar.style.pointerEvents='auto';for(const c of [...choices,...(source?[{label:'重選',run:()=>{source=null;host.draw();hint('點第一個積木的孔。');}}]:[]),{label:'取消',run:cancelPin}]){const b=el('button',c.label);b.type='button';b.style.cssText='margin-left:6px;min-height:32px';b.onclick=c.run;bar.append(b);}}
export function init(h){
 host=h;
 const style=el('style');style.textContent='#roleEditor.pin-placing > :not(#pinEditor){display:none!important} #roleEditor.pin-connected #localHoleNotice{display:none} #pinEditor select,#pinEditor button{min-height:40px} #pinEditor select{max-width:100%} #stageSvg [data-pin-highlight]{filter:drop-shadow(0 0 3px #ed9800)}';document.head.append(style);
 h.svg.parentElement.addEventListener('pointerdown',e=>{
  if(!active||!h.svg.contains(e.target))return;
  e.preventDefault();e.stopImmediatePropagation();
  const hits=pickPinTargets(screenTargets(),{x:e.clientX,y:e.clientY});
  if(hits.length)choose(hits);else host.transient('請靠近積木上的孔點選。',5000);
 },true);
 document.addEventListener('keydown',e=>{if(active&&e.key==='Escape')cancelPin();});
 document.addEventListener('click',e=>{const cmd=e.target.closest?.('[data-command]');if(active&&cmd&&!['pin','fitView','rulers'].includes(cmd.dataset.command))cancelPin();},true);
}
export function startPin(){host.cancel();host.pause();source=null;feedback='';active=true;host.svg.setAttribute('data-pin-picking','');focus=S.designFocus;if(sheetMode()){setSheet('collapsed');host.fit();}hint('放入插銷：點第一個積木的孔。');renderPanel();}
export function cancelPin(){active=false;source=null;host.svg.removeAttribute('data-pin-picking');host.clear();renderPanel();}
export function inspectPin(at){cancelPin();host.select(at);if(sheetMode())setSheet('half');renderPanel();}
export function renderPins({svg,comps,points,project,registerUpdate}){
 scene={comps,points,project};registerUpdate(ps=>{scene.points=ps;});
 if(active&&focus!==S.designFocus)cancelPin();
 const used=new Map();for(const c of comps.filter(supported))for(const p of pinPoints(c)){const cs=used.get(p.id)||[];if(!cs.includes(c))used.set(p.id,[...cs,c]);}
 for(const [at,cs]of used){if(cs.length<2||!points[at]||cs.some(c=>c.motorMount?.center===at||[c.p1,c.p2].some(p=>p?.id===at&&p.physicalMotor)))continue;
  const g=document.createElementNS('http://www.w3.org/2000/svg','g'),circle=document.createElementNS(g.namespaceURI,'circle'),mark=document.createElementNS(g.namespaceURI,'path'),hit=document.createElementNS(g.namespaceURI,'circle');
  g.dataset.pin=at;g.dataset.id=at;g.setAttribute('role','button');g.setAttribute('aria-label','插銷：'+cs.map(partName).join('與'));g.style.cursor='pointer';
  circle.setAttribute('r','6');circle.setAttribute('fill','#eaf9ff');circle.setAttribute('stroke','#087c98');circle.setAttribute('stroke-width','2');
  const locked=cs.some(c=>c.pinLocks?.some(r=>r.at===at));mark.setAttribute('d',locked?'M -3 0 L 3 0 M 0 -3 L 0 3':'M -2 0 L 2 0');mark.setAttribute('stroke','#087c98');mark.setAttribute('stroke-width','2');hit.setAttribute('r','18');hit.setAttribute('fill','transparent');hit.style.pointerEvents='all';g.append(hit,circle,mark);
  g.addEventListener('pointerdown',e=>{if(active)return;e.preventDefault();e.stopImmediatePropagation();host.select(at);if(sheetMode())setSheet('half');renderPanel();});svg.append(g);
  const update=ps=>{const q=ps[at];g.style.display=q?'':'none';if(q){const p=project(q),m=svg.getScreenCTM(),scale=m?Math.hypot(m.a,m.b):1;g.setAttribute('transform',`translate(${p.x} ${p.y}) scale(${1/(scale||1)})`);}};update(points);registerUpdate(update);
 }
 renderPanel();
 highlight(active?source?.ownerId:null);
}
