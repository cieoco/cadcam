// 組立畫面的開關狀態，不寫進作品、不占用復原紀錄。
export const closedAssemblies = new Set();
export function assemblyBranch(modules, root) {
  const ids = new Set([root]);
  for (let n = 0; n < modules.length; n++) {
    let changed = false;
    modules.forEach(m => { if (ids.has(m.mount?.to?.module) && !ids.has(m.id)) { ids.add(m.id); changed = true; } });
    if (!changed) break;
  }
  return ids;
}
export function closedAssemblyIds(modules) {
  const ids = new Set();
  for (const id of closedAssemblies) if (modules.some(m => m.id === id)) assemblyBranch(modules, id).forEach(child => ids.add(child));
  return ids;
}
