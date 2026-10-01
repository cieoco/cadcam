export function rackGuideTravel(slotLength, slotWidth) {
  const length=Math.max(0,Number(slotLength)||0), width=Math.max(0,Number(slotWidth)||0);
  const separation=Math.min(18,Math.max(6,length*.08));
  const endClearance=Math.max(1,width/2);
  const halfTravel=Math.max(0,length/2-separation-endClearance);
  return { separation, endClearance, halfTravel, travel:halfTravel*2 };
}

// 導銷在長槽內的角度範圍（度）。齒條位移 s = sign·R·θ（沿軸 u）；
// 長槽 -u 端縮短 trimStart、+u 端縮短 trimEnd（mm）→ 允許 s ∈ [-(H-trimEnd), H-trimStart]，各側夾在 >= 0。
// 沒縮短時對稱（舊行為）。
export function rackGuideThetaRange(radius,slotLength,slotWidth,sign=1,trimStart=0,trimEnd=0){
  const R=Number(radius), travel=rackGuideTravel(slotLength,slotWidth);
  if(!Number.isFinite(R)||R<=0||travel.halfTravel<=0)return null;
  const H=travel.halfTravel;
  const ts=Math.max(0,Number(trimStart)||0), te=Math.max(0,Number(trimEnd)||0);
  const sMin=-Math.max(0,H-te), sMax=Math.max(0,H-ts);
  const k=180/Math.PI/((sign<0?-1:1)*R);
  const a=sMin*k, b=sMax*k;
  return { lo:Math.min(a,b), hi:Math.max(a,b) };
}

// 反推：想把角度範圍收到 {lo,hi}（度）時，兩端長槽各要縮短多少 mm（不縮短＝0）。
export function rackStopTrims(radius,slotLength,slotWidth,sign,lo,hi){
  const R=Number(radius), H=rackGuideTravel(slotLength,slotWidth).halfTravel;
  const sg=sign<0?-1:1, k=sg*R*Math.PI/180;
  const sA=lo*k, sB=hi*k;
  const sMin=Math.min(sA,sB), sMax=Math.max(sA,sB);
  return { trimStart:Math.max(0,H-Math.max(0,sMax)), trimEnd:Math.max(0,H+Math.min(0,sMin)) };
}
