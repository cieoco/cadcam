import { tippingBucketSnapshot } from './tipping-bucket-example.js';
import { assemblyLessonSnapshot } from './assembly-lesson-example.js?v=parallel';
/**
 * blocks / examples
 *
 * 課堂範例一律使用 blocks snapshot。載入後和學生自己畫出的作品完全相同，
 * 可以繼續拖曳、改長度、存檔與分享。
 */

const bar = (id, p1, p2, len, extra = {}) => ({
  type: 'bar',
  id,
  color: extra.color || '#3498db',
  p1,
  p2,
  lenParam: `LL${id.replace(/\D/g, '') || id}`,
  fixedLen: true,
  isInput: false,
  ...extra
});

const exactBar = (id, p1, p2, len, extra = {}) => bar(id, p1, p2, len, { snapLength: false, ...extra });

const triangle = (id, p1, p2, p3, extra = {}) => ({
  type: 'triangle',
  id,
  color: extra.color || '#e74c3c',
  p1,
  p2,
  p3,
  gParam: `TG${id.replace(/\D/g, '') || id}`,
  r1Param: `TR1_${id}`,
  r2Param: `TR2_${id}`,
  sign: extra.sign || 1,
  ...extra
});

const pt = (id, type, x, y, extra = {}) => ({ id, type, x, y, ...extra });

export const EXAMPLE_GROUPS = [
  { id: 'starter', label: '入門：先讓它動' },
  { id: 'transmission', label: '傳動：速度與力矩' },
  { id: 'manipulator', label: '實戰：夾取與物件操作' },
  { id: 'lift-motion', label: '實戰：升降與直線運動' },
  { id: 'mobility', label: '實戰：底盤與行走' },
  { id: 'challenge', label: '挑戰：自己改造' }
];

