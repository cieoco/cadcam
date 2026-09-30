// P2 插入模組不重疊：新模組若與既有零件範圍重疊，就挪到右／左／下／上位移最小的一側。
import { check, report } from './_harness.mjs';

class FakeElement {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.style = {}; this.dataset = {}; this.textContent = ''; this.value = ''; this.listeners = {}; this.attrs = {}; }
  get firstChild() { return this.children[0] || null; }
  appendChild(child) { this.children.push(child); return child; }
  removeChild(child) { this.children = this.children.filter(c => c !== child); return child; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
}
const els = new Map();
globalThis.document = {
  getElementById: id => { if (!els.has(id)) els.set(id, new FakeElement()); return els.get(id); },
  createElement: tag => new FakeElement(tag)
};

const { S } = await import('../js/blocks/state.js');
const Ops = await import('../js/blocks/module-ops.js');
const { createModuleEditor } = await import('../js/blocks/module-editor.js');

check('module-ops 匯出 insertOffset', typeof Ops.insertOffset === 'function');
if (typeof Ops.insertOffset !== 'function') { report('module-insert-place'); process.exit(1); }

const KEYS = ['p1', 'p2', 'p3', 'm1', 'm2'];
const boxOf = comps => {
  const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  comps.forEach(c => KEYS.forEach(k => {
    const p = c[k];
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      b.minX = Math.min(b.minX, p.x); b.maxX = Math.max(b.maxX, p.x);
      b.minY = Math.min(b.minY, p.y); b.maxY = Math.max(b.maxY, p.y);
    }
  }));
  return b;
};
// 視覺範圍（規格 v2）：接點＋齒輪齒頂圓＋齒條外框
const boxVis = (comps, params) => {
  const b = boxOf(comps);
  const add = (x, y, ex, ey) => { b.minX = Math.min(b.minX, x - ex); b.maxX = Math.max(b.maxX, x + ex); b.minY = Math.min(b.minY, y - ey); b.maxY = Math.max(b.maxY, y + ey); };
  comps.forEach(c => {
    if (c.type === 'gear' && c.p1) {
      const teeth = Math.max(6, Math.round(Number(c.teeth) || 12));
      const r = Number(params[c.radiusParam]) || 40; const R = r + 2 * r / teeth;
      add(c.p1.x, c.p1.y, R, R);
    } else if (c.type === 'rack' && c.p1) {
      const L = (Number(params[c.lenParam]) || 160) + 2 * (Number(c.endMargin) || 12), H = Number(c.bodyHeight) || 20;
      const a = (Number(c.axisDeg) || 0) * Math.PI / 180;
      add(c.p1.x, c.p1.y, Math.abs(Math.cos(a)) * L / 2 + Math.abs(Math.sin(a)) * H / 2, Math.abs(Math.sin(a)) * L / 2 + Math.abs(Math.cos(a)) * H / 2);
    }
  });
  return b;
};
const gap = (a, b) => Math.max(b.minX - a.maxX, a.minX - b.maxX, b.minY - a.maxY, a.minY - b.maxY);
const bar = (id, x1, y1, x2, y2) => ({ type: 'bar', id, p1: { id: id + 'a', x: x1, y: y1 }, p2: { id: id + 'b', x: x2, y: y2 } });

