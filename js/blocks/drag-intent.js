/**
 * blocks / drag-intent  (pack O3 of docs/SDD-OPERATION-PIPELINE.md §3.4)
 *
 * 按需載入（input.js 只在「拖不動、且指標真的移動過門檻」時才動態載入）：拖曳說不動時的白話說明。
 * 純資料／純函式，不碰 DOM。
 */
const NO_DRIVE = '，或裝上馬達後拖曳試動。', WITH_DRIVE = '。';

/** 拖不動時，對學生說的一句話：說明為什麼，並盡量說明可以怎麼做。drive＝作品有動力來源且試動可用。 */
export function blockedMessage(kind, drive = false) {
  switch (kind) {
    case 'body': return '這個零件已接上其他零件，不能單獨搬移；要移動請先分開連接' + (drive ? '（它也不會隨馬達轉動）。' : NO_DRIVE);
    case 'hole': return '這個孔屬於已接上其他零件的零件，不能單獨搬移；要改位置請改尺寸' + (drive ? '（它也不會隨馬達轉動）。' : NO_DRIVE);
    case 'locked-vertex': return '這個頂點已被相接的零件鎖住，不能單獨拖動；要改位置請改板件尺寸，或移動接在它上面的零件。';
    case 'hosted-motor': return '馬達固定在座板上，不能直接拖；要換孔請用馬達的「安裝設定」。';
    case 'joined-corner': return '這個零件的孔上接著其他零件或固定孔，不能只拖它的角；請改尺寸，或移動接在孔上的零件。';
    case 'shared-fixed': return '這是多桿共用的固定長度接點；請調整桿長或移動機架固定孔。';
    case 'fused-hole': return '合成孔位請改桿段尺寸，或先解除合成。';
    default: return '這個動作現在不能做。';
  }
}

/**
 * 「這一拖是什麼意思？」的判斷順序（把 input.js 散在 startFreeLinkDrag／onNodeDown／moveNodeTo 的旗標檢查寫在一處）。
 * 純函式、無 DOM；input.js 因啟動大小限制不靜態載入它，只在拖不動時用 blockedMessage 說明；
 * test/drag-intent.mjs 以真實的 input.js 行為逐格對照，這個函式是規格。
 *
 *   dragIntent(target, context) -> {kind, reason?}
 *   target.grab  'body'（桿身／板面）｜'end'（桿端、板的頂點）｜'hole'（板上或桿上的局部孔）｜'shaft'（獨立馬達軸心）｜'frame-hole'（機架孔）｜'handle'（尺寸把手）
 *   context      {free 零件是自由件（桿身／孔：isFreeBody；桿端／頂點：freeLinkForPoint／freeTriangleForPoint）, solved 剛體旋轉或約束求解器能解, joinedCorner／sharedFixed 與 input.js 的兩句提示對應, fused 合成零件／合成孔, follows 作品有動力且這一點會隨輸入角動, crank 這是輸入桿的動端,
 *                 groundLocked 固定孔位置未解鎖, lockedVertex 三點桿頂點已被完全決定}
 *   kind         'drive' 試動｜'move-free' 整件平移｜'move-node' 拖接點（含圓規旋轉、剛體旋轉、齒輪公轉等）｜'resize-handle' 改尺寸把手｜'crank' 轉輸入角｜'none' 不動
 *   reason       kind 為 'none' 時，對應 blockedMessage 的 kind；沒有 reason＝另有專屬回饋（機架面板、合成說明已在別處）
 */
export function dragIntent(target, context = {}) {
  const {grab} = target, c = context;
  if (grab === 'handle') return {kind: 'resize-handle'};
  if (grab === 'frame-hole') return {kind: 'none'};                       // 機架孔由機架面板的專用把手處理
  if (grab === 'shaft') return c.free ? {kind: 'move-free'} : {kind: 'none', reason: 'hosted-motor'};
  if (c.fused) return grab === 'body' ? {kind: 'none'} : {kind: 'none', reason: 'fused-hole'};
  if (grab === 'body') {
    if (c.free) return {kind: 'move-free'};
    return c.follows ? {kind: 'drive'} : {kind: 'none', reason: 'body'};
  }
  if (c.groundLocked) return {kind: 'none'};                              // 固定孔：先開機架面板，位置在那裡改
  if (grab === 'hole' && c.free) return {kind: 'move-free'};              // 自由件的局部孔＝抓著孔搬整件
  if (c.crank) return {kind: 'crank'};
  if (c.follows) return {kind: 'drive'};
  if (grab === 'hole') return {kind: 'none', reason: 'hole'};
  if (c.free) return {kind: 'move-free'};                                  // 自由桿／自由三點桿：拖任一點＝整件平移
  if (c.solved) return {kind: 'move-node'};                               // 剛體旋轉（單一固定頂點的三點桿、桿端繞另一端）或約束求解器能解
  if (c.joinedCorner) return {kind: 'none', reason: 'joined-corner'};
  if (c.lockedVertex) return {kind: 'none', reason: 'locked-vertex'};
  if (c.sharedFixed) return {kind: 'none', reason: 'shared-fixed'};
  return {kind: 'move-node'};                                              // 圓規旋轉（固定長度）或直接改座標
}
