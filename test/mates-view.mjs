// M2（SDD-MATE-FACES §5.1）：設計分頁「接合面」工具要畫的東西——純幾何，給 2D 畫面與點擊命中用。
//   bands ＝可標成承接面的位置（邊＝一條線段；對鎖＝一個點），marked 表示已標
//   arrows＝四個安裝方向箭頭（0／90／180／270），active＝目前的安裝方向
import { check, report } from './_harness.mjs';
import { S, fresh, solveAt, near } from './_bench-setup.mjs';
let V = null;
try { V = await import('../js/blocks/mates-view.js'); } catch (e) { console.log(String(e).slice(0, 200)); }
check('mates-view.js 匯出 mateOverlay', typeof V?.mateOverlay === 'function');
if (typeof V?.mateOverlay !== 'function') { report('mates-view'); process.exit(1); }
const M = await import('../js/blocks/mates.js');
const { memberStock } = await import('../js/blocks/member-stock.js');
const [A, L, G] = fresh('rack-lift', 'fourbar-lift', 'gear-gripper');
const P = S.topo.params;
const pts = solveAt(S.comps, S.modules, P).points;
const dist = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy); return ((p.x - a.x) * dy - (p.y - a.y) * dx) / len; };   // 有號距離（右側為正）
const ownPts = id => { const out = []; S.comps.filter(c => c.moduleId === id).forEach(c => ['p1', 'p2', 'p3', 'm1', 'm2'].forEach(k => { const q = c[k] && pts[c[k].id]; if (q && Number.isFinite(q.x)) out.push(q); })); return out; };

