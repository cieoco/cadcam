import {fixedBaseSnapshot} from './fixed-syringe-examples.js';

// H04 的同一個針筒／短桿傳動，另建兩層圓盤示範；不變更 H06 的三點安裝介面。
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
