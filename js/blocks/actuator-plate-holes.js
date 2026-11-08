import {pointRefs} from './model.js';
import {attachmentPoint} from '../core/syringe.js';
/** Restore/repartition real standard-board holes for one existing mounting candidate. No mutation.
 * The 1 mm web is a geometric prototype check, not a strength/manufacturing claim. */
import {deriveMotorMounts} from './build-plan.js';
import {inspectLinkExport,motorMountFeatures} from './exporters.js';
import {holeWorld} from '../core/local-holes.js';
import {blankGeometry,isOutputBlank} from './standard-blank.js';
import {FABRICATION_DEFAULTS,actuatorMountSettings} from './fabrication-profile.js';
const keys=['p1','p2','p3'];
const distance=(p,a,b)=>{const x=b.x-a.x,y=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*x+(p.y-a.y)*y)/(x*x+y*y||1)));return Math.hypot(p.x-a.x-t*x,p.y-a.y-t*y);};
const edge=(p,r)=>Math.min(...r.map((a,i)=>distance(p,a,r[(i+1)%r.length])));
const inside=(p,r)=>{let h=false;for(let i=0,j=r.length-1;i<r.length;j=i++)if((r[i].y>p.y)!==(r[j].y>p.y)&&p.x<(r[j].x-r[i].x)*(p.y-r[i].y)/(r[j].y-r[i].y)+r[i].x)h=!h;return h;};
const referencesPoint=(value,id)=>value===id||!!value&&typeof value==='object'&&Object.values(value).some(v=>referencesPoint(v,id));
const usedPoint=(comps,modules,owner,h,params)=>pointRefs(comps,h.id).some(r=>r.comp!==owner)||comps.some(c=>c!==owner&&referencesPoint(c,h.id))||(modules || []).some(m=>referencesPoint(m,h.id))||comps.some(c=>c.type==='syringe'&&['a','b'].some(k=>{const r=c[k],p=r?.componentId===owner.id&&attachmentPoint(r,comps,params),q=holeWorld(owner,h);return p&&Math.hypot(p.x-q.x,p.y-q.y)<.001;}));
export function planActuatorPlateHoles(source){
 const relevant=source.comps.some(c=>isOutputBlank(c)||c.standardBlank?.mountHoles?.length||c.motorMount?.frameBody&&source.comps.some(h=>h.id===c.motorMount.frameBody&&h.standardBlank?.kind==='plate'));if(!relevant)return {ok:true,comps:source.comps,reports:[]};
 const comps=structuredClone(source.comps),fabrication=source.fabrication || FABRICATION_DEFAULTS,reports=[];
 const mounts=deriveMotorMounts(comps).map(m=>({...m,settings:actuatorMountSettings(fabrication,m.kind)}));
 for(const host of comps.filter(c=>c.type==='triangle'&&c.standardBlank?.kind==='plate')){
  const pool=[...(host.holes || []),...(host.standardBlank.mountHoles || [])].sort((a,b)=>a.v-b.v||a.u-b.u),attached=mounts.filter(m=>m.frameBody===host.id);
  if(!attached.length&&!host.standardBlank.mountHoles?.length)continue;
  const ring=blankGeometry(host,keys.map(k=>host[k])),centers=new Set(attached.map(m=>m.pointId)),features=[];
  for(const mount of attached){const ref=pool.find(h=>h.id===mount.pointId),primary=keys.map(k=>host[k]).find(p=>p.id===mount.pointId),axis=ref?holeWorld(host,ref):primary;if(!axis||Math.hypot(axis.x-mount.center.x,axis.y-mount.center.y)>.0001)return {ok:false,message:'馬達軸心需保持在所選座板格位；請回安裝選孔，不能單獨搬移軸心。'};const f=motorMountFeatures(mount);if(!f)return {ok:false,message:'這個型號尚無可核對的標準板安裝孔，請保留模擬或選已支援的型號。'};
   for(const h of f.holes)if(!inside(h,ring)||edge(h,ring)<h.r+1)return {ok:false,message:'座板無法容納馬達安裝孔，請加大板材或移動軸心。'};
   for(const c of f.cutouts)if(c.points.some(p=>!inside(p,ring)||edge(p,ring)<1))return {ok:false,message:'座板無法容納馬達穿板槽，請加大板材或移動軸心。'};
   features.push(f);
  }
  const holes=features.flatMap(f=>f.holes),cuts=features.flatMap(f=>f.cutouts);
  for(let i=0;i<holes.length;i++){const h=holes[i];if(holes.slice(i+1).some(q=>Math.hypot(h.x-q.x,h.y-q.y)<h.r+q.r+1)||cuts.some(c=>inside(h,c.points)||edge(h,c.points)<h.r+1))return {ok:false,message:'專用孔與孔／槽重疊或材料不足1 mm；請核對安裝方向與作品的孔槽規格。'};}
  const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  for(let i=0;i<cuts.length;i++)for(const q of cuts.slice(i+1)){const r=cuts[i].points,t=q.points;if(r.some(p=>inside(p,t))||t.some(p=>inside(p,r))||r.some((a,j)=>t.some((c,k)=>cross(a,r[(j+1)%r.length],c)*cross(a,r[(j+1)%r.length],t[(k+1)%t.length])<0&&cross(c,t[(k+1)%t.length],a)*cross(c,t[(k+1)%t.length],r[(j+1)%r.length])<0)))return {ok:false,message:'同板的馬達穿板槽互相重疊，請分開軸心。'};}
  const occupied=(p,r)=>features.some(f=>f.holes.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<r+q.r+1-1e-6)||f.cutouts.some(c=>inside(p,c.points)||edge(p,c.points)<r+1-1e-6));
  if(comps.some(c=>c.type==='syringe'&&['a','b'].some(k=>{const r=c[k],p=r?.componentId===host.id&&attachmentPoint(r,comps,source.params);return p&&occupied(p,1.6);})))return {ok:false,message:'馬達安裝特徵占用既有針筒接合位置，請換位置。'};
  for(const k of keys)if(!centers.has(host[k].id)&&occupied(host[k],1.6))return {ok:false,message:'安裝特徵占用板材主孔，請改用較大座板或另一個軸心孔。'};
  const used=h=>usedPoint(comps,source.modules,host,h,source.params);
  const available=[],parked=[];
  for(const h of pool){if(occupied(holeWorld(host,h),(h.diameter || 3.2)/2)){if(!centers.has(h.id)&&(h.type==='fixed'||used(h)))return {ok:false,message:'安裝特徵會占用已固定或已連接的格孔，請先解除或換位置。'};parked.push(h);}else available.push(h);}
  host.holes=available;if(parked.length)host.standardBlank.mountHoles=parked;else delete host.standardBlank.mountHoles;
  reports.push({hostId:host.id,available:available.length,occupied:parked.length});
 }
 for(const out of comps.filter(isOutputBlank)){
  const pool=[...(out.holes || []),...(out.standardBlank.mountHoles || [])].sort((a,b)=>a.v-b.v||a.u-b.u),L=source.params[out.lenParam],active=out.isInput&&(['mg995','tt'].includes(out.motorType || 'tt')||out.motorType==='n20'&&fabrication.drive?.n20Spec===1),g=inspectLinkExport({...out,holes:[]},L,{...fabrication.export,drive:fabrication.drive}),special=g.holes.filter(h=>/^(MG995_HORN|TT_HUB|N20_HUB)/.test(h.layer));
  const screws=special.filter(h=>/^(MG995_HORN|TT_HUB|N20_HUB)_SCREW$/.test(h.layer)).length;if(active&&screws<2)return {ok:false,message:'輸出板至少需要2顆有效軸接頭固定螺絲，請調整板寬或孔規格。'};
  const available=[],parked=[],used=h=>usedPoint(comps,source.modules,out,h,source.params);
  if(comps.some(c=>c.type==='syringe'&&['a','b'].some(k=>c[k]?.componentId===out.id&&special.some(q=>Math.hypot(c[k].u-q.x,c[k].v-q.y)<q.r+2.6))))return {ok:false,message:'軸接頭固定孔會占用針筒接合位置，請換接法。'};
  for(const h of pool){if(special.some(q=>Math.hypot(h.u-q.x,h.v-q.y)<(h.diameter || 3.2)/2+q.r+1-1e-6)){if(h.type==='fixed'||used(h))return {ok:false,message:'軸接頭固定孔會占用已固定或已連接格孔，請先解除或換接法。'};parked.push(h);}else available.push(h);}
  out.holes=available;if(parked.length)out.standardBlank.mountHoles=parked;else delete out.standardBlank.mountHoles;
  const full=inspectLinkExport(out,L,{...fabrication.export,drive:fabrication.drive}),ring=full.outlines[0];for(let i=0;i<full.holes.length;i++){const h=full.holes[i];if(!inside(h,ring)||edge(h,ring)<h.r+1-1e-6||full.holes.slice(i+1).some(q=>Math.hypot(h.x-q.x,h.y-q.y)<h.r+q.r+1-1e-6))return {ok:false,message:'輸出板工作孔／軸接頭孔重疊或材料不足1 mm，請加長、加寬或修正孔規格。'};}
  reports.push({outputId:out.id,available:available.length,occupied:parked.length,effectiveScrews:screws});
 }
 return {ok:true,comps,reports};
}
