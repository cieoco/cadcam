import {blankGeometry,isOutputBlank,isStandardBar} from './standard-blank.js';
import {inspectLinkExport} from './exporters.js';
import {tabNutPath} from './tab-nut-view.js';
import {inspectBarFusion,worldFusionGeometry} from './bar-fusion-geometry.js';
/**
 * blocks / mechanism-layer-render
 *
 * 可見連桿與節點互動層的 SVG 建立／更新。
 */

import { isDisk, diskOutline } from './disk-plate.js';
import { memberStock } from './member-stock.js';
import {diskOrientationMark} from './disk-orientation.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const svgEl = tag => document.createElementNS(SVG_NS, tag);

export function renderLinks({ links, comps, points, triangleEdgeKeys, isGroundBar, selectedLinkId, pickBars, interactionBlocked,
  onTryPick, onFreeDrag, onSelect, groupForLayer, linkLayer, groundIds, hullRadius, scale, barHullPath, project,
  hostedMounts, inspectHostedFrame, registerUpdate, holeRadius = hullRadius * 0.72, params = {}, exportSettings = {}, tabNutGeometry = {}, connectionExtras=null }) {
  const linksToDraw = [...links].sort((a, b) => (a.style === 'crank' ? 1 : 0) - (b.style === 'crank' ? 1 : 0));
  const eligible = linksToDraw.filter(link => !link.hidden && !triangleEdgeKeys.has([link.p1, link.p2].sort().join('|')) && (!isGroundBar(link)||comps.some(c=>c.id===link.id&&isDisk(c))));
  const countMissing = current => eligible.reduce((count, link) => {
    const a = current[link.p1], b = current[link.p2];
    return count + (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(b.x) ? 1 : 0);
  }, 0);
  eligible.forEach(link => {
    const selected = link.id && (link.id === selectedLinkId || comps.some(c=>c.id===selectedLinkId&&c.barFusionRoot===link.id));
    const component = comps.find(comp => comp.id === link.id && comp.type === 'bar');
    const editable = component?.fixedLen;
    const fusion=component?.barFusion && inspectBarFusion(comps,component,params,exportSettings,connectionExtras);
    const radius = component ? memberStock(component).widthMm / 2 : hullRadius;
    const pickCandidate = pickBars && pickBars.ids.includes(link.id);
    const color = pickCandidate ? '#f39c12' : (selected ? '#e67e22' : (link.style === 'crank' ? '#e74c3c' : (link.color || '#3498db')));
    const stick = svgEl('path');
    stick.setAttribute('fill', color + '33'); stick.setAttribute('stroke', color); stick.setAttribute('stroke-width', selected || pickCandidate ? 2.5 : 2); stick.setAttribute('stroke-linejoin', 'round');
    if (pickCandidate) stick.setAttribute('stroke-dasharray', '10 7');
    if (editable || pickCandidate) {
      stick.setAttribute('data-pick-component', link.id);
      stick.setAttribute('data-link-id', link.id); stick.style.cursor = 'pointer';
      stick.addEventListener('pointerdown', event => {
        if (interactionBlocked()) return;
        event.stopPropagation();
        if (pickBars) { onTryPick(link.id); return; }
        if (onFreeDrag(event, link.id)) return;
        onSelect(link.id);
      });
    }
    const group = groupForLayer(linkLayer.get(link)); group.appendChild(stick);
    // 圓盤是旋轉對稱外形；方向線只供觀察轉角，不是加工槽。
    const diskDirection=isDisk(component)?svgEl('g'):null;
    if(diskDirection){
      diskDirection.style.pointerEvents='none';diskDirection.dataset.diskOrientation=link.id;
      for(const fill of ['#ffffff','#075985']){const ink=svgEl('path');ink.setAttribute('fill',fill);diskDirection.appendChild(ink);}
      diskDirection.setAttribute('aria-hidden','true');group.appendChild(diskDirection);
    }
    const outputHoles=isOutputBlank(component)?svgEl('g'):null;if(outputHoles){outputHoles.dataset.outputHorn=link.id;outputHoles.style.pointerEvents='none';group.appendChild(outputHoles);}
    const holes = [];
    [link.p1, link.p2].forEach(pointId => {
      if (groundIds.has(pointId)) return;
      const hole = svgEl('circle');
      hole.setAttribute('r', holeRadius * scale); hole.setAttribute('fill', 'none'); hole.setAttribute('stroke', color); hole.setAttribute('stroke-width', 1.5); hole.setAttribute('stroke-opacity', 0.7); hole.style.pointerEvents = 'none';
      group.appendChild(hole); holes.push({ element: hole, pointId });
    });
    const mounts = link.id ? hostedMounts.get(link.id) : null;
    const hostedPath = (a, b, current) => {
      // The carrier link moves during animation.  Its mount definition is
      // created when draw() starts, so refresh each mount centre from the
      // current solved point before regenerating the combined outline.  Using
      // the initial centre here left the old M2 cutout behind as a ghost.
      const liveMounts = mounts.map(mount => {
        const center = mount?.pointId && current[mount.pointId];
        return center && Number.isFinite(center.x) ? { ...mount, center } : mount;
      });
      const geometry = inspectHostedFrame([a, b], liveMounts, component);
      if (!geometry || !geometry.outlines.length) return null;
      const ring = polygon => 'M ' + polygon.map(point => { const p = project(point); return `${p.x.toFixed(2)} ${p.y.toFixed(2)}`; }).join(' L ') + ' Z';
      stick.setAttribute('fill-rule', 'evenodd');
      return [...geometry.outlines, ...(geometry.cutouts || []).map(cutout => cutout.points)].map(ring).join(' ');
    };
    const update = current => {
      const a = current[link.p1], b = current[link.p2];
      const valid = a && b && Number.isFinite(a.x) && Number.isFinite(b.x);
      stick.style.display = valid ? '' : 'none'; holes.forEach(hole => { hole.element.style.display = valid ? '' : 'none'; });
      if(diskDirection){
        diskDirection.style.display=valid?'':'none';
        if(valid){
          const fixed=groundIds.has(link.p1)&&groundIds.has(link.p2),start=project(a),end=project(fixed?{x:a.x,y:a.y+1}:b),rim=project({x:a.x+component.diameterMm/2,y:a.y});
          const mark=diskOrientationMark(Math.hypot(rim.x-start.x,rim.y-start.y),fixed,Math.atan2(end.y-start.y,end.x-start.x));
          [mark.outline,mark.ink].forEach((rings,i)=>diskDirection.children[i].setAttribute('d',rings.map(r=>'M '+r.map(p=>`${start.x+p.x},${start.y+p.y}`).join(' L ')+' Z').join(' ')));
        }
      }
      if (!valid) return;
      const tabPath=component&&tabNutPath(tabNutGeometry[component.id],component,current,project);
      if(isDisk(component)){stick.setAttribute('d','M '+diskOutline(component,a).map(p=>{const q=project(p);return q.x+','+q.y;}).join(' L ')+' Z');}
      else if(isOutputBlank(component)||isStandardBar(component)&&!tabPath&&!fusion?.ok&&!mounts?.length){const r=blankGeometry(component,[a,b]),path=ps=>'M '+ps.map(p=>{const q=project(p);return q.x+','+q.y;}).join(' L ')+' Z';stick.setAttribute('d',path(r));}
      else if(tabPath){stick.setAttribute('fill-rule','evenodd');stick.setAttribute('d',tabPath);}
      else if(fusion?.ok){
        const g=worldFusionGeometry(fusion,current),ring=ps=>'M '+ps.map(p=>{const q=project(p);return q.x+','+q.y;}).join(' L ')+' Z';
        const drilling=g.holes.filter(h=>['ADAPTER_HOLE','MOUNT_BOLT'].includes(h.layer)).map(h=>Array.from({length:32},(_,i)=>({x:h.x+h.r*Math.cos(i*Math.PI/16),y:h.y+h.r*Math.sin(i*Math.PI/16)})));
        stick.setAttribute('fill-rule','evenodd');stick.setAttribute('d',[...g.outlines,...g.cutouts.map(c=>c.points),...drilling].map(ring).join(' '));
      }else stick.setAttribute('d', mounts?.length ? (hostedPath(a, b, current) || barHullPath(a, b, radius)) : barHullPath(a, b, radius));
      if(outputHoles){outputHoles.replaceChildren();const L=Math.hypot(b.x-a.x,b.y-a.y),ux=(b.x-a.x)/L,uy=(b.y-a.y)/L,g=inspectLinkExport(component,L,exportSettings);for(const h of g.holes.filter(h=>/^(MG995_HORN|TT_HUB|N20_HUB)/.test(h.layer))){const p=project({x:a.x+h.x*ux-h.y*uy,y:a.y+h.x*uy+h.y*ux}),circle=svgEl('circle');for(const[k,v]of Object.entries({cx:p.x,cy:p.y,r:h.r*scale,fill:'white',stroke:color,'stroke-width':1}))circle.setAttribute(k,v);outputHoles.appendChild(circle);}for(const cut of g.cutouts.filter(c=>c.layer==='TT_SHAFT_FLAT')){const path=svgEl('path');path.setAttribute('d','M '+cut.points.map(h=>{const p=project({x:a.x+h.x*ux-h.y*uy,y:a.y+h.x*uy+h.y*ux});return `${p.x},${p.y}`;}).join(' L ')+' Z');path.setAttribute('fill','white');path.setAttribute('stroke',color);path.setAttribute('data-output-shaft',link.id);outputHoles.appendChild(path);}}
      holes.forEach(hole => { const point = current[hole.pointId]; if (point && Number.isFinite(point.x)) { const p = project(point); hole.element.setAttribute('cx', p.x); hole.element.setAttribute('cy', p.y); } });
    };
    update(points); registerUpdate(update);
  });
  return { linksToDraw, countMissing };
}

