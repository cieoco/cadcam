/**
 * blocks / transmission-render
 *
 * 齒輪以外的傳動 SVG 畫法。呼叫端注入座標投影與參數讀取，
 * 本模組因此不持有 Blocks 狀態，也不依賴 app.js。
 */

import { buildOpenBeltPath } from './transmission-geometry.js';
import { createRackPath } from '../utils/gear-geometry.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const svgEl = tag => document.createElementNS(SVG_NS, tag);

export function drawPulley({ component, points, svg, scale, project, radius, pinRadius }) {
  if (!component.p1 || !component.p2) return null;
  const R = radius(component);
  const pinR = pinRadius(component, R);
  const color = component.color || '#d35400';
  const group = svgEl('g');
  const add = (tag, attrs) => {
    const el = svgEl(tag);
    Object.entries(attrs).forEach(([name, value]) => el.setAttribute(name, value));
    group.appendChild(el);
  };
  add('circle', { r: Math.max(1, R * scale), fill: color + '26', stroke: color, 'stroke-width': Math.max(1.8, 2.4 * scale) });
  add('circle', { r: Math.max(1, (R - 3) * scale), fill: 'none', stroke: '#7f4a17', 'stroke-width': Math.max(0.9, 1.2 * scale), opacity: '0.55' });
  add('line', { x1: '0', y1: '0', x2: (pinR * scale).toFixed(2), y2: '0', stroke: color, 'stroke-width': Math.max(1.2, 1.8 * scale), 'stroke-linecap': 'round' });
  add('circle', { r: Math.max(3, 4 * scale), fill: '#ffffff', stroke: color, 'stroke-width': Math.max(1.4, 1.8 * scale) });
  svg.appendChild(group);
  const bolt = svgEl('circle');
  bolt.setAttribute('r', Math.max(2.5, 3.6 * scale));
  bolt.setAttribute('fill', '#ffffff');
  bolt.setAttribute('stroke', color);
  bolt.setAttribute('stroke-width', Math.max(1.3, 1.8 * scale));
  bolt.style.pointerEvents = 'none';
  svg.appendChild(bolt);

  const update = current => {
    const center = current[component.p1.id], pin = current[component.p2.id];
    const valid = center && pin && Number.isFinite(center.x) && Number.isFinite(pin.x);
    group.style.display = valid ? '' : 'none';
    bolt.style.display = valid ? '' : 'none';
    if (!valid) return;
    const deg = Math.atan2(pin.y - center.y, pin.x - center.x) * 180 / Math.PI;
    const c = project(center), p = project(pin);
    group.setAttribute('transform', `translate(${c.x} ${c.y}) rotate(${-deg})`);
    bolt.setAttribute('cx', p.x);
    bolt.setAttribute('cy', p.y);
  };
  update(points);
  return update;
}

