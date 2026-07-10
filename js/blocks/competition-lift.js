export const LIFT_PARAM_FIELDS = [
  ['LIFT_ARM','下臂長度',24,240], ['LIFT_ARM_2','上臂長度',24,240],
  ['LIFT_UPRIGHT','塔架高度',24,240], ['LIFT_TOOL_FRONT','工具板高度',24,240],
  ['LIFT_TOOL_TOP','工具板上緣',24,160], ['LIFT_TOOL_BOTTOM','工具板下緣',24,160]
].map(([key,label,min,max]) => ({ key,label,min,max,step:8 }));

export function analyzeCompetitionLift(params = {}, settings = {}) {
  const n = key => Number(params[key]) || 0;
  const armDeltaMm = Math.abs(n('LIFT_ARM') - n('LIFT_ARM_2'));
  const poseErrorMm = Math.max(Math.abs(n('LIFT_UPRIGHT') - n('LIFT_TOOL_FRONT')), Math.abs(n('LIFT_TOOL_TOP') - n('LIFT_TOOL_BOTTOM')));
  const edgeMarginMm = ((Number(settings.barWidthMm) || 16) - (Number(settings.holeDiameterMm) || 5)) / 2;
  const errors = [], warnings = [];
  if (armDeltaMm > 1) errors.push(`上下臂相差 ${armDeltaMm.toFixed(1)} mm，平台無法保持平行`);
  if (poseErrorMm > 1) errors.push(`工具板對邊相差 ${poseErrorMm.toFixed(1)} mm，閉環尺寸不一致`);
  if (edgeMarginMm < 3) errors.push(`孔邊僅 ${edgeMarginMm.toFixed(1)} mm，低於 3 mm`);
  if (n('LIFT_ARM') < n('LIFT_UPRIGHT') * .5) warnings.push('臂長偏短，升降時水平位移比例較大');
  return { ok: !errors.length, status: errors.length?'error':warnings.length?'warn':'ready', travelMm:n('LIFT_ARM')*2, armDeltaMm, poseErrorMm, edgeMarginMm, errors, warnings };
}
