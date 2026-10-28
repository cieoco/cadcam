// 電腦與手機共用的指令清單（純資料）；run＝'window.blocks.函式' 或 '#元素id'；modes＝只在該模式出現。
import { PLUGINS } from '../plugins/registry.js';
const box = PLUGINS.find(p => p.id === 'box-maker');
export const COMMAND_GROUPS = [
  { id: 'add', label: '新增' }, { id: 'edit', label: '調整' }, { id: 'view', label: '視圖' },
  { id: 'project', label: '專案' }, { id: 'help', label: '說明' }
];
// 新增面板分類（工作順序）；open＝預設展開
export const ADD_SECTIONS = [
  { id: 'ground', label: '固定', hint: '機構哪裡不動', open: 1 }, { id: 'member', label: '構件', hint: '會動的零件', open: 1 },
  { id: 'guide', label: '導引', hint: '讓零件照路線走' }, { id: 'power', label: '動力', hint: '讓機構動起來' },
  { id: 'transmission', label: '傳動', hint: '改速度或方向、傳到別處' }, { id: 'modules', label: '現成組件', hint: '拿做好的來用' },
  { id: 'plugin', label: '外掛', hint: '擴充功能' }
];
const B = 'window.blocks.';
// [id, 名稱, 圖示, 說明, 函式, ...參數]
const add = (section, rows) => rows.map(([id, label, icon, tip, run, ...args]) => ({ id, group: 'add', section, label, icon, tip, run: B + run, args, modes: ['design'] }));
export const COMMANDS = [
  ...add('ground', [['anchor', '固定支點', '📌', '非實體支架', 'addAnchor']]),
  ...add('member', [['bar', '連桿', '🔵', '點兩點畫桿', 'pickLinkTool', 'bar'], ['triangle', '三角板', '🔺', '三孔，填滿', 'pickLinkTool', 'triangle'],
    ['polyline', '折線桿', '📈', '多孔，不填滿', 'pickLinkTool', 'polyline'], ['plate', '板件', '🟢', '前三點主孔，再加外形', 'startDrawPolygon']]),
  ...add('guide', [['rail', '滑軌', '🟩', '畫軌道讓滑塊走', 'startDrawRail']]),
  ...add('power', [['motor', '馬達', '🔴', 'TT／N20', 'openMotorChoice'], ['servo', '舵機', '🟦', 'MG995', 'pickMotorType', 'mg995'],
    ['linear', '線性致動器', '🟢', '沿滑軌推拉', 'pickMotorType', 'linear'], ['syringe', '液壓針筒', '💧', '10cc 管夾固定', 'addFixedSyringe']]),
  ...add('transmission', [['gearPair', '齒輪對', '⚙️', '成對嚙合', 'addGearPair'], ['rackPinion', '齒輪齒條', '▥', '直線滑台', 'addRackPinion'], ['chain', '鏈輪＋鏈條', '⛓️', '#25 鏈條', 'startChainDrive']]),
  ...add('plugin', [['boxMaker', box.name, box.icon, box.hint, 'openBoxMaker']]),
  { id: 'undo', group: 'edit', label: '復原', icon: '↩', tip: '復原上一步', run: 'window.blocks.undo' },
  { id: 'deleteSelected', group: 'edit', label: '刪除選取', icon: '🗑', danger: true, tip: '刪除選取零件', run: 'window.blocks.deleteSelectedPart', modes: ['design'] },
  { id: 'fitView', group: 'view', label: '置中', icon: '⊡', tip: '置中畫布', run: 'window.blocks.fitView' },
  { id: 'view3d', group: 'view', label: '3D', tip: '3D 預覽', run: 'window.blocks.toggle3D', modes: ['design'] },
  { id: 'frameLock', group: 'view', label: '鎖孔距', tip: '拖曳固定孔與機架時吸附到 8mm LEGO 孔距', run: 'window.blocks.toggleFrameLock', modes: ['design'] },
  { id: 'rulers', group: 'view', label: '尺規', tip: '顯示完整尺規（關閉時只留比例尺）', run: 'window.blocks.toggleRulers', modes: ['design'] },
  { id: 'dimension', group: 'view', label: '量尺', icon: '📏', tip: '量兩點距離、離地高度、水平距離或移動量，並顯示全行程最小／最大', run: 'window.blocks.startDimension', modes: ['design'] },
  { id: 'designList', group: 'project', label: '設計清單', icon: '🗂', run: 'window.blocks.openDesignList', modes: ['bench'] },
  { id: 'save', group: 'project', label: '存檔', icon: '💾', tip: '儲存整份作品（所有設計與組立接合）', run: 'window.blocks.saveFile' },
  { id: 'open', group: 'project', label: '開啟', icon: '📂', tip: '開啟作品（替換目前作品）', run: 'window.blocks.openFile' },
  { id: 'examples', group: 'project', label: '範例…', icon: '📘', tip: '選擇機構範例（可載入或加入模組）', run: 'window.blocks.openExamples' },
  { id: 'share', group: 'project', label: '分享', icon: '🔗', tip: '複製分享連結', run: 'window.blocks.share' },
  { id: 'fabrication', group: 'project', label: '製作設定與零件輸出', icon: '⚙️', run: 'window.blocks.openFabrication' },
  { id: 'exportVideo', group: 'project', label: 'MP4 動畫（10 秒）', icon: '🎬', run: 'window.blocks.exportVideo' },
  { id: 'buildPack', group: 'project', label: '製作包', icon: '📋', tip: '板件清單＋五金清單＋組裝步驟（可列印）', run: 'window.blocks.downloadBuildPack' },
  { id: 'exportStep', group: 'project', label: '匯出 STEP', icon: '📐', tip: '板件存成 STEP，CAD 可開', run: 'window.blocks.exportStep' },
  { id: 'clearAll', group: 'project', label: '清空全部', icon: '🗑', danger: true, tip: '清空目前全部零件', run: 'window.blocks.confirmClearAll' },
  { id: 'guide', group: 'help', label: '設計引導', icon: '🧭', run: 'window.blocks.openGuide', modes: ['design'] },
  { id: 'help', group: 'help', label: '操作說明', icon: '❓', run: 'window.blocks.openHelp' },
  { id: 'teaching', group: 'help', label: '教學單元', icon: '🎓', tip: '另開分頁', run: 'window.blocks.openTeaching' },
  { id: 'version', group: 'help', label: '版本', icon: '🏷', tip: '查看版本與更新紀錄', run: '#versionBtn' }
];
export const SHORTCUTS = ['undo', 'fitView', 'view3d'];
