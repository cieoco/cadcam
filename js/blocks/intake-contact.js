export function circleRectCompression(circle, rect) {
  const hw=Math.max(0,Number(rect.width)||0)/2, hh=Math.max(0,Number(rect.height)||0)/2;
  const dx=(Number(circle.x)||0)-(Number(rect.x)||0), dy=(Number(circle.y)||0)-(Number(rect.y)||0);
  const qx=Math.max(-hw,Math.min(hw,dx)), qy=Math.max(-hh,Math.min(hh,dy));
  const distance=Math.hypot(dx-qx,dy-qy), radius=Math.max(0,Number(circle.radius)||0);
  return {distance,compression:Math.max(0,radius-distance),contact:distance<=radius};
}
