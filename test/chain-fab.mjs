// 鏈輪＋#25 鏈條 S3：買金屬鏈輪 → 系統輸出購買清單、從動輪長孔（張緊），並進製作包。
import assert from 'node:assert/strict';
import * as CD from '../js/core/chain-drive.js';
import {chainBillOfMaterials,chainAxleSlot,chainBuildPackSection} from '../js/blocks/chain-manufacturing.js';
import {placeChainDrive,setSprocketTeeth} from '../js/blocks/chain-tools.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {BLOCK_EXAMPLES} from '../js/blocks/examples.js';
let pass=0;const ok=(c,m)=>{assert.ok(c,m);pass++;console.log('PASS',m);};
const near=(a,b,t)=>Math.abs(a-b)<=t;
const n=normalizeSnapshot(BLOCK_EXAMPLES.find(e=>e.id==='sprocket-chain').snapshot);
const chain=n.comps.find(c=>c.kind==='chain');
const before=JSON.stringify(n.comps);

// ---------- 購買清單 ----------
const bom=chainBillOfMaterials(n.comps,n.params);
const spr=bom.filter(i=>i.kind==='sprocket'),ch=bom.filter(i=>i.kind==='chain');
ok(spr.length===2&&spr.map(i=>i.teeth).sort((a,b)=>a-b).join()==='12,24'&&spr.every(i=>i.standard==='25'&&i.qty===1),'清單：#25 鏈輪 12 齒、24 齒各 1');
ok(ch.length===1&&ch[0].links===chain.links&&ch[0].connectingLinks===1&&ch[0].offsetLinks===0,`清單：#25 鏈條 ${chain.links} 節＋接頭 1，偶數不需半節`);
ok(near(ch[0].lengthMm,chain.links*6.35,1e-9),'鏈條長度＝節數 × 6.35 mm');
ok(spr.every(i=>near(i.pitchDiameterMm,CD.pitchDiameter(i.teeth),1e-6)&&near(i.outsideDiameterMm,CD.outsideDiameter(i.teeth),1e-6)),'鏈輪附節圓與外徑（核對買到的實物）');
ok(bom.every(i=>typeof i.label==='string'&&/[一-鿿]/.test(i.label)),'每項有中文品名');
{
  const odd=structuredClone(n.comps);odd.find(c=>c.kind==='chain').links=41;
  const c2=chainBillOfMaterials(odd,n.params).find(i=>i.kind==='chain');
  ok(c2.offsetLinks===1,'奇數節要列半節（offset link）1 個');
}
{
  const two=placeChainDrive(n.comps,n.params,{x:0,y:-150},{x:90,y:-150});
  ok(two.ok&&chainBillOfMaterials(two.comps,two.params).filter(i=>i.kind==='chain').length===2,'兩組鏈傳動各自列出');
}
// ---------- 從動輪長孔 ----------
{
  const s=chainAxleSlot(n.comps,n.params,chain.id);
  const drv=n.comps.find(c=>c.id===chain.driver),dvn=n.comps.find(c=>c.id===chain.driven);
  ok(s&&s.pointId===dvn.p1.id,'長孔開在從動鏈輪的軸心（主動在馬達上不開長孔）');
  const ux=(dvn.p1.x-drv.p1.x),uy=(dvn.p1.y-drv.p1.y),L=Math.hypot(ux,uy);
  ok(near(s.dir.x,ux/L,1e-9)&&near(s.dir.y,uy/L,1e-9),'長孔方向沿兩輪中心連線');
  ok(near(s.travelMm,6.35/2,1e-9),'可調量 ±½ 節（±3.175 mm）');
  ok(near(s.lengthMm,2*s.travelMm+s.widthMm,1e-9)&&s.widthMm>0,'長孔長度＝2×可調量＋孔寬');
  ok(near(s.center.x,dvn.p1.x,1e-9)&&near(s.center.y,dvn.p1.y,1e-9),'長孔中心在目前（已對齊）的位置');
  const t=setSprocketTeeth(n.comps,n.params,dvn.id,30),s2=chainAxleSlot(t.comps,t.params,chain.id);
  ok(!near(s2.center.x,s.center.x,1e-6)||!near(s2.center.y,s.center.y,1e-6),'改齒數後長孔跟著從動輪移動');
}
// ---------- 製作包 ----------
{
  const html=chainBuildPackSection(n.comps,n.params);
  ok(/鏈條/.test(html)&&new RegExp(`${chain.links}\\s*節`).test(html)&&/12\s*齒/.test(html)&&/24\s*齒/.test(html),'製作包列出鏈條節數與兩個鏈輪齒數');
  ok(/長孔/.test(html)&&/張緊/.test(html),'製作包說明從動輪長孔用來張緊');
  ok(/軸孔|轉接/.test(html),'提醒依買到的鏈輪軸孔配軸或轉接');
  ok(!/<script/i.test(html),'只是一段 HTML，不含程式');
  ok(chainBuildPackSection(n.comps.filter(c=>c.type!=='belt'&&c.type!=='pulley'),n.params)==='','沒有鏈傳動時不輸出');
}
ok(JSON.stringify(n.comps)===before,'不改傳入資料');
console.log(`chain-fab: ${pass} passed`);
