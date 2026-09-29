/**
 * blocks / module-schema
 *
 * 模組資料契約的正規化（SDD-ASSEMBLY-MODULES §3.3、E-M4）。純函式，不改動輸入、
 * 不 import solver／topology——保持 schema.js 這條載入路徑輕量。
 */
import { pointKeysFor } from './part-types.js';

const SAFE_ID = /^[\w.-]+$/u;
const MAX_MODULES = 16;
const MAX_NAME_LEN = 40;
const BODY_KINDS = new Set(['bar', 'triangle', 'rack', 'slider']);

const safeId = v => typeof v === 'string' && SAFE_ID.test(v);
const isFiniteNum = v => Number.isFinite(Number(v));

export function sanitizeName(raw, fallback) {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw.replace(/[<>"'`]/g, '');
  return cleaned.slice(0, MAX_NAME_LEN) || fallback;
}

// 此零件所有點 id（含 holes 內的孔 id）。
function compPointIds(c) {
  const ids = [];
  pointKeysFor(c).forEach(k => { if (c[k] && c[k].id) ids.push(c[k].id); });
  if (Array.isArray(c.holes)) c.holes.forEach(h => { if (h && h.id) ids.push(h.id); });
  return ids;
}

function validateOutput(rawOut, moduleComps, moduleId, usedIds, warnings) {
  if (!rawOut || typeof rawOut !== 'object' || !safeId(rawOut.id) || usedIds.has(rawOut.id)) {
    warnings.push(`模組 ${moduleId} 有輸出端 id 不合法或重複，已捨棄。`);
    return null;
  }
  const body = rawOut.body;
  if (!body || typeof body !== 'object') {
    warnings.push(`模組 ${moduleId} 的輸出端 ${rawOut.id} 缺少 body，已捨棄。`);
    return null;
  }
  let bodyOut = null;
  let pointPool = null;
  if (body.kind === 'points') {
    if (!safeId(body.a) || !safeId(body.b)) {
      warnings.push(`模組 ${moduleId} 的輸出端 ${rawOut.id} 的 points body 缺 a/b，已捨棄。`);
      return null;
    }
    const modulePointIds = new Set();
    moduleComps.forEach(c => compPointIds(c).forEach(id => modulePointIds.add(id)));
    if (!modulePointIds.has(body.a) || !modulePointIds.has(body.b)) {
      warnings.push(`模組 ${moduleId} 的輸出端 ${rawOut.id} 的 points body 不屬於本模組，已捨棄。`);
      return null;
    }
    bodyOut = { kind: 'points', a: body.a, b: body.b };
    pointPool = modulePointIds;
  } else if (BODY_KINDS.has(body.kind)) {
    const bodyComp = safeId(body.id) ? moduleComps.find(c => c.id === body.id && c.type === body.kind) : null;
    if (!bodyComp) {
      warnings.push(`模組 ${moduleId} 的輸出端 ${rawOut.id} 的構件不屬於本模組，已捨棄。`);
      return null;
    }
    bodyOut = { kind: body.kind, id: bodyComp.id };
    pointPool = new Set(compPointIds(bodyComp));
  } else {
    warnings.push(`模組 ${moduleId} 的輸出端 ${rawOut.id} 的 body.kind 不支援，已捨棄。`);
    return null;
  }
  if (!safeId(rawOut.at) || !pointPool.has(rawOut.at)) {
    warnings.push(`模組 ${moduleId} 的輸出端 ${rawOut.id} 的 at 不是 body 上的點，已捨棄。`);
    return null;
  }
  usedIds.add(rawOut.id);
  return { id: rawOut.id, name: sanitizeName(rawOut.name, rawOut.id), at: rawOut.at, body: bodyOut };
}

function validateBase(rawBase, moduleComps) {
  if (!safeId(rawBase)) return null;
  const found = moduleComps.some(c => pointKeysFor(c).some(k => {
    const p = c[k];
    return p && p.id === rawBase && (p.type === 'fixed' || p.type === 'motor');
  }));
  return found ? rawBase : null;
}

function validateMount(rawMount, moduleId, outputsByModule, validModuleIds, warnings) {
  if (!rawMount || typeof rawMount !== 'object') return null;
  const to = rawMount.to;
  if (!to || typeof to !== 'object' || !safeId(to.module) || !safeId(to.output)) {
    warnings.push(`模組 ${moduleId} 的 mount 目標不合法，已改為未安裝。`);
    return null;
  }
  if (to.module === moduleId) {
    warnings.push(`模組 ${moduleId} 的 mount 指向自己，已改為未安裝。`);
    return null;
  }
  if (!validModuleIds.has(to.module) || !(outputsByModule.get(to.module) || new Set()).has(to.output)) {
    warnings.push(`模組 ${moduleId} 的 mount 指向不存在的模組或輸出端，已改為未安裝。`);
    return null;
  }
  const ref = rawMount.ref;
  if (!ref || typeof ref !== 'object' || !isFiniteNum(ref.x) || !isFiniteNum(ref.y) || !isFiniteNum(ref.a)) {
    warnings.push(`模組 ${moduleId} 的 mount.ref 不是有效座標，已改為未安裝。`);
    return null;
  }
  const home = {};
  if (rawMount.home && typeof rawMount.home === 'object') {
    Object.keys(rawMount.home).forEach(k => {
      if (safeId(k) && isFiniteNum(rawMount.home[k])) home[k] = Number(rawMount.home[k]);
    });
  }
  return { to: { module: to.module, output: to.output }, ref: { x: Number(ref.x), y: Number(ref.y), a: Number(ref.a) }, home };
}

export function normalizeModules(rawModules, comps) {
  const warnings = [];
  const srcComps = Array.isArray(comps) ? comps : [];
  let outComps = srcComps.map(c => ({ ...c }));
  const rawList = Array.isArray(rawModules) ? rawModules : [];

  // 最多 16 個模組。
  let list = rawList;
  if (list.length > MAX_MODULES) {
    warnings.push(`模組數量超過 ${MAX_MODULES} 個，多出的已捨棄。`);
    list = list.slice(0, MAX_MODULES);
  }

  // id 安全且不重複。
  const seenIds = new Set();
  const stage1 = [];
  list.forEach(m => {
    if (!m || typeof m !== 'object' || !safeId(m.id)) {
      warnings.push(`模組 id「${m && m.id}」不安全，已捨棄。`);
      return;
    }
    if (seenIds.has(m.id)) {
      warnings.push(`模組 id ${m.id} 重複，已捨棄多餘的一筆。`);
      return;
    }
    seenIds.add(m.id);
    stage1.push(m);
  });

  // 沒有任何零件屬於它的模組也丟棄（用原始 comps 的 moduleId 判斷）。
  const stage2 = stage1.filter(m => {
    const has = outComps.some(c => c.moduleId === m.id);
    if (!has) warnings.push(`模組 ${m.id} 沒有任何零件，已捨棄。`);
    return has;
  });
  const validModuleIds = new Set(stage2.map(m => m.id));

  // comp.moduleId 指向不存在（或被丟棄）的模組 → 移除該零件的 moduleId。
  outComps = outComps.map(c => {
    if (c.moduleId !== undefined && !validModuleIds.has(c.moduleId)) {
      warnings.push(`零件 ${c.id} 的 moduleId「${c.moduleId}」指向不存在的模組，已移除標記。`);
      const rest = { ...c };
      delete rest.moduleId;
      return rest;
    }
    return c;
  });

  // D2：樹狀組裝——同一點 id 不可出現在兩個不同的 unit（根也算一個 unit）。
  const unitOfPoint = new Map();
  let treeOk = true;
  outComps.forEach(c => {
    const unit = c.moduleId || '#root';
    compPointIds(c).forEach(id => {
      const prev = unitOfPoint.get(id);
      if (prev === undefined) unitOfPoint.set(id, unit);
      else if (prev !== unit) treeOk = false;
    });
  });
  if (!treeOk) {
    return { ok: false, modules: [], comps: outComps, warnings };
  }

  // 各模組的零件（用已修正過 moduleId 的 outComps）。
  const compsByModule = new Map(stage2.map(m => [m.id, outComps.filter(c => c.moduleId === m.id)]));

  // 輸出端：先處理完，mount 才有完整的目標可查。
  const outputsByModuleId = new Map();
  const partial = stage2.map(m => {
    const moduleComps = compsByModule.get(m.id);
    const usedIds = new Set();
    const rawOutputs = Array.isArray(m.outputs) ? m.outputs : [];
    const outputs = rawOutputs
      .map(o => validateOutput(o, moduleComps, m.id, usedIds, warnings))
      .filter(Boolean);
    outputsByModuleId.set(m.id, new Set(outputs.map(o => o.id)));
    const name = sanitizeName(m.name, m.id);
    const source = safeId(m.source) ? m.source : undefined;
    let base = validateBase(m.base, moduleComps);
    if (m.base !== undefined && base === null) {
      warnings.push(`模組 ${m.id} 的 base 不是本模組的固定或馬達接點，已移除。`);
    }
    return { raw: m, id: m.id, name, source, base, outputs };
  });

  // mount：需要其他模組的最終輸出端清單，所以在 outputs 都處理完後才做。
  const withMount = partial.map(p => ({
    ...p,
    mount: validateMount(p.raw.mount, p.id, outputsByModuleId, validModuleIds, warnings)
  }));

  // 安裝迴圈：依陣列順序檢查，沿 mount 鏈回到自己就把「起點」那個模組的 mount 拆掉。
  const mountById = new Map(withMount.map(p => [p.id, p.mount]));
  withMount.forEach(p => {
    let curId = p.id;
    const seen = new Set([curId]);
    while (true) {
      const curMount = mountById.get(curId);
      if (!curMount) break;
      const nextId = curMount.to.module;
      if (nextId === p.id) {
        mountById.set(p.id, null);
        warnings.push(`模組 ${p.id} 的安裝形成迴圈，已拆開。`);
        break;
      }
      // 迴圈不經過 p 本身：留給迴圈成員輪到時處理，p 的安裝保留。
      if (seen.has(nextId)) break;
      seen.add(nextId);
      curId = nextId;
    }
  });

  const modules = withMount.map(p => {
    const out = { id: p.id, name: p.name };
    if (p.source !== undefined) out.source = p.source;
    if (p.base) out.base = p.base;
    out.outputs = p.outputs;
    out.mount = mountById.get(p.id);
    return out;
  });

  return { ok: true, modules, comps: outComps, warnings };
}
