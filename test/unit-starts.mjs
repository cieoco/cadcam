// 每個教學單元都有自己的起始練習檔，不必用上一單元的作品開始（單元可獨立練習）。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {UNIT_STARTS} from '../js/blocks/unit-starts.js';
import {getExample,getExampleLesson,loadUnitStarts} from '../js/blocks/examples.js';
import {startupSize} from '../tools/startup-size.mjs';
import {normalizeSnapshot} from '../js/blocks/schema.js';
let pass=0;const ok=(c,m)=>{assert.ok(c,m);pass++;console.log('PASS',m);};
ok(Array.isArray(UNIT_STARTS)&&UNIT_STARTS.length===12&&UNIT_STARTS.every((u,i)=>u.unit===i+1),'第一～十二單元各一筆起始檔');
ok(new Set(UNIT_STARTS.map(u=>u.example)).size===12,'每個單元的起始檔都不同');
await loadUnitStarts();
ok(!startupSize().paths.some(p=>/unit-start/.test(p)),'起始練習檔資料用到才載入（不在啟動程式）');
for(const u of UNIT_STARTS){
  const ex=getExample(u.example);
  if(!ex)assert.fail(`第 ${u.unit} 單元的起始檔 ${u.example} 不存在`);
  const n=normalizeSnapshot(structuredClone(ex.snapshot));
  if(!n||!Array.isArray(n.comps))assert.fail(`第 ${u.unit} 單元起始檔讀不進來`);
  const meta=getExampleLesson(u.example);
  if(!(meta?.group==='challenge'||meta?.level==='練習'))assert.fail(`第 ${u.unit} 單元起始檔 ${u.example} 應標為練習（不是完成答案）`);
  if(typeof u.title!=='string'||!u.title)assert.fail(`第 ${u.unit} 單元缺標題`);
}
ok(true,'起始檔都存在、讀得進來、標為練習');
const pages=[...new Set(UNIT_STARTS.map(u=>u.page))];
const bad=/(上一課的?(作品|齒輪|檔案)|在上一課|沿用第.(課|單元)作品|先保存上一課|接著用上一|沿用自己的(夾爪|作品)|開啟上一(課|單元))/;
for(const p of pages){
  const html=readFileSync(new URL('../'+p,import.meta.url),'utf8');
  for(const u of UNIT_STARTS.filter(x=>x.page===p)){
    const re=new RegExp(`<a[^>]*data-unit-start="${u.unit}"[^>]*href="blocks\\.html\\?example=${u.example}"|<a[^>]*href="blocks\\.html\\?example=${u.example}"[^>]*data-unit-start="${u.unit}"`);
    if(!re.test(html))assert.fail(`${p} 沒有第 ${u.unit} 單元的「起始練習檔」連結（data-unit-start="${u.unit}" → ${u.example}）`);
  }
  const m=html.match(bad);if(m)assert.fail(`${p} 仍要學生用上一單元的作品開始：「${m[0]}」`);
}
ok(true,'每頁都有各單元的「起始練習檔」連結，且不再要求沿用上一單元作品');
const idx=readFileSync(new URL('../teaching.html',import.meta.url),'utf8');
ok(!/沿用第四課作品/.test(idx),'課程總覽不再寫「沿用第四課作品」');
ok(/起始練習檔/.test(idx),'課程總覽說明每單元都有起始練習檔');
console.log(`unit-starts: ${pass} passed`);
