// 量尺（製圖式尺寸標註）D1：兩點距離、離基準線的高度／水平距離、歸零位移；放上就算出全行程最小／最大。
// 2D 為主：基準是線（地面、經過固定點的水平線／垂直線），世界座標 y 向上。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as D from '../js/blocks/dimensions.js';
import {BLOCK_EXAMPLES} from '../js/blocks/examples.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {fixedGripSnapshot,fixedLiftSnapshot} from '../js/blocks/fixed-syringe-examples.js';
import * as Op from '../js/blocks/syringe-operations.js';
let pass=0;const ok=(c,m)=>{assert.ok(c,m);pass++;console.log('PASS',m);};
const near=(a,b,t)=>Math.abs(a-b)<=t;
const ex=id=>normalizeSnapshot(BLOCK_EXAMPLES.find(e=>e.id===id).snapshot);
const pts=n=>Object.fromEntries(n.comps.flatMap(c=>[c.p1,c.p2,c.p3,c.m1,c.m2].filter(Boolean)).map(p=>[p.id,{x:p.x,y:p.y}]));

// ---------- 候選點與基準線 ----------
const g=normalizeSnapshot(fixedGripSnapshot);
const cand=D.dimensionCandidates(g.comps,g.params,pts(g));
ok(cand.length>0&&cand.every(c=>c.ref&&typeof c.label==='string'&&/[一-鿿]|[A-Z]/.test(c.label)&&Number.isFinite(c.x)&&Number.isFinite(c.y)),'候選點有參照、名稱與位置');
const tips=cand.filter(c=>c.ref.vertex!==undefined&&['H3JawA','H3JawB'].includes(c.ref.compId)&&/尖|端/.test(c.label));
ok(tips.length>=2,'夾臂末端（板的頂點）也是候選點，標示為尖端');
const allIds=new Set(g.comps.flatMap(c=>[c.p1,c.p2,c.p3].filter(Boolean)).map(p=>p.id));
ok([...allIds].every(id=>cand.some(c=>c.ref.pointId===id)),'每個孔／接點都是候選點');
const base=D.dimensionBaselines(g.comps,pts(g));
const fixedY=g.comps.flatMap(c=>[c.p1,c.p2,c.p3].filter(p=>p?.type==='fixed')).map(p=>p.y);
const ground=base.find(b=>b.id==='ground');
ok(ground&&ground.kind==='h'&&ground.y<=Math.min(...fixedY)+1e-9&&/地面/.test(ground.label),'有「地面」基準線，不高於最低固定點');
ok(base.some(b=>b.kind==='h'&&b.id!=='ground')&&base.some(b=>b.kind==='v'),'也有經過固定點的水平線與垂直線');

