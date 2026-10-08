import { faceBracketPlan } from '../blocks/face-bracket-extras.js';
import { faceBracketBoxes } from './face-brackets.js';
/**
 * blocks3d / orthogonal-3d（O6）
 *
 * 純函式：直角安裝（mount.orient）的子模組在 3D 預覽裡「立起來 90°」要用的資料。
 * 不依賴 THREE、不碰 DOM。
 *
 * 場景座標慣例（viewer／scene-model）：x、y＝該平面的 2D 世界 mm，z＝疊層高度。
 * 子模組平面的場景 (x, y, w) → 宿主場景座標，是個仿射變換（assembly.js orthogonalFrame）：
 *   P = origin + ((p−base)·e)·d + ((p−base)·f)·n + w·m
 * 欄向量：Mx = e.x·d + f.x·n、My = e.y·d + f.y·n、Mw = m；平移 T = origin − base.x·Mx − base.y·My。
 */

import { orthogonalFrame, orthogonalHostEdge, planeOf, compsInPlane, pointIdsInPlane } from '../blocks/assembly.js?v=20261007_m5a';
import { bracketBoxes, bracketScrews } from '../blocks/orthogonal-joint.js';

export const IDENTITY_4 = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

// 4x4 欄主序矩陣相乘：a × b（先套 b、再套 a）。
export function multiply4(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = sum;
    }
  }
  return out;
}

// 把 4x4（欄主序）套到點上。
export function applyMatrix4(m, p) {
  return {
    x: m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12],
    y: m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13],
    z: m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14]
  };
}

// orthogonalFrame 的結果 → 子場景 (x, y, w) 對宿主場景的 4x4（欄主序，可直接給 THREE.Matrix4.fromArray）。
// zOffset：宿主本體底面在宿主場景的 z（frame.origin.z=0 對應的位置）；wOffset：子場景 w 的整體平移（沿 m）。
export function orthogonalMatrix(frame, zOffset = 0, wOffset = 0) {
  if (!frame) return null;
  const { origin, d, m, n, base, e, f } = frame;
  const mx = { x: e.x * d.x + f.x * n.x, y: e.x * d.y + f.x * n.y, z: e.x * d.z + f.x * n.z };
  const my = { x: e.y * d.x + f.y * n.x, y: e.y * d.y + f.y * n.y, z: e.y * d.z + f.y * n.z };
  const tx = origin.x - base.x * mx.x - base.y * my.x + wOffset * m.x;
  const ty = origin.y - base.x * mx.y - base.y * my.y + wOffset * m.y;
  const tz = origin.z - base.x * mx.z - base.y * my.z + wOffset * m.z + zOffset;
  return [
    mx.x, mx.y, mx.z, 0,
    my.x, my.y, my.z, 0,
    m.x, m.y, m.z, 0,
    tx, ty, tz, 1
  ];
}

// 把「全域」預覽輸入（links/pts/…）切成某個平面的輸入（plane＝null 為主平面）。
// 只做過濾：點與零件依 planeOf 分；馬達安裝座等以 id 查表的結構原樣保留。
export function planeInputs(inputs, comps, modules, plane) {
  const ids = pointIdsInPlane(comps, modules, plane);
  const compIds = new Set(compsInPlane(comps, modules, plane).map(c => c.id));
  const inPlane = id => ids.has(id);
  const pts = {};
  for (const id in (inputs.pts || {})) if (ids.has(id)) pts[id] = inputs.pts[id];
  const keepSet = set => new Set([...(set || [])].filter(inPlane));
  return {
    ...inputs,
    pts,
    links: (inputs.links || []).filter(l => inPlane(l.p1) && inPlane(l.p2)),
    polygons: (inputs.polygons || []).filter(pg => (pg.points || []).every(inPlane)),
    groundIds: keepSet(inputs.groundIds),
    motorCenterIds: keepSet(inputs.motorCenterIds),
    sliders: (inputs.sliders || []).filter(x => compIds.has(x.id)),
    gears: (inputs.gears || []).filter(x => compIds.has(x.id)),
    racks: (inputs.racks || []).filter(x => compIds.has(x.id)),
    cams: (inputs.cams || []).filter(x => compIds.has(x.id)),
    pulleys: (inputs.pulleys || []).filter(x => compIds.has(x.id)),
    belts: (inputs.belts || []).filter(x => compIds.has(x.id))
  };
}

