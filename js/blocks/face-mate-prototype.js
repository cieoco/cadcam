import { autoFitFaces } from './face-auto-fit.js?v=20261008_edgefit';
import { planFaceBrackets, FACE_BRACKET_SPEC } from './face-bracket-geometry.js?v=20261008_edgefit';
import { bracketLayout } from './bracket-layout.js';
/** 六面體組立操作原型；獨立記憶體草稿，不讀寫 blocks 作品。 */
import { boxFaces, solveFaceMate, transformMatePoint } from './face-mate.js';
import { realMountExamples } from './face-mate-examples.js';
import { buildFacePlacement } from './face-placement.js';

const $ = id => document.getElementById(id);
const names = { top: '上面', bottom: '下面', front: '前面', back: '後面', left: '左面', right: '右面' };
const symbols = { top: '↑', bottom: '↓', front: '●', back: '○', left: '←', right: '→' };
const faceOrder = ['top', 'bottom', 'front', 'back', 'left', 'right'];
const integrated = new URLSearchParams(location.search).get('integrated') === '1';
let { hosts, children } = realMountExamples();
const initial = { host: 0, child: 0, hostFace: 'top', childFace: 'bottom', alignU: 0, alignV: 0, offsetU: 0, offsetV: 0, gap: 0, quarterTurns: 0 };
let draft = { ...initial }, saved = { ...initial }, step = 0;
let mode = 'wizard';
let hasConfirmed = false, roughPlaced = false, configured = false;
let bracketPlan = null;
let bracketOffsets = {}, selectedBracket = null, bracketSpan = 0;
let moveStep = 5, edgeMode = false, dimensionField = null, dimensionAlignment = null;
const titles = ['選擇兩個機構', '選承接端的大面', '選安裝端的大面', '預覽對齊與偏置'];
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const mul = (p, n) => ({ x: p.x * n, y: p.y * n, z: p.z * n });
let viewYaw = 45, viewElevation = 30, viewDrag = null, draggedView = false;
const viewCoords = p => {
  const yaw = viewYaw * Math.PI / 180, elevation = viewElevation * Math.PI / 180;
  return {
    x: p.x * Math.cos(yaw) - p.y * Math.sin(yaw),
    y: (p.x * Math.sin(yaw) + p.y * Math.cos(yaw)) * Math.sin(elevation) - p.z * Math.cos(elevation),
    depth: (p.x * Math.sin(yaw) + p.y * Math.cos(yaw)) * Math.cos(elevation) + p.z * Math.sin(elevation)
  };
};
const project = p => viewCoords(p);
const fitButton = button('自動貼齊', () => {
  const result = autoFitFaces(hosts[draft.host], children[draft.child], draft);
  if (!result.ok) { $('message').textContent = result.reason; return; }
  draft = result.selection; bracketOffsets = {}; selectedBracket = null; render();
  $('message').textContent = '兩板已直角貼齊；角碼孔位另行檢查，確認預覽後再接上。';
});
$('bracketNote').after(fitButton);
const solve = () => solveFaceMate({ ...draft, hostBox: hosts[draft.host].box, childBox: children[draft.child].box });

