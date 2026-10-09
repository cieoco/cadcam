/** Immutable connection reads. Design defaults (faceParts / mates) are never a saved endpoint. */
import { normalizeFaceMountContract } from './face-mount-contract.js';
import {pointKeysFor} from './part-types.js';

const clone = value => structuredClone(value);
const fixedBar = comp => comp?.type === 'bar' && [comp.p1, comp.p2].every(p => p && ['fixed', 'motor'].includes(p.type));
const reason = (code, message) => ({ code, message });
const jointPointsOf = c => pointKeysFor(c).map(k=>c[k]).filter(Boolean);
const pointsOf = c => [...jointPointsOf(c),...(c.holes || [])];
const pointExists = (comps,moduleId,id) => typeof id==='string'&&comps.some(c=>c.moduleId===moduleId&&pointsOf(c).some(p=>p.id===id));
const frameExists = (comps,moduleId) => comps.some(c=>c.moduleId===moduleId&&jointPointsOf(c).some(p=>['fixed','motor'].includes(p.type)));
const baseExists = (comps,moduleId,id) => comps.some(c=>c.moduleId===moduleId&&jointPointsOf(c).some(p=>p.id===id&&['fixed','motor'].includes(p.type)));
const poseValid = p => p&&['x','y','a'].every(k=>typeof p[k]==='number'&&Number.isFinite(p[k]));
const edgeValid = k => Number.isInteger(k)&&k>=0;
const unique = (list,predicate) => {const matches=list.filter(predicate);return {value:matches.length===1?matches[0]:null,ambiguous:matches.length>1};};

/** Host identity alone is also used by legacy geometry adapters; no pose solving. */
export function readConnectionHost({comps=[],modules=[],mount}={}){
 const target=mount?.to || {},orient=mount?.orient,face=mount?.face;
 const host={moduleId:target.module,partId:null,face:face?.selection?.hostFace || (orient?.edge==='child'?(orient.face===-1?'bottom':'top'):null),source:null,available:false,reason:null};
 const kinds=['frame','body','output'].filter(k=>target[k]!==undefined);
 if(kinds.length!==1){host.source={kind:'ambiguous-target',reference:clone(target)};host.reason=reason('host_target_ambiguous','宿主接合參照未指定唯一 frame、body 或 output。');return host;}
 const kind=kinds[0];host.source=kind==='frame'?{kind,edge:target.frame?.edge}:kind==='body'?{kind,partId:target.body,...(target.edge!==undefined?{edge:target.edge}:{})}:{kind,outputId:target.output};
 const found=unique(modules,m=>m.id===target.module),mod=found.value;
 if(!mod){host.reason=reason(found.ambiguous?'host_module_ambiguous':'host_module_missing','宿主模組不存在或身分不唯一，請重新選取接合位置。');return host;}
 if(kind==='frame'){
  host.partId='frame';host.edge=target.frame?.edge;
  if(!edgeValid(host.edge))host.reason=reason('host_edge_invalid','宿主底板邊參照不合法。');
  else if(!frameExists(comps,mod.id))host.reason=reason('host_frame_missing','宿主底板固定接點已不存在。');
  else host.available=true;
  return host;
 }
 let body;
 if(kind==='output'){
  const out=unique(mod.outputs || [],o=>o.id===target.output),output=out.value;
  if(!output){host.reason=reason(out.ambiguous?'host_output_ambiguous':'host_output_missing','宿主輸出端不存在或身分不唯一，請重新選取接合位置。');return host;}
  host.pointId=output.at;body=output.body;
  Object.assign(host.source,{at:output.at,body:clone(body),boltPointIds:clone(output.bolts || [])});
  if(!pointExists(comps,mod.id,output.at)){host.reason=reason('host_output_point_missing','宿主輸出端的定位接點已不存在。');return host;}
  if(body?.kind==='points'){
   host.source.points={a:body.a,b:body.b};host.partKind='points';
   if(!face&&!orient&&[body.a,body.b].every(id=>pointExists(comps,mod.id,id)))host.available=true;
   else host.reason=reason('host_part_not_supported','輸出端只保存方向接點，無法解讀為接合板。');
   return host;
  }
 }else body={id:target.body};
 host.partId=body?.id || null;
 const part=unique(comps,c=>c.moduleId===mod.id&&c.id===host.partId),comp=part.value;
 if(!comp){host.reason=reason(part.ambiguous?'host_part_ambiguous':'host_part_missing','宿主接合零件不存在或身分不唯一，請重新選取接合位置。');return host;}
 host.partKind=comp.type;
 if(kind==='output'&&!pointsOf(comp).some(p=>p.id===host.pointId))host.reason=reason('host_output_point_not_on_body','宿主輸出端定位接點不屬於指定零件，請重新選取。');
 else if(body.kind&&comp.type!==body.kind)host.reason=reason('host_part_kind_mismatch','宿主輸出參照的零件種類與實際零件不符。');
 else if(!(face?['bar','triangle','rack']:orient?['bar','triangle']:['bar','triangle','rack','slider']).includes(comp.type))host.reason=reason('host_part_not_supported','宿主輸出端尚無支援的接合板或定位構件。');
 else if(orient&&comp.type==='triangle'&&(comp.shape==='jaw'||!Number.isInteger(target.edge)||target.edge<0||target.edge>2))host.reason=reason('host_edge_invalid','宿主板件接合邊不存在，不能改選另一條邊。');
 else if(orient&&comp.type==='bar'){host.side=orient.side;host.available=true;}
 else host.available=true;
 if(target.edge!==undefined)host.edge=target.edge;
 return host;
}

