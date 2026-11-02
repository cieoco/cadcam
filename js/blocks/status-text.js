/**
 * blocks / status-text
 *
 * 機構狀態的純文字規則（不碰 DOM）。
 * 練習檔刻意缺零件：剛打開、還沒動手改時，解不出是「待補」（黃色提示），不是錯誤；
 * 改過之後、或不是練習檔，解不出才是紅色，並用一句話告訴學生先查什麼。
 */

// 練習／挑戰類範例（含懶載入的各單元起始練習檔）：group 為 challenge，或 level 為「練習」。
export const isPracticeLesson = lesson => !!lesson && (lesson.group === 'challenge' || lesson.level === '練習');

export function invalidPoseStatus({ fromPractice = false, edited = false } = {}) {
  if (fromPractice && !edited) return { state: 'warn', text: '練習檔：照步驟把零件補上' };
  return { state: 'error', text: '解不出：檢查孔有沒有接好，或按復原' };
}
