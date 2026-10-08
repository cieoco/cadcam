import { DEFAULT_PLATE_RADIUS_WORLD, createPlateGeometry, localToWorld } from './plate-geometry.js';
import { createGearPath, createRackPath } from '../utils/gear-geometry.js';
import { rackPhaseShift } from './gear-editor.js';
import { memberStock, memberStockLabel } from './member-stock.js';
import { sizeFrameOutline } from './frame-stock.js';
import { unionOutlines, area, inside, fusionCandidates } from './part-fusion.js';
import { gearMeshPhaseDeg } from './transmission-geometry.js';
import { FABRICATION_DEFAULTS } from './fabrication-profile.js';

export const DEFAULT_BAR_WIDTH_MM = DEFAULT_PLATE_RADIUS_WORLD * 2;
export const DEFAULT_HOLE_DIAMETER_MM = DEFAULT_PLATE_RADIUS_WORLD * 2 * 0.72;
// 匯出（加工）用的預設孔徑：使用者現場關節一律 M3 螺絲＋防鬆螺帽，與 FABRICATION_DEFAULTS.export 一致。
// 上面那個 12.96 是畫面孔大小的比例，不再當加工預設。
const DEFAULT_EXPORT_HOLE_DIAMETER_MM = 3.2;
const TT_SHAFT_FLAT_DIAMETER_MM = 5.4;
const TT_SHAFT_FLAT_THICKNESS_MM = 3.7;

const round = (v, digits = 3) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(digits));
};

const esc = s => String(s).replace(/[&<>"']/g, ch => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
}[ch]));

export const safeName = s => String(s || 'link').replace(/[^\w.-]+/g, '_');

export function normalizeExportSettings(settings = {}) {
  const barWidth = Number(settings.barWidthMm);
  const holeDiameter = Number(settings.holeDiameterMm);
  const ttShaftFlatDiameter = Number(settings.ttShaftFlatDiameterMm);
  const ttShaftFlatThickness = Number(settings.ttShaftFlatThicknessMm);
  const frameMargin = Number(settings.frameMarginMm);
  const frameHoleDiameter = Number(settings.frameHoleDiameterMm);
  const safeBarWidth = Number.isFinite(barWidth) ? Math.max(2, Math.min(120, barWidth)) : DEFAULT_BAR_WIDTH_MM;
  const safeHoleDiameter = Number.isFinite(holeDiameter)
    ? Math.max(0.5, Math.min(119, holeDiameter))
    : DEFAULT_EXPORT_HOLE_DIAMETER_MM;
  // barWidthMm 現在只控制自動機架；不能暗中縮小其他零件的圓孔或 TT 扁孔。
  const safeFlatDiameter = Number.isFinite(ttShaftFlatDiameter)
    ? Math.max(1, Math.min(30, ttShaftFlatDiameter))
    : TT_SHAFT_FLAT_DIAMETER_MM;
  const safeFlatThickness = Number.isFinite(ttShaftFlatThickness)
    ? Math.max(0.5, Math.min(safeFlatDiameter - 0.1, ttShaftFlatThickness))
    : Math.min(TT_SHAFT_FLAT_THICKNESS_MM, safeFlatDiameter - 0.1);
  return {
    barWidthMm: round(safeBarWidth, 2),
    holeDiameterMm: round(safeHoleDiameter, 2),
    frameMarginMm: round(Number.isFinite(frameMargin) ? Math.max(8, Math.min(80, frameMargin)) : 18, 2),
    frameHoleDiameterMm: round(Number.isFinite(frameHoleDiameter) ? Math.max(0.5, Math.min(30, frameHoleDiameter)) : safeHoleDiameter, 2),
    ttShaftFlatDiameterMm: round(safeFlatDiameter, 2),
    ttShaftFlatThicknessMm: round(safeFlatThickness, 2)
  };
}

function downloadText(text, filename, mime) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 800);
}

function linkLength(comp, pts, params) {
  const a = pts && comp.p1 && pts[comp.p1.id];
  const b = pts && comp.p2 && pts[comp.p2.id];
  const d = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
  const param = comp.lenParam ? Number(params && params[comp.lenParam]) : 0;
  return round(d || param || 1, 3);
}

export function exportableLinks(comps, pts, params) {
  return comps
    .filter(c => c && c.type === 'bar' && c.p1 && c.p2)
    .map(c => ({ comp: c, length: linkLength(c, pts, params) }))
    .filter(item => item.length > 0);
}

function pointForExport(comp, key, pts) {
  const id = comp && comp[key] && comp[key].id;
  const solved = id && pts && pts[id];
  if (solved && Number.isFinite(solved.x) && Number.isFinite(solved.y)) return solved;
  const seed = comp && comp[key];
  return seed && Number.isFinite(Number(seed.x)) && Number.isFinite(Number(seed.y))
    ? { x: Number(seed.x), y: Number(seed.y) }
    : null;
}

export function exportablePlates(comps, pts) {
  return comps
    .filter(c => c && c.type === 'triangle' && !c.fusedWith && c.p1 && c.p2 && c.p3)
    .map(c => ({ comp: c, points: [pointForExport(c, 'p1', pts), pointForExport(c, 'p2', pts), pointForExport(c, 'p3', pts)] }))
    .filter(item => item.points.every(Boolean));
}

export function assertFusionFeatures(comps, mounts=[], extras=null) {
  const {hosted}=splitMountsByHost(comps,mounts);
  if(comps.some(c=>c.fusedWith && (hosted.has(c.id) || extras?.plateHoles?.[c.id]?.length)))
    throw Error('合成板件含角碼孔或馬達安裝槽；請先解除合成再匯出，避免遺漏加工特徵');
}

export function exportableGears(comps, params, settings) {
  for(const plate of comps.filter(c=>c.fusedWith)) {
    const f=inspectFusion(comps,plate,params,settings);
    if(!f.ok)throw Error(`合成零件 ${plate.id}：${f.reason}`);
  }
  return comps
    .filter(c => c && c.type === 'gear' && c.p1 && c.p2)
    .map(c => {
      const plate=comps.find(p=>p.fusedWith===c.id);
      if(!plate)return {comp:c,geometry:gearGeometry(c,params,settings,comps)};
      const fused=inspectFusion(comps,plate,params,settings);
      if(!fused.ok)throw Error(`合成零件 ${plate.id}：${fused.reason}`);
      return {comp:c,geometry:fused.geometry,fusedPlate:plate};
    })
    .filter(item => item.geometry && item.geometry.outline.length >= 3);
}

export function exportableRacks(comps, params) {
  return comps
    .filter(c => c && c.type === 'rack' && c.p1)
    .map(c => ({ comp: c, geometry: rackGeometry(c, params, c.pinion ? comps.find(g => g && g.type === 'gear' && g.id === c.pinion) || null : null) }))
    .filter(item => item.geometry.outline.length >= 3);
}

function isTtMotorEnd(comp, key) {
  return Boolean(comp && comp.isInput && comp.motorType !== 'mg995' && comp[key] && comp[key].physicalMotor);
}

function ttShaftFlatPoints(cx, cy, settings = {}, steps = 12) {
  const normalized = normalizeExportSettings(settings);
  const r = normalized.ttShaftFlatDiameterMm / 2;
  const halfAcrossFlats = normalized.ttShaftFlatThicknessMm / 2;
  const y = Math.sqrt(Math.max(0, r * r - halfAcrossFlats * halfAcrossFlats));
  const rightTop = Math.atan2(-y, halfAcrossFlats) * 180 / Math.PI;
  const leftTop = Math.atan2(-y, -halfAcrossFlats) * 180 / Math.PI;
  const leftBottom = Math.atan2(y, -halfAcrossFlats) * 180 / Math.PI;
  const rightBottom = Math.atan2(y, halfAcrossFlats) * 180 / Math.PI;
  return [
    ...arcPoints(cx, cy, r, rightTop, leftTop, steps),
    ...arcPoints(cx, cy, r, leftBottom, rightBottom, steps),
  ];
}

function svgTtShaftFlatPath(cx, cy, settings) {
  return svgPolyline(ttShaftFlatPoints(cx, cy, settings));
}

// MG995 穿板槽的 local 外形（+X＝機身反方向、輸出軸心在原點）：
// 矩形本體槽，機身尾端可帶線材缺口——走線出口兼 180° 反裝防呆
//（軸心偏一端、耳孔卻對稱，反裝鎖得上但軸心會偏掉；反裝時出線端被板封死，一裝就發現）。
// 缺口寬或深為 0 則是純矩形。2D 預覽與 DXF/SVG 匯出共用這一份。
export function mg995SlotOutline(m = {}) {
  const bodyLen = Number(m.bodyLengthMm) || 41.2;
  const halfW = (Number(m.bodyWidthMm) || 20.2) / 2;
  const shaftOffset = Number(m.shaftOffsetMm) || 10;
  const notchW = Math.min(Number(m.cableNotchWidthMm) || 0, halfW * 2);
  const notchD = Number(m.cableNotchDepthMm) || 0;
  const maxX = shaftOffset;                 // 槽近端（輸出軸側）
  const minX = shaftOffset - bodyLen;       // 槽遠端（機身尾端、出線側）
  if (notchW <= 0 || notchD <= 0) {
    return [{ x: minX, y: -halfW }, { x: maxX, y: -halfW }, { x: maxX, y: halfW }, { x: minX, y: halfW }];
  }
  const hn = notchW / 2;
  return [
    { x: minX, y: -halfW }, { x: maxX, y: -halfW }, { x: maxX, y: halfW }, { x: minX, y: halfW },
    { x: minX, y: hn }, { x: minX - notchD, y: hn }, { x: minX - notchD, y: -hn }, { x: minX, y: -hn }
  ];
}

