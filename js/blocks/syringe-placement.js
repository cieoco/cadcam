import {SYRINGE_DEMO,attachmentFrame,attachmentPoint,fixedSyringePointIds} from '../core/syringe.js';

// 管夾固定針筒的放置規則（純函式，不改傳入資料）。學生點選 A（機架上的管夾位置）與 B（短連桿端孔），
// 這裡找出輸出擺臂、算出軸向與最短孔距，回傳可交給設定視窗的候選針筒。
export const MIN_LMIN_MM=40; // 筒身最短孔距下限：低於此值筒身放不下
const EPS=1e-6;
const fail=message=>({ok:false,message});
export const isFixedFrame=(o,comps)=>{const ids=fixedSyringePointIds(Array.isArray(comps)?comps:[o].filter(Boolean));return !!o?.p1&&[o.p1,...(o.type==='anchor'?[]:[o.p2,o.p3].filter(Boolean))].every(p=>ids.has(p.id));};
// 桿件端孔：u=0 為第一孔，u=桿長 為第二孔；其餘位置回 null。
export function barEnd(owner,params,ref){
  if(owner?.type!=='bar'||!owner.p1||!owner.p2||Math.abs(ref?.v)>EPS)return null;
  const length=Number(params[owner.lenParam]);
  if(Math.abs(ref.u)<EPS)return 'p1';
  return length>0&&Math.abs(ref.u-length)<EPS?'p2':null;
}
export function placeFixedSyringe(comps,params,points,aRef,bRef,{extension=10}={}){
  const ownerA=comps.find(o=>o.id===aRef?.componentId),ownerB=comps.find(o=>o.id===bRef?.componentId);
  if(!ownerA||!ownerB)return fail('請先點選管夾位置（機架），再點選短連桿端孔。');
  if(!isFixedFrame(ownerA,comps))return fail('管夾要夾在固定的機架上：請點選兩端都是固定點的機架。');
  if(ownerA.id===ownerB.id||isFixedFrame(ownerB,comps))return fail('推桿要接在活動的短連桿上，不能接在機架或同一個零件上。');
  const end=barEnd(ownerB,params,bRef);
  if(!end)return fail('推桿請接在短連桿的端孔上：點選連桿兩端的孔。');
  const rodPoint=ownerB[end],other=ownerB[end==='p1'?'p2':'p1'];
  const fixedIds=fixedSyringePointIds(comps);
  if(fixedIds.has(rodPoint.id))return fail('推桿接孔不能是固定點，請改點活動的連桿端孔。');
  const output=fixedIds.has(other.id)?null:comps.find(o=>o.id!==ownerB.id&&['bar','triangle'].includes(o.type)&&[o.p1,o.p2,o.p3].some(p=>fixedIds.has(p?.id))&&[o.p1,o.p2,o.p3].some(p=>p?.id===other.id));
  if(!output)return fail('推桿要接短連桿，短連桿另一端接有固定支點的擺臂；請改點這樣的連桿端孔。');
  const a=attachmentPoint(aRef,comps,params,points),b=attachmentPoint({...bRef},comps,params,points);
  if(!a||!b||![a.x,a.y,b.x,b.y].every(Number.isFinite))return fail('找不到有效的安裝點，請重新點選。');
  const stroke=20,ext=Math.max(0,Math.min(stroke,Number(extension)||0)),distance=Math.hypot(b.x-a.x,b.y-a.y),lmin=distance-ext;
  if(!(lmin>=MIN_LMIN_MM))return fail(`管夾離推桿接點太近：距離 ${distance.toFixed(1)} mm，筒身最短孔距需至少 ${MIN_LMIN_MM} mm；請把管夾往後移。`);
  let n=1;while(comps.some(o=>o.id===`Syringe${n}`))n++;
  return {ok:true,syringe:{type:'syringe',id:`Syringe${n}`,mountMode:'fixed-axis',appearance:'flat-rod',axisDeg:Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI,outputId:output.id,
    a:{componentId:ownerA.id,u:aRef.u,v:aRef.v},b:{componentId:ownerB.id,u:bRef.u,v:bRef.v},
    spec:{...SYRINGE_DEMO,name:'F3D 外形參考／20 mm 教學區間（未實測）',outerDiameter:17.5,bodyLength:72,rodDiameter:8,lmin,stroke,calibrated:false},extension:ext,branch:1}};
}
