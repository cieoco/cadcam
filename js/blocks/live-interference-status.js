/** 干涉檢查結果與顯示判斷。檢查失敗不得當作沒有碰撞。純函式。 */
export function checkLiveInterference(check) {
  try {
    const findings = check();
    if (!Array.isArray(findings)) throw new Error('invalid-result');
    return { findings, ready: true, error: false };
  } catch (_) { return { findings: [], ready: false, error: true }; }
}
export function liveInterferenceStatus({ hasFace = false, ready = false, hasParts = false, error = false, n = 0, labels = [] } = {}) {
  if (hasFace) return { state: 'none', message: '六面接合的跨面干涉尚未驗證' };
  if (error) return { state: 'none', message: '干涉檢查失敗，請重新檢查；目前無法判定' };
  if (!hasParts) return { state: 'none', message: '尚無零件可檢查干涉' };
  if (!ready) return { state: 'none', message: '干涉檢查中…' };
  if (n) return { state: 'hit', message: `✖ 撞到 ${n} 處${labels.length ? '：' + labels.join('、') : ''}` };
  return { state: 'ok', message: '✔ 目前姿勢沒有干涉' };
}
