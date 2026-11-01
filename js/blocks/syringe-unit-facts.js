// 教學單元「針筒怎麼控制機構」（teaching-syringe.html）頁面上每一個模擬數字的出處。
// 數字不手打：用真正的範例與針筒運算（scanSyringe／syringeGain／planSyringeStroke）及量尺（dimensionRange）現算。
// 頁面用 <span data-sim="key">值</span> 標註；test/syringe-unit.mjs 會逐一重算並比對，頁面載入時也會重算並更新。
// 這個模組只被教學頁與測試以動態載入使用，不屬於 blocks 啟動程式。全是幾何結果，沒有力、摩擦或漏水。
import {getExample} from './examples.js';
import {normalizeSnapshot} from './schema.js';
import {scanSyringe,syringeGain,planSyringeStroke,solveSyringe} from './syringe-operations.js';
import {dimensionRange} from './dimensions.js';
import {attachmentPoint,fixedSyringePointIds} from '../core/syringe.js';

const RAD_TO_DEG=180/Math.PI;
const load=id=>{
  const ex=getExample(id);
  if(!ex)throw new Error(`找不到範例 ${id}`);
  return normalizeSnapshot(structuredClone(ex.snapshot));
};
const syringeOf=(s,id)=>s.comps.find(c=>c.type==='syringe'&&(!id||c.id===id));
const need=(r,what)=>{if(!r?.ok)throw new Error(`${what}：${r?.message||'無法計算'}`);return r;};
// 掃描 0..行程；讀出 samples（含每點的臂角、端孔距等）。
const scan=(s,params=s.params,id)=>need(scanSyringe(s.comps,params,syringeOf(s,id).id,0.5),'掃描全行程').samples;
// 角度差取最短方向（避開 ±180° 繞圈）。
const turn=(a,b)=>Math.abs(((b-a+540)%360+360)%360-180);
const swing=samples=>turn(samples[0].angle,samples.at(-1).angle);
// 沿著 0.5 mm 一步步走到伸出量 e，沿用同一組裝分支（和掃描、手動拖動的求法一致）。
function stateAt(s,e,params=s.params){
  const id=syringeOf(s).id;
  let previous=need(solveSyringe(s.comps,params),'求解初始姿勢').points,r=null;
  for(let i=0;i<=Math.round(e/0.5);i++){
    r=need(planSyringeStroke(s.comps,params,id,i*0.5,previous),`伸出 ${i*0.5} mm`);
    previous=r.points;
  }
  return {comps:r.comps,points:previous,params};
}
// 每推 1 mm：輸出臂轉幾度（syringeGain，±0.25 mm 中央差分）。
const gainAt=(s,e,params=s.params)=>{
  const st=stateAt(s,e,params),c=syringeOf({comps:st.comps});
  const g=syringeGain(st.comps,params,c.id,st.points);
  if(!g)throw new Error('算不出每推 1 mm');
  return g;
};
// 力臂：輸出件固定軸心，到「力的作用線」的垂直距離。
// 固定安裝：力沿短連桿傳（兩端孔連線）；可轉安裝：推桿直接推，力沿筒身（A、B 連線）。
function leverAt(s,e,params=s.params){
  const st=stateAt(s,e,params),c=syringeOf({comps:st.comps}),fixed=fixedSyringePointIds(st.comps);
  let from,to,outputId=c.outputId;
  if(c.mountMode==='pivot'){
    from=attachmentPoint(c.a,st.comps,params,st.points);to=attachmentPoint(c.b,st.comps,params,st.points);outputId=c.b.componentId;
  }else{
    const link=st.comps.find(o=>o.id===c.b.componentId);
    from=st.points[link.p1.id];to=st.points[link.p2.id];
  }
  const out=st.comps.find(o=>o.id===outputId),pivot=[out.p1,out.p2,out.p3].filter(Boolean).find(p=>fixed.has(p.id)),o=st.points[pivot.id]||pivot;
  const dx=to.x-from.x,dy=to.y-from.y;
  return Math.abs(dx*(o.y-from.y)-dy*(o.x-from.x))/Math.hypot(dx,dy);
}
// 筒身（A→B）在整個行程中擺過的角度範圍（最大減最小）：固定安裝為 0；可轉安裝筒身會跟著擺。
function barrelSwing(s){
  const c=syringeOf(s),n=Math.round(c.spec.stroke/0.5),angles=[];
  let previous=need(solveSyringe(s.comps,s.params),'求解初始姿勢').points;
  for(let i=0;i<=n;i++){
    const r=need(planSyringeStroke(s.comps,s.params,c.id,i*0.5,previous),`伸出 ${i*0.5} mm`);
    previous=r.points;
    const q=r.comps.find(o=>o.id===c.id),a=attachmentPoint(q.a,r.comps,s.params,previous),b=attachmentPoint(q.b,r.comps,s.params,previous);
    angles.push(Math.atan2(b.y-a.y,b.x-a.x)*RAD_TO_DEG);
  }
  return Math.max(...angles.map(x=>turn(angles[0],x)));
}
// H02「近孔」＝驅動孔改為 145.892 mm，臂端距主軸 250 mm 不變（課文的比較條件）。
const h02Params=(s,hole)=>({...s.params,H2Arm:hole,H2Tail:s.params.H2Reach-hole});
const gripTipGap=(s)=>dimensionRange({id:'gap',kind:'distance',a:{compId:'H3JawA',vertex:3},b:{compId:'H3JawB',vertex:3}},s.comps,s.params);

