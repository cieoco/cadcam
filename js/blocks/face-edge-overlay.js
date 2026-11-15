import {faceBoundaryEdges,edgeReference} from './face-edge-relations.js';
import {candidateSurfacePoint} from './face-candidate-view.js';
/** Screen-space hit targets project the same candidate material edges as the 3D scene. */
export function createFaceEdgeOverlay(viewer,onPick){
 let root,task=null,candidate=null,raf=0,edges=[],screenEdges=[];
 const NS='http://www.w3.org/2000/svg';
 const clear=()=>{cancelAnimationFrame(raf);raf=0;root?.remove();root=null;};
 function draw(){
  if(!task||!candidate?.model||!viewer?.canvas)return;
  const rebuild=!root;root ||= document.createElementNS(NS,'svg');root.setAttribute('aria-label','選擇實際接合邊');root.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:6';if(rebuild)viewer.canvas.parentElement.append(root);
  const rect=root.getBoundingClientRect();
  screenEdges=[];
  for(const [index,e]of edges.entries()){
   const wa=candidateSurfacePoint(candidate,e.a,task.endpoint),wb=candidateSurfacePoint(candidate,e.b,task.endpoint);if(!wa||!wb)continue;
   const a=viewer.project(wa),b=viewer.project(wb);if(!a||!b)continue;
   screenEdges.push({e,index,a,b});
   if(!rebuild){const group=root.querySelector(`[data-edge="${index}"]`);if(group)for(const line of group.querySelectorAll('line'))for(const[k,v]of Object.entries({x1:a.x-rect.left,y1:a.y-rect.top,x2:b.x-rect.left,y2:b.y-rect.top}))line.setAttribute(k,v);continue;}
   const group=document.createElementNS(NS,'g');group.setAttribute('role','button');group.setAttribute('tabindex','0');group.setAttribute('aria-label',`選${task.endpoint==='host'?'承接':'安裝'}邊 ${index+1}`);
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
 return {setCandidate(value){candidate=value;if(task){prepare();clear();draw();}},pick(value){task=value;prepare();clear();if(task)draw();},clear(){task=null;clear();},dispose(){task=null;candidate=null;edges=[];clear();}};
}