// ---------- 兩點距離：H03 夾口（針筒輸入）----------
{
  const [a,b]=[tips.find(t=>t.ref.compId==='H3JawA'),tips.find(t=>t.ref.compId==='H3JawB')];
  const dim={id:'d1',name:'夾口',kind:'distance',a:a.ref,b:b.ref};
  const r=D.dimensionRange(dim,g.comps,g.params);
  const scan=Op.scanSyringe(g.comps,g.params,'H3Syringe',0.5).samples.map(s=>s.tipGap);
  ok(r.ok&&r.input.kind==='syringe'&&r.input.unit==='mm'&&r.input.from===0&&r.input.to===20,'H03 以針筒伸出量 0–20 mm 掃描');
  ok(near(r.min,Math.min(...scan),0.05)&&near(r.max,Math.max(...scan),0.05),`夾口最小 ${r.min?.toFixed(1)}／最大 ${r.max?.toFixed(1)} mm（與夾臂端距一致）`);
  const at=v=>scan.indexOf(v)*0.5;
  ok(near(r.minAt,at(Math.min(...scan)),0.5)&&near(r.maxAt,at(Math.max(...scan)),0.5),`並告訴你最小、最大發生在哪個伸出量（${r.minAt} / ${r.maxAt} mm）`);
  ok(near(D.measureDimension(dim,g.comps,g.params,pts(g)).value,Math.hypot(a.x-b.x,a.y-b.y),1e-9),'目前值＝兩點距離');
}
// ---------- 高度：H02 臂端離地 ----------
{
  const l=normalizeSnapshot(fixedLiftSnapshot);
  const dim={id:'d2',name:'臂端高度',kind:'height',a:{pointId:'H2C'},baseline:'ground'};
  const r=D.dimensionRange(dim,l.comps,l.params);
  let prev=null;const ys=[];for(let e=0;e<=20;e+=0.5){const p=Op.planSyringeStroke(l.comps,l.params,'H2Syringe',e,prev);prev=p.points;ys.push(p.points.H2C.y);}
  const gy=D.dimensionBaselines(l.comps,pts(l)).find(b=>b.id==='ground').y;
  ok(r.ok&&near(r.max-r.min,Math.max(...ys)-Math.min(...ys),1e-6),`臂端高度變化 ${(r.max-r.min).toFixed(1)} mm（與求解一致）`);
  ok(near(r.max,Math.max(...ys)-gy,1e-6),'高度＝點到地面的垂直距離（y 向上）');
}
// ---------- 水平距離與歸零：滑塊曲柄（馬達輸入）----------
{
  const s=ex('slider-crank');
  const h={id:'d3',name:'滑塊位置',kind:'horizontal',a:{pointId:'P3'},baseline:'v:O'};
  const r=D.dimensionRange(h,s.comps,s.params);
  ok(r.ok&&r.input.kind==='motor'&&r.input.unit==='°'&&r.input.from===0&&r.input.to===360,'馬達機構以 0–360° 掃描');
  ok(near(r.min,60,0.5)&&near(r.max,120,0.5),`滑塊離 O 的水平距離 ${r.min.toFixed(1)}～${r.max.toFixed(1)} mm（行程 60）`);
  const z={id:'d4',name:'滑塊移動',kind:'displacement',a:{pointId:'P3'},zero:{x:120,y:0}};
  const rz=D.dimensionRange(z,s.comps,s.params);
  ok(rz.ok&&near(rz.min,0,0.5)&&near(rz.max,60,0.5),'歸零後量「從起點移動多少」：0～60 mm');
  const m=D.measureDimension(z,s.comps,s.params,{...pts(s),P3:{x:100,y:0}});
  ok(near(m.value,20,1e-9)&&near(m.dx,-20,1e-9)&&near(m.dy,0,1e-9),'歸零位移同時給 Δ左右、Δ上下');
}
// ---------- 舵機：只掃它的角度範圍 ----------
{
  const gg=ex('gear-gripper');
  const dim={id:'d5',name:'夾爪開口',kind:'distance',a:{pointId:'LT'},b:{pointId:'RT'}};
  const r=D.dimensionRange(dim,gg.comps,gg.params);
  ok(r.ok&&r.max>r.min,`齒輪夾爪開口 ${r.min?.toFixed(1)}～${r.max?.toFixed(1)} mm`);
  const servo=gg.comps.find(c=>c.motorType==='mg995'||c.p1?.motorType==='mg995');
  if(servo){const a=Number(servo.servoStart),b=Number(servo.servoEnd);ok(r.input.from===Math.min(a,b)&&r.input.to===Math.max(a,b),'舵機只掃它設定的角度範圍');}
  else ok(r.input.from===0&&r.input.to===360,'TT 馬達掃一整圈');
}
// ---------- 拒絕、純函式、存檔 ----------
{
  ok(!D.dimensionRange({id:'x',kind:'distance',a:{pointId:'nope'},b:{pointId:'O'}},ex('slider-crank').comps,{}).ok,'找不到點時拒絕');
  const s=ex('slider-crank'),before=JSON.stringify(s.comps);
  D.dimensionRange({id:'d',kind:'distance',a:{pointId:'A'},b:{pointId:'P3'}},s.comps,s.params);
  ok(JSON.stringify(s.comps)===before,'不改傳入資料');
  const snap={...structuredClone(BLOCK_EXAMPLES.find(e=>e.id==='slider-crank').snapshot),dimensions:[
    {id:'d1',name:'滑塊位置',kind:'horizontal',a:{pointId:'P3'},baseline:'v:O'},
    {id:'d2',name:'壞的',kind:'weird',a:{pointId:'P3'}},
    {id:'d3',name:'移動',kind:'displacement',a:{pointId:'P3'},zero:{x:'abc',y:0}}]};
  const n=normalizeSnapshot(snap);
  ok(n.dimensions?.length===1&&n.dimensions[0].id==='d1','量尺隨作品存檔；壞的量尺讀檔時丟掉');
  ok(normalizeSnapshot(structuredClone(BLOCK_EXAMPLES.find(e=>e.id==='slider-crank').snapshot)).dimensions===undefined,'沒有量尺的作品不多欄位');
}
// ---------- 介面 ----------
{
  const html=readFileSync(new URL('../blocks.html',import.meta.url),'utf8');
  ok(/startDimension\(\)/.test(html)&&/量尺/.test(html),'有「量尺」入口');
}
console.log(`dimensions: ${pass} passed`);
