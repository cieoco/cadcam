// 管夾式針筒的板材清單：共用實際材料場景，不另造示範托架或改變作品。
import {buildSyringeInstallPreview} from './syringe-install-preview.js';
import {inside} from './part-fusion.js';
import {segmentDistance} from './tab-nut-geometry.js';
import {cncWarnings} from './cnc-check.js';
import {normalizeFabricationProfile} from './fabrication-profile.js';
const boardKinds=new Set(['bar','triangle','gear','fusion','rack','frame','mounted-frame']);
const edge=(p,r)=>Math.min(...r.map((a,i)=>{const b=r[(i+1)%r.length];return Math.hypot(b.x-a.x,b.y-a.y)<1e-9?Math.hypot(p.x-a.x,p.y-a.y):segmentDistance(p,a,b);}));
const same=(h,id)=>h.id===id||h.mountIds?.includes(id);
const rounded=n=>Math.round(n*1000)/1000;
/** 1 mm 餘料是幾何門檻，非材料強度／加工能力保證。 */
export function syringeBoardIssue(g){
 if(!g.outlines?.length||![g.thicknessMm,...g.outlines.flat().flatMap(p=>[p.x,p.y]),...(g.holes||[]).flatMap(h=>[h.x,h.y,h.r]),...(g.cutouts||[]).flatMap(c=>c.points.flatMap(p=>[p.x,p.y]))].every(Number.isFinite))return '板材外形或尺寸無效';
 for(const [i,h] of (g.holes||[]).entries()){
  if(!(h.r>0)||!g.outlines.some(r=>inside(h,r)&&edge(h,r)>=h.r+1-.001))return `孔 ${h.id||i+1} 離板邊不足1 mm`;
  if(g.cutouts?.some(c=>inside(h,c.points)||edge(h,c.points)<h.r+1-.001))return `孔 ${h.id||i+1} 與槽口間距不足1 mm`;
  if(g.holes.slice(i+1).some(q=>Math.hypot(h.x-q.x,h.y-q.y)<h.r+q.r+1-.001))return `孔 ${h.id||i+1} 與其他孔重疊或間距不足1 mm`;
 }
 return null;
}
export function syringePlateManufacturing(comps,params,fabrication,{modules=[]}={}){
 const normalized=normalizeFabricationProfile(fabrication??undefined);if(!normalized.ok)throw Error(normalized.message);fabrication=normalized.profile;
 const {model,catalog,work,validity}=buildSyringeInstallPreview({comps,params,fabrication,modules},{assembly:true});
 if(!model)throw Error(`目前機構無有效姿態，無法核對板件與隔圈：${validity?.reason||'請先修正連接或行程'}`);
 const parts=[],excluded=[],hardware=[],checks=[],seen=new Set();
 for(const material of model.materialParts||[]){
  const g=material.geometry;if(seen.has(g.id)||!boardKinds.has(g.kind))continue;seen.add(g.id);
  const sourceIds=[...(g.sourceIds||[g.id])];
  // 固定宿主若已併入機架，只匯出一次機架，仍可由宿主的選取追溯。
  for(const s of comps.filter(c=>c.type==='syringe'))if(g.holes.some(h=>[0,1].some(i=>same(h,`${s.id}_clamp_${i}`))))sourceIds.push(s.a.componentId);
  const reason=syringeBoardIssue(g);
  if(reason){excluded.push({id:g.id,sourceIds,reason});continue;}
  const stock=catalog.memberStocks[g.id]||{};
  parts.push({id:g.id,sourceIds:[...new Set(sourceIds)],quantity:1,thicknessMm:g.thicknessMm,material:stock.material||'unspecified',geometry:g,checked:true});
 }
 for(const d of catalog.diagnostics.filter(d=>d.code==='material_geometry_unavailable'))for(const id of d.sourceIds||[])if(!excluded.some(p=>p.id===id))excluded.push({id,sourceIds:[id],reason:d.reason});
 for(const shape of model.syringes||[]){
  const s=comps.find(c=>c.id===shape.id),mount=shape.mount,feet=mount?.fasteners?.length?mount.fasteners:mount?.candidateFasteners||[];
  hardware.push({id:s.id,kind:'purchased',label:`${s.id}：針筒與固定環為立體／外購件，不列入板材DXF。`});
  if(!feet.length){hardware.push({id:s.id,kind:'unverified',label:`${s.id}：固定孔與隔圈尚無可核對資料（${mount?.reason||'非管夾安裝'}），未產生隔圈尺寸。`});continue;}
  if(mount?.reason==='clamp_fastener_clearance')hardware.push({id:s.id,kind:'unverified',label:`${s.id}：24 mm孔距固定環的參考環壁與螺絲／墊片仍有干涉，須依外購實物核對；下列隔圈為目前裝配尺寸，不代表固定環已合格。`});
  if(shape.alignmentMm===null||Math.abs(shape.alignmentMm)>.1){hardware.push({id:s.id,kind:'unverified',label:`${s.id}：推桿與連接板高度未對齊，隔圈尺寸暫不列製作規格。`});continue;}
  const matched=[];
  for(const f of feet){
   const carrier=parts.find(p=>p.id===f.framePartId),hole=carrier?.geometry.holes.find(h=>same(h,f.holeId));
   if(!hole){hardware.push({id:s.id,kind:'unverified',label:`${s.id}：承載板 ${f.framePartId} 的孔 ${f.holeId} 未通過核對，對應隔圈暫不列製作規格。`});continue;}
   matched.push(f.holeId);
   if(!(f.spacerHeight>=0&&Number.isFinite(f.spacerHeight)))continue;
   const spec={id:s.id,holeId:f.holeId,framePartId:f.framePartId,kind:'spacer',quantity:f.spacerHeight>.001?1:0,outerDiameterMm:f.spacerOuterDiameter,innerDiameterMm:f.spacerInnerDiameter,lengthMm:rounded(f.spacerHeight),hole:{x:hole.x,y:hole.y,diameterMm:hole.r*2}};
   spec.label=`${s.id}／${f.holeId}：隔圈外徑${spec.outerDiameterMm}、內徑${spec.innerDiameterMm}、長${spec.lengthMm} mm × ${spec.quantity}，對應 ${f.framePartId} 孔 (${rounded(hole.x)}, ${rounded(hole.y)})／Ø${rounded(hole.r*2)}；立體件不輸出DXF。`;
   hardware.push(spec);
  }
  checks.push({syringeId:s.id,mode:s.mountMode,expectedHoleCount:shape.pivot?1:2,matchedHoleIds:matched,status:matched.length===feet.length?'geometry-checked':'incomplete',spacingMm:shape.pivot?null:24,alignmentMm:shape.alignmentMm});
 }
 const warnings=[...excluded.map(p=>`未輸出 ${p.id}：${p.reason}。`),...hardware.filter(h=>h.kind==='unverified').map(h=>h.label),'板材孔位／板邊已作幾何核對；實物配合、全行程干涉、承載與水路仍待驗證。自製角件請用「轉接座 STL」，不展平成DXF。'];
 if(comps.some(c=>c.type==='syringe'&&!c.spec.calibrated))warnings.push('針筒仍使用未實物校正的示範尺寸。');
 return {parts,excluded,hardware,checks,warnings,purchased:hardware.map(h=>h.label),fabrication:work.fabrication,syringes:comps.filter(c=>c.type==='syringe'),plateOnly:true,cncWarnings:cncWarnings(parts.map(p=>({name:p.id,...p.geometry})),work.fabrication.cnc)};
}
