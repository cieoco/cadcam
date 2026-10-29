// 液壓第一期 P1-3（PLAN-HYDRAULIC-ARM C1）：從動力來源選單放「管夾固定針筒」，學生從空白建出 H01 同款機構。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hydraulicSnapshot} from '../js/blocks/hydraulic-example.js';
import {placeFixedSyringe} from '../js/blocks/syringe-placement.js';
import * as Op from '../js/blocks/syringe-operations.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
let pass=0;const ok=(cond,msg)=>{assert.ok(cond,msg);pass++;console.log('PASS',msg);};
const near=(a,b,t)=>Math.abs(a-b)<=t;
const h01=normalizeSnapshot(hydraulicSnapshot),orig=h01.comps.find(c=>c.type==='syringe');
const ref=Op.scanSyringe(h01.comps,h01.params,orig.id,0.5).samples.map(s=>s.angle);
const blank=h01.comps.filter(c=>c.type!=='syringe'),params={...h01.params};
const pts=Object.fromEntries(blank.flatMap(c=>[c.p1,c.p2,c.p3].filter(Boolean)).map(p=>[p.id,{x:p.x,y:p.y}]));
const before=JSON.stringify(blank);
const place=(comps,a,b,opt)=>placeFixedSyringe(comps,params,pts,a,b,opt);

// ---------- 從空白建出 H01 ----------
{
  const r=place(blank,{componentId:'H1Frame',u:0,v:0},{componentId:'H1Coupler',u:0,v:0});
  ok(r.ok,`可放置（${r.message||''}）`);
  const s=r.syringe;
  ok(s.type==='syringe'&&s.mountMode==='fixed-axis','建立管夾固定（fixed-axis）針筒');
  ok(s.spec.capacityMl===10&&s.spec.stroke===20,'10 mL、20 mm 教學區間');
  ok(near(s.axisDeg,0,0.01),`軸向取 A→B 方向（${s.axisDeg}）`);
  ok(s.extension===10&&near(s.spec.lmin,70,0.01),`預設放在行程中點：伸出 10 mm，最短孔距 ${s.spec.lmin}`);
  ok(s.outputId==='H1Arm','自動找出短連桿另一端、有固定支點的擺臂當輸出');
  ok(!blank.some(c=>c.id===s.id),`編號不與既有零件重複（${s.id}）`);
  const scan=Op.scanSyringe([...blank,s],params,s.id,0.5);
  ok(scan.ok&&scan.samples.length===41,'放好就能掃描 0–20 mm 全行程');
  ok(scan.samples.every((x,i)=>near(x.angle,ref[i],0.01)),'臂角與 H01 範例逐點相同（同款機構）');
  ok(JSON.stringify(blank)===before,'不改傳入資料');
}
// ---------- 推桿接短連桿的另一端（p2）也可以 ----------
{
  const rev=structuredClone(blank),cp=rev.find(c=>c.id==='H1Coupler');[cp.p1,cp.p2]=[cp.p2,cp.p1];
  const r=place(rev,{componentId:'H1Frame',u:0,v:0},{componentId:'H1Coupler',u:params.H1Coupler,v:0});
  ok(r.ok&&r.syringe.outputId==='H1Arm',`推桿接在連桿 p2 端也能放置（${r.message||''}）`);
  const scan=Op.scanSyringe([...rev,r.syringe],params,r.syringe.id,0.5);
  ok(scan.ok&&scan.samples.every((x,i)=>near(x.angle,ref[i],0.01)),'p2 端版本與 H01 逐點相同');
}
// ---------- 拒絕不合理的放法，說明原因 ----------
{
  const bad=(a,b,re,msg)=>{const r=place(blank,a,b);ok(!r.ok&&re.test(r.message||''),`${msg}（${r.message}）`);};
  bad({componentId:'H1Arm',u:0,v:0},{componentId:'H1Coupler',u:0,v:0},/固定/,'筒身要夾在固定機架上');
  bad({componentId:'H1Frame',u:0,v:0},{componentId:'H1Frame',u:50,v:0},/活動|同一/,'推桿不能接在機架上');
  bad({componentId:'H1Frame',u:0,v:0},{componentId:'H1Coupler',u:40,v:0},/端|孔/,'推桿要接在連桿的端孔');
  bad({componentId:'H1Frame',u:0,v:0},{componentId:'H1Arm',u:80,v:0},/短連桿|支點/,'推桿直接接擺臂（沒有短連桿）要拒絕並說明');
  const close=structuredClone(blank);
  const r=placeFixedSyringe(close,params,{...pts,H1A:{x:-35,y:-60}},{componentId:'H1Frame',u:0,v:0},{componentId:'H1Coupler',u:0,v:0});
  ok(!r.ok&&/太近|距離/.test(r.message||''),`管夾離推桿接點太近要拒絕（${r.message}）`);
}
// ---------- 選單與教材 ----------
{
  const html=readFileSync(new URL('../blocks.html',import.meta.url),'utf8');
  const {COMMANDS}=await import('../js/blocks/ui-commands.js');   // 新增面板由指令清單產生
  ok(COMMANDS.some(c=>c.run==='window.blocks.addFixedSyringe'&&c.section==='other'&&/管夾固定/.test(c.tip)),'新增 → 其他零件 有「管夾固定」針筒');
  ok(!/onclick="window\.blocks\.addSyringe\(\)"/.test(html),'新增清單不提供沒有管夾的兩端鉸接針筒');
  const app=readFileSync(new URL('../js/blocks/app.js',import.meta.url),'utf8');
  ok(/window\.blocks\.addFixedSyringe\s*=/.test(app),'window.blocks.addFixedSyringe 可呼叫');
  const t=readFileSync(new URL('../teaching-hydraulic.html',import.meta.url),'utf8');
  const h1=t.slice(t.indexOf('第九單元'),t.indexOf('第十單元'));
  ok(/從空白/.test(h1)&&/管夾固定/.test(h1),'H01 有「從空白用選單放管夾固定針筒」的練習');
}
console.log(`hydraulic-p1-3: ${pass} passed`);