// Keep derived identity through representation changes; these fields never enter saved stock settings.
const holeMetadata = h => Object.fromEntries(['id','holePairId','wingId','connectionId','partId','role'].filter(k=>h[k]!==undefined).map(k=>[k,h[k]]));

// 直角安裝轉接座孔（桿件座標：u 沿桿從 p1 起算、v 沿左法線）→ 圓孔規格，圖層 ADAPTER_HOLE。
function adapterHoleSpecs(extraHoles) {
  return (Array.isArray(extraHoles) ? extraHoles : [])
    .filter(h => h && Number.isFinite(Number(h.u)) && Number.isFinite(Number(h.v)) && Number(h.diameterMm) > 0)
    .map(h => ({ ...holeMetadata(h), kind: 'circle', x: round(Number(h.u), 3), y: round(Number(h.v), 3), r: round(Number(h.diameterMm) / 2, 3), layer: 'ADAPTER_HOLE' }));
}

// 舵盤孔以零件局部座標輸出；齒輪與搖臂共用同一套加工設定。
function servoHornHoles(settings, x = 0, angle = 0) {
  const drive = { ...FABRICATION_DEFAULTS.drive, ...(settings?.drive || {}) };
  const holes = [];
  if (drive.hornCenterMm > 0) holes.push({ kind: 'circle', x, y: 0, r: drive.hornCenterMm / 2, layer: 'MG995_HORN_CENTER' });
  const n = Math.max(0, Math.round(Number(drive.hornScrewCount) || 0));
  for (let i = 0; i < n; i++) {
    const a = angle + 2 * Math.PI * i / n;
    holes.push({ kind: 'circle', x: x + drive.hornScrewCircleMm / 2 * Math.cos(a), y: drive.hornScrewCircleMm / 2 * Math.sin(a), r: drive.hornScrewMm / 2, layer: 'MG995_HORN_SCREW' });
  }
  return holes;
}

function linkHoleSpecs(comp, length, settings, extraHoles = []) {
  const { holeDiameterMm, ttShaftFlatDiameterMm, ttShaftFlatThicknessMm } = normalizeExportSettings(settings);
  const holeR = round(holeDiameterMm / 2, 3);
  const flat = { ttShaftFlatDiameterMm, ttShaftFlatThicknessMm };
  const endHoles = (key, x) => {
    if (comp.isInput && comp.motorType === 'mg995' && comp[key]?.physicalMotor) return servoHornHoles(settings, x);
    return [isTtMotorEnd(comp, key) ? { kind: 'tt-shaft-flat', x, y: 0, settings: flat } : { kind: 'circle', x, y: 0, r: holeR }];
  };
  return [...endHoles('p1', 0), ...endHoles('p2', length), ...adapterHoleSpecs(extraHoles)];
}

