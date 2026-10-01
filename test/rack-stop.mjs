// L6b（走通舉升＋夾取 第 6 包）：MG995 機身在升降低處會撞小齒輪與機架 → 限制升降行程。
// 限位是實體的：把齒條長槽一端縮短（slot.trimStart／trimEnd，mm），導銷碰到槽端就停。
// 干涉檢查會建議縮短多少（suggestRackStops），套用後在新行程內不再干涉。
import { check, report } from './_harness.mjs';

class FakeElement {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.style = {}; this.dataset = {}; this.textContent = ''; this.value = ''; this.listeners = {}; this.attrs = {}; }
  get firstChild() { return this.children[0] || null; }
  appendChild(c) { this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter(x => x !== c); return c; }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
}
const els = new Map();
globalThis.document = { getElementById: id => { if (!els.has(id)) els.set(id, new FakeElement()); return els.get(id); }, createElement: t => new FakeElement(t) };

const RL = await import('../js/blocks/rack-limits.js');
const IF = await import('../js/blocks/interference.js');
const BP = await import('../js/blocks/build-plan.js');
const { inspectRackExport } = await import('../js/blocks/exporters.js');
const Sch = await import('../js/blocks/schema.js');
const { compileAssembly, solveAssembly } = await import('../js/blocks/assembly.js');
check('interference.js 匯出 suggestRackStops', typeof IF.suggestRackStops === 'function');
if (typeof IF.suggestRackStops !== 'function') { report('rack-stop'); process.exit(1); }

const D = Math.PI / 180;
// ---------- 1. 行程公式：一端縮短只影響那一側 ----------
{
  const H = RL.rackGuideTravel(144, 3.4).halfTravel;
  const sym = RL.rackGuideThetaRange(30, 144, 3.4, 1);
  check('沒縮短：維持對稱（舊行為）', Math.abs(sym.lo + sym.hi) < 1e-9);
  const r = RL.rackGuideThetaRange(30, 144, 3.4, 1, 0, 50);
  check('縮短 +u 端 50 mm：下限變成 -(H-50)/R', Math.abs(r.lo - (-(H - 50) / 30 / D)) < 1e-9);
  check('縮短 +u 端：上限不變', Math.abs(r.hi - sym.hi) < 1e-9);
  const r2 = RL.rackGuideThetaRange(30, 144, 3.4, 1, 20, 0);
  check('縮短 -u 端 20 mm：上限變成 (H-20)/R、下限不變', Math.abs(r2.hi - (H - 20) / 30 / D) < 1e-9 && Math.abs(r2.lo - sym.lo) < 1e-9);
  const rn = RL.rackGuideThetaRange(30, 144, 3.4, -1, 0, 50);
  check('sign=-1：方向反過來（縮短 +u 端限制的是上限）', Math.abs(rn.hi - (H - 50) / 30 / D) < 1e-9 && Math.abs(rn.lo + sym.hi) < 1e-9);
  const over = RL.rackGuideThetaRange(30, 144, 3.4, 1, 0, H + 10);
  check('縮短超過可用行程：夾在 0（不會越過組裝姿態）', over && Math.abs(over.lo) < 1e-9);
}

// ---------- 2. 匯出與存檔 ----------
const rackComp = trimEnd => ({ type: 'rack', id: 'R', p1: { id: 'RP', x: 0, y: 0 }, lenParam: 'L', axisDeg: 90, sign: 1, bodyHeight: 20, endMargin: 12,
  slot: { length: 144, width: 3.4, offset: 0, ...(trimEnd ? { trimEnd } : {}) } });
{
  const ext = c => { const pts = inspectRackExport(c, { L: 176 }, null).cutouts.find(x => x.layer === 'RACK_SLOT').points.map(p => p.x); return [Math.min(...pts), Math.max(...pts)]; };
  const [a0, b0] = ext(rackComp(0)), [a1, b1] = ext(rackComp(30));
  check('匯出長槽：+u 端縮短 30 mm，-u 端不動', Math.abs(a1 - a0) < 0.01 && Math.abs((b0 - b1) - 30) < 0.01);
  const n = Sch.normalizeSnapshot({ kind: 'blocks', v: 1, comps: [rackComp(30)], params: { L: 176 } });
  const s = n.comps.find(c => c.type === 'rack').slot;
  check('存檔往返：保留 trimEnd', s.trimEnd === 30 && !('trimStart' in s && s.trimStart !== 0));
  const n0 = Sch.normalizeSnapshot({ kind: 'blocks', v: 1, comps: [rackComp(0)], params: { L: 176 } });
  check('存檔往返：沒縮短就不多出欄位（舊檔不變）', !('trimEnd' in n0.comps[0].slot) && !('trimStart' in n0.comps[0].slot));
}