// 子場景裡最低的零件 z（馬達沉在背面不算）；沒有零件回 0。
export function modelMinZ(model) {
  let min = Infinity;
  ['sticks', 'plates', 'rails', 'carriages', 'gears', 'racks', 'pulleys', 'cams'].forEach(k => {
    (model[k] || []).forEach(part => { if (Number.isFinite(part.z) && part.z < min) min = part.z; });
  });
  return Number.isFinite(min) ? min : 0;
}

export function orthogonalModuleIds(modules) {
  return (Array.isArray(modules) ? modules : [])
    .filter(m => m && m.mount && (m.mount.face || (m.mount.orient && m.mount.orient.type === 'orthogonal')))
    .map(m => m.id);
}

/**
 * 為每個直角安裝的子模組建一個子場景模型與它對主場景的 4x4。
 * @param {Object} args
 * @param {Array}  args.comps, args.modules
 * @param {Object} args.inputs     全域預覽輸入（pts 為所有平面的解）
 * @param {Object} args.mainModel  主平面的場景模型（找宿主本體的 z）
 * @param {(planeInputs:Object)=>Object} args.buildModel  以平面輸入建場景模型
 * @returns {Array<{ id, matrix:number[16], model, brackets:Array, screws:Array }>}  brackets＝金屬角碼方塊（F1，主場景座標，G2 起帶 hole），screws＝鎖角碼的螺絲（G2）
 *          巢狀（孫模組裝在子模組上）時矩陣已逐層相乘，全部相對於主場景。
 */
// C1：宿主那一片（桿＝stick、三角板＝頂點相同的 plate、機架板＝model.frame）底面在宿主場景的 z；找不到回 0。
// D2：已安裝模組的底板（<id>-frame）3D 裡沒有獨立的板：它墊在該模組所有零件的最下面，
// 所以底面 z＝這個模組最低那一片的 z 再往下一個板厚。模組在這個場景裡找不到任何零件時回 null。
// G1：模組零件在場景裡最低的 z（不含底板）；找不到零件回 null。
export function moduleLowestZ(model, comps, moduleId) {
  if (!model || !Array.isArray(comps)) return null;
  const own = comps.filter(c => c && c.moduleId === moduleId);
  if (!own.length) return null;
  const ids = new Set(own.map(c => c.id));
  const plateKeys = new Set(own.filter(c => c.type === 'triangle' && c.p1 && c.p2 && c.p3).map(c => [c.p1.id, c.p2.id, c.p3.id].sort().join(',')));
  const zs = [];
  const take = list => (list || []).forEach(q => { if (q && Number.isFinite(q.z)) zs.push(q.z); });
  take((model.sticks || []).filter(q => ids.has(q.id)));
  take((model.gears || []).filter(q => ids.has(q.id)));
  take((model.racks || []).filter(q => ids.has(q.id)));
  take((model.plates || []).filter(q => Array.isArray(q.ids) && plateKeys.has([...q.ids].sort().join(','))));
  return zs.length ? Math.min(...zs) : null;
}

export function moduleFrameZ(model, comps, moduleId) {
  // G1：場景裡已經畫了這個模組的底板（model.modulePlates）就直接用它的底面 z。
  const drawn = model && Array.isArray(model.modulePlates) ? model.modulePlates.find(p => p && p.moduleId === moduleId) : null;
  if (drawn && Number.isFinite(drawn.z)) return drawn.z;
  const low = moduleLowestZ(model, comps, moduleId);
  if (low === null) return null;
  const t = Number.isFinite(model.plateThickness) ? model.plateThickness : 3;
  return low - t;
}