function svgForLink(comp, length, settings, extraHoles = []) {
  const stock = memberStock(comp);
  const r = round(stock.widthMm / 2, 3);
  const holes = linkHoleSpecs(comp, length, settings, extraHoles);
  const width = round(length + r * 2, 3);
  const height = round(r * 2, 3);
  const d = [
    `M 0 ${-r}`,
    `L ${length} ${-r}`,
    `A ${r} ${r} 0 0 1 ${length} ${r}`,
    `L 0 ${r}`,
    `A ${r} ${r} 0 0 1 0 ${-r}`,
    'Z'
  ].join(' ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="${-r} ${-r} ${width} ${height}">
  <title>${esc(comp.id || 'link')}</title>
  <desc>${esc(stockDescription(comp))}</desc>
  <g fill="none" stroke="#000" stroke-width="0.25">
    <path d="${d}" />
${holes.map(h => h.kind === 'tt-shaft-flat'
    ? `    <path d="${svgTtShaftFlatPath(h.x, h.y, h.settings)}" data-hole="TT_SHAFT_FLAT" />`
    : `    <circle cx="${h.x}" cy="${h.y}" r="${h.r}"${h.layer ? ` data-layer="${h.layer}"` : ''} />`).join('\n')}
  </g>
</svg>
`;
}

function dxfPair(code, value) {
  return `${code}\n${value}`;
}

function arcPoints(cx, cy, radius, startDeg, endDeg, steps) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const deg = startDeg + (endDeg - startDeg) * t;
    const rad = deg * Math.PI / 180;
    pts.push({ x: cx + Math.cos(rad) * radius, y: cy + Math.sin(rad) * radius });
  }
  return pts;
}

function dxfPolyline(points, layer) {
  const rows = [
    dxfPair(0, 'LWPOLYLINE'),
    dxfPair(8, layer),
    dxfPair(90, points.length),
    dxfPair(70, 1)
  ];
  points.forEach(p => {
    rows.push(dxfPair(10, round(p.x)));
    rows.push(dxfPair(20, round(p.y)));
  });
  return rows.join('\n');
}

function dxfCircle(x, y, radius, layer) {
  return [
    dxfPair(0, 'CIRCLE'),
    dxfPair(8, layer),
    dxfPair(10, round(x)),
    dxfPair(20, round(y)),
    dxfPair(30, 0),
    dxfPair(40, round(radius))
  ].join('\n');
}

function gearGeometry(comp, params = {}, settings = {}, comps = []) {
  const teeth = Math.max(6, Math.round(Number(comp.teeth) || 12));
  const pitchR = Number(params && comp.radiusParam ? params[comp.radiusParam] : NaN) ||
    (Number(comp.module) > 0 ? teeth * Number(comp.module) / 2 : 36);
  const module = Math.max(0.1, 2 * pitchR / teeth);
  const ring = createGearPath({ teeth, module, segmentsPerTooth: 8 });
  const pinR = Number(params && comp.pinRadiusParam ? params[comp.pinRadiusParam] : NaN) ||
    Number(comp.pinRadius) ||
    Math.max(4, pitchR * 0.6);
  const seedCenter = comp.p1 || { x: 0, y: 0 };
  const seedPin = comp.p2 || { x: Number(seedCenter.x) + pinR, y: Number(seedCenter.y) };
  const dx = Number(seedPin.x) - Number(seedCenter.x);
  const dy = Number(seedPin.y) - Number(seedCenter.y);
  const angle = Math.hypot(dx, dy) > 1e-6 ? Math.atan2(dy, dx) : 0;
  // Machine coordinates share the seed pin orientation. Teeth include the mesh
  // phase; output and horn holes keep the mechanical pin angle only.
  const toothAngle=angle+gearMeshPhaseDeg(comp,{},new Map(comps.map(c=>[c.id,c])))*Math.PI/180;
  const outline=ring.map(p=>({x:round(p.x*Math.cos(toothAngle)-p.y*Math.sin(toothAngle)),y:round(p.x*Math.sin(toothAngle)+p.y*Math.cos(toothAngle))}));
  const { holeDiameterMm } = normalizeExportSettings(settings);
  const centerR = holeDiameterMm / 2;
  const outputR = Math.max(0.5, Number(comp.pinHoleDiameter) > 0 ? Number(comp.pinHoleDiameter) / 2 : centerR);
  // 馬達驅動輪（L2b）：CNC 3.175 刀做不出貼合 TT 軸的扁孔，改用 TT 附的輪轂鎖兩顆螺絲、
  // MG995 用圓形舵盤鎖 N 顆螺絲；尺寸取 settings.drive（常見值，請實量）。從動輪與 MG995 外的圓孔不變。
  const drive = { ...FABRICATION_DEFAULTS.drive, ...((settings && settings.drive) || {}) };
  const driven = Boolean(comp.p1 && comp.p1.physicalMotor);
  const ttDriven = driven && comp.motorType !== 'mg995';
  const driveHoles = [];
  if (ttDriven) {
    driveHoles.push({ x: 0, y: 0, r: drive.ttHubCenterMm / 2, layer: 'TT_HUB_CENTER' });
    const half = drive.ttHubScrewSpacingMm / 2;
    // 螺絲孔沿輸出孔方向 angle 的垂直方向，對稱於中心。
    const nx = -Math.sin(angle), ny = Math.cos(angle);
    [1, -1].forEach(sgn => driveHoles.push({ x: sgn * half * nx, y: sgn * half * ny, r: drive.ttHubScrewMm / 2, layer: 'TT_HUB_SCREW' }));
  } else if (driven) {
    driveHoles.push(...servoHornHoles(settings, 0, angle).map(({ kind, ...hole }) => hole));
  }
  return {
    outline,
    holes: [
      ...(driven ? driveHoles : [{ x: 0, y: 0, r: centerR, layer: 'CENTER_HOLE' }]),
      { x: pinR * Math.cos(angle), y: pinR * Math.sin(angle), r: outputR, layer: 'PIN_HOLE' }
    ],
    cutouts: []
  };
}

export function inspectGearExport(comp, params = {}, settings = {}, comps = []) {
  const { outline, holes, cutouts } = gearGeometry(comp, params, settings, comps);
  return { outline, holes, cutouts };
}

export function inspectFusion(comps, plate, params={}, settings={}) {
  const gear=comps.find(c=>c.id===plate?.fusedWith);
  if(!gear || !fusionCandidates(comps,plate).includes(gear))return {ok:false,reason:'原齒輪或共用連接孔已改變，請解除合成後重新選擇'};
  try {
    const gg=gearGeometry(gear,params,settings,comps);
    // Reconstruct the plate from its dimensions and the gear-controlled shared holes.
    // Home coordinates are branch hints, not current dimensions after editing gear parameters.
    const original=[plate.p1,plate.p2,plate.p3], ps=original.map(p=>({...p}));
    const ia=ps.findIndex(p=>p.id===gear.p1.id),ib=ps.findIndex(p=>p.id===gear.p2.id),ic=3-ia-ib;
    const length=(i,j)=>Number(params[[[null,plate.gParam,plate.r1Param],[plate.gParam,null,plate.r2Param],[plate.r1Param,plate.r2Param,null]][i][j]]) || Math.hypot(ps[i].x-ps[j].x,ps[i].y-ps[j].y);
    const ra=length(ia,ic),rb=length(ib,ic),pin=gg.holes.find(h=>h.layer==='PIN_HOLE');
    const d=Math.hypot(pin.x,pin.y),x=(ra*ra-rb*rb+d*d)/(2*d),h2=ra*ra-x*x;
    if(!(d>0)||h2<=1e-6)return {ok:false,reason:'孔距無法形成有效板件，請調整齒輪輸出孔或板件尺寸'};
    const ux=pin.x/d,uy=pin.y/d;
    const sign=((original[ib].x-original[ia].x)*(original[ic].y-original[ia].y)-(original[ib].y-original[ia].y)*(original[ic].x-original[ia].x))<0?-1:1;
    ps[ia]={...ps[ia],x:gear.p1.x,y:gear.p1.y};
    ps[ib]={...ps[ib],x:gear.p1.x+pin.x,y:gear.p1.y+pin.y};
    ps[ic]={...ps[ic],x:gear.p1.x+x*ux-sign*Math.sqrt(h2)*uy,y:gear.p1.y+x*uy+sign*Math.sqrt(h2)*ux};
    const pg=inspectPlateExport(plate,ps,settings);
    const relative=p=>({x:p.x-gear.p1.x,y:p.y-gear.p1.y});
    const gearRing=gg.outline;
    const plateRings=pg.outlines.map(r=>r.map(relative));
    const loops=unionOutlines([gearRing,...plateRings]),outer=loops.filter(r=>area(r)>0);
    if(outer.length!==1)return {ok:false,reason:'兩個外形沒有連成一片，請調整板寬或孔距'};
    const holes=[];
    for(const h of [...gg.holes,...pg.holes.map(h=>({...h,...relative(h)}))]) {
      const match=holes.find(q=>Math.hypot(h.x-q.x,h.y-q.y)<.05);
      if(match){if(h.r>match.r)Object.assign(match,h);continue;}
      if(holes.some(q=>Math.hypot(h.x-q.x,h.y-q.y)<h.r+q.r-.05))return {ok:false,reason:'不同孔位互相重疊，請調整孔徑'};
      holes.push({...h});
    }
    if(holes.some(h=>Array.from({length:24},(_,i)=>({x:h.x+h.r*Math.cos(i*Math.PI/12),y:h.y+h.r*Math.sin(i*Math.PI/12)})).some(p=>!inside(p,outer[0]))))return {ok:false,reason:'孔位超出合成外框，請調整孔徑或板寬'};
    const cutouts=[...gg.cutouts,...(pg.cutouts || []).map(h=>({...h,points:h.points.map(relative)})),...loops.filter(r=>area(r)<0).map(points=>({points,layer:'FUSION_CUTOUT'}))];
    const warnings=[];
    const pitchR=Number(params[gear.radiusParam]) || Number(gear.module)*Number(gear.teeth)/2;
    if(plateRings.some(r=>r.some(p=>Math.hypot(p.x,p.y)>pitchR)))warnings.push('夾爪伸出齒輪節圓；請確認全行程不遮擋另一顆齒輪');
    return {ok:true,gear,plate,warnings,geometry:{outline:outer[0],holes,cutouts},thicknessMm:memberStock(plate).thicknessMm};
  } catch(e) {return {ok:false,reason:e.message};}
}

// 齒條局部座標：x 沿齒條軸 u、y 沿法向 n＝(-uy,ux)，原點＝rack.p1（θ=0 放置位置）。
// 與 solver 孔位一致：u = endA ? -len/2 : endB ? len/2 : h.u、v = h.v（len 不含 endMargin、不含 phaseShift）；
// 齒形路徑座標 (x, y) 即 (u, v)（drawRack 只在畫 SVG 時才翻 y，這裡不翻）。
// 本體長度與齒形／長槽的算法同 transmission-render.js 的 drawRack／drawRackSlot。
function rackGeometry(comp, params = {}, pinion = null) {
  const teeth = pinion ? Math.max(6, Math.round(Number(pinion.teeth) || 12)) : 12;
  const radius = pinion ? (Number(params[pinion.radiusParam]) || 40) : 40;
  const module = 2 * radius / teeth;
  const lenParam = Number(params[comp.lenParam]) || 160;
  const length = lenParam + 2 * (Number(comp.endMargin) || 12);
  const bodyH = Math.max(4, Number(comp.bodyHeight) || Math.max(8, module * 2.5));
  const axisDeg = Number(comp.axisDeg) || 0;
  const phaseShift = rackPhaseShift(comp, pinion, { length, module, teeth, axisDeg });
  const outline = createRackPath({ length, height: bodyH, module })
    .map(p => ({ x: round(p.x + phaseShift), y: round(p.y) }));
  const cutouts = [];
  if (comp.slot) {
    const slot = typeof comp.slot === 'object' ? comp.slot : {};
    const slotLen = Math.max(8, Math.min(length - module * 3, Number(slot.length) || Math.max(24, length - 32)));
    const slotW = Math.max(2, Math.min(bodyH * 0.7, Number(slot.width) || Math.max(4, module * 1.25)));
    const slotY = -module * 1.25 - bodyH / 2 + (Number(slot.offset) || 0);
    // 限位：trimStart 縮短 -u 端、trimEnd 縮短 +u 端（導銷碰到槽端就停）
    const trimS = Math.max(0, Number(slot.trimStart) || 0), trimE = Math.max(0, Number(slot.trimEnd) || 0);
    const r = slotW / 2, x1 = -slotLen / 2 + trimS + phaseShift, x2 = slotLen / 2 - trimE + phaseShift;
    // 兩端半圓長槽：右端半圓（-90°→+90°）接左端半圓（90°→270°），閉合
    const points = [...arcPoints(x2, slotY, r, -90, 90, 16), ...arcPoints(x1, slotY, r, 90, 270, 16)]
      .map(p => ({ x: round(p.x), y: round(p.y) }));
    cutouts.push({ layer: 'RACK_SLOT', points });
  }
  const holes = (comp.holes || []).map(h => ({
    id: h.id,
    x: round(h.role === 'endA' ? -lenParam / 2 : h.role === 'endB' ? lenParam / 2 : Number(h.u) || 0),
    y: round(Number(h.v) || 0),
    r: round((Number(h.diameter) || 5) / 2),
    layer: 'RACK_HOLE'
  }));
  return { outline, holes, cutouts };
}

export function inspectRackExport(rack, params = {}, pinion = null) {
  const { outline, holes, cutouts } = rackGeometry(rack, params, pinion);
  return { outline, holes, cutouts };
}

function hull(points) {
  const sorted = [...points].sort((a, b) => (a.x - b.x) || (a.y - b.y));
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  sorted.forEach(p => {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  });
  const upper = [];
  [...sorted].reverse().forEach(p => {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  });
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    const crosses = ((a.y > p.y) !== (b.y > p.y)) &&
      (p.x < (b.x - a.x) * (p.y - a.y) / ((b.y - a.y) || 1e-9) + a.x);
    if (crosses) inside = !inside;
  }
  return inside;
}

function lineDistance(p, a, b) {
  const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / d;
}

function barOutline(a, b, radius) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const rightAngle = Math.atan2(ny, nx) * 180 / Math.PI;
  const leftAngle = Math.atan2(-ny, -nx) * 180 / Math.PI;
  return [
    { x: a.x + nx * radius, y: a.y + ny * radius },
    { x: b.x + nx * radius, y: b.y + ny * radius },
    ...arcPoints(b.x, b.y, radius, rightAngle, leftAngle, 18).slice(1),
    { x: a.x - nx * radius, y: a.y - ny * radius },
    // 從左端下側繞到上側時必須經過桿外側（-180°）；直接走到同值角度會繞進桿內側形成凹口。
    ...arcPoints(a.x, a.y, radius, leftAngle, rightAngle - 360, 18).slice(1)
  ];
}

function roundPadOutline(center, radius) {
  return arcPoints(center.x, center.y, radius, 0, 360, 32).slice(0, -1);
}

// 固定桿保留原有長寬與孔位，四角採小圓角，提供較長的直邊方便組立。
function frameBarOutline(a, b, halfWidth) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, r = Math.min(4, halfWidth);
  const corners = [
    [-halfWidth + r, -halfWidth + r, 180, 270],
    [len + halfWidth - r, -halfWidth + r, 270, 360],
    [len + halfWidth - r, halfWidth - r, 0, 90],
    [-halfWidth + r, halfWidth - r, 90, 180]
  ];
  return corners.flatMap(([x, y, start, end]) => arcPoints(x, y, r, start, end, 6))
    .map(p => ({ x: a.x + p.x * ux - p.y * uy, y: a.y + p.x * uy + p.y * ux }));
}

function signedArea(points) {
  return points.reduce((sum, p, index) => {
    const q = points[(index + 1) % points.length];
    return sum + p.x * q.y - q.x * p.y;
  }, 0) / 2;
}

// 凸包的圓角等距外擴（凸包與半徑 offset 圓的 Minkowski 和）：
// 每條邊沿外法線平移 offset，相鄰邊之間用圓弧接起來。
// 相較於舊版「兩邊外移取交點」的尖角 miter，銳角頂點不會爆衝成又大又歪的尖楔，
// 而是收成一段外弧，整片板貼著孔群、四周等距、圓角收邊。
function roundedOffsetHull(points, offset) {
  if (points.length < 3 || offset <= 0) return points;
  const ccw = signedArea(points) >= 0;
  const n = points.length;
  // 邊 p→q 的單位外法線
  const outward = (p, q) => {
    const dx = q.x - p.x, dy = q.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    return ccw ? { x: dy / len, y: -dx / len } : { x: -dy / len, y: dx / len };
  };
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = points[i], q = points[(i + 1) % n], r = points[(i + 2) % n];
    const nEdge = outward(p, q), nNext = outward(q, r);
    // 這條邊平移後的兩端
    out.push({ x: p.x + nEdge.x * offset, y: p.y + nEdge.y * offset });
    out.push({ x: q.x + nEdge.x * offset, y: q.y + nEdge.y * offset });
    // 頂點 q 的圓角：外法線由本邊掃到下一邊（取內部點，兩端已由相鄰邊供應）
    const a0 = Math.atan2(nEdge.y, nEdge.x) * 180 / Math.PI;
    let a1 = Math.atan2(nNext.y, nNext.x) * 180 / Math.PI;
    if (ccw) { while (a1 < a0) a1 += 360; } else { while (a1 > a0) a1 -= 360; }
    if (Math.abs(a1 - a0) > 0.5) {
      const steps = Math.max(1, Math.round(Math.abs(a1 - a0) / 15));
      out.push(...arcPoints(q.x, q.y, offset, a0, a1, steps).slice(1, -1));
    }
  }
  return out;
}

function pointToSegmentDistance(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 <= 1e-9) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2));
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
}

function frameWarnings(outlines, holes) {
  const warnings = [];
  const pivots = holes.filter(h => h.layer === 'PIVOT_HOLE');
  const minWeb = 3;
  pivots.forEach((hole, index) => {
    let edgeDistance = Infinity;
    outlines.forEach(outline => outline.forEach((p, i) => {
      edgeDistance = Math.min(edgeDistance, pointToSegmentDistance(hole, p, outline[(i + 1) % outline.length]));
    }));
    if (edgeDistance - hole.r < minWeb) {
      warnings.push(`固定孔距外緣僅 ${round(Math.max(0, edgeDistance - hole.r), 1)} mm，建議至少 ${minWeb} mm`);
    }
    pivots.slice(index + 1).forEach(other => {
      const web = Math.hypot(hole.x - other.x, hole.y - other.y) - hole.r - other.r;
      if (web < minWeb) warnings.push(`兩個固定孔間肉厚僅 ${round(Math.max(0, web), 1)} mm，建議至少 ${minWeb} mm`);
    });
  });
  return [...new Set(warnings)];
}

function arcOutlinePoints(center, radius, a0, a1, steps = 10, shortest = false) {
  let delta = a1 - a0;
  if (shortest) {
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
  } else {
    while (delta <= 0) delta += Math.PI * 2;
  }
  const pts = [];
  for (let i = 1; i <= steps; i++) {
    const a = a0 + delta * (i / steps);
    pts.push({ x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius });
  }
  return pts;
}

function arcOutlinePointsClockwise(center, radius, a0, a1, steps = 14) {
  let delta = a1 - a0;
  while (delta >= 0) delta -= Math.PI * 2;
  while (delta < -Math.PI * 2) delta += Math.PI * 2;
  const pts = [];
  for (let i = 1; i <= steps; i++) {
    const a = a0 + delta * (i / steps);
    pts.push({ x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius });
  }
  return pts;
}

function lineIntersection(a, ua, b, ub) {
  const den = ua.x * ub.y - ua.y * ub.x;
  if (Math.abs(den) < 1e-9) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = (dx * ub.y - dy * ub.x) / den;
  return { x: a.x + ua.x * t, y: a.y + ua.y * t };
}

function roundedPolylineOutline(points, radius) {
  const clean = points.filter((p, i) => i === 0 || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > 1e-6);
  if (clean.length < 2) return [];
  const segs = [];
  for (let i = 0; i < clean.length - 1; i++) {
    const a = clean[i], b = clean[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len <= 1e-6) continue;
    const ux = dx / len, uy = dy / len;
    const nx = -uy, ny = ux;
    segs.push({ a, b, ux, uy, nx, ny, nAng: Math.atan2(ny, nx) });
  }
  if (!segs.length) return [];
  const sidePoint = (p, seg, side) => ({ x: p.x + seg.nx * radius * side, y: p.y + seg.ny * radius * side });
  const sideAngle = (seg, side) => seg.nAng + (side < 0 ? Math.PI : 0);
  const buildSide = (side) => {
    const chain = [sidePoint(clean[0], segs[0], side)];
    for (let i = 1; i < clean.length - 1; i++) {
      const prev = segs[i - 1], next = segs[i], p = clean[i];
      const turn = prev.ux * next.uy - prev.uy * next.ux;
      const outer = side > 0 ? turn > 0 : turn < 0;
      if (outer) {
        chain.push(sidePoint(p, prev, side));
        chain.push(...arcOutlinePoints(p, radius, sideAngle(prev, side), sideAngle(next, side), 10, true));
      } else {
        const hit = lineIntersection(
          sidePoint(p, prev, side), { x: prev.ux, y: prev.uy },
          sidePoint(p, next, side), { x: next.ux, y: next.uy }
        );
        chain.push(hit || sidePoint(p, next, side));
      }
    }
    chain.push(sidePoint(clean[clean.length - 1], segs[segs.length - 1], side));
    return chain;
  };
  const left = buildSide(1);
  const right = buildSide(-1);
  const last = segs[segs.length - 1];
  const first = segs[0];
  return [
    ...left,
    ...arcOutlinePointsClockwise(clean[clean.length - 1], radius, sideAngle(last, 1), sideAngle(last, -1), 14),
    ...right.reverse(),
    ...arcOutlinePointsClockwise(clean[0], radius, sideAngle(first, -1), sideAngle(first, 1), 14)
  ];
}

function cleanPolylineOutline(points, radius) {
  const clean = points.filter((p, i) => i === 0 || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > 1e-6);
  if (clean.length < 2) return [];
  const segs = [];
  for (let i = 0; i < clean.length - 1; i++) {
    const a = clean[i], b = clean[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len <= 1e-6) continue;
    const ux = dx / len, uy = dy / len;
    const nx = -uy, ny = ux;
    segs.push({ a, b, ux, uy, nx, ny, nAng: Math.atan2(ny, nx) });
  }
  if (!segs.length) return [];
  const sidePoint = (p, seg, side) => ({ x: p.x + seg.nx * radius * side, y: p.y + seg.ny * radius * side });
  const sideAngle = (seg, side) => seg.nAng + (side < 0 ? Math.PI : 0);
  const buildSide = (side) => {
    const chain = [sidePoint(clean[0], segs[0], side)];
    for (let i = 1; i < clean.length - 1; i++) {
      const prev = segs[i - 1], next = segs[i], p = clean[i];
      const hit = lineIntersection(
        sidePoint(p, prev, side), { x: prev.ux, y: prev.uy },
        sidePoint(p, next, side), { x: next.ux, y: next.uy }
      );
      chain.push(hit || sidePoint(p, next, side));
    }
    chain.push(sidePoint(clean[clean.length - 1], segs[segs.length - 1], side));
    return chain;
  };
  const left = buildSide(1);
  const right = buildSide(-1);
  const last = segs[segs.length - 1];
  const first = segs[0];
  return [
    ...left,
    ...arcOutlinePointsClockwise(clean[clean.length - 1], radius, sideAngle(last, 1), sideAngle(last, -1), 14),
    ...right.reverse(),
    ...arcOutlinePointsClockwise(clean[0], radius, sideAngle(first, -1), sideAngle(first, 1), 14)
  ];
}

function roundedTriangleOutline(a, b, c, radius) {
  const pts = [a, b, c];
  const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const ordered = area < 0 ? [a, c, b] : pts;
  const tangent = (p, q) => {
    const dx = q.x - p.x, dy = q.y - p.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dy / dist, ny = -dx / dist;
    return {
      start: { x: p.x + nx * radius, y: p.y + ny * radius },
      end: { x: q.x + nx * radius, y: q.y + ny * radius }
    };
  };
  const out = [];
  const ts = ordered.map((p, i) => tangent(p, ordered[(i + 1) % ordered.length]));
  out.push(ts[0].start);
  for (let i = 0; i < ts.length; i++) {
    const curr = ts[i];
    const next = ts[(i + 1) % ts.length];
    const corner = ordered[(i + 1) % ordered.length];
    out.push(curr.end);
    out.push(...arcPoints(
      corner.x, corner.y, radius,
      Math.atan2(curr.end.y - corner.y, curr.end.x - corner.x) * 180 / Math.PI,
      Math.atan2(next.start.y - corner.y, next.start.x - corner.x) * 180 / Math.PI,
      14
    ).slice(1));
  }
  return out;
}

function jawCenterline(pivot, drive, tip, turnSign = 0) {
  const dx = tip.x - pivot.x;
  const dy = tip.y - pivot.y;
  const len = Math.hypot(dx, dy);
  if (len <= 1e-6) return null;
  const ux = dx / len;
  const uy = dy / len;
  const cross = ux * (drive.y - pivot.y) - uy * (drive.x - pivot.x);
  const side = Number(turnSign) < 0 ? -1 : (Number(turnSign) > 0 ? 1 : (Math.sign(cross) || 1));
  const turn = side * 55 * Math.PI / 180;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const ex = ux * cos - uy * sin;
  const ey = ux * sin + uy * cos;
  const extend = Math.max(38, Math.min(84, len * 0.58));
  const end = { x: tip.x + ex * extend, y: tip.y + ey * extend };
  return [drive, pivot, tip, end];
}

function jawPlateOutline(pivot, drive, tip, turnSign = 0) {
  const centerline = jawCenterline(pivot, drive, tip, turnSign);
  if (!centerline) return roundedTriangleOutline(pivot, drive, tip, DEFAULT_PLATE_RADIUS_WORLD);
  return cleanPolylineOutline(centerline, DEFAULT_PLATE_RADIUS_WORLD);
}

function svgPolyline(points) {
  return points.map((p, i) => `${i ? 'L' : 'M'} ${round(p.x)} ${round(p.y)}`).join(' ') + ' Z';
}

// adapterHoles（C1）：直角轉接座開在板上的宿主孔 [{ x, y, u?, v?, diameterMm }]；
// 有 u,v（板局部座標，以 p1→p2 為 u 軸）就用 points 換成世界座標，板會動時孔才跟著板走，否則用 x,y。
function plateAdapterHoles(points, adapterHoles) {
  return (Array.isArray(adapterHoles) ? adapterHoles : []).map(h => {
    let w = (Number.isFinite(h.u) && Number.isFinite(h.v)) ? localToWorld(points, h) : null;
    if (!w) w = { x: h.x, y: h.y };
    return { ...holeMetadata(h), x: w.x, y: w.y, r: (Number(h.diameterMm) || 3.2) / 2, layer: 'ADAPTER_HOLE' };
  }).filter(h => Number.isFinite(h.x) && Number.isFinite(h.y));
}

function plateGeometry(comp, points, settings, mounts = [], adapterHoles = []) {
  const { holeDiameterMm } = normalizeExportSettings(settings);
  const g = createPlateGeometry(comp, points, {
    radius: memberStock(comp).widthMm / 2,
    holeRadius: holeDiameterMm / 2,
    ...plateMountExtras(mounts)
  });
  const extra = plateAdapterHoles(points, adapterHoles);
  return extra.length ? { ...g, holes: [...g.holes, ...extra] } : g;
}

export function inspectPlateExport(comp, points, settings, mounts = [], adapterHoles = []) {
  return plateGeometry(comp, points, settings, mounts, adapterHoles);
}

function boundsForGeometry(outlines, holes = []) {
  const xs = [], ys = [];
  outlines.flat().forEach(p => { xs.push(p.x); ys.push(p.y); });
  holes.forEach(h => {
    xs.push(h.x - h.r, h.x + h.r);
    ys.push(h.y - h.r, h.y + h.r);
  });
  const pad = 4;
  return {
    minX: Math.min(...xs) - pad,
    maxX: Math.max(...xs) + pad,
    minY: Math.min(...ys) - pad,
    maxY: Math.max(...ys) + pad
  };
}

function svgForPlate(comp, points, settings, mounts = [], adapterHoles = []) {
  const geometry = plateGeometry(comp, points, settings, mounts, adapterHoles);
  const b = boundsForGeometry([...geometry.outlines, ...(geometry.cutouts || []).map(c => c.points)], geometry.holes);
  const width = round(b.maxX - b.minX);
  const height = round(b.maxY - b.minY);
  const paths = geometry.outlines.map(outline => `    <path d="${svgPolyline(outline)}" />`).join('\n');
  const cutouts = (geometry.cutouts || []).map(c =>
    `    <path d="${svgPolyline(c.points)}" data-layer="${esc(c.layer)}" />`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="${round(b.minX)} ${round(b.minY)} ${width} ${height}">
  <title>${esc(comp.id || 'plate')}</title>
  <desc>${esc(stockDescription(comp))}</desc>
  <g fill="none" stroke="#000" stroke-width="0.25">
${paths}
${cutouts ? cutouts + '\n' : ''}${geometry.holes.map(h => `    <circle cx="${round(h.x)}" cy="${round(h.y)}" r="${round(h.r)}" />`).join('\n')}
  </g>
</svg>
`;
}

function dxfForPlate(comp, points, settings, mounts = [], adapterHoles = []) {
  const geometry = plateGeometry(comp, points, settings, mounts, adapterHoles);
  return [
    dxfPair(999, stockComment(comp)),
    dxfPair(0, 'SECTION'),
    dxfPair(2, 'HEADER'),
    dxfPair(9, '$INSUNITS'),
    dxfPair(70, 4),
    dxfPair(0, 'ENDSEC'),
    dxfPair(0, 'SECTION'),
    dxfPair(2, 'ENTITIES'),
    ...geometry.outlines.map(outline => dxfPolyline(outline, 'CUT')),
    ...(geometry.cutouts || []).map(c => dxfPolyline(c.points, c.layer)),
    ...geometry.holes.map(h => dxfCircle(h.x, h.y, h.r, h.layer || 'HOLE')),
    dxfPair(0, 'ENDSEC'),
    dxfPair(0, 'EOF')
  ].join('\n') + '\n';
}

function svgForGear(comp, geometry) {
  const b = boundsForGeometry([geometry.outline], geometry.holes);
  const width = round(b.maxX - b.minX);
  const height = round(b.maxY - b.minY);
  const gearCutouts = (geometry.cutouts || []).map(c =>
    `    <path d="${svgPolyline(c.points)}" data-layer="${esc(c.layer)}" />`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="${round(b.minX)} ${round(b.minY)} ${width} ${height}">
  <title>${esc(comp.id || 'gear')}</title>
  <g fill="none" stroke="#000" stroke-width="0.25">
    <path d="${svgPolyline(geometry.outline)}" data-layer="GEAR_CUT" />
${gearCutouts ? gearCutouts + '\n' : ''}${geometry.holes.map(h => `    <circle cx="${round(h.x)}" cy="${round(h.y)}" r="${round(h.r)}" data-layer="${esc(h.layer)}" />`).join('\n')}
  </g>
</svg>
`;
}

function dxfForGear(comp, geometry) {
  return [
    dxfPair(0, 'SECTION'),
    dxfPair(2, 'HEADER'),
    dxfPair(9, '$INSUNITS'),
    dxfPair(70, 4),
    dxfPair(0, 'ENDSEC'),
    dxfPair(0, 'SECTION'),
    dxfPair(2, 'ENTITIES'),
    dxfPolyline(geometry.outline, 'GEAR_CUT'),
    ...geometry.holes.map(h => dxfCircle(h.x, h.y, h.r, h.layer)),
    ...(geometry.cutouts || []).map(c => dxfPolyline(c.points, c.layer)),
    dxfPair(0, 'ENDSEC'),
    dxfPair(0, 'EOF')
  ].join('\n') + '\n';
}

function svgForRack(comp, geometry) {
  const b = boundsForGeometry([geometry.outline], geometry.holes);
  const width = round(b.maxX - b.minX);
  const height = round(b.maxY - b.minY);
  const rackCutouts = (geometry.cutouts || []).map(c =>
    `    <path d="${svgPolyline(c.points)}" data-layer="${esc(c.layer)}" />`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="${round(b.minX)} ${round(b.minY)} ${width} ${height}">
  <title>${esc(comp.id || 'rack')}</title>
  <g fill="none" stroke="#000" stroke-width="0.25">
    <path d="${svgPolyline(geometry.outline)}" data-layer="RACK_CUT" />
${rackCutouts ? rackCutouts + '\n' : ''}${geometry.holes.map(h => `    <circle cx="${round(h.x)}" cy="${round(h.y)}" r="${round(h.r)}" data-layer="${esc(h.layer)}" />`).join('\n')}
  </g>
</svg>
`;
}

function dxfForRack(comp, geometry) {
  return [
    dxfPair(0, 'SECTION'),
    dxfPair(2, 'HEADER'),
    dxfPair(9, '$INSUNITS'),
    dxfPair(70, 4),
    dxfPair(0, 'ENDSEC'),
    dxfPair(0, 'SECTION'),
    dxfPair(2, 'ENTITIES'),
    dxfPolyline(geometry.outline, 'RACK_CUT'),
    ...geometry.holes.map(h => dxfCircle(h.x, h.y, h.r, h.layer)),
    ...(geometry.cutouts || []).map(c => dxfPolyline(c.points, c.layer)),
    dxfPair(0, 'ENDSEC'),
    dxfPair(0, 'EOF')
  ].join('\n') + '\n';
}

// 單一動力來源的加工特徵（世界座標）：corners＝安裝內容角點（供外形合併／延伸判斷）、
// cutouts＝非圓形切割（MG995 穿板槽）、holes＝圓孔。自動地基、宿主機架桿與結構板共用。
export function motorMountFeatures(mount) {
  if (!mount || !mount.center || !Number.isFinite(mount.center.x)) return null;
  const rot = (Number(mount.rotDeg) || 0) * Math.PI / 180;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const local = (x, y) => ({
    x: mount.center.x + x * cos + y * sin,
    y: mount.center.y - x * sin + y * cos
  });
  const cutouts = [];
  const holes = [];
  if (mount.kind === 'mg995') {
    // MG995 穿板式固定：本體矩形槽（含線槽缺口）+ 兩耳共 4 個螺絲孔。
    // CAD local 與 TT 同慣例：+X 為機身反方向（機殼沿 -X 延伸），輸出軸心在原點。
    const m = mount.settings || {};
    const bodyLen = Number(m.bodyLengthMm) || 41.2;
    const bodyWidth = Number(m.bodyWidthMm) || 20.2;
    const shaftOffset = Number(m.shaftOffsetMm) || 10;
    const screwR = (Number(m.screwDiameterMm) || 3.2) / 2;
    const screwSpan = Number(m.screwSpanMm) || 49.5;
    const screwSpacing = Number(m.screwSpacingMm) || 10;
    const halfW = bodyWidth / 2;
    const slotOutline = mg995SlotOutline(m);
    cutouts.push({ layer: 'MG995_SLOT', points: slotOutline.map(p => local(p.x, p.y)) });
    const slotMinX = Math.min(...slotOutline.map(p => p.x));   // 含缺口深度
    const slotMaxX = Math.max(...slotOutline.map(p => p.x));
    const earX = shaftOffset - bodyLen / 2;    // 耳孔跨距以機殼中心為準，不是軸心
    [-1, 1].forEach(sx => [-1, 1].forEach(sy => {
      const p = local(earX + sx * screwSpan / 2, sy * screwSpacing / 2);
      holes.push({ x: p.x, y: p.y, r: screwR, layer: 'MG995_SCREW' });
    }));
    const margin = 5;
    const pad = Math.max(screwR, margin);
    const contentMinX = Math.min(slotMinX, earX - screwSpan / 2);
    const contentMaxX = Math.max(slotMaxX, earX + screwSpan / 2);
    const contentHalfY = Math.max(halfW, screwSpacing / 2 + screwR);
    const corners = [
      local(contentMinX - pad, -(contentHalfY + margin)),
      local(contentMaxX + pad, -(contentHalfY + margin)),
      local(contentMaxX + pad, contentHalfY + margin),
      local(contentMinX - pad, contentHalfY + margin)
    ];
    return { corners, cutouts, holes };
  }
  const m = mount.settings || {};
  const shaftR = (Number(m.shaftDiameterMm) || 6) / 2;
  const screwR = (Number(m.screwDiameterMm) || 3) / 2;
  const locatorR = (Number(m.locatorDiameterMm) || 4) / 2;
  const screwX = Number(m.screwOffsetXMm) || -20.6;
  const screwSpacing = Number(m.screwSpacingMm) || 17.3;
  const locatorX = Number(m.locatorOffsetXMm) || -11.18;
  const locatorY = Number(m.locatorOffsetYMm) || 0;
  const margin = 5;
  const minX = Math.min(screwX, 0, locatorX) - Math.max(screwR, shaftR, locatorR, margin);
  const maxX = Math.max(screwX, 0, locatorX) + Math.max(screwR, shaftR, locatorR, margin);
  const minY = Math.min(-screwSpacing / 2, 0, locatorY) - Math.max(screwR, shaftR, locatorR, margin);
  const maxY = Math.max(screwSpacing / 2, 0, locatorY) + Math.max(screwR, shaftR, locatorR, margin);
  const corners = [
    local(minX, minY),
    local(maxX, minY),
    local(maxX, maxY),
    local(minX, maxY)
  ];
  holes.push({ x: local(0, 0).x, y: local(0, 0).y, r: shaftR, layer: 'TT_SHAFT' });
  let p = local(screwX, screwSpacing / 2); holes.push({ x: p.x, y: p.y, r: screwR, layer: 'TT_SCREW' });
  p = local(screwX, -screwSpacing / 2); holes.push({ x: p.x, y: p.y, r: screwR, layer: 'TT_SCREW' });
  p = local(locatorX, locatorY); holes.push({ x: p.x, y: p.y, r: locatorR, layer: 'TT_LOCATOR' });
  return { corners, cutouts, holes };
}

// 結構板宿主的 mount 特徵 → createPlateGeometry 的 extras 形狀。
export function plateMountExtras(mounts = []) {
  const extraCutouts = [];
  const extraHoles = [];
  (mounts || []).forEach(m => {
    const feats = motorMountFeatures(m);
    if (!feats) return;
    extraCutouts.push(...feats.cutouts);
    extraHoles.push(...feats.holes);
  });
  return { extraCutouts, extraHoles };
}

function frameGeometry(frameNodes, settings = {}, motorMounts = []) {
  const allNodes = (frameNodes || []).filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y));
  // C1：outlineExempt 的孔（直角轉接座開在機架板上的宿主孔）只開孔，不參與外框／凸包，否則外框會被孔撐大。
  const nodes = allNodes.filter(p => !p.outlineExempt);
  const { barWidthMm, frameMarginMm, frameHoleDiameterMm } = normalizeExportSettings(settings);
  const holeR = frameHoleDiameterMm / 2;
  const frameR = barWidthMm / 2;
  const outlines = [];
  const mountOutlines = [];
  const cutouts = [];   // 非圓形的內部切割（MG995 穿板槽），與 holes 一樣屬於板內開孔
  const holes = [];
  let barAxis = null;
  const addHole = (x, y, r, layer = 'HOLE', metadata = {}) => {
    const q = { ...holeMetadata(metadata), x: round(x), y: round(y), r: round(r), layer };
    const duplicate = holes.some(h => Math.hypot(h.x - q.x, h.y - q.y) < 0.05 && Math.abs(h.r - q.r) < 0.05 && h.layer === q.layer);
    if (!duplicate) holes.push(q);
  };

  if (nodes.length >= 2) {
    const maxLineDist = nodes.length === 2 ? 0 : Math.max(...nodes.map(p => lineDistance(p, nodes[0], nodes[nodes.length - 1])));
    const isBarLike = nodes.length === 2 || maxLineDist < 6;
    if (isBarLike) {
    const sorted = [...nodes].sort((a, b) => (a.x - b.x) || (a.y - b.y));
      const a = sorted[0], b = sorted[sorted.length - 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len > 1e-6) {
        barAxis = { a, ux: dx / len, uy: dy / len, len };
        outlines.push(frameBarOutline(a, b, frameR));
      }
    } else {
    const baseHull = hull(nodes);
      if (baseHull.length >= 3) outlines.push(roundedOffsetHull(baseHull, Math.max(frameMarginMm, frameR)));
    }
  } else if (nodes.length === 1) {
    outlines.push(roundPadOutline(nodes[0], Math.max(frameMarginMm, frameR + holeR + 4)));
  }

  // holeLayer（字串）：模組螺絲孔等專用圖層，其餘節點照舊 PIVOT_HOLE。
  allNodes.forEach(p => addHole(p.x, p.y, Number.isFinite(p.holeDiameterMm) ? p.holeDiameterMm / 2 : holeR, typeof p.holeLayer === 'string' && p.holeLayer ? p.holeLayer : 'PIVOT_HOLE', p));

  motorMounts.forEach(mount => {
    const feats = motorMountFeatures(mount);
    if (!feats) return;
    cutouts.push(...feats.cutouts);
    feats.holes.forEach(h => addHole(h.x, h.y, h.r, h.layer));
    mountOutlines.push(feats.corners);
  });

  for (let i = holes.length - 1; i >= 0; i--) {
    if (holes[i].layer !== 'PIVOT_HOLE') continue;
    const overlapsMotorHole = holes.some((h, j) =>
      j !== i && (h.layer.startsWith('TT_') || h.layer.startsWith('MG995_')) && Math.hypot(h.x - holes[i].x, h.y - holes[i].y) < 0.05);
    // 落在 MG995 穿板槽內的固定孔沒有意義（那塊材料被切掉了），一併移除。
    const insideCutout = cutouts.some(c => pointInPoly(holes[i], c.points));
    if (overlapsMotorHole || insideCutout) holes.splice(i, 1);
  }

  if (mountOutlines.length && barAxis) {
    // 兩點機架＝明確的固定桿，沿桿方向延長／加寬圓角矩形，包住馬達安裝孔與切口。
    // 維持平直的組立邊，不再自動收窄成錐形支架板。
    let minAlong = 0, maxAlong = barAxis.len, halfWidth = frameR;
    mountOutlines.flat().forEach(p => {
      const dx = p.x - barAxis.a.x, dy = p.y - barAxis.a.y;
      const along = dx * barAxis.ux + dy * barAxis.uy;
      const across = Math.abs(dx * -barAxis.uy + dy * barAxis.ux);
      minAlong = Math.min(minAlong, along);
      maxAlong = Math.max(maxAlong, along);
      halfWidth = Math.max(halfWidth, across);
    });
    const start = { x: barAxis.a.x + barAxis.ux * minAlong, y: barAxis.a.y + barAxis.uy * minAlong };
    const end = { x: barAxis.a.x + barAxis.ux * maxAlong, y: barAxis.a.y + barAxis.uy * maxAlong };
    outlines.length = 0;
    outlines.push(frameBarOutline(start, end, halfWidth));
  } else if (mountOutlines.length) {
    // 有馬達座（非兩點主桿）：把機架節點與馬達座角點一起取凸包，再做一次圓角等距外擴。
    // 不對「已外擴的外形」再取尖角凸包，才不會產生歪斜尖楔。
    const seeds = [...nodes, ...mountOutlines.flat()];
    const base = hull(seeds);
    outlines.length = 0;
    if (base.length >= 3) outlines.push(roundedOffsetHull(base, Math.max(18, frameR)));
    else if (base.length) outlines.push(roundPadOutline(base[0], Math.max(18, frameR)));
  }

  if (!outlines.length) return null;
  // 固定孔貼近槽緣一樣是薄肉，警告時把槽邊當外緣一起檢查。
  const sized = sizeFrameOutline(outlines,nodes);
  const warnEdges = [...sized.outlines, ...cutouts.map(c => c.points)];
  return { ...sized, cutouts, holes, warnings: frameWarnings(warnEdges, holes) };
}

