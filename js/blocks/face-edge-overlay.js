import {faceBoundaryEdges,edgeReference} from './face-edge-relations.js';
import {candidateSurfacePoint} from './face-candidate-view.js';
import {boxFaces} from './face-mate.js';
/** Screen-space hit targets project the same candidate material edges as the 3D scene. */
export function createFaceEdgeOverlay(viewer,onPick){
 let root,task=null,candidate=null,raf=0,edges=[],screenEdges=[],showFaces=false,focusedRelation=null;
 const NS='http://www.w3.org/2000/svg';
 const clear=()=>{cancelAnimationFrame(raf);raf=0;root?.remove();root=null;};
 function draw(){
  if((!task&&!showFaces)||!candidate?.model||!viewer?.canvas)return;
  const rebuild=!root;root ||= document.createElementNS(NS,'svg');root.setAttribute('aria-label',task?'選擇實際接合邊':'兩個已選接面');root.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:6';if(rebuild)viewer.canvas.parentElement.append(root);
  const rect=root.getBoundingClientRect();
  root.querySelector('[data-faces]')?.remove();
  if(showFaces){
   const layer=document.createElementNS(NS,'g');layer.dataset.faces='';root.prepend(layer);
   for(const endpoint of ['host','child']){
    const selection=candidate.placement?.selection,surface=candidate[endpoint+'Surface'],rules=selection?.faceRelations,selected=rules?.length?[rules[Math.min(focusedRelation ?? rules.length-1,rules.length-1)]]:null;
    for(const id of new Set(selected?.length?selected.flatMap(r=>r[endpoint+'Faces']):[selection?.[endpoint+'Face']])){if(!surface||!id)continue;
    const face=boxFaces(surface.box).find(f=>f.id===id);if(!face)continue;
    const edgeList=faceBoundaryEdges(surface,id),rings=['top','bottom'].includes(id)?(surface.outlines || [surface.outline]).filter(Boolean).map(r=>r.map(p=>({...p,z:face.center.z}))):Array.from({length:edgeList.length/4},(_,i)=>edgeList.slice(i*4,i*4+4).map(e=>e.a));
    const project=p=>{const w=candidateSurfacePoint(candidate,p,endpoint);return w&&viewer.project(w);},color=endpoint==='host'?'#258bd0':'#0a947c';
    const path=document.createElementNS(NS,'path');path.setAttribute('d',rings.map(r=>r.map(project).filter(Boolean)).filter(r=>r.length>2).map(r=>r.map((p,i)=>`${i?'L':'M'}${p.x-rect.left},${p.y-rect.top}`).join(' ')+'Z').join(' '));path.setAttribute('fill',color);path.setAttribute('fill-opacity','.12');path.setAttribute('stroke',color);path.setAttribute('stroke-width','2');layer.append(path);
    const center=project(face.center);if(center){const label=document.createElementNS(NS,'text');label.setAttribute('x',center.x-rect.left+(endpoint==='host'?-15:15));label.setAttribute('y',center.y-rect.top-8);label.setAttribute('fill',color);label.setAttribute('stroke','white');label.setAttribute('paint-order','stroke');label.setAttribute('stroke-width','3');label.setAttribute('font-size','22');label.textContent=endpoint==='host'?'①':'②';layer.append(label);}
    }
   }
  }
  screenEdges=[];
  for(const [index,e]of (task?edges:[]).entries()){
   const wa=candidateSurfacePoint(candidate,e.a,task.endpoint),wb=candidateSurfacePoint(candidate,e.b,task.endpoint);if(!wa||!wb)continue;
   const a=viewer.project(wa),b=viewer.project(wb);if(!a||!b)continue;
   screenEdges.push({e,index,a,b});
   if(!rebuild){const group=root.querySelector(`[data-edge="${index}"]`);if(group)for(const line of group.querySelectorAll('line'))for(const[k,v]of Object.entries({x1:a.x-rect.left,y1:a.y-rect.top,x2:b.x-rect.left,y2:b.y-rect.top}))line.setAttribute(k,v);continue;}
   const group=document.createElementNS(NS,'g');group.setAttribute('role','button');group.setAttribute('tabindex','0');group.setAttribute('aria-label',`選${task.endpoint==='host'?'①':'②'}邊 ${index+1}`);
   group.dataset.edge=index;
   const choose=(chosen=e,number=index)=>{const picked={reference:edgeReference(chosen),label:`邊 ${number+1}`};task=null;clear();onPick(picked);};
   for(const [width,color]of [[18,'transparent'],[2.5,task.endpoint==='host'?'#258bd0':'#0a947c']]){
    const line=document.createElementNS(NS,'line');for(const[k,v]of Object.entries({x1:a.x-rect.left,y1:a.y-rect.top,x2:b.x-rect.left,y2:b.y-rect.top,stroke:color,'stroke-width':width}))line.setAttribute(k,v);line.style.pointerEvents='stroke';group.append(line);
   }
   let down;group.onpointerdown=e=>{e.stopPropagation();down={x:e.clientX,y:e.clientY,id:e.pointerId};group.setPointerCapture(e.pointerId);};group.onpointerup=e=>{e.stopPropagation();if(down&&down.id===e.pointerId&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<6){
    const distance=q=>{const dx=q.b.x-q.a.x,dy=q.b.y-q.a.y,t=Math.max(0,Math.min(1,((e.clientX-q.a.x)*dx+(e.clientY-q.a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(e.clientX-q.a.x-t*dx,e.clientY-q.a.y-t*dy);};
    const nearest=screenEdges.slice().sort((a,b)=>distance(a)-distance(b))[0];if(nearest)choose(nearest.e,nearest.index);
   }down=null;};group.onpointercancel=()=>{down=null;};group.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}};
   const title=document.createElementNS(NS,'title');title.textContent=`邊 ${index+1} · ${Math.hypot(e.b.x-e.a.x,e.b.y-e.a.y,e.b.z-e.a.z).toFixed(1)} mm`;group.append(title);root.append(group);
  }
  raf=requestAnimationFrame(draw);
 }
 const prepare=()=>{edges=task&&candidate?.model?faceBoundaryEdges(candidate[task.endpoint+'Surface'],task.face):[];};
 return {focusRelation(index){focusedRelation=index;clear();draw();},setCandidate(value){candidate=value;prepare();clear();draw();},showFaces(value){showFaces=value;clear();draw();},pick(value){task=value;prepare();clear();draw();},clear(){task=null;showFaces=false;clear();},dispose(){task=null;candidate=null;edges=[];clear();}};
}
