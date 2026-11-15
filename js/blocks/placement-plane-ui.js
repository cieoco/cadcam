import {placementFrame,PLACEMENT_PLANES} from './placement-plane.js';
import {pointKeysFor} from './part-types.js';
/** Isolated choice: closing never changes the drawing or assembly. */
export function choosePlacementPlane({name,comps}){
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.setAttribute('aria-label','選擇放置平面');dialog.style.cssText='width:min(460px,94vw);padding:18px;border:0;border-radius:14px;color:#234357';
  const heading=document.createElement('h3');heading.textContent=`${name} · 放在哪個平面？`;dialog.append(heading);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 400 310');svg.style.cssText='width:100%;touch-action:manipulation';dialog.append(svg);
  const NS=svg.namespaceURI,make=(tag,attrs)=>{const e=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);return e;};
  const project=p=>[200+1.1*(p.x-p.y),165+.48*(p.x+p.y)-p.z];
  let selected=null;
  const points=comps.flatMap(c=>pointKeysFor(c).map(k=>c[k])).filter(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y));
  const minX=Math.min(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxX=Math.max(...points.map(p=>p.x)),maxY=Math.max(...points.map(p=>p.y));
  const scale=100/Math.max(maxX-minX,maxY-minY,1);
  const preview=document.createElement('div');preview.textContent='點選圖中的平面';preview.style.cssText='min-height:24px;text-align:center';dialog.append(preview);
  const accept=document.createElement('button');accept.textContent='加入';accept.disabled=true;accept.style.cssText='min-height:44px;background:#167d70;color:white;border:0;border-radius:8px;padding:10px 30px';
  const render=()=>{svg.replaceChildren();
   for(const [index,plane]of PLACEMENT_PLANES.entries()){
    const f=placementFrame(plane),map=(x,y)=>project({x:f.d.x*x+f.n.x*y,y:f.d.y*x+f.n.y*y,z:f.d.z*x+f.n.z*y});
    const group=make('g',{role:'button',tabindex:0,'aria-label':`放在 ${plane.toUpperCase()} 平面`,'aria-pressed':selected===plane,style:'cursor:pointer'});
    group.append(make('polygon',{points:[[0,0],[110,0],[110,110],[0,110]].map(p=>map(...p).join(',')).join(' '),fill:selected===plane?'#20a68b':['#8bc5e9','#f3c67e','#b6b4eb'][index],'fill-opacity':selected===plane?.65:.32,stroke:selected===plane?'#08785e':'#7594a5','stroke-width':selected===plane?3:1.5}));
    const label=make('text',{x:map(60,60)[0],y:map(60,60)[1],'text-anchor':'middle','font-size':18,fill:'#183b50'});label.textContent=plane.toUpperCase();group.append(label);
    const choose=()=>{selected=plane;accept.disabled=false;preview.textContent=`${plane.toUpperCase()} · 確認方向後加入`;render();};group.onclick=choose;group.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}};svg.append(group);
   }
   if(selected){const f=placementFrame(selected),map=p=>project({x:f.d.x*(p.x-minX)*scale+f.n.x*(p.y-minY)*scale,y:f.d.y*(p.x-minX)*scale+f.n.y*(p.y-minY)*scale,z:f.d.z*(p.x-minX)*scale+f.n.z*(p.y-minY)*scale});
    for(const c of comps){let ps=pointKeysFor(c).map(k=>c[k]).filter(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y));
      if(c.standardBlank?.kind==='plate'&&c.p1&&c.p2&&c.p3)ps=[c.p1,c.p2,{x:c.p2.x+c.p3.x-c.p1.x,y:c.p2.y+c.p3.y-c.p1.y},c.p3,c.p1];
      else if(c.type==='triangle'&&ps.length===3)ps=[...ps,ps[0]];
      if(ps.length>1)svg.append(make('polyline',{points:ps.map(p=>map(p).join(',')).join(' '),fill:'none',stroke:'#173a49','stroke-width':4,'pointer-events':'none'}));}
   }
  };
  let value=null;accept.onclick=()=>{value=selected;dialog.close();};const cancel=document.createElement('button');cancel.textContent='取消';cancel.style.cssText='min-height:44px;margin-left:12px';cancel.onclick=()=>dialog.close();dialog.append(accept,cancel);
  dialog.onclose=()=>{dialog.remove();resolve(value);};document.body.append(dialog);render();dialog.showModal();
 });
}