function button(label, action) {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = label; b.addEventListener('click', action); return b;
}
function update(field, value) { bracketOffsets = {}; selectedBracket = null; draft[field] = value; if (field === 'childFace') roughPlaced = true; if (field === 'host' || field === 'child') { roughPlaced = configured; if (field === 'host' && hosts[value].defaultFace) draft.hostFace = hosts[value].defaultFace; } $('message').textContent = ''; render(); }
function buildCards(root, items, field) {
  items.forEach((item, i) => {
    const b = button(item.name, () => update(field, i)); b.dataset.value = i;
    const small = document.createElement('small'); small.textContent = item.detail; b.appendChild(small); root.appendChild(b);
  });
}
buildCards($('hosts'), hosts, 'host'); buildCards($('children'), children, 'child');
for (const [root, field] of [['hostFaces', 'hostFace'], ['childFaces', 'childFace']]) {
  faceOrder.forEach(id => {
    const b = button(names[id], () => update(field, id)); b.dataset.value = id;
    const icon = document.createElement('span'); icon.className = 'face-symbol'; icon.textContent = symbols[id]; icon.setAttribute('aria-hidden', 'true'); b.prepend(icon); $(root).appendChild(b);
  });
}
const grid = [
  [-1, 1, '↖ 左上'], [0, 1, '↑ 上邊'], [1, 1, '↗ 右上'],
  [-1, 0, '← 左邊'], [0, 0, '◎ 置中'], [1, 0, '→ 右邊'],
  [-1, -1, '↙ 左下'], [0, -1, '↓ 下邊'], [1, -1, '↘ 右下']
];
grid.forEach(([u, v, label]) => {
  const b = button(label, () => { draft.alignU = u; draft.alignV = v; render(); }); b.dataset.u = u; b.dataset.v = v; $('align').appendChild(b);
});
for (const [field, label] of [['offsetU', '左右偏置'], ['offsetV', '上下偏置'], ['gap', '面間距離']]) {
  const row = document.createElement('div'); row.className = 'adjust-row';
  const lab = document.createElement('label'); lab.textContent = `${label} mm`; lab.htmlFor = field;
  const input = document.createElement('input'); input.id = field; input.type = 'number'; input.step = '0.1'; input.setAttribute('aria-label', `${label}（mm）`);
  if (field === 'gap') input.min = '0';
  input.addEventListener('input', () => {
    const value = input.value === '' ? NaN : Number(input.value);
    if (!Number.isFinite(value) || (field === 'gap' && value < 0)) {
      input.setAttribute('aria-invalid', 'true'); $('next').disabled = true;
      $('message').textContent = '請輸入有效距離；面間距離不能小於 0。'; return;
    }
    input.removeAttribute('aria-invalid'); draft[field] = value; $('message').textContent = ''; preview();
  });
  input.addEventListener('blur', () => {
    if (input.getAttribute('aria-invalid') === 'true') { input.value = draft[field]; input.removeAttribute('aria-invalid'); preview(); }
  });
  const shift = amount => update(field, field === 'gap' ? Math.max(0, draft[field] + amount) : draft[field] + amount);
  const minus = button('−', () => shift(-5)), plus = button('+', () => shift(5));
  minus.setAttribute('aria-label', `${label}減少 5 mm`); plus.setAttribute('aria-label', `${label}增加 5 mm`);
  row.append(lab, minus, input, plus); $('adjustments').appendChild(row);
}
const angle = () => draft.rotationDeg ?? draft.quarterTurns * 90;
$('turn').addEventListener('click', () => update('rotationDeg', (angle() + 90) % 360));
$('turnMinus').addEventListener('click', () => update('rotationDeg', (angle() + 270) % 360));
$('angleChip').addEventListener('click', () => openDimension('rotationDeg', angle()));
$('mateMode').addEventListener('click', () => {
  edgeMode = !edgeMode;
  $('mateMode').textContent = edgeMode ? '靠邊' : '移動';
  $('mateMode').setAttribute('aria-pressed', String(edgeMode));
});
$('mateCenter').addEventListener('click', () => {
  draft.alignU = 0; draft.alignV = 0; draft.offsetU = 0; draft.offsetV = 0; render();
});
const arrowFields = {
  uPlus: ['offsetU', 'alignU', 1], uMinus: ['offsetU', 'alignU', -1],
  vPlus: ['offsetV', 'alignV', 1], vMinus: ['offsetV', 'alignV', -1]
};
document.querySelectorAll('.mate-arrow').forEach(b => b.addEventListener('click', () => {
  const [offset, align, sign] = arrowFields[b.dataset.arrow];
  openDimension(offset, edgeMode ? 0 : draft[offset] + sign * moveStep, edgeMode ? [align, sign] : null);
}));
const dimensionButtons = {
  offsetU: $('mateUChip'), offsetV: $('mateVChip'), gap: $('mateGapChip'), moveStep: $('mateStepChip')
};
const dimensionText = {
  offsetU: value => `左右 ${value}`,
  offsetV: value => `上下 ${value}`,
  gap: value => `間距 ${value}`,
  moveStep: value => `步距 ${value}`
};
function openDimension(field, value, alignment = null) {
  dimensionField = field;
  dimensionAlignment = alignment;
  $('dimensionTitle').textContent = field === 'bracket' ? '角碼位置偏移' : field === 'rotationDeg' ? '設定接合角度' : field === 'offsetU' ? '設定左右偏移' : field === 'offsetV' ? '設定上下偏移' : field === 'gap' ? '設定面間距' : '設定移動步距';
  $('dimensionLabel').textContent = `${$('dimensionTitle').textContent}（${field === 'rotationDeg' ? '°' : 'mm'}）`;
  const input = $('dimensionValue');
  input.value = value;
  input.min = field === 'moveStep' || field === 'gap' ? '0' : '';
  input.removeAttribute('aria-invalid');
  $('dimensionError').textContent = field === 'bracket' ? '位置超出接合區，或與另一顆角碼太接近。' : '請輸入有效數字；步距須大於 0，間距不可小於 0。';
  $('dimensionError').hidden = true;
  $('dimensionDialog').showModal(); input.focus();
}
Object.entries(dimensionButtons).forEach(([field, b]) => b.addEventListener('click', () => {
  openDimension(field, field === 'moveStep' ? moveStep : draft[field]);
}));
$('dimensionCancel').addEventListener('click', () => $('dimensionDialog').close('cancel'));
$('dimensionDialog').addEventListener('close', () => {
  $('dimensionValue').removeAttribute('aria-invalid'); $('dimensionError').hidden = true;
});
$('dimensionForm').addEventListener('submit', e => {
  e.preventDefault();
  const input = $('dimensionValue'), value = input.value.trim() === '' ? NaN : Number(input.value);
  if ((dimensionField === 'bracket' && !bracketLayout(bracketSpan, { ...bracketOffsets, [selectedBracket]: value }).length) || !Number.isFinite(value) || (dimensionField === 'moveStep' && value <= 0) || (dimensionField === 'gap' && value < 0)) {
    input.setAttribute('aria-invalid', 'true'); $('dimensionError').hidden = false; input.focus(); return;
  }
  if (dimensionField === 'bracket') bracketOffsets[selectedBracket] = value;
  else if (dimensionField === 'moveStep') moveStep = value;
  else draft[dimensionField] = dimensionField === 'rotationDeg' ? ((value % 360) + 360) % 360 : value;
  if (dimensionAlignment) draft[dimensionAlignment[0]] = dimensionAlignment[1];
  input.removeAttribute('aria-invalid');
  $('dimensionDialog').close('confirm'); render();
});
$('wizardMode').addEventListener('click', () => { mode = 'wizard'; render(); });
$('workMode').addEventListener('click', () => { mode = 'work'; render(); });
$('back').addEventListener('click', () => { if (step > 0) step--; render(); });
$('next').addEventListener('click', () => {
  if (mode === 'wizard' && step < 3) { step = configured && step === 0 ? 3 : step + 1; render(); return; }
  if (!solve().ok) return;
  if (bracketPlan?.ok) draft.brackets = { enabled: true, offsets: { ...bracketOffsets }, childPart: children[draft.child].surface?.compId || 'frame' };
  else delete draft.brackets;
  if (integrated) { parent.postMessage({ type: 'face-wizard-confirm', selection: { ...draft } }, location.origin); return; }
  saved = { ...draft }; hasConfirmed = true; render();
  const placement = buildFacePlacement({ host: hosts[saved.host], child: children[saved.child], selection: saved });
  $('placementRecord').hidden = !placement.ok;
  $('message').textContent = placement.ok ? (bracketPlan?.ok ? '已確認角碼孔位配置。' : '已確認擺放；此接法仍需轉接設計。') : placement.reason;
});
$('placementRecord').addEventListener('click', () => {
  const result = buildFacePlacement({ host: hosts[saved.host], child: children[saved.child], selection: saved });
  if (!result.ok) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(result.record, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'face-placement-preview.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('cancel').addEventListener('click', () => {
  if (integrated) { parent.postMessage({ type: 'face-wizard-cancel' }, location.origin); return; }
  draft = { ...saved }; render(); $('message').textContent = hasConfirmed ? '已回到上次確認的擺放。' : '已回到初始示例。';
});
$('viewLeft').addEventListener('click', () => { viewYaw -= 90; preview(); });
$('viewRight').addEventListener('click', () => { viewYaw += 90; preview(); });
$('viewFlip').addEventListener('click', () => { viewElevation = -viewElevation; preview(); });
$('viewReset').addEventListener('click', () => { viewYaw = 45; viewElevation = 30; preview(); });
$('scene').addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  draggedView = false;
  viewDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, yaw: viewYaw, elevation: viewElevation };
});
$('scene').addEventListener('pointermove', e => {
  if (!viewDrag || viewDrag.id !== e.pointerId) return;
  const dx = e.clientX - viewDrag.x, dy = e.clientY - viewDrag.y;
  if (!draggedView && Math.hypot(dx, dy) < 6) return;
  draggedView = true;
  $('scene').setPointerCapture(e.pointerId);
  viewYaw = viewDrag.yaw + dx * .5;
  viewElevation = Math.max(-75, Math.min(75, viewDrag.elevation + dy * .4));
  preview();
});
const endViewDrag = () => { viewDrag = null; };
$('scene').addEventListener('pointerup', endViewDrag);
$('scene').addEventListener('pointercancel', endViewDrag);
$('scene').addEventListener('lostpointercapture', endViewDrag);

