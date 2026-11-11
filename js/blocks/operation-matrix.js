/**
 * 零件 × 動作對照表（docs/SDD-OPERATION-PIPELINE.md §3.1，O0 盤點）。純資料：不 import 任何模組、不碰 DOM／state，
 * 也不被啟動路徑載入；只有 test/operation-matrix.mjs 與文件使用。
 *
 * 每格是一組情境 case：
 *   when   前提（學生看得懂的說法：未接／已接其他零件／接固定孔／接馬達／作品已有既存問題…）
 *   expect 依產品規則「應該」發生的事，一句話（每個動作都有回饋；拖曳要符合所選動作；不能無聲無息沒反應）
 *   status 'ok'＝現況已符合；'gap'＝現況不符合（必須有 now）；'n/a'＝這個零件沒有這個動作
 *   now    現況與 expect 不同時，寫現況（gap 必填）
 *   evidence 程式路徑或執行結果（gap 必填；供施工者找位置）
 *   check  驗證這格的測試 id（test/operation-matrix.mjs 的 CHECKS）。ok 的格子必須有 check 或標 unverified
 *   unverified 只讀過程式、沒有可在 Node 重跑的檢查（需要真實瀏覽器互動）；status 只是依程式判讀，未經執行證實
 *   cause  相同根因的 gap 用同一個代號，方便一次修
 * 修好一個 gap：把 status 改 'ok'、刪 now／evidence，check 保留（測試會把「已不再重現」顯示出來）。
 */

export const PARTS = [
  {id: 'bar', label: '桿件'},
  {id: 'plate', label: '板材'},
  {id: 'l', label: 'L型件'},
  {id: 'arms', label: '彎桿／多臂件'},
  {id: 'motor', label: '馬達（獨立）'},
  {id: 'motorBar', label: '馬達＋輸出桿（馬達資料記在桿件上）'},
  {id: 'gear', label: '齒輪'},
  {id: 'slider', label: '滑軌'},
  {id: 'syringe', label: '針筒'},
  {id: 'frameHole', label: '機架孔'}
];

export const ACTIONS = [
  {id: 'select', label: '選取'},
  {id: 'move', label: '移動'},
  {id: 'resize', label: '改尺寸'},
  {id: 'delete', label: '刪除'},
  {id: 'connect', label: '連接'},
  {id: 'release', label: '解除'},
  {id: 'copy', label: '複製／鏡射'}
];

const ok = (when, expect, check, extra = {}) => ({when, expect, status: 'ok', ...(check ? {check} : {unverified: true}), ...extra});
const gap = (when, expect, now, evidence, extra = {}) => ({when, expect, status: 'gap', now, evidence, ...extra});
const na = (when, expect) => ({when, expect, status: 'n/a'});

// 同一根因的代號
const HOLE_TARGET = 'hole-has-no-target';        // 選到孔／接點時只記孔，指令不知道要作用在哪個零件
const SILENT_DRAG = 'silent-drag';                // 拖不動時不說原因
const SILENT_DONE = 'silent-success';             // 做完連帶改變沒有說明

const SPLIT_JOINT = check => ok('桿端與別的零件共用同一個接點',
  '拆開後說明「已把…從這個接點分開」，並與其他動作一樣先檢查會不會製造新問題；可一次復原。', check);

