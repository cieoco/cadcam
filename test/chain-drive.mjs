// 鏈輪＋#25 滾子鏈條 S1（docs/PLAN-SPROCKET-CHAIN-2026-10-23.md）：規格、公式、資料、求解、範例。
// 決定：買金屬鏈輪；齒數 9～40；放置時自動對齊整數（偶數）鏈節，製作時從動輪軸孔做長孔；第一版兩輪一條鏈。
import assert from 'node:assert/strict';
import * as CD from '../js/core/chain-drive.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {BLOCK_EXAMPLES} from '../js/blocks/examples.js';
import {sweep,angle,unwrapSum} from './_harness.mjs';
let pass=0;const ok=(c,m)=>{assert.ok(c,m);pass++;console.log('PASS',m);};
const near=(a,b,t)=>Math.abs(a-b)<=t;

// ---------- 規格與公式 ----------
const S=CD.CHAIN_25;
ok(S.pitch===6.35&&S.rollerDiameter===3.3&&S.innerWidth===3.18&&S.pinDiameter===2.31&&S.plateHeight===5.84&&S.plateThickness===0.75&&S.width===7.6,'#25 規格（RS25：節距 6.35、滾子 3.30、內寬 3.18…）');
ok(CD.TEETH_MIN===9&&CD.TEETH_MAX===40,'齒數範圍 9～40');
ok(near(CD.pitchDiameter(12),6.35/Math.sin(Math.PI/12),1e-9)&&near(CD.pitchDiameter(12),24.534,0.001),'節圓直徑 D = p / sin(180°/N)（12 齒 ≈ 24.53 mm）');
ok(near(CD.outsideDiameter(12),6.35*(0.6+1/Math.tan(Math.PI/12)),1e-9),'外徑 Do = p(0.6 + cot(180°/N))');
const L=CD.chainLinks(120,12,24);
ok(near(L,2*120/6.35+18+6.35*144/(4*Math.PI**2*120),1e-9),'鏈長（節數）公式');
for(const [n1,n2,links] of [[12,24,40],[9,40,60],[15,15,30],[20,10,36]]){
  const C=CD.centerForLinks(links,n1,n2);
  if(!(near(CD.chainLinks(C,n1,n2),links,1e-9)))assert.fail(`centerForLinks(${links},${n1},${n2}) 反算不回 ${links}`);
}
ok(true,'centerForLinks 是 chainLinks 的反函數（四組）');
ok(near(CD.wrapAngle(100,12,24),180-2*Math.asin((CD.pitchDiameter(24)-CD.pitchDiameter(12))/(2*100))*180/Math.PI,1e-9),'小鏈輪包角');

// ---------- 檢查 ----------
{
  const good=CD.checkChainDrive({center:CD.centerForLinks(40,12,24),teeth1:12,teeth2:24});
  ok(good.ok&&good.links===40&&near(good.deviationMm,0,0.01)&&good.issues.length===0,'整數偶數鏈節：通過、鏈節 40、偏差 0');
  const off=CD.checkChainDrive({center:CD.centerForLinks(40,12,24)+1.5,teeth1:12,teeth2:24});
  ok(!off.ok&&off.issues.some(i=>i.code==='not-integer')&&near(off.deviationMm,1.5,0.05),`中心距偏 1.5 mm：報出非整數鏈節與偏差（${off.deviationMm?.toFixed(2)}）`);
  ok(Number.isInteger(off.links)&&off.links%2===0,'仍給出最接近的偶數鏈節');
  const odd=CD.checkChainDrive({center:CD.centerForLinks(41,12,24),teeth1:12,teeth2:24});
  ok(odd.issues.some(i=>i.code==='odd-links'),'奇數鏈節要提醒（需半節）');
  ok(CD.checkChainDrive({center:120,teeth1:8,teeth2:24}).issues.some(i=>i.code==='teeth-range'),'齒數 < 9 要提醒');
  ok(CD.checkChainDrive({center:120,teeth1:12,teeth2:41}).issues.some(i=>i.code==='teeth-range'),'齒數 > 40 要提醒');
  ok(CD.checkChainDrive({center:45,teeth1:9,teeth2:40}).issues.some(i=>i.code==='wrap'),'小鏈輪包角 < 120° 要提醒');
  ok(CD.checkChainDrive({center:40,teeth1:20,teeth2:24}).issues.some(i=>i.code==='interference'),'兩輪太近（外徑相碰）要提醒');
  ok(good.issues.every(i=>typeof i.message==='string')&&off.issues.every(i=>/[一-鿿]/.test(i.message)),'每個問題有中文說明');
}
// ---------- 對齊整數鏈節 ----------
{
  const a={x:0,y:0},b={x:117,y:40};
  const r=CD.snapCenterToLinks(a,b,12,24);
  const C=Math.hypot(r.center.x-a.x,r.center.y-a.y);
  ok(Number.isInteger(r.links)&&r.links%2===0&&near(CD.chainLinks(C,12,24),r.links,1e-6),`對齊後鏈節為偶數整數（${r.links}）`);
  ok(near(Math.atan2(r.center.y,r.center.x),Math.atan2(40,117),1e-9),'只沿兩輪連線方向移動從動輪');
  ok(Math.abs(C-Math.hypot(117,40))<=CD.centerForLinks(r.links+2,12,24)-CD.centerForLinks(r.links,12,24),'移動量不超過兩節對應的距離');
}

