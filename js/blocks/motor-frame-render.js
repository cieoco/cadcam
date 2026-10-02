/**
 * blocks / motor-frame-render
 *
 * 自動機架外形與馬達安裝孔的 SVG 呈現。幾何與設定由呼叫端提供。
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const svgEl = tag => document.createElementNS(SVG_NS, tag);

export function drawFrameGeometry({ nodes, frameGeometry, svg, project, drawBaseline }) {
  if (nodes.length < 2) drawBaseline();
  if (!frameGeometry || !frameGeometry.outlines.length) {
    if (nodes.length >= 2) drawBaseline();
    return;
  }
  frameGeometry.outlines.forEach(outline => {
    if (!Array.isArray(outline) || outline.length < 2) return;
    const plate = svgEl('polygon');
    plate.setAttribute('points', outline.map(point => { const p = project(point); return `${p.x},${p.y}`; }).join(' '));
    plate.setAttribute('fill', '#eef2f7'); plate.setAttribute('fill-opacity', '0.82'); plate.setAttribute('stroke', '#c2cad6'); plate.setAttribute('stroke-width', 2); plate.setAttribute('stroke-linejoin', 'round'); plate.style.pointerEvents = 'none';
    svg.appendChild(plate);
  });
  (frameGeometry.cutouts || []).forEach(cutout => {
    if (!Array.isArray(cutout.points) || cutout.points.length < 3) return;
    const hole = svgEl('polygon');
    hole.setAttribute('points', cutout.points.map(point => { const p = project(point); return `${p.x},${p.y}`; }).join(' '));
    hole.setAttribute('fill', '#f6f8fb'); hole.setAttribute('stroke', '#c2cad6'); hole.setAttribute('stroke-width', 2); hole.setAttribute('stroke-linejoin', 'round'); hole.style.pointerEvents = 'none';
    svg.appendChild(hole);
  });
}

// G1：已安裝模組的固定板（<id>-frame）外框與開口，畫法同世界機架板但更淡（填色更亮、描邊更細），在零件之下。
// plates：mountedFramePlates 的結果（已依目前視圖平面過濾）；getPlates(P)：播放時用新的點表重算（板跟著模組動）。
export function drawModulePlates({ plates, svg, project, getPlates, registerUpdate }) {
  const layer = svgEl('g'); layer.style.pointerEvents = 'none'; layer.setAttribute('data-module-plates', '1');
  svg.appendChild(layer);
  const poly = (points, fill, stroke, width) => {
    const el = svgEl('polygon');
    el.setAttribute('points', points.map(point => { const p = project(point); return `${p.x},${p.y}`; }).join(' '));
    el.setAttribute('fill', fill); el.setAttribute('stroke', stroke); el.setAttribute('stroke-width', width); el.setAttribute('stroke-linejoin', 'round');
    return el;
  };
  const render = list => {
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    (list || []).forEach(pl => {
      (pl.outlines || [pl.outline]).forEach(o => { if (Array.isArray(o) && o.length >= 3) layer.appendChild(poly(o, '#f5f8fc', '#d3dae4', 1.5)); });
      (pl.cutouts || []).forEach(c => { if (Array.isArray(c.points) && c.points.length >= 3) layer.appendChild(poly(c.points, '#fbfcfe', '#d3dae4', 1.5)); });
    });
  };
  render(plates);
  if (registerUpdate && getPlates) registerUpdate(P => render(getPlates(P)));
}

export function drawMotorMountHoles({ motorIds, motorMounts, points, svg, scale, project, motorTypeForCenter, rotationForCenter, ttSettings, mg995Settings, mg995SlotOutline, registerUpdate }) {
  const layer = svgEl('g'); layer.style.pointerEvents = 'none'; svg.appendChild(layer);
  const addHole = (group, xMm, yMm, diameterMm, attrs = {}) => {
    const hole = svgEl('circle');
    hole.setAttribute('cx', (xMm * scale).toFixed(2)); hole.setAttribute('cy', (-yMm * scale).toFixed(2)); hole.setAttribute('r', Math.max(1.5, diameterMm * scale / 2).toFixed(2));
    hole.setAttribute('fill', attrs.fill || '#ffffff'); hole.setAttribute('stroke', attrs.stroke || '#c0392b'); hole.setAttribute('stroke-width', attrs.strokeWidth || Math.max(1.2, 1.5 * scale));
    if (attrs.dash) hole.setAttribute('stroke-dasharray', attrs.dash);
    group.appendChild(hole);
  };
  motorIds.forEach(id => {
    const type = motorTypeForCenter(id), point = points[id];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    const group = svgEl('g');
    const update = current => {
      const livePoint = current[id];
      const valid = livePoint && Number.isFinite(livePoint.x) && Number.isFinite(livePoint.y);
      group.style.display = valid ? '' : 'none';
      if (!valid) return;
      const p = project(livePoint);
      group.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${rotationForCenter(id, current, motorMounts.get(id))})`);
    };
    update(points);
    const title = svgEl('title');
    if (type === 'mg995') {
      const settings = mg995Settings;
      title.textContent = 'MG995 機架固定：本體穿板槽（尾端線槽缺口）、兩耳共 4 個螺絲孔'; group.appendChild(title);
      const slot = svgEl('polygon');
      slot.setAttribute('points', mg995SlotOutline(settings).map(point => `${(point.x * scale).toFixed(2)},${(-point.y * scale).toFixed(2)}`).join(' '));
      slot.setAttribute('fill', 'none'); slot.setAttribute('stroke', '#e74c3c'); slot.setAttribute('stroke-width', Math.max(1.2, 1.5 * scale)); slot.setAttribute('stroke-linejoin', 'round'); group.appendChild(slot);
      const earX = settings.shaftOffsetMm - settings.bodyLengthMm / 2;
      [-1, 1].forEach(sx => [-1, 1].forEach(sy => addHole(group, earX + sx * settings.screwSpanMm / 2, sy * settings.screwSpacingMm / 2, settings.screwDiameterMm, { stroke: '#2c6fbb' })));
    } else {
      const settings = ttSettings;
      title.textContent = 'TT馬達機架固定孔：輸出軸孔、2 個螺絲孔、定位孔'; group.appendChild(title);
      addHole(group, 0, 0, settings.shaftDiameterMm, { stroke: '#e74c3c', strokeWidth: Math.max(1.5, 2 * scale) });
      addHole(group, settings.screwOffsetXMm, settings.screwSpacingMm / 2, settings.screwDiameterMm, { stroke: '#2c6fbb' });
      addHole(group, settings.screwOffsetXMm, -settings.screwSpacingMm / 2, settings.screwDiameterMm, { stroke: '#2c6fbb' });
      addHole(group, settings.locatorOffsetXMm, settings.locatorOffsetYMm, settings.locatorDiameterMm, { stroke: '#117a45', dash: `${Math.max(2, 3 * scale).toFixed(1)} ${Math.max(1.5, 2 * scale).toFixed(1)}` });
    }
    layer.appendChild(group);
    if (registerUpdate) registerUpdate(update);
  });
}
