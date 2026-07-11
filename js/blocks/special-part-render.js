/**
 * 特殊零件 SVG 繪製：凸輪與工作物件會逐步集中於此。
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const svgEl = tag => document.createElementNS(SVG_NS, tag);

export function drawCam({ component, points, svg, scale, project, params, theta, camRadius, camFollowerState }) {
  if (!component.p1 || !component.p2) return null;
  const baseRadius = Number(params[component.baseRadiusParam]) || 24;
  const lift = Number(params[component.liftParam]) || 24;
  const rollerRadius = Math.max(0, Number(component.rollerRadius) || 6);
  const color = component.color || '#9b59b6';
  const profilePoints = [];
  for (let i = 0; i < 128; i++) {
    const angle = i / 128 * Math.PI * 2;
    const radius = camRadius({ profile: component.profile, baseRadius, lift, angleRad: angle });
    profilePoints.push(`${(Math.cos(angle) * radius * scale).toFixed(2)},${(-Math.sin(angle) * radius * scale).toFixed(2)}`);
  }
  const axisDeg = Number(component.axisDeg) || 90;
  const axisRad = axisDeg * Math.PI / 180;
  const ux = Math.cos(axisRad), uy = Math.sin(axisRad);
  const group = svgEl('g');
  const halo = svgEl('polygon');
  halo.setAttribute('points', profilePoints.join(' ')); halo.setAttribute('fill', 'none'); halo.setAttribute('stroke', '#ffffff'); halo.setAttribute('stroke-width', Math.max(2.5, 4.5 * scale)); halo.setAttribute('stroke-linejoin', 'round'); halo.setAttribute('opacity', '0.8'); group.appendChild(halo);
  const body = svgEl('polygon');
  body.setAttribute('points', profilePoints.join(' ')); body.setAttribute('fill', color + '55'); body.setAttribute('stroke', '#8e44ad'); body.setAttribute('stroke-width', Math.max(1.8, 2.6 * scale)); body.setAttribute('stroke-linejoin', 'round'); group.appendChild(body);
  const hub = svgEl('circle');
  hub.setAttribute('r', Math.max(3, 4 * scale)); hub.setAttribute('fill', '#ffffff'); hub.setAttribute('stroke', color); hub.setAttribute('stroke-width', Math.max(1.4, 1.8 * scale)); group.appendChild(hub); svg.appendChild(group);

  const guide = svgEl('line');
  guide.setAttribute('stroke', '#8a96a3'); guide.setAttribute('stroke-width', Math.max(1.2, 1.8 * scale)); guide.setAttribute('stroke-linecap', 'round'); guide.setAttribute('stroke-dasharray', `${(5 * scale).toFixed(1)},${(4 * scale).toFixed(1)}`); guide.style.pointerEvents = 'none'; svg.appendChild(guide);
  const follower = svgEl('rect');
  follower.setAttribute('width', Math.max(12, 16 * scale)); follower.setAttribute('height', Math.max(8, 10 * scale)); follower.setAttribute('rx', Math.max(2, 2.5 * scale)); follower.setAttribute('fill', '#f8fafc'); follower.setAttribute('stroke', '#34495e'); follower.setAttribute('stroke-width', Math.max(1.5, 2 * scale)); follower.style.pointerEvents = 'none'; svg.appendChild(follower);
  const roller = svgEl('circle');
  roller.setAttribute('r', Math.max(3, rollerRadius * scale)); roller.setAttribute('fill', '#ffffff'); roller.setAttribute('stroke', '#34495e'); roller.setAttribute('stroke-width', Math.max(1.2, 1.6 * scale)); roller.style.pointerEvents = 'none'; svg.appendChild(roller);
  const contact = svgEl('line');
  contact.setAttribute('stroke', '#2c3e50'); contact.setAttribute('stroke-width', Math.max(1.2, 1.5 * scale)); contact.setAttribute('stroke-linecap', 'round'); contact.style.pointerEvents = 'none'; svg.appendChild(contact);

  const elements = [group, guide, follower, roller, contact];
  const update = current => {
    const center = current[component.p1.id], output = current[component.p2.id];
    const valid = center && output && Number.isFinite(center.x) && Number.isFinite(output.x);
    elements.forEach(element => { element.style.display = valid ? '' : 'none'; });
    if (!valid) return;
    const thetaDeg = (Number(theta()) || 0) + (Number(component.phase) || 0);
    const centerPx = project(center);
    group.setAttribute('transform', `translate(${centerPx.x} ${centerPx.y}) rotate(${-thetaDeg})`);
    const state = camFollowerState({ profile: component.profile, baseRadius, lift, thetaRad: thetaDeg * Math.PI / 180, axisRad, rollerRadius });
    const support = project({ x: center.x + state.support.x, y: center.y + state.support.y });
    const railBack = baseRadius + lift + 18, railFront = Math.max(8, baseRadius * 0.35);
    const guideStart = project({ x: center.x + ux * railFront, y: center.y + uy * railFront });
    const guideEnd = project({ x: center.x + ux * railBack, y: center.y + uy * railBack });
    guide.setAttribute('x1', guideStart.x); guide.setAttribute('y1', guideStart.y); guide.setAttribute('x2', guideEnd.x); guide.setAttribute('y2', guideEnd.y);
    const blockPoint = project({ x: output.x + ux * 12, y: output.y + uy * 12 });
    const followerWidth = Number(follower.getAttribute('width')) || 16, followerHeight = Number(follower.getAttribute('height')) || 10;
    follower.setAttribute('x', blockPoint.x - followerWidth / 2); follower.setAttribute('y', blockPoint.y - followerHeight / 2); follower.setAttribute('transform', `rotate(${-axisDeg} ${blockPoint.x} ${blockPoint.y})`);
    const outputPx = project(output);
    roller.setAttribute('cx', outputPx.x); roller.setAttribute('cy', outputPx.y);
    contact.setAttribute('x1', support.x); contact.setAttribute('y1', support.y); contact.setAttribute('x2', outputPx.x); contact.setAttribute('y2', outputPx.y);
  };
  update(points);
  return update;
}

export function drawWorkpiece({ component, points, comps, svg, scale, project, pulleyRadius, circleRectCompression }) {
  const point = points[component.p1?.id];
  if (!point) return;
  const width = Number(component.width) || 48, height = Number(component.height) || 48;
  const group = document.createElementNS(SVG_NS, 'g');
  const rect = document.createElementNS(SVG_NS, 'rect');
  const p = project(point);
  rect.setAttribute('x', p.x - width * scale / 2); rect.setAttribute('y', p.y - height * scale / 2);
  rect.setAttribute('width', width * scale); rect.setAttribute('height', height * scale); rect.setAttribute('rx', 8);
  rect.setAttribute('fill', (component.color || '#d97706') + '33'); rect.setAttribute('stroke', component.color || '#d97706'); rect.setAttribute('stroke-width', 2); group.appendChild(rect);
  const roller = comps.find(part => part.id === 'IntakeFrontRoller'); const rollerPoint = roller && points[roller.p1?.id];
  if (rollerPoint) { const result = circleRectCompression({ x: rollerPoint.x, y: rollerPoint.y, radius: pulleyRadius(roller) }, { x: point.x, y: point.y, width, height }); const text = document.createElementNS(SVG_NS, 'text'); text.setAttribute('x', p.x); text.setAttribute('y', p.y + 4); text.setAttribute('text-anchor', 'middle'); text.setAttribute('font-size', '12'); text.setAttribute('font-weight', '700'); text.setAttribute('fill', result.contact ? '#117a45' : '#b45309'); text.textContent = result.contact ? `壓縮 ${result.compression.toFixed(1)}mm` : '未接觸'; group.appendChild(text); }
  svg.appendChild(group);
}
