/**
 * blocks / plate-render
 *
 * 三點桿、結構板與自訂造形點的 SVG 呈現。
 * 不持有 Blocks 狀態；選取、拖曳與刪除行為由 app 注入。
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const svgEl = tag => document.createElementNS(SVG_NS, tag);

function drawShapeHandles({ component, ids, points, svg, scale, project, vertices, localToWorld, interactionBlocked, onDrag, onDelete, registerUpdate }) {
  vertices(component).forEach((vertex, index) => {
    if (vertex.solve) return;
    const handle = svgEl('circle');
    handle.setAttribute('r', 6);
    handle.setAttribute('stroke', '#e67e22');
    handle.setAttribute('stroke-width', 2);
    handle.style.cursor = 'move';
    const title = svgEl('title');
    title.textContent = '造形點：點一下切換是否鑽孔、拖曳移動、右鍵刪除';
    handle.appendChild(title);
    const update = current => {
      const a = current[ids[0]], b = current[ids[1]];
      const world = a && b ? localToWorld([a, b], vertex) : null;
      const valid = world && Number.isFinite(world.x) && Number.isFinite(world.y);
      handle.style.display = valid ? '' : 'none';
      if (valid) { const p = project(world); handle.setAttribute('cx', p.x); handle.setAttribute('cy', p.y); }
      handle.setAttribute('fill', vertex.hole === true ? '#e67e22' : '#fff');
    };
    handle.addEventListener('pointerdown', event => {
      if (interactionBlocked()) return;
      event.stopPropagation();
      onDrag(event, component.id, index);
    });
    handle.addEventListener('contextmenu', event => {
      event.preventDefault(); event.stopPropagation();
      onDelete(component.id, index);
    });
    update(points);
    svg.appendChild(handle);
    registerUpdate(update);
  });
}

export function drawPlate({ component, points, ctx, svg, scale, project, selectedId, interactionBlocked, onSelect, shapeMode, plateExtras, platePath, roundedPath, vertices, localToWorld, onShapeDrag, onDeleteShapeVertex, registerUpdate }) {
  if (!component.p1 || !component.p2 || !component.p3) return;
  const ids = [component.p1.id, component.p2.id, component.p3.id];
  const path = svgEl('path');
  const color = component.color || '#27ae60';
  const selected = component.id === selectedId;
  path.setAttribute('fill', color + '33');
  path.setAttribute('stroke', selected ? '#e67e22' : color);
  path.setAttribute('stroke-width', selected ? 3.2 : 2.5);
  path.setAttribute('stroke-linejoin', 'round');
  path.style.cursor = 'pointer';
  path.addEventListener('pointerdown', event => {
    if (interactionBlocked()) return;
    event.stopPropagation();
    onSelect(component.id);
  });
  const hubs = [];
  if (shapeMode(component) === 'polyline') {
    [component.p1, component.p2, component.p3].forEach(point => {
      if (!point || point.type !== 'fixed') return;
      const hub = svgEl('circle');
      hub.setAttribute('fill', color + '59');
      hub.setAttribute('stroke', selected ? '#e67e22' : color);
      hub.setAttribute('stroke-width', 2.5);
      hub.style.pointerEvents = 'none';
      hubs.push({ element: hub, id: point.id });
    });
  }
  if (plateExtras) path.setAttribute('fill-rule', 'evenodd');
  if (component.shape === 'jaw') {
    path.setAttribute('fill', (component.color || '#ff7043') + '26');
    path.setAttribute('stroke-linejoin', 'round');
  }
  const update = current => {
    const worldPoints = ids.map(id => current[id]);
    const valid = worldPoints.every(point => point && Number.isFinite(point.x) && Number.isFinite(point.y));
    path.style.display = valid ? '' : 'none';
    if (valid) path.setAttribute('d', platePath(component, worldPoints, plateExtras) || roundedPath(...worldPoints));
    hubs.forEach(hub => {
      const point = current[hub.id];
      const hubValid = valid && point && Number.isFinite(point.x) && Number.isFinite(point.y);
      hub.element.style.display = hubValid ? '' : 'none';
      if (hubValid) { const p = project(point); hub.element.setAttribute('cx', p.x); hub.element.setAttribute('cy', p.y); hub.element.setAttribute('r', Math.max(8, 15 * scale)); }
    });
  };
  update(points);
  const group = ctx.groupForLayer(ctx.triLayerByKey.get(ctx.triKey(ids)));
  group.appendChild(path);
  hubs.forEach(hub => group.appendChild(hub.element));
  registerUpdate(update);
  if (selected) drawShapeHandles({ component, ids, points, svg, scale, project, vertices, localToWorld, interactionBlocked, onDrag: onShapeDrag, onDelete: onDeleteShapeVertex, registerUpdate });
}
