/**
 * blocks / edit-pipeline  (pack O1 of docs/SDD-OPERATION-PIPELINE.md §3.2)
 *
 * 所有「改作品」的動作共用的提交流程：規劃（純函式）→ 一致性檢查 → 一次復原 → 寫入 → 一行回饋。
 * 按需載入（不得被啟動路徑靜態 import）；host 由呼叫端注入，所以可以用假 host 測試。
 *
 *   runEdit({name, plan, host, checks?}) -> boolean（有沒有套用）
 *     plan(work)   純函式：work = {comps, params, modules, fabrication, counter, points}（直接是目前作品，不得修改它）
 *                  回傳 {ok:true, comps, params, modules?, message?, after?(S), clearSelection?:false} 或 {ok:false, message, flash?:[零件id]}
 *     checks       這個動作額外宣告的檢查 [{id, run(work) -> 問題說明字串｜空}]。每一項在「修改前」與「修改後」各跑一次：
 *                  修改前就有的問題不擋不相干的修改，只有「這次新造成」的問題才拒絕。
 *     host         {S, transient, pushUndo, pause, rebuild, draw, afterCommit?(), flash?(ids), points?}
 *   成功與拒絕都會呼叫 transient 說一行話（不會無聲無息）。
 */
import {integrityGate} from './integrity-gate.js';
import {pruneTopoRefs} from './topo-refs.js';

const attempt = (fn, fallback) => { try { return fn(); } catch (_) { return fallback; } };

export function runEdit({name, plan, host, checks = []}) {
  const {S, transient} = host;
  const before = {comps: S.comps, params: S.topo.params, modules: S.modules || [], fabrication: S.fabrication, counter: S.counter, points: host.points || {}};
  let res;
  try { res = plan(before); }
  catch (e) { console.error(e); res = {ok: false, message: `「${name}」暫時無法完成，作品沒有改動。`}; }
  if (!res || !res.ok) {
    transient(res?.message || `「${name}」現在不能做。`);
    if (res?.flash?.length) attempt(() => host.flash?.(res.flash));
    return false;
  }
  const after = {...before, comps: res.comps, params: res.params || before.params, modules: res.modules || before.modules};
  if (!integrityGate({comps: before.comps, modules: before.modules, params: before.params}, {comps: after.comps, modules: after.modules, params: after.params}, transient)) return false;
  for (const c of checks) {
    const now = attempt(() => c.run(after), '');
    if (now && !attempt(() => c.run(before), '')) { transient(now); return false; }   // 修改前沒有、修改後才有的問題才擋
  }
  host.pushUndo();
  host.pause?.();
  S.comps = after.comps; S.topo.params = after.params;
  if (res.modules) S.modules = res.modules;
  pruneTopoRefs(S.topo, S.comps);
  if (res.clearSelection !== false) S.selectedLinkId = S.selectedTriangleId = S.selectedSliderId = S.selectedNodeId = null;
  res.after?.(S);
  host.afterCommit?.(res);
  host.rebuild(); host.draw();
  transient(res.message || `已完成：${name}。`);
  return true;
}
