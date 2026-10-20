import { S } from './state.js';
import { transformFusion } from './part-fusion.js';

const NS='http://www.w3.org/2000/svg';
export function drawFusion({svg, fusion, points, project, select, blocked=()=>false}) {
  const path=document.createElementNS(NS,'path');
  path.setAttribute('fill',fusion.gear.color || '#ef9852');
  path.setAttribute('fill-opacity','.55');
  path.setAttribute('stroke',fusion.gear.color || '#c36725');
  path.setAttribute('stroke-width','1.5');
  path.setAttribute('fill-rule','evenodd');
  path.dataset.fusionPart=fusion.plate.id;
  path.setAttribute('data-pick-component', fusion.plate.id);
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

/** Load editing controls when a part is selected; rendering stays synchronous. */
export function createFusionEditor(options) {
  let editor,pending;
  return {sync(){
    if(editor){editor.sync();return;}
    if(pending || !(S.selectedTriangleId || S.selectedGearId || S.selectedLinkId))return;
    pending=import('./fusion-controls.js').then(m=>{editor=m.createFusionEditor(options);editor.sync();})
      .catch(()=>options.notify?.('合成工具載入失敗，請重新選取零件。')).finally(()=>{pending=null;});
  }};
}
