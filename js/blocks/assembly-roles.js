/**
 * blocks / assembly-roles
 *
 * 多構件的角色（SDD-MATE-FACES §6，M5a）。純函式，不碰 DOM、不改輸入。
 *   底座（root）＝清單裡第一個「沒裝在別人身上」的機構；機器（machine）＝底座加上裝在它身上的整串。
 *   未安裝（spare）＝其他機構：沒接上的，連同已經接在它們身上的（正在準備的子組件）。
 * 不多存任何欄位：底座就是 modules 的順序，所以「設為底座」＝把那個機構移到最前面。
 */
const asList = v => Array.isArray(v) ? v : [];

// → { root, machine:[id], spare:[id], parent:{id→宿主id|null}, depth:{id→n}, order:[id] }
//   machine／spare 照 modules 順序；order＝底座那串先（深度優先、同層照 modules 順序），再來是各個未安裝的串。
//   宿主不存在（或環狀）的機構當成自己那串的頭，歸在未安裝。
export function assemblyRoles(modules) {
  const mods = asList(modules).filter(m => m && m.id != null);
  const ids = new Set(mods.map(m => m.id));
  const parent = {}, kids = new Map();
  mods.forEach(m => {
    const h = m.mount && m.mount.to ? m.mount.to.module : null;
    parent[m.id] = h != null && ids.has(h) && h !== m.id ? h : null;
    if (parent[m.id] !== null) { if (!kids.has(parent[m.id])) kids.set(parent[m.id], []); kids.get(parent[m.id]).push(m.id); }
  });
  const first = mods.find(m => !m.mount);
  const root = first ? first.id : null;
  const depth = {}, order = [], seen = new Set();
  const walk = (id, d) => { if (seen.has(id)) return; seen.add(id); depth[id] = d; order.push(id); (kids.get(id) || []).forEach(k => walk(k, d + 1)); };
  if (root !== null) walk(root, 0);
  const inMachine = new Set(order);
  mods.filter(m => !seen.has(m.id) && parent[m.id] === null).forEach(m => walk(m.id, 0));   // 其他串的頭（沒接上的，或宿主已不存在）
  mods.forEach(m => walk(m.id, 0));                                                          // 環狀等例外：不漏掉任何一個
  return { root, machine: mods.filter(m => inMachine.has(m.id)).map(m => m.id), spare: mods.filter(m => !inMachine.has(m.id)).map(m => m.id), parent, depth, order };
}

// 把 id（要是沒安裝的）移到最前面當底座；找不到或已安裝 → 回同一個陣列。
export function setAssemblyRoot(modules, id) {
  const mods = asList(modules), i = mods.findIndex(m => m && m.id === id);
  if (i <= 0 || mods[i].mount) return modules;
  return [mods[i], ...mods.slice(0, i), ...mods.slice(i + 1)];
}

// 機器的模組（沒有模組時原樣回傳）。
export function machineModules(modules) {
  const mods = asList(modules);
  if (!mods.length) return modules;
  const keep = new Set(assemblyRoles(mods).machine);
  return mods.filter(m => m && keep.has(m.id));
}

// 去掉未安裝機構的零件（沒有 moduleId 的零件一律保留）；沒有模組時原樣回傳。
export function machineComps(comps, modules) {
  const list = asList(comps), mods = asList(modules);
  if (!mods.length) return comps;
  const spare = new Set(assemblyRoles(mods).spare);
  return spare.size ? list.filter(c => !c || !c.moduleId || !spare.has(c.moduleId)) : list;
}

// 未安裝的機構 [{ id, name }]（製作計畫與提醒用）。
export function spareModules(modules) {
  const spare = new Set(assemblyRoles(modules).spare);
  return asList(modules).filter(m => m && spare.has(m.id)).map(m => ({ id: m.id, name: m.name || m.id }));
}
