// 鏈輪＋#25 鏈條 S2：學生從「新增 → 傳動」放兩個鏈輪＋鏈條，改齒數、對齊整數鏈節。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as CD from '../js/core/chain-drive.js';
import {placeChainDrive,setSprocketTeeth,alignChainLinks} from '../js/blocks/chain-tools.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {sweep,angle,unwrapSum} from './_harness.mjs';
let pass=0;const ok=(c,m)=>{assert.ok(c,m);pass++;console.log('PASS',m);};
const near=(a,b,t)=>Math.abs(a-b)<=t;
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const frame=[{type:'anchor',id:'Anchor1',p1:{id:'F1',type:'fixed',x:-200,y:-100}}];
const params={};
const before=JSON.stringify(frame);

// ---------- 放置 ----------
const r=placeChainDrive(frame,params,{x:0,y:0},{x:83,y:22});
ok(r.ok,`可放置（${r.message||''}）`);
const spr=r.comps.filter(c=>c.type==='pulley'&&c.kind==='sprocket'),chain=r.comps.find(c=>c.type==='belt'&&c.kind==='chain');
ok(spr.length===2&&chain&&chain.standard==='25','新增兩個鏈輪與一條 #25 鏈條');
const A=spr.find(s=>s.id===chain.driver),B=spr.find(s=>s.id===chain.driven);
ok(A.teeth===12&&B.teeth===24,'預設 12 齒帶 24 齒');
ok(A.p1.type==='motor'&&A.p1.physicalMotor,'主動鏈輪預設裝在馬達上（第一點）');
ok(B.p1.type==='fixed','從動鏈輪中心是固定軸');
const C=dist(A.p1,B.p1),chk=CD.checkChainDrive({center:C,teeth1:12,teeth2:24});
ok(chk.ok&&chain.links===chk.links&&chain.links%2===0,`放下就對齊偶數整數鏈節（${chain.links} 節）`);
ok(near(Math.atan2(B.p1.y,B.p1.x),Math.atan2(22,83),1e-9),'只沿兩點連線方向對齊');
ok(spr.every(s=>near(r.params[s.radiusParam],CD.pitchDiameter(s.teeth)/2,1e-9)),'半徑參數＝節圓半徑');
ok(new Set(r.comps.map(c=>c.id)).size===r.comps.length&&r.comps.slice(0,frame.length).every((c,i)=>c.id===frame[i].id),'編號不重複，原零件保留在前');
ok(JSON.stringify(frame)===before,'不改傳入資料');
ok(normalizeSnapshot({kind:'blocks',v:1,comps:r.comps,params:r.params}).comps.length===r.comps.length,'結果可存檔讀回');
{const s=sweep(r.comps,r.params,[A.p2.id,B.p2.id]);
 const t1=unwrapSum(s.frames.map(f=>angle(f.points[A.p2.id],f.points[A.p1.id]))),t2=unwrapSum(s.frames.map(f=>angle(f.points[B.p2.id],f.points[B.p1.id])));
 ok(s.allValid&&near(t2/t1,0.5,0.0005),'放好就能轉：同向、速比 1/2');}
ok(!placeChainDrive(frame,params,{x:0,y:0},{x:10,y:0}).ok,'兩點太近（鏈輪會相碰）要拒絕');
ok(/近|碰|距離/.test(placeChainDrive(frame,params,{x:0,y:0},{x:10,y:0}).message||''),'拒絕時說明原因');

// ---------- 改齒數 ----------
{
  const t=setSprocketTeeth(r.comps,r.params,B.id,30);
  ok(t.ok,'可改從動鏈輪齒數');
  const b2=t.comps.find(c=>c.id===B.id),a2=t.comps.find(c=>c.id===A.id),ch=t.comps.find(c=>c.id===chain.id);
  ok(b2.teeth===30&&near(t.params[b2.radiusParam],CD.pitchDiameter(30)/2,1e-9),'齒數與節圓半徑一起更新');
  const k=CD.checkChainDrive({center:dist(a2.p1,b2.p1),teeth1:12,teeth2:30});
  ok(k.ok&&ch.links===k.links,`改齒數後自動重新對齊偶數鏈節（${ch.links} 節）`);
  ok(near(a2.p1.x,A.p1.x,1e-9)&&near(a2.p1.y,A.p1.y,1e-9),'主動輪（馬達）不移動，只移從動輪');
  ok(!setSprocketTeeth(r.comps,r.params,B.id,41).ok&&!setSprocketTeeth(r.comps,r.params,B.id,8).ok,'超出 9～40 齒拒絕');
  ok(r.comps.find(c=>c.id===B.id).teeth===24,'不改傳入資料');
}
// ---------- 對齊 ----------
{
  const moved=structuredClone(r.comps);const b=moved.find(c=>c.id===B.id);b.p1={...b.p1,x:b.p1.x+3.1,y:b.p1.y};
  const pre=CD.checkChainDrive({center:dist(moved.find(c=>c.id===A.id).p1,b.p1),teeth1:12,teeth2:24});
  ok(!pre.ok,'拖動從動輪後會變成非整數鏈節');
  const a=alignChainLinks(moved,r.params,chain.id);
  const A3=a.comps.find(c=>c.id===A.id),B3=a.comps.find(c=>c.id===B.id);
  ok(a.ok&&CD.checkChainDrive({center:dist(A3.p1,B3.p1),teeth1:12,teeth2:24}).ok,'「對齊整數鏈節」修好中心距');
}
// ---------- 介面 ----------
{
  const html=readFileSync(new URL('../blocks.html',import.meta.url),'utf8');
  ok(/startChainDrive\(\)/.test(html)&&/鏈輪/.test(html),'新增 → 傳動 有「鏈輪＋鏈條」');
  const app=readFileSync(new URL('../js/blocks/app.js',import.meta.url),'utf8');
  ok(/window\.blocks\.startChainDrive\s*=/.test(app)||/startChainDrive\s*[:,]/.test(app),'window.blocks.startChainDrive 可呼叫');
  ok(/alignChainLinks/.test(app)||/alignChainLinks/.test(readFileSync(new URL('../js/blocks/chain-tools.js',import.meta.url),'utf8')),'面板提供「對齊整數鏈節」');
}
console.log(`chain-ui: ${pass} passed`);
