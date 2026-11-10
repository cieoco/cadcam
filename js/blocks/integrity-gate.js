/** 提交關卡（SDD-CONNECTION-INTEGRITY 3.3 第 3 階段）：候選比目前作品多出 I1／I3／I8／I9 矛盾就拒絕寫入。integrity.js 按需載入，載入後同步檢查。 */
let ready = null;
export const loadIntegrity = () => Promise.all([import('./integrity.js'), import('./integrity-repairs.js')]).then(([m, r]) => (ready = {...m, describe: r.describeIssue}));
export const setIntegrityForTest = m => { ready = m; };   // 測試：換成會製造矛盾的假檢查
const bad = w => ready.checkWork(w).filter(i => i.severity === 'contradiction' && /^I[1389]$/.test(i.code) || i.ref?.what === 'moduleRef');   // 模組接口的失效引用（C6b）也算
const key = i => i.code + [...(i.ids.length ? i.ids : i.parts)].sort() + (i.ref?.end || '');   // 同一個孔（或零件）原本就有同類問題，不算新的
export function integrityGate(before, after, notify) {
  if (!ready) { loadIntegrity(); return true; }
  let add; try { const old = new Set(bad(before).map(key)); add = bad(after).filter(i => !old.has(key(i))); } catch { return true; }
  if (!add.length) return true;
  const seen = new Set(), d = add.map(i => ready.describe?.(after, i, before) || {text: i.message, far: i.parts, canon: []}).filter(x => !seen.has(x.text) && seen.add(x.text));
  notify(d[0].plain ? d[0].text : `這個修改會讓作品資料對不起來，未套用：${d[0].text}${d.length > 1 ? `（另有 ${d.length - 1} 項）` : ''}`);
  if (!d[0].plain) import('./integrity-hints.js').then(m => m.run('flash', {far: d.flatMap(x => x.far), canon: d.flatMap(x => x.canon)}));
  return false;
}