function scene(mate) {
  const svg = $('scene'); svg.replaceChildren();
  const polygons = [], objects = [], separate = mode === 'wizard' && step <= 2 && !roughPlaced;
  for (const [which, bounds, selected] of [['host', hosts[draft.host].box, draft.hostFace], ['child', children[draft.child].box, draft.childFace]]) {
    // 兩個實際機構同時保留，方向框貼在接合板上；選好兩面先預覽粗組位。
    const picking = mode === 'wizard' && (step === 1 || step === 2);
    const halfZ = Math.max((bounds.max.z - bounds.min.z) / 2, 35, Math.min(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y) / 3);
    const faceBounds = picking ? { min: { x: bounds.min.x - 12, y: bounds.min.y - 12, z: -halfZ }, max: { x: bounds.max.x + 12, y: bounds.max.y + 12, z: halfZ } } : bounds;
    const extent = (source, side) => Math[side === 'max' ? 'max' : 'min'](...[source.box[side].x, ...(source.parts || []).flatMap(p => p.points.map(q => q.x))]);
    const spacing = extent(hosts[draft.host], 'max') - extent(children[draft.child], 'min') + 60;
    const transform = p => which === 'host' ? p : separate ? add(p, { x: spacing, y: 0, z: 10 }) : transformMatePoint(mate, p);
    const source = which === 'host' ? hosts[draft.host] : children[draft.child];
    for (const part of source.parts || []) objects.push({ ...part, which, points: part.points.map(p => transform({ ...p, z: 0 })) });
    for (const face of boxFaces(faceBounds)) {
      const points = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => transform(add(face.center, add(mul(face.u, u * face.width / 2), mul(face.v, v * face.height / 2)))));
      const center = transform(face.center);
      const normalPoint = transform(add(face.center, face.n));
      const normal = { x: normalPoint.x - center.x, y: normalPoint.y - center.y, z: normalPoint.z - center.z };
      const visible = viewCoords(normal).depth > .01;
      polygons.push({ which, id: face.id, points, center, u: face.u, v: face.v, visible, selected: selected === face.id, depth: viewCoords(center).depth, transform, bounds });
    }
  }
  const all = [...polygons, ...objects].flatMap(p => p.points.map(project));
  const minX = Math.min(...all.map(p => p.x)), maxX = Math.max(...all.map(p => p.x));
  const minY = Math.min(...all.map(p => p.y)), maxY = Math.max(...all.map(p => p.y));
  const scale = Math.min(470 / Math.max(1, maxX - minX), 260 / Math.max(1, maxY - minY));
  const screen = p => { const q = project(p); return { x: 300 + (q.x - (minX + maxX) / 2) * scale, y: 180 + (q.y - (minY + maxY) / 2) * scale }; };
  const make = (name, attrs) => { const e = document.createElementNS('http://www.w3.org/2000/svg', name); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); svg.appendChild(e); return e; };
  polygons.filter(p => p.visible).sort((a, b) => a.depth - b.depth).forEach(p => {
    const face = make('polygon', { points: p.points.map(screen).map(q => `${q.x},${q.y}`).join(' '), fill: p.selected ? (p.which === 'host' ? '#349ee8' : '#6cd9b0') : p.which === 'host' ? '#a9c4d3' : '#a9d0bc', stroke: p.which === 'host' ? '#44758c' : '#448876', 'stroke-width': p.selected ? 3 : 1.5, 'fill-opacity': .18 });
    const selectable = mode === 'work' || (p.which === 'host' ? step === 1 : step === 2);
    if (selectable) {
      face.dataset[p.which === 'host' ? 'hostFace' : 'childFace'] = p.id;
      face.setAttribute('role', 'button'); face.setAttribute('tabindex', '0');
      face.setAttribute('aria-label', `選${p.which === 'host' ? '承接端' : '安裝端'}${names[p.id]}`);
      face.setAttribute('aria-pressed', String(p.selected));
      face.style.cursor = 'pointer';
      const field = p.which === 'host' ? 'hostFace' : 'childFace';
      face.addEventListener('click', () => { if (!draggedView) update(field, p.id); });
      face.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); update(field, p.id); }
      });
    }
    if (p.id === 'top' || p.id === 'bottom') {
      const source = p.which === 'host' ? hosts[draft.host] : children[draft.child];
      const z = p.id === 'top' ? p.bounds.max.z : p.bounds.min.z;
      for (const ring of source.outlines) {
        make('polygon', { points: ring.map(q => screen(p.transform({ ...q, z }))).map(q => `${q.x},${q.y}`).join(' '), fill: 'none', stroke: p.which === 'host' ? '#1c557e' : '#206c4b', 'stroke-width': 2, 'pointer-events': 'none' });
      }
      for (const hole of source.holes) {
        if (!(hole.r > 0)) continue;
        const ring = Array.from({ length: 16 }, (_, i) => ({ x: hole.x + Math.cos(i * Math.PI / 8) * hole.r, y: hole.y + Math.sin(i * Math.PI / 8) * hole.r, z }));
        make('polygon', { points: ring.map(q => screen(p.transform(q))).map(q => `${q.x},${q.y}`).join(' '), fill: '#f5f4ef', stroke: '#427066', 'stroke-width': 1, 'pointer-events': 'none' });
      }
      for (const cutout of source.cutouts) {
        make('polygon', { points: cutout.points.map(q => screen(p.transform({ ...q, z }))).map(q => `${q.x},${q.y}`).join(' '), fill: '#f5f4ef', stroke: '#427066', 'stroke-width': 1, 'pointer-events': 'none' });
      }
    }
  });
  for (const part of objects) make('polygon', { 'data-mechanism': part.which, points: part.points.map(screen).map(q => `${q.x},${q.y}`).join(' '), fill: part.color, 'fill-opacity': .7, stroke: part.color, 'stroke-width': 2, 'pointer-events': 'none' });
  polygons.filter(p => p.selected).forEach(p => {
    if (!p.visible) make('polygon', { points: p.points.map(screen).map(q => `${q.x},${q.y}`).join(' '), fill: 'none', stroke: p.which === 'host' ? '#245c8a' : '#167553', 'stroke-width': 2.5, 'stroke-dasharray': '6 4', 'pointer-events': 'none' });
    const q = screen(p.center);
    const labelX = p.which === 'host' ? 100 : 500, labelY = p.which === 'host' ? 40 : 330;
    make('line', { x1: q.x, y1: q.y, x2: labelX, y2: labelY, stroke: '#385e60', 'stroke-width': 1.5, 'pointer-events': 'none' });
    const text = make('text', { x: labelX, y: labelY, 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 700, fill: '#173e40', stroke: '#fff', 'stroke-width': 4, 'paint-order': 'stroke', 'pointer-events': 'none' });
    text.textContent = `${p.which === 'host' ? '承接' : '安裝'} ${names[p.id]}`;
  });
  const bracketNote = $('bracketNote'); bracketNote.hidden = separate || step !== 3;
  fitButton.hidden = bracketNote.hidden;
  bracketPlan = null;
  if (!bracketNote.hidden) {
    const perpendicular = Math.abs(mate.rotation[2][2]) < 1e-6;
    bracketPlan = perpendicular ? planFaceBrackets(hosts[draft.host], children[draft.child], mate, bracketOffsets) : null;
    bracketSpan = bracketPlan?.span || 0;
    bracketNote.style.color = bracketPlan && !bracketPlan.ok ? '#b34436' : '#206f63';
    bracketNote.textContent = !perpendicular ? '非直角接合，未配置角碼孔。' : !bracketPlan.ok ? `可接上；角碼孔待調整（${bracketPlan.reason}）` : `角碼 ${bracketPlan.brackets.length} 顆 · 確認後生成兩板固定孔 Ø3.2`;
    for (const slot of bracketPlan?.brackets || []) {
      const active = selectedBracket === slot.id;
      const color = slot.reason ? '#c84436' : active ? '#d99821' : '#607d83';
      for (const wing of slot.wings) make('polygon', { points: wing.map(screen).map(q => `${q.x},${q.y}`).join(' '), fill:color,'fill-opacity':active?.55:.2,stroke:color,'stroke-width':2,'pointer-events':'none' });
      for (const point of [slot.hostHole,slot.childHoleWorld]) {
        const q=screen(point);
        make('circle',{cx:q.x,cy:q.y,r:FACE_BRACKET_SPEC.diameter/2*scale,fill:'none',stroke:slot.reason?'#c84436':'#167553','stroke-width':2,'pointer-events':'none'});
      }
      const q = screen(slot.corner);
      const target=make('circle',{cx:q.x,cy:q.y,r:24,fill:'transparent',role:'button',tabindex:0,'aria-label':`角碼 ${slot.id}，調整位置`,'aria-pressed':active});
      const choose=()=>{if(draggedView)return;selectedBracket=slot.id;preview();openDimension('bracket',bracketOffsets[slot.id]||0);};
      target.style.cursor='pointer';target.addEventListener('pointerdown',e=>e.stopPropagation());target.addEventListener('click',choose);
      target.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}});
    }
  }
  const axis = make('text', { x: 300, y: 370, 'text-anchor': 'middle', 'font-size': 13, fill: '#516d69' });
  axis.textContent = step === 1 || step === 2 ? '方向外框 · 點面選取' : separate ? '接合板 · 真實輪廓與固定孔' : '接合板擺放預覽';
  const hostFace = polygons.find(p => p.which === 'host' && p.id === draft.hostFace);
  if (hostFace && !separate) positionMateOverlay(hostFace, screen);
  else $('mateOverlay').hidden = true;
}
function positionMateOverlay(face, screen) {
  const overlay = $('mateOverlay'), wrap = $('sceneWrap'), svg = $('scene');
  const show = mode === 'work' || step === 3;
  overlay.hidden = !show;
  if (!show) return;
  const wrapRect = wrap.getBoundingClientRect(), matrix = svg.getScreenCTM();
  if (!matrix || !wrapRect.width || !wrapRect.height) { overlay.hidden = true; return; }
  const point = p => {
    const q = svg.createSVGPoint(); q.x = p.x; q.y = p.y;
    const client = q.matrixTransform(matrix);
    return { x: client.x - wrapRect.left, y: client.y - wrapRect.top };
  };
  const center = point(screen(face.center));
  const axis = basis => {
    const origin = screen(face.center), end = screen(add(face.center, basis));
    const a = point(origin), b = point(end), dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
    return length < 0.01 ? null : { x: dx / length, y: dy / length };
  };
  const u = axis(face.u) || { x: 1, y: 0 };
  let v = axis(face.v);
  if (!v || Math.abs(u.x * v.y - u.y * v.x) < .45) {
    const perpendicular = { x: -u.y, y: u.x };
    if (v && perpendicular.x * v.x + perpendicular.y * v.y < 0) { perpendicular.x *= -1; perpendicular.y *= -1; }
    v = perpendicular;
  }
  const specs = [
    ['uPlus', u], ['uMinus', { x: -u.x, y: -u.y }],
    ['vPlus', v], ['vMinus', { x: -v.x, y: -v.y }]
  ];
  const centerLeft = Math.max(4, Math.min(wrapRect.width - 48, center.x - 22));
  const centerTop = Math.max(4, Math.min(wrapRect.height - 54, center.y - 22));
  const placed = [], centerBox = { left: centerLeft, top: centerTop, right: centerLeft + 44, bottom: centerTop + 44 };
  const collides = box => [centerBox, ...placed].some(other => box.left < other.right + 4 && box.right + 4 > other.left && box.top < other.bottom + 4 && box.bottom + 4 > other.top);
  for (const [key, dir] of specs) {
    const b = overlay.querySelector(`[data-arrow="${key}"]`);
    let chosen = null;
    for (const radius of [62, 78, 94, 110]) {
      const px = center.x + dir.x * radius, py = center.y + dir.y * radius;
      const left = Math.max(4, Math.min(wrapRect.width - 52, px - 24));
      const top = Math.max(4, Math.min(wrapRect.height - 52, py - 24));
      const candidate = { left, top, right: left + 48, bottom: top + 48 };
      if (!collides(candidate)) { chosen = candidate; break; }
    }
    if (!chosen) {
      const fallback = { uPlus: [28, wrapRect.height / 2], uMinus: [wrapRect.width - 28, wrapRect.height / 2], vPlus: [wrapRect.width / 2, 74], vMinus: [wrapRect.width / 2, wrapRect.height - 74] }[key];
      const left = Math.max(4, Math.min(wrapRect.width - 52, fallback[0] - 24));
      const top = Math.max(4, Math.min(wrapRect.height - 52, fallback[1] - 24));
      chosen = { left, top, right: left + 48, bottom: top + 48 };
    }
    placed.push(chosen);
    const { left, top } = chosen;
    b.style.left = `${left}px`; b.style.top = `${top}px`;
    b.style.transform = `rotate(${Math.atan2(dir.y, dir.x) * 180 / Math.PI + 90}deg)`;
  }
  $('mateCenter').style.left = `${centerLeft}px`;
  $('mateCenter').style.top = `${centerTop}px`;
}
function render() {
  document.body.dataset.ui = mode;
  document.body.dataset.step = step;
  $('hostFaceMore').open = mode === 'work';
  $('wizardMode').setAttribute('aria-pressed', mode === 'wizard'); $('workMode').setAttribute('aria-pressed', mode === 'work');
  document.querySelectorAll('[data-step]').forEach(s => { s.hidden = mode === 'wizard' && Number(s.dataset.step) !== step; });
  $('progress').hidden = mode === 'work' || configured; $('progress').replaceChildren();
  for (let i = 0; i < (configured ? 2 : 4); i++) { const dot = document.createElement('span'); if (i <= (configured ? step === 0 ? 0 : 1 : step)) dot.className = 'current'; $('progress').appendChild(dot); }
  document.querySelector('section[data-step="3"] h2').textContent = configured ? '調整接合位置' : '4 · 怎麼對齊？';
  for (const [root, field] of [['hosts', 'host'], ['children', 'child'], ['hostFaces', 'hostFace'], ['childFaces', 'childFace']]) {
    $(root).querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value) === String(draft[field])));
  }
  $('align').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', Number(b.dataset.u) === draft.alignU && Number(b.dataset.v) === draft.alignV));
  ['offsetU', 'offsetV', 'gap'].forEach(field => { $(field).value = draft[field]; });
  $('angleChip').textContent = `接合角度 ${Number(angle().toFixed(2))}°`;
  $('rotationActions').hidden = mode === 'wizard' && step !== 3;
  $('back').hidden = mode === 'work' || configured; $('back').disabled = step === 0;
  $('back').textContent = configured && step === 3 ? '選面輔助' : '上一步';
  $('next').textContent = mode === 'work' || step === 3 ? (integrated ? '接上' : '確認擺放') : '下一步';
  if (integrated) $('cancel').textContent = '取消';
  if (integrated && configured) { $('wizardMode').parentElement.hidden = true; document.querySelector('header .tag').hidden = true; $('mateStepChip').hidden = true; }
  $('stageTitle').textContent = mode === 'work' ? '工作模式 · 外框擺放預覽' : titles[step];
  preview();
}
function preview() {
  const align = grid.find(([u, v]) => u === draft.alignU && v === draft.alignV)[2];
  $('mateUChip').textContent = dimensionText.offsetU(Number(draft.offsetU.toFixed(2)));
  $('mateVChip').textContent = dimensionText.offsetV(Number(draft.offsetV.toFixed(2)));
  $('mateGapChip').textContent = dimensionText.gap(Number(draft.gap.toFixed(2)));
  $('mateStepChip').textContent = dimensionText.moveStep(moveStep);
  $('summary').textContent = `${children[draft.child].name}・${names[draft.childFace]} → ${hosts[draft.host].name}・${names[draft.hostFace]}。${align}；偏置 ${draft.offsetU} / ${draft.offsetV} mm；間距 ${draft.gap} mm。`;
  const mate = solve(); $('next').disabled = !mate.ok || !!document.querySelector('input[aria-invalid="true"]');
  if (mate.ok) scene(mate);
  else { $('mateOverlay').hidden = true; $('message').textContent = mate.reason; $('message').classList.add('error'); }
}
if (integrated) {
  document.querySelector('header .tag').textContent = '選接合面，設定尺寸，再確認組立';
  window.addEventListener('message', e => {
    if (e.source !== parent || e.origin !== location.origin) return;
    if (e.data?.type === 'face-wizard-error') { $('message').textContent = e.data.reason; return; }
    if (e.data?.type !== 'face-wizard-init') return;
    if (!Array.isArray(e.data.hosts) || !e.data.hosts.length || !Array.isArray(e.data.children) || !e.data.children.length) return;
    mode = 'wizard';
    hosts = e.data.hosts; children = e.data.children; draft = { ...initial, ...(e.data.selection || {}), host: e.data.host >= 0 ? e.data.host : 0 }; saved = { ...draft }; step = 0; configured = !!e.data.configured; roughPlaced = configured;
    bracketOffsets = { ...(draft.brackets?.offsets || {}) };
    if (e.data.startAtPlacement || (configured && hosts.length === 1)) step = 3;
    if (configured && !document.getElementById('optionalView')) {
      const view = document.querySelector('.view-actions'), more = document.createElement('details'), label = document.createElement('summary');
      more.id = 'optionalView'; label.textContent = '觀看角度'; label.style.cssText = 'min-height:44px;display:flex;align-items:center;cursor:pointer;';
      view.before(more); more.append(label, view);
    }
    document.querySelector('h1').textContent = '接合預覽';
    $('hosts').replaceChildren(); $('children').replaceChildren();
    buildCards($('hosts'), hosts, 'host'); buildCards($('children'), children, 'child'); render();
  });
  parent.postMessage({ type: 'face-wizard-ready' }, location.origin);
}
window.addEventListener('resize', () => { if (!$('mateOverlay').hidden) preview(); });
render();
