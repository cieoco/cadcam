import {faceBoundaryEdges,edgeReference} from './face-edge-relations.js';
import {candidateSurfacePoint} from './face-candidate-view.js';
import {boxFaces} from './face-mate.js';
/** Cache world geometry and SVG nodes; only camera/viewport changes need reprojection. */
export function createFaceEdgeOverlay(viewer,onPick){
 let root,task=null,candidate=null,showFaces=false,focusedRelation=null,faces=[],edges=[],screenEdges=[];
 const NS='http://www.w3.org/2000/svg',node=tag=>document.createElementNS(NS,tag);
 const attr=(el,key,value)=>{const text=String(value);if(el.getAttribute(key)!==text)el.setAttribute(key,text);};
 const clear=()=>{root?.remove();root=null;faces=[];edges=[];screenEdges=[];};
 function draw(){
  if(!root)return;
  // Read layout once before any writes. World-space geometry never changes with the camera.
  const rect=root.getBoundingClientRect(),points=[],ranges=[];
  for(const f of faces){const start=points.length;for(const ring of f.rings)points.push(...ring);points.push(f.center);ranges.push({f,start});}
  const edgeStart=points.length;for(const e of edges)points.push(e.a,e.b);
  const screen=viewer.projectPoints?viewer.projectPoints(points):points.map(p=>viewer.project(p));
  for(const {f,start}of ranges){let i=start;const paths=[];
   for(const ring of f.rings){const projected=screen.slice(i,i+ring.length);i+=ring.length;if(projected.every(Boolean))paths.push(projected.map((p,j)=>`${j?'L':'M'}${p.x-rect.left},${p.y-rect.top}`).join(' ')+'Z');}
   attr(f.path,'d',paths.join(' '));const p=screen[i];attr(f.label,'visibility',p?'visible':'hidden');if(p){attr(f.label,'x',p.x-rect.left+f.shift);attr(f.label,'y',p.y-rect.top-8);}
  }
  screenEdges=[];
  edges.forEach((e,i)=>{const a=screen[edgeStart+i*2],b=screen[edgeStart+i*2+1];attr(e.group,'visibility',a&&b?'visible':'hidden');if(!a||!b)return;screenEdges.push({e,a,b});for(const line of e.lines)for(const[k,v]of Object.entries({x1:a.x-rect.left,y1:a.y-rect.top,x2:b.x-rect.left,y2:b.y-rect.top}))attr(line,k,v);});
 }
 function rebuild(){
  clear();if((!task&&!showFaces)||!candidate?.model||!viewer?.canvas)return;
  root=node('svg');root.setAttribute('aria-label',task?'選擇實際接合邊':'兩個已選接面');root.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:6';viewer.canvas.parentElement.append(root);
  const world=(p,endpoint)=>candidateSurfacePoint(candidate,p,endpoint);
  if(showFaces)for(const endpoint of ['host','child']){
   const selection=candidate.placement?.selection,surface=candidate[endpoint+'Surface'],rules=selection?.faceRelations,selected=rules?.length?[rules[Math.min(focusedRelation ?? rules.length-1,rules.length-1)]]:null;
   for(const id of new Set(selected?.length?selected.flatMap(r=>r[endpoint+'Faces']):[selection?.[endpoint+'Face']])){
    if(!surface||!id)continue;const face=boxFaces(surface.box).find(f=>f.id===id);if(!face)continue;
    let rings;if(['top','bottom'].includes(id))rings=(surface.outlines || [surface.outline]).filter(Boolean).map(r=>r.map(p=>({...p,z:face.center.z})));
    else{const es=faceBoundaryEdges(surface,id);rings=Array.from({length:es.length/4},(_,i)=>es.slice(i*4,i*4+4).map(e=>e.a));}
    const center=world(face.center,endpoint);rings=rings.map(r=>r.map(p=>world(p,endpoint))).filter(r=>r.every(Boolean));if(!center)continue;
    const color=endpoint==='host'?'#258bd0':'#0a947c',path=node('path'),label=node('text');
    for(const[k,v]of Object.entries({fill:color,'fill-opacity':'.12',stroke:color,'stroke-width':2}))attr(path,k,v);
    for(const[k,v]of Object.entries({fill:color,stroke:'white','paint-order':'stroke','stroke-width':3,'font-size':22}))attr(label,k,v);
    label.textContent=endpoint==='host'?'①':'②';root.append(path,label);faces.push({rings,center,path,label,shift:endpoint==='host'?-15:15});
   }
  }
  if(task)for(const [index,e]of faceBoundaryEdges(candidate[task.endpoint+'Surface'],task.face).entries()){
   const a=world(e.a,task.endpoint),b=world(e.b,task.endpoint);if(!a||!b)continue;
   const group=node('g');group.setAttribute('role','button');group.setAttribute('tabindex','0');group.setAttribute('aria-label',`選${task.endpoint==='host'?'①':'②'}邊 ${index+1}`);
   const entry={a,b,group,lines:[],reference:edgeReference(e),label:`邊 ${index+1}`};
   const choose=chosen=>{task=null;const value={reference:chosen.reference,label:chosen.label};rebuild();onPick(value);};
   for(const [width,color]of [[18,'transparent'],[2.5,task.endpoint==='host'?'#258bd0':'#0a947c']]){const line=node('line');attr(line,'stroke',color);attr(line,'stroke-width',width);line.style.pointerEvents='stroke';group.append(line);entry.lines.push(line);}
   let down;group.onpointerdown=e=>{e.stopPropagation();down={x:e.clientX,y:e.clientY,id:e.pointerId};group.setPointerCapture(e.pointerId);};
   group.onpointerup=e=>{e.stopPropagation();if(down&&down.id===e.pointerId&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<6){const distance=q=>{const dx=q.b.x-q.a.x,dy=q.b.y-q.a.y,t=Math.max(0,Math.min(1,((e.clientX-q.a.x)*dx+(e.clientY-q.a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(e.clientX-q.a.x-t*dx,e.clientY-q.a.y-t*dy);};const nearest=screenEdges.slice().sort((a,b)=>distance(a)-distance(b))[0];if(nearest)choose(nearest.e);}down=null;};
   group.onpointercancel=()=>{down=null;};group.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(entry);}};
   const title=node('title');title.textContent=`邊 ${index+1} · ${Math.hypot(e.b.x-e.a.x,e.b.y-e.a.y,e.b.z-e.a.z).toFixed(1)} mm`;group.append(title);root.append(group);edges.push(entry);
  }
  draw();
 }
 const unsubscribe=viewer.subscribeProjection?.(draw);
 return {focusRelation(index){if(focusedRelation===index)return;focusedRelation=index;rebuild();},setCandidate(value){if(candidate===value)return;candidate=value;rebuild();},showFaces(value){if(showFaces===value)return;showFaces=value;rebuild();},pick(value){task=value;rebuild();},clear(){task=null;showFaces=false;clear();},dispose(){unsubscribe?.();task=null;candidate=null;clear();}};
}