const EXAMPLE_LESSONS = {
  'fourbar-crank-rocker': {
    group: 'starter',
    level: '基礎',
    use: '把馬達連續旋轉轉成搖臂擺動，可用在撥桿、閘門、簡單推送。',
    learn: '觀察固定點、曲柄、連桿、搖桿如何形成一個可連續運轉的閉環。',
    try: ['把右側搖桿加長或縮短', '移動兩個機架點，看擺角如何改變', '把搖桿末端設為工作點量行程'],
    predict: '播放前先猜：紅色曲柄轉一整圈時，右側搖桿會不會也轉一整圈？',
    measure: '播放一圈，記下右側搖桿從最左到最右大約擺過多少角度；再把右側搖桿加長後重看。',
    explain: '比較兩次擺動，說明哪個尺寸改變了搖桿的活動範圍。'
  },
  'fourbar-double-crank': {
    group: 'starter',
    level: '基礎',
    use: '讓兩側曲柄都能連續旋轉，常見於需要兩軸持續轉動的連桿傳動。',
    learn: '機架是最短桿，且最短桿加最長桿小於另外兩桿長度總和時，兩側相鄰桿都能整圈轉動。',
    try: ['觀察紅色輸入曲柄與右側輸出桿是否都整圈轉動', '加長機架並重播', '逐步調整連桿長度，觀察運動型態何時改變'],
    predict: '先猜：紅色輸入曲柄整圈轉動時，右側藍色輸出桿能不能也整圈轉？',
    measure: '播放一整圈，觀察兩根接在機架上的桿是否各自轉過 360°；再加長機架重看。',
    explain: '比較四根桿的長短，指出最短桿和最長桿，說明尺寸組合如何讓兩側都能整圈轉動。'
  },
  'fourbar-double-rocker': {
    group: 'starter',
    level: '基礎',
    use: '讓輸入桿和輸出桿都來回擺動，可用在撥動、擺門或往復推送。',
    learn: '這組非 Grashof 尺寸在目前組裝姿態下，輸入桿與輸出桿都只能來回擺動，不能整圈旋轉。',
    try: ['觀察輸入與輸出桿的擺動範圍', '改變機架長度後重播', '把輸出桿末端設為工作點觀察路徑'],
    predict: '先猜：紅色輸入桿和右側藍色輸出桿，哪一根能整圈旋轉？',
    measure: '播放並觀察兩根桿的往返端點；記下哪一根會改變方向、開始反向擺回。',
    explain: '比較四根桿的長短，說明這組尺寸為什麼讓輸入與輸出都呈現來回擺動。'
  },
  'tipping-bucket': { group: 'manipulator', level: '基礎', use: '四片可輸出板件、角碼與單側MG995組立。', learn: '以水平參考與正負角觀察開口方向。', try: ['只改傾倒角再回位'], predict: '負角會讓開口轉向哪裡？', measure: '比較0°與−100°的開口方向。', explain: '姿態達標不等於物件能倒出。' },
  'parallel-fourbar': {
    group: 'starter',
    level: '基礎',
    use: '讓平台或夾爪在升降時保持姿態，常見於簡易托盤與平行夾具。',
    learn: 'A、B 是固定點；活動臂 AC、BD 等長，CD 與固定點間距 AB 等長。在平行四邊形組態中，右側輸出桿 CD 保持與機架 AB 平行。',
    try: ['改變兩根短桿長度', '把垂直輸出桿加高', '在輸出桿上加工作點觀察姿態'],
    predict: '播放前先猜：升降時，右側綠色輸出桿會保持直立，還是會跟著傾斜？',
    measure: '播放並觀察綠色輸出桿；再把其中一根短桿改長，看看它的傾斜有沒有改變。',
    explain: '指出哪兩組桿件的長度相等，說明它們如何幫助平台保持姿態。'
  },
  'chebyshev-linkage': {
    group: 'lift-motion',
    level: '進階',
    use: '用旋轉馬達產生近似直線軌跡，可做低成本推送或支撐腳路徑。',
    learn: '觀察連桿末端走出的近似直線，並找出它偏離直線的地方。',
    try: ['改曲柄長度', '改追蹤點位置', '觀察工作範圍卡上的水平與垂直行程'],
    predict: '先猜足端軌跡會是筆直的，還是帶有彎曲。',
    measure: '播放一圈並顯示工作點軌跡，記下最明顯的彎曲方向；移動追蹤點後再比較。',
    explain: '說明這組連桿只能做出近似直線，並指出你從軌跡哪一段看出差異。'
  },
  'slider-crank': {
    group: 'lift-motion',
    level: '基礎',
    use: '把馬達旋轉轉成往復直線，可用在推球、頂升、活塞式送料。',
    learn: '理解曲柄半徑如何決定滑塊行程。',
    try: ['調整曲柄長度', '調整滑軌行程起點與終點', '把滑軌改成斜向，觀察輸出方向'],
    predict: '先猜：把紅色曲柄半徑加長，滑塊來回的距離會變大還是變小？',
    measure: '記下滑塊原本的行程，再把曲柄半徑加倍並重新播放，讀取新的行程。',
    explain: '比較曲柄半徑和滑塊行程；在連桿長度足以讓機構完整轉動時，說明兩者的關係。'
  },
  pantograph: {
    group: 'manipulator',
    level: '進階',
    use: '把小範圍操作放大成大範圍末端運動，可用在描圖、定位、遠端夾取。',
    learn: '理解平行四邊形約束和比例放大。',
    try: ['拖曳末端 R', '改中間長桿長度', '比較 P 和 R 的軌跡比例'],
    predict: '先猜：把末端 R 往外移，R 畫出的路徑會比 P 大多少？',
    measure: '顯示 P 和 R 的軌跡，比較兩條路徑的長短；再移動 R 後重看。',
    explain: '描述四連桿如何讓末端一起移動，並用兩條軌跡說明放大效果。'
  },
  'quick-return': {
    group: 'lift-motion',
    level: '進階',
    use: '需要一邊慢推、一邊快速回程的機構，例如撥料、推送、回位。',
    learn: '觀察偏置滑軌如何讓前進與回程花費不同角度。',
    try: ['改滑軌高度', '改連桿長度', '看快回比例如何變化'],
    predict: '先猜：滑塊前進和回程，哪一段會花較多曲柄轉角？',
    measure: '播放一圈，觀察前進與回程各占大約多少轉動角度；改變滑軌高度後再比較。',
    explain: '指出滑軌偏離曲柄中心的效果，並說明為什麼兩個方向不會花相同角度。'
  },
  'gear-pair': {
    group: 'transmission',
    level: '基礎',
    use: '改變轉速、方向與扭力，是競賽機器人最常用的傳動基礎。',
    learn: '外嚙合齒輪轉向相反；理想、無損耗且輸入條件相同時，大齒輪轉得較慢，輸出扭力較大。這個動畫呈現轉速關係，不模擬實際負載與摩擦。',
    try: ['改齒數', '改輸出孔距', '把從動輪輸出孔接到連桿'],
    predict: '先猜：紅色小齒輪轉一圈，藍色大齒輪會轉幾圈？方向相同還是相反？',
    measure: '播放並比較兩輪轉向與轉圈數；改變藍色齒輪齒數後再比較。',
    explain: '用兩輪齒數的大小關係說明轉速差異；扭力較大的說法只適用於理想、無損耗的傳動。'
  },
  'reduction-gear-train': {
    group: 'transmission',
    level: '基礎',
    use: '用小齒輪帶大齒輪取得較慢但更有力的輸出。',
    learn: '把多段齒比連乘，得到總減速比。',
    try: ['改末輪齒數', '移除中間齒輪比較方向', '把末輪輸出孔拿去推連桿'],
    predict: '先猜：中間齒輪改大，最後一輪的轉速比會改變嗎？',
    measure: '逐輪數一數轉向與圈數，再改末輪齒數重播比較。',
    explain: '說明中間齒輪會改變傳遞路徑與方向，但總減速比由首輪和末輪的齒數決定。'
  },
  'rack-pinion': {
    group: 'lift-motion',
    level: '基礎',
    use: '把旋轉直接轉成可控直線位移，可用於升降滑台、伸縮臂、推送器。',
    learn: '齒條位移等於小齒輪節圓半徑乘上轉角（轉角以弧度表示）；節圓是齒輪與齒條等效滾動時接觸的圓。',
    try: ['改小齒輪半徑', '改齒條長度', '把齒條當成升降機構輸出'],
    predict: '小齒輪轉同樣的角度時，節圓半徑變大，齒條移動距離會怎麼變？',
    measure: '播放相同角度，記下齒條位移；改變小齒輪半徑後再記一次。',
    explain: '用「節圓半徑 × 轉角（弧度）」說明兩次位移的差異。'
  },
  'gear-gripper': {
    group: 'manipulator',
    level: '實戰',
    use: '兩側同步開合的夾爪，可用於夾方塊、圓柱、球類或遊戲道具。',
    learn: '物件寬度與單側餘量影響所需開口；兩側齒輪同步帶動旋轉夾爪。',
    try: ['先試物件 50 mm／單側餘量 10 mm', '只改物件為 80 mm，比較開合角', '試 150 mm／40 mm，讀取不可達原因再縮小'],
    predict: '先猜：紅色齒輪轉動時，兩側夾爪會一起張開、一起閉合，還是不同步？',
    measure: '比較 50／10 與 80／10 的張開、閉合角；淨距達標不表示已接觸或夾住物件。',
    explain: '說明兩側齒輪如何同步帶動夾爪，並指出開口變化是否符合預測。'
  },
  'cam-follower': {
    group: 'lift-motion',
    level: '進階',
    use: '做週期性升降或敲擊，例如撥片、震動送料、間歇推送。',
    learn: '凸輪輪廓決定從動件高度，而不是只有桿長決定運動。',
    try: ['改升程高度', '改凸輪基圓半徑', '觀察從動件軌跡'],
    predict: '先猜：凸輪轉一圈時，從動件會停在同一高度，還是上下移動？',
    measure: '播放一圈，觀察從動件最高與最低位置；增加升程後再比較高度差。',
    explain: '指出凸輪外形如何推動從動件，並用最高與最低位置說明升程。'
  },
  'pulley-belt': {
    group: 'transmission',
    level: '基礎',
    use: '跨距較遠的同向傳動，適合把馬達移到容易固定的位置。',
    learn: '皮帶輪半徑比決定速度比，開口皮帶讓兩輪同向。',
    try: ['改兩輪半徑', '拉遠中心距', '比較齒輪傳動和皮帶傳動差異'],
    predict: '開口皮帶帶動時，兩輪轉向相同；如果從動輪半徑變大，它轉得會比較快還是比較慢？',
    measure: '播放並比較兩輪轉向與圈數；改變從動輪半徑後再比較。',
    explain: '用半徑比說明理想無滑動條件下的速度差異，並說明開口皮帶為何讓兩輪同向。'
  },
  'jansen-leg': {
    group: 'mobility',
    level: '實戰',
    use: '步行底盤範例，適合探索非輪式移動與足端軌跡。',
    learn: '多連桿可以把單一馬達轉成複雜步態。',
    try: ['改曲柄長度 m', '觀察足端 P5 軌跡', '嘗試左右複製成雙腿底盤'],
    predict: '先猜：足端 P5 一整圈後會回到原點嗎？路徑大致像什麼形狀？',
    measure: '播放一整圈並觀察 P5 軌跡；改曲柄長度後比較步幅與抬腳高度。',
    explain: '指出哪些連桿共同形成一步，並用足端軌跡解釋它如何交替前進與抬起。'
  },
  'competition-fourbar-lift': {
    group: 'lift-motion',
    level: '實戰',
    use: '競賽常用升降臂：M1 把前端工具抬高（平行四連桿保持姿態），M2 像手腕一樣調整工具架角度。',
    learn: 'M1 帶動平行四連桿升降，M2 改變工具架角度；操作時另一顆馬達暫停在原角度。',
    try: ['切換 M1 / M2 感受兩軸分工', '調整上下兩根短臂長度', '把前端接點設為工作點量升降高度'],
    predict: '先猜：只操作 M1 時，工具架高度和朝向會怎麼變？只操作 M2 又會怎麼變？',
    measure: '分別切換 M1、M2，觀察工具架的高度和角度；記下每顆馬達主要改變的量。',
    explain: '用升降連桿和手腕軸說明兩顆馬達的分工，以及為什麼一次切換一顆較容易觀察。'
  },
  'competition-roller-intake': {
    group: 'manipulator',
    level: '實戰',
    use: '參考競賽機器人的收放式進料臂：伺服曲柄推拉連桿，使彎折臂繞固定軸掃過地面收料。',
    learn: '機架直接用結構板（三點桿）組成：伺服與擺臂樞軸鎖在同一塊板上、穿板槽自動開在板身；曲柄—連桿—搖臂把伺服擺角轉成取物端的掃掠。',
    try: ['改曲柄或連桿長度，觀察擺動範圍，以及連桿接近排成一直線時的狀態', '調整彎折臂桿段長度（彎角會自動保持）', '移動黃色物件位置，確認取物端的掃入範圍'],
    predict: '先猜：取物端會掃過黃色物件所在的位置嗎？',
    measure: '播放伺服擺動，觀察取物端軌跡；移動黃色物件並比較是否落在掃掠範圍內。',
    explain: '說明曲柄、連桿和擺臂如何把馬達擺動傳到取物端。動畫不會計算物件碰撞或抓取。'
  },
  'competition-rack-lift': {
    group: 'lift-motion',
    level: '實戰',
    use: '齒條升降滑台：適合直上直下推高物件、調整夾爪高度或做伸縮臂。',
    learn: '小齒輪在左側時，齒條的齒面朝向小齒輪；上下移動齒條可帶動滑台升降。',
    try: ['改小齒輪半徑', '改齒條長度', '把齒條方向改成水平，做成伸縮臂'],
    predict: '先猜：小齒輪順時針轉動時，垂直齒條會向上還是向下？',
    measure: '播放並觀察齒條移動方向；改成水平配置後，再看它如何伸縮。',
    explain: '指出小齒輪與齒條的接觸位置，說明旋轉如何變成直線移動。'
  },
  'empty-challenge': {
    group: 'challenge',
    level: '挑戰',
    use: '從任務需求出發，自行組合機架、連桿、滑軌、齒輪與動力。',
    learn: '把已學過的單元整合成自己的競賽機構。',
    try: ['先做一個可連續運轉的閉環', '設定工作點量行程', '存檔後和同學交換修改'],
    predict: '先寫下你的機構要把哪種輸入變成哪種輸出。',
    measure: '播放機構並觀察工作點；記錄它走過的方向、距離或擺動範圍。',
    explain: '用零件和量測結果說明機構如何完成任務，再和同學交換作品試改一個尺寸。'
  }
};