// 接合邊沿用實際圓角矩形外框；自動與手動尺寸使用同一幾何。
export function frameOutlineEdges(frameNodes, settings = {}) {
  return frameGeometry(frameNodes,settings)?.straightEdges || [];
}

export function inspectFrameExport(frameNodes, settings, motorMounts = []) {
  return frameGeometry(frameNodes, settings, motorMounts);
}

// 靜態結構板：三點桿有 ≥2 個機架固定點＝使用者畫的機架本體（整片板都是靜止剛體）。
export function isStaticPlate(comp) {
  return Boolean(comp && comp.type === 'triangle' &&
    ['p1', 'p2', 'p3'].filter(k => comp[k] && comp[k].type === 'fixed').length >= 2);
}

// 馬達安裝特徵的宿主分派：
// 1. bar.motorMountPoint = 馬達軸心接點 id → 該機架桿承載（顯式宣告）。
// 2. 馬達軸心是某塊靜態結構板的頂點 → 該板承載（馬達就鎖在板上，無需宣告）。
// hosted：宿主零件 id → mounts；free：仍由自動地基（frame.dxf）承載。
export function splitMountsByHost(comps, mounts = []) {
  const hosted = new Map();
  const free = [];
  (mounts || []).forEach(m => {
    // `frameBody` is explicit assembly semantics for a riding motor. Prefer it
    // over the moving motor-centre lookup used by older snapshots.
    const host = m?.frameBody
      ? (comps || []).find(c => c && c.id === m.frameBody)
      : (m && m.pointId
        ? ((comps || []).find(c => c && c.type === 'bar' && c.motorMountPoint === m.pointId)
          || (comps || []).find(c => isStaticPlate(c) && ['p1', 'p2', 'p3'].some(k => c[k] && c[k].id === m.pointId)))
        : null);
    if (host) {
      if (!hosted.has(host.id)) hosted.set(host.id, []);
      hosted.get(host.id).push(m);
    } else {
      free.push(m);
    }
  });
  return { hosted, free };
}