export const SYRINGE_SIM_FACTS={
  // 步驟 1：H01 單臂
  'h01-swing-deg':async()=>swing(scan(load('hydraulic-h01'))),
  'h01-tip-rise-mm':async()=>{
    const s=load('hydraulic-h01'),r=need(dimensionRange({id:'h',kind:'height',a:{pointId:'H1C'},baseline:'ground'},s.comps,s.params),'量尺：臂端高度');
    return r.max-r.min;
  },
  'h01-gain-10':async()=>gainAt(load('hydraulic-h01'),10).degPerMm,
  'h01-lever-10-mm':async()=>leverAt(load('hydraulic-h01'),10),
  'h01-gain-est-10':async()=>(1/(leverAt(load('hydraulic-h01'),10)))*RAD_TO_DEG,
  // 步驟 2：H02 兩個驅動孔（遠孔＝原 172.422 mm；近孔＝145.892 mm）
  'h02-far-gain-10':async()=>gainAt(load('hydraulic-h02'),10).degPerMm,
  'h02-near-gain-10':async()=>{const s=load('hydraulic-h02');return gainAt(s,10,h02Params(s,145.892)).degPerMm;},
  'h02-far-lever-10-mm':async()=>leverAt(load('hydraulic-h02'),10),
  'h02-near-lever-10-mm':async()=>{const s=load('hydraulic-h02');return leverAt(s,10,h02Params(s,145.892));},
  'h02-far-cos-10':async()=>{const s=load('hydraulic-h02');return gainAt(s,10).degPerMm/RAD_TO_DEG*leverAt(s,10);},
  'h02-near-cos-10':async()=>{const s=load('hydraulic-h02'),p=h02Params(s,145.892);return gainAt(s,10,p).degPerMm/RAD_TO_DEG*leverAt(s,10,p);},
  // 近孔在這個伸出量附近臂角走到最小值，再往下推臂會往回轉（折返）。
  'h02-near-turnback-mm':async()=>{
    const s=load('hydraulic-h02'),samples=scan(s,h02Params(s,145.892)),lowest=samples.reduce((m,x)=>x.angle<m.angle?x:m,samples[0]);
    return lowest.extension;
  },
  // 步驟 4：H03 夾具（量尺量兩夾臂尖端），H05 夾爪是「推出收攏」變體
  'h03-gap-min-mm':async()=>need(gripTipGap(load('hydraulic-h03')),'量尺：夾口').min,
  'h03-gap-max-mm':async()=>need(gripTipGap(load('hydraulic-h03')),'量尺：夾口').max,
  'h03-gap-per-mm-10':async()=>{const g=gainAt(load('hydraulic-h03'),10);return Math.abs(g.tipGapMmPerMm);},
  'h05-gap-0-mm':async()=>scan(load('hydraulic-h05'),undefined,'H3Syringe')[0].tipGap,
  'h05-gap-20-mm':async()=>scan(load('hydraulic-h05'),undefined,'H3Syringe').at(-1).tipGap,
  // 步驟 5：H07 固定安裝與 H08 可轉安裝
  'h07-swing-deg':async()=>swing(scan(load('hydraulic-h07'))),
  'h08-swing-deg':async()=>swing(scan(load('hydraulic-h08'))),
  'h07-barrel-swing-deg':async()=>barrelSwing(load('hydraulic-h07')),
  'h08-barrel-swing-deg':async()=>barrelSwing(load('hydraulic-h08')),
  'h07-lever-0-mm':async()=>leverAt(load('hydraulic-h07'),0),
  'h07-lever-10-mm':async()=>leverAt(load('hydraulic-h07'),10),
  'h07-gain-0':async()=>gainAt(load('hydraulic-h07'),0).degPerMm,
  'h07-gain-10':async()=>gainAt(load('hydraulic-h07'),10).degPerMm,
  'h07-gain-est-10':async()=>(1/leverAt(load('hydraulic-h07'),10))*RAD_TO_DEG
};
