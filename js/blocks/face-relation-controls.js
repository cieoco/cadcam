import {faceBoundaryEdges,edgeReference} from './face-edge-relations.js';
/** One operation, same candidate: graph edge picks and precise relation offsets. */
export function createFaceRelationControls({root,read,surfaces,changed,pick,ready}){
 let task=null,refs=[],signature='',info='';
 const button=(text,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.style.minHeight='44px';b.onclick=fn;return b;};
 const prompt=document.createElement('p');prompt.setAttribute('role','status');
 const actions=document.createElement('div');actions.style.cssText='display:flex;gap:8px;flex-wrap:wrap';
 const begin=kind=>{task=kind;refs=[];info='';request();};
 const edit=fn=>{task=null;pick(null);info='';fn(read());changed();render();};
 const edge=button('邊對齊',()=>begin('edge')),center=button('兩邊之間置中',()=>begin('center'));
 actions.append(button('▱ 貼齊',()=>edit(d=>d.gap=0)),button('⊙ 置中',()=>edit(d=>{delete d.edgeRelations;d.alignU=d.alignV=d.offsetU=d.offsetV=0;})),edge,button('↔ 翻向',()=>edit(d=>d.rotationDeg=((d.rotationDeg ?? d.quarterTurns*90)+180)%360)));
 const list=document.createElement('div'),fallback=document.createElement('details'),summary=document.createElement('summary');summary.textContent='看不到邊？從清單選';fallback.append(summary);
 const choices=document.createElement('div');fallback.append(choices);
 const stop=button('取消選邊',()=>{task=null;pick(null);render();});
 root.append(actions,prompt,stop,fallback,list);
 const extra=document.createElement('details'),extraLabel=document.createElement('summary');extraLabel.textContent='以兩條邊為置中基準';extra.append(extraLabel,center);root.append(extra);
 const gapLabel=document.createElement('label');gapLabel.textContent='面間距 mm ';const gap=document.createElement('input');gap.type='number';gap.min='0';gap.step='any';gap.setAttribute('aria-label','面間距（mm）');gapLabel.append(gap);root.append(gapLabel);
 gap.oninput=()=>{const v=gap.value.trim()?Number(gap.value):NaN;gap.setAttribute('aria-invalid',String(!Number.isFinite(v)||v<0));if(Number.isFinite(v)&&v>=0)read().gap=v;changed();};
 const precise=[];
 for(const [key,title]of [['offsetU','↔ 偏移 mm'],['offsetV','↕ 偏移 mm'],['rotationDeg','⟳ 旋轉 °']]){
  const label=document.createElement('label');label.textContent=title;const input=document.createElement('input');input.type='number';input.step='any';input.setAttribute('aria-label',title);label.append(input);root.append(label);precise.push({key,input,label});
  input.oninput=()=>{const v=input.value.trim()?Number(input.value):NaN;input.setAttribute('aria-invalid',String(!Number.isFinite(v)));if(Number.isFinite(v))read()[key]=v;changed();};
  if(key==='rotationDeg'){const turn=delta=>edit(d=>d.rotationDeg=((d.rotationDeg ?? d.quarterTurns*90)+delta+360)%360);label.append(button('−90°',()=>turn(-90)),button('+90°',()=>turn(90)));}
 }
 function request(){
  const endpoint=task==='edge'&&refs.length===0?'child':'host',d=read();
  prompt.textContent=task==='edge'?(refs.length?'① 點另一條邊':'② 點一條邊'):(refs.length?'① 再點另一條平行邊':'① 點第一條邊界');
  prompt.style.color=endpoint==='host'?'#258bd0':'#0a947c';
  pick({endpoint,face:d[endpoint+'Face']});choices.replaceChildren();
  const edges=faceBoundaryEdges(surfaces()[endpoint],d[endpoint+'Face']);
  if(!edges.length){task=null;pick(null);info='這個面沒有可選的直線邊，請換面。';render();return;}
  for(const [i,e]of edges.entries())choices.append(button(`邊 ${i+1} · ${Math.hypot(e.b.x-e.a.x,e.b.y-e.a.y,e.b.z-e.a.z).toFixed(1)} mm`,()=>accept({reference:edgeReference(e)})));
  render();
 }
 function accept(value){
  if(!task)return;refs.push(value.reference);
  if(refs.length<2){request();return;}
  const d=read(),r=task==='edge'?{kind:'edge',child:refs[0],host:refs[1],offsetMm:0}:{kind:'center',host:refs[0],host2:refs[1],offsetMm:0};
  d.edgeRelations=[...(d.edgeRelations || []),r];task=null;pick(null);changed();render();
 }
 function render(){
  const d=read(),rules=d.edgeRelations || [];edge.disabled=center.disabled=!ready()||rules.length>=2;
  stop.hidden=fallback.hidden=!task;
  if(!task){prompt.textContent=info || '';prompt.style.color='';}
  for(const {key,input,label}of precise){label.hidden=key!=='rotationDeg'&&rules.length>0;if(document.activeElement!==input){input.value=key==='rotationDeg'?(d.rotationDeg ?? d.quarterTurns*90):d[key];input.removeAttribute('aria-invalid');}}
  if(document.activeElement!==gap){gap.value=d.gap;gap.removeAttribute('aria-invalid');}
  const next=JSON.stringify(rules.map(({offsetMm,...r})=>r));
  if(next!==signature){signature=next;list.replaceChildren();rules.forEach((r,i)=>{
   const row=document.createElement('div'),label=document.createElement('label');
   const number=(endpoint,ref)=>faceBoundaryEdges(surfaces()[endpoint],d[endpoint+'Face']).findIndex(e=>e.key===ref.key)+1;
   label.textContent=r.kind==='edge'?`② 邊 ${number('child',r.child)} ↔ ① 邊 ${number('host',r.host)} · 偏移 mm `:`① 邊 ${number('host',r.host)}／${number('host',r.host2)} · 置中偏移 mm `;
   const input=document.createElement('input');input.type='number';input.step='any';input.value=r.offsetMm;input.setAttribute('aria-label',`關係 ${i+1} 偏移（mm）`);
   input.oninput=()=>{const v=input.value.trim()?Number(input.value):NaN;input.setAttribute('aria-invalid',String(!Number.isFinite(v)));if(Number.isFinite(v))read().edgeRelations[i].offsetMm=v;changed();};
   label.append(input);row.append(label,button('移除',()=>{read().edgeRelations.splice(i,1);changed();render();}));list.append(row);
  });}
 }
 return {render,accept,cancel(){task=null;pick(null);render();}};
}
