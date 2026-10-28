/** Laser-cut tab / captive-nut joints. Pure millimetre geometry, no DOM or solver. */
import {area,inside} from './part-fusion.js';
import {transformMatePoint} from './face-mate.js';

export const TAB_NUT_DEFAULTS=Object.freeze({kind:'tab-nut-m3',version:1,alongMm:0,tabWidthMm:8,tabPitchMm:24,slotClearanceMm:.15,
  nutAcrossMm:5.5,nutHeightMm:2.4,nutClearanceMm:.2,nutCenterMm:6,screwDiameterMm:3,screwLengthMm:12,
  clearanceDiameterMm:3.4,washerThicknessMm:.5,washerDiameterMm:7,headDiameterMm:5.5,headHeightMm:3,
  endClearanceMm:1,minWebMm:3,compensation:'none'});
export function normalizeTabNut(raw){
  if(!raw||raw.kind!=='tab-nut-m3'||raw.version!==1||raw.compensation!=='none')return null;
  const out={};
  for(const [key,value] of Object.entries(TAB_NUT_DEFAULTS)){
    const v=raw[key];
    if(typeof value==='number'&&(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>1000||key!=='alongMm'&&v<=0))return null;
    out[key]=v;
  }
  const more=raw.moreAlongMm;
  if(more!==undefined){if(!Array.isArray(more)||more.length>5||!more.every((v,i)=>Math.abs(v)<1e3&&v>(i?more[i-1]:out.alongMm)))return null;out.moreAlongMm=[...more];}
  if(out.slotClearanceMm>.5||out.nutClearanceMm>.5||out.minWebMm<3||out.headDiameterMm>out.washerDiameterMm)return null;
  if(out.screwDiameterMm!==3||out.clearanceDiameterMm<=3||out.clearanceDiameterMm>=out.nutAcrossMm||out.nutCenterMm<=out.nutHeightMm/2+out.nutClearanceMm||out.tabPitchMm<=out.tabWidthMm+out.nutAcrossMm+2*out.minWebMm)return null;
  return out;
}
const eps=1e-6;
const rect=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
const clean=r=>r.filter((p,i)=>!i||Math.hypot(p.x-r[i-1].x,p.y-r[i-1].y)>eps).filter((p,i,a)=>i!==a.length-1||Math.hypot(p.x-a[0].x,p.y-a[0].y)>eps);
export function segmentDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,k=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));return Math.hypot(p.x-a.x-k*dx,p.y-a.y-k*dy);}
const edges=r=>r.map((p,i)=>[p,r[(i+1)%r.length]]);
function crosses(a,b,c,d){const cross=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);return cross(a,b,c)*cross(a,b,d)<-eps&&cross(c,d,a)*cross(c,d,b)<-eps;}
const boundaryDistance=(ring,boundary)=>Math.min(...edges(ring).flatMap(([a,b])=>boundary.map(([c,d])=>crosses(a,b,c,d)?0:Math.min(segmentDistance(a,c,d),segmentDistance(b,c,d),segmentDistance(c,a,b),segmentDistance(d,a,b)))));
export function ringDistance(a,b){if(a.some(p=>inside(p,b))||b.some(p=>inside(p,a))||edges(a).some(([p,q])=>edges(b).some(([r,s])=>crosses(p,q,r,s))))return 0;return Math.min(...a.flatMap(p=>edges(b).map(([q,r])=>segmentDistance(p,q,r))),...b.flatMap(p=>edges(a).map(([q,r])=>segmentDistance(p,q,r))));}
function featureClear(ring,surface,web,{edge=false}={}){
  const outer=surface.outlines?.[0]||surface.outline;
  if(!edge&&(!ring.every(p=>inside(p,outer))||boundaryDistance(ring,edges(outer))<web-eps))return false;
  if((surface.holes||[]).some(h=>inside(h,ring)||Math.min(...edges(ring).map(([a,b])=>segmentDistance(h,a,b)))<(h.r||h.diameterMm/2)+web-eps))return false;
  return !(surface.cutouts||[]).some(c=>ringDistance(ring,c.points)<web-eps);
}
/** The saved directional face is a stable reference only when exactly one true straight edge lies there. */
export function tabNutEdge(surface,face){
  const side={front:['y','max'],back:['y','min'],left:['x','min'],right:['x','max']}[face];
  if(!side||surface.outlines?.length!==1)return null;
  let ring=clean(surface.outlines[0]);if(area(ring)<0)ring=ring.reverse();
  const [axis,bound]=side,value=surface.box[bound][axis];
  const candidates=edges(ring).map(([a,b],index)=>({a,b,index,length:Math.hypot(b.x-a.x,b.y-a.y)})).filter(e=>Math.abs(e.a[axis]-value)<eps&&Math.abs(e.b[axis]-value)<eps&&e.length>1);
  if(candidates.length!==1)return null;
  const e=candidates[0],u={x:(e.b.x-e.a.x)/e.length,y:(e.b.y-e.a.y)/e.length};
  return {...e,ring,u,v:{x:-u.y,y:u.x},key:`boundary:${face}`};
}

