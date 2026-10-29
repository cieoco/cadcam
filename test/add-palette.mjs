// 常用入口精簡後仍保留所有新增動作；電腦與手機使用同一份清單。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ADD_SECTIONS,COMMANDS} from '../js/blocks/ui-commands.js';
let pass=0;const ok=(c,m)=>{assert.ok(c,m);pass++;console.log('PASS',m);};
ok(JSON.stringify(ADD_SECTIONS.map(s=>s.id))===JSON.stringify(['common','other','modules','plugin']),'常用、其他零件、模組與外掛');
ok(ADD_SECTIONS.map(s=>s.label).join()==='常用零件,其他零件,加入模組,外掛','分類名稱不預設零件一定會動');
ok(ADD_SECTIONS.every(s=>typeof s.hint==='string'&&s.hint.length>0&&s.hint.length<=16),'每個分類有一句短說明');
ok(ADD_SECTIONS.filter(s=>s.primary).map(s=>s.id).join()==='common'&&!ADD_SECTIONS.some(s=>s.open),'常用直接顯示，其餘預設收合');
const add=COMMANDS.filter(c=>c.group==='add');
const where={
  common:["window.blocks.pickLinkTool('bar')","window.blocks.startDrawPolygon","window.blocks.openMotorChoice"],
  other:["window.blocks.addAnchor","window.blocks.pickLinkTool('triangle')","window.blocks.pickLinkTool('polyline')","window.blocks.startDrawRail",
    "window.blocks.pickMotorType('mg995')","window.blocks.pickMotorType('linear')","window.blocks.addFixedSyringe",
    "window.blocks.addGearPair","window.blocks.addRackPinion","window.blocks.startChainDrive"],
  plugin:["window.blocks.openBoxMaker"]};
for(const [sec,runs] of Object.entries(where))for(const r of runs){
  const c=add.find(x=>x.run===r||`${x.run}(${(x.args||[]).map(a=>`'${a}'`).join(',')})`===r);
  if(!c)assert.fail(`缺少新增指令 ${r}`);if(c.section!==sec)assert.fail(`${r} 應在 ${sec}，現在在 ${c.section}`);
}
ok(true,'每個新增指令在正確分類');
ok(add.filter(c=>c.section==='common').map(c=>c.id).join()==='bar,plate,motor','第一層只有連桿、板件、馬達');
ok(add.length===14&&new Set(add.map(c=>c.id)).size===14,'14 個新增動作完整保留、沒有重複入口');
ok(add.every(c=>c.run!=='window.blocks.openPowerMenu'),'不再先點「動力來源」再選');
ok(add.every(c=>ADD_SECTIONS.some(s=>s.id===c.section)),'所有新增指令都有分類');
const html=readFileSync(new URL('../blocks.html',import.meta.url),'utf8');
ok(!/id="linkMenuToggle"/.test(html)&&!/onclick="window\.blocks\.openLinkMenu\(\)"/.test(html),'拿掉「連桿 ▾」下拉選單');
ok(!/<summary>傳動<\/summary><div class="creation-items"><button[^>]*startDrawRail/.test(html),'滑軌不再放在傳動區');
ok(/data-add-sections/.test(html),'新增面板由分類清單產生（電腦左側＝手機新增分頁）');
console.log(`add-palette: ${pass} passed`);
