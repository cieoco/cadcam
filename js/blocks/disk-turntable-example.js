import {fixedBaseSnapshot} from './fixed-syringe-examples.js';
import {SYRINGE_EAR_MM} from '../core/syringe.js';

// H04 的同一個針筒／短桿傳動，改為兩層圓盤示範，亦作為 H06 底盤來源；H04 僅保留內部幾何種子。
// 外徑為教學配置，不是量測過的施工尺寸。下盤覆蓋筒身與管夾，上盤留偏心工作孔。
export const diskTurntableSnapshot=(()=>{
  const s=JSON.parse(JSON.stringify(fixedBaseSnapshot).replaceAll('H4','H7'));
  const frame=s.comps.find(c=>c.id==='H7Frame'),turn=s.comps.find(c=>c.id==='H7Turn');
  const syringe=s.comps.find(c=>c.type==='syringe'),anchor=frame.p1,center=frame.p2;
  Object.assign(frame,{shape:'disk',diameterMm:420,p1:center,p2:anchor,frameSeparate:true,color:'#64748b'});
  delete frame.stock;
  // 圓心統一為 p1；針筒仍固定在原本 A 點，u 是毫米，並非比例。
  syringe.a.u=s.params.H7Frame;
  syringe.installation={face:'front',spacerMm:null};
  s.comps[s.comps.indexOf(turn)]={id:turn.id,type:'bar',shape:'disk',diameterMm:140,
    p1:turn.p1,p2:turn.p2,lenParam:'H7Crank',fixedLen:true,snapLength:false,
    frameSeparate:true,color:'#d99b35',zlift:1};
  s.comps.find(c=>c.id==='H7Coupler').zlift=2;
  delete s.params.H7Mount;delete s.params.H7Pin;
  s.tracePoint='H7B';s.projectName='H07 針筒雙圓盤底座（俯視）';
  return s;
})();

// 同一個底座的可轉版本：同一個雙耳固定環只鎖一耳螺絲當轉軸，推桿直接接工作孔，移除固定軸版本需要的短桿。
export const pivotTurntableSnapshot=(()=>{
  const s=JSON.parse(JSON.stringify(diskTurntableSnapshot).replaceAll('H7','H8'));
  const frame=s.comps.find(c=>c.id==='H8Frame'),turn=s.comps.find(c=>c.id==='H8Turn'),syr=s.comps.find(c=>c.type==='syringe');
  s.comps=s.comps.filter(c=>c.id!=='H8Coupler');delete s.params.H8Coupler;
  syr.mountMode='pivot';syr.pivotEar=1;delete syr.axisDeg;delete syr.outputId;
  syr.b={componentId:turn.id,u:s.params.H8Crank,v:0};
  // 同一個雙耳固定環只鎖一耳：A–B 距離 = √(軸向長度² + 耳距²)，保留原安裝端點。
  const ear=SYRINGE_EAR_MM,d=Math.hypot(turn.p2.x-frame.p2.x,turn.p2.y-frame.p2.y);
  syr.spec.lmin=Math.sqrt(d*d-ear*ear)-syr.extension;
  syr.spec.name='雙耳固定環只鎖一耳／20 mm 教學區間（未實測）';
  turn.zlift=2; // 轉軸座在筒身下方，將工作孔疊至推桿中心層。
  s.projectName='H08 單螺絲可轉針筒底座（俯視）';
  return s;
})();
