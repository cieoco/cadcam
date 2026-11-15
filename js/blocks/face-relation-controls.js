import {faceBoundaryEdges,edgeReference} from './face-edge-relations.js';
/** One operation, same candidate: graph edge picks and precise relation offsets. */
export function createFaceRelationControls({root,read,surfaces,changed,pick,ready}){
 let task=null,refs=[],signature='',info='';
 const button=(text,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.style.minHeight='44px';b.onclick=fn;return b;};
 const prompt=document.createElement('p');prompt.setAttribute('role','status');
 const actions=document.createElement('div');actions.style.cssText='display:flex;gap:8px;flex-wrap:wrap';
 const begin=kind=>{task=kind;refs=[];info='';request();};
 const edge=button('邊對齊',()=>begin('edge')),center=button('置中',()=>begin('center'));
 actions.append(edge,center,button('翻向',()=>{const d=read();d.rotationDeg=((d.rotationDeg ?? d.quarterTurns*90)+180)%360;changed();}));
 const list=document.createElement('div'),fallback=document.createElement('details'),summary=document.createElement('summary');summary.textContent='看不到邊？從清單選';fallback.append(summary);
 const choices=document.createElement('div');fallback.append(choices);
 const stop=button('取消選邊',()=>{task=null;pick(null);render();});
 root.append(actions,prompt,stop,fallback,list);
 const gapLabel=document.createElement('label');gapLabel.textContent='面間距 mm ';const gap=document.createElement('input');gap.type='number';gap.min='0';gap.step='any';gap.setAttribute('aria-label','面間距（mm）');gapLabel.append(gap);root.append(gapLabel);
 gap.oninput=()=>{const v=gap.value.trim()?Number(gap.value):NaN;gap.setAttribute('aria-invalid',String(!Number.isFinite(v)||v<0));if(Number.isFinite(v)&&v>=0)read().gap=v;changed();};
 function request(){
  const endpoint=task==='edge'&&refs.length===0?'child':'host',d=read();
  prompt.textContent=task==='edge'?(refs.length?'再點承接板要對齊的邊':'點安裝板要對齊的邊'):(refs.length?'再點承接板另一條平行邊':'點承接板的第一條邊界');
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
  if(!task)prompt.textContent=info || (rules.length?'依選定的邊定位；可輸入偏移尺寸。':'點「邊對齊」或「置中」，再點圖上的實際板邊。');
  if(document.activeElement!==gap)gap.value=d.gap;
  const next=JSON.stringify(rules.map(({offsetMm,...r})=>r));
  if(next!==signature){signature=next;list.replaceChildren();rules.forEach((r,i)=>{
   const row=document.createElement('div'),label=document.createElement('label');
   const number=(endpoint,ref)=>faceBoundaryEdges(surfaces()[endpoint],d[endpoint+'Face']).findIndex(e=>e.key===ref.key)+1;
   label.textContent=r.kind==='edge'?`安裝邊 ${number('child',r.child)} ↔ 承接邊 ${number('host',r.host)} · 偏移 mm `:`承接邊 ${number('host',r.host)}／${number('host',r.host2)} 之間置中 · 偏移 mm `;
   const input=document.createElement('input');input.type='number';input.step='any';input.value=r.offsetMm;input.setAttribute('aria-label',`關係 ${i+1} 偏移（mm）`);
   input.oninput=()=>{const v=input.value.trim()?Number(input.value):NaN;input.setAttribute('aria-invalid',String(!Number.isFinite(v)));if(Number.isFinite(v))read().edgeRelations[i].offsetMm=v;changed();};
   label.append(input);row.append(label,button('移除',()=>{read().edgeRelations.splice(i,1);changed();render();}));list.append(row);
  });}
 }
 return {render,accept,cancel(){task=null;pick(null);render();}};
}
