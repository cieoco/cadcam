import { check, report } from './_harness.mjs';
import { S, B, fresh, motor } from './_bench-setup.mjs';
import { buildMountSurfaces } from '../js/blocks/mount-surfaces.js';
import { inspectLinkExport, inspectPlateExport, inspectRackExport } from '../js/blocks/exporters.js';
import { frameConnectorNodes } from '../js/blocks/model.js';
import { moduleFrameExports, moduleFrameNodes } from '../js/blocks/assembly.js';

const ex = { holeDiameterMm: 3.2, frameHoleDiameterMm: 3.2, stockThicknessMm: 5 };
const bounds = rings => {
  const pts = rings.flat();
  return {
    minX: Math.min(...pts.map(p => p.x)), maxX: Math.max(...pts.map(p => p.x)),
    minY: Math.min(...pts.map(p => p.y)), maxY: Math.max(...pts.map(p => p.y))
  };
};

// Four-bar tool output: exported link shape transformed from link-local to home XY.
{
  const [mod] = fresh('fourbar-lift');
  const before = JSON.stringify([S.comps, S.modules, S.topo.params]);
  const r = buildMountSurfaces({ comps: S.comps, modules: S.modules, moduleId: mod.id, params: S.topo.params, exportSettings: ex });
  check('四連桿工具架產生真實輸出外框', r.ok && r.surfaces.some(s => s.kind === 'output' && s.outputId === mod.outputs[0].id && s.compId === mod.outputs[0].body.id));
  const output = r.surfaces.find(s => s.kind === 'output');
  check('桿件採用 memberStock 預設厚度', output && output.box.min.z === -2 && output.box.max.z === 2);
  check('工具架 bounds 來自真實 link export', output && (() => {
    const comp = S.comps.find(c => c.id === output.compId), a = comp.p1, b = comp.p2;
    const len = Math.hypot(b.x - a.x, b.y - a.y), c = (b.x - a.x) / len, s = (b.y - a.y) / len;
    const expected = inspectLinkExport(comp, len, ex).outlines[0].map(p => ({ x: a.x + p.x * c - p.y * s, y: a.y + p.x * s + p.y * c }));
    const aBounds = bounds(output.outlines), bBounds = bounds([expected]);
    return ['minX', 'maxX', 'minY', 'maxY'].every(k => Math.abs(aBounds[k] - bBounds[k]) < 1e-6);
  })());
  check('只列出對應輸出或本體的 autoPorts', output && output.ports.length > 0 && output.ports.every(p => p.output === output.outputId || (p.body?.id === output.compId && p.body?.kind === output.body.kind)));
  check('不修改輸入', JSON.stringify([S.comps, S.modules, S.topo.params]) === before);
}

// A real built-in jaw plate can be exposed as an output without inventing its contour.
{
  const [mod] = fresh('gear-gripper');
  const jaw = S.comps.find(c => c.moduleId === mod.id && c.type === 'triangle' && c.shape === 'jaw');
  mod.outputs = [{ id: 'jaw', name: '夾爪', body: { kind: 'triangle', id: jaw.id } }];
  const r = buildMountSurfaces({ comps: S.comps, modules: S.modules, moduleId: mod.id, params: S.topo.params, exportSettings: ex });
  const surface = r.ok && r.surfaces.find(s => s.outputId === 'jaw');
  check('夾爪輸出使用真實 plate outline 與多環欄位', surface && surface.compId === jaw.id && surface.outlines.length >= 1 && surface.outline === surface.outlines[0]);
  check('夾爪板件沿用 memberStock 預設厚度', surface && surface.box.min.z === -2 && surface.box.max.z === 2);
  check('夾爪 bounds 與 inspectPlateExport 一致', surface && (() => {
    const expected = inspectPlateExport(jaw, [jaw.p1, jaw.p2, jaw.p3], ex).outlines;
    const a = bounds(surface.outlines), b = bounds(expected);
    return ['minX', 'maxX', 'minY', 'maxY'].every(k => Math.abs(a[k] - b[k]) < 1e-6);
  })());
}

