// 外掛 P1：卡榫盒子改為外掛——程式在 js/plugins/box-maker/，「新增」面板最下方「外掛」區，用到才載入；舊作品照常開啟。
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {startupSize} from '../tools/startup-size.mjs';
import {PLUGINS} from '../js/plugins/registry.js';
let pass=0;const ok=(c,m)=>{assert.ok(c,m);pass++;console.log('PASS',m);};
const box=PLUGINS.find(p=>p.id==='box-maker');
ok(Array.isArray(PLUGINS)&&box&&box.name==='卡榫盒子'&&typeof box.load==='function'&&typeof box.hint==='string','外掛清單有「卡榫盒子」（名稱、說明、載入函式）');
ok(PLUGINS.every(p=>/^[a-z][a-z0-9-]*$/.test(p.id)&&p.name&&typeof p.load==='function'),'外掛清單格式一致，之後可加其他外掛');
for(const f of ['box-config','box-dialog','box-files','box-generator','box-operations'])
  if(existsSync(new URL(`../js/blocks/${f}.js`,import.meta.url))||!existsSync(new URL(`../js/plugins/box-maker/${f}.js`,import.meta.url)))assert.fail(`${f}.js 應移到 js/plugins/box-maker/`);
ok(true,'盒子程式搬到 js/plugins/box-maker/');
const mod=await box.load();
ok(typeof mod.openBoxMaker==='function'||typeof mod.open==='function','載入後可開啟盒子工具');
const s=startupSize();
ok(!s.paths.some(p=>p.startsWith('js/plugins/box-maker/')&&!/contract/.test(p)),'外掛主體不在啟動載入（只允許存讀用的小合約檔）');
ok(s.paths.includes('js/plugins/registry.js')||s.lazyEntries.includes('js/plugins/registry.js'),'外掛清單本身很小，可在啟動時列出');
const html=readFileSync(new URL('../blocks.html',import.meta.url),'utf8');
const trans=html.slice(html.indexOf('<summary>傳動</summary>'),html.indexOf('</details>',html.indexOf('<summary>傳動</summary>')));
ok(!/openBoxMaker|卡榫盒子/.test(trans),'「傳動」區不再放卡榫盒子');
const iPlug=html.indexOf('data-plugin-list'),iMods=html.indexOf('加入模組');
ok(iPlug>0&&iPlug>iMods&&/外掛/.test(html.slice(iPlug-400,iPlug+400)),'「新增」面板最下方（加入模組之後）有「外掛」區');
const ui=readFileSync(new URL('../js/blocks/ui-commands.js',import.meta.url),'utf8');
ok(/plugin/.test(ui),'指令清單標示卡榫盒子為外掛（電腦、手機同一處）');
console.log(`plugin-box: ${pass} passed`);
