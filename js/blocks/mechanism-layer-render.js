/**
 * blocks / mechanism-layer-render
 *
 * 可見連桿與節點互動層的 SVG 建立／更新。
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const svgEl = tag => document.createElementNS(SVG_NS, tag);

export function renderLinks({ links, comps, points, triangleEdgeKeys, isGroundBar, selectedLinkId, pickBars, interactionBlocked,
  onTryPick, onFreeDrag, onSelect, groupForLayer, linkLayer, groundIds, hullRadius, scale, barHullPath, project,
  hostedMounts, inspectHostedFrame, registerUpdate }) {
  const linksToDraw = [...links].sort((a, b) => (a.style === 'crank' ? 1 : 0) - (b.style === 'crank' ? 1 : 0));
  const eligible = linksToDraw.filter(link => !link.hidden && !triangleEdgeKeys.has([link.p1, link.p2].sort().join('|')) && !isGroundBar(link));
  const countMissing = current => eligible.reduce((count, link) => {
    const a = current[link.p1], b = current[link.p2];
    return count + (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(b.x) ? 1 : 0);
  }, 0);
  eligible.forEach(link => {
    const selected = link.id && link.id === selectedLinkId;
    const editable = link.id && comps.some(comp => comp.id === link.id && comp.type === 'bar' && comp.fixedLen);
    const pickCandidate = pickBars && pickBars.ids.includes(link.id);
    const color = pickCandidate ? '#f39c12' : (selected ? '#e67e22' : (link.style === 'crank' ? '#e74c3c' : (link.color || '#3498db')));
    const stick = svgEl('path');
    stick.setAttribute('fill', color + '33'); stick.setAttribute('stroke', color); stick.setAttribute('stroke-width', selected || pickCandidate ? 2.5 : 2); stick.setAttribute('stroke-linejoin', 'round');
    if (pickCandidate) stick.setAttribute('stroke-dasharray', '10 7');
    if (editable || pickCandidate) {
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
    const holes = [];
    [link.p1, link.p2].forEach(pointId => {
      if (groundIds.has(pointId)) return;
      const hole = svgEl('circle');
      hole.setAttribute('r', hullRadius * scale * 0.72); hole.setAttribute('fill', 'none'); hole.setAttribute('stroke', color); hole.setAttribute('stroke-width', 1.5); hole.setAttribute('stroke-opacity', 0.7); hole.style.pointerEvents = 'none';
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
      const geometry = inspectHostedFrame([a, b], liveMounts);
      if (!geometry || !geometry.outlines.length) return null;
      const ring = polygon => 'M ' + polygon.map(point => { const p = project(point); return `${p.x.toFixed(2)} ${p.y.toFixed(2)}`; }).join(' L ') + ' Z';
      stick.setAttribute('fill-rule', 'evenodd');
      return [...geometry.outlines, ...(geometry.cutouts || []).map(cutout => cutout.points)].map(ring).join(' ');
    };
    const update = current => {
      const a = current[link.p1], b = current[link.p2];
      const valid = a && b && Number.isFinite(a.x) && Number.isFinite(b.x);
      stick.style.display = valid ? '' : 'none'; holes.forEach(hole => { hole.element.style.display = valid ? '' : 'none'; });
      if (!valid) return;
      stick.setAttribute('d', mounts?.length ? (hostedPath(a, b, current) || barHullPath(a, b)) : barHullPath(a, b));
      holes.forEach(hole => { const point = current[hole.pointId]; if (point && Number.isFinite(point.x)) { const p = project(point); hole.element.setAttribute('cx', p.x); hole.element.setAttribute('cy', p.y); } });
    };
    update(points); registerUpdate(update);
  });
  return { linksToDraw, countMissing };
}

export function renderNodes({ points, svg, groundIds, motorCenterIds, camCenterIds, hiddenPointIds, gearPinIds, pulleyPinIds, camFollowerIds,
  workpieceIds, dragId, sliderMountInfo, project, onPointerDown, registerUpdate }) {
  const size = 14;
  Object.keys(points).forEach(id => {
    if (hiddenPointIds.has(id) || gearPinIds.has(id) || pulleyPinIds.has(id) || camFollowerIds.has(id) || workpieceIds.has(id)) return;
    const ground = groundIds.has(id), motor = motorCenterIds.has(id), cam = camCenterIds.has(id), mount = sliderMountInfo(id);
    const rectangle = ground && !motor && !cam && !mount;
    const node = svgEl(rectangle ? 'rect' : 'circle');
    if (cam) { node.setAttribute('r', id === dragId ? 7 : 5); node.setAttribute('fill', '#fff'); node.setAttribute('stroke', '#9b59b6'); node.setAttribute('stroke-width', 2.4); }
    else if (motor) { node.setAttribute('r', id === dragId ? 8 : 6); node.setAttribute('fill', '#e74c3c'); node.setAttribute('stroke', '#922b21'); node.setAttribute('stroke-width', 2); }
    else if (mount) { node.setAttribute('r', id === dragId ? 9 : 7); node.setAttribute('fill', '#f8fafc'); node.setAttribute('stroke', id === dragId ? '#2ecc71' : '#34495e'); node.setAttribute('stroke-width', 3); const title = svgEl('title'); title.textContent = `${mount.label} 固定孔：承載滑軌桿件的端點，可拖曳或吸附到其他接點`; node.appendChild(title); }
    else if (rectangle) { node.setAttribute('width', size); node.setAttribute('height', size); node.setAttribute('rx', 3); node.setAttribute('fill', '#34495e'); }
    else { node.setAttribute('r', id === dragId ? 9 : 7); node.setAttribute('fill', '#fff'); node.setAttribute('stroke', id === dragId ? '#2ecc71' : '#34495e'); node.setAttribute('stroke-width', 3); }
    node.setAttribute('data-id', id); node.style.cursor = 'grab'; node.addEventListener('pointerdown', event => onPointerDown(event, id)); svg.appendChild(node);
    const update = current => { const point = current[id], valid = point && Number.isFinite(point.x); node.style.display = valid ? '' : 'none'; if (!valid) return; const p = project(point); if (rectangle) { node.setAttribute('x', p.x - size / 2); node.setAttribute('y', p.y - size / 2); } else { node.setAttribute('cx', p.x); node.setAttribute('cy', p.y); } };
    update(points); registerUpdate(update);
  });
}
