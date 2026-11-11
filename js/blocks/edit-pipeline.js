/**
 * blocks / edit-pipeline  (pack O1 of docs/SDD-OPERATION-PIPELINE.md §3.2)
 *
 * 所有「改作品」的動作共用的提交流程：規劃（純函式）→ 一致性檢查 → （選用）確認 → 一次復原 → 寫入 → 一行回饋。
 * host 由呼叫端注入，所以可以用假 host 測試。大部分動作按需載入；改尺寸（resize-plan.js）因數字欄要同步回應而靜態載入，
 * 本檔只依賴 integrity-gate、topo-refs、mounting-review-ui，皆已在啟動路徑上。
 *
 *   runEdit({name, plan, host, checks?, confirm?}) -> boolean（有沒有套用）；confirm 回傳 Promise 時，runEdit 也回傳 Promise<boolean>
 *     plan(work)   純函式：work = {comps, params, modules, fabrication, counter, points}（直接是目前作品，不得修改它）
 *                  回傳 {ok:true, comps, params, modules?, message?, after?(S), retarget?:[舊接點id, 新接點id], clearSelection?:false,
 *                        keepIdentity?, pruneRefs?:false} 或 {ok:true, unchanged:true}（沒有要改的：不復原、不寫入、不說話）
 *                  或 {ok:false, message, flash?:[零件id]}
 *                  message 為空字串＝成功但不另外說話（尺寸欄改完畫面本身就看得到）；沒有 message 則說「已完成：名稱。」
 *                  keepIdentity：面板手上還拿著零件物件時，已存在的零件保留原物件、只換欄位（寫法同 commitMountingEdit 的 adoptComps），新零件直接加入
 *                  pruneRefs:false：不順手清掉作品層已有的失效引用（只改尺寸的動作不該動別的東西）
 *     checks       這個動作額外宣告的檢查 [{id, run(work) -> 問題說明字串｜空}]。每一項在「修改前」與「修改後」各跑一次：
 *                  修改前就有的問題不擋不相干的修改，只有「這次新造成」的問題才拒絕。
 *     confirm      選用，介於檢查與提交之間：confirm(after) → true 繼續｜false 學生取消（說「已取消，未套用。」，不復原、不寫入）｜
 *                  {ok:false, message} 擋下並說明｜{comps?, params?, modules?} 換成另一份候選再提交。可以是同步，也可以回傳 Promise
 *                  （例如安裝孔位確認：mounting-review-ui.js reviewMountingChange）。確認期間作品不得被改動；
 *                  提交時若 Promise 結束後作品已被別處改過（S.comps 不再是規劃時的那一份），視為取消，不覆蓋。
 *     host         {S, transient, pushUndo, pause, rebuild, draw, afterCommit?(), flash?(ids), points?}
 *   成功與拒絕都會呼叫 transient 說一行話（不會無聲無息）。
 */
import {integrityGate} from './integrity-gate.js';
import {pruneTopoRefs, retargetPointRefs} from './topo-refs.js';
import {adoptComps} from './mounting-review-ui.js';

const attempt = (fn, fallback) => { try { return fn(); } catch (_) { return fallback; } };

export function runEdit({name, plan, host, checks = [], confirm}) {
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
  if (res.unchanged) return false;
  let after = {...before, comps: res.comps, params: res.params || before.params, modules: res.modules || before.modules};
  if (!integrityGate({comps: before.comps, modules: before.modules, params: before.params}, {comps: after.comps, modules: after.modules, params: after.params}, transient)) return false;
  for (const c of checks) {
    const now = attempt(() => c.run(after), '');
    if (now && !attempt(() => c.run(before), '')) { transient(now); return false; }   // 修改前沒有、修改後才有的問題才擋
  }
  const commit = () => {
    host.pushUndo();
    host.pause?.();
    S.comps = res.keepIdentity ? adoptComps(S.comps, after.comps) : after.comps; S.topo.params = after.params;
    if (res.modules || after.modules !== before.modules) S.modules = after.modules;
    if (res.retarget) retargetPointRefs(S.topo, ...res.retarget);   // 合併接點：軌跡點等引用先改指向新 id，再清掉已不存在的
    if (res.pruneRefs !== false) pruneTopoRefs(S.topo, S.comps);
    if (res.clearSelection !== false) S.selectedLinkId = S.selectedTriangleId = S.selectedSliderId = S.selectedNodeId = null;
    res.after?.(S);
    host.afterCommit?.(res);
    host.rebuild(); host.draw();
    if (res.message !== '') transient(res.message || `已完成：${name}。`);
    return true;
  };
  if (!confirm) return commit();
  // 確認階段：結果決定要不要提交。確認可能是同步（window.confirm）或非同步。
  const decide = verdict => {
    if (verdict && verdict.ok === false) { transient(verdict.message || `「${name}」現在不能做。`); return false; }
    if (!verdict) { transient('已取消，未套用。'); return false; }
    if (typeof verdict === 'object') after = {...after, ...(verdict.comps && {comps: verdict.comps}), ...(verdict.params && {params: verdict.params}), ...(verdict.modules && {modules: verdict.modules})};
    if (S.comps !== before.comps) { transient('作品在確認期間被改動，已取消，未套用。'); return false; }
    return commit();
  };
  const verdict = attempt(() => confirm(after), false);
  return verdict && typeof verdict.then === 'function' ? verdict.then(decide, () => decide(false)) : decide(verdict);
}
