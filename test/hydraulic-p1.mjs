// 液壓第一期（PLAN-HYDRAULIC-ARM P1-1）：H03 推出＝夾緊且左右對稱；H02 顯示「每推 1 mm」的比例；教材說明。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixedLiftSnapshot,fixedGripSnapshot} from '../js/blocks/fixed-syringe-examples.js';
import * as Op from '../js/blocks/syringe-operations.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {plateVertexWorldPoints} from '../js/blocks/plate-geometry.js';
let pass=0;const ok=(cond,msg)=>{assert.ok(cond,msg);pass++;console.log('PASS',msg);};

// ---------- H03：推出＝夾緊、左右對稱 ----------
{
  const before=JSON.stringify(fixedGripSnapshot);
  const n=normalizeSnapshot(fixedGripSnapshot),c=n.comps.find(x=>x.type==='syringe');
  const scan=Op.scanSyringe(n.comps,n.params,c.id);
  ok(scan.ok&&scan.samples.length===41,'H03 全行程 0–20 mm 可解（41 點）');
  const gaps=scan.samples.map(s=>s.tipGap);
  ok(gaps.every(Number.isFinite),'每個姿態都有夾臂端距離');
  ok(gaps.slice(1).every((g,i)=>g<gaps[i]+1e-9),'推桿伸出時夾臂端距離單調變小（推出＝夾緊）');
  ok(gaps[0]-gaps.at(-1)>=25,`開合量至少 25 mm（實際 ${(gaps[0]-gaps.at(-1)).toFixed(1)}）`);
  ok(gaps.at(-1)>=8,`全伸出時兩端仍留 ≥ 8 mm，不互撞（實際 ${gaps.at(-1).toFixed(1)}）`);
  const ax=c.axisDeg*Math.PI/180,frame=n.comps.find(x=>x.id===c.a.componentId),A=frame.p1;
  const off=p=>-(p.x-A.x)*Math.sin(ax)+(p.y-A.y)*Math.cos(ax);
  const pivot=n.comps.find(x=>x.id==='H3JawA').p1;
  ok(Math.abs(off(pivot))<0.05,`夾臂中央支點在針筒軸線上（偏 ${off(pivot).toFixed(3)} mm）`);
  let prev=null,maxMid=0,maxAngle=0;
  for(const s of scan.samples){
    const r=Op.planSyringeStroke(n.comps,n.params,c.id,s.extension,prev);prev=r.points;
    const ends=c.jawIds.map(id=>{const arm=n.comps.find(x=>x.id===id);return plateVertexWorldPoints(arm,[arm.p1,arm.p2,arm.p3].map(p=>prev[p.id]||p)).at(-1);});
    maxMid=Math.max(maxMid,Math.abs(off({x:(ends[0].x+ends[1].x)/2,y:(ends[0].y+ends[1].y)/2})));
    const G=prev[pivot.id],ang=e=>Math.atan2(e.y-G.y,e.x-G.x)-ax;
    maxAngle=Math.max(maxAngle,Math.abs(Math.atan2(Math.sin(ang(ends[0])+ang(ends[1])),Math.cos(ang(ends[0])+ang(ends[1])))*180/Math.PI));
  }
  ok(maxMid<0.1,`全行程兩夾端中點都在軸線上（最大偏 ${maxMid.toFixed(3)} mm）`);
  ok(maxAngle<0.1,`左右夾臂對軸線鏡像（最大不對稱 ${maxAngle.toFixed(3)}°）`);
  ok(n.params.H3Upper===60&&n.params.H3Lower===60,'兩支短連桿仍為 60 mm（沿用模型）');
  ok(c.spec.capacityMl===10&&c.spec.stroke===20,'仍為 10 mL 針筒、20 mm 教學區間');
  ok(JSON.stringify(fixedGripSnapshot)===before,'不改範例原始資料');
}

// ---------- H02：每推 1 mm 轉幾度 ----------
ok(typeof Op.syringeGain==='function','syringe-operations 匯出 syringeGain(comps, params, id, points)');
{
  const n=normalizeSnapshot(fixedLiftSnapshot),c=n.comps.find(x=>x.type==='syringe');
  const at=(params,ext)=>{const comps=structuredClone(n.comps);comps.find(x=>x.id===c.id).extension=ext;const r=Op.solveSyringe(comps,params);assert.ok(r.ok,r.message);return {comps,points:r.points};};
  const {comps,points}=at(n.params,10);
  const g=Op.syringeGain(comps,n.params,c.id,points);
  console.log('H02 gain at 10 mm:',JSON.stringify(g));
  ok(g&&Number.isFinite(g.degPerMm)&&Number.isFinite(g.endMmPerMm),'回傳 { degPerMm, endMmPerMm }');
  const s=Op.scanSyringe(n.comps,n.params,c.id,0.5).samples,i=s.findIndex(x=>x.extension===10);
  const fd=Math.abs(s[i+1].angle-s[i-1].angle)/1;
  ok(Math.abs(g.degPerMm-fd)/fd<0.05,`degPerMm 與行程掃描的差分一致（${g.degPerMm.toFixed(3)} vs ${fd.toFixed(3)}）`);
  const reach=n.params.H2Reach;
  ok(Math.abs(g.endMmPerMm-g.degPerMm*Math.PI/180*reach)/g.endMmPerMm<0.02,'臂端每 mm 位移＝角度×臂端半徑');
  const gainFor=(arm,ext=10)=>{const p={...n.params,H2Arm:arm,H2Tail:reach-arm};const q=at(p,ext);return Op.syringeGain(q.comps,p,c.id,q.points).degPerMm;};
  const near=gainFor(145.892),far=gainFor(172.422);
  ok(far>near,`本例的連桿配置下，172.422 孔每 mm 轉得較多：${far.toFixed(3)} > ${near.toFixed(3)}（不是「離支點近就轉得多」）`);
  const nearScan=Op.scanSyringe(n.comps,{...n.params,H2Arm:145.892,H2Tail:reach-145.892},c.id,0.5).samples.map(x=>x.angle);
  const d=nearScan.slice(1).map((a,i)=>a-nearScan[i]);
  ok(d.some(x=>x>1e-6)&&d.some(x=>x<-1e-6),'145.892 孔在 0–20 mm 內擺臂會折返（經過死點附近）');
  ok(Math.min(...[0,4,8,12,14,15,16,17,18,20].map(e=>gainFor(145.892,e)))<0.03,'折返處每 mm 轉角接近 0');
  ok(Op.syringeGain(comps,n.params,'nope',points)===null,'找不到針筒回 null');
}

// ---------- 教材 ----------
{
  const html=readFileSync(new URL('../teaching-hydraulic.html',import.meta.url),'utf8').replace(/<[^>]+>/g,'');
  ok(/曲柄滑塊/.test(html),'H01 說明針筒推連桿與曲柄滑塊（第二單元）的關係');
  ok(/每推 ?1 ?mm/.test(html),'H02 以「每推 1 mm」比較孔位');
  ok(/(折返|死點)/.test(html),'H02 說明 145.892 孔會在行程中折返（死點附近）');
  ok(/推.{0,12}夾緊/.test(html),'H03 說明推出夾緊');
  ok(/拉.{0,30}(氣泡|吸)/.test(html),'說明液壓用拉的比較不可靠（氣泡／吸力）');
}
console.log(`hydraulic-p1: ${pass} checks passed`);
