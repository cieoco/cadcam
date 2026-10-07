import { deriveMotorMounts } from './build-plan.js?v=20261007_7';
/**
 * Read-only, bounded mounting-surface descriptors derived from the same geometry
 * used by the blocks part exporters. These descriptors describe stock in the
 * mechanism's home XY reference frame; they do not assert that a surface can be
 * mounted in 3D.
 */
import { autoPorts } from './bench.js';
import { moduleFrameExports, moduleFrameNodes } from './assembly.js?v=20261007_m5a';
import { inspectFrameExport, inspectLinkExport, inspectPlateExport, inspectRackExport, splitMountsByHost, hostedBarGeometry } from './exporters.js?v=20261007_7';
import { frameConnectorNodes, pointCoords } from './model.js';
import { memberStock } from './member-stock.js';

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const rad = degrees => degrees * Math.PI / 180;

function stockThickness(comp, exportSettings, fallback) {
  const raw = comp && isRecord(comp.stock) ? comp.stock.thicknessMm : undefined;
  if (comp && (comp.type === 'bar' || comp.type === 'triangle')) return memberStock(comp).thicknessMm;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return memberStock(comp).thicknessMm;
  if (comp) return fallback;
  const setting = exportSettings.stockThicknessMm;
  return typeof setting === 'number' && Number.isFinite(setting) && setting > 0 ? setting : fallback;
}

function transformedGeometry(geometry, transform) {
  if (!geometry || !Array.isArray(geometry.outlines) || !geometry.outlines.length) return null;
  const outlines = geometry.outlines.map(ring => Array.isArray(ring)
    ? ring.map(p => transform(p))
    : null);
  if (outlines.some(ring => !ring || ring.length < 3 || ring.some(p => !finite(p.x) || !finite(p.y)))) return null;
  const cutouts = (Array.isArray(geometry.cutouts) ? geometry.cutouts : []).map(c => ({
    ...c,
    points: Array.isArray(c && c.points) ? c.points.map(p => transform(p)) : null
  }));
  if (cutouts.some(c => !c.points || c.points.length < 3 || c.points.some(p => !finite(p.x) || !finite(p.y)))) return null;
  const holes = (Array.isArray(geometry.holes) ? geometry.holes : []).map(h => {
    const p = transform(h);
    return { ...h, ...p };
  });
  if (holes.some(h => !finite(h.x) || !finite(h.y) || (h.r !== undefined && (!finite(h.r) || h.r <= 0)))) return null;
  return { outlines, cutouts, holes };
}

function geometryFromRack(geometry, rack, pts) {
  const origin = pts[rack.p1.id] || rack.p1;
  if (!origin || !finite(origin.x) || !finite(origin.y)) return null;
  const angle = rad(Number(rack.axisDeg) || 0), c = Math.cos(angle), s = Math.sin(angle);
  return transformedGeometry({ outlines: [geometry.outline], holes: geometry.holes, cutouts: geometry.cutouts }, p => ({
    x: origin.x + p.x * c - p.y * s,
    y: origin.y + p.x * s + p.y * c
  }));
}

function geometryFromBar(geometry, comp, pts) {
  const a = comp.p1 && (pts[comp.p1.id] || comp.p1);
  const b = comp.p2 && (pts[comp.p2.id] || comp.p2);
  if (!a || !b || !finite(a.x) || !finite(a.y) || !finite(b.x) || !finite(b.y)) return null;
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(length > 0)) return null;
  const c = (b.x - a.x) / length, s = (b.y - a.y) / length;
  return transformedGeometry(geometry, p => ({ x: a.x + p.x * c - p.y * s, y: a.y + p.x * s + p.y * c }));
}

function surfaceBox(outlines, thickness) {
  const points = outlines.flat();
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  if (![minX, maxX, minY, maxY].every(Number.isFinite) || !(maxX > minX) || !(maxY > minY)) return null;
  return {
    min: { x: minX, y: minY, z: -thickness / 2 },
    max: { x: maxX, y: maxY, z: thickness / 2 }
  };
}

function validInput({ comps, modules, moduleId, params, exportSettings, thicknessMm }) {
  if (!Array.isArray(comps) || !Array.isArray(modules)) return '請提供有效的零件與機構清單。';
  if (typeof moduleId !== 'string' || !moduleId.trim()) return '請指定要描述的機構。';
  if (!modules.some(m => m && m.id === moduleId)) return '找不到指定的機構。';
  if (!isRecord(params) || !isRecord(exportSettings)) return '參數與匯出設定必須是物件。';
  if (typeof thicknessMm !== 'number' || !Number.isFinite(thicknessMm) || thicknessMm <= 0) return '板厚必須是大於零的有限數值。';
  return null;
}

/**
 * Build frame and output-part descriptors for one module, in home XY and local
 * plate-thickness coordinates. Only exporter-backed bar, triangle, and rack
 * outputs are supported in this first bounded surface mapping.
 */
