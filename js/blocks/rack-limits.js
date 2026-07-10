export function rackGuideTravel(slotLength, slotWidth) {
  const length=Math.max(0,Number(slotLength)||0), width=Math.max(0,Number(slotWidth)||0);
  const separation=Math.min(18,Math.max(6,length*.08));
  const endClearance=Math.max(1,width/2);
  const halfTravel=Math.max(0,length/2-separation-endClearance);
  return { separation, endClearance, halfTravel, travel:halfTravel*2 };
}

export function rackGuideThetaRange(radius,slotLength,slotWidth,sign=1){
  const R=Number(radius), travel=rackGuideTravel(slotLength,slotWidth);
  if(!Number.isFinite(R)||R<=0||travel.halfTravel<=0)return null;
  const limit=travel.halfTravel/R*180/Math.PI;
  return sign<0?{lo:-limit,hi:limit}:{lo:-limit,hi:limit};
}
