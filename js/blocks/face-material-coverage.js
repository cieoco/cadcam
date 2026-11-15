/** Bad machining does not invalidate a known pose; fastening remains strict. */
import {hitLabels} from './part-labels.js';
export const machiningOutsideMaterial = row => row?.reason === 'unassigned_machining_feature' && !!row.partId && !!row.pickKey;
export const nonBlockingMaterialCoverage = (row,positioning=false) => positioning && machiningOutsideMaterial(row) || row?.code === 'material_kind_not_supported' && row.kind === 'syringe' || row?.code === 'material_representation_not_supported' && ['motors','pins','grounds'].includes(row.kind);

export function materialName(id,model,displayName,comps,modules,labelOpts){
 const part=model?.materialParts?.find(p=>p.partId===id);if(!part)return id;
 if(part.geometry.kind==='bracket-wing')return `${displayName(part.moduleId)}的角碼`;
 if(part.geometry.kind.startsWith('screw')||part.geometry.kind==='washer')return `${displayName(part.moduleId)}的固定螺絲`;
 return hitLabels([id],comps,modules,labelOpts)[0] || id;
}
/** A planar layer warning cannot override proven separation in the actual 3D pose.
 * Unknown geometry remains a warning. Hardware spans include both end bodies. */
export function spatialPlaneFindings(findings,model){
 const bounds=id=>{const p=model?.materialParts?.find(p=>p.partId===id),m=p?.pose?.matrix,g=p?.geometry;if(!m||m.length!==16||!m.every(Number.isFinite)||m[15]!==1||!g?.outlines?.length||!(g.thicknessMm>0))return null;
  const points=g.outlines.flat().flatMap(p=>[0,g.thicknessMm].map(z=>[m[0]*p.x+m[4]*p.y+m[8]*z+m[12],m[1]*p.x+m[5]*p.y+m[9]*z+m[13],m[2]*p.x+m[6]*p.y+m[10]*z+m[14]]));
  if(!points.length||points.some(p=>!p.every(Number.isFinite)))return null;
  return {min:[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...points.map(p=>p[i])))};};
 return findings.filter(f=>{const ids=f.parts;if(!['same-layer','hardware'].includes(f.kind)||!ids||ids.length<2)return true;const boxes=ids.map(bounds);if(boxes.some(b=>!b))return true;
  const last=boxes.at(-1),span=boxes.slice(0,-1);return ![0,1,2].some(i=>Math.min(Math.max(...span.map(b=>b.max[i])),last.max[i])-Math.max(Math.min(...span.map(b=>b.min[i])),last.min[i])<=1e-7);
 });
}
/** A screw shaft, head and washer at one joint are one place to inspect. */
export function groupMaterialFindings(findings){
 const groups=new Map();for(const f of findings){const ids=f.partIds || [],key=ids.map(id=>id.startsWith('connection:')?id.replace(/\/(screw|head|washer)$/,''):id).sort().join('|');
  if(!key){groups.set(f,{...f});continue;}const old=groups.get(key);if(!old)groups.set(key,{...f,partIds:[...ids],pickKeys:[...(f.pickKeys || [])],contactPairs:1});else{old.partIds=[...new Set([...old.partIds,...ids])];old.pickKeys=[...new Set([...old.pickKeys,...(f.pickKeys || [])])];old.contactPairs++;}
 }return [...groups.values()];
}
export function liveMaterialReport(live,report,model,displayName,comps,modules,opts){
 if(!report)return null;const plane=spatialPlaneFindings(live.findings,model),findings=groupMaterialFindings(report.findings || []);
 return {n:plane.length,labels:[...new Set([...hitLabels(plane.flatMap(f=>f.parts || []),comps,modules,opts),...findings.flatMap(f=>f.partIds.map(id=>materialName(id,model,displayName,comps,modules,opts)))])],material:{...report,findings}};
}
