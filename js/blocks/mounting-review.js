/** Compare fabrication interfaces in part-local coordinates, never screen or animation coordinates.
 * Existing geometry producers remain the authority; this module owns only the edit decision.
 */
import {buildPartGeometryCatalog} from './part-geometry.js';
import {readConnectionDescriptor} from './connection-descriptor.js';
import {buildMotorMounts,buildMotorExportMounts} from './motor-mounts.js';
import {motorPointIds,pointCoords,frameNodeIds,sliderMountInfo,isHiddenSliderRailPoint} from './model.js';
import {motorTypeAt} from './motor-tools.js';
import {FABRICATION_DEFAULTS} from './fabrication-profile.js';
import {prepareConnectionWork} from './connection-work.js';

const pointKeys=['p1','p2','p3'];
const work=s=>({...s,comps:s.comps||[],modules:s.modules||[],params:s.params||s.topo?.params||{},fabrication:s.fabrication||FABRICATION_DEFAULTS});
function interfaces(s){
  const result=new Map(),add=(id,label,parts)=>{const r={id,label,parts:parts.filter(Boolean)};result.set(id,r);return r;};
  for(const c of s.comps){
    if(c.type==='syringe'&&['fixed-axis','pivot'].includes(c.mountMode))add(`syringe:${c.id}`,'針筒固定環',[c.a?.componentId,c.b?.componentId,'frame']);
    const center=c.motorMount?.center || pointKeys.map(k=>c[k]).find(p=>p?.physicalMotor)?.id;
    // A motor keeps its identity when the user chooses a different output body.
    const motor=c.motorMount?.motor||c.physicalMotor||pointKeys.map(k=>c[k]).find(p=>p?.physicalMotor)?.physicalMotor;
    if(center&&(c.type==='bar'&&c.isInput||['gear','pulley'].includes(c.type)))add(`motor:${c.moduleId||'#root'}:${motor||center}`,'馬達固定座',[c.id,c.motorMount?.frameBody||c.motorCarrier||'frame',c.moduleId?`${c.moduleId}-frame`:null]);
    if(c.type==='rack'&&c.framePins?.length)add(`rack:${c.id}`,'齒條導銷',[c.id,'frame',c.moduleId?`${c.moduleId}-frame`:null]);
    if(c.type==='gear')for(const other of s.comps.filter(o=>['bar','triangle'].includes(o.type))){
      const ids=pointKeys.map(k=>other[k]?.id);
      if(ids.includes(c.p1.id)&&ids.includes(c.p2.id))add(`gear:${c.id}:${other.id}`,'齒輪與桿件兩孔',[c.id,other.id]).pointIds=[c.p1.id,c.p2.id];
    }
  }
  for(const m of s.modules){
    if(!m.mount)continue;
    const d=readConnectionDescriptor({...s,childId:m.id});
    const part=endpoint=>endpoint?.partId==='frame'?`${endpoint.moduleId}-frame`:endpoint?.partId;
    add(`connection:${m.id}`,m.mount.face?.selection?.fastener?'榫槽接合':'板件接合',[part(d.host),part(d.child)]);
  }
  return result;
}
function catalog(s){
  s=structuredClone(s);
  s.modules=prepareConnectionWork(s.comps,s.modules,{...(s.topo||{}),params:s.params},{exportSettings:s.fabrication.export||{},stockMm:s.fabrication.cnc?.stockThicknessMm||3}).modules;
  const pts=pointCoords(s.comps),motorIds=new Set(motorPointIds(s.comps)),type=id=>motorTypeAt(s.comps,id);
  const planned=buildMotorMounts({motorIds,groundIds:frameNodeIds(s.comps),staticPoints:pts,comps:s.comps,compiledSteps:[],sliderMountInfo:id=>sliderMountInfo(s.comps,id),isHiddenSliderRailPoint:id=>isHiddenSliderRailPoint(s.comps,id),motorTypeForCenter:type});
  const mounts=buildMotorExportMounts({comps:s.comps,pts,motorCenterIds:motorIds,motorMounts:planned,typeForCenter:type,ttSettings:s.fabrication.ttMount,mg995Settings:s.fabrication.mg995Mount});
  return buildPartGeometryCatalog({...s,mounts});
}
function partFor(catalog,id){
  return catalog.parts[id] || Object.values(catalog.parts).find(p=>p.sourceIds.includes(id)) || (id.endsWith('-frame')&&catalog.parts.frame?.sourceModuleIds?.includes(id.slice(0,-6))?catalog.parts.frame:null);
}
function footprint(part,s,relation,catalog){
  let local=p=>({x:p.x,y:p.y});
  if(['frame','module-frame'].includes(part.binding.kind)){
    const nodes=s.comps.filter(c=>part.moduleId==null?!c.moduleId:c.moduleId===part.moduleId).flatMap(c=>pointKeys.map(k=>c[k])).filter(p=>p&&['fixed','motor'].includes(p.type));
    const owned=new Set(s.comps.filter(c=>c.frameHole).map(c=>c.p1.id));
    const unique=[...new Map(nodes.filter(p=>!owned.has(p.id)).map(p=>[p.id,p])).values()].sort((a,b)=>a.id.localeCompare(b.id));
    const a=unique[0],b=unique.find(p=>a&&Math.hypot(p.x-a.x,p.y-a.y)>.001);
    if(a){const angle=b?Math.atan2(b.y-a.y,b.x-a.x):0,c=Math.cos(angle),t=Math.sin(angle);local=p=>({x:(p.x-a.x)*c+(p.y-a.y)*t,y:-(p.x-a.x)*t+(p.y-a.y)*c});}
  }
  let holes=part.holes,cutouts=part.cutouts;
  if(relation.id.startsWith('syringe:')){
    const prefix=`${relation.id.slice(8)}_clamp_`;
    holes=holes.filter(h=>h.id?.startsWith(prefix)||h.mountIds?.some(id=>id.startsWith(prefix)));cutouts=[];
  }else if(relation.id.startsWith('motor:')){
    const motorFeature=f=>/^(TT_|MG995_|N20_)/.test(f.layer||f.purpose||'');
    holes=holes.filter(motorFeature);cutouts=cutouts.filter(motorFeature);
  }else if(relation.pointIds){
    // Only the paired mounting holes; changing a jaw tip is not a mounting edit.
    if(part.binding.kind==='gear')holes=holes.filter(h=>h.layer==='PIN_HOLE'||Math.hypot(h.x,h.y)<.01);
    else{
      const points=catalog.homePoints,a=points[part.binding.pointIds?.[0]],b=points[part.binding.pointIds?.[1]];
      if(a&&b){const angle=Math.atan2(b.y-a.y,b.x-a.x),cs=Math.cos(angle),sn=Math.sin(angle);
        const targets=relation.pointIds.map(id=>points[id]).filter(Boolean).map(p=>({x:(p.x-a.x)*cs+(p.y-a.y)*sn,y:-(p.x-a.x)*sn+(p.y-a.y)*cs}));
        holes=holes.filter(h=>targets.some(p=>Math.hypot(h.x-p.x,h.y-p.y)<.01));
      }
    }
    cutouts=cutouts.filter(c=>c.layer==='TT_SHAFT_FLAT');
  }
  return {holes:holes.map(h=>({...local(h),r:h.r})),cutouts:cutouts.map(c=>c.points.map(local))};
}
const near=(a,b)=>Math.abs(a-b)<=.01;
function same(a,b){
  if(typeof a==='number'&&typeof b==='number')return near(a,b);
  if(Array.isArray(a))return Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>same(v,b[i]));
  if(a&&typeof a==='object')return b&&Object.keys(a).every(k=>same(a[k],b[k]));
  return a===b;
}
/** Legacy files use their currently saved geometry as the approved baseline. No new saved format. */
export function inspectMountingChange(before,after){
  const a=work(before),b=work(after),old=interfaces(a),next=interfaces(b),relations=[...old.values()].filter(r=>next.has(r.id));
  if(!relations.length)return {ok:true,changes:[]};
  const ca=catalog(a),cb=catalog(b),changes=[],issues=[];
  for(const r of relations){
    const n=next.get(r.id),ids=new Set([...r.parts,...n.parts]);
    const changed=[];
    for(const id of ids){
      const p=partFor(ca,id),q=partFor(cb,id);
      if(p&&!q){const reason=cb.diagnostics.find(d=>d.reason&&d.sourceIds?.some(id=>p.sourceIds.includes(id)))?.reason;issues.push(`${r.label}：${reason||`${id} 的加工幾何無法核對，請返回調整。`}`);continue;}
      if(p&&q&&!same(footprint(p,a,r,ca),footprint(q,b,n,cb)))changed.push(id);
    }
    const syringeId=r.id.startsWith('syringe:')?r.id.slice(8):null;
    const outputChanged=syringeId&&!same(a.comps.find(c=>c.id===syringeId)?.b,b.comps.find(c=>c.id===syringeId)?.b);
    if(changed.length||outputChanged||!same(r.parts,n.parts))changes.push({id:r.id,label:r.label,parts:changed.length?changed:[...ids]});
  }
  return {ok:!issues.length,changes,issues:[...new Set(issues)]};
}