// ---------- 純函式 ----------
{
  const newComps = [bar('N', -10, -10, 10, 10)];
  const z = Ops.insertOffset([], newComps, 30, {});
  check('作品是空的：不位移', z.dx === 0 && z.dy === 0);
  const far = Ops.insertOffset([bar('E', 200, 200, 260, 260)], newComps, 30, {});
  check('本來就不重疊（含間距）：不位移', far.dx === 0 && far.dy === 0);

  // 既有範圍 x∈[-50,150]、y∈[-20,20]：往上／下只要挪 20+30+10=60，比往左右（≥ 90）小
  const existing = [bar('E', -50, -20, 150, 20)];
  const o = Ops.insertOffset(existing, newComps, 30, {});
  const moved = newComps.map(c => ({ ...c, p1: { ...c.p1, x: c.p1.x + o.dx, y: c.p1.y + o.dy }, p2: { ...c.p2, x: c.p2.x + o.dx, y: c.p2.y + o.dy } }));
  check('重疊時會挪開，且與既有範圍至少相距 margin', gap(boxOf(existing), boxOf(moved)) >= 30 - 1e-9);
  check('選位移最小的一側（這裡是上下，位移 60）', o.dx === 0 && Math.abs(Math.abs(o.dy) - 60) < 1e-9);
  check('不改輸入', newComps[0].p1.x === -10 && existing[0].p1.x === -50);

  const tall = [bar('E', -20, -200, 20, 200)];
  const o2 = Ops.insertOffset(tall, newComps, 30, {});
  check('又高又窄的既有範圍：改往左右挪（位移 60）', o2.dy === 0 && Math.abs(Math.abs(o2.dx) - 60) < 1e-9);
  // 齒輪：半徑 30、15 齒 → 齒頂 34；既有齒輪在原點，新桿在 x∈[40,60] 看似不重疊，但與齒頂圓只差 6 < 30
  const gearE = [{ type: 'gear', id: 'GE', radiusParam: 'R1', teeth: 15, p1: { id: 'GEc', x: 0, y: 0 } }];
  const nb = [bar('N2', 40, -5, 60, 5)];
  const og = Ops.insertOffset(gearE, nb, 30, { R1: 30 });
  check('齒輪算入齒頂圓：會挪開', og.dx !== 0 || og.dy !== 0);
  check('齒輪：挪開後與齒頂圓相距 ≥ margin', (() => { const m = nb.map(c => ({ ...c, p1: { ...c.p1, x: c.p1.x + og.dx, y: c.p1.y + og.dy }, p2: { ...c.p2, x: c.p2.x + og.dx, y: c.p2.y + og.dy } })); return gap(boxVis(gearE, { R1: 30 }), boxOf(m)) >= 30 - 1e-9; })());
  // 直立齒條：長 176+24=200、高 20 → y∈[-100,100]、x∈[-10,10]
  const rackE = [{ type: 'rack', id: 'RE', lenParam: 'L1', axisDeg: 90, bodyHeight: 20, endMargin: 12, p1: { id: 'REp', x: 0, y: 0 } }];
  const nr = [bar('N3', -5, 60, 5, 70)];
  const orr = Ops.insertOffset(rackE, nr, 30, { L1: 176 });
  check('齒條依長度與角度算外框：會往左右挪（位移 45）', orr.dy === 0 && Math.abs(Math.abs(orr.dx) - 45) < 1e-9);
  check('newComps 沒有有限座標：不位移', (() => { const r = Ops.insertOffset(existing, [{ type: 'gear', id: 'G' }], 30, {}); return r.dx === 0 && r.dy === 0; })());
}

// ---------- 從模組庫連續插入兩個內建模組 ----------
{
  S.comps = []; S.modules = []; S.topo = { params: { theta: 0 }, tracePoint: '', tracePoints: [], referencePoint: '' };
  S.counter = 0; S.theta = 0; S.activeMotor = '1'; S.motorAngles = {};
  S.selectedLinkId = S.selectedTriangleId = S.selectedSliderId = S.selectedGearId = S.selectedNodeId = null;
  const quiet = () => {};
  let undo = 0; const toasts = [];
  const editor = createModuleEditor({ pushUndo: () => { undo++; }, rebuild: quiet, draw: quiet, transient: m => toasts.push(m), downloadJson: quiet,
    viewCenter: () => ({ x: 0, y: 0 }), loadLibraryText: () => null, saveLibraryText: quiet });
  editor.insertBuiltin('rack-lift');
  const lift = S.modules[0];
  const liftBase = S.comps.flatMap(c => KEYS.map(k => c[k])).find(p => p && p.id === lift.base);
  check('第一個模組：底座仍放在畫面中心', liftBase && Math.abs(liftBase.x) < 1e-9 && Math.abs(liftBase.y) < 1e-9);
  editor.insertBuiltin('gear-gripper');
  const grip = S.modules[1];
  const P = S.topo.params;
  const liftBox = boxVis(S.comps.filter(c => c.moduleId === lift.id), P);
  const gripBox = boxVis(S.comps.filter(c => c.moduleId === grip.id), P);
  check('第二個模組：畫出來的範圍（含齒輪、齒條）不與第一個重疊（至少相距 margin 30）', gap(liftBox, gripBox) >= 30 - 1e-9);
  const gb = S.comps.flatMap(c => KEYS.map(k => c[k])).find(p => p && p.id === grip.base);
  check('兩個底座不在同一點', gb && Math.hypot(gb.x - liftBase.x, gb.y - liftBase.y) > 30);
  check('插入仍只記一筆 undo', undo === 2);
  editor.insertBuiltin('gear-gripper');
  const third = S.modules[2];
  const b3 = boxVis(S.comps.filter(c => c.moduleId === third.id), S.topo.params);
  const others = boxVis(S.comps.filter(c => c.moduleId !== third.id), S.topo.params);
  check('第三個模組：也不與前兩個的整體範圍重疊', gap(others, b3) >= 30 - 1e-9);
}

report('module-insert-place');
