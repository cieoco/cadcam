/**
 * blocks / status-text
 *
 * 機構狀態的純文字規則（不碰 DOM）。
 * 練習檔刻意缺零件：剛打開、還沒動手改時，解不出是「待補」（黃色提示），不是錯誤；
 * 改過之後、或不是練習檔，解不出才是紅色，並用一句話告訴學生先查什麼。
 */

// 練習／挑戰類範例（含懶載入的各單元起始練習檔）：group 為 challenge，或 level 為「練習」。
export const isPracticeLesson = lesson => !!lesson && (lesson.group === 'challenge' || lesson.level === '練習');

// 只有改到機構本身（零件、尺寸參數、模組、組立）才算「改過」；量尺、視角、播放角度等只看不改的變動不算。
// before／after 為作品 snapshot 物件（Store.toSnapshot 的結果）。
const mechanismKey = snap => JSON.stringify([snap?.comps || [], snap?.params || {}, snap?.modules || [], snap?.assemblyMembers || []]);
export const isMechanismEdit = (before, after) => mechanismKey(before) !== mechanismKey(after);

export function invalidPoseStatus({ fromPractice = false, edited = false, issue = null, comps = [] } = {}) {
  if (fromPractice && !edited) return { state: 'warn', text: '練習檔：照步驟把零件補上' };
  if (issue?.code === 'underconstrained') return loosePartStatus(comps, issue);
  return { state: 'error', text: '解不出：檢查孔有沒有接好，或按復原' };
}

// 未受約束不是解不出：點名只被一個零件用到的未解端點（沒接的一端）。
export function looseEnds(comps = [], issue = {}) {
  const ids = new Set(issue.sourceIds || []), uses = new Map(), keys = ['p1', 'p2', 'p3'];
  for (const c of comps) for (const k of keys) if (c?.[k]?.id) uses.set(c[k].id, (uses.get(c[k].id) || 0) + 1);
  return comps.filter(c => keys.some(k => ids.has(c?.[k]?.id) && uses.get(c[k].id) === 1));
}
export function loosePartStatus(comps = [], issue = {}) {
  const label = list => list.map(c => `「${c.name || c.id}」`).join('、');
  const ends = looseEnds(comps, issue);
  if (ends.length) return { state: 'warn', text: `${label(ends)}有一端沒接，機構會晃動；接上固定孔或其他零件後才能正確播放` };
  const parts = comps.filter(c => issue.componentIds?.includes(c.id));
  return { state: 'warn', text: parts.length ? `${label(parts)} 還會晃動；補接孔位或動力後才能正確播放` : '還有未控制的活動部分，請補連接或動力' };
}
