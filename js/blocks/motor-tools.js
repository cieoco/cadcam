/**
 * blocks / motor-tools
 *
 * 動力來源域：放置模式（點接點放馬達）、多桿時選桿、把桿 / 滑塊 / 齒輪指派為輸入
 * （TT馬達 / MG995 伺服 / 線性致動器），以及動力型號查詢與有限行程的來回擺範圍。
 * 函式本體自 app.js 照搬、零行為改變；app 層以注入回呼提供繪製 / undo / 面板 /
 * 齒輪域 / 滑軌域能力（見 createMotorTools(deps)）。
 */

import { S, activateMotor, usedMotorIds, nextMotorId } from './state.js';

export function createMotorTools({
  svg, pushUndo, pause, rebuild, draw, setBanner, clearBanner, promptText,
  exitDrawTools, deselectLink, openMobileEditPanel, updateRoleEditor,
  barsAtNode, pointIsGround, pointUseCount, freezePointAtDisplay, setPointType,
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
    if (!S.pickBars.ids.includes(barId)) { cancelMotorMode(); return; }
    if (S.pickBars.stage === 'carrier') {
      finishDriveBar(S.pickBars.drivenId, S.pickBars.nodeId, barId, false);
    } else {
      driveBarAt(barId, S.pickBars.nodeId);
    }
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
    // 每顆馬達都固定在某個「機架」上：接點接地＝機架是世界機架（傳統放法，順手把接點釘住）；
    // 接點未接地但還有別根桿共用＝騎乘馬達，馬達殼鎖在其中一根桿上、那根桿就是它的機架桿。
    if (!pointIsGround(nodeId)) {
      const carriers = barsAtNode(nodeId).filter(c => c.id !== barId);
      if (carriers.length === 1) { finishDriveBar(barId, nodeId, carriers[0].id, false); return; }
      if (carriers.length > 1) {
        // 第二階段選桿：馬達殼要鎖在哪根桿上（那根桿＝這顆馬達的機架）
        S.placingMotor = false;
        S.pickBars = { nodeId, ids: carriers.map(c => c.id), stage: 'carrier', drivenId: barId };
        svg.style.cursor = '';
        setBanner(promptText(
          '馬達殼要固定在哪根桿上？點那根桿（它就是這顆馬達的機架）',
          '馬達殼要鎖在哪根桿上？點一下那根桿'
        ));
        draw();
        return;
      }
      // 沒有別根桿、但節點與其他零件（如三點板）共用：不能落地，先用「不轉的機架」語意騎乘。
      if (pointUseCount(nodeId) > 1) { finishDriveBar(barId, nodeId, null, false); return; }
    }
    finishDriveBar(barId, nodeId, null, true);
  }
  // 完成放置。carrierId = 馬達殼鎖定的機架桿（null = 世界機架 / 不轉的機架）；
  // pinNode = 順手把接點釘到世界機架（傳統放法）。
  function finishDriveBar(barId, nodeId, carrierId, pinNode) {
    const bar = S.comps.find(c => c.id === barId && c.type === 'bar');
    if (!bar) return;
    const key = bar.p1.id === nodeId ? 'p1' : (bar.p2.id === nodeId ? 'p2' : null);
    if (!key) return;
    const carrier = carrierId ? S.comps.find(c => c.id === carrierId && c.type === 'bar') : null;
    // 這根桿已是輸入就沿用原編號；否則配一個新編號（第一顆自然是 '1'）。
    const motorId = String(bar.physicalMotor || bar.physical_motor ||
      bar.p1.physicalMotor || bar.p2.physicalMotor || nextMotorId());
    pushUndo();
    freezePointAtDisplay(nodeId);
    // 讓馬達「從現在這個姿勢」開始轉：把曲柄目前的角度記成相位偏移，每顆馬達的角度從 0 起算。
    // 世界機架馬達：相位＝絕對方位角；機架桿馬達：相位＝相對機架桿的夾角（機構動時跟著機架桿轉）。
    const angDeg = Math.atan2(bar.p2.y - bar.p1.y, bar.p2.x - bar.p1.x) * 180 / Math.PI;
    bar.motorType = S.pendingMotorType;
    activateMotor(motorId, 0);
    if (carrier) {
      const carrierAng = Math.atan2(carrier.p2.y - carrier.p1.y, carrier.p2.x - carrier.p1.x) * 180 / Math.PI;
      bar.motorCarrier = carrier.id;
      bar.phaseOffset = angDeg - carrierAng;
    } else {
      delete bar.motorCarrier;
      bar.phaseOffset = angDeg;
      if (pinNode) bar[key].type = 'fixed';   // 世界機架：接點釘住（馬達殼鎖在機架上）
    }
    if (S.pendingMotorType === 'mg995') {
      // 伺服：角度面板的「起始/結束角」直覺對應 thetaVal。
      bar.servoStart = 0;
      bar.servoEnd = 90;
    } else {
      delete bar.servoStart;
      delete bar.servoEnd;
    }
    bar[key].physicalMotor = motorId;
    bar.isInput = true;
    bar.physicalMotor = motorId;
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
    const motorId = String(sl.physicalMotor || sl.physical_motor || nextMotorId());
    activateMotor(motorId, 0);   // S.theta 直接當行程位移（active 馬達由 motorAngles 傳給 getLinearShift）
    sl.isInput = true;
    sl.physicalMotor = motorId;
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
    const motorId = String(g.p1.physicalMotor || g.p1.physical_motor || nextMotorId());
    activateMotor(motorId);            // 齒輪沿用舊行為：不重置 θ，只切換控制權
    g.p1.physicalMotor = motorId;
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
  // 目前「控制中的馬達」若是有限行程的輸入（MG995 伺服角度範圍，或線性致動器的行程），
  // 回它來回擺的兩端（S.theta 座標系）；否則 null。play() 用它把整圈轉覆寫成來回擺。
  // 多馬達時只看 active 那顆——其他馬達凍結不動，不該影響播放範圍。
  function inputRockRange() {
    const active = String(S.activeMotor || '1');
    const motorIdOf = (c) => String(c.physicalMotor || c.physical_motor || '1');
    const servoBar = S.comps.find(c => c.type === 'bar' && c.isInput && c.motorType === 'mg995' && motorIdOf(c) === active);
    if (servoBar) {
      const a = Number(servoBar.servoStart) || 0;
      const b = Number.isFinite(Number(servoBar.servoEnd)) ? Number(servoBar.servoEnd) : 90;
      return { lo: Math.min(a, b), hi: Math.max(a, b) };
    }
    const slider = S.comps.find(c => c.type === 'slider' && c.isInput && motorIdOf(c) === active);
    if (slider) {
      const stroke = Math.max(0, sliderTravelEnd(slider) - sliderTravelStart(slider));
      return { lo: 0, hi: stroke };
    }
    // 齒條行程只在 active 馬達就是驅動齒輪那顆時才適用
    const gearDriven = S.comps.some(c => c.type === 'gear' && c.p1 &&
      String(c.p1.physicalMotor || c.p1.physical_motor || '') === active);
    if (gearDriven) {
      const rackRange = rackPinionThetaRange();
      if (rackRange) return rackRange;
    }
    return null;
  }

  return {
    cancelMotorMode, motorTypeLabel, placeMotor, handleMotorOnNode, tryPickBar,
    driveBarAt, driveSliderAt, driveGearAt,
    motorBarForCenter, motorTypeForCenter, inputRockRange
  };
}