// G1：把這個平面（plane＝null 為主平面）上已安裝模組的固定板放進場景模型（model.modulePlates）：
// 板墊在該模組所有零件的正下面（頂面貼著最低那一片，底面 z＝最低零件 z − 板厚）。找不到零件的模組略過。
// plates：mountedFramePlates 的結果（每片 { moduleId, plane, outline, holes, cutouts, thicknessMm }）。
export function attachModulePlates(model, comps, plates, plane = null) {
  if (!model) return model;
  model.modulePlates = (Array.isArray(plates) ? plates : []).filter(p => p && (p.plane == null ? null : p.plane) === plane).map(p => {
    const low = moduleLowestZ(model, comps, p.moduleId);
    return low === null ? null : { ...p, z: low - p.thicknessMm };
  }).filter(Boolean);
  return model;
}

function hostBodyZ(model, edge, comps) {
  if (!edge || !model) return 0;
  const fin = v => Number.isFinite(v) ? v : 0;
  if (edge.kind === 'frame') {
    const own = edge.frameModule ? moduleFrameZ(model, comps, edge.frameModule) : null;
    return own !== null ? own : fin(model.frame && model.frame.z);
  }
  const stick = (model.sticks || []).find(s => s.id === edge.compId);
  if (stick) return fin(stick.z);
  const rack = (model.racks || []).find(s => s.id === edge.compId);
  if (rack) return fin(rack.z);
  const c = comps.find(x => x && x.id === edge.compId);
  if (c && c.type === 'triangle') {
    const key = [c.p1, c.p2, c.p3].map(p => p && p.id).sort().join(',');
    const pl = (model.plates || []).find(q => Array.isArray(q.ids) && [...q.ids].sort().join(',') === key);
    if (pl) return fin(pl.z);
  }
  return 0;
}

// F1：把角碼方塊（宿主平面座標，z 以宿主本體底面為 0）放進主場景：z 加上宿主本體的 z，再乘宿主平面的矩陣（巢狀時）。
// 軸向只取矩陣的線性部分（剛體，不縮放）。
function placeBox(matrix, zOffset, box, moduleId) {
  const c = applyMatrix4(matrix, { x: box.center.x, y: box.center.y, z: box.center.z + zOffset });
  const rot = a => ({
    x: matrix[0] * a.x + matrix[4] * a.y + matrix[8] * a.z,
    y: matrix[1] * a.x + matrix[5] * a.y + matrix[9] * a.z,
    z: matrix[2] * a.x + matrix[6] * a.y + matrix[10] * a.z
  });
  const out = { moduleId, center: c, axes: box.axes.map(rot), size: { ...box.size } };
  // G2：螺牙孔（中心要平移、軸向只轉不平移）
  if (box.hole) out.hole = { center: applyMatrix4(matrix, { x: box.hole.center.x, y: box.hole.center.y, z: box.hole.center.z + zOffset }), axis: rot(box.hole.axis), diameterMm: box.hole.diameterMm };
  return out;
}

// G2：螺絲（頭座點、尖端）放進主場景，座標變換同 placeBox；尺寸欄位原樣帶過。
function placeScrew(matrix, zOffset, screw, moduleId) {
  const at = p => applyMatrix4(matrix, { x: p.x, y: p.y, z: p.z + zOffset });
  return { ...screw, moduleId, head: at(screw.head), tip: at(screw.tip) };
}

