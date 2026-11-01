// 獨立單元「針筒怎麼控制機構」：先學知識（不用電腦）→ 再用模擬由淺入深練習 → 檢核。頁面上的模擬數字必須與系統算出的一致。
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {getExample,loadUnitStarts} from '../js/blocks/examples.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {SYRINGE_SIM_FACTS} from '../js/blocks/syringe-unit-facts.js';
let pass=0;const ok=(c,m)=>{assert.ok(c,m);pass++;console.log('PASS',m);};
const html=readFileSync(new URL('../teaching-syringe.html',import.meta.url),'utf8');
const text=html.replace(/<[^>]+>/g,'');
ok(/<title>[^<]*針筒/.test(html),'獨立頁面 teaching-syringe.html');
const iA=html.indexOf('data-part="knowledge"'),iB=html.indexOf('data-part="simulation"'),iC=html.indexOf('data-part="check"');
ok(iA>0&&iB>iA&&iC>iB,'三段依序：知識 → 模擬 → 檢核');
const A=html.slice(iA,iB),B=html.slice(iB,iC),C=html.slice(iC);
for(const [k,m] of [[/不可壓縮|不能壓縮/,'液體不能壓縮'],[/帕斯卡/,'帕斯卡原理'],[/面積/,'粗細（面積）與力、行程的交換'],[/主動/,'主動／從動針筒'],[/曲柄滑塊/,'直線變轉動＝曲柄滑塊反過來'],[/力臂/,'力臂決定每推 1 mm 轉多少'],[/死點/,'死點'],[/氣泡/,'推比拉可靠（氣泡）'],[/固定/,'固定安裝'],[/(可轉|鉸接)/,'可轉（鉸接）安裝']])
  if(!k.test(A.replace(/<[^>]+>/g,'')))assert.fail(`知識段缺少：${m}`);
ok(true,'知識段涵蓋：不可壓縮、帕斯卡、面積、主從、曲柄滑塊、力臂、死點、氣泡、固定與可轉');
ok((A.match(/<svg[\s>]/g)||[]).length>=4,'知識段至少 4 張內嵌示意圖（SVG，不靠截圖）');
ok(/[0-9]+\s*mm²|面積比|倍/.test(A.replace(/<[^>]+>/g,''))&&/(算算看|試算|計算)/.test(A.replace(/<[^>]+>/g,'')),'有一題主從針筒的計算練習');
const steps=[...B.matchAll(/data-sim-step="(\d+)"/g)].map(m=>+m[1]);
ok(steps.length>=5&&steps.every((n,i)=>n===i+1),`模擬分 ${steps.length} 步，由淺入深依序編號`);
await loadUnitStarts?.();
const links=[...B.matchAll(/data-sim-start="(\d+)"[^>]*href="blocks\.html\?example=([a-z0-9-]+)"|href="blocks\.html\?example=([a-z0-9-]+)"[^>]*data-sim-start="(\d+)"/g)].map(m=>({step:+(m[1]||m[4]),id:m[2]||m[3]}));
ok(steps.every(n=>links.some(l=>l.step===n)),'每一步都有自己的起始檔連結（可獨立練習）');
for(const l of links){const ex=getExample(l.id);if(!ex)assert.fail(`第 ${l.step} 步的起始檔 ${l.id} 不存在`);if(!normalizeSnapshot(structuredClone(ex.snapshot)))assert.fail(`${l.id} 讀不進來`);}
ok(true,'起始檔都存在且讀得進來');
const ids=links.map(l=>l.id).join(' ');
ok(/hydraulic-h0[7]/.test(ids)&&/hydraulic-h08/.test(ids),'比較固定安裝（H07）與可轉安裝（H08）');
ok(/量尺/.test(B.replace(/<[^>]+>/g,''))&&/每推 ?1 ?mm/.test(B.replace(/<[^>]+>/g,'')),'模擬時用量尺與「每推 1 mm」讀數');
// ---------- 頁面上的模擬數字＝系統算出的 ----------
const tagged=[...html.matchAll(/data-sim="([a-z0-9-]+)"[^>]*>\s*(-?[0-9.]+)/g)].map(m=>({key:m[1],val:+m[2]}));
ok(tagged.length>=4,`頁面標註的模擬數字 ${tagged.length} 個（data-sim）`);
for(const t of tagged){
  const f=SYRINGE_SIM_FACTS[t.key];if(typeof f!=='function')assert.fail(`沒有計算 ${t.key} 的函式`);
  const v=await f();if(Math.abs(v-t.val)>0.15)assert.fail(`${t.key}：頁面寫 ${t.val}，系統算出 ${v.toFixed(2)}`);
}
ok(true,'頁面上的每個模擬數字都由系統重新算過且一致（±0.15）');
for(const k of ['h01-swing-deg','h07-swing-deg','h03-gap-min-mm','h03-gap-max-mm'])if(!tagged.some(t=>t.key===k))assert.fail(`頁面應標註 ${k}`);
ok(true,'至少包含：H01 擺角、H07 轉角、H03 夾口最小／最大');
// ---------- 檢核 ----------
const qs=(C.match(/data-quiz/g)||[]).length;
ok(qs>=5&&(C.match(/<details/g)||[]).length>=qs,`檢核有 ${qs} 題，每題可展開看答案`);
ok(/過關/.test(C.replace(/<[^>]+>/g,''))&&/MP4/i.test(C),'實作過關條件（含 MP4）');
// ---------- 入口與限制 ----------
const idx=readFileSync(new URL('../teaching.html',import.meta.url),'utf8');
ok(/href="teaching-syringe\.html"/.test(idx),'課程總覽有連到這個獨立單元');
ok(/(未實測|未校正|示範尺寸|幾何)/.test(text),'清楚標示模擬是幾何結果、尺寸未實測');
for(const src of [...html.matchAll(/src="([^"]+\.(png|webp|jpg))"/g)].map(m=>m[1]))if(!existsSync(new URL('../'+src,import.meta.url)))assert.fail(`圖片不存在：${src}`);
ok(true,'引用的圖片都存在');
console.log(`syringe-unit: ${pass} passed`);
