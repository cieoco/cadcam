import {frameHoleAxis,frameHolePoint} from './frame-holes.js';
import {inside} from './part-fusion.js';
import {segmentDistance} from './tab-nut-geometry.js';
import {fusionAtPoint} from '../core/bar-fusion.js';

/** Both pointer and exact input check the same existing material and holes. */
export function planFrameHole(comps,hole,value,geometry,diameterMm) {
  const fail=reason=>({ok:false,reason}),axis=frameHoleAxis(comps,hole),edit=typeof value==='object'&&value?value:{u:value};
  const centered=(edit.centered??hole.frameHole.centered)!==false,u=Number(edit.u??hole.frameHole.u),v=centered?0:Number(edit.v??hole.frameHole.v??0);
  if(!axis)return fail('機架需要兩個不同的固定基準孔。');
  if(![u,v].every(n=>Number.isFinite(n)&&Math.abs(n)<=2000))return fail('請輸入有效的孔位距離。');
  if(fusionAtPoint(comps,hole.p1.id))return fail('此孔已屬於合成件，請先解除合成再改孔位。');
  const point=frameHolePoint(axis,u,v),r=diameterMm/2,web=2;
  const distance=ring=>Math.min(...ring.map((a,i)=>segmentDistance(point,a,ring[(i+1)%ring.length])));
  if(!geometry?.outlines?.some(ring=>inside(point,ring)&&distance(ring)>=r+web-1e-6))return fail('孔太靠近外框；請往內移，或先加大機架。');
  if(geometry.cutouts?.some(c=>inside(point,c.points)||distance(c.points)<r+web))return fail('孔太靠近既有槽口，請換個位置。');
  if(geometry.holes?.some(h=>h.id!==hole.p1.id&&Math.hypot(h.x-point.x,h.y-point.y)<h.r+r+web-1e-6))return fail('孔太靠近既有孔；要接同一孔，請直接從原孔畫連桿。');
  return {ok:true,point,u,v,centered};
}
