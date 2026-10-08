import { S } from './state.js';
import { inspectFusion } from './exporters.js';
import { fusionCandidates, transformFusion } from './part-fusion.js';

const NS='http://www.w3.org/2000/svg';
export function drawFusion({svg, fusion, points, project, select, blocked=()=>false}) {
  const path=document.createElementNS(NS,'path');
  path.setAttribute('fill',fusion.gear.color || '#ef9852');
  path.setAttribute('fill-opacity','.55');
  path.setAttribute('stroke',fusion.gear.color || '#c36725');
  path.setAttribute('stroke-width','1.5');
  path.setAttribute('fill-rule','evenodd');
  path.dataset.fusionPart=fusion.plate.id;
  path.style.cursor='pointer';
  path.addEventListener('pointerdown',e=>{if(blocked())return;e.stopPropagation();select(fusion.plate.id);});
  svg.appendChild(path);
  const ring=ps=>ps.map((p,i)=>{const q=project(p);return `${i?'L':'M'}${q.x},${q.y}`;}).join(' ')+' Z';
  const update=pts=>{
    const valid=[fusion.gear.p1.id,fusion.gear.p2.id].every(id=>Number.isFinite(pts[id]?.x)&&Number.isFinite(pts[id]?.y));
    path.style.display=valid?'':'none';if(!valid)return;
    const g=transformFusion(fusion.geometry,fusion.gear,pts);
    const holes=g.holes.map(h=>Array.from({length:40},(_,i)=>({x:h.x+h.r*Math.cos(i*Math.PI/20),y:h.y+h.r*Math.sin(i*Math.PI/20)})));
    path.setAttribute('d',[g.outline,...holes,...g.cutouts.map(c=>c.points)].map(ring).join(' '));
  };
  update(points);return update;
}

/** Reuses the original editors; only the manufacturing relationship is changed. */
export function createFusionEditor({settings,pause,pushUndo,rebuild,draw,save,selectGear,selectTriangle}) {
  const hosts=['lenEditor','gearEditor'];
  const change=(plate,gear)=>{
    pause();pushUndo();
    if(gear)plate.fusedWith=gear.id;else delete plate.fusedWith;
    rebuild();draw();save();
  };
  let lastKey='',lastSelected=null;
  function sync() {
    const selected=S.comps.find(c=>c.id===(S.selectedTriangleId || S.selectedGearId));
    const key=JSON.stringify([selected?.id,S.comps.filter(c=>c.type==='triangle').map(p=>[p.id,p.fusedWith,p.fusedWith?inspectFusion(S.comps,p,S.topo.params,settings()).reason:fusionCandidates(S.comps,p).map(g=>[g.id,inspectFusion(S.comps,{...p,fusedWith:g.id},S.topo.params,settings()).reason])])]);
    if(key===lastKey && selected===lastSelected)return;
    lastKey=key;lastSelected=selected;
    hosts.forEach(id=>document.getElementById(id)?.querySelector('[data-fusion-controls]')?.remove());
    if(!selected)return;
    const plates=selected.type==='triangle'?[selected]:S.comps.filter(p=>p.type==='triangle' && (p.fusedWith===selected.id || fusionCandidates(S.comps,p).includes(selected)));
    if(!plates.length)return;
    const host=document.getElementById(selected.type==='triangle'?'lenEditor':'gearEditor');
    if(!host)return;
    const box=document.createElement('div');box.dataset.fusionControls='';
    box.style.cssText='flex-basis:100%;display:flex;flex-wrap:wrap;gap:8px;padding:8px 0;border-top:1px solid #dae4ea;order:-1';
    const button=(label,action)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.style.cssText='min-height:44px;padding:8px 12px;border:1px solid #c8d9df;border-radius:10px;background:#f1f8f7;color:#205b55;font:inherit;cursor:pointer';b.onclick=action;box.append(b);return b;};
    for(const plate of plates) {
      if(plate.fusedWith) {
        const f=inspectFusion(S.comps,plate,S.topo.params,settings());
        const title=document.createElement('div');title.style.cssText='width:100%;font-size:13px';
        title.textContent=f.ok?'已合成一片 · 參數可繼續修改':`合成需調整：${f.reason}`;box.append(title);
        if(selected.type!=='gear')button('齒輪設定',()=>selectGear(plate.fusedWith));
        if(selected.type==='gear')button('夾爪／板件設定',()=>selectTriangle(plate.id));
        button('解除合成',()=>change(plate,null));
        if(f.ok && f.warnings.length){const note=document.createElement('small');note.className='fusion-warning';note.textContent=f.warnings[0];box.append(note);}
      } else {
        const candidates=fusionCandidates(S.comps,plate).filter(g=>selected.type!=='gear'||g.id===selected.id);
        for(const gear of candidates) {
          const f=inspectFusion(S.comps,{...plate,fusedWith:gear.id},S.topo.params,settings());
          const b=button('合成一片',()=>change(plate,gear));b.disabled=!f.ok;
          b.title=f.ok?'齒輪與板件合成，保留參數；可復原或解除':f.reason;
          if(!f.ok){const note=document.createElement('small');note.textContent=f.reason;box.append(note);}
        }
      }
    }
    if(box.childNodes.length) {
      if(host.id==='lenEditor')host.querySelector('.le-row').after(box);
      else host.prepend(box);
    }
  }
  return {sync};
}
