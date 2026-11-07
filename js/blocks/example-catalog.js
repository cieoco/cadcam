/** 範例目錄的用途、家族與顯示名稱；作品仍只由 examples.js 的穩定 ID 載入。
 *  不改 snapshot、lesson 分組或練習判定。目錄開啟時才載入。
 */
import { START_CARDS } from './start-gallery.js';

export const CATALOG_GROUPS = [
  { id: 'transmission', label: '傳動與變速' },
  { id: 'lift', label: '升降與伸縮' },
  { id: 'handling', label: '夾取與搬運' },
  { id: 'motion', label: '往復與特殊運動' },
  { id: 'walking', label: '行走機構' }
];
const variant = (id, title, capability = '可試動', source = '') => ({ id, title, capability, source });
const family = (id, group, title, note, variants) => ({ id, group, title, note, variants });
// 來源標籤僅指已核對案例的結構參考，不表示尺寸、加工或實物已驗證。
export const CATALOG_FAMILIES = [
  family('gears', 'transmission', '改變轉速與轉向 · 齒輪', '比較單對齒輪、齒輪列與共軸減速。', [
    variant('gear-pair', '兩輪嚙合傳動'), variant('reduction-gear-train', '齒輪列四倍減速'),
    variant('iq-mad-box', '三段共軸減速 · M.A.D. Box', '可試動', 'IQ')]),
  family('belt', 'transmission', '跨軸同向傳動 · 皮帶輪', '改輪徑比較轉速比。', [variant('pulley-belt', '皮帶輪同向變速')]),
  family('chain', 'transmission', '跨軸減速 · 鏈輪鏈條', '20 齒帶動 40 齒；#25 鏈條示範。', [variant('sprocket-chain', '鏈輪鏈條同向減速')]),
  family('parallel-lift', 'lift', '保持方向升降 · 平行連桿', '工具保持姿態，仍沿圓弧移動。', [
    variant('parallel-fourbar', '平行四連桿保持姿態'), variant('competition-fourbar-lift', '四連桿升降與工具調角'),
    variant('six-bar-lift', '六連桿保持方向升降', '可試動', 'IQ'), variant('lift-bucket', '平行升降托斗')]),
  family('rack', 'lift', '直線推送與升降 · 齒條', '比較水平推送與垂直滑台。', [
    variant('rack-pinion', '旋轉轉為直線推送'), variant('competition-rack-lift', '齒條升降滑台')]),
  family('syringe-lift', 'lift', '推動單臂升降 · 針筒', '先看完成版，再親手安裝針筒。', [
    variant('hydraulic-h01', '固定針筒抬升單臂 · H01'), variant('hydraulic-h01-practice', '安裝單臂針筒 · H01', '待完成練習'),
    variant('hydraulic-h02', '管夾固定針筒抬臂 · H02'), variant('hydraulic-h02-practice', '安裝抬臂針筒 · H02', '待完成練習')]),
  family('scissor', 'lift', '垂直升起平台 · 剪式台', '三層交叉臂、上下滑槽與跨層針筒。', [variant('guided-scissor-lift', '針筒驅動三層剪式升降', '可試動', 'VEX')]),
  family('clawbot', 'handling', '抬臂再夾取 · Clawbot', '單轉軸臂會帶著工具傾斜；先分別試升降與夾爪。', [
    variant('clawbot-geared-lift', '3:1 單轉軸升降 · Clawbot', '可試動', 'IQ'),
    variant('gear-gripper', '雙齒輪反向夾取 · 通用夾爪'),
    variant('clawbot-lift-gripper', '升降與夾取組立 · Clawbot', '可試動', 'IQ'),
    variant('clawbot-lift-gripper-practice', '接合升降臂與夾爪 · Clawbot', '待完成練習', 'IQ')]),
  family('claws', 'handling', '開合夾指 · 旋轉與平行夾爪', '比較單側活動與雙側保持方向；接觸與夾持力未模擬。', [
    variant('single-servo-claw', '單側活動夾取', '可試動', 'FTC 用途'), variant('parallel-gripper', '雙側平行四連桿夾取')]),
  family('syringe-grip', 'handling', '交叉夾臂開合 · 針筒', '一體式交叉臂由固定筒身推動。', [
    variant('hydraulic-h03', '推動一體式交叉夾臂 · H03'), variant('hydraulic-h03-practice', '安裝夾臂針筒 · H03', '待完成練習')]),
  family('passive-tools', 'handling', '托起物件 · 固定叉與鏟', '共用背板的三種工具；不含車體或主動升降。', [
    variant('iq-passive-fork', '雙叉托物', '固定組立', 'IQ'), variant('iq-passive-spatula', '雙鏟托物', '固定組立', 'IQ'),
    variant('iq-passive-combined', '叉臂與鏟板共用背板', '固定組立', 'IQ')]),
  family('wheel-grabber', 'handling', '調整兩支被動輪爪', '兩臂獨立轉動；橡皮筋、回彈與抓持未模擬。', [variant('iq-wheel-grabber', '兩支獨立輪爪臂', '手動調姿', 'IQ')]),
  family('intake', 'handling', '收放進料臂與連續轉輪', '擺臂與連續滾輪是不同動作；物件輸送未模擬。', [
    variant('competition-roller-intake', '收放式擺臂進料'), variant('continuous-roller-intake', '連續滾輪傳動 · Fling', '局部示意', 'IQ')]),
  family('wrist', 'handling', '翻轉工具與傾倒料斗', '觀察工具朝向；不模擬物件倒出。', [
    variant('single-axis-wrist', '單軸翻轉工具', '可試動', 'FTC 用途'), variant('tipping-bucket', '單軸傾倒料斗')]),
  family('lift-gripper', 'handling', '保持姿態升降與夾取', '與 Clawbot 單轉軸升降分開比較。', [
    variant('assembly-lift-gripper', '平行升降與夾爪組立'), variant('assembly-lift-gripper-practice', '接合平行升降與夾爪', '待完成練習')]),
  family('hydraulic-arm', 'handling', '分軸升降、轉向與夾取 · 針筒', '每個動作各有針筒，組立台分別控制。', [
    variant('hydraulic-h05', '升降與夾取 · H05'), variant('hydraulic-h06', '轉向、升降與夾取 · H06')]),
  family('catapult', 'handling', '拉下投球臂 · Fling', '只表達曲柄拉緊段；沒有釋放、彈射或球的飛行。', [variant('crank-catapult-study', '曲柄拉緊投球臂', '局部示意', 'IQ')]),
  family('fourbar', 'motion', '旋轉與往復擺動 · 四連桿', '同一家族比較曲柄搖桿、雙曲柄與雙搖桿。', [
    variant('fourbar-crank-rocker', '曲柄帶動搖桿'), variant('fourbar-missing-coupler', '補接四連桿浮桿', '待完成練習'),
    variant('fourbar-double-crank', '雙曲柄連續旋轉'), variant('fourbar-double-rocker', '雙搖桿往復擺動')]),
  family('wiper', 'motion', '往復掃掠 · 單支雨刷', '先看完整連接，再練習補接浮桿。', [
    variant('wiper-single', '單支雨刷往復擺動'), variant('wiper-missing-coupler', '補接雨刷浮桿', '待完成練習')]),
  family('slider-crank', 'motion', '直線往復與急回 · 曲柄滑塊', '比較一般往復與偏置急回。', [
    variant('slider-crank', '曲柄帶動滑塊往復'), variant('slider-crank-practice', '補接曲柄與滑塊', '待完成練習'), variant('quick-return', '偏置曲柄滑塊急回')]),
  family('turntable', 'motion', '推動圓盤轉向 · 針筒', '比較筒身固定與單螺絲可轉安裝。', [
    variant('hydraulic-h07', '固定筒身推動雙圓盤 · H07'), variant('hydraulic-h08', '可轉筒身推動圓盤 · H08')]),
  family('cam', 'motion', '週期性上下推動 · 凸輪', '看凸輪輪廓與從動件行程。', [variant('cam-follower', '凸輪推動從動件')]),
  family('straight', 'motion', '產生近似直線 · 切比雪夫連桿', '近似直線不等於滑軌直線約束。', [variant('chebyshev-linkage', '連桿產生近似直線軌跡')]),
  family('pantograph', 'motion', '放大描點運動 · 縮放儀', '手動移動接點觀察二倍軌跡。', [variant('pantograph', '手動二倍放大描點', '手動調姿')]),
  family('jansen', 'walking', '追蹤足端步行軌跡 · Jansen', '單腿幾何試動；輪地接觸與整機行走未模擬。', [variant('jansen-leg', '連桿帶動步行腿')]),
  family('tools', 'tools', '工具與製作練習', '從空白開始，或核對板件接合試片。', [
    variant('empty-challenge', '從空白畫第一根桿', '待完成練習'), variant('tab-nut-m3', '3 mm／M3 榫槽接合試片', '固定組立')])
];