export function buildOrthogonalChildren({ comps, modules, inputs, mainModel, buildModel, asm = null, params, joint, stockMm = 3, plates = [], plan = null, exportSettings = {} }) {
  const ids = orthogonalModuleIds(modules);
  if (!ids.length) return [];
  const done = new Map();   // plane id -> { model, matrix } | null（null＝算不出，後代也略過）
  done.set(null, { model: mainModel, matrix: IDENTITY_4 });
  const solve = (id, trail = new Set()) => {
    if (done.has(id)) return done.get(id);
    if (trail.has(id)) return null;
    trail.add(id);
    let result = null;
    const mod = modules.find(m => m.id === id);
    const frame = orthogonalFrame(comps, modules, id, inputs.pts, params, { asm });
    if (mod && frame) {
      const hostPlane = planeOf(comps, modules, mod.mount.to.module);
      const host = hostPlane === null ? done.get(null) : solve(hostPlane, trail);
      if (host) {
        if (mod.mount.face) {
          const face = mod.mount.face;
          const output = modules.find(m => m.id === mod.mount.to.module)?.outputs?.find(o => o.id === mod.mount.to.output);
          // 齒條既有預覽採全域厚度；六面接合使用確認時的加工板厚，保持可見面與間距一致。
          const hostRack = host.model.racks?.find(r => r.id === output?.body?.id);
          if (hostRack) hostRack.thickness = face.hostThicknessMm;
          const model = buildModel(planeInputs(inputs, comps, modules, id));
          attachModulePlates(model, comps, plates, id);
          const childZ = moduleFrameZ(model, comps, id);
          if (childZ === null || !output?.body?.id) { done.set(id, null); return null; }
          const hostCenterZ = hostBodyZ(host.model, { compId: output.body.id }, comps) + face.hostThicknessMm / 2;
          const childCenterZ = childZ + face.childThicknessMm / 2;
          result = { model, matrix: multiply4(host.matrix, orthogonalMatrix(frame, hostCenterZ, -childCenterZ)), brackets: [], screws: [] };
          const drilling=faceBracketPlan(comps,modules,params,mod,{stockMm,exportSettings});
          const R=face.rotation,T=face.translation;
          const inverse=[R[0][0],R[0][1],R[0][2],0,R[1][0],R[1][1],R[1][2],0,R[2][0],R[2][1],R[2][2],0,
            -(R[0][0]*T.x+R[1][0]*T.y+R[2][0]*T.z),-(R[0][1]*T.x+R[1][1]*T.y+R[2][1]*T.z),-(R[0][2]*T.x+R[1][2]*T.y+R[2][2]*T.z),1];
          const placement=multiply4(multiply4(host.matrix,orthogonalMatrix(frame,hostCenterZ,0)),inverse);
          result.brackets=faceBracketBoxes(drilling).map(b=>placeBox(placement,0,b,id));
          done.set(id, result); return result;
        }
        const zOffset = hostBodyZ(host.model, orthogonalHostEdge(comps, modules, mod.mount, inputs.pts, params, { asm }), comps);
        const model = buildModel(planeInputs(inputs, comps, modules, id));
        // G1：這個平面上已安裝模組的固定板（含子模組自己的底板）；板要墊在零件正下面，所以 w 的起點改成板的底面。
        attachModulePlates(model, comps, plates, id);
        const lowest = Math.min(modelMinZ(model), ...model.modulePlates.map(p => p.z));
        // 子場景最低層貼在宿主桿側面（w≥0），不要穿進桿身。
        // D3：立在板面上（edge 'child'）時底板正面本來就貼齊宿主的邊，不能再往外抬，否則板會懸空離開邊；
        //     但有畫底板時，底板（厚 T）正好佔 w∈[0,T]，零件疊在它上面，所以仍照最低點抬。
        const standing = mod.mount.orient.edge === 'child';
        const wOffset = standing && !model.modulePlates.length ? 0 : Math.max(0, -lowest);
        // F1／G1：這個模組的金屬角碼方塊（主場景座標）；列印版接合沒有。短腳貼在「畫出來的」底板朝宿主的那一面（w＝板底面）。
        const own = model.modulePlates.find(p => p.moduleId === id);
        const seatPlan = own ? { parts: [{ name: `${id}-frame`, zMm: own.z + wOffset }] } : plan;
        const brackets = bracketBoxes(comps, modules, id, inputs.pts, params, { stockMm, joint, asm, plan: seatPlan }).map(b => placeBox(host.matrix, zOffset, b, id));
        // G2：鎖角碼的 M3 螺絲（頭在木板外側面、尖端穿出角碼），同一套座標與位姿。
        const screws = bracketScrews(comps, modules, id, inputs.pts, params, { stockMm, joint, asm, plan: seatPlan }).map(sc => placeScrew(host.matrix, zOffset, sc, id));
        result = { model, matrix: multiply4(host.matrix, orthogonalMatrix(frame, zOffset, wOffset)), brackets, screws };
      }
    }
    done.set(id, result);
    return result;
  };
  return ids.map(id => {
    const r = solve(id);
    return r ? { id, matrix: r.matrix, model: r.model, brackets: r.brackets || [], screws: r.screws || [] } : null;
  }).filter(Boolean);
}
