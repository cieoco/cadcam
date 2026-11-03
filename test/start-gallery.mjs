// 參考「電路板外殼生成器」：第一次開啟時顯示「你的機構，從這裡開始」功能範例卡（有縮圖），之後可從「說明 → 功能範例」再開。
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {START_CARDS,shouldShowStartGallery} from '../js/blocks/start-gallery.js';
import {getExample,loadUnitStarts} from '../js/blocks/examples.js';
import {COMMANDS} from '../js/blocks/ui-commands.js';
import {startupSize} from '../tools/startup-size.mjs';
let pass=0;const ok=(c,m)=>{assert.ok(c,m);pass++;console.log('PASS',m);};
await loadUnitStarts();
ok(Array.isArray(START_CARDS)&&START_CARDS.length>=6&&START_CARDS.length<=8,`${START_CARDS.length} 張功能範例卡`);
ok(START_CARDS.every((c,i)=>c.n===i+1&&c.title&&c.title.length<=10&&c.text&&c.text.length<=44),'每張卡有編號、短標題（≤10 字）與一兩句說明（≤44 字）');
ok(START_CARDS.every(c=>existsSync(new URL('../'+c.image,import.meta.url))&&/\.(webp|png|jpg)$/.test(c.image)),'每張卡都有縮圖檔');
ok(START_CARDS.every(c=>(c.example&&getExample(c.example))||(c.command&&COMMANDS.some(x=>x.id===c.command))),'每張卡都開到真實範例或指令');
const kinds=START_CARDS.map(c=>c.example||c.command).join(' ');
for(const [re,m] of [[/empty|unit1|first/,'從空白開始'],[/fourbar|wiper/,'連桿'],[/gear|sprocket|chain/,'傳動'],[/hydraulic|syringe/,'液壓針筒'],[/assembly/,'組立'],[/boxMaker/,'卡榫盒子（外掛）']])
  if(!re.test(kinds))assert.fail(`功能範例缺少：${m}`);
ok(true,'涵蓋：從空白、連桿、傳動、液壓、組立、卡榫盒子');
ok(shouldShowStartGallery({seen:false,urlExample:null,hasWork:false})===true,'第一次開、空白：顯示');
ok(shouldShowStartGallery({seen:true,urlExample:null,hasWork:false})===false,'看過就不再自動顯示');
ok(shouldShowStartGallery({seen:false,urlExample:'gear-pair',hasWork:false})===false,'從連結開範例時不擋');
ok(shouldShowStartGallery({seen:false,urlExample:null,hasWork:true})===false,'已有作品（自動存檔）時不擋');
const c=COMMANDS.find(x=>x.id==='startGallery');
ok(c&&c.group==='help'&&/功能範例/.test(c.label),'「說明 → 功能範例」可再打開');
ok(!startupSize().paths.includes('js/blocks/start-gallery.js'),'功能範例用到才載入');
console.log(`start-gallery: ${pass} passed`);