// Rack output: retain exporter teeth outline, holes and separate cutouts in home coordinates.
{
  const [mod] = fresh('rack-lift');
  const rack = S.comps.find(c => c.id === mod.outputs[0].body.id);
  rack.stock = { widthMm: 22, thicknessMm: 6, material: 'plywood' };
  const r = buildMountSurfaces({ comps: S.comps, modules: S.modules, moduleId: mod.id, params: S.topo.params, exportSettings: ex, thicknessMm: 2 });
  const surface = r.ok && r.surfaces.find(s => s.kind === 'output');
  const geo = inspectRackExport(rack, S.topo.params, S.comps.find(c => c.id === rack.pinion));
  check('齒條槽輪廓與外框分開保留', surface && surface.outlines.length === 1 && surface.cutouts.length === geo.cutouts.length && surface.outline.length === geo.outline.length);
  check('齒條 home XY bounds 與匯出輪廓相符', surface && (() => {
    const angle = (Number(rack.axisDeg) || 0) * Math.PI / 180;
    const p = rack.p1;
    const expected = geo.outline.map(q => ({ x: p.x + q.x * Math.cos(angle) - q.y * Math.sin(angle), y: p.y + q.x * Math.sin(angle) + q.y * Math.cos(angle) }));
    const a = bounds(surface.outlines), b = bounds([expected]);
    return ['minX', 'maxX', 'minY', 'maxY'].every(k => Math.abs(a[k] - b[k]) < 1e-6);
  })());
  check('零件 stock 厚度優先於呼叫端厚度', surface && surface.box.min.z === -3 && surface.box.max.z === 3);
  check('保留真實固定孔', surface && surface.holes.length === geo.holes.length && surface.holes.every(h => Number.isFinite(h.x) && Number.isFinite(h.y) && h.r > 0));
  check('齒條 cutout 座標與 exporter home 變換一致', surface && (() => {
    const angle = (Number(rack.axisDeg) || 0) * Math.PI / 180, p = rack.p1;
    const expected = geo.cutouts[0].points.map(q => ({ x: p.x + q.x * Math.cos(angle) - q.y * Math.sin(angle), y: p.y + q.x * Math.sin(angle) + q.y * Math.cos(angle) }));
    return surface.cutouts[0].layer === geo.cutouts[0].layer && surface.cutouts[0].points.every((q, i) => Math.abs(q.x - expected[i].x) < 1e-6 && Math.abs(q.y - expected[i].y) < 1e-6);
  })());
}

// Racks without member stock use the caller's three-millimetre plate fallback.
{
  const [mod] = fresh('rack-lift');
  const r = buildMountSurfaces({ comps: S.comps, modules: S.modules, moduleId: mod.id, params: S.topo.params });
  const surface = r.ok && r.surfaces.find(s => s.kind === 'output');
  check('無 rack stock 時使用 3 mm 輸入預設', surface && surface.box.min.z === -1.5 && surface.box.max.z === 1.5);
  check('無 rack stock 時提示 3D 預覽厚度契約差異', surface && surface.warnings.some(w => /3D 預覽/.test(w)));
}

// A mounted gripper gets its own frame only; its geometry comes from the actual frame exporter.
{
  const [lift, grip] = fresh('fourbar-lift', 'gear-gripper');
  const mounted = B.connect(S.comps, S.modules, grip.id, { module: lift.id, port: 'edge:ToolBrace_1:R' }, S.topo.params, motor);
  check('測試前置：夾爪成功安裝', mounted.ok);
  const r = buildMountSurfaces({ comps: mounted.comps, modules: mounted.modules, moduleId: grip.id, params: S.topo.params, exportSettings: ex });
  const frame = r.ok && r.surfaces.find(s => s.kind === 'frame');
  const entry = moduleFrameExports(mounted.comps, mounted.modules, S.topo.params).find(e => e.moduleId === grip.id);
  const expectedNodes = moduleFrameNodes(entry, frameConnectorNodes(entry.comps));
  check('夾爪底板外框使用真實 frame nodes 且沒有假造接口', frame && frame.id === `${grip.id}-frame` && frame.ports.length === 0 && expectedNodes.length > 0);
  check('不混入另一機構的底板組件', frame && frame.moduleId === grip.id && frame.compId === null && !r.surfaces.some(s => s.kind === 'frame' && s.moduleId === lift.id));
  check('底板厚度採用 stock 設定', frame && frame.box.min.z === -2.5 && frame.box.max.z === 2.5);
  check('底板標示尚未合併馬達與轉接座特徵', frame && frame.warnings.some(w => /馬達安裝特徵/.test(w)));
}

// Explicit failures for invalid inputs and no supported geometry.
{
  const [mod] = fresh('gear-gripper');
  const ok = args => buildMountSurfaces({ comps: [], modules: [{ id: mod.id, outputs: [] }], moduleId: mod.id, params: S.topo.params, ...args });
  check('拒絕未知機構', !buildMountSurfaces({ comps: S.comps, modules: S.modules, moduleId: 'missing', params: S.topo.params }).ok);
  check('拒絕非法板厚', !ok({ thicknessMm: NaN }).ok);
  check('沒有固定底板與支援輸出時提供白話原因', (() => { const r = ok({}); return !r.ok && typeof r.reason === 'string' && r.reason.length > 0; })());
}

report('mount-surfaces');