export function renderNodes({ points, svg, groundIds, motorCenterIds, camCenterIds, hiddenPointIds, unusedIds = new Set(), holeRadii = new Map(), gearPinIds, pulleyPinIds, camFollowerIds,
  workpieceIds, dragId, sliderMountInfo, project, onPointerDown, registerUpdate, mountedBaseIds = new Set(), shaftCenterIds = new Set(), touchTargets = false, pointLabel = id => id }) {
  const size = 14;
  Object.keys(points).sort((a,b)=>unusedIds.has(b)-unusedIds.has(a)).forEach(id => {
    if (hiddenPointIds.has(id) || gearPinIds.has(id) || pulleyPinIds.has(id) || camFollowerIds.has(id) || workpieceIds.has(id)) return;
    const ground = groundIds.has(id), motor = motorCenterIds.has(id), cam = camCenterIds.has(id), mount = sliderMountInfo(id);
    const rectangle = ground && !motor && !cam && !mount;
    // 已安裝模組的固定孔：鎖在宿主上，畫成虛線圓環而非地錨方塊。
    const mountedBase = rectangle && mountedBaseIds.has(id);
    // 可點區使用螢幕像素；實際孔圈另依毫米投影，不因縮小而失去點選範圍。
    const physicalRadius=holeRadii.get(id), physical=Number.isFinite(physicalRadius)&&physicalRadius>0&&!rectangle&&!motor&&!cam;
    const touchHit = touchTargets || physical ? svgEl('circle') : null;
    if (touchHit) {
      touchHit.setAttribute('fill', motor ? 'rgba(231,76,60,0.08)' : 'transparent');
      touchHit.setAttribute('stroke', motor ? 'rgba(146,43,33,0.45)' : 'none');
      touchHit.setAttribute('stroke-width', 1);
      touchHit.setAttribute(motor ? 'data-motor-hit' : 'data-id', id);
      touchHit.setAttribute('data-node-hit', id);
      touchHit.setAttribute('role', 'button');
      const label=pointLabel(id);
      touchHit.setAttribute('aria-label', motor ? `動力軸心 ${label}：設定馬達或伺服角度` : label.startsWith('接點 ')?label:`接點 ${label}`);
      touchHit.style.pointerEvents = 'all'; touchHit.style.cursor = 'pointer';
      touchHit.addEventListener('pointerdown', event => onPointerDown(event, id));
      svg.appendChild(touchHit);
    }
    const node = svgEl((rectangle && !mountedBase) ? 'rect' : 'circle');
    if (cam) { node.setAttribute('r', id === dragId ? 7 : 5); node.setAttribute('fill', '#fff'); node.setAttribute('stroke', '#9b59b6'); node.setAttribute('stroke-width', 2.4); }
    else if (motor) { node.setAttribute('r', id === dragId ? 8 : 6); node.setAttribute('fill', '#e74c3c'); node.setAttribute('stroke', '#922b21'); node.setAttribute('stroke-width', 2); }
    else if (mount) { node.setAttribute('r', id === dragId ? 9 : 7); node.setAttribute('fill', '#f8fafc'); node.setAttribute('stroke', id === dragId ? '#2ecc71' : '#34495e'); node.setAttribute('stroke-width', 3); const title = svgEl('title'); title.textContent = `${mount.label} 固定孔：承載滑軌桿件的端點，可拖曳或吸附到其他接點`; node.appendChild(title); }
    else if (mountedBase) { node.setAttribute('r', id === dragId ? 9 : 7); node.setAttribute('fill', '#eef6ff'); node.setAttribute('stroke', id === dragId ? '#2ecc71' : '#2c6fbb'); node.setAttribute('stroke-width', 3); node.setAttribute('stroke-dasharray', '3 2'); const title = svgEl('title'); title.textContent = '安裝孔：鎖在宿主模組上（隨宿主移動）'; node.appendChild(title); }
    else if (rectangle) { node.setAttribute('width', size); node.setAttribute('height', size); node.setAttribute('rx', 3); node.setAttribute('fill', '#34495e'); }
    else { node.setAttribute('r', id === dragId ? 9 : 7); node.setAttribute('fill', '#fff'); node.setAttribute('stroke', id === dragId ? '#2ecc71' : '#34495e'); node.setAttribute('stroke-width', 3); }
    if(motor&&shaftCenterIds.has(id)){node.setAttribute('fill','transparent');node.setAttribute('r',10);}
    if (unusedIds.has(id)) node.setAttribute('data-unused', '');   // 未加工格孔：淡化（樣式在 blocks.html）
    node.setAttribute('data-id', id); if (motor && touchHit) node.setAttribute('data-motor-hit', id);
    node.style.cursor = 'grab'; node.addEventListener('pointerdown', event => onPointerDown(event, id)); svg.appendChild(node);
    const update = current => {
      const point = current[id], valid = point && Number.isFinite(point.x) && Number.isFinite(point.y);
      node.style.display = valid ? '' : 'none'; if (touchHit) touchHit.style.display = node.style.display;
      if (!valid) return;
      const p = project(point);
      if(physical){
        const rim=project({x:point.x+physicalRadius,y:point.y}),r=Math.hypot(rim.x-p.x,rim.y-p.y);
        node.setAttribute('r',r);node.style.strokeWidth=String(r*.2);node.setAttribute('data-hole-diameter-mm',physicalRadius*2);
      }
      if (rectangle && !mountedBase) { node.setAttribute('x', p.x - size / 2); node.setAttribute('y', p.y - size / 2); }
      else { node.setAttribute('cx', p.x); node.setAttribute('cy', p.y); }
      if (touchHit) {
        const ctm = svg.getScreenCTM?.(), screenScale = ctm ? Math.hypot(ctm.a, ctm.b) : 1;
        touchHit.setAttribute('cx', p.x); touchHit.setAttribute('cy', p.y);
        touchHit.setAttribute('r', (touchTargets ? 24 : 9) / (screenScale || 1));
      }
    };
    update(points); registerUpdate(update);
  });
}
