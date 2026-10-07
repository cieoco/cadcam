/**
 * blocks / mates-view
 *
 * 設計分頁「接合面」工具要畫的東西（SDD-MATE-FACES §5.1，M2）。純幾何、不碰 DOM、不改輸入。
 *   bands ＝可標成承接面的位置：kind edge＝零件外緣的一段線（a→b）、kind bolt＝輸出端對鎖孔（a＝b＝一個點）；
 *           marked＝已標成承接面（帶 mateId 與使用者取的 name）；
 *           primary＝預設要顯示的：已標的、輸出端構件的邊、對鎖、自己的機架／底板邊（一般連桿的邊只在「全部的邊」顯示）；n＝往外的單位法線（邊才有，給畫面放點擊目標用）
 *   arrows＝四個安裝方向箭頭（0／90／180／270）：從機構外面往外指，active＝目前的安裝方向
 *   invalid＝存著但指不到零件的承接面（不丟掉，讓畫面提示）
 * opts.pxPerMm（畫面 px／mm，預設 1）只決定箭頭離機構多遠、多長，讓箭頭在任何縮放下都有固定的畫面大小。
 */
import { ownPorts, effectiveMates, tidyName } from './mates.js';
import { orthogonalHostEdge } from './assembly.js';
import { memberStock } from './member-stock.js';

const KEYS = ['p1', 'p2', 'p3', 'm1', 'm2'];
const okPt = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
export const ARROW_GAP_PX = 12, ARROW_LEN_PX = 28;   // 箭頭尾端離機構外框、箭頭長度（畫面 px）

// 一個邊接口 → 外緣線段 { a, b, n }；算不出回 null。
function edgeOf(comps, modules, moduleId, port, points, params) {
  const b = port.body || {};
  let mount = null;
  if (b.kind === 'bar') mount = { to: { module: moduleId, body: b.id }, orient: { side: port.side } };
  else if (b.kind === 'triangle') mount = { to: { module: moduleId, body: b.id, edge: b.edge } };
  const e = mount ? orthogonalHostEdge(comps, modules, mount, points, params) : port.geom;
  return e && okPt(e.a) && okPt(e.b) && e.m ? { a: { x: e.a.x, y: e.a.y }, b: { x: e.b.x, y: e.b.y }, n: { x: e.m.x, y: e.m.y } } : null;
}

export function mateOverlay(comps, modules, moduleId, points, params, opts = {}) {
  const out = { bands: [], arrows: [], invalid: [], suggested: false };
  const list = Array.isArray(comps) ? comps : [], mod = (Array.isArray(modules) ? modules : []).find(m => m && m.id === moduleId);
  if (!mod) return out;
  const px = opts && opts.pxPerMm > 0 ? opts.pxPerMm : 1, pts = points || {};
  const eff = effectiveMates(list, modules, moduleId, params), ports = ownPorts(list, modules, moduleId, params);
  out.suggested = eff.suggested;
  const markOf = port => eff.receive.find(r => r.valid && r.port && r.port.id === port.id);
  const bodies = new Set((mod.outputs || []).map(o => o.body && o.body.id).filter(Boolean));   // 輸出端的構件：primary
  ports.forEach(port => {
    let band = null;
    if (port.kind === 'edge') {
      const e = edgeOf(list, modules, moduleId, port, pts, params);
      if (e && Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y) > 1) band = { portId: port.id, kind: 'edge', a: e.a, b: e.b, n: e.n };
    } else if (port.kind === 'bolt') {
      const o = (mod.outputs || []).find(x => x.id === port.output), q = o && Array.isArray(o.bolts) && o.bolts.length >= 2 ? pts[o.at] : null;
      if (okPt(q)) band = { portId: port.id, kind: 'bolt', a: { x: q.x, y: q.y }, b: { x: q.x, y: q.y } };
    }
    if (!band) return;
    const r = markOf(port);
    out.bands.push({ ...band, name: r ? r.name : tidyName(port), marked: !!r, mateId: r ? r.id : null, primary: !!r || band.kind === 'bolt' || (port.body && (port.body.kind === 'frame' || bodies.has(port.body.id))) });
  });
  eff.receive.filter(r => !r.valid).forEach(r => out.invalid.push({ id: r.id, name: r.name }));
  // 箭頭：放在模組接點外框之外，對準外框中心，離外框一個板寬再加固定畫面距離。
  const own = [];
  list.filter(c => c && c.moduleId === moduleId).forEach(c => KEYS.forEach(k => { const q = c[k] && c[k].id ? pts[c[k].id] : null; if (okPt(q)) own.push(q); }));
  if (own.length) {
    const x0 = Math.min(...own.map(q => q.x)), x1 = Math.max(...own.map(q => q.x)), y0 = Math.min(...own.map(q => q.y)), y1 = Math.max(...own.map(q => q.y));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const hull = Math.max(0, ...list.filter(c => c && c.moduleId === moduleId && (c.type === 'bar' || c.type === 'triangle')).map(c => memberStock(c).widthMm / 2));
    const gap = hull + ARROW_GAP_PX / px, len = ARROW_LEN_PX / px, cur = eff.attach && eff.attach.normalDeg;
    [0, 90, 180, 270].forEach(deg => {
      const d = { x: Math.round(Math.cos(deg * Math.PI / 180)), y: Math.round(Math.sin(deg * Math.PI / 180)) };
      const tail = d.x > 0 ? { x: x1 + gap, y: cy } : d.x < 0 ? { x: x0 - gap, y: cy } : d.y > 0 ? { x: cx, y: y1 + gap } : { x: cx, y: y0 - gap };
      out.arrows.push({ normalDeg: deg, tail, tip: { x: tail.x + d.x * len, y: tail.y + d.y * len }, active: cur === deg });
    });
  }
  return out;
}
