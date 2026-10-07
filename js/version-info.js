// 發布時更新版本與紀錄，並同步各 HTML 的 script 版本參數。
import { APP_VERSION as version } from './version.js?v=20261008_brackets';
const releases = [
  ['2026.10.08.1', '2026-10-08', ['組立統一使用精靈；直角接合新增角碼配置示意，小範圍左右各一、大範圍左二右一，可點選微調。', '角碼仍為操作試作，尚未保存配置或產生加工孔位。']],
  ['2026.10.07.16', '2026-10-07', ['修正伸縮桿伸長後誤報無解；求解結果含無效座標時不再回報有效。', '全行程掃描增加步距與取樣量防護，避免無限迴圈。']],
  ['2026.10.07.15', '2026-10-07', ['修正平行四連桿升降臂通過共線位置後翻成交叉形狀，正反轉與重新組立時維持平行分支。']],
  ['2026.10.07.14', '2026-10-07', ['方向箭頭與置中符號回到圖形內，改用淡色、透明底，不遮住設計物；保留接合角度旋轉。']],
  ['2026.10.07.13', '2026-10-07', ['接合角度可直接輸入或以 ±90° 旋轉，隨作品保存。', '方向與尺寸按鈕移至預覽下方，不再遮住組立模型。']],
  ['2026.10.07.12', '2026-10-07', ['選定接合面後直接在模型著色，上下面填色、側面標亮對應邊緣，選面按鈕同步變色。']],
  ['2026.10.07.11', '2026-10-07', ['每個設計只選一個桿件的一面，移除雙重角色與四個下拉欄位。', '組立直接調整兩面的接合位置；固定桿／底板可直接點選，選面隨作品與模組保存。']],
  ['2026.10.07.10', '2026-10-07', ['接合設定試作：設計時點部位、指定接合面，組立時帶入預覽與尺寸細調。', '保留兩個機構輪廓；六面體改為選面輔助。']],
  ['2026.10.07.9', '2026-10-07', ['固定桿預設改為四角圓角矩形，保留孔位並包住馬達安裝範圍，方便組立對齊。']],
  ['2026.10.07.8', '2026-10-07', ['預設組立精靈回到六面體選面、箭頭對齊與尺寸確認；手機選面放大方向外框。', '接好後可重新選面與尺寸，取消不改作品；加工接法留在進階。']],
  ['2026.10.07.7', '2026-10-07', ['補上 MG995 搖臂舵盤孔位、M2 自攻螺絲與組裝步驟。', '修正干涉提示：六面接合未驗證或檢查失敗時，不顯示綠色通過。']],
  ['2026.10.07.6', '2026-10-07', ['干涉訊息改用看得懂的零件名稱（哪個機構的什麼）。', '組立教學單元的操作說明改為配合接合精靈。']],
  ['2026.10.07.5', '2026-10-07', ['多個機構組立：底座、未安裝清單、整串拆下、同一條邊自動排位；未接上的機構不再併進機架板與製作包。']],
  ['2026.10.07.4', '2026-10-07', ['組立台改為接合精靈：選承接面、微調、接上；工程面板收進「進階」。']],
  ['2026.10.07.3', '2026-10-07', ['設計分頁新增『接合面』工具：標示安裝方向與承接面（手機／電腦）。']],
  ['2026.10.07.2', '2026-10-07', ['匯入獨立套件改為左右並列並留出空隙，避免 3D 視角看起來像自動接合。', '匯入後仍為未安裝，選擇接法並確認後才組立。', '修正夾爪板件 3D 輪廓函式錯誤，避免預覽中斷。']],
  ['2026.10.07.1', '2026-10-07', ['新增六面體組立精靈：手機逐步選面、選中變色與旋轉觀看。', '對齊箭頭整合到接合預覽，點選後設定偏移尺寸、間距及 90° 轉向。', '正式組立支援 3D 姿態、復原與保存／分享還原；轉接件、配對固定孔與跨面干涉仍待設計／驗證。']],
  ['2026.10.06.6', '2026-10-06', ['新增上方操作說明、單指空白平移、常駐置中；切換面板保留手動縮放。', '手機桿件編輯預設只顯示尺寸、完成與更多設定；避免機架面板同時占用畫布。']],
  ['2026.10.06.5', '2026-10-06', ['手機編輯面板改為不遮擋畫布，新增完成／收合。', '移除舊版重複留白，切換手機面板自動置中；機架加工設定收進進階。']],
  ['2026.10.06.4', '2026-10-06', ['手機版固定顯示教學入口與課堂回報按鈕。', '播放列與設計分頁不再覆蓋畫布，專案面板限制高度並可捲動。']],
  ['2026.10.06.3', '2026-10-06', ['新增 2D 機構的 10 秒 MP4 動畫匯出、預覽與下載。', '課堂回報按鈕整合至版本前方。']],
  ['2026.10.06.2', '2026-10-06', ['新增課堂學習頁的問題回報串接；正式作業相片或影片仍在 Classroom 繳交。']],
  ['2026.10.06.1', '2026-10-06', ['新增版本標示與更新紀錄。', '補上求解後的桿長核對，衝突的連桿回報無解。']],
  ['2026.10.05', '2026-10-05', ['修正組立重建時，平行四連桿可能翻成交叉姿態。', '組立教材改用平行四連桿升降臂搭配齒輪夾爪。']]
];
const style = document.createElement('style');
style.textContent = `
.version-button{font:12px system-ui;color:#176b87;background:#eef7fa;border:1px solid #b8cbd2;border-radius:7px;padding:7px 9px;cursor:pointer;white-space:nowrap}
.version-dialog{box-sizing:border-box;width:min(480px,calc(100% - 32px));max-height:80vh;overflow:auto;border:1px solid #b8cbd2;border-radius:14px;padding:22px;color:#18324b;background:white;font:16px/1.6 system-ui}
.version-dialog::backdrop{background:#10283866}.version-dialog h2{margin:0;font-size:21px}.version-dialog h3{margin:18px 0 4px;font-size:16px}.version-dialog p{margin:10px 0}.version-dialog ul{padding-left:22px}.version-dialog button{min-height:40px}.version-dialog form{text-align:right}.version-button:focus-visible{outline:3px solid #df6b38;outline-offset:3px}
@media print{.version-button,.version-dialog{display:none}}
`;
document.head.append(style);
const button = document.createElement('button');
button.className = 'version-button';
button.type = 'button';
button.textContent = `v${version}`;
button.title = '查看版本與更新紀錄';
button.setAttribute('aria-label', `目前版本 ${version}，查看更新紀錄`);
const host = document.querySelector('#learningMore') || document.querySelector('.learning-actions') || document.querySelector('.appbar') || document.querySelector('main') || document.body;
host.append(button);
const dialog = document.createElement('dialog');
dialog.className = 'version-dialog';
dialog.setAttribute('aria-labelledby', 'version-title');
const title = document.createElement('h2');
title.id = 'version-title'; title.textContent = '版本與更新紀錄';
const note = document.createElement('p');
note.textContent = `目前載入版本：${version}。更新發布後，請重新整理頁面並比對版本號；若仍是舊版，可用 Ctrl＋F5（電腦）重新載入。請先存檔。`;
dialog.append(title, note);
for (const [number, date, items] of releases) {
  const heading = document.createElement('h3');
  heading.textContent = `${number} · ${date}`;
  const list = document.createElement('ul');
  for (const text of items) { const li = document.createElement('li'); li.textContent = text; list.append(li); }
  dialog.append(heading, list);
}
const form = document.createElement('form'); form.method = 'dialog';
const close = document.createElement('button'); close.className = 'version-button'; close.textContent = '關閉';
form.append(close); dialog.append(form); document.body.append(dialog);
button.addEventListener('click', () => dialog.showModal());