// 三孔雨刷臂：B 為中間固定孔，D 為下端驅動孔，E 為上端雨刷孔。
// B、D、E 是同一剛體；沿用三點桿與現有作品格式。
const wiperExample = practice => ({
  id: practice ? 'wiper-missing-coupler' : 'wiper-single',
  title: practice ? '單支雨刷：補接浮桿' : '單支雨刷：完整範例',
  note: '黃色三孔桿繞中間 B 孔擺動；下端 D 接浮桿，上端 E 是雨刷端。',
  snapshot: {
    kind: 'blocks', v: 1, counter: 6,
    comps: [
      { type: 'anchor', id: 'Anchor1', p1: pt('A', 'fixed', -80, 0) },
      { type: 'anchor', id: 'Anchor2', p1: pt('B', 'fixed', 20, 0) },
      bar('Link1', pt('A', 'fixed', -80, 0, { physicalMotor: '1' }), pt('C', 'floating', -48, 0), 32,
        { color: '#e74c3c', isInput: true, physicalMotor: '1', phaseOffset: 0 }),
      ...(!practice ? [bar('Link2', pt('C', 'floating', -48, 0), pt('D', 'floating', 18.470588235294116, -79.98537928680453, { solveSign: -1 }), 104)] : []),
      triangle('WiperArm', pt('B', 'fixed', 20, 0),
        pt('D', 'floating', 18.470588235294116, -79.98537928680453, { solveSign: -1 }),
        pt('E', 'floating', 22.294117647058826, 119.9780689302068),
        { color: '#c5a52b', shapeMode: 'polyline', gParam: 'WB', r1Param: 'WE', r2Param: 'WDE',
          vertices: [{ solve: true, ref: 'p2' }, { solve: true, ref: 'p1' }, { solve: true, ref: 'p3' }] })
    ],
    params: { LL1: 32, ...(!practice ? { LL2: 104 } : {}), WB: 80, WE: 120, WDE: 200 }
  }
});

