import { fitGearReduction } from './gear-reduction.js';
import { S } from './state.js';
import { commitLegacyMountingEdit } from './mounting-review-ui.js';

export function renderReduction(c, {gearMeshChain, gearById, rackForGear, setRow, setText,
  pointCoords, pointIsGround, transient, updateGearEditor, clampGearPinRadius,
  updatePointCoordsById, pushUndo, rebuild, draw, scheduleAutosave}) {
  const mod = c.module;
  const chain = gearMeshChain(c);
  const pairOutput = chain.length === 2 && chain.find(g => g.mesh);
  const pairInput = pairOutput && gearById(pairOutput.mesh);
  const ratioField = document.getElementById('gearRatio');
  const simplePair = pairInput && !chain.some(rackForGear);
  setRow('gearRatioRow', simplePair);
  setText('gearPairSpec', simplePair ? `主動 ${pairInput.teeth} 齒 → 從動 ${pairOutput.teeth} 齒，模數 ${mod}` : '');
  if (ratioField && pairInput) {
    ratioField.value = String(pairOutput.teeth / pairInput.teeth);
    if (ratioField.selectedIndex < 0) ratioField.value = '';
    ratioField.onchange = () => {
      if (!ratioField.value) return;
      const pts = pointCoords();
      const a = pts[pairInput.p1.id] || pairInput.p1, b = pts[pairOutput.p1.id] || pairOutput.p1;
      const distance = Math.hypot(a.x-b.x, a.y-b.y);
      // 只有獨立浮動的從動輪可以跟著換軸距。
      const free = pairOutput.p1.type === 'floating' && !pointIsGround(pairOutput.p1.id)
        && !S.comps.some(p => p !== pairOutput && [p.p1,p.p2,p.p3,...(p.holes || [])].some(n => n?.id === pairOutput.p1.id));
      const fit = fitGearReduction(Number(ratioField.value), distance, !free);
      if (!fit) {
        const nearest = fitGearReduction(Number(ratioField.value), distance);
        transient(nearest ? `目前軸距無法配齒，建議改用中心距 ${nearest.center} mm 的軸孔` : '目前沒有合適的齒輪組');
        updateGearEditor(); return;
      }
      if (commitLegacyMountingEdit(S, () => {
        for (const [g, teeth] of [[pairInput,fit.input],[pairOutput,fit.output]]) {
          const gear = gearById(g.id);
          gear.module = fit.module;
          gear.teeth = teeth;
          S.topo.params[gear.radiusParam] = teeth * fit.module / 2;
          clampGearPinRadius(gear);
        }
        if (free && fit.error > 0.001) {
          const angle = Math.atan2(b.y-a.y, b.x-a.x);
          updatePointCoordsById(pairOutput.p1.id, a.x+fit.center*Math.cos(angle), a.y+fit.center*Math.sin(angle));
        }
      }, {pushUndo, notify:transient})) { rebuild(); draw(); scheduleAutosave(); }
      updateGearEditor();
    };
  }
}
