// 可轉安裝＝同一個水管固定環（兩耳），只鎖一耳的螺絲當轉軸；另一耳不鎖。轉軸偏離筒身軸線一個耳距（12 mm）。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pivotTurntableSnapshot as H08} from '../js/blocks/disk-turntable-example.js';
import {syringeClampShape,syringeClampFrameNodes,syringeShape} from '../js/blocks/syringe-shape.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import * as Op from '../js/blocks/syringe-operations.js';
import {attachmentPoint} from '../js/core/syringe.js';
let pass=0;const ok=(c,m)=>{assert.ok(c,m);pass++;console.log('PASS',m);};
const near=(a,b,t=1e-6)=>Math.abs(a-b)<=t;
const fixedClamp=syringeClampShape('fixed-axis'),pivotClamp=syringeClampShape('pivot');
ok(pivotClamp.feet.length===2&&JSON.stringify(pivotClamp.feet)===JSON.stringify(fixedClamp.feet)&&JSON.stringify(pivotClamp.profile)===JSON.stringify(fixedClamp.profile),'可轉與固定用同一個固定環（同樣兩耳、同樣外形）');
const EAR=Math.abs(fixedClamp.feet[0].hole.y);
ok(near(EAR,12),'耳孔距筒身軸線 12 mm（孔距 24 mm）');

const n=normalizeSnapshot(structuredClone(H08)),c=n.comps.find(x=>x.type==='syringe');
ok(c.mountMode==='pivot'&&(c.pivotEar===1||c.pivotEar===-1),`H08 可轉安裝，指定鎖哪一耳（pivotEar=${c.pivotEar}）`);
const fixedPts=n.comps.flatMap(o=>[o.p1,o.p2,o.p3].filter(p=>p?.type==='fixed'));
const holes=syringeClampFrameNodes(n.comps,fixedPts);
ok(holes.length===1&&holes[0].holeLayer==='SYRINGE_PIVOT','底板只開一個孔（鎖住的那一耳），另一耳不鎖不開孔');

const scan=Op.scanSyringe(n.comps,n.params,c.id,0.5);
ok(scan.ok&&scan.samples.length===41,'H08 全行程 0–20 mm 可解（41 點）');
let prev=null,okGeo=true,why='';const turnAng=[],barrelAng=[];
for(const s of scan.samples){
  const r=Op.planSyringeStroke(n.comps,n.params,c.id,s.extension,prev);prev=r.points;
  const A=attachmentPoint(r.comps.find(x=>x.id===c.id).a,r.comps,n.params,prev),B=attachmentPoint(c.b,r.comps,n.params,prev);
  const sh=syringeShape(r.comps.find(x=>x.id===c.id),r.comps,n.params,prev);
  const L=c.spec.lmin+s.extension,d=Math.hypot(B.x-A.x,B.y-A.y);
  if(!near(d,Math.hypot(L,EAR),1e-4)){okGeo=false;why||=`伸出 ${s.extension}：|AB|=${d.toFixed(3)}，應為 √(L²+12²)=${Math.hypot(L,EAR).toFixed(3)}`;}
  const ux=Math.cos(sh.angle),uy=Math.sin(sh.angle),perpA=Math.abs(-(A.x-B.x)*uy+(A.y-B.y)*ux);
  if(!near(perpA,EAR,1e-4)){okGeo=false;why||=`伸出 ${s.extension}：轉軸離筒身軸線 ${perpA.toFixed(3)} mm，應為 12`;}
  barrelAng.push(sh.angle*180/Math.PI);
  const turn=r.comps.find(x=>x.id==='H8Turn');turnAng.push(Math.atan2(prev[turn.p2.id].y-prev[turn.p1.id].y,prev[turn.p2.id].x-prev[turn.p1.id].x)*180/Math.PI);
}
ok(okGeo,`幾何正確：轉軸在耳孔、筒身軸線離轉軸 12 mm、推桿端在軸線上（${why}）`);
const un=a=>a.reduce((o,v,i)=>{if(!i)return [v];let d=v-a[i-1];d=((d+540)%360)-180;return [...o,o[i-1]+d];},[]);
const T=un(turnAng),Bg=un(barrelAng),sw=Math.abs(T.at(-1)-T[0]);
ok(sw>=60&&sw<=120&&T.slice(1).every((v,i)=>(v-T[i])*(T.at(-1)-T[0])>0),`圓盤轉角單調、總轉角 ${sw.toFixed(1)}°`);
ok(Math.max(...Bg)-Math.min(...Bg)>0.5,`筒身確實跟著擺（${(Math.max(...Bg)-Math.min(...Bg)).toFixed(1)}°）`);

// ---------- 舊存檔相容：舊的可轉（置中轉軸）讀成鎖一耳，原姿勢不變 ----------
{
  const legacy=structuredClone(H08),ls=legacy.comps.find(x=>x.type==='syringe');delete ls.pivotEar;ls.spec.lmin=60;ls.extension=10;
  const before=Math.hypot(ls.spec.lmin+ls.extension,0);
  const m=normalizeSnapshot(legacy),ms=m.comps.find(x=>x.type==='syringe');
  ok(ms.pivotEar===1||ms.pivotEar===-1,'舊存檔沒有 pivotEar 時補上');
  ok(near(Math.hypot(ms.spec.lmin+ms.extension,EAR),before,1e-6),'並調整最短孔距，讓轉軸到推桿端距離不變（原姿勢保留）');
}
// ---------- 介面與教材 ----------
{
  const ui=readFileSync(new URL('../js/blocks/syringe-install-ui.js',import.meta.url),'utf8');
  ok(/一顆螺絲/.test(ui)&&/(上耳|下耳|左耳|右耳|哪一耳|鎖哪)/.test(ui),'安裝精靈：可轉安裝寫明「固定環只鎖一顆螺絲」，並可選鎖哪一耳');
  const t=readFileSync(new URL('../teaching-syringe.html',import.meta.url),'utf8');
  ok(/H08/.test(t)&&/一顆螺絲/.test(t),'獨立單元以「鎖一顆螺絲」說明 H08');
  const ex=readFileSync(new URL('../js/blocks/examples.js',import.meta.url),'utf8');
  ok(/hydraulic-h08[^\n]*一顆螺絲/.test(ex),'H08 範例說明改成「固定環只鎖一顆螺絲」');
}
console.log(`pivot-clamp: ${pass} passed`);
