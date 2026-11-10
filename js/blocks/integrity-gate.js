/** 提交關卡（SDD-CONNECTION-INTEGRITY 3.3 第 3 階段）：候選比目前作品多出 I1／I3 矛盾就拒絕寫入。integrity.js 按需載入，載入後同步檢查。 */
let ready = null;
export const loadIntegrity = () => import('./integrity.js').then(m => (ready = m));
export const setIntegrityForTest = m => { ready = m; };   // 測試：換成會製造矛盾的假檢查
const bad = w => ready.checkWork(w).filter(i => i.severity === 'contradiction' && (i.code === 'I1' || i.code === 'I3'));
const key = i => i.code + [...i.ids, '/', ...i.parts].sort();
export function integrityGate(before, after, notify) {
  if (!ready) { loadIntegrity(); return true; }
  let add; try { const old = new Set(bad(before).map(key)); add = bad(after).filter(i => !old.has(key(i))); } catch { return true; }
  if (!add.length) return true;
  notify(`這個修改會讓作品資料對不起來，未套用：${add[0].message}${add.length > 1 ? `（另有 ${add.length - 1} 項）` : ''}`);
  import('./integrity-hints.js').then(m => m.run('flash', {ids: add.flatMap(i => i.parts)}));
  return false;
}
