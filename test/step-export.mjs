// STEP 匯出：板件（2D 外形＋厚度）寫成 B-rep 實體（平面＋圓柱孔），依目前姿態擺放，零件名稱保留。專案 → 匯出 STEP。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stepFromParts,stepFromWork,decodeStepString} from '../js/blocks/step-export.js';
import {BLOCK_EXAMPLES} from '../js/blocks/examples.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {COMMANDS} from '../js/blocks/ui-commands.js';
import {startupSize} from '../tools/startup-size.mjs';
let pass=0;const ok=(c,m)=>{assert.ok(c,m);pass++;console.log('PASS',m);};
const near=(a,b,t=1e-6)=>Math.abs(a-b)<=t;
const I=[1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
const rect=(w,h)=>[{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}];
function parse(text){
  const ents=new Map();
  const body=text.slice(text.indexOf('DATA;')+5,text.lastIndexOf('ENDSEC;'));
  for(const m of body.matchAll(/#(\d+)\s*=\s*([\s\S]*?);\s*(?=#\d+\s*=|$)/g))ents.set(+m[1],m[2].trim());
  return ents;
}
const typeCount=(ents,t)=>[...ents.values()].filter(v=>v.startsWith(t+'(')).length;

// ---------- 單片：100×20×3 兩個 M3 孔 ----------
const plate={name:'連桿 Link1',outline:rect(100,20),holes:[{x:10,y:10,r:1.6},{x:90,y:10,r:1.6}],cutouts:[],thicknessMm:3,matrix:I};
const t1=stepFromParts([plate],{name:'測試'});
ok(/^ISO-10303-21;/.test(t1)&&/END-ISO-10303-21;\s*$/.test(t1),'STEP 檔頭與結尾');
ok(/FILE_SCHEMA\s*\(\s*\(\s*'(AUTOMOTIVE_DESIGN|AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF)/.test(t1),'使用 AP214 或 AP242 schema');
ok(/SI_UNIT\s*\(\s*\.MILLI\.\s*,\s*\.METRE\.\s*\)/.test(t1),'長度單位 mm');
ok(!/[^\x00-\x7f]/.test(t1),'檔案只含 ASCII（中文名稱用 \\X2\\ 編碼）');
const e1=parse(t1);
const refs=[...e1.values()].flatMap(v=>[...v.matchAll(/#(\d+)/g)].map(m=>+m[1]));
ok(refs.every(r=>e1.has(r)),`所有 #參照都存在（${e1.size} 個實體）`);
ok(typeCount(e1,'MANIFOLD_SOLID_BREP')===1&&typeCount(e1,'CLOSED_SHELL')===1,'一片板＝一個封閉實體');
ok(typeCount(e1,'ADVANCED_FACE')===8&&typeCount(e1,'PLANE')===6&&typeCount(e1,'CYLINDRICAL_SURFACE')===2,'面：上下 2＋側 4＋孔 2（真正的圓柱面）');
ok([...e1.values()].filter(v=>v.startsWith('CYLINDRICAL_SURFACE(')).every(v=>/,\s*1\.6\d*\s*\)$/.test(v)),'孔半徑 1.6 mm');
{const V=typeCount(e1,'VERTEX_POINT'),E=typeCount(e1,'EDGE_CURVE'),F=typeCount(e1,'ADVANCED_FACE'),L=typeCount(e1,'FACE_OUTER_BOUND')+typeCount(e1,'FACE_BOUND');
 ok(V-E+F-(L-F)===2*(1-2),`拓樸正確（Euler–Poincaré：V ${V} − E ${E} + F ${F} − (L ${L} − F) = 2(1 − 2 孔)）`);}
{const pts=[...e1.values()].filter(v=>v.startsWith('CARTESIAN_POINT(')).map(v=>v.match(/\(([^()]*)\)\s*\)$/)[1].split(',').map(Number)).filter(p=>p.length===3);
 const xs=pts.map(p=>p[0]),zs=pts.map(p=>p[2]);
 ok(near(Math.min(...xs),0)&&near(Math.max(...xs),100)&&near(Math.min(...zs),0)&&near(Math.max(...zs),3),'座標範圍 x 0–100、z 0–3（板厚）');}
ok(decodeStepString([...e1.values()].find(v=>v.startsWith('PRODUCT(')).match(/PRODUCT\('([^']*)'/)[1])==='連桿 Link1','零件名稱（中文）可還原');
ok(stepFromParts([plate],{name:'測試'})===t1,'同樣輸入產生相同檔案（可比對）');

// ---------- 凹形外形＋內部挖空、姿態 ----------
{
  const L=[{x:0,y:0},{x:60,y:0},{x:60,y:20},{x:20,y:20},{x:20,y:50},{x:0,y:50}];
  const rot=[0,-1,0,0, 1,0,0,0, 0,0,1,0, 0,0,0,1]; // 繞 z 轉 90°，且平移 (5,7,11)
  rot[3]=5;rot[7]=7;rot[11]=11;
  const t=stepFromParts([{name:'L板',outline:L,holes:[],cutouts:[rect(10,10).map(p=>({x:p.x+5,y:p.y+5}))],thicknessMm:2,matrix:rot},plate],{name:'兩片'});
  const e=parse(t);
  ok(typeCount(e,'MANIFOLD_SOLID_BREP')===2&&typeCount(e,'PRODUCT')>=2,'兩片＝兩個實體、各自有零件名稱');
  const lPts=[...e.values()].filter(v=>v.startsWith('CARTESIAN_POINT(')).map(v=>v.match(/\(([^()]*)\)\s*\)$/)[1].split(',').map(Number)).filter(p=>p.length===3);
  ok(lPts.some(p=>near(p[0],5-50)&&near(p[1],7)&&near(p[2],11))||/AXIS2_PLACEMENT_3D/.test(t),'依姿態矩陣擺放（座標已轉換，或以組立擺放）');
  ok(typeCount(e,'FACE_BOUND')>=2,'內部挖空成為內迴圈');
}
ok((()=>{try{stepFromParts([{...plate,outline:[{x:0,y:0},{x:1,y:0}]}]);return false;}catch(e){return /外形/.test(e.message);}})(),'不合理外形丟出中文錯誤');

// ---------- 整個作品 ----------
{
  const n=normalizeSnapshot(BLOCK_EXAMPLES.find(e=>e.id==='fourbar-crank-rocker').snapshot);
  const r=await stepFromWork({...n,kind:'blocks',v:1});
  ok(r.ok&&r.parts.length>=3,`四連桿範例匯出 ${r.parts?.length} 片板`);
  const e=parse(r.text);
  ok(typeCount(e,'MANIFOLD_SOLID_BREP')===r.parts.length,'每片板一個實體');
  ok(Array.isArray(r.skipped)&&r.skipped.every(s=>typeof s==='string'),'沒輸出的東西（馬達等）列出名稱');
}
// ---------- 介面：專案 → 匯出 STEP，用到才載入 ----------
{
  const c=COMMANDS.find(x=>x.id==='exportStep');
  ok(c&&c.group==='project'&&/STEP/.test(c.label),'專案分類有「匯出 STEP」');
  ok(!startupSize().paths.includes('js/blocks/step-export.js'),'STEP 程式不在啟動載入');
}
console.log(`step-export: ${pass} passed`);
