/**
 * blocks / motor-tools
 *
 * 動力來源域：放置模式（點接點放馬達）、多桿時選桿、把桿 / 滑塊 / 齒輪指派為輸入
 * （TT馬達 / MG995 伺服 / 線性致動器），以及動力型號查詢與有限行程的來回擺範圍。
 * 函式本體自 app.js 照搬、零行為改變；app 層以注入回呼提供繪製 / undo / 面板 /
 * 齒輪域 / 滑軌域能力（見 createMotorTools(deps)）。
 */

import { S } from './state.js';

export function createMotorTools({
  svg, pushUndo, pause, rebuild, draw, setBanner, clearBanner, promptText,
  exitDrawTools, deselectLink, openMobileEditPanel, updateRoleEditor,
  barsAtNode, pointIsGround, freezePointAtDisplay, setPointType,
  gearById, gearMeshChain, selectGear, rackPinionThetaRange,
  sliderProjectedDistance, railLength, sliderTravelStart, sliderTravelEnd
}) {

  function cancelMotorMode() {
    S.placingMotor = false;
    S.pickBars = null;
    svg.style.cursor = '';
    clearBanner();
  }
  const motorTypeLabel = (type) => (type === 'mg995') ? 'MG995 🟦' : (type === 'linear') ? '線性致動器 🟢' : 'TT馬達 🔴';
  function placeMotor() {
    pause();
    exitDrawTools();
    deselectLink();
    S.placingMotor = true;
    S.pickBars = null;
    svg.style.cursor = 'crosshair';
    const label = motorTypeLabel(S.pendingMotorType);
    setBanner(promptText(
      '點一個接點放上 ' + label,
      '點一下接點放上 ' + label
    ));
    draw();
  }
  function handleMotorOnNode(nodeId) {
    // 線性致動器：目標是滑塊點（slider 的 p3），讓滑塊改由直線位移驅動（活塞）。
    if (S.pendingMotorType === 'linear') {
      const sl = S.comps.find(c => c.type === 'slider' && c.p3 && c.p3.id === nodeId);
      if (!sl) { setBanner('線性致動器要放在滑塊（🟩 滑軌的方塊）上喔'); return; }
      driveSliderAt(sl.id);
      return;
    }
    // 齒輪中心：放馬達＝把這條嚙合鏈的驅動輪固定到機架並給動力（沒馬達的齒輪是靜止接地輪）。
    const gearC = S.comps.find(c => c.type === 'gear' && c.p1 && c.p1.id === nodeId);
    if (gearC) { driveGearAt(gearC.id); return; }
    const bars = barsAtNode(nodeId);
    if (!bars.length) {
      setBanner('馬達要放在連桿的端點上，或齒輪中心上喔');
      return;
    }
    if (bars.length === 1) {
      driveBarAt(bars[0].id, nodeId);
      return;
    }
    S.placingMotor = false;
    S.pickBars = { nodeId, ids: bars.map(b => b.id) };
    svg.style.cursor = '';
    setBanner(promptText(
      '這個接點有好幾根桿，點一下你要馬達轉的那根',
      '這個接點有好幾根桿，點一下要馬達轉的那根'
    ));
    draw();
  }
  function tryPickBar(barId) {
    if (!S.pickBars) return;
    if (S.pickBars.ids.includes(barId)) driveBarAt(barId, S.pickBars.nodeId);
    else cancelMotorMode();
  }
  function driveBarAt(barId, nodeId) {
    const bar = S.comps.find(c => c.id === barId && c.type === 'bar');
    if (!bar) return;
    const key = bar.p1.id === nodeId ? 'p1' : (bar.p2.id === nodeId ? 'p2' : null);
    if (!key) return;
    const otherKey = key === 'p1' ? 'p2' : 'p1';
    if (pointIsGround(bar[otherKey].id)) {
      S.placingMotor = false;
      S.pickBars = null;
      svg.style.cursor = '';
      setBanner('這根連桿另一端已經釘住了，兩端都固定不會動');
      draw();
      return;
    }
    pushUndo();
    freezePointAtDisplay(nodeId);
    // 讓馬達「從現在這個姿勢」開始轉：把曲柄目前的角度記成相位偏移。
    // 否則 input 會把曲柄瞬間轉到絕對角度 0，曲柄端點被甩到別處、整個四連桿當場塌掉。
    const angDeg = Math.atan2(bar.p2.y - bar.p1.y, bar.p2.x - bar.p1.x) * 180 / Math.PI;
    bar.motorType = S.pendingMotorType;
    if (S.pendingMotorType === 'mg995') {
      // 伺服：S.theta 從 0 起算、曲柄停在原姿勢（phaseOffset 吸收絕對角），
      // 角度面板的「起始/結束角」才直覺地對應 thetaVal。
      S.theta = 0;
      bar.phaseOffset = angDeg;
      bar.servoStart = 0;
      bar.servoEnd = 90;
    } else {
      bar.phaseOffset = angDeg - S.theta;
      delete bar.servoStart;
      delete bar.servoEnd;
    }
    bar[key].type = 'fixed';
    bar[key].physicalMotor = '1';
    bar.isInput = true;
    bar.physicalMotor = '1';
    cancelMotorMode();
    // 放完直接選取這顆馬達的接點，MG995 就會跳出角度面板。
    S.selectedNodeId = nodeId;
    S.selectedLinkId = null;
    S.selectedTriangleId = null;
    rebuild(); draw();
    updateRoleEditor();
    openMobileEditPanel();
  }
  // 線性致動器：把某根滑軌的滑塊點改成被直線位移驅動（活塞）。S.theta 從 0 起算＝行程位移。
  function driveSliderAt(sliderId) {
    const sl = S.comps.find(c => c.id === sliderId && c.type === 'slider');
    if (!sl) return;
    pushUndo();
    S.theta = 0;                 // S.theta 直接當行程位移（getLinearShift valve '1' fallback 到 S.theta）
    sl.isInput = true;
    sl.physicalMotor = '1';
    if (sl.baseEnd !== 'p2') sl.baseEnd = 'p1';
    sl.travelStart = sliderProjectedDistance(sl);
    if (!Number.isFinite(Number(sl.travelEnd)) || Number(sl.travelEnd) <= Number(sl.travelStart)) {
      sl.travelEnd = railLength(sl);
    }
    delete sl.strokeMin;
    delete sl.strokeMax;
    cancelMotorMode();
    S.selectedNodeId = sl.p3.id;
    S.selectedLinkId = null;
    S.selectedTriangleId = null;
    rebuild(); draw();
    updateRoleEditor();
    openMobileEditPanel();
  }
  // 在齒輪中心放馬達：把這條嚙合鏈的「根驅動輪」中心固定到機架並給動力。
  // 馬達一律記在驅動輪（mesh=null）中心；從動輪角度由它推算（外嚙合反向、按齒比）。
  // 沒馬達的齒輪是靜止接地輪——這個動作讓齒輪「會轉」，與桿件放馬達同理（順手把樞軸固定）。
  // 註：齒輪目前一律連續旋轉（不分 TT / 伺服），gear 層 motorType 不入 schema 故不保存。
  function driveGearAt(gearId) {
    if (S.pendingMotorType === 'linear') {
      setBanner('線性致動器不能驅動齒輪；請改用 TT馬達 / MG995');
      cancelMotorMode();
      return;
    }
    let g = gearById(gearId);
    if (!g || !g.p1) return;
    const seen = new Set();
    while (g.mesh && !seen.has(g.id)) { seen.add(g.id); const d = gearById(g.mesh); if (!d || !d.p1) break; g = d; }
    pushUndo();
    freezePointAtDisplay(g.p1.id);     // 馬達順手把驅動輪中心釘在目前位置（固定在機架），與桿件一致
    setPointType(g.p1.id, 'fixed');
    g.p1.physicalMotor = '1';
    cancelMotorMode();
    selectGear(g.id);
    rebuild(); draw();
    // 嚙合對要兩個中心都接地，整對才會完整解出、固定；提醒把另一個中心也設地錨。
    const ungrounded = gearMeshChain(g).filter(x => x.p1 && !pointIsGround(x.p1.id));
    if (ungrounded.length) setBanner('驅動輪已上馬達並固定；記得把另一個齒輪中心也設為機架點，整對才會轉');
  }

  // ---- 動力來源型號查詢 ----
  // 找以此接點為馬達中心（physicalMotor 端）的輸入桿。
  function motorBarForCenter(id) {
    return S.comps.find(c => c.type === 'bar' && c.isInput && (
      (c.p1 && c.p1.id === id && c.p1.physicalMotor) ||
      (c.p2 && c.p2.id === id && c.p2.physicalMotor)
    )) || null;
  }
  function motorTypeForCenter(id) {
    const bar = motorBarForCenter(id);
    return (bar && bar.motorType === 'mg995') ? 'mg995' : 'tt';
  }
  // 目前機構若由「有限行程的輸入」驅動（MG995 伺服角度範圍，或線性致動器的行程），
  // 回它來回擺的兩端（S.theta 座標系）；否則 null。play() 用它把整圈轉覆寫成來回擺。
  function inputRockRange() {
    const servoBar = S.comps.find(c => c.type === 'bar' && c.isInput && c.motorType === 'mg995');
    if (servoBar) {
      const a = Number(servoBar.servoStart) || 0;
      const b = Number.isFinite(Number(servoBar.servoEnd)) ? Number(servoBar.servoEnd) : 90;
      return { lo: Math.min(a, b), hi: Math.max(a, b) };
    }
    const slider = S.comps.find(c => c.type === 'slider' && c.isInput);
    if (slider) {
      const stroke = Math.max(0, sliderTravelEnd(slider) - sliderTravelStart(slider));
      return { lo: 0, hi: stroke };
    }
    const rackRange = rackPinionThetaRange();
    if (rackRange) return rackRange;
    return null;
  }

  return {
    cancelMotorMode, motorTypeLabel, placeMotor, handleMotorOnNode, tryPickBar,
    driveBarAt, driveSliderAt, driveGearAt,
    motorBarForCenter, motorTypeForCenter, inputRockRange
  };
}
