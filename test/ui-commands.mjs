// UI-1：電腦與手機共用同一份指令清單（新增／調整／視圖／專案／說明），頂端只留身分、模式切換、復原、專案▾、說明▾。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {COMMAND_GROUPS,COMMANDS,SHORTCUTS} from '../js/blocks/ui-commands.js';
let pass=0;const ok=(c,m)=>{assert.ok(c,m);pass++;console.log('PASS',m);};
ok(JSON.stringify(COMMAND_GROUPS.map(g=>g.id))===JSON.stringify(['add','edit','view','project','help'])&&COMMAND_GROUPS.map(g=>g.label).join()==='新增,調整,視圖,專案,說明','五個分類：新增、調整、視圖、專案、說明（與手機分頁同名）');
const ids=COMMANDS.map(c=>c.id);
ok(new Set(ids).size===ids.length,'每個指令只出現一次（不在兩個分類重複）');
ok(COMMANDS.every(c=>COMMAND_GROUPS.some(g=>g.id===c.group)&&typeof c.label==='string'&&c.label&&typeof c.run==='string'&&/^window\.blocks\.\w+|^#\w+/.test(c.run)),'每個指令有分類、中文名稱與一個動作');
const where={undo:'edit',deleteSelected:'edit',boxMaker:'add',fitView:'view',view3d:'view',frameLock:'view',rulers:'view',dimension:'view',
  save:'project',open:'project',examples:'project',share:'project',fabrication:'project',exportVideo:'project',buildPack:'project',clearAll:'project',
  guide:'help',help:'help',teaching:'help',version:'help'};
for(const [id,g] of Object.entries(where))if(!COMMANDS.some(c=>c.id===id&&c.group===g))assert.fail(`缺少指令 ${id}（應在 ${g}）`);
ok(true,`必要指令都在正確分類（${Object.keys(where).length} 個）`);
ok(Array.isArray(SHORTCUTS)&&SHORTCUTS.every(id=>ids.includes(id))&&SHORTCUTS.length<=3&&SHORTCUTS.includes('undo'),'快捷鍵只是少數既有指令的重複入口（≤3，含復原），電腦與手機相同');
ok(COMMANDS.filter(c=>c.danger).every(c=>c.group==='project'||c.group==='edit'),'危險操作（清空、刪除）只在專案或調整');

const html=readFileSync(new URL('../blocks.html',import.meta.url),'utf8');
const header=html.slice(html.indexOf('<header class="appbar">'),html.indexOf('</header>',html.indexOf('<header class="appbar">')));
ok(header.length>0,'找到頂端列');
for(const fn of ['saveFile','openFile','share','startDimension','openBoxMaker','exportVideo','downloadBuildPack'])
  if(new RegExp(`window\\.blocks\\.${fn}\\(`).test(header))assert.fail(`頂端不應直接放 ${fn}，要收進分類選單`);
ok(true,'頂端不再直接放存檔、開啟、分享、量尺、卡榫盒子、匯出');
ok(!/class="example-select"/.test(header),'範例下拉選單移出頂端（改在 專案 → 範例）');
ok(/data-command-menu="project"/.test(header)&&/data-command-menu="help"/.test(header),'頂端有「專案 ▾」「說明 ▾」兩個選單');
ok(/id="modeSwitch"/.test(header)&&/data-command="undo"/.test(header),'頂端保留 設計／組立 切換與 復原');
ok(!/id="mechanismStatus"/.test(header),'狀態訊息不放在頂端（移到畫布狀態列）');
const mobilePanel=html.slice(html.indexOf('<div class="mobile-panel"'),html.indexOf('<nav class="mobile-tabs"'));
ok(!/window\.blocks\.(saveFile|share|startDimension|fitView|toggle3D)\(/.test(mobilePanel),'手機面板不再手寫按鈕，改由同一份指令清單產生');
ok(/data-command-group="view"/.test(mobilePanel)&&/data-command-group="project"/.test(mobilePanel)&&/data-command-group="help"/.test(html),'手機的 視圖／專案／說明 由指令清單填入');
const tabs=html.slice(html.indexOf('<nav class="mobile-tabs"'),html.indexOf('</nav>',html.indexOf('<nav class="mobile-tabs"')));
ok(['新增','調整','視圖','專案'].every(t=>tabs.includes(t)),'手機下方分頁維持 新增／調整／視圖／專案');
console.log(`ui-commands: ${pass} passed`);