const ALL_BLOCK_EXAMPLES = [
  wiperExample(false),
  wiperExample(true),
  {
    id: 'fourbar-crank-rocker',
    title: '四連桿：曲柄搖桿',
    note: '紅色馬達整圈轉，右邊搖桿來回擺。適合第一個驗證任務。',
    snapshot: {
      kind: 'blocks',
      v: 1,
      counter: 6,
      comps: [
        { type: 'anchor', id: 'Anchor1', p1: pt('A', 'fixed', -80, 0) },
        { type: 'anchor', id: 'Anchor2', p1: pt('B', 'fixed', 20, 0) },
        bar('Link1', pt('A', 'fixed', -80, 0, { physicalMotor: '1' }), pt('C', 'floating', -50, 0), 30, {
          color: '#e74c3c',
          isInput: true,
          physicalMotor: '1',
          phaseOffset: 0
        }),
        bar('Link2', pt('C', 'floating', -50, 0), pt('D', 'floating', 10.7, 79.5), 100),
        bar('Link3', pt('B', 'fixed', 20, 0), pt('D', 'floating', 10.7, 79.5), 80)
      ],
      params: { LL1: 30, LL2: 100, LL3: 80 }
    }
  },
  {
    id: 'fourbar-missing-coupler',
    title: '四連桿：練習範例（補接浮桿）',
    note: '先暫停，用連桿連接兩個活動端，再播放觀察。',
    snapshot: {
      kind: 'blocks', v: 1, counter: 6,
      comps: [
        { type: 'anchor', id: 'Anchor1', p1: pt('A', 'fixed', -80, 0) },
        { type: 'anchor', id: 'Anchor2', p1: pt('B', 'fixed', 20, 0) },
        bar('Link1', pt('A', 'fixed', -80, 0, { physicalMotor: '1' }), pt('C', 'floating', -48, 0), 32, {
          color: '#e74c3c', isInput: true, physicalMotor: '1', phaseOffset: 0
        }),
        // 與完整範例正規化後的姿勢一致：C–D = 104 mm，B–D = 80 mm。
        bar('Link3', pt('B', 'fixed', 20, 0), pt('D', 'floating', 18.470588235294116, 79.98537928680453), 80)
      ],
      params: { LL1: 32, LL3: 80 }
    }
  },
  {
    id: 'fourbar-double-crank',
    title: '四連桿：雙曲柄',
    note: '最短的機架帶動兩側曲柄都整圈旋轉；可觀察輸入和輸出如何同時連續轉動。',
    // University of Almería 教材比例 ground/input/coupler/output = 5/7/8/9，乘以 16 mm。
    // https://ingmec.ual.es/tmm/L01_03a_four_bars.html
    snapshot: {
      kind: 'blocks',
      v: 1,
      counter: 6,
      comps: [
        { type: 'anchor', id: 'Anchor1', p1: pt('A', 'fixed', 0, 0) },
        { type: 'anchor', id: 'Anchor2', p1: pt('B', 'fixed', 80, 0) },
        exactBar('Link1', pt('A', 'fixed', 0, 0, { physicalMotor: '1' }), pt('C', 'floating', 79.195959, 79.195959), 112, {
          lenParam: 'LL1', color: '#e74c3c', isInput: true, physicalMotor: '1', phaseOffset: 45
        }),
        exactBar('Link2', pt('C', 'floating', 79.195959, 79.195959), pt('D', 'floating', 206.736888, 68.364912), 128, { lenParam: 'LL2' }),
        exactBar('Link3', pt('B', 'fixed', 80, 0), pt('D', 'floating', 206.736888, 68.364912), 144, { lenParam: 'LL3' })
      ],
      params: { LL1: 112, LL2: 128, LL3: 144, theta: 0 }
    }
  },
  {
    id: 'fourbar-double-rocker',
    title: '四連桿：雙搖桿',
    note: '這組非 Grashof 尺寸讓輸入桿和輸出桿都來回擺動，適合和曲柄搖桿及雙曲柄比較。',
    snapshot: {
      kind: 'blocks',
      v: 1,
      counter: 6,
      comps: [
        { type: 'anchor', id: 'Anchor1', p1: pt('A', 'fixed', 0, 0) },
        { type: 'anchor', id: 'Anchor2', p1: pt('B', 'fixed', 100, 0) },
        exactBar('Link1', pt('A', 'fixed', 0, 0, { physicalMotor: '1' }), pt('C', 'floating', 32, 55.4256), 64, {
          lenParam: 'LL1', color: '#e74c3c', isInput: true, physicalMotor: '1', phaseOffset: 60
        }),
        exactBar('Link2', pt('C', 'floating', 32, 55.4256), pt('D', 'floating', 28.3981, 7.561), 48, { lenParam: 'LL2' }),
        exactBar('Link3', pt('B', 'fixed', 100, 0), pt('D', 'floating', 28.3981, 7.561), 72, { lenParam: 'LL3' })
      ],
      params: { LL1: 64, LL2: 48, LL3: 72, theta: 0 }
    }
  },
  {
    id: 'tipping-bucket', title: '單軸翻斗', note: '四板料斗與單側 MG995 支架；開前上，模型負角順時針。底板外伸翼供角碼固定；單側支承、圓角非密封。',
    snapshot: tippingBucketSnapshot
  },
  {
    id: 'parallel-fourbar',
    title: '四連桿：平行保持',
    note: '上下兩根長桿等長，觀察輸出桿如何保持姿態。',
    snapshot: {
      kind: 'blocks',
      v: 1,
      counter: 6,
      comps: [
        { type: 'anchor', id: 'Anchor1', p1: pt('A', 'fixed', -110, 0) },
        { type: 'anchor', id: 'Anchor2', p1: pt('B', 'fixed', -110, 72) },
        bar('Link1', pt('A', 'fixed', -110, 0, { physicalMotor: '1' }), pt('C', 'floating', -62, 0), 48, {
          color: '#e74c3c',
          isInput: true,
          physicalMotor: '1',
          phaseOffset: 0
        }),
        bar('Link2', pt('B', 'fixed', -110, 72), pt('D', 'floating', -62, 72), 48),
        bar('Link3', pt('C', 'floating', -62, 0), pt('D', 'floating', -62, 72), 72)
      ],
      params: { LL1: 48, LL2: 48, LL3: 72, parallelWorkflow: 1, parallelStartHeight: 10, parallelEndHeight: 35 }
    }
  },
  {
    id: 'chebyshev-linkage',
    title: '切比雪夫連桿：近似直線',
    note: '固定桿:曲柄:連桿:搖桿 = 2:1:2.5:2.5，觀察下方接點的近似直線軌跡。',
    snapshot: {
      kind: 'blocks',
      v: 1,
      counter: 6,
      tracePoint: 'P',
      comps: [
        { type: 'anchor', id: 'Anchor1', p1: pt('A', 'fixed', -32, 80) },
        { type: 'anchor', id: 'Anchor2', p1: pt('D', 'fixed', 32, 80) },
        bar('Link1', pt('A', 'fixed', -32, 80, { physicalMotor: '1' }), pt('B', 'floating', -9.373, 57.373), 32, {
          color: '#3498db',
          isInput: true,
          physicalMotor: '1',
          phaseOffset: -45
        }),
        bar('Link2', pt('B', 'floating', -9.373, 57.373), pt('C', 'floating', 47.996, 1.616), 80, { color: '#e74c3c' }),
        bar('Link3', pt('D', 'fixed', 32, 80), pt('C', 'floating', 47.996, 1.616), 80, { color: '#e74c3c' }),
        triangle('Tri1', pt('B', 'floating', -9.373, 57.373), pt('C', 'floating', 47.996, 1.616), pt('P', 'floating', 88, -37), { color: '#e74c3c' })
      ],
      // 接地桿（A-D）由自動生成的機架地基表現，不再另放一根顯式桿。
      params: { LL1: 32, LL2: 80, LL3: 80, TG1: 80, TR1_Tri1: 136, TR2_Tri1: 56 }
    }
  },
  {
    id: 'slider-crank',
    title: '滑塊曲柄：往復運動',
    note: '紅色馬達整圈轉，透過連桿推動綠色滑塊在🟩滑軌上往復滑動（活塞原理）。',
    snapshot: {
      kind: 'blocks',
      v: 1,
      counter: 6,
      comps: [
        { type: 'anchor', id: 'Anchor1', p1: pt('O', 'fixed', 0, 0) },
        { type: 'anchor', id: 'Anchor2', p1: pt('M1', 'fixed', 40, 0) },
        { type: 'anchor', id: 'Anchor3', p1: pt('M2', 'fixed', 152, 0) },
        bar('Link1', pt('O', 'fixed', 0, 0, { physicalMotor: '1' }), pt('A', 'floating', 30, 0), 30, {
          color: '#e74c3c',
          isInput: true,
          physicalMotor: '1',
          phaseOffset: 0
        }),
        {
          type: 'slider', id: 'Slider1', color: '#16a085', sign: 1, lenParam: 'SL1',
          m1: pt('M1', 'fixed', 40, 0), m2: pt('M2', 'fixed', 152, 0),
          p1: pt('Sa', 'fixed', 45, 0), p2: pt('Sb', 'fixed', 140, 0), p3: pt('P3', 'floating', 120, 0),
          carrierLen: 112, railOffset: 5, carriageLen: 24, travelStart: 0, travelEnd: 95
        },
        bar('Link2', pt('A', 'floating', 30, 0), pt('P3', 'floating', 120, 0), 90)
      ],
      // 兩固定滑軌座 M1-M2 的機架由自動地基表現，不再另放一根顯式接地桿。
      params: { LL1: 30, LL2: 90, SL1: 95 }
    }
  },
  {
    id: 'pantograph',
    title: '縮放儀：2 倍放大',
    note: '左下 O 固定，拖曳右端 R 操作縮放儀；中點 P 與右端 R 會留下不同色軌跡，R 永遠是 B→P 方向的 2 倍輸出。',
    snapshot: {
      kind: 'blocks',
      v: 1,
      counter: 12,
      tracePoints: ['P', 'R'],
      comps: [
        { type: 'anchor', id: 'Anchor1', p1: pt('O', 'fixed', 0, 0) },
        // 左側固定三孔桿 O-A-B：80 + 80 = 160。
        triangle('Tri1', pt('O', 'fixed', 0, 0), pt('A', 'floating', 0, 80), pt('B', 'floating', 0, 160), { color: '#27ae60' }),
        // 藍色平行四邊形 A-D-P-B，維持右側三孔桿的姿態。
        bar('Link2', pt('A', 'floating', 0, 80), pt('D', 'floating', 96, 80), 96, { color: '#3498db' }),
        bar('Link3', pt('D', 'floating', 96, 80), pt('P', 'floating', 96, 160), 80, { color: '#3498db' }),
        // 右側手抓三孔桿 B-P-R：96 + 96 = 192，故 R = B + 2 × (P - B)。
        triangle('Tri4', pt('B', 'floating', 0, 160), pt('P', 'floating', 96, 160), pt('R', 'floating', 192, 160), { color: '#27ae60' })
      ],
      params: { TG1: 80, TR1_Tri1: 160, TR2_Tri1: 80, LL2: 96, LL3: 80, TG4: 96, TR1_Tri4: 192, TR2_Tri4: 96 }
    }
  },
  {
    id: 'quick-return',
    title: '急回機構：偏置曲柄滑塊',
    note: '滑軌刻意放在曲柄中心上方；同樣的水平行程，一段約用 220° 慢慢走，另一段約用 140° 快速回來。',
    snapshot: {
      kind: 'blocks',
      v: 1,
      counter: 6,
      tracePoint: 'S',
      comps: [
        { type: 'anchor', id: 'Anchor1', p1: pt('O', 'fixed', 0, 0) },
        { type: 'anchor', id: 'Anchor2', p1: pt('M1', 'fixed', 0, 48) },
        { type: 'anchor', id: 'Anchor3', p1: pt('M2', 'fixed', 184, 48) },
        bar('Link1', pt('O', 'fixed', 0, 0, { physicalMotor: '1' }), pt('A', 'floating', 48, 0), 48, {
          color: '#e74c3c',
          isInput: true,
          physicalMotor: '1',
          phaseOffset: 0
        }),
        {
          type: 'slider', id: 'Slider1', color: '#16a085', sign: 1, lenParam: 'SL1',
          m1: pt('M1', 'fixed', 0, 48), m2: pt('M2', 'fixed', 184, 48),
          p1: pt('Sa', 'fixed', 0, 48), p2: pt('Sb', 'fixed', 184, 48), p3: pt('S', 'floating', 140.26, 48),
          carrierLen: 184, railOffset: 0, carriageLen: 24, travelStart: 0, travelEnd: 184
        },
        bar('Link2', pt('A', 'floating', 48, 0), pt('S', 'floating', 140.26, 48), 104)
      ],
      params: { LL1: 48, LL2: 104, SL1: 184 }
    }
  },
  {
    id: 'gear-pair',
    title: '齒輪對：嚙合傳動',
    note: '紅色驅動齒輪整圈轉、藍色從動齒輪反向轉，轉速比＝半徑反比（30:40，大輪較慢）。',
    snapshot: {
      kind: 'blocks',
      v: 1,
      counter: 2,
      comps: [
        { type: 'gear', id: 'GearA', color: '#e74c3c',
          p1: pt('GCA', 'motor', -40, 0, { physicalMotor: '1' }),
          p2: pt('GPA', 'floating', -10, 0),
          radiusParam: 'GRA', teeth: 15, phase: 0 },
        { type: 'gear', id: 'GearB', color: '#2c6fbb',
          p1: pt('GCB', 'fixed', 30, 0),
          p2: pt('GPB', 'floating', 70, 0),
          radiusParam: 'GRB', teeth: 20, phase: 0, mesh: 'GearA' }
      ],
      params: { GRA: 30, GRB: 40, theta: 0 }
    }
  },
  {
    id: 'reduction-gear-train',
    title: '減速齒輪列：4 倍減速',
    note: '紅色 12 齒小齒輪驅動，中間 24 齒惰輪換方向，最後 48 齒大齒輪同向慢速輸出（末輪/首輪 = 1/4）。',
    snapshot: {
      kind: 'blocks',
      v: 1,
      counter: 3,
      comps: [
        { type: 'gear', id: 'GearA', color: '#e74c3c',
          p1: pt('GCA', 'motor', -128, 0, { physicalMotor: '1' }),
          p2: pt('GPA', 'floating', -104, 0),
          radiusParam: 'GRA', teeth: 12, module: 4, phase: 0 },
        { type: 'gear', id: 'GearB', color: '#2c6fbb',
          p1: pt('GCB', 'fixed', -56, 0),
          p2: pt('GPB', 'floating', -8, 0),
          radiusParam: 'GRB', teeth: 24, module: 4, phase: 0, mesh: 'GearA' },
        { type: 'gear', id: 'GearC', color: '#27ae60',
          p1: pt('GCC', 'fixed', 88, 0),
          p2: pt('GPC', 'floating', 184, 0),
          radiusParam: 'GRC', teeth: 48, module: 4, phase: 0, mesh: 'GearB' }
      ],
      params: { GRA: 24, GRB: 48, GRC: 96, theta: 0 }
    }
  },
  {
    id: 'rack-pinion',
    title: '齒條齒輪：轉→直線',
    note: '紅色小齒輪帶動綠色齒條沿水平方向平移；因為齒條是有限長，接觸點到端部前會反向，保持齒輪與齒條一直嚙合。',
    snapshot: {
      kind: 'blocks',
      v: 1,
      counter: 4,
      comps: [
        { type: 'gear', id: 'Pinion', color: '#e74c3c',
          p1: pt('PC', 'motor', 0, 0, { physicalMotor: '1' }),
          p2: pt('PP', 'floating', 18, 0),
          radiusParam: 'PR', teeth: 15, module: 4, phase: 0 },
        { type: 'anchor', id: 'RackGuideA', p1: pt('RGA', 'fixed', -2.5, -45) },
        { type: 'anchor', id: 'RackGuideB', p1: pt('RGB', 'fixed', 18, -45) },
        { type: 'rack', id: 'Rack1', color: '#16a085',
          p1: pt('RKP', 'floating', 0, -30),
          pinion: 'Pinion', lenParam: 'RKL', axisDeg: 0, sign: 1,
          bodyHeight: 20,
          slot: { length: 128, width: 5, offset: 0 },
          framePins: ['RGA', 'RGB'] }
      ],
      params: { PR: 30, RKL: 160, theta: 0 }
    }
  },
  {
    id: 'gear-gripper',
    title: '雙齒輪夾爪：抓取物件',
    note: '兩顆齒輪帶動內彎夾爪相向開合。拖動畫布上的示意物件改寬度，觀察開口與動作；零件仍可選取改造。',
    snapshot: {
      kind: 'blocks',
      v: 1,
      counter: 8,
      tracePoints: ['LT', 'RT'],
      comps: [
        { type: 'gear', id: 'GearA', color: '#e74c3c',
          p1: pt('GCA', 'motor', -30, 0, { physicalMotor: '1' }),
          p2: pt('GPA', 'floating', -30, 18),
          radiusParam: 'GRA', pinRadiusParam: 'GPRA', pinHoleDiameter: 5, teeth: 15, module: 4, phase: 90 },
        { type: 'gear', id: 'GearB', color: '#2c6fbb',
          p1: pt('GCB', 'fixed', 30, 0),
          p2: pt('GPB', 'floating', 30, 18),
          radiusParam: 'GRB', pinRadiusParam: 'GPRB', pinHoleDiameter: 5, teeth: 15, module: 4, phase: 90, mesh: 'GearA' },
        triangle('LeftJaw', pt('GCA', 'motor', -30, 0, { physicalMotor: '1' }), pt('GPA', 'floating', -30, 18), pt('LT', 'floating', -95, -85), {
          color: '#ff6b35',
          shape: 'jaw',
          shapeMode: 'polyline',
          jawTurnSign: 1,
          gParam: 'GPRA',
          r1Param: 'LJ_tip',
          r2Param: 'LJ_edge',
          sign: 1
        }),
        triangle('RightJaw', pt('GCB', 'fixed', 30, 0), pt('GPB', 'floating', 30, 18), pt('RT', 'floating', 95, -85), {
          color: '#ff6b35',
          shape: 'jaw',
          shapeMode: 'polyline',
          jawTurnSign: -1,
          gParam: 'GPRB',
          r1Param: 'RJ_tip',
          r2Param: 'RJ_edge',
          sign: -1
        })
      ],
      params: {
        gripperWorkflow: 1, gripperObjectWidth: 50, gripperClearance: 10,
        GRA: 30, GRB: 30, GPRA: 18, GPRB: 18,
        LJ_tip: 107, LJ_edge: 121.8,
        RJ_tip: 107, RJ_edge: 121.8,
        theta: 0
      }
    }
  },
  {
    id: 'cam-follower',
    title: '凸輪從動件：轉→上下',
    note: '紫色凸輪旋轉，滾子從動件沿導桿上下移動；改變凸輪外形，就能觀察從動件高度如何隨轉動改變。',
    snapshot: {
      kind: 'blocks',
      v: 1,
      counter: 2,
      tracePoint: 'CF',
      comps: [
        { type: 'cam', id: 'Cam1', color: '#9b59b6',
          p1: pt('CC', 'motor', 0, 0, { physicalMotor: '1' }),
          p2: pt('CF', 'floating', 0, 28),
          baseRadiusParam: 'CBR', liftParam: 'CLF', axisDeg: 90, profile: 'harmonic', phase: 0 }
      ],
      params: { CBR: 24, CLF: 40, theta: 0 }
    }
  },
  {
    id: 'pulley-belt',
    title: '皮帶輪傳動：同向變速',
    note: '紅色小皮帶輪用開口皮帶帶動藍色大皮帶輪；兩輪同向旋轉，角速度比等於半徑反比。',
    snapshot: {
      kind: 'blocks',
      v: 1,
      counter: 3,
      comps: [
        { type: 'pulley', id: 'PulleyA', color: '#e74c3c',
          p1: pt('PLA', 'motor', -56, 0, { physicalMotor: '1' }),
          p2: pt('PPA', 'floating', -35, 0),
          radiusParam: 'PRA', phase: 0 },
        { type: 'pulley', id: 'PulleyB', color: '#2c6fbb',
          p1: pt('PLB', 'fixed', 64, 0),
          p2: pt('PPB', 'floating', 106, 0),
          radiusParam: 'PRB', phase: 0 },
        { type: 'belt', id: 'Belt1', color: '#2c3e50',
          driver: 'PulleyA', driven: 'PulleyB' }
      ],
      params: { PRA: 24, PRB: 48, theta: 0 }
    }
  },
  {
    id: 'jansen-leg',
    title: '步行腿：Jansen',
    note: 'Theo Jansen 腿的教具比例；右側 TT 馬達帶動紅色曲柄，藍色連桿讓足端 P5 走出閉合步態軌跡。',
    snapshot: {
      kind: 'blocks',
      v: 1,
      counter: 14,
      tracePoint: 'P5',
      comps: [
        { type: 'anchor', id: 'Anchor1', p1: pt('F', 'fixed', 0, 0) },
        { type: 'anchor', id: 'Anchor2', p1: pt('O', 'motor', 38, 7.8, { physicalMotor: '1' }) },
        exactBar('LinkM', pt('O', 'motor', 38, 7.8, { physicalMotor: '1' }), pt('P0', 'floating', 53, 7.8), 15, {
          lenParam: 'm',
          color: '#e74c3c',
          isInput: true,
          physicalMotor: '1'
        }),
        exactBar('LinkJ', pt('P0', 'floating', 53, 7.8), pt('P1', 'floating', 13.986, 39.072, { solveSign: -1 }), 50, { lenParam: 'j', color: '#168bd1' }),
        exactBar('LinkK', pt('P0', 'floating', 53, 7.8), pt('P2', 'floating', 11.048, -37.715), 61.9, { lenParam: 'k', color: '#168bd1' }),
        exactBar('LinkB', pt('F', 'fixed', 0, 0), pt('P1', 'floating', 13.986, 39.072, { solveSign: -1 }), 41.5, { lenParam: 'b', color: '#168bd1' }),
        exactBar('LinkC', pt('F', 'fixed', 0, 0), pt('P2', 'floating', 11.048, -37.715), 39.3, { lenParam: 'c', color: '#168bd1' }),
        exactBar('LinkE', pt('P1', 'floating', 13.986, 39.072, { solveSign: -1 }), pt('P3', 'floating', -36.794, 15.943, { solveSign: -1 }), 55.8, { lenParam: 'e', color: '#168bd1' }),
        exactBar('LinkD', pt('F', 'fixed', 0, 0), pt('P3', 'floating', -36.794, 15.943, { solveSign: -1 }), 40.1, { lenParam: 'd', color: '#168bd1' }),
        triangle('TriUpper', pt('F', 'fixed', 0, 0), pt('P1', 'floating', 13.986, 39.072), pt('P3', 'floating', -36.794, 15.943), {
          color: '#168bd1',
          gParam: 'b',
          r1Param: 'd',
          r2Param: 'e',
          sign: -1,
          visualOnly: true,
          snapLength: false,
          zlift: 1
        }),
        exactBar('LinkF', pt('P3', 'floating', -36.794, 15.943, { solveSign: -1 }), pt('P4', 'floating', -21.232, -20.253, { solveSign: -1 }), 39.4, { lenParam: 'f', color: '#168bd1' }),
        exactBar('LinkG', pt('P2', 'floating', 11.048, -37.715), pt('P4', 'floating', -21.232, -20.253, { solveSign: -1 }), 36.7, { lenParam: 'g', color: '#168bd1' }),
        exactBar('LinkH', pt('P4', 'floating', -21.232, -20.253, { solveSign: -1 }), pt('P5', 'floating', -5.16, -83.957, { solveSign: -1 }), 65.7, { lenParam: 'h', color: '#168bd1' }),
        exactBar('LinkI', pt('P2', 'floating', 11.048, -37.715), pt('P5', 'floating', -5.16, -83.957, { solveSign: -1 }), 49, { lenParam: 'i', color: '#168bd1' }),
        triangle('TriLower', pt('P2', 'floating', 11.048, -37.715), pt('P4', 'floating', -21.232, -20.253), pt('P5', 'floating', -5.16, -83.957), {
          color: '#168bd1',
          gParam: 'g',
          r1Param: 'i',
          r2Param: 'h',
          sign: -1,
          visualOnly: true,
          snapLength: false,
          zlift: 1
        })
      ],
      params: { a: 38, l: 7.8, m: 15, j: 50, k: 61.9, b: 41.5, c: 39.3, e: 55.8, d: 40.1, f: 39.4, g: 36.7, h: 65.7, i: 49 }
    }
  },
  {
    id: 'competition-fourbar-lift',
    title: '競賽四連桿升降臂',
    note: '常見於托盤、夾爪或掛鉤升降。雙馬達：M1 驅動平行四連桿升降，M2 騎在前端立桿上控制工具架角度（手腕軸）。用下方 M1 / M2 切換要控制哪顆，另一顆會停在原角度。',
    snapshot: {
      kind: 'blocks',
      v: 1,
      counter: 8,
      comps: [
        { type: 'anchor', id: 'Anchor1', p1: pt('O1', 'fixed', -96, 0) },
        { type: 'anchor', id: 'Anchor2', p1: pt('O2', 'fixed', -96, 72) },
        bar('LiftCrank', pt('O1', 'fixed', -96, 0, { physicalMotor: '1' }), pt('A', 'floating', -48, 0), 48, {
          lenParam: 'LIFT_ARM',
          color: '#e74c3c',
          isInput: true,
          physicalMotor: '1',
          phaseOffset: 0,
          assemblyType: 'parallel-fourbar-lift'
        }),
        bar('LiftFollower', pt('O2', 'fixed', -96, 72), pt('B', 'floating', -48, 72), 48, {
          lenParam: 'LIFT_ARM_2',
          color: '#3498db'
        }),
        bar('LiftUpright', pt('A', 'floating', -48, 0), pt('B', 'floating', -48, 72), 72, {
          lenParam: 'LIFT_UPRIGHT',
          color: '#27ae60'
        }),
        // 騎乘馬達（手腕軸）：馬達殼固定在綠色立桿上——綠桿就是這顆馬達的「機架」
        // （motorCarrier），軸心 B 跟著升降。B 保持 floating——它不是世界機架點。
        // phaseOffset 是「相對機架桿」的夾角：放置時 B→C 水平 0°、綠桿 A→B 朝上 90°，故 -90。
        bar('ToolPlate', pt('B', 'floating', -48, 72, { physicalMotor: '2' }), pt('C', 'floating', 0, 72), 48, {
          lenParam: 'LIFT_TOOL_TOP',
          color: '#f39c12',
          isInput: true,
          physicalMotor: '2',
          motorType: 'tt',
          motorCarrier: 'LiftUpright',
          motorMount: {
            motor: '2', center: 'B', outputBody: 'ToolPlate', frameBody: 'LiftUpright',
            orientation: 'follow-frame', order: ['motor', 'frameBody', 'outputBody']
          },
          phaseOffset: -90
        }),
        bar('ToolBrace', pt('A', 'floating', -48, 0), pt('D', 'floating', 0, 0), 48, {
          lenParam: 'LIFT_TOOL_BOTTOM',
          color: '#f39c12'
        }),
        bar('ToolFront', pt('D', 'floating', 0, 0), pt('C', 'floating', 0, 72), 72, {
          lenParam: 'LIFT_TOOL_FRONT',
          color: '#f39c12'
        })
      ],
      params: {
        LIFT_ARM: 48, LIFT_ARM_2: 48, LIFT_UPRIGHT: 72,
        LIFT_TOOL_TOP: 48, LIFT_TOOL_BOTTOM: 48, LIFT_TOOL_FRONT: 72,
        theta: 0
      }
    }
  },
  {
    id: 'competition-roller-intake',
    title: '競賽擺臂進料機構',
    note: '機架全部用結構板組成：伺服板承載 MG995（穿板槽直接開在板上）與擺臂樞軸，折線立柱板連到地面。曲柄經連桿推拉黑色彎折臂，取物端沿地面掃過，把黃色物件耙入機架。',
    snapshot: {
      kind: 'blocks',
      v: 1,
      counter: 9,
      tracePoint: 'INTAKE_TIP',
      comps: [
        // 伺服板＝靜態結構板（樞軸與板尾兩個固定點）：擺臂樞軸、MG995、右側立柱都掛在它上面。
        // 馬達軸心是板頂點 → MG995 穿板槽/耳孔自動切進這塊板（2D/3D/DXF 同一份幾何）。
        triangle('IntakeServoPlate',
          pt('INTAKE_PIVOT', 'fixed', 170.5, 147.1),
          pt('INTAKE_MOTOR', 'floating', 203.9, 189.5),
          pt('PLATE_END', 'fixed', 336.5, 144.1), {
            color: '#95a5a6',
            gParam: 'INTAKE_PLATE_G', r1Param: 'INTAKE_PLATE_R1', r2Param: 'INTAKE_PLATE_R2'
          }),
        // 立柱板（折線桿）：從伺服板尾端往下到地面、再沿地面往左——右立柱＋底座一體成形。
        triangle('IntakeFrameColumn',
          pt('PLATE_END', 'fixed', 336.5, 144.1),
          pt('FRAME_BR', 'fixed', 336.2, 2.1),
          pt('FRAME_BL', 'fixed', 177.2, 1.2), {
            color: '#95a5a6', shapeMode: 'polyline',
            gParam: 'INTAKE_COL_G', r1Param: 'INTAKE_COL_R1', r2Param: 'INTAKE_COL_R2'
          }),
        // 靜止姿勢＝擺動起點（theta=0、phaseOffset≈138.8），舵臂朝左下。
        // mountLocatorPoint：伺服本體朝向定位點（在軸心正下方 → 本體水平朝右），不參與求解。
        bar('IntakeCrank',
          pt('INTAKE_MOTOR', 'fixed', 203.9, 189.5, { physicalMotor: '1' }),
          pt('CRANK_PIN', 'floating', 149.8, 237.0), 72, {
            lenParam: 'INTAKE_CRANK', color: '#f05a28', isInput: true,
            physicalMotor: '1', motorType: 'mg995', servoStart: 0, servoEnd: 90,
            phaseOffset: 138.75853160493327,
            mountLocatorPoint: 'SERVO_DIR'
          }),
        { type: 'anchor', id: 'IntakeServoDir', p1: pt('SERVO_DIR', 'fixed', 203.9, 179.5) },
        exactBar('IntakeCoupler',
          pt('CRANK_PIN', 'floating', 149.8, 237.0),
          pt('ARM_LINK', 'floating', 123.0, 182.1), 64, {
            lenParam: 'INTAKE_COUPLER', color: '#7f8c8d'
          }),
        // 黑色進料臂（折線桿）：樞軸在伺服板上，彎折點吃連桿，取物端往左下伸出。
        // 調桿段長度時彎角自動保持（對角線 INTAKE_ARM_R1 是彎角參數）。
        triangle('IntakeArm',
          pt('INTAKE_PIVOT', 'fixed', 170.5, 147.1),
          pt('ARM_LINK', 'floating', 123.0, 182.1),
          pt('INTAKE_TIP', 'floating', 73.9, 118.9), {
            color: '#2f343b',
            snapLength: false,   // 邊長取 0.1mm：彎角與靜止姿勢不因整數化漂移
            shapeMode: 'polyline',
            gParam: 'INTAKE_ARM_G', r1Param: 'INTAKE_ARM_R1', r2Param: 'INTAKE_ARM_R2',
            vertices: [
              { solve: true, ref: 'p1' },
              { solve: true, ref: 'p2' },
              { solve: true, ref: 'p3' }
            ]
          }),
        // 黃色物件放在底座板上（底座頂緣≈10.7、物件高 44 → 中心 y=33）；
        // 取物端低點掃過 y≈47、x 75→270，正好從物件上緣把它往機架內耙。
        { type: 'workpiece', id: 'IntakeTarget',
          p1: pt('INTAKE_OBJECT', 'floating', 150, 33),
          width: 44, height: 44, color: '#f4b400' }
      ],
      params: {
        INTAKE_PLATE_G: 54, INTAKE_PLATE_R1: 166, INTAKE_PLATE_R2: 141,
        INTAKE_COL_G: 142, INTAKE_COL_R1: 214, INTAKE_COL_R2: 159,
        INTAKE_CRANK: 72,
        INTAKE_COUPLER: 64,
        INTAKE_ARM_G: 59, INTAKE_ARM_R1: 100.6, INTAKE_ARM_R2: 80,
        theta: 0
      }
    }
  },
  {
    id: 'competition-flywheel-shooter',
    title: '競賽飛輪射球：皮帶加速',
    note: '大皮帶輪帶小飛輪，讓輸出輪高速旋轉。可用來討論射球速度、打滑與減速/加速取捨。',
    snapshot: {
      kind: 'blocks',
      v: 1,
      counter: 4,
      comps: [
        { type: 'pulley', id: 'ShooterDrivePulley', color: '#e74c3c',
          p1: pt('SDC', 'motor', -72, 0, { physicalMotor: '1' }),
          p2: pt('SDP', 'floating', -24, 0),
          radiusParam: 'SH_DRIVE_R', phase: 0 },
        { type: 'pulley', id: 'ShooterFlywheel', color: '#2c6fbb',
          p1: pt('SFC', 'fixed', 72, 0),
          p2: pt('SFP', 'floating', 96, 0),
          radiusParam: 'SH_FLY_R', phase: 0 },
        { type: 'belt', id: 'ShooterBelt', color: '#2c3e50',
          driver: 'ShooterDrivePulley', driven: 'ShooterFlywheel' },
        bar('ShooterFrame', pt('SDC', 'motor', -72, 0, { physicalMotor: '1' }), pt('SFC', 'fixed', 72, 0), 144, {
          lenParam: 'SH_FRAME',
          color: '#95a5a6'
        })
      ],
      params: { SH_DRIVE_R: 48, SH_FLY_R: 24, SH_FRAME: 144, theta: 0 }
    }
  },
  {
    id: 'competition-rack-lift',
    title: '競賽齒條升降滑台',
    note: '小齒輪帶動垂直齒條，做直上直下升降。適合作為伸縮臂、升降夾爪或推桿的出發點。',
    snapshot: {
      kind: 'blocks',
      v: 1,
      counter: 5,
      comps: [
        { type: 'gear', id: 'LiftPinion', color: '#e74c3c',
          p1: pt('LPC', 'motor', 0, 0, { physicalMotor: '1' }),
          p2: pt('LPP', 'floating', 18, 0),
          radiusParam: 'LPR', teeth: 15, module: 4, phase: 0, mountLocatorPoint: 'LML' },
        { type: 'anchor', id: 'MotorLocator', p1: pt('LML', 'fixed', 0, 11.18) },
        { type: 'anchor', id: 'LiftGuideA', p1: pt('LGA', 'fixed', 45, -5.2) },
        { type: 'anchor', id: 'LiftGuideB', p1: pt('LGB', 'fixed', 45, 17.8) },
        { type: 'rack', id: 'LiftRackGear', color: '#16a085',
          p1: pt('LiftRack', 'floating', 30, 0),
          pinion: 'LiftPinion', lenParam: 'LRL', axisDeg: 90, sign: 1,
          bodyHeight: 20,
          // M3 螺絲當導銷與鎖付：槽寬 3.4、孔 3.2
          slot: { length: 144, width: 3.4, offset: 0 },
          framePins: ['LGA', 'LGB'], endMargin:12, pinHoleDiameterMm: 3.2,
          holes: [{id:'LiftHoleA',role:'endA',u:0,v:-15,diameter:3.2},{id:'LiftOutput',role:'endB',u:0,v:-15,diameter:3.2}] }
      ],
      params: { LPR: 30, LRL: 176, theta: 0 }
    }
  },
  {
    id: 'empty-challenge',
    title: '空白挑戰',
    note: '從零開始，試著做出馬達可整圈轉的機構。',
    snapshot: { kind: 'blocks', v: 1, counter: 0, comps: [], params: { theta: 0 } }
  }
];

