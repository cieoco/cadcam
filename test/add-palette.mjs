// 新增面板依工作順序分類：固定 → 構件 → 導引 → 動力 → 傳動 → 現成組件 → 外掛（電腦與手機同一份清單）。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ADD_SECTIONS,COMMANDS} from '../js/blocks/ui-commands.js';
let pass=0;const ok=(c,m)=>{assert.ok(c,m);pass++;console.log('PASS',m);};
ok(JSON.stringify(ADD_SECTIONS.map(s=>s.id))===JSON.stringify(['ground','member','guide','power','transmission','modules','plugin']),'七個分類依工作順序排列');
ok(ADD_SECTIONS.map(s=>s.label).join()==='固定,構件,導引,動力,傳動,現成組件,外掛','分類名稱');
ok(ADD_SECTIONS.every(s=>typeof s.hint==='string'&&s.hint.length>0&&s.hint.length<=16),'每個分類有一句短說明');
ok(ADD_SECTIONS.filter(s=>s.open).map(s=>s.id).join()==='ground,member','預設只展開「固定」「構件」');
const add=COMMANDS.filter(c=>c.group==='add');
const where={
  ground:["window.blocks.addAnchor"],
  member:["window.blocks.pickLinkTool('bar')","window.blocks.pickLinkTool('triangle')","window.blocks.pickLinkTool('polyline')","window.blocks.startDrawPolygon"],
  guide:["window.blocks.startDrawRail"],
  power:["window.blocks.addFixedSyringe"],
  transmission:["window.blocks.addGearPair","window.blocks.addRackPinion","window.blocks.startChainDrive"],
  plugin:["window.blocks.openBoxMaker"]};
for(const [sec,runs] of Object.entries(where))for(const r of runs){
  const c=add.find(x=>x.run===r||`${x.run}(${(x.args||[]).map(a=>`'${a}'`).join(',')})`===r);
  if(!c)assert.fail(`缺少新增指令 ${r}`);if(c.section!==sec)assert.fail(`${r} 應在 ${sec}，現在在 ${c.section}`);
}
ok(true,'每個新增指令在正確分類');
const power=add.filter(c=>c.section==='power');
ok(power.length>=3&&['馬達','舵機','針筒'].every(k=>power.some(c=>c.label.includes(k))),`動力分成獨立按鈕：馬達、舵機、液壓針筒（共 ${power.length}）`);
ok(power.every(c=>c.run!=='window.blocks.openPowerMenu'),'不再先點「動力來源」再選');
ok(add.filter(c=>c.section==='member').length===4,'構件四顆並排：連桿、三角板、折線桿、板件');
ok(add.every(c=>ADD_SECTIONS.some(s=>s.id===c.section)),'所有新增指令都有分類');
const html=readFileSync(new URL('../blocks.html',import.meta.url),'utf8');
ok(!/id="linkMenuToggle"/.test(html)&&!/onclick="window\.blocks\.openLinkMenu\(\)"/.test(html),'拿掉「連桿 ▾」下拉選單');
ok(!/<summary>傳動<\/summary><div class="creation-items"><button[^>]*startDrawRail/.test(html),'滑軌不再放在傳動區');
ok(/data-add-sections/.test(html),'新增面板由分類清單產生（電腦左側＝手機新增分頁）');
console.log(`add-palette: ${pass} passed`);