// ---------- 3. 舉升＋夾取：建議限位 ----------
const { S } = await import('../js/blocks/state.js');
const { createModuleEditor } = await import('../js/blocks/module-editor.js');
S.comps = []; S.modules = []; S.topo = { params: { theta: 0 }, tracePoint: '', tracePoints: [], referencePoint: '' };
S.counter = 0; S.theta = 0; S.activeMotor = '1'; S.motorAngles = {};
S.selectedLinkId = S.selectedTriangleId = S.selectedSliderId = S.selectedGearId = S.selectedNodeId = null;
const q = () => {};
const ed = createModuleEditor({ pushUndo: q, rebuild: q, draw: q, transient: q, downloadJson: q, viewCenter: () => ({ x: 0, y: 0 }), loadLibraryText: () => null, saveLibraryText: q });
ed.insertBuiltin('rack-lift'); ed.insertBuiltin('gear-gripper');
const L = S.modules[0], G = S.modules[1];
S.selectedGearId = S.comps.find(c => c.moduleId === G.id && c.type === 'gear').id;
ed.mountTo(L.id, L.outputs[0].id);

const cnc = { toolDiameterMm: 3.175, stockThicknessMm: 3 };
const ex = { holeDiameterMm: 3.2, frameHoleDiameterMm: 3.2 };
const base = { comps: S.comps, modules: S.modules, params: S.topo.params, exportSettings: ex, cnc };
const rack = S.comps.find(c => c.type === 'rack');
const pinion = S.comps.find(c => c.id === rack.pinion);
const R = S.topo.params[pinion.radiusParam];
const full = RL.rackGuideThetaRange(R, rack.slot.length, rack.slot.width, rack.sign);
const ranges = { '1': full, '2': { lo: 0, hi: 24 } };
{
  const before = JSON.stringify(S.comps);
  const { plan } = IF.resolveSpacers({ ...base, ranges, samplesPerMotor: 9 });
  const sug = IF.suggestRackStops({ ...base, plan, ranges });
  console.log('suggest:', JSON.stringify(sug));
  check('純函式：不改 comps', JSON.stringify(S.comps) === before);
  check('建議一筆：升降馬達 1、齒條 LiftRackGear', Array.isArray(sug) && sug.length === 1 && sug[0].motor === '1' && sug[0].rackId === rack.id);
  const s = sug[0] || {};
  check('只縮短下降那端（+u 端 trimEnd > 0，trimStart = 0）', s.trimEnd > 0 && s.trimStart === 0);
  check('新下限在 -8°（會撞）與 0° 之間', s.range && s.range.lo > -8 && s.range.lo <= 0);
  check('上限不變', s.range && Math.abs(s.range.hi - full.hi) < 0.5);
  check('附上行程 mm（前後）讓使用者知道代價', s.travelMm && s.travelMm.before > s.travelMm.after && s.travelMm.after > 0 &&
    Math.abs(s.travelMm.before - (full.hi - full.lo) * D * R) < 0.5);
  check('有中文說明（長槽縮短幾 mm、行程變多少）', typeof s.message === 'string' && /長槽/.test(s.message) && /mm/.test(s.message));

  // 套用建議後：行程＝建議、範圍內只剩 0 項干涉、導銷仍在槽內
  const trimmed = JSON.parse(JSON.stringify(S.comps));
  const tr = trimmed.find(c => c.id === rack.id);
  tr.slot.trimStart = s.trimStart; tr.slot.trimEnd = s.trimEnd;
  const nr = RL.rackGuideThetaRange(R, tr.slot.length, tr.slot.width, tr.sign, tr.slot.trimStart, tr.slot.trimEnd);
  check('套用後行程公式算出的範圍＝建議範圍（±0.01°）', nr && Math.abs(nr.lo - s.range.lo) < 0.01 && Math.abs(nr.hi - s.range.hi) < 0.01);
  const after = IF.resolveSpacers({ ...base, comps: trimmed, ranges: { '1': nr, '2': { lo: 0, hi: 24 } }, samplesPerMotor: 15 });
  console.log('after:', after.interference.map(x => x.message).join(' | '));
  check('套用後（含自動隔圈）：干涉 0 項', after.interference.length === 0);

  const slotX = (() => { const pts = inspectRackExport(tr, S.topo.params, pinion).cutouts.find(x => x.layer === 'RACK_SLOT').points.map(p => p.x); return [Math.min(...pts), Math.max(...pts)]; })();
  const asm = compileAssembly(trimmed, S.modules, { params: S.topo.params });
  const pinsOk = [nr.lo, nr.hi].every(a => {
    const sol = solveAssembly(asm, { thetaDeg: 0, motorAngles: { '1': a, '2': 0 } });
    if (!sol.isValid) return false;
    const p1 = sol.points[tr.p1.id], ax = (Number(tr.axisDeg) || 0) * D;
    return tr.framePins.every(id => { const p = sol.points[id]; const u = (p.x - p1.x) * Math.cos(ax) + (p.y - p1.y) * Math.sin(ax); return u >= slotX[0] - 0.01 && u <= slotX[1] + 0.01; });
  });
  check('新行程兩端：導銷都還在縮短後的長槽內', pinsOk);
}
report('rack-stop');
