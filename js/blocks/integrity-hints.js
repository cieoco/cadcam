/**
 * blocks / integrity-hints  (pack C3 of docs/SDD-CONNECTION-INTEGRITY.md)
 *
 * 作品套用後（開檔、範例、分享連結、自動還原、整份作品的復原／重做）顯示一般性的檢查提示：一句白話說明加修復按鈕。
 * 修復先成為候選，按下按鈕才經 app 一般的提交流程寫入（pushUndo、自動存檔、rebuild/draw），一次復原；
 * 提示顯示之後作品又被改過就拒絕，改為重新檢查。哪些檢查啟用見 integrity-repairs.js 的 ENABLED。按需載入。
 */
import {findings, workOf, sourceOf, fingerprint} from './integrity-repairs.js';

const MAX_SHOWN = 3;
let shown = {fp: '', items: []}, dismissed = '';

function styleOnce() {
  if (document.getElementById('integrityHintStyle')) return;
  const st = document.createElement('style');
  st.id = 'integrityHintStyle';
  // 與 #solveBanner 相同的位置與寬度；手機上限高並可捲動、可先不處理，不蓋住整個畫布。
  st.textContent = '#integrityHint{box-sizing:border-box;width:min(380px,calc(100% - 32px));border-radius:12px;line-height:1.5;white-space:normal;pointer-events:auto;max-height:min(280px,38vh);overflow:auto}'
    + '#integrityHint p{margin:0 0 4px}#integrityHint .ih-row{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 8px}#integrityHint button{pointer-events:auto;min-height:44px}'
    + '@media (max-width:700px){#integrityHint{font-size:13px;max-height:30vh;padding:8px 12px}}'
    + '.hydraulic-active #integrityHint{position:relative;top:auto!important;left:auto;transform:none;flex:0 0 auto;width:auto;max-width:none;margin:4px 8px;box-shadow:none}';
  document.head?.append(st);
}
function panel() {
  let el = document.getElementById('integrityHint');
  if (!el) {
    styleOnce();
    el = document.createElement('div');
    el.id = 'integrityHint'; el.className = 'mode-banner'; el.setAttribute('role', 'status'); el.setAttribute('aria-label', '作品檢查提示');
    el.style.cssText = 'top:104px;display:none;';
    document.getElementById('solveBanner')?.after(el);
  }
  return el;
}
function button(text, onclick, label) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'lift-btn'; b.textContent = text; b.setAttribute('aria-label', label || text); b.onclick = onclick;
  return b;
}

/** 重新檢查並更新（或隱藏）提示。回傳目前顯示的問題數。 */
export function check(api) {
  const el = panel(), work = workOf(api.S), items = findings(work), fp = fingerprint(work);
  shown = {fp, items};
  if (!items.length || dismissed === fp) { el.style.display = 'none'; el.replaceChildren(); return 0; }
  dismissed = '';
  const nodes = [];
  for (const item of items.slice(0, MAX_SHOWN)) {
    const p = document.createElement('p'); p.textContent = item.text; nodes.push(p);
    if (item.repairs.length) {
      const row = document.createElement('span'); row.className = 'ih-row'; row.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 8px';
      for (const r of item.repairs) row.append(button(r.label, () => repair(api, item, r)));
      nodes.push(row);
    }
  }
  if (items.length > MAX_SHOWN) { const p = document.createElement('p'); p.textContent = `另外還有 ${items.length - MAX_SHOWN} 項，處理完以上幾項後會再顯示。`; nodes.push(p); }
  nodes.push(button('先不處理', () => { dismissed = fp; el.style.display = 'none'; }, '先不處理，關閉這則作品檢查提示'));
  el.replaceChildren(...nodes);
  el.style.display = 'block';
  return items.length;
}

function repair(api, item, r) {
  const S = api.S;
  if (S.mode && S.mode !== 'design') { api.notify('請在設計模式修復作品。'); return false; }
  if (fingerprint(workOf(S)) !== shown.fp) { api.notify('作品在提示出現後已經改變，已重新檢查，請再確認一次。'); check(api); return false; }
  const plan = r.plan(sourceOf(S));
  if (!plan.ok) { api.notify(plan.message); return false; }
  api.pause?.(); api.pushUndo();
  S.comps = plan.comps;
  if (plan.params) S.topo.params = plan.params;
  if (plan.modules) S.modules = plan.modules;
  if (plan.topo) Object.assign(S.topo, plan.topo);
  api.rebuild(); api.draw(); api.save?.(); api.notify(plan.message);
  check(api);
  return true;
}

export function run(action, api) {
  if (action === 'check') return check(api);
  return false;
}
