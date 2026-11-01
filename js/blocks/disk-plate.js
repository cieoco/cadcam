/** 圓盤沿用兩孔剛體；外徑獨立於孔距，板厚由作品加工設定提供。 */
export const isDisk = comp => comp?.type === 'bar' && comp.shape === 'disk';
export const diskDiameter = comp => Number(comp.diameterMm) || 100;
export function diskOutline(comp, center = {x:0,y:0}) {
  const r=diskDiameter(comp)/2;
  return Array.from({length:128},(_,i)=>({x:center.x+r*Math.cos(i*Math.PI/64),y:center.y+r*Math.sin(i*Math.PI/64)}));
}
export function validateDisk(comp, radius, diameter=diskDiameter(comp), holeDiameter=12.96) {
  if(!Number.isFinite(diameter)||diameter<20||diameter>2000)return '外徑請填 20–2000 mm。';
  if(!Number.isFinite(radius)||radius<8)return '工作孔距中心至少 8 mm。';
  if(radius+holeDiameter/2+1>diameter/2)return '工作孔太靠近圓盤邊緣，請加大外徑或縮小孔距。';
  return '';
}
