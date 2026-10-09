/** 干涉檢查結果與顯示判斷。檢查失敗不得當作沒有碰撞。純函式。 */
export function checkLiveInterference(check) {
  try {
    const findings = check();
    if (!Array.isArray(findings)) throw new Error('invalid-result');
    return { findings, ready: true, error: false };
  } catch (_) { return { findings: [], ready: false, error: true }; }
}
export function liveInterferenceStatus({ hasFace = false, ready = false, hasParts = false, error = false, n = 0, labels = [], material = null, playing = false, candidate = false, solveValidity = null } = {}) {
  if (hasFace) {
    if(candidate)return {state:'none',message:'接合預覽的材料檢查尚未接入'};
    if(solveValidity?.valid===false)return {state:'none',message:'目前姿態無解；畫面保留上一有效姿態，尚未檢查'};
    if(playing)return {state:'none',message:'播放中：此姿態材料待檢查'};
    if(!material)return {state:'none',message:'此姿態材料待檢查'};
    const count=n+(material.findings?.length || 0);
    if(count)return {state:'hit',message:`✖ 此姿態撞到 ${count} 處${labels.length?'：'+labels.join('、'):''}`};
    if(error)return {state:'none',message:'同平面檢查失敗；目前無法完整判定'};
    if(!ready||!hasParts)return {state:'none',message:'此姿態的部分檢查尚未完成'};
    const unsupported=material.coverage?.notSupported || [];
    if(unsupported.some(d=>d.code!=='material_representation_not_supported'))return {state:'none',message:'部分材料未能驗證；目前無法完整判定'};
    if(unsupported.length)return {state:'none',message:'板件未發現穿入；部分五金未檢查'};
    if(material.status!=='pass')return {state:'none',message:'此姿態材料待檢查'};
    return {state:'ok',message:'此姿態：已檢查範圍無干涉'};
  }
  if (error) return { state: 'none', message: '干涉檢查失敗，請重新檢查；目前無法判定' };
  if (!hasParts) return { state: 'none', message: '尚無零件可檢查干涉' };
  if (!ready) return { state: 'none', message: '干涉檢查中…' };
  if (n) return { state: 'hit', message: `✖ 撞到 ${n} 處${labels.length ? '：' + labels.join('、') : ''}` };
  return { state: 'ok', message: '✔ 目前姿勢沒有干涉' };
}