export const CATALOG_RECOMMENDATIONS = START_CARDS.filter(card => card.example && !card.blank).map(card => card.example);
export const getCatalogVariant = id => CATALOG_FAMILIES.flatMap(item => item.variants).find(item => item.id === id);

/** 每個公開 ID 只有一個主要位置；按需追加的教學起始檔另列於底部。 */
export function renderExampleCatalog(list, examples, requestLoad, doc = document) {
  list.textContent = '';
  const available = new Map(examples.map(example => [example.id, example]));
  const el = (tag, className, text) => Object.assign(doc.createElement(tag), { className, textContent: text || '' });
  const button = (item, recommendation = false) => {
    const example = available.get(item.id), b = el('button', 'example-btn');
    b.type = 'button';
    // 推薦是同一份作品的捷徑，不重複主要目錄的 data-example-id。
    b.dataset[recommendation ? 'exampleRef' : 'exampleId'] = item.id;
    b.append(el('span', 'example-name', item.title), el('span', 'example-capability', item.capability));
    if (item.source) b.append(el('span', 'example-source', item.source));
    b.title = example?.note || '';
    b.addEventListener('click', () => requestLoad(item.id));
    return b;
  };
  const section = (id, label) => {
    const node = el('section', 'example-section'); node.dataset.exampleGroup = id;
    const heading = el('h3', 'example-group-title', label); heading.id = `example-group-${id}`;
    node.setAttribute('aria-labelledby', heading.id); node.append(heading); list.append(node); return node;
  };
  const recommended = section('recommended', '先試這幾個');
  const links = el('div', 'example-recommendations');
  CATALOG_RECOMMENDATIONS.forEach(id => { const item = getCatalogVariant(id); if (available.has(id)) links.append(button(item, true)); });
  recommended.append(links);
  for (const group of [...CATALOG_GROUPS, { id: 'tools', label: '工具與製作練習' }]) {
    const node = section(group.id, group.label);
    for (const item of CATALOG_FAMILIES.filter(item => item.group === group.id)) {
      if (item.variants.length === 1) {
        const card = el('div', 'example-family'); card.dataset.exampleFamily = item.id;
        const b = button({ ...item.variants[0], title: item.title }); b.className += ' example-single';
        b.append(el('span', 'example-single-note', item.note)); card.append(b); node.append(card);
        continue;
      }
      const details = el('details', 'example-family'); details.dataset.exampleFamily = item.id;
      const summary = el('summary', '', `${item.title}（${item.variants.length}）`);
      if (item.variants.every(v => v.capability === item.variants[0].capability)) summary.append(el('span', 'example-capability', item.variants[0].capability));
      details.append(summary, el('p', 'example-family-note', item.note));
      const variants = el('div', 'example-variants');
      item.variants.filter(v => available.has(v.id)).forEach(v => variants.append(button(v)));
      details.append(variants); node.append(details);
    }
  }
  const owned = new Set(CATALOG_FAMILIES.flatMap(item => item.variants.map(v => v.id)));
  const starts = examples.filter(example => !owned.has(example.id));
  if (starts.length) {
    const node = section('lessons', '教學起始檔');
    const details = el('details', 'example-family'); details.dataset.exampleFamily = 'lesson-starts';
    details.append(el('summary', '', `各單元獨立練習（${starts.length}）`));
    const variants = el('div', 'example-variants');
    starts.forEach(example => variants.append(button(variant(example.id, example.title, '待完成練習'))));
    details.append(variants); node.append(details);
  }
}