/**
 * Persisted planar base/output, orient frame/edge and six-face endpoints are
 * different identities. Missing part identity is never inferred from defaults.
 * mount overrides the child's current mount when reading a reselect draft.
 * geometry/drilling/refresh mean the common connection core, not legacy formulas.
 */
export function readConnectionDescriptor({ comps = [], modules = [], childId, mount } = {}) {
 const found=unique(modules,m=>m.id===childId),childModule=found.value;
 const saved=mount===undefined?childModule?.mount:mount,diagnostics=[];
 const result={id:`connection:${childId}`,sourceFormat:saved?.face?'face-v1':saved?.orient?'orient':saved?'planar':'unmounted',source:saved?clone(saved):null,
  host:null,child:null,placement:null,fastener:null,capabilities:{placement:false,endpoints:false,refresh:false,drilling:false,geometry:false},diagnostics,ok:false};
 if(!saved){diagnostics.push(reason(found.ambiguous?'child_module_ambiguous':'connection_missing','尚未設定唯一接合。'));return result;}
 if(saved.face&&saved.orient){diagnostics.push(reason('connection_source_ambiguous','同一接合同時保存 face 與 orient，不能猜選其中一種來源。'));return result;}
 const host=readConnectionHost({comps,modules,mount:saved});let child,valid=true;
 if(saved.face){
  const normalized=normalizeFaceMountContract(saved.face);
  if(!normalized.ok){diagnostics.push(reason('face_record_invalid',normalized.reason));return result;}
  const face=normalized.value;
  result.placement={rotation:clone(face.rotation),translation:clone(face.translation),selection:clone(face.selection),hostThicknessMm:face.hostThicknessMm,childThicknessMm:face.childThicknessMm};
  result.fastener=face.selection.brackets?clone(face.selection.brackets):null;
  // Only older *confirmed fastener records* identify a legacy child part. A
  // current preset or normalDeg cannot resolve missing persisted identity.
  const explicit=face.childPart!==undefined,partId=explicit?face.childPart:face.selection.brackets?.childPart;
  child={moduleId:childId,partId:partId || null,face:face.selection.childFace,source:{kind:explicit?'face-child-part':partId?'legacy-bracket':'legacy-ambiguous'},available:false,reason:null};
  if(!partId)child.reason=reason('legacy_child_endpoint_ambiguous','舊接合未保存安裝端零件，請重新選面；已保留原安裝姿態。');
  else if(partId==='frame'){
   child.available=frameExists(comps,childId);if(!child.available)child.reason=reason('child_frame_missing','安裝端底板已不存在，請重新選面。');
  }else{
   const part=unique(comps,c=>c.moduleId===childId&&c.id===partId);
   if(!part.value)child.reason=reason(part.ambiguous?'child_part_ambiguous':'child_part_missing','安裝端接合零件不存在或身分不唯一，請重新選面。');
   else if(!fixedBar(part.value))child.reason=reason('child_part_not_fixed','安裝端接合桿必須是固定桿，請重新選面。');
   else child.available=true;
  }
 }else{
  result.placement={ref:clone(saved.ref),home:clone(saved.home || {}),flip:saved.flip===true,...(saved.orient?{orient:clone(saved.orient)}:{})};
  valid=poseValid(saved.ref);
  if(!valid)diagnostics.push(reason('placement_reference_invalid','接合參考姿態不合法，保留原紀錄但不能重算。'));
  const o=saved.orient;
  if(o&&(o.type!=='orthogonal'||!['host','child'].includes(o.edge)||![1,-1].includes(o.side)||!Number.isFinite(o.childAxisDeg)||o.edge==='child'&&(!edgeValid(o.childEdge)||![1,-1].includes(o.face)))){
   valid=false;diagnostics.push(reason('orient_record_invalid','沿邊安裝方向參數不合法，不能猜成同平面接合。'));
  }
  child=o?{moduleId:childId,partId:'frame',face:null,...(o.edge==='child'?{edge:o.childEdge}:{}),pointId:childModule?.base,source:{kind:'orient-child-frame',basePointId:childModule?.base},available:frameExists(comps,childId),reason:null}
   :{moduleId:childId,partId:null,face:null,pointId:childModule?.base,source:{kind:'base-point',pointId:childModule?.base},available:baseExists(comps,childId,childModule?.base),reason:null};
  if(!child.available)child.reason=reason(o?'child_frame_missing':'child_base_missing','安裝端固定板或定位接點已不存在。');
  result.fastener=o?.joint?clone(o.joint):null;
 }
 if(!childModule){child.available=false;child.reason=reason(found.ambiguous?'child_module_ambiguous':'child_module_missing','安裝模組不存在或身分不唯一，請重新選取接合位置。');}
 result.host=host;result.child=child;result.capabilities.placement=valid; // A saved transform survives unavailable endpoints.
 if(saved.face&&host.source?.kind==='body'||!saved.face&&!saved.orient&&host.source?.kind!=='output'){
  valid=false;result.capabilities.placement=false;diagnostics.push(reason('connection_target_invalid','目前 v1 來源不支援此目標格式，保留參照但不猜成其他接合。'));
 }
 for(const endpoint of [host,child])if(endpoint.reason)diagnostics.push({...endpoint.reason,moduleId:endpoint.moduleId,partId:endpoint.partId});
 result.capabilities.endpoints=host.available&&child.available;result.ok=valid&&result.capabilities.endpoints;
 const commonFace=result.ok&&saved.face&&host.source.kind==='output';
 result.capabilities.refresh=!!commonFace;result.capabilities.drilling=!!commonFace&&host.partKind!=='rack';result.capabilities.geometry=result.capabilities.drilling;
 if(saved.face&&host.source?.kind==='frame')diagnostics.push({...reason('host_frame_not_supported','已保留原安裝姿態；此底板接法尚未支援重新定位與固定孔。'),package:'W4b',capabilities:['refresh','drilling','geometry']});
 else if(!saved.face)diagnostics.push({...reason('legacy_connection_geometry_bridge','接合定位沿用原流程；此接法尚未接入共用接件與固定孔驗證。'),package:'W4b',capabilities:['refresh','drilling','geometry']});
 return result;
}

export function readConnectionDescriptors({ comps = [], modules = [] } = {}) {
 return modules.filter(m=>m.mount).map(m=>readConnectionDescriptor({comps,modules,childId:m.id}));
}
