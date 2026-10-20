import {worldFusionGeometry} from './bar-fusion-geometry.js';
import {planBarFusion} from './bar-fusion-plan.js';
import {memberStock} from './member-stock.js';
const NS='http://www.w3.org/2000/svg';
export function openBarFusion({first,comps,params,settings,positions,onConfirm}) {
  const dialog=document.createElement('dialog');dialog.setAttribute('aria-label','連桿合成一片');
  dialog.style.cssText='box-sizing:border-box;width:min(600px,calc(100vw - 16px));max-height:92dvh;overflow:auto;padding:12px;border:1px solid #a4b9b6;border-radius:12px;color:#25453f';
  const style=document.createElement('style');style.textContent='.bar-fusion-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;max-height:22dvh;overflow:auto}.bar-fusion-dialog button{min-height:44px;font:14px system-ui;padding:6px 8px;border:1px solid #a4b9b6;border-radius:8px;background:white;color:#25453f;overflow-wrap:anywhere}.bar-fusion-dialog button[aria-pressed=true]{background:#ddf3ec;border:2px solid #268878}.bar-fusion-dialog button:disabled{opacity:.5}.bar-fusion-actions{position:sticky;bottom:-12px;background:white;display:flex;gap:6px;padding:8px 0}.bar-fusion-actions button{flex:1}.bar-fusion-actions button:last-child{background:#236e5e;color:white}.bar-fusion-dialog svg{width:100%;height:clamp(160px,28dvh,240px);background:#edf4f0;border-radius:8px;touch-action:manipulation}';
  dialog.className='bar-fusion-dialog';dialog.append(style);
  const heading=document.createElement('h2');heading.textContent='連桿合成一片';heading.style.cssText='font-size:18px;margin:0 0 8px';dialog.append(heading);
  const hint=document.createElement('p');hint.textContent='點選要合成的連桿，再點一次取消。確認後角度固定，孔位保留。';hint.style.fontSize='14px';dialog.append(hint);
  const svg=document.createElementNS(NS,'svg');svg.setAttribute('aria-label','連桿選取與合成外形預覽');dialog.append(svg);
  const choices=document.createElement('div');choices.className='bar-fusion-options';dialog.append(choices);
  const status=document.createElement('p');status.setAttribute('role','status');status.style.cssText='font-size:14px;overflow-wrap:anywhere';dialog.append(status);
  const actions=document.createElement('div');actions.className='bar-fusion-actions';dialog.append(actions);
  const cancel=document.createElement('button');cancel.textContent='取消';cancel.onclick=()=>dialog.close();actions.append(cancel);
  const confirm=document.createElement('button');confirm.textContent='確認合成';actions.append(confirm);
  const bars=comps.filter(c=>c.type==='bar'&&c.moduleId===first.moduleId),selected=new Set([first.id]);
  let plan;
  const toggle=id=>{selected.has(id)?selected.delete(id):selected.add(id);render();};
  for(const c of bars){const b=document.createElement('button');b.textContent=c.name||c.id;b.dataset.id=c.id;b.onclick=()=>toggle(c.id);choices.append(b);}
  const point=p=>positions[p.id]||p;
  const all=bars.flatMap(c=>[point(c.p1),point(c.p2)]),pad=Math.max(20,...bars.map(c=>memberStock(c).widthMm));
  const xs=all.map(p=>p.x),ys=all.map(p=>p.y),x=Math.min(...xs)-pad,y=Math.min(...ys)-pad,w=Math.max(...xs)-x+pad,h=Math.max(...ys)-y+pad;
  svg.setAttribute('viewBox',[x,-y-h,w,h].join(' '));
  const ring=ps=>ps.map((p,i)=>(i?'L':'M')+p.x+','+(-p.y)).join(' ')+'Z';
  function render(){
    plan=planBarFusion(comps,[...selected],params,settings,positions);
    status.textContent=plan.ok?'已選 '+selected.size+' 支 → 合成一片；內部角度固定。':plan.reason;
    confirm.disabled=!plan.ok;svg.replaceChildren();
    if(plan.ok){const g=worldFusionGeometry(plan,positions),path=document.createElementNS(NS,'path');path.setAttribute('d',[...g.outlines,...g.cutouts.map(c=>c.points),...g.holes.map(h=>Array.from({length:32},(_,i)=>({x:h.x+h.r*Math.cos(i*Math.PI/16),y:h.y+h.r*Math.sin(i*Math.PI/16)})))].map(ring).join(' '));path.setAttribute('fill','#aedccc');path.setAttribute('fill-rule','evenodd');path.setAttribute('stroke','#236e5e');svg.append(path);}
    for(const c of bars){const a=point(c.p1),b=point(c.p2),line=document.createElementNS(NS,'line');
      for(const [key,value] of Object.entries({x1:a.x,y1:-a.y,x2:b.x,y2:-b.y,stroke:selected.has(c.id)?'#268878':'#a9b9bf','stroke-width':memberStock(c).widthMm,'stroke-linecap':'round','stroke-opacity':plan.ok&&selected.has(c.id)?'.18':'.65'}))line.setAttribute(key,value);
      line.setAttribute('role','button');line.setAttribute('aria-label','選取連桿 '+(c.name||c.id));line.style.cursor='pointer';line.addEventListener('click',()=>toggle(c.id));svg.append(line);
    }
    for(const b of choices.querySelectorAll('button'))b.setAttribute('aria-pressed',String(selected.has(b.dataset.id)));
  }
  confirm.onclick=()=>{if(!plan.ok)return;const error=onConfirm([...selected]);if(error){status.textContent=error;confirm.disabled=true;}else dialog.close();};
  dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);render();dialog.showModal();
}
