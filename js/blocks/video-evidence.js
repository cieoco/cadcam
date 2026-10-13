import { checkSliderLesson } from './lesson-check.js';

// Called at recording start, never reuse a previous lesson dialog's verdict.
export function buildVideoEvidence({ comps, params, version, lessonId }) {
  if (lessonId !== 'slider80') return { lines: [`機構積木 · v${version} · 未附任務驗證`] };
  const result = checkSliderLesson({ comps, params });
  if (result.status !== 'pass') throw new Error(`錄影前重驗未通過：${result.message}`);
  const crank = comps.find(c => c.type === 'bar' && c.isInput);
  const rod = comps.find(c => c.type === 'bar' && !c.isInput);
  return { lessonId, lines: [
    '80 mm 推送器｜模擬行程檢查通過',
    `曲柄 ${Number(params[crank.lenParam]).toFixed(1)} mm · 中間連桿 ${Number(params[rod.lenParam]).toFixed(1)} mm`,
    `取樣行程 ${result.strokeMm.toFixed(1)} mm · 目標 80 ±0.2 mm · 每 1° 檢查`,
    `機構積木 v${version} · 未驗證碰撞、承載及實物`
  ] };
}
