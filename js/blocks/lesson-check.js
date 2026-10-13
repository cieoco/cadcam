import { compileTopology } from '../core/topology.js';
import { solveTopology } from '../multilink/solver.js';
import { inspectMotionRange } from './solve-health.js';

// 第一個任務契約：目前設計的單 TT 曲柄滑塊，沿滑軌量測一圈的位移。
// 不改作品；不以曲柄長度代替實際求解，也不宣稱連續干涉或實物驗證。
export function checkSliderLesson({ comps = [], params = {} }) {
  const unknown = message => ({ status: 'unknown', message });
  const sliders = comps.filter(c => c.type === 'slider');
  const inputs = comps.filter(c => c.type === 'bar' && c.isInput);
  if (sliders.length !== 1 || inputs.length !== 1 || comps.some(c => !['anchor', 'bar', 'slider'].includes(c.type)))
    return unknown('請在目前設計開啟單馬達曲柄滑塊作品；此檢查只適用於 80 mm 推送器任務。');
  if (inputs[0].motorType === 'mg995') return unknown('本課使用 TT 馬達整圈轉動；舵機指定角度不適用此任務。');
  const slider = sliders[0];
  const bars = comps.filter(c => c.type === 'bar');
  const crank = inputs[0];
  const coupler = bars.find(c => c !== crank);
  const ends = new Set([coupler?.p1?.id, coupler?.p2?.id]);
  if (bars.length !== 2 || !ends.has(crank.p2?.id) || !ends.has(slider.p3?.id))
    return unknown('請用一支浮桿接好曲柄活動端與滑塊孔；本任務只檢查單曲柄、單浮桿與單滑塊。');
  const dx = slider.p2.x - slider.p1.x, dy = slider.p2.y - slider.p1.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 0)) return unknown('滑軌兩端重合，請先修正滑軌。');
  try {
    const topology = compileTopology(comps, { params: { ...params } }, new Set());
    const positions = [];
    const checked = inspectMotionRange({ comps, theta: 0, plan: { mode: 'spin' }, stepDeg: 1,
      solveAt(angle, previous) {
        const solved = solveTopology(topology, { thetaDeg: angle, _prevPoints: previous });
        const p = solved?.points?.[slider.p3.id];
        if (p) positions.push((p.x * dx + p.y * dy) / length);
        return solved;
      }
    });
    if (!checked.ok) return unknown(checked.message);
    const strokeMm = Math.max(...positions) - Math.min(...positions);
    if (!Number.isFinite(strokeMm)) return unknown('未取得有效滑塊位置。');
    const passed = Math.abs(strokeMm - 80) <= 0.2;
    return { status: passed ? 'pass' : 'retry', strokeMm, targetMm: 80, toleranceMm: 0.2, samples: checked.samples,
      message: passed ? `達成：取樣行程 ${strokeMm.toFixed(1)} mm，可開始錄影。`
        : `尚未達成：取樣行程 ${strokeMm.toFixed(1)} mm，目標 80 mm。請調整曲柄孔距，再檢查一次。` };
  } catch (_) { return unknown('無法判定：請檢查機架、浮桿連接及滑軌設定。'); }
}