// ---------- 資料與求解 ----------
const ex=BLOCK_EXAMPLES.find(e=>e.id==='sprocket-chain');
ok(ex,'範例 sprocket-chain');
const n=normalizeSnapshot(ex.snapshot);
const spr=n.comps.filter(c=>c.type==='pulley'&&c.kind==='sprocket'),chain=n.comps.find(c=>c.type==='belt'&&c.kind==='chain');
ok(spr.length===2&&chain&&chain.standard==='25','兩個鏈輪（pulley kind sprocket）＋一條 #25 鏈條（belt kind chain）');
const drv=spr.find(s=>s.id===chain.driver),dvn=spr.find(s=>s.id===chain.driven);
ok(drv.teeth===12&&dvn.teeth===24,'範例 12 齒帶 24 齒');
ok(spr.every(s=>near(n.params[s.radiusParam],CD.pitchDiameter(s.teeth)/2,1e-9)),'鏈輪半徑＝節圓半徑（由齒數算，不四捨五入）');
const C0=Math.hypot(dvn.p1.x-drv.p1.x,dvn.p1.y-drv.p1.y);
ok(CD.checkChainDrive({center:C0,teeth1:drv.teeth,teeth2:dvn.teeth}).ok&&chain.links===CD.checkChainDrive({center:C0,teeth1:12,teeth2:24}).links,`範例中心距剛好整數偶數鏈節（${chain.links} 節）`);
ok(String(drv.p1.physicalMotor||'')!==''&&drv.p1.type==='motor','主動鏈輪裝在馬達上');
const crank=n.comps.find(c=>c.type==='bar'&&(c.p1.id===dvn.p2.id||c.p2.id===dvn.p2.id));
ok(crank,'從動鏈輪的輪緣銷帶動下游連桿');
const {frames,allValid}=sweep(n.comps,n.params,[drv.p2.id,dvn.p2.id,crank.p1.id,crank.p2.id]);
ok(allValid,'0～360° 全程可解（含下游連桿）');
const t1=unwrapSum(frames.map(f=>angle(f.points[drv.p2.id],f.points[drv.p1.id]))),t2=unwrapSum(frames.map(f=>angle(f.points[dvn.p2.id],f.points[dvn.p1.id])));
ok(near(t2/t1,12/24,0.0005),`速比＝齒數比 12/24（量到 ${(t2/t1).toFixed(5)}）`);
ok(t2/t1>0,'鏈條兩輪同向');

// ---------- 讀檔修正 ----------
{
  const raw=structuredClone(ex.snapshot);const s=raw.comps.find(c=>c.kind==='sprocket');s.teeth=55;
  const w=normalizeSnapshot(raw),fixed=w.comps.find(c=>c.id===s.id);
  ok(fixed.teeth===40&&(w.warnings||[]).some(x=>/齒/.test(x)),'齒數超出範圍時夾到 9～40 並警告');
  const raw2=structuredClone(ex.snapshot);raw2.comps.find(c=>c.kind==='sprocket').teeth=12.6;
  ok(normalizeSnapshot(raw2).comps.find(c=>c.kind==='sprocket').teeth===13,'齒數取整數');
  const raw3=structuredClone(ex.snapshot);delete raw3.comps.find(c=>c.kind==='chain').links;
  ok(Number.isInteger(normalizeSnapshot(raw3).comps.find(c=>c.kind==='chain').links),'沒存鏈節數時由中心距算出');
}
// ---------- 舊皮帶不受影響 ----------
{
  const pb=normalizeSnapshot(BLOCK_EXAMPLES.find(e=>e.id==='pulley-belt').snapshot);
  ok(pb.comps.filter(c=>c.type==='pulley').every(c=>!c.kind||c.kind==='pulley')&&pb.params.PRA===24&&pb.params.PRB===48,'皮帶輪範例資料不變（半徑仍為整數）');
}
console.log(`chain-drive: ${pass} passed`);
