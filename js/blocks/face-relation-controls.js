import {faceBoundaryEdges} from './face-edge-relations.js';
import {FACE_RELATION_NAMES} from './face-relations.js';
const faces={top:'上面',bottom:'下面',front:'前面',back:'後面',left:'左面',right:'右面'};
const icon={mate:'▱ ⇄ ▱',flush:'▱ ─ ▱',center:'▯ ┆ ▯'};
/** Each relation owns its references and offset. Picking stays local until all references are chosen. */
export function createFaceRelationControls({root,read,surfaces,changed,pick,status}){
 let task=null,refs=[],editing=-1,signature='';
 const button=(text,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.style.minHeight='44px';b.onclick=fn;return b;};
 const actions=document.createElement('div');actions.style.cssText='display:flex;gap:6px;flex-wrap:wrap';
 for(const [kind,name]of Object.entries(FACE_RELATION_NAMES)){const b=button(`${icon[kind]} ${name}`,()=>begin(kind));b.dataset.kind=kind;actions.append(b);}
 const prompt=document.createElement('p');prompt.setAttribute('role','status');
 const stop=button('取消選面',cancel),fallback=document.createElement('details'),summary=document.createElement('summary');summary.textContent='被遮住的面';fallback.append(summary);
 const choices=document.createElement('div');choices.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:6px';fallback.append(choices);
 const list=document.createElement('div'),feedback=document.createElement('p');feedback.setAttribute('role','status');feedback.style.color='#b34436';
 root.append(actions,prompt,stop,fallback,list,feedback);
 function cancel(){task=null;refs=[];editing=-1;pick(null);changed();render();}
 function begin(kind,index=-1){task=kind;refs=[];editing=index;request();}
 function request(){
  const count=task==='center'?2:1,endpoint=refs.length<count?'host':'child',which=endpoint==='host'?'①':'②',second=refs.length%count===1;
  prompt.textContent=`${which} ${task==='center'?(second?'選另一側的面':'選一側的面'):'選一個面'}`;prompt.style.color=endpoint==='host'?'#258bd0':'#0a947c';
  pick({endpoint,relation:true});choices.replaceChildren();
  const surface=surfaces()[endpoint];
  for(const [id,name]of Object.entries(faces)){const b=button(name,()=>accept({face:id}));b.disabled=!surface||(!['top','bottom'].includes(id)&&!faceBoundaryEdges(surface,id).length);choices.append(b);}
  changed();render();
 }
 function accept(value){
  if(!task||!Object.hasOwn(faces,value.face))return;
  refs.push(value.face);const count=task==='center'?2:1;
  if(refs.length<count*2){request();return;}
  const d=read(),old=editing>=0?d.faceRelations[editing]:null,r={kind:task,hostFaces:refs.slice(0,count),childFaces:refs.slice(count),offsetMm:old?.offsetMm ?? 0};
  if(editing<0)d.faceRelations.push(r);else d.faceRelations[editing]=r;
  task=null;refs=[];editing=-1;pick(null);signature='';changed();render();
 }
 function render(){
  const d=read(),rules=d.faceRelations || [];
  for(const b of actions.children)b.disabled=rules.length>=6;
  stop.hidden=fallback.hidden=!task;prompt.hidden=!task;
  const next=JSON.stringify([rules.map(({offsetMm,...r})=>r),d.edgeRelations?.length]);
  if(next!==signature){signature=next;list.replaceChildren();
   if(d.edgeRelations?.length){const legacy=document.createElement('div');legacy.textContent='原有邊定位（保留）';legacy.append(button('移除原有邊定位',()=>{delete read().edgeRelations;changed();render();}));list.append(legacy);}
   rules.forEach((r,i)=>{
    const row=document.createElement('div');row.dataset.relation=i;row.style.cssText='border:1px solid #ccd7da;border-radius:10px;padding:8px;margin-top:8px';
    const focus=()=>{if(!task)pick({focusRelation:i});};row.onpointerdown=focus;row.onfocusin=focus;
    const title=document.createElement('strong');title.textContent=`${i+1} · ${FACE_RELATION_NAMES[r.kind]}`;
    const refsLabel=document.createElement('div');refsLabel.style.cssText='display:flex;gap:8px;margin:6px 0';
    for(const [key,color,mark]of [['hostFaces','#258bd0','①'],['childFaces','#0a947c','②']]){const s=document.createElement('span');s.style.color=color;s.textContent=`${mark} ${r[key].map(f=>faces[f]).join('／')}`;refsLabel.append(s);}
    const label=document.createElement('label');label.textContent='偏差 mm ';const input=document.createElement('input');input.type='number';input.step='any';input.value=r.offsetMm;input.setAttribute('aria-label',`關係 ${i+1} 偏差（mm）`);
    input.oninput=()=>{const v=input.value.trim()?Number(input.value):NaN;input.setAttribute('aria-invalid',String(!Number.isFinite(v)));if(Number.isFinite(v))read().faceRelations[i].offsetMm=v;changed();};label.append(input);
    row.append(title,refsLabel,label,button('重新選面',()=>begin(r.kind,i)),button('移除',()=>{read().faceRelations.splice(i,1);signature='';changed();render();}));list.append(row);
   });
  }
  const result=status?.();feedback.textContent=rules.length?(result&&!result.ok?result.reason:''):'選一種關係開始；順序不限。';
  for(const row of list.querySelectorAll('[data-relation]'))row.style.borderColor=result&&!result.ok&&(!result.relationConflicts||result.relationConflicts.includes(Number(row.dataset.relation)))?'#c54c42':'#ccd7da';
 }
 return {render,accept,cancel,pending:()=>!!task};
}
