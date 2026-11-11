import {editableNumber} from './numeric-input.js';
import { fitGearReduction } from './gear-reduction.js';
import { S } from './state.js';
import { commitLegacyMountingEdit } from './mounting-review-ui.js';

export function renderReduction(c, {changeGearModule, setHole, gearPinRadius, changeGearPinHoleDiameter, rackBodyHeight, rackLength, ensureRackSlot, changeRackLength, changeRackBodyHeight, changeRackSlotLength, changeRackSlotWidth, gearMountHoles, gearMeshChain, gearById, rackForGear, setRow, setText,
  pointCoords, pointIsGround, transient, updateGearEditor, clampGearPinRadius,
  updatePointCoordsById, pushUndo, rebuild, draw, scheduleAutosave}) {
  const add = document.getElementById('gearAddMountHoles');
  if (add) {
    add.hidden = !!c.holes?.length;
    add.onclick = () => {
      const holes = gearMountHoles(c);
      if (!holes.length) return transient('齒輪太小，無法容納 8 mm 孔格的固定孔。');
      if (commitLegacyMountingEdit(S, () => { gearById(c.id).holes = holes; }, {pushUndo, notify:transient})) {
        rebuild(); draw(); scheduleAutosave(); updateGearEditor();
      }
    };
  }
  const mod = c.module;
  editableNumber(document.getElementById('gearModuleVal'),mod,v=>changeGearModule(v-(mod)),{label:'齒輪模數（mm）',min:1,max:30});
  editableNumber(document.getElementById('gearHoleAngleVal'),Number(c.phase)||0,v=>setHole(gearPinRadius(c),v),{label:'輸出孔起始角度',min:-360,max:360});
  editableNumber(document.getElementById('gearPinHoleVal'),Number(c.pinHoleDiameter)||5,v=>changeGearPinHoleDiameter(v-(Number(c.pinHoleDiameter)||5)),{label:'輸出孔徑（mm）',min:1,max:30});
  const rack = rackForGear(c);
  setRow('rackLengthRow', !!rack);
  setRow('rackOrientationRow', !!rack);
  setRow('rackBodyHeightRow', !!rack);
  setRow('rackSlotLengthRow', !!rack);
  setRow('rackSlotWidthRow', !!rack);
  setRow('rackStopRow', !!rack);
  if (rack) {
    const len = rackLength(rack);
    const bodyH = rackBodyHeight(rack, mod);
    const slot = ensureRackSlot(rack, len);
    editableNumber(document.getElementById('rackLengthVal'),len,v=>changeRackLength(v-(len)),{label:'齒條孔距（mm）',min:32,max:2000});
    editableNumber(document.getElementById('rackBodyHeightVal'),bodyH,v=>changeRackBodyHeight(v-(bodyH)),{label:'齒條背板高度（mm）',min:4,max:2000});
    editableNumber(document.getElementById('rackSlotLengthVal'),slot.length,v=>changeRackSlotLength(v-(slot.length)),{label:'齒條槽長（mm）',min:8,max:len-12});
    editableNumber(document.getElementById('rackSlotWidthVal'),slot.width,v=>changeRackSlotWidth(v-(slot.width)),{label:'齒條槽寬（mm）',min:2,max:20});
    const fmt = v => Number(v).toFixed(1).replace(/\.0$/, '');
    setText('rackStopVal', (slot.trimStart > 0 || slot.trimEnd > 0) ? [slot.trimStart > 0 ? `${(Number(rack.sign) < 0) ? '負' : '正'}角度端 ${fmt(slot.trimStart)}` : '', slot.trimEnd > 0 ? `${(Number(rack.sign) < 0) ? '正' : '負'}角度端 ${fmt(slot.trimEnd)}` : ''].filter(Boolean).join('、') + ' mm' : '無');
    const orientationBtn=document.getElementById('rackOrientationBtn');
    if(orientationBtn){ const vertical=Math.abs(Math.sin((Number(rack.axisDeg)||0)*Math.PI/180))>.7; orientationBtn.textContent=vertical?'↕ 垂直升降':'↔ 水平伸縮'; }
  }
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