export const MATRIX = {
  bar: {
    select: [
      ok('點桿身', '選到這根桿，顯示它的長度設定。'),
      ok('點到桿上的孔，而那個孔被好幾個零件共用', '畫面標明「你選的是哪個零件的孔」，要改時才問；不能只記下孔。（O3-D：接點面板標題寫出名稱，圖上閃示所屬零件）', 'select-shared-joint')
    ],
    move: [
      ok('未接任何零件（自由桿）', '拖桿身或桿端，整根桿平移，長度不變。', 'move-free-bar'),
      ok('已接其他零件，且作品有動力來源', '拖桿身或桿上的孔＝試動：機構跟著轉，桿長與連接都不改。'),
      ok('已接其他零件，但作品沒有動力來源', '拖不動時說明原因（例如「這根桿接著別的零件，請改尺寸，或接上馬達再試動」）。', 'move-connected-bar-explained'),
      ok('拖已接零件桿上的孔（不是端點）', '說明這個孔不能單獨搬，或提供可行的拖法。', 'move-connected-hole-explained'),
      ok('桿端接在固定孔上', '拖另一端：以固定孔為圓心、桿長不變地轉動。'),
      ok('作品已有既存問題', '拖曳放開時只擋「這次新造成」的問題，不被舊問題擋住。', 'gate-only-new')
    ],
    resize: [
      ok('未接或已接，改孔數（數字）', '桿變長或變短，相接的零件跟著孔移動。', 'resize-bar-ok'),
      ok('縮小會移除已被使用的孔', '拒絕並說明是哪一個孔被用到。', 'resize-plate-lost-hole'),
      ok('改尺寸會讓固定孔位與原本不一致（需要確認）', '照舊詢問；按取消＝作品不變、沒有復原點、只說「已取消，未套用。」；按確定＝套用並一次復原。（O3b：確認在共用流程 runEdit 的 confirm 階段）', 'resize-confirm-cancel'),
      ok('改完相連機構接不起來', '拒絕並說「孔距未修改：長度無法閉合」，作品不變。'),
      ok('作品已有既存問題（馬達離開座板原孔），改的是不相干的桿', '只擋這次新造成的問題；舊問題不擋改尺寸（O3：commitMountingEdit 只在座板核對「新增失敗」時拒絕）。', 'resize-existing-problem-ok')
    ],
    delete: [
      ok('未接、作品沒有既存問題', '桿被刪除。', 'del-bar-free-ok'),
      ok('已接其他零件', '桿被刪除，相鄰零件保留，原本相接的孔留成獨立的點。', 'del-connected-bar-ok'),
      ok('選到的是桿上的孔或共用接點', '刪除所屬的零件；共用接點不猜，請使用者點桿身並在圖上標出候選。', 'del-hole-owner'),
      ok('作品已有既存問題（例如馬達軸離開座板原孔），要刪的桿與馬達無關', '刪除成功，不被舊問題擋住。', 'del-existing-problem-ok'),
      ok('桿被合成', '請先解除合成（有說明）。', 'del-fused-refused')
    ],
    connect: [
      ok('把自由端拖到別的桿端', '接成一個共用接點。', 'connect-free-bars-ok'),
      ok('接起來會破壞桿長或固定孔', '拒絕並說明原因，作品不變。', 'connect-refusal-message'),
      ok('同一零件的兩個孔', '拒絕並說「不能合併同一零件的兩個孔」。', 'connect-same-part-refused'),
      ok('未接的桿端拖到馬達軸', '接成馬達的輸出桿（經過確認與一致性檢查）。', 'connect-motor-output')
    ],
    release: [
      SPLIT_JOINT('release-split-explained'),
      na('未接', '沒有可解除的連接。')
    ],
    copy: [
      ok('未接', '右側出現一份副本，孔距相同。', 'copy-bar'),
      ok('已接其他零件', '只複製桿件本體，副本不與原件相連（對話框已說明）。', 'copy-connected-clean'),
      ok('左右／上下鏡射', '副本鏡射，孔距保留。', 'copy-mirror')
    ]
  },

  plate: {
    select: [
      ok('點板面', '選到這片板，顯示尺寸設定。'),
      ok('點到板上的孔，而那個孔被別的零件共用', '畫面標明所選孔屬於哪一個零件。', 'select-plate-hole-owner'),
      ok('桌機上多個零件重疊在同一處', '點一下零件、同一處有 2 個以上零件重疊時，放開後跳出與手機相同的選單「這裡有多個物件，要選哪一個？」（最上面的零件在最前面），點一列就選到那個零件；取消不改選取。拖曳（移動超過 6 px）不開選單、行為照舊。孔、接點與只有一個零件的地方照舊。（O4：overlap-picker.js 的 collectBodyCandidates）', 'select-overlap-list')
    ],
    move: [
      ok('未接任何零件（自由板）', '拖板上任一點，整片平移，形狀不變。', 'move-free-plate'),
      ok('已接其他零件或固定孔，但沒有動力來源', '說明為什麼不能拖。', 'move-connected-plate-explained'),
      ok('三點桿的某個頂點已被機構完全決定', '說明「這個頂點被其他零件鎖住」。', 'move-locked-vertex-explained'),
      ok('手指或滑鼠落在固定板沒用到的格孔上，而底下（同一處）有會動的零件', '抓的是底下那個零件：自由件整件平移、有動力就試動；只點一下照舊選取該孔。（O3b：手機與桌機相同）', 'move-over-idle-hole')
    ],
    resize: [
      ok('改長／寬孔數，未被使用的孔', '板變大或變小，孔格重新排列。', 'resize-plate-grow'),
      ok('縮小會移除已被使用的孔（接了零件或固定）', '拒絕並說明是第幾孔，請先解除該孔的連接。', 'resize-plate-lost-hole')
    ],
    delete: [
      ok('未接、板上沒裝東西', '板材被刪除，其他零件不受影響。', 'del-plate-plain'),
      ok('板上裝著馬達、針筒或有零件接在孔上', '刪除後說明「馬達改成獨立固定點」「接孔已放開」。', 'del-plate-explains-detach'),
      ok('盒體的配對板件', '請整組管理（有說明）。', 'del-boxpanel-refused'),
      ok('選到的是板上的孔', '刪除所屬的板，或明說不能刪。', 'del-hole-owner')
    ],
    connect: [
      ok('板孔與其他零件的點接合', '經過候選預覽、桿長與固定孔檢查後接合，拒絕時說明原因。', 'connect-refusal-message')
    ],
    release: [
      SPLIT_JOINT('release-split-explained'),
      na('未接', '沒有可解除的連接。')
    ],
    copy: [
      ok('板材（可含已接零件）', '複製板件本體，不帶馬達、針筒、固定狀態。', 'copy-plate')
    ]
  },

  l: {
    select: [ok('點 L 型件', '選到這片 L 型件。')],
    move: [
      ok('未接', '整片平移，形狀不變。', 'move-free-l'),
      ok('已接其他零件或固定孔，沒有動力來源', '說明為什麼不能拖。', 'move-connected-l-explained')
    ],
    resize: [ok('改長、高或臂寬孔數', 'L 型件改變，被使用的孔受保護。', 'resize-l-ok')],
    delete: [ok('未接', 'L 型件被刪除。', 'del-l-ok')],
    connect: [ok('孔與其他零件接合', '同板材。', 'connect-refusal-message')],
    release: [SPLIT_JOINT('release-split-explained')],
    copy: [ok('L 型件', '複製或鏡射本體。', 'copy-l')]
  },

  arms: {
    select: [ok('點彎桿／多臂件', '選到這個零件，顯示臂數與角度設定。')],
    move: [
      ok('未接', '整片平移；臂端另有把手。'),
      ok('已接其他零件，沒有動力來源', '說明為什麼不能拖。', 'move-connected-arms-explained')
    ],
    resize: [ok('改臂長、臂數或角度', '臂改變，被使用的孔受保護；拖曳把手以 1 mm 取整，精確值用欄位。')],
    delete: [ok('已接其他零件', '零件被刪除，相鄰零件保留。', 'del-arms-ok')],
    connect: [ok('臂上的孔與其他零件接合', '同板材。')],
    release: [SPLIT_JOINT('release-split-explained')],
    copy: [ok('彎桿／多臂件', '複製或鏡射。', 'copy-arms-mirror')]
  },

  motor: {
    select: [ok('點馬達軸心', '選到這顆馬達，顯示角度與安裝設定。')],
    move: [
      ok('未裝在任何零件上', '整顆馬達平移，靠近孔時吸附軸心。', 'move-free-motor'),
      ok('已裝在座板上', '說明「馬達固定在座板第 N 孔，請用安裝設定換孔」，或提供換孔的拖法。', 'move-hosted-motor-explained')
    ],
    resize: [na('馬達型號固定', '馬達沒有可調尺寸。')],
    delete: [ok('獨立馬達', '馬達被刪除；裝在板上的孔位釋出。', 'del-motor-independent')],
    connect: [
      ok('未接的桿端拖到馬達軸', '接成這顆馬達的輸出桿。', 'connect-motor-output'),
      ok('桿已接著別的零件', '拒絕並說「這支桿件已有其他連接，請先解除」。', 'connect-motor-refuse-message')
    ],
    release: [ok('裝在座板上', '用安裝設定改成「自動機架」即可離開座板。')],
    copy: [na('目前不提供', '需要第二顆馬達請另外新增。')]
  },

  motorBar: {
    select: [ok('點輸出桿', '選到輸出桿，顯示馬達與桿長設定。')],
    move: [
      ok('拖輸出桿的動端', '改變馬達角度（試動），桿長與連接不變。'),
      ok('馬達軸心離開座板原孔（既存問題）', '圖上提示並提供「放回原孔」「讓馬達離開座板」。', 'offplate-detected')
    ],
    resize: [ok('改輸出桿長度', '軸心不動，另一端移動。', 'resize-motorbar-shaft-stays')],
    delete: [
      ok('刪除輸出桿', '馬達仍留在座板上，成為沒有輸出的獨立馬達；桿被刪除。', 'del-motorbar-keeps-motor')
    ],
    connect: [ok('桿已接著別的零件，再拖到馬達軸', '拒絕並說明。', 'connect-motor-refuse-message')],
    release: [ok('輸出桿接在馬達軸上', '馬達與桿都保留，說明「已解除…可再接回」，可復原。', 'release-motor-ok')],
    copy: [ok('複製輸出桿', '只複製桿件本體，不帶馬達（對話框已說明）。', 'copy-motorbar-plain')]
  },

  gear: {
    select: [ok('點齒輪', '選到齒輪，顯示齒數與模數。')],
    move: [ok('拖齒輪中心', '連同銷一起移動；已有接地夥伴時繞夥伴公轉，整對齒輪可一起平移。')],
    resize: [ok('改齒數或模數', '整條嚙合鏈的模數同步，中心距保持嚙合。', 'gear-resize-keeps-mesh')],
    delete: [
      ok('齒輪與另一個齒輪／齒條嚙合', '只刪選到的一個：被它帶動的齒輪留在原位並放開嚙合，掛在它上面的齒條無法獨立存在所以一起刪；兩者都說出來，可一次復原。（O4：planDeleteGear）', 'del-gear-only')
    ],
    connect: [ok('加入齒輪對、齒輪與齒條', '以嚙合關係連接，中心距自動對齊。', 'gear-add-pair-tangent')],
    release: [
      ok('兩個齒輪嚙合中', '「分開咬合」讓兩個齒輪各自獨立、留在原位，說出是哪兩個齒輪，可一次復原。（O4：planReleaseMesh，調整選單與齒輪面板都有按鈕）', 'release-gear-mesh')
    ],
    copy: [na('目前不提供', '齒輪用「加入齒輪對」新增。')]
  },

  slider: {
    select: [ok('點滑軌', '選到滑軌，顯示行程設定。')],
    move: [ok('拖滑塊', '沿軌道移動；拖軌道端點改變位置。')],
    resize: [ok('改行程、本體長、軌道偏移', '數字與把手同一個結果。')],
    delete: [ok('滑軌連著桿', '滑軌被刪除，桿保留。', 'del-slider-ok')],
    connect: [ok('把桿轉成滑軌／接到軌道', '接成滑塊，經過檢查。')],
    release: [ok('桿接在滑軌上', '提供解除並說明結果。', 'release-slider-split')],
    copy: [na('目前不提供', '滑軌用「新增滑軌」。')]
  },

  syringe: {
    select: [ok('點針筒', '開啟針筒設定面板。')],
    move: [ok('拖針筒的把手', '把手以 1 mm 取整，放開才提交，精確位置用欄位。')],
    resize: [ok('改行程、筒長', '針筒面板欄位與把手同一個結果。')],
    delete: [
      ok('在針筒面板按「刪除針筒」', '針筒被刪除，經過一致性檢查、可復原。'),
      ok('選到針筒後按 Delete', '針筒被刪除，或說明請用面板的刪除鍵。', 'del-syringe-key-explained')
    ],
    connect: [ok('在圖上選孔接推桿', '接好後可模擬，接不上時說明。')],
    release: [ok('解除推桿連接', '先預覽，確認後解除；固定環與其他桿保留。', 'release-syringe-ok')],
    copy: [na('目前不提供', '重複使用請另外新增針筒。')]
  },

  frameHole: {
    select: [ok('點機架孔', '選到孔並開啟機架孔設定。')],
    move: [ok('沿基準線拖機架孔', '拖曳以 1 mm 取整，欄位可輸入精確距離；兩者同一個結果。')],
    resize: [na('孔沒有尺寸', '距離基準孔屬於「移動」。')],
    delete: [
      ok('選到固定孔後按 Delete', '刪除該孔；孔上接著別的零件時說明並標出是哪些。', 'del-anchor-explained'),
      ok('在機架孔面板按「刪除孔」', '孔被刪除；孔上接著桿時拒絕並說明。')
    ],
    connect: [ok('桿端拖到機架孔', '接成固定的樞軸。', 'connect-refusal-message')],
    release: [SPLIT_JOINT('release-split-explained')],
    copy: [na('目前不提供', '機架孔用「新增固定孔」。')]
  }
};

/** 攤平成 [{part, action, index, ...case}]，供測試與文件使用。 */
export function listCases() {
  const out = [];
  for (const p of PARTS) for (const a of ACTIONS) (MATRIX[p.id]?.[a.id] || []).forEach((c, index) => out.push({part: p.id, action: a.id, index, ...c}));
  return out;
}
