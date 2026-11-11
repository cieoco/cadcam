import {idCounts} from '../core/local-holes.js';
import {editableNumber} from './numeric-input.js';
import { fitGearReduction } from './gear-reduction.js';
import { S } from './state.js';
import { commitLegacyMountingEdit } from './mounting-review-ui.js';

export function renderReduction(c, {changeGearModule, setHole, gearPinRadius, changeGearPinHoleDiameter, rackBodyHeight, rackLength, ensureRackSlot, changeRackLength, changeRackBodyHeight, changeRackSlotLength, changeRackSlotWidth, gearMountHoles, gearMeshChain, gearById, rackForGear, setRow, setText,
  pointCoords, pointIsGround, transient, updateGearEditor, clampGearPinRadius,
  updatePointCoordsById, pushUndo, rebuild, draw, scheduleAutosave}) {
  const count = document.getElementById('gearMountCount');
  if (count) {
    const existing = c.holes || [];
    count.value = String(existing.length);
    count.onchange = () => {
      const wanted = Number(count.value);
      const refs = idCounts(S.comps.filter(other => other !== c), S.modules, S.topo.tracePoints, S.topo.tracePoint);
      const removed = existing.slice(wanted);
      if (removed.some(h => h.type === 'fixed' || refs.has(h.id))) {
        transient('要移除的孔已固定或被使用，請先解除連接。');
        count.value = String(existing.length);
        return;
      }
      const holes = existing.slice(0, wanted);
      if (!holes.length && wanted) holes.push(...gearMountHoles(c));
      if (wanted === 4 && holes.length === 2) {
        // Keep the new pair on a grid diameter, clear of the existing output pin.
        const root = c.module * (c.teeth / 2 - 1.25);
        const clearance = (Number(c.pinHoleDiameter) || 5) / 2 + 1.6 + 1;
        const radius = [Math.abs(holes[0].v), 8, 16].find(r =>
          r >= 8 && r + 3.2 <= root && Math.abs(r - gearPinRadius(c)) >= clearance);
        if (radius) {
          for (const sign of [-1, 1]) {
            const id = c.id + '_mount' + holes.length;
            holes.push({id, u:radius * sign, v:0, diameter:3.2, type:'floating'});
          }
        }
      }
      if (holes.length !== wanted) transient('齒根與輸出孔之間空間不足，請調整齒數或輸出孔距。');
      else if (commitLegacyMountingEdit(S, () => { gearById(c.id).holes = holes; }, {pushUndo, notify:transient})) {
        rebuild(); draw(); scheduleAutosave();
      }
      updateGearEditor();
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
  // 分開咬合（和頂端「調整」裡的同一個指令）：只有和別的齒輪嚙合時才出現
  let release = document.getElementById('gearReleaseBtn');
  if (!release) {
    release = document.createElement('button');
    release.id = 'gearReleaseBtn'; release.type = 'button'; release.className = 'clear-btn'; release.style.minHeight = '44px';
    release.textContent = '分開咬合'; release.title = '讓這個齒輪與嚙合的齒輪分開，齒輪留在原位';
    release.onclick = () => window.blocks.releaseGearMesh();
    document.getElementById('gearPairSpec')?.after(release);
  }
  release.style.display = c.mesh || S.comps.some(g => g.type === 'gear' && g.mesh === c.id) ? '' : 'none';
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
