/**
 * blocks / module-plates
 *
 * G1：已安裝模組的「固定板」（<moduleId>-frame，載著它的固定樞軸、馬達開口、宿主螺絲孔與轉接座孔）
 * 的目前姿態幾何，給 3D／2D 畫出來。純函式，不碰 DOM。
 * 幾何與 CNC 匯出同一條管線（moduleFrameExports＋moduleFrameNodes＋馬達安裝特徵＋轉接座孔 → inspectFrameExport，
 * 在 home 姿態算），再用模組的剛體變換搬到目前位姿：同平面安裝＝宿主輸出端目前位姿 vs mount.ref；
 * 直角安裝的子模組在自己的平面靜止＝不變換。
 * 與 assembly.js 互相引用（只在呼叫時用函式，無頂層相依），assembly.js 再轉出 mountedFramePlates。
 */
import { moduleFrameExports, moduleFrameNodes, splitFrameMounts, planeOf, outputPose } from './assembly.js?v=20261007_m5a';
import { deriveMotorMounts, buildPlan } from './build-plan.js?v=20261007_7';
import { inspectFrameExport, splitMountsByHost } from './exporters.js?v=20261007_7';
import { frameConnectorNodes } from './model.js';
import { orthogonalExportExtras, withAdapterNodes } from './orthogonal-joint.js';

const D2R = Math.PI / 180;
const r3 = v => Math.round(v * 1000) / 1000;
const POSE0 = { x: 0, y: 0, a: 0 };

// 剛體變換（與 assembly.js transformPoint 相同）：以 ref 姿態記錄的點 → now 姿態。
function mover(ref, now) {
  const rad = (now.a - ref.a) * D2R, cos = Math.cos(rad), sin = Math.sin(rad);
  return p => {
    const dx = p.x - ref.x, dy = p.y - ref.y;
    return { x: r3(now.x + dx * cos - dy * sin), y: r3(now.y + dx * sin + dy * cos) };
  };
}

// 第一段（home 姿態、與匯出同管線，結構不變就不必重算）：每個已安裝模組固定板的外框／孔／開口。
// 回傳 [{ moduleId, name, plane, geometry: { outlines, holes, cutouts } }]；沒有固定板的模組略過。
export function framePlateHomes(comps, modules, params, { exportSettings = {}, mounts, joint, stockMm } = {}) {
  const list = Array.isArray(comps) ? comps : [];
  const modList = Array.isArray(modules) ? modules : [];
  if (!modList.some(m => m && m.mount)) return [];
  const T = Number.isFinite(Number(stockMm)) && Number(stockMm) > 0 ? Number(stockMm) : 3;
  const allMounts = Array.isArray(mounts) ? mounts : deriveMotorMounts(list);
  const freeSplit = splitFrameMounts(splitMountsByHost(list, allMounts).free, list, modList);
  const extras = orthogonalExportExtras(list, modList, params, { stockMm: T, joint });
  const out = [];
  moduleFrameExports(list, modList, params).forEach(entry => {
    const nodes = withAdapterNodes(entry.moduleId, moduleFrameNodes(entry, frameConnectorNodes(entry.comps)), extras);
    if (!nodes || !nodes.length) return;
    const g = inspectFrameExport(nodes, exportSettings || {}, freeSplit.byModule[entry.moduleId] || []);
    if (!g || !g.outlines || !g.outlines.length) return;
    out.push({
      moduleId: entry.moduleId, name: entry.fileBase, plane: planeOf(list, modList, entry.moduleId), stockMm: T,
      geometry: { outlines: g.outlines, holes: g.holes || [], cutouts: g.cutouts || [] }
    });
  });
  return out;
}

// 第二段（每幀）：把 home 幾何用模組的剛體變換搬到目前位姿；plan 給了就取製作計畫裡 <id>-frame 的厚度與 zMm。
export function placeFramePlates(homes, comps, modules, points, plan = null) {
  const list = Array.isArray(comps) ? comps : [];
  const modList = Array.isArray(modules) ? modules : [];
  const out = [];
  (homes || []).forEach(h => {
    const mod = modList.find(m => m && m.id === h.moduleId);
    if (!mod || !mod.mount) return;
    // 同平面安裝：宿主輸出端目前位姿 vs mount.ref；直角安裝的子模組在自己的平面靜止＝不變換。宿主位姿算不出（宿主無效）就不畫。
    let ref = POSE0, now = POSE0;
    if (!mod.mount.orient && !mod.mount.face) {
      const host = modList.find(m => m && m.id === mod.mount.to.module);
      const pose = host ? outputPose(host, mod.mount.to.output, points, list.filter(c => c && c.moduleId === host.id)) : null;
      if (!pose) return;
      now = pose;
      ref = mod.mount.ref || POSE0;
    }
    const mv = mover(ref, now);
    const g = h.geometry;
    const part = plan && Array.isArray(plan.parts) ? plan.parts.find(p => p && p.name === h.name) : null;
    out.push({
      moduleId: h.moduleId,
      name: h.name,
      plane: h.plane,
      outline: g.outlines[0].map(mv),
      outlines: g.outlines.map(o => o.map(mv)),
      holes: g.holes.map(q => ({ ...mv(q), r: q.r, layer: q.layer })),
      cutouts: g.cutouts.map(c => ({ layer: c.layer, points: c.points.map(mv) })),
      thicknessMm: part && Number(part.thicknessMm) > 0 ? Number(part.thicknessMm) : h.stockMm,
      zMm: part && Number.isFinite(Number(part.zMm)) ? Number(part.zMm) : 0
    });
  });
  return out;
}

// 已安裝模組固定板在目前位姿的幾何（見檔頭）。points＝世界座標點表（求解結果）。
export function mountedFramePlates(comps, modules, points, params, opts = {}) {
  return placeFramePlates(framePlateHomes(comps, modules, params, opts), comps, modules, points, opts.plan || null);
}

// 帶快取的來源（給 app：播放每幀只做第二段）：結構變了（draw 重建）呼叫 invalidate()；
// getArgs() 回傳 { comps, modules, params, exportSettings, joint, stockMm, planArgs }（planArgs＝buildPlan 的引數，只為取 zMm／厚度）。
export function createModulePlateSource(getArgs) {
  let cache = null, key = null;
  const build = mounts => {
    const a = getArgs();
    let plan = null;
    try { plan = buildPlan({ ...a.planArgs, mounts }); } catch (e) { plan = null; }
    return { homes: framePlateHomes(a.comps, a.modules, a.params, { ...a, mounts }), plan };
  };
  return {
    invalidate() { cache = null; key = null; },
    // 結構鍵變了才作廢快取（呼叫端自算便宜的鍵；同一把鍵＝同一份 home 幾何）。
    sync(nextKey) { if (nextKey !== key) { key = nextKey; cache = null; } },
    // mounts：馬達安裝座或回傳它的函式（只在建快取時才呼叫；缺省由 comps 自行規劃）。
    at(points, mounts) {
      const a = getArgs();
      if (!(a.modules || []).some(m => m && m.mount)) return [];
      if (!cache) cache = build(typeof mounts === 'function' ? mounts() : mounts);
      return placeFramePlates(cache.homes, a.comps, a.modules, points, cache.plan);
    },
    plan() { return cache ? cache.plan : null; }
  };
}