// 宿主機架桿幾何：桿局部座標（p1 在原點、+X 沿桿軸），複用 frameGeometry 的
// 「沿桿軸延長/加寬＋槽內固定孔剔除」邏輯，讓桿本體、端點孔與馬達穿板特徵成為同一塊料。
export function hostedBarGeometry(comp, pts, settings, mounts = [], extraHoles = []) {
  const a = pointForExport(comp, 'p1', pts);
  const b = pointForExport(comp, 'p2', pts);
  if (!a || !b) return null;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len <= 1e-6) return null;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const barAngleDeg = Math.atan2(uy, ux) * 180 / Math.PI;
  const toLocal = p => ({
    x: (p.x - a.x) * ux + (p.y - a.y) * uy,
    y: -(p.x - a.x) * uy + (p.y - a.y) * ux
  });
  const localMounts = (mounts || [])
    .filter(m => m && m.center && Number.isFinite(m.center.x) && Number.isFinite(m.center.y))
    .map(m => ({ ...m, center: toLocal(m.center), rotDeg: (Number(m.rotDeg) || 0) + barAngleDeg }));
  if (!localMounts.length) return null;
  const normalized = normalizeExportSettings(settings);
  const geometry = frameGeometry([{ x: 0, y: 0 }, { x: len, y: 0 }], {
    ...normalized,
    barWidthMm: memberStock(comp).widthMm
  }, localMounts);
  if (comp.isInput && comp.motorType === 'mg995') {
    ['p1', 'p2'].forEach((key, i) => {
      if (!comp[key]?.physicalMotor) return;
      const x = i ? len : 0;
      geometry.holes = geometry.holes.filter(h => !(h.layer === 'HOLE' && Math.hypot(h.x - x, h.y) < 1e-6));
      geometry.holes.push(...servoHornHoles(settings, x).map(({ kind, ...hole }) => hole));
    });
  }
  const extra = adapterHoleSpecs(extraHoles);
  // 轉接座孔：桿局部座標（p1 在原點、+X 沿桿軸）；不改 frameGeometry 回傳物件的其他欄位。
  return geometry && extra.length
    ? { ...geometry, holes: [...geometry.holes, ...extra.map(h => ({ x: h.x, y: h.y, r: h.r, layer: h.layer }))] }
    : geometry;
}