export function buildMountSurfaces({ comps, modules, moduleId, params, exportSettings = {}, thicknessMm = 3, drilling = false, partId = null } = {}) {
  const reason = validInput({ comps, modules, moduleId, params, exportSettings, thicknessMm });
  if (reason) return { ok: false, reason };

  try {
    const ownComps = comps.filter(c => c && c.moduleId === moduleId);
    const pts = pointCoords(ownComps);
    const module = modules.find(m => m && m.id === moduleId);
    const surfaces = [];
    const entries = moduleFrameExports(comps, modules, params);
    const entry = entries.find(item => item.moduleId === moduleId);
    const frameNodes = entry
      ? moduleFrameNodes(entry, frameConnectorNodes(entry.comps))
      : frameConnectorNodes(ownComps);

    if (frameNodes.length) {
      const geometry = inspectFrameExport(frameNodes, exportSettings, []);
      const transformed = transformedGeometry(geometry, p => ({ x: p.x, y: p.y }));
      const frameThickness = stockThickness(null, exportSettings, thicknessMm);
      const box = transformed && surfaceBox(transformed.outlines, frameThickness);
      if (box) surfaces.push({
        id: `${moduleId}-frame`, name: `${module.name || moduleId} 底板`, moduleId,
        compId: null, kind: 'frame', box, outline: transformed.outlines[0], outlines: transformed.outlines,
        holes: transformed.holes, ports: [],
        warnings: ['底板尚未合併馬達安裝特徵與轉接座孔；此描述不等同完整製作包。']
      });
    }

    const modulePorts = autoPorts(comps, modules, moduleId, params);
    const part = partId && ownComps.find(c => c.id === partId && c.type === 'bar' && [c.p1,c.p2].every(p => p && ['fixed','motor'].includes(p.type)));
    if (partId && partId !== 'frame' && !part) return {ok:false,reason:'找不到指定的固定桿'};
    const outputs = part ? [{id:'face-attach',name:part.name || part.id,at:part.p1.id,body:{kind:'bar',id:part.id}}] : module.outputs;
    for (const output of Array.isArray(outputs) ? outputs : []) {
      const body = output && output.body;
      if (!body || !['bar', 'triangle', 'rack'].includes(body.kind)) {
        return { ok: false, reason: `輸出「${output?.name || output?.id || '未命名'}」目前沒有支援的真實外框。` };
      }
      const comp = ownComps.find(c => c.id === body.id && c.type === body.kind);
      if (!comp) return { ok: false, reason: `找不到輸出「${output.name || output.id}」對應的零件。` };
      let geometry;
      if (body.kind === 'bar') {
        const a = pts[comp.p1?.id] || comp.p1, b = pts[comp.p2?.id] || comp.p2;
        const length = comp.lenParam && finite(params[comp.lenParam]) ? params[comp.lenParam]
          : (a && b ? Math.hypot(b.x - a.x, b.y - a.y) : NaN);
        if (!(length > 0) || !Number.isFinite(length)) return { ok: false, reason: `無法計算輸出「${output.name || output.id}」的桿長。` };
        geometry = geometryFromBar(inspectLinkExport(comp, length, exportSettings), comp, pts);
      } else if (body.kind === 'triangle') {
        const points = [comp.p1, comp.p2, comp.p3].map(p => p && (pts[p.id] || p));
        if (points.every(p => p && finite(p.x) && finite(p.y))) {
          geometry = transformedGeometry(inspectPlateExport(comp, points, exportSettings), p => ({ x: p.x, y: p.y }));
        }
      } else {
        const pinion = comp.pinion ? ownComps.find(c => c && c.type === 'gear' && c.id === comp.pinion) || null : null;
        geometry = geometryFromRack(inspectRackExport(comp, params, pinion), comp, pts);
      }
      const thick = stockThickness(comp, exportSettings, thicknessMm);
      const box = geometry && surfaceBox(geometry.outlines, thick);
      if (!box) return { ok: false, reason: `無法計算輸出「${output.name || output.id}」的真實外框。` };
      const ports = modulePorts.filter(port => port && (
        port.output === output.id || (port.body && port.body.kind === body.kind && port.body.id === body.id)
      ));
      const warnings = body.kind === 'rack' && !(comp.stock && finite(comp.stock.thicknessMm) && comp.stock.thicknessMm > 0)
        ? ['齒條無專屬 stock 厚度，這裡使用加工預設厚度；目前 3D 預覽仍採全域 plateThickness。']
        : [];
      surfaces.push({
        id: `${moduleId}:output:${output.id}`, name: output.name || output.id, moduleId,
        compId: comp.id, kind: 'output', outputId: output.id, body: { kind: body.kind, id: body.id },
        box, outline: geometry.outlines[0], outlines: geometry.outlines, cutouts: geometry.cutouts,
        holes: geometry.holes, ports, warnings
      });
    }

    if (drilling) {
      const mounts = splitMountsByHost(ownComps, deriveMotorMounts(ownComps));
      for (const surface of surfaces) {
        const comp = ownComps.find(c => c.id === surface.compId);
        let exact;
        if (surface.kind === 'frame') exact = inspectFrameExport(frameNodes, exportSettings, mounts.free);
        else if (comp?.type === 'bar') {
          const raw = hostedBarGeometry(comp, pts, exportSettings, mounts.hosted.get(comp.id) || []);
          if (raw) exact = geometryFromBar(raw, comp, pts);
        } else if (comp?.type === 'triangle') exact = inspectPlateExport(comp,[comp.p1,comp.p2,comp.p3].map(p=>pts[p.id] || p),exportSettings,mounts.hosted.get(comp.id) || []);
        if (exact) { surface.holes = exact.holes || []; surface.cutouts = exact.cutouts || []; }
      }
    }
    if (!surfaces.length) return { ok: false, reason: '這個機構目前沒有可描述的固定底板或支援的輸出零件外框。' };
    return { ok: true, surfaces };
  } catch (_) {
    return { ok: false, reason: '無法從目前機構資料計算真實零件外框。' };
  }
}
