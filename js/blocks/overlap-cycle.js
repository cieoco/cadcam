/**
 * blocks / overlap-cycle  (pack O4 of docs/SDD-OPERATION-PIPELINE.md, gap #8)
 *
 * 桌機上多個零件重疊在同一處：點一下選到最上面的零件；在同一個位置再點一次（沒有拖動），選到下面的零件，再點再往下，
 * 最後回到最上面。不加模式、不開選單（手機另有選單，見 overlap-picker.js）。孔與接點的點擊不在這裡處理。
 * 本檔按需載入；用 capture 階段只「看」點擊，不攔截原有的點選與拖曳，放開時才改選。
 */
const SAME_SPOT_PX = 6;       // 兩次點擊算同一處的距離
let hinted = false;           // 一次作業期間只提示一次

/** 此處（螢幕座標）從上到下的零件 id，不重複，只算作品裡真的存在的零件。 */
export function stackAt(svg, x, y, comps) {
  const ids = [];
  for (const el of svg.ownerDocument?.elementsFromPoint?.(x, y) || []) {
    if (!svg.contains(el)) continue;
    const id = el.getAttribute?.('data-pick-component');
    if (id && !ids.includes(id) && comps.some(c => c.id === id)) ids.push(id);
  }
  return ids;
}

/** 下一個要選的零件：目前選到的在 stack 裡且下面還有零件才換；否則 null（維持原本點選的結果）。 */
export const nextUnder = (stack, selected) => { const i = stack.indexOf(selected); return i >= 0 && i + 1 < stack.length ? stack[i + 1] : null; };

export function installOverlapCycle({svg, comps, selectedId, select, active, say, nodeSelected = () => false}) {
  let down = null, last = null;
  svg.addEventListener('pointerdown', e => {
    down = null;
    if (e.pointerType !== 'mouse' || (e.button !== undefined && e.button !== 0) || !active()) return;
    if (e.target?.closest?.('[data-id],[data-motor-hit],[data-dimension-handle],[data-point-choice]') || e.target?.getAttribute?.('data-id') || e.target?.getAttribute?.('data-motor-hit')) return;
    down = {x: e.clientX, y: e.clientY, selected: selectedId(), stack: stackAt(svg, e.clientX, e.clientY, comps())};   // 在原本的點選處理之前記下點擊前選到誰
  }, true);
  svg.addEventListener('pointerup', e => {
    const d = down; down = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > SAME_SPOT_PX) return;      // 拖過就不算點擊
    if (nodeSelected()) { last = null; return; }                                          // 這一下點到的是孔（原本的處理已選取接點）
    if (d.stack.length < 2) { last = null; return; }
    const again = last && Math.hypot(d.x - last.x, d.y - last.y) <= SAME_SPOT_PX;
    last = {x: d.x, y: d.y};
    const next = again ? nextUnder(d.stack, d.selected) : null;
    if (next) { select(next); return; }
    if (!hinted) { hinted = true; say(`這裡有 ${d.stack.length} 個零件重疊；再點一次可選到下面的零件。`); }
  }, true);
}