export function frameExportWarnings(frameNodes, settings, motorMounts = []) {
  return inspectFrameExport(frameNodes, settings, motorMounts)?.warnings || [];
}

function boundsForFrame(geometry) {
  const xs = [], ys = [];
  geometry.outlines.flat().forEach(p => { xs.push(p.x); ys.push(p.y); });
  (geometry.cutouts || []).forEach(c => c.points.forEach(p => { xs.push(p.x); ys.push(p.y); }));
  geometry.holes.forEach(h => {
    xs.push(h.x - h.r, h.x + h.r);
    ys.push(h.y - h.r, h.y + h.r);
  });
  const pad = 4;
  return {
    minX: Math.min(...xs) - pad,
    maxX: Math.max(...xs) + pad,
    minY: Math.min(...ys) - pad,
    maxY: Math.max(...ys) + pad
  };
}

function svgForFrame(frameNodes, settings, motorMounts) {
  const geometry = frameGeometry(frameNodes, settings, motorMounts);
  if (!geometry) return null;
  return svgForFrameGeometry(geometry, 'frame');
}

function svgForFrameGeometry(geometry, title) {
  const b = boundsForFrame(geometry);
  const width = round(b.maxX - b.minX);
  const height = round(b.maxY - b.minY);
  const paths = geometry.outlines.map(points => `    <path d="${svgPolyline(points)}" />`).join('\n');
  const cutouts = (geometry.cutouts || []).map(c =>
    `    <path d="${svgPolyline(c.points)}" data-layer="${esc(c.layer)}" />`).join('\n');
  const holes = geometry.holes.map(h =>
    `    <circle cx="${h.x}" cy="${h.y}" r="${h.r}" data-layer="${esc(h.layer)}" />`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="${round(b.minX)} ${round(b.minY)} ${width} ${height}">
  <title>${esc(title)}</title>
  <g fill="none" stroke="#000" stroke-width="0.25">
${paths}
${cutouts ? cutouts + '\n' : ''}${holes}
  </g>
</svg>
`;
}

function stockDescription(comp) {
  return `材料與尺寸：${memberStockLabel(comp)}`;
}

function stockComment(comp) {
  const stock = memberStock(comp);
  return `STOCK material=${stock.material} widthMm=${stock.widthMm} thicknessMm=${stock.thicknessMm}`;
}

function addSvgStockDescription(svg, comp) {
  return svg.replace('</title>', `</title>\n  <desc>${esc(stockDescription(comp))}</desc>`);
}

function addDxfStockComment(dxf, comp) {
  return `${dxfPair(999, stockComment(comp))}\n${dxf}`;
}

function dxfForFrame(frameNodes, settings, motorMounts) {
  const geometry = frameGeometry(frameNodes, settings, motorMounts);
  if (!geometry) return null;
  return dxfForFrameGeometry(geometry);
}

function dxfForFrameGeometry(geometry) {
  return [
    dxfPair(0, 'SECTION'),
    dxfPair(2, 'HEADER'),
    dxfPair(9, '$INSUNITS'),
    dxfPair(70, 4),
    dxfPair(0, 'ENDSEC'),
    dxfPair(0, 'SECTION'),
    dxfPair(2, 'ENTITIES'),
    ...geometry.outlines.map(points => dxfPolyline(points, 'FRAME_CUT')),
    ...(geometry.cutouts || []).map(c => dxfPolyline(c.points, c.layer)),
    ...geometry.holes.map(h => dxfCircle(h.x, h.y, h.r, h.layer)),
    dxfPair(0, 'ENDSEC'),
    dxfPair(0, 'EOF')
  ].join('\n') + '\n';
}

function dxfForLink(comp, length, settings, extraHoles = []) {
  const stock = memberStock(comp);
  const r = round(stock.widthMm / 2, 3);
  const holes = linkHoleSpecs(comp, length, settings, extraHoles);
  const outline = [
    { x: 0, y: r },
    { x: length, y: r },
    ...arcPoints(length, 0, r, 90, -90, 18).slice(1),
    { x: 0, y: -r },
    ...arcPoints(0, 0, r, -90, -270, 18).slice(1)
  ];
  return [
    dxfPair(999, stockComment(comp)),
    dxfPair(0, 'SECTION'),
    dxfPair(2, 'HEADER'),
    dxfPair(9, '$INSUNITS'),
    dxfPair(70, 4),
    dxfPair(0, 'ENDSEC'),
    dxfPair(0, 'SECTION'),
    dxfPair(2, 'ENTITIES'),
    dxfPolyline(outline, 'CUT'),
    ...holes.map(h => h.kind === 'tt-shaft-flat'
      ? dxfPolyline(ttShaftFlatPoints(h.x, h.y, h.settings, 18), 'TT_SHAFT_FLAT')
      : dxfCircle(h.x, h.y, h.r, h.layer || 'HOLE')),
    dxfPair(0, 'ENDSEC'),
    dxfPair(0, 'EOF')
  ].join('\n') + '\n';
}

export function inspectLinkExport(comp, length, settings = {}, extraHoles = []) {
  const safeLength = Number.isFinite(Number(length)) && Number(length) > 0 ? Number(length) : 1;
  const outline = barOutline({ x: 0, y: 0 }, { x: safeLength, y: 0 }, memberStock(comp).widthMm / 2);
  const holes = [];
  const cutouts = [];
  linkHoleSpecs(comp, safeLength, settings, extraHoles).forEach(hole => {
    if (hole.kind === 'tt-shaft-flat') {
      cutouts.push({ points: ttShaftFlatPoints(hole.x, hole.y, hole.settings), layer: 'TT_SHAFT_FLAT' });
    } else {
      holes.push({ ...holeMetadata(hole), x: hole.x, y: hole.y, r: hole.r, layer: hole.layer || 'HOLE' });
    }
  });
  return { outlines: [outline], holes, cutouts };
}

export function exportLinksAsSvg(comps, pts, params, settings, mounts = [], extras = null) {
  assertFusionFeatures(comps,mounts,extras);
  exportableGears(comps,params,settings);
  const { hosted } = splitMountsByHost(comps, mounts);
  const extraOf = comp => (extras && extras.linkHoles && extras.linkHoles[comp.id]) || [];
  const plateHolesOf = comp => (extras && extras.plateHoles && extras.plateHoles[comp.id]) || [];
  const links = exportableLinks(comps, pts, params);
  links.forEach(({ comp, length }) => {
    // 宿主機架桿：桿身直接帶馬達穿板特徵（同一塊料），其餘桿件走一般路徑。
    const hostGeometry = hosted.has(comp.id) ? hostedBarGeometry(comp, pts, settings, hosted.get(comp.id), extraOf(comp)) : null;
    const text = hostGeometry
      ? addSvgStockDescription(svgForFrameGeometry(hostGeometry, comp.id), comp)
      : svgForLink(comp, length, settings, extraOf(comp));
    downloadText(text, `${safeName(comp.id)}.svg`, 'image/svg+xml');
  });
  const plates = exportablePlates(comps, pts);
  plates.forEach(({ comp, points }) => {
    downloadText(svgForPlate(comp, points, settings, hosted.get(comp.id), plateHolesOf(comp)), `${safeName(comp.id)}.svg`, 'image/svg+xml');
  });
  const gears = exportableGears(comps, params, settings);
  gears.forEach(({ comp, geometry, fusedPlate }) => {
    downloadText(fusedPlate ? addSvgStockDescription(svgForGear(comp,geometry),fusedPlate) : svgForGear(comp, geometry), `${safeName(comp.id)}.svg`, 'image/svg+xml');
  });
  const racks = exportableRacks(comps, params);
  racks.forEach(({ comp, geometry }) => {
    downloadText(svgForRack(comp, geometry), `${safeName(comp.id)}.svg`, 'image/svg+xml');
  });
  return links.length + plates.length + gears.length + racks.length;
}

export function exportLinksAsDxf(comps, pts, params, settings, mounts = [], extras = null) {
  assertFusionFeatures(comps,mounts,extras);
  exportableGears(comps,params,settings);
  const { hosted } = splitMountsByHost(comps, mounts);
  const extraOf = comp => (extras && extras.linkHoles && extras.linkHoles[comp.id]) || [];
  const plateHolesOf = comp => (extras && extras.plateHoles && extras.plateHoles[comp.id]) || [];
  const links = exportableLinks(comps, pts, params);
  links.forEach(({ comp, length }) => {
    const hostGeometry = hosted.has(comp.id) ? hostedBarGeometry(comp, pts, settings, hosted.get(comp.id), extraOf(comp)) : null;
    const text = hostGeometry
      ? addDxfStockComment(dxfForFrameGeometry(hostGeometry), comp)
      : dxfForLink(comp, length, settings, extraOf(comp));
    downloadText(text, `${safeName(comp.id)}.dxf`, 'application/dxf');
  });
  const plates = exportablePlates(comps, pts);
  plates.forEach(({ comp, points }) => {
    downloadText(dxfForPlate(comp, points, settings, hosted.get(comp.id), plateHolesOf(comp)), `${safeName(comp.id)}.dxf`, 'application/dxf');
  });
  const gears = exportableGears(comps, params, settings);
  gears.forEach(({ comp, geometry, fusedPlate }) => {
    downloadText(fusedPlate ? addDxfStockComment(dxfForGear(comp,geometry),fusedPlate) : dxfForGear(comp, geometry), `${safeName(comp.id)}.dxf`, 'application/dxf');
  });
  const racks = exportableRacks(comps, params);
  racks.forEach(({ comp, geometry }) => {
    downloadText(dxfForRack(comp, geometry), `${safeName(comp.id)}.dxf`, 'application/dxf');
  });
  return links.length + plates.length + gears.length + racks.length;
}

// L4 CNC 檢查用：與 exportLinksAsDxf 輸出同一批零件（桿件含宿主桿、板件、齒輪）的孔與開口。
export function cncPartsForExport(comps, pts, params, settings, mounts = [], extras = null) {
  assertFusionFeatures(comps,mounts,extras);
  const { hosted } = splitMountsByHost(comps, mounts);
  const extraOf = comp => (extras && extras.linkHoles && extras.linkHoles[comp.id]) || [];
  const plateHolesOf = comp => (extras && extras.plateHoles && extras.plateHoles[comp.id]) || [];
  const holesOf = g => ((g && g.holes) || []).map(h => ({ ...h, layer: h.layer || 'HOLE' }));
  const cutoutsOf = g => (g && g.cutouts) || [];
  const parts = [];
  exportableLinks(comps, pts, params).forEach(({ comp, length }) => {
    const hostGeometry = hosted.has(comp.id) ? hostedBarGeometry(comp, pts, settings, hosted.get(comp.id), extraOf(comp)) : null;
    const g = hostGeometry || inspectLinkExport(comp, length, settings, extraOf(comp));
    parts.push({ name: safeName(comp.id), holes: holesOf(g), cutouts: cutoutsOf(g) });
  });
  exportablePlates(comps, pts).forEach(({ comp, points }) => {
    const g = inspectPlateExport(comp, points, settings, hosted.get(comp.id), plateHolesOf(comp));
    parts.push({ name: safeName(comp.id), holes: holesOf(g), cutouts: cutoutsOf(g) });
  });
  exportableGears(comps, params, settings).forEach(({ comp, geometry }) => {
    parts.push({ name: safeName(comp.id), holes: holesOf(geometry), cutouts: cutoutsOf(geometry) });
  });
  exportableRacks(comps, params).forEach(({ comp, geometry }) => {
    parts.push({ name: safeName(comp.id), holes: holesOf(geometry), cutouts: cutoutsOf(geometry) });
  });
  return parts;
}

export function exportFrameAsSvg(frameNodes, settings, motorMounts = [], name = 'frame') {
  const svg = svgForFrame(frameNodes, settings, motorMounts);
  if (!svg) return 0;
  downloadText(svg, `${name}.svg`, 'image/svg+xml');
  return 1;
}

export function exportFrameAsDxf(frameNodes, settings, motorMounts = [], name = 'frame') {
  const dxf = dxfForFrame(frameNodes, settings, motorMounts);
  if (!dxf) return 0;
  downloadText(dxf, `${name}.dxf`, 'application/dxf');
  return 1;
}