// 第二單元半成品：保留曲柄與滑軌，學生補接 A–P3 浮桿。
const sliderPractice = JSON.parse(JSON.stringify(ALL_BLOCK_EXAMPLES.find(e => e.id === 'slider-crank')));
sliderPractice.id = 'slider-crank-practice';
sliderPractice.title = '滑塊曲柄：補接浮桿';
sliderPractice.note = '用連桿接曲柄活動端 A 與滑塊孔 P3，再播放。';
sliderPractice.snapshot.comps = sliderPractice.snapshot.comps.filter(c => c.id !== 'Link2');
const practiceCrank = sliderPractice.snapshot.comps.find(c => c.id === 'Link1');
practiceCrank.p2.x = 0;
practiceCrank.p2.y = 32;
practiceCrank.phaseOffset = 90;
sliderPractice.snapshot.comps.find(c => c.id === 'Slider1').p3.x = Math.sqrt(88 ** 2 - 32 ** 2);
sliderPractice.snapshot.params.LL1 = 32;
delete sliderPractice.snapshot.params.LL2;
ALL_BLOCK_EXAMPLES.push(sliderPractice);

// 第五單元：完整接合與保留兩個模組的練習起點。
ALL_BLOCK_EXAMPLES.push({ id: 'assembly-lift-gripper', title: '組立：升降與夾爪完整範例',
  note: 'M1 控制平行四連桿升降臂，M2 控制夾爪；切換組立查看工具架接點。', snapshot: assemblyLessonSnapshot });
