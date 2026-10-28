// UI-1：電腦與手機共用的指令清單（純資料）。run：'window.blocks.函式' 或 '#元素id'（點該元素）。
// modes：只在這些模式出現（省略＝設計與組立都有）；SHORTCUTS 是控制列上重複出現的少數入口。
import { PLUGINS } from '../plugins/registry.js';
const box = PLUGINS.find(p => p.id === 'box-maker');
export const COMMAND_GROUPS = [
  { id: 'add', label: '新增' }, { id: 'edit', label: '調整' }, { id: 'view', label: '視圖' },
  { id: 'project', label: '專案' }, { id: 'help', label: '說明' }
];
export const COMMANDS = [
  { id: 'boxMaker', group: 'add', plugin: true, label: box.name, icon: box.icon, tip: box.hint, run: 'window.blocks.openBoxMaker', modes: ['design'] },
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
  { id: 'clearAll', group: 'project', label: '清空全部', icon: '🗑', danger: true, tip: '清空目前全部零件', run: 'window.blocks.confirmClearAll' },
  { id: 'guide', group: 'help', label: '設計引導', icon: '🧭', run: 'window.blocks.openGuide', modes: ['design'] },
  { id: 'help', group: 'help', label: '操作說明', icon: '❓', run: 'window.blocks.openHelp' },
  { id: 'teaching', group: 'help', label: '教學單元', icon: '🎓', tip: '另開分頁', run: 'window.blocks.openTeaching' },
  { id: 'version', group: 'help', label: '版本', icon: '🏷', tip: '查看版本與更新紀錄', run: '#versionBtn' }
];
export const SHORTCUTS = ['undo', 'fitView', 'view3d'];