export function planTabNutGeometry({host,child,face,connectionId='tab-nut',settings=face?.selection?.fastener}={}){
  const fail=reason=>({ok:false,reason,connectionId});
  const p=normalizeTabNut(settings);if(!p)return fail('榫槽／M3 規格不合法。');
  if(!host?.outlines?.length||!child?.outlines?.length)return fail('缺少板材輪廓。');
  const s=face.selection;
  if(!['top','bottom'].includes(s.hostFace)||!['front','back','left','right'].includes(s.childFace)||s.gap!==0||Math.abs(face.rotation?.[2]?.[2])>eps)return fail('榫槽需要立板直邊垂直接到承接板大面，面間距為 0。');
  const tHost=host.box.max.z-host.box.min.z,tChild=child.box.max.z-child.box.min.z;
  if(![tHost,tChild].every(t=>Number.isFinite(t)&&t>=2.5&&t<=3.5))return fail('此試作適用公稱 3 mm 板；請核對兩片實際板厚（2.5–3.5 mm），不會自動修改板厚。');
  const edge=tabNutEdge(child,s.childFace);if(!edge)return fail('所選面不是唯一真實直板邊；請選直邊，不能用外框包圍盒代替。');
  const tip=p.screwLengthMm-tHost-p.washerThicknessMm,nutLo=p.nutCenterMm-(p.nutHeightMm+p.nutClearanceMm)/2,nutHi=p.nutCenterMm+(p.nutHeightMm+p.nutClearanceMm)/2;
  if(tip<nutHi+.5-eps)return fail('螺絲太短，必須穿滿螺母並至少露出一牙。');
  const top=tip+p.endClearanceMm,b=p.clearanceDiameterMm/2,n=(p.nutAcrossMm+p.nutClearanceMm)/2,halfPitch=p.tabPitchMm/2,halfTab=p.tabWidthMm/2;
  if(top<nutHi||p.washerDiameterMm<p.clearanceDiameterMm+1||p.headDiameterMm<=3)return fail('螺絲、墊片或末端避空設定不合法。');
  const otherEdges=edges(edge.ring).filter((_,i)=>i!==edge.index),offsets=[p.alongMm,...(p.moreAlongMm||[])],path=[edge.a],sets=[],hostRings=[],slots=[],holes=[],childRings=[];
  for(const [si,along] of offsets.entries()){
    const center=edge.length/2+along,id=si?`${connectionId}/set:${si}`:connectionId;
    if(si&&along-offsets[si-1]<p.tabPitchMm+p.tabWidthMm+p.slotClearanceMm+p.minWebMm)return fail('卡榫組數太多，相鄰兩組放不下。');
    if(center-halfPitch-halfTab<p.minWebMm||edge.length-center-halfPitch-halfTab<p.minWebMm)return fail('直邊太短或位置太靠邊，無法保留雙榫兩側材料。');
    const pos=(u,v)=>({x:edge.a.x+edge.u.x*(center+u)+edge.v.x*v,y:edge.a.y+edge.u.y*(center+u)+edge.v.y*v});
    const project=(u,v,z=0)=>transformMatePoint(face,{...pos(u,v),z});
    const root=project(0,0),hostZ=s.hostFace==='top'?host.box.max.z:host.box.min.z;
    if(Math.abs(root.z-hostZ)>eps)return fail('立板肩部尚未貼合承接板面。');
    const notch=[[-b,0],[-b,nutLo],[-n,nutLo],[-n,nutHi],[-b,nutHi],[-b,top],[b,top],[b,nutHi],[n,nutHi],[n,nutLo],[b,nutLo],[b,0]].map(([u,v])=>pos(u,v));
    const zone=rect(-n,eps,n,top).map(q=>pos(q.x,q.y));
    if(!zone.every(q=>inside(q,edge.ring))||!featureClear(zone,child,p.minWebMm,{edge:true}))return fail('螺母／螺絲槽會切到既有孔槽或超出立板。');
    if(boundaryDistance(zone,otherEdges)<p.minWebMm-eps)return fail('螺絲末端或螺母槽距離板外緣太近。');
    for(const x of [-halfPitch,halfPitch]){
      if(x>0)path.push(...notch);
      path.push(pos(x-halfTab,0),pos(x-halfTab,-tHost),pos(x+halfTab,-tHost),pos(x+halfTab,0));
      const tabZone=rect(x-halfTab,eps,x+halfTab,p.minWebMm).map(q=>pos(q.x,q.y));
      if(!tabZone.every(q=>inside(q,edge.ring))||boundaryDistance(tabZone,otherEdges)<p.minWebMm-eps||!featureClear(tabZone,child,p.minWebMm,{edge:true}))return fail('定位榫根部距離板外緣或既有孔槽太近。');
      childRings.push(rect(x-halfTab,-tHost,x+halfTab,p.minWebMm).map(q=>pos(q.x,q.y)));
    }
    slots.push(...[-halfPitch,halfPitch].map((x,i)=>({id:`${id}/slot:${i}`,layer:'TAB_NUT_SLOT',points:rect(x-halfTab-p.slotClearanceMm/2,-(tChild+p.slotClearanceMm)/2,x+halfTab+p.slotClearanceMm/2,(tChild+p.slotClearanceMm)/2).map(q=>{const h=project(q.x,0,q.y);return {x:h.x,y:h.y};})})));
    const hole={id:`${id}/bolt`,x:root.x,y:root.y,r:b,layer:'TAB_NUT_BOLT'};
    holes.push(hole);hostRings.push(Array.from({length:48},(_,i)=>({x:hole.x+b*Math.cos(i*Math.PI/24),y:hole.y+b*Math.sin(i*Math.PI/24)})));childRings.unshift(zone);
    sets.push({connectionId:id,settings:{...p,alongMm:along},local:{origin:pos(0,0),u:edge.u,v:edge.v,nutLo,nutHi,tip}});
  }
  path.push(edge.b);
  const childOutline=[...edge.ring.slice(0,edge.index),...path,...edge.ring.slice(edge.index+2)];
  const childGeometry={outlines:[clean(childOutline)],holes:structuredClone(child.holes||[]),cutouts:structuredClone(child.cutouts||[])};
  if(![...slots.map(c=>c.points),...hostRings].every(r=>featureClear(r,host,p.minWebMm)))return fail('承接板插槽或螺絲孔超出板材，或距離既有孔槽太近。');
  const hostGeometry={outlines:structuredClone(host.outlines),holes:[...(structuredClone(host.holes||[])),...holes],cutouts:[...(structuredClone(host.cutouts||[])),...slots]};
  return {ok:true,kind:p.kind,connectionId,settings:p,edgeKey:edge.key,tHost,tChild,hostGeometry,childGeometry,
    features:{host:[...slots.map(c=>c.points),...hostRings],child:childRings},sets,
    local:sets[0].local,
    hardware:{screw:{diameterMm:3,lengthMm:p.screwLengthMm},nut:{acrossMm:p.nutAcrossMm,heightMm:p.nutHeightMm},washer:{diameterMm:p.washerDiameterMm,thicknessMm:p.washerThicknessMm}},
    warnings:['試作尺寸；材質、雷射切縫與五金實物待核對。','未做切縫補償；加工軟體依實測補償一次。','螺母由立板側面放入，螺絲由底板外側穿入；工具空間與負載需實物核對。']};
}