const assemblyPractice = JSON.parse(JSON.stringify(assemblyLessonSnapshot));
assemblyPractice.modules.find(m => m.id === 'Grip1').mount = null;
// 起點分開擺放，避免尚未接合就重疊，學生能辨識兩個模組。
assemblyPractice.comps.filter(c => c.moduleId === 'Grip1').forEach(c => {
  ['p1', 'p2', 'p3'].forEach(key => { if (c[key]) c[key].x += 240; });
});
ALL_BLOCK_EXAMPLES.push({ id: 'assembly-lift-gripper-practice', title: '組立：升降與夾爪接合練習',
  note: '切換組立，選齒輪夾爪，按「工具架 · 雙孔對鎖」，預覽後接上；M1 升降時夾爪整組跟著移動。', snapshot: assemblyPractice });

export const BLOCK_EXAMPLES = ALL_BLOCK_EXAMPLES.filter(
  example => example.id !== 'competition-flywheel-shooter'
);

export function getExample(id) {
  return BLOCK_EXAMPLES.find(example => example.id === id) || null;
}

export function getExampleLesson(id) {
  return EXAMPLE_LESSONS[id] || {
    group: 'challenge',
    level: '探索',
    use: '',
    learn: '',
    try: [],
    predict: '先猜這個機構會如何運動。',
    measure: '播放並觀察工作點或零件的移動。',
    explain: '用觀察到的運動說明你的猜測是否正確。'
  };
}
