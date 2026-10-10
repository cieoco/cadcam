/** 固定／動力支撐語意檢查。座標固定與安裝宣告不等於實體鎖固驗證。 */
export function validateSupports(snapshot = {}) {
  snapshot ||= {};
  const comps = Array.isArray(snapshot.comps) ? snapshot.comps.filter(Boolean) : [];
  const modules = Array.isArray(snapshot.modules) ? snapshot.modules : [];
  const issues = [], motors = [], fixedPoints = [];
  const issue = (code, message, targets, severity = 'warning') => issues.push({ code, message, targets, severity });
  const points = c => [c.p1, c.p2, c.p3].filter(Boolean);
  const fixed = c => ['bar', 'triangle'].includes(c?.type) && !c.isInput && !c.physicalMotor && !c.physical_motor &&
    [c.p1, c.p2].every(p => p && ['fixed', 'motor'].includes(p.type)) &&
    Math.hypot(c.p1.x-c.p2.x,c.p1.y-c.p2.y)>1e-6;
  for (const c of comps) for (const p of points(c)) {
    if (['fixed', 'motor'].includes(p.type) && !fixedPoints.some(q => q.id === p.id))
      fixedPoints.push({ id:p.id, moduleId:c.moduleId || null, status:'ideal_fixed', physicalVerified:false });
  }
  // 多孔板可共用動力孔，但不是另一顆馬達；只核對動力來源元件。
  for (const c of comps.filter(c => c.isInput || c.motorMount || c.motorCarrier || c.motor_carrier || (c.type !== 'triangle' && (c.physicalMotor || c.physical_motor)))) {
    const mount = c.motorMount || {}, frameId = mount.frameBody || c.motorCarrier || c.motor_carrier;
    const motor = { componentId:c.id, frameBody:frameId || null, status:'ideal_fixed', physicalVerified:false };
    motors.push(motor);
    if (mount.outputBody && mount.outputBody !== c.id) issue('INVALID_MOTOR_OUTPUT','動力輸出件宣告與來源元件不一致。',[c.id,mount.outputBody],'error');
    if (mount.center && !points(c).some(p => p.id === mount.center)) issue('INVALID_MOTOR_CENTER','動力軸心不在輸出件主孔上。',[c.id,mount.center],'error');
    if (!frameId) { issue('IDEAL_MOTOR_SUPPORT','動力外殼僅採理想固定，未指定實體支架。',[c.id]); continue; }
    const frame = comps.find(p => p.id === frameId);
    if (!frame) { issue('MISSING_MOTOR_FRAME','動力外殼指定的機架不存在。',[c.id,frameId],'error'); continue; }
    if (frameId === c.id || (points(frame).length >= 2 && points(c).filter(p => points(frame).some(q => q.id === p.id)).length >= 2)) {
      issue('MOTOR_FRAME_IS_OUTPUT','動力外殼與輸出件屬同一剛體，無法產生相對轉動。',[c.id,frameId],'error'); continue;
    }
    if (frame.moduleId !== c.moduleId) { issue('CROSS_MODULE_MOTOR_SUPPORT','跨模組動力支撐尚未驗證。',[c.id,frameId]); continue; }
    const carrier = c.motorCarrier || c.motor_carrier;
    if (!fixed(frame)) {
      if (carrier === frameId) { motor.status='moving_carrier_declared'; issue('CARRIER_SUPPORT_UNVERIFIED','已宣告隨動機架，至底座的支撐鏈尚未驗證。',[c.id,frameId]); }
      else issue('MOVING_MOTOR_FRAME','指定機架未被固定，也未宣告為隨動機架。',[c.id,frameId],'error');
      continue;
    }
    motor.status='fixed_frame_declared';
    issue('MOTOR_FASTENING_UNVERIFIED','固定支架已宣告；外殼鎖固、軸支撐與底座固定仍未驗證。',[c.id,frameId]);
    if (modules.find(m => m?.id === c.moduleId)?.mount) issue('ASSEMBLED_SUPPORT_UNVERIFIED','模組內固定僅是局部基準，至底座的組立支撐鏈仍待核對。',[c.id,c.moduleId]);
  }
  if (fixedPoints.length) issue('IDEAL_GROUND','固定支點為求解器的理想約束，尚未證明底座實體固定。',fixedPoints.map(p => p.id));
  return { ok:!issues.some(i => i.severity === 'error'), status:issues.some(i => i.severity === 'error')?'invalid':'unverified', physicalVerified:false, fixedPoints, motors, issues,
    scope:{ checked:['declared_motor_frame','frame_output_separation','local_fixed_reference'], unchecked:['fasteners','base_attachment','opposite_bearing','load','complete_support_chain'] } };
}
