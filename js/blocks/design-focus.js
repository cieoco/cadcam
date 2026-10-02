/**
 * blocks / design-focus（H1）
 *
 * 設計模式一次只顯示「一個設計」：每個模組一個分頁，沒歸屬模組的零件合成「未命名設計」（#root）。
 * 組立模式才把全部放在一起看。這裡是純函式（不碰 DOM、不碰 S），app.js 把結果接到繪圖與編輯。
 */
import { moduleLabels } from './bench.js';
import { pointKeysFor } from './part-types.js';

export const ROOT_TAB = '#root';
export const ROOT_LABEL = '未命名設計';

const asList = v => Array.isArray(v) ? v : [];

// 零件屬於哪一頁：有 moduleId 且模組存在 → 該模組；否則 → #root。
function tabOf(comp, moduleIds) {
  const id = comp && comp.moduleId;
  return id && moduleIds.has(id) ? id : ROOT_TAB;
}

/**
 * 設計分頁清單：每個模組一頁（依模組陣列順序，同名自動編號），最後是 #root。
 * #root 只在「有根零件」或「作品完全空白」時出現；opts.keepRoot（使用者剛按「新設計」）時即使沒有零件也保留。
 * @returns {Array<{id:string,label:string,count:number,mounted:boolean,orthogonal:boolean}>}
 */
export function designTabs(comps, modules, opts = {}) {
  const list = asList(comps), mods = asList(modules).filter(m => m && m.id);
  const ids = new Set(mods.map(m => m.id));
  const counts = new Map();
  list.forEach(c => { const t = tabOf(c, ids); counts.set(t, (counts.get(t) || 0) + 1); });
  const labels = moduleLabels(mods);
  const tabs = mods.map(m => ({
    id: m.id, label: labels.get(m.id) || m.id, count: counts.get(m.id) || 0,
    mounted: !!m.mount, orthogonal: !!(m.mount && m.mount.orient)
  }));
  const rootCount = counts.get(ROOT_TAB) || 0;
  if (rootCount > 0 || list.length === 0 || (opts && opts.keepRoot)) {
    tabs.push({ id: ROOT_TAB, label: ROOT_LABEL, count: rootCount, mounted: false, orthogonal: false });
  }
  return tabs;
}

// 焦點若是目前的分頁 id 就保留，否則退到第一頁。
export function resolveFocus(comps, modules, focus, opts = {}) {
  const tabs = designTabs(comps, modules, opts);
  return tabs.some(t => t.id === focus) ? focus : tabs[0].id;
}

// 焦點分頁的零件（保持原順序）；focus 為 null → 全部（組立模式用）。
export function compsInFocus(comps, modules, focus) {
  const list = asList(comps);
  if (focus == null) return list;
  const ids = new Set(asList(modules).filter(m => m && m.id).map(m => m.id));
  return list.filter(c => tabOf(c, ids) === focus);
}

// 這些零件用到的點 id（含零件 holes 裡的孔），給繪製與命中過濾用。
export function pointIdsOf(comps) {
  const ids = new Set();
  asList(comps).forEach(c => {
    pointKeysFor(c).forEach(k => { if (c[k] && c[k].id) ids.add(c[k].id); });
    if (Array.isArray(c.holes)) c.holes.forEach(h => { if (h && h.id) ids.add(h.id); });
  });
  return ids;
}

/**
 * 在某個模組分頁裡新畫的零件要歸到那個模組：id 不在 knownIds 且沒有 moduleId 的零件 → moduleId = focus。
 * 焦點不是模組（#root／null）或沒有要改的就原樣回傳同一個陣列；有改時回新陣列，只有被改的零件是新物件。
 */
export function assignNewComps(comps, knownIds, focus) {
  const list = asList(comps);
  if (!focus || focus === ROOT_TAB || !(knownIds instanceof Set)) return list;
  let changed = false;
  const out = list.map(c => {
    if (c && c.id != null && !c.moduleId && !knownIds.has(c.id)) { changed = true; return { ...c, moduleId: focus }; }
    return c;
  });
  return changed ? out : list;
}

/**
 * 3D 預覽輸入（buildPreviewModelInputs 的結果）只留焦點分頁用到的點與零件；
 * 與 orthogonal-3d.js 的 planeInputs 同形，但以焦點零件過濾，且不把直角子模組立起來。
 */
export function focusInputs(inputs, focusComps) {
  const ids = pointIdsOf(focusComps);
  const compIds = new Set(asList(focusComps).map(c => c.id));
  const inSet = id => ids.has(id);
  const pts = {};
  for (const id in (inputs.pts || {})) if (ids.has(id)) pts[id] = inputs.pts[id];
  const keepSet = set => new Set([...(set || [])].filter(inSet));
  const keepComp = list => (list || []).filter(x => compIds.has(x.id));
  return {
    ...inputs,
    pts,
    links: (inputs.links || []).filter(l => inSet(l.p1) && inSet(l.p2)),
    polygons: (inputs.polygons || []).filter(pg => (pg.points || []).every(inSet)),
    groundIds: keepSet(inputs.groundIds),
    motorCenterIds: keepSet(inputs.motorCenterIds),
    sliders: keepComp(inputs.sliders), gears: keepComp(inputs.gears), racks: keepComp(inputs.racks),
    cams: keepComp(inputs.cams), pulleys: keepComp(inputs.pulleys), belts: keepComp(inputs.belts)
  };
}
