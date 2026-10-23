// 鏈條 S4：手機上能把從動輪拉離整數鏈節（出現警告），再對齊回來。用面板按鈕呼叫的同一組函式。
import assert from 'node:assert/strict';
import { placeChainDrive, nudgeDrivenSprocket, alignChainLinks } from '../js/blocks/chain-tools.js';
import { checkChainDrive } from '../js/core/chain-drive.js';
let pass=0;const ok=(c,m)=>{assert.ok(c,m);pass++;console.log('PASS',m);};
const near=(a,b,e=1e-6)=>Math.abs(a-b)<=e;
const spr=(comps,id)=>comps.find(c=>c.id===id);
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const check=comps=>{const a=spr(comps,'SprocketA1'),b=spr(comps,'SprocketB1');return checkChainDrive({center:dist(a.p1,b.p1),teeth1:a.teeth,teeth2:b.teeth});};

const placed=placeChainDrive([],{}, {x:0,y:0},{x:70,y:0},{teeth1:12,teeth2:24});
ok(placed.ok&&check(placed.comps).ok,'放好的鏈輪組在整數鏈節上，沒有警告');
const links0=spr(placed.comps,'Chain1').links;

// 為什麼「更多調整」的 X／Y 不行：選到的是輪緣銷，只動銷，中心距不變
const pinMoved=JSON.parse(JSON.stringify(placed.comps));spr(pinMoved,'SprocketB1').p2.x+=3;
ok(near(dist(spr(pinMoved,'SprocketA1').p1,spr(pinMoved,'SprocketB1').p1),dist(spr(placed.comps,'SprocketA1').p1,spr(placed.comps,'SprocketB1').p1)),'只動輪緣銷：中心距不變，鏈條不會有警告');

const n=nudgeDrivenSprocket(placed.comps,placed.params,'Chain1',3);
ok(n.ok,'從動輪拉遠 3 mm 成功');
const a0=spr(placed.comps,'SprocketA1'),b0=spr(placed.comps,'SprocketB1'),b1=spr(n.comps,'SprocketB1');
ok(near(dist(spr(n.comps,'SprocketA1').p1,b1.p1),dist(a0.p1,b0.p1)+3),'中心距剛好增加 3 mm');
ok(near(b1.p1.y,b0.p1.y)&&near(b1.p2.x-b1.p1.x,b0.p2.x-b0.p1.x),'沿兩輪連線移動，輪緣銷跟著平移');
ok(spr(n.comps,'Chain1').links===links0&&JSON.stringify(placed.comps)!==JSON.stringify(n.comps)&&near(b0.p1.x,placed.comps.find(c=>c.id==='SprocketB1').p1.x),'鏈節數不變，原資料沒被改');
const bad=check(n.comps);
ok(!bad.ok&&bad.issues.some(i=>i.code==='not-integer')&&Math.abs(bad.deviationMm)>0.5,`出現「不是整數鏈節」警告（差 ${bad.deviationMm.toFixed(2)} mm）`);

const back=nudgeDrivenSprocket(n.comps,n.params,'Chain1',-3);
ok(back.ok&&check(back.comps).ok,'再拉近 3 mm 回到原位，警告消失');
const al=alignChainLinks(n.comps,n.params,'Chain1');
ok(al.ok&&check(al.comps).ok&&Math.abs(check(al.comps).deviationMm)<=0.05,'按「對齊整數鏈節」後警告消失');
ok(near(spr(al.comps,'SprocketB1').p2.x-spr(al.comps,'SprocketB1').p1.x,b0.p2.x-b0.p1.x),'對齊後輪緣銷位置關係不變');

// 斜向的鏈
const diag=placeChainDrive([],{}, {x:0,y:0},{x:50,y:50},{teeth1:12,teeth2:24});
const d1=nudgeDrivenSprocket(diag.comps,diag.params,'Chain1',2);
const da=spr(diag.comps,'SprocketA1').p1,db=spr(diag.comps,'SprocketB1').p1,db1=spr(d1.comps,'SprocketB1').p1;
ok(near(dist(da,db1),dist(da,db)+2)&&near((db1.y-da.y)*(db.x-da.x),(db1.x-da.x)*(db.y-da.y),1e-6),'斜向時也只沿連線移動');

const tooClose=nudgeDrivenSprocket(placed.comps,placed.params,'Chain1',-50);
ok(!tooClose.ok&&/太近/.test(tooClose.message)&&JSON.stringify(tooClose.comps)===JSON.stringify(placed.comps),'拉得太近會被擋下，作品不變');
ok(!nudgeDrivenSprocket(placed.comps,placed.params,'Nope',1).ok,'找不到鏈條時回報失敗');
console.log(`chain-warning-route: ${pass} passed`);