// ---------- 四連桿：桿邊 ----------
{
  const o = V.mateOverlay(S.comps, S.modules, L.id, pts, P);
  const brace = S.comps.find(c => c.moduleId === L.id && c.id.startsWith('ToolBrace'));
  const p1 = pts[brace.p1.id], p2 = pts[brace.p2.id], w = memberStock(brace).widthMm;
  const bl = o.bands.find(b => b.portId === `edge:${brace.id}:L`), br = o.bands.find(b => b.portId === `edge:${brace.id}:R`);
  console.log('lift bands:', o.bands.length, o.bands.filter(b => b.marked).map(b => b.name).join(','), ' arrows:', o.arrows.map(a => a.normalDeg + (a.active ? '*' : '')).join(' '));
  check('回傳 bands、arrows、invalid 三個陣列', Array.isArray(o.bands) && Array.isArray(o.arrows) && Array.isArray(o.invalid));
  check('每一個自己的邊接口都是一條 band（kind edge，a≠b），只列這個模組的', o.bands.length === M.ownPorts(S.comps, S.modules, L.id, P).filter(p => p.kind === 'edge').length + o.bands.filter(b => b.kind === 'bolt').length && o.bands.filter(b => b.kind === 'edge').every(b => Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y) > 1));
  check('工具架兩條長邊已標（marked、有名稱與 mateId），其餘未標', bl && br && bl.marked && br.marked && bl.mateId && br.mateId && /工具架/.test(bl.name) && o.bands.filter(b => b.marked).length === 2);
  check('桿邊的線段在桿的外緣：離桿軸半個板寬、長度＝桿長、兩條各在一側', [bl, br].every(b => near(Math.abs(dist(b.a, p1, p2)), w / 2, 0.01) && near(Math.abs(dist(b.b, p1, p2)), w / 2, 0.01) && near(Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y), Math.hypot(p2.x - p1.x, p2.y - p1.y), 0.01)) && dist(bl.a, p1, p2) * dist(br.a, p1, p2) < 0);
  check('未標的 band 也有給人看的名稱（不含內部零件 id）', o.bands.every(b => typeof b.name === 'string' && b.name.length > 0 && !/[A-Za-z]+_\d+/.test(b.name)));
  // 精簡顯示：primary＝已標的、輸出端構件的邊、自己的機架／底板邊；其餘（一般連桿的邊）預設不顯示
  check('band 帶 primary：已標的與機架邊為 true，一般連桿（搖臂）的邊為 false', o.bands.every(b => typeof b.primary === 'boolean') && o.bands.filter(b => b.marked).every(b => b.primary) && o.bands.filter(b => /^edge:frame:/.test(b.portId)).every(b => b.primary) && o.bands.filter(b => /LiftCrank|LiftFollower/.test(b.portId)).every(b => b.primary === false));
  check('四連桿的 primary 候選不超過 8 個（手機上不擁擠）', o.bands.filter(b => b.primary).length >= 3 && o.bands.filter(b => b.primary).length <= 8);
  check('只有 1 個孔的輸出端不出現對鎖 band', !o.bands.some(b => b.kind === 'bolt'));
  // 箭頭
  const box = ownPts(L.id), minX = Math.min(...box.map(p => p.x)), maxX = Math.max(...box.map(p => p.x)), minY = Math.min(...box.map(p => p.y)), maxY = Math.max(...box.map(p => p.y));
  check('四個箭頭 0／90／180／270，恰好一個 active＝目前的安裝方向', o.arrows.length === 4 && [0, 90, 180, 270].every(d => o.arrows.some(a => a.normalDeg === d)) && o.arrows.filter(a => a.active).length === 1 && o.arrows.find(a => a.active).normalDeg === M.effectiveMates(S.comps, S.modules, L.id, P).attach.normalDeg);
  const dirOf = d => ({ x: Math.round(Math.cos(d * Math.PI / 180)), y: Math.round(Math.sin(d * Math.PI / 180)) });
  check('箭頭從機構外面往外指：尾端在機構外框之外、tip−tail 方向＝該角度、長度 ≥ 10', o.arrows.every(a => { const d = dirOf(a.normalDeg), v = { x: a.tip.x - a.tail.x, y: a.tip.y - a.tail.y }, len = Math.hypot(v.x, v.y);
    const outside = d.x > 0 ? a.tail.x > maxX : d.x < 0 ? a.tail.x < minX : d.y > 0 ? a.tail.y > maxY : a.tail.y < minY;
    return len >= 10 && near(v.x / len, d.x, 1e-6) && near(v.y / len, d.y, 1e-6) && outside; }));
  check('箭頭對準機構中心（垂直於箭頭方向的座標在外框範圍內）', o.arrows.every(a => { const d = dirOf(a.normalDeg); return d.x ? (a.tail.y >= minY - 1 && a.tail.y <= maxY + 1) : (a.tail.x >= minX - 1 && a.tail.x <= maxX + 1); }));
}
// ---------- 齒條升降：對鎖 ----------
{
  const o = V.mateOverlay(S.comps, S.modules, A.id, pts, P);
  const out = A.outputs.find(x => x.id === 'carriage'), at = pts[out.at];
  const b = o.bands.find(x => x.kind === 'bolt');
  check('齒條滑台：一個對鎖 band（點），位置＝輸出端、已標、名稱含滑台', b && b.marked && /滑台/.test(b.name) && near(b.a.x, at.x, 0.01) && near(b.a.y, at.y, 0.01) && near(b.b.x, b.a.x) && near(b.b.y, b.a.y) && b.portId === 'bolt:carriage');
  check('齒條升降自己的機架邊也是候選（未標）', o.bands.some(x => x.kind === 'edge' && !x.marked));
}
// ---------- 夾爪：沒有承接面；沒存 mates 時用建議 ----------
{
  const o = V.mateOverlay(S.comps, S.modules, G.id, pts, P);
  check('夾爪：沒有已標的承接面、安裝方向 90° 的箭頭 active、suggested false', o.bands.every(b => !b.marked) && o.arrows.find(a => a.active).normalDeg === 90 && o.suggested === false);
  const stripped = S.modules.map(m => { const { mates, ...r } = m; return r; });
  const s = V.mateOverlay(S.comps, stripped, L.id, pts, P);
  check('沒存 mates：畫建議（suggested true），內容與已存的內建相同', s.suggested === true && s.bands.filter(b => b.marked).length === 2 && s.arrows.filter(a => a.active).length === 1);
}
// ---------- 失效的承接面 ----------
{
  const brace = S.comps.find(c => c.moduleId === L.id && c.id.startsWith('ToolBrace'));
  const gone = S.comps.filter(c => c.id !== brace.id);
  const pts2 = solveAt(gone, S.modules, P).points;
  const o = V.mateOverlay(gone, S.modules, L.id, pts2, P);
  check('零件被刪：兩筆承接面列在 invalid（id、name），不在 bands', o.invalid.length === 2 && o.invalid.every(x => x.id && /工具架/.test(x.name)) && !o.bands.some(b => b.marked));
}
check('不存在的模組：回空結果不丟例外', (() => { const o = V.mateOverlay(S.comps, S.modules, 'nope', pts, P); return o.bands.length === 0 && o.arrows.length === 0 && o.invalid.length === 0; })());
check('不改輸入', (() => { const a = JSON.stringify([S.comps, S.modules]); V.mateOverlay(S.comps, S.modules, L.id, pts, P); return a === JSON.stringify([S.comps, S.modules]); })());
report('mates-view');