export function drawBelt({ component, points, comps, theta, svg, scale, project, radius }) {
  const driver = component.driver ? comps.find(part => part.type === 'pulley' && part.id === component.driver) : null;
  const driven = component.driven ? comps.find(part => part.type === 'pulley' && part.id === component.driven) : null;
  if (!driver?.p1 || !driven?.p1) return null;
  const color = component.color || '#2c3e50';
  const path = svgEl('path');
  const motion = svgEl('path');
  [[path, { fill: 'none', stroke: color, 'stroke-width': Math.max(2.8, 4.4 * scale), 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: '0.82' }],
   [motion, { fill: 'none', stroke: '#f8fafc', 'stroke-width': Math.max(0.8, 1.2 * scale), 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': `${(5 * scale).toFixed(1)},${(13 * scale).toFixed(1)}`, opacity: '0.62' }]]
    .forEach(([el, attrs]) => { Object.entries(attrs).forEach(([name, value]) => el.setAttribute(name, value)); el.style.pointerEvents = 'none'; svg.appendChild(el); });
  const update = current => {
    const a = current[driver.p1.id], b = current[driven.p1.id];
    const valid = a && b && Number.isFinite(a.x) && Number.isFinite(b.x);
    path.style.display = valid ? '' : 'none'; motion.style.display = valid ? '' : 'none';
    if (!valid) return;
    const d = buildOpenBeltPath(a, radius(driver), b, radius(driven), project);
    path.style.display = d ? '' : 'none'; motion.style.display = d ? '' : 'none';
    if (!d) return;
    path.setAttribute('d', d); motion.setAttribute('d', d);
    const beltTravel = radius(driver) * Number(theta()) * Math.PI / 180 * scale;
    motion.setAttribute('stroke-dashoffset', (-beltTravel).toFixed(2));
  };
  update(points);
  return update;
}

function drawRackSlot(parent, component, { length, module, bodyHeight, phaseShift, scale }) {
  if (!component.slot) return;
  const slot = typeof component.slot === 'object' ? component.slot : {};
  const bodyH = Math.max(4, Number(bodyHeight) || module * 2.5);
  const slotLen = Math.max(8, Math.min(length - module * 3, Number(slot.length) || Math.max(24, length - 32)));
  const slotW = Math.max(2, Math.min(bodyH * 0.7, Number(slot.width) || Math.max(4, module * 1.25)));
  const slotY = -module * 1.25 - bodyH / 2 + (Number(slot.offset) || 0);
  const x1 = (-slotLen / 2 + phaseShift) * scale, x2 = (slotLen / 2 + phaseShift) * scale;
  const y = -slotY * scale, r = slotW * scale / 2;
  const hole = svgEl('path');
  hole.setAttribute('d', [`M ${x1.toFixed(2)} ${(y-r).toFixed(2)}`, `L ${x2.toFixed(2)} ${(y-r).toFixed(2)}`, `A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${x2.toFixed(2)} ${(y+r).toFixed(2)}`, `L ${x1.toFixed(2)} ${(y+r).toFixed(2)}`, `A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${x1.toFixed(2)} ${(y-r).toFixed(2)}`, 'Z'].join(' '));
  hole.setAttribute('fill', '#f7fafc'); hole.setAttribute('stroke', '#5d6d7e'); hole.setAttribute('stroke-width', Math.max(1, 1.1 * scale)); hole.setAttribute('stroke-linejoin', 'round'); hole.style.pointerEvents = 'none'; parent.appendChild(hole);
  const guide = svgEl('line');
  [['x1', x1], ['y1', y], ['x2', x2], ['y2', y]].forEach(([name, value]) => guide.setAttribute(name, value.toFixed(2)));
  guide.setAttribute('stroke', '#95a5a6'); guide.setAttribute('stroke-width', Math.max(1, .7 * scale)); guide.setAttribute('stroke-dasharray', `${(3 * scale).toFixed(1)},${(3 * scale).toFixed(1)}`); guide.style.pointerEvents = 'none'; parent.appendChild(guide);
}

export function drawRack({ component, points, comps, svg, scale, project, params, bodyHeightFor, phaseShiftFor, onSelectGear }) {
  if (!component.p1) return null;
  const pinion = component.pinion ? comps.find(part => part.type === 'gear' && part.id === component.pinion) : null;
  const teeth = pinion ? Math.max(6, Math.round(Number(pinion.teeth) || 12)) : 12;
  const radius = pinion ? (Number(params[pinion.radiusParam]) || 40) : 40;
  const module = 2 * radius / teeth;
  const length = (Number(params[component.lenParam]) || 160) + 2 * (Number(component.endMargin) || 12);
  const bodyHeight = bodyHeightFor(component, module);
  const axisDeg = Number(component.axisDeg) || 0;
  const phaseShift = phaseShiftFor(component, pinion, { length, module, teeth, axisDeg });
  const group = svgEl('g'), polygon = svgEl('polygon');
  polygon.setAttribute('points', createRackPath({ length, height: bodyHeight, module }).map(p => `${((p.x + phaseShift) * scale).toFixed(2)},${(-p.y * scale).toFixed(2)}`).join(' '));
  polygon.setAttribute('fill', (component.color || '#16a085') + '33');
  const selected = pinion && pinion.id === params.selectedGearId;
  polygon.setAttribute('stroke-width', Math.max(1, (selected ? 2.4 : 1.4) * scale)); polygon.setAttribute('stroke-linejoin', 'round'); polygon.style.cursor = 'pointer';
  polygon.addEventListener('pointerdown', event => { if (!pinion) return; event.stopPropagation(); onSelectGear(pinion.id); });
  group.appendChild(polygon); drawRackSlot(group, component, { length, module, bodyHeight, phaseShift, scale }); svg.appendChild(group);
  const update = current => {
    const ref = current[component.p1.id];
    const valid = ref && Number.isFinite(ref.x) && Number.isFinite(ref.y); group.style.display = valid ? '' : 'none'; if (!valid) return;
    let meshOff = false;
    if (pinion?.p1) { const center = current[pinion.p1.id] || pinion.p1; if (center && Number.isFinite(center.x)) { const a = axisDeg * Math.PI / 180, d = Math.abs((center.x-ref.x)*-Math.sin(a) + (center.y-ref.y)*Math.cos(a)); meshOff = Math.abs(d-radius) > Math.max(1, radius*.08); } }
    polygon.setAttribute('stroke', meshOff ? '#e74c3c' : (selected ? '#e67e22' : (component.color || '#16a085'))); polygon.setAttribute('stroke-dasharray', meshOff ? `${(4*scale).toFixed(1)},${(3*scale).toFixed(1)}` : '');
    const p = project(ref); group.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${-axisDeg})`);
  };
  update(points); return update;
}

// 齒輪輸出孔的較大拖曳命中區。繪製與互動外觀屬於傳動 UI，實際拖曳行為由 app 注入。
export function drawGearManualHandles({ gears, points, svg, scale, project, selectedGearId, onRotate, registerUpdate }) {
  gears.filter(gear => gear.p1 && gear.p2).forEach(gear => {
    const pinHoleRadius = Math.max(1, Number(gear.pinHoleDiameter) || 5) / 2;
    const group = svgEl('g'); group.style.cursor = 'grab';
    const hit = svgEl('circle'); hit.setAttribute('r', Math.max(13, pinHoleRadius * scale + 7)); hit.setAttribute('fill', 'transparent'); hit.setAttribute('stroke', 'none'); hit.addEventListener('pointerdown', event => onRotate(event, gear.id));
    const ring = svgEl('circle'); ring.setAttribute('r', Math.max(3.2, pinHoleRadius * scale)); ring.setAttribute('fill', '#ffffff'); ring.setAttribute('stroke', gear.id === selectedGearId ? '#e67e22' : (gear.color || '#b0772e')); ring.setAttribute('stroke-width', Math.max(1.8, 2.2 * scale)); ring.style.pointerEvents = 'none';
    const title = svgEl('title'); title.textContent = '拖曳旋轉齒輪輸出孔'; group.append(title, hit, ring); svg.appendChild(group);
    const update = current => { const pin = current[gear.p2.id]; const valid = pin && Number.isFinite(pin.x) && Number.isFinite(pin.y); group.style.display = valid ? '' : 'none'; if (valid) { const p = project(pin); group.setAttribute('transform', `translate(${p.x} ${p.y})`); } };
    update(points); registerUpdate(update);
  });
}
