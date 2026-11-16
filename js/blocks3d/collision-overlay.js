/** Screen-space callouts preserve every part material and never intercept picking. */
import {groupMaterialFindings} from '../blocks/face-material-coverage.js';
export function createCollisionOverlay(container,{project,subscribeProjection}){
 const NS='http://www.w3.org/2000/svg',svg=document.createElementNS(NS,'svg');svg.setAttribute('aria-label','干涉位置');svg.setAttribute('role','img');svg.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:8';container.appendChild(svg);let rows=[];
 const node=(tag,attrs)=>{const n=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
 function draw(){svg.replaceChildren();const rect=svg.getBoundingClientRect();for(const [i,f]of rows.entries()){const p=project(f.position);if(!p)continue;const x=p.x-rect.left,y=p.y-rect.top;const g=node('g',{'aria-label':`干涉 ${f.label || i+1}`});g.append(node('circle',{cx:x,cy:y,r:15,fill:'none',stroke:'white','stroke-width':4}),node('circle',{cx:x,cy:y,r:15,fill:'none',stroke:'#e33939','stroke-width':2}));const text=node('text',{x:x+19,y:y-14,fill:'#b92020','font-size':14,'font-weight':700,stroke:'white','stroke-width':3,'paint-order':'stroke'});text.textContent=String(f.label || i+1);g.append(text);svg.append(g);}}
 const unsubscribe=subscribeProjection(draw);
 return {set(findings=[]){rows=groupMaterialFindings(findings).filter(f=>f.position&&['x','y','z'].every(k=>Number.isFinite(f.position[k])));draw();},dispose(){unsubscribe();svg.remove();}};
}
