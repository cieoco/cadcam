/** Generator inputs and defaults (lazy). The saved-data contract (bounds, normalization, sizes) is in box-contract.js. */
export * from './box-contract.js';
export const BOX_DEFAULTS=Object.freeze({lengthMm:120,widthMm:80,heightMm:50,thicknessMm:3,flangeMm:6,tabWidthMm:8,tabPitchMm:24,clearanceMm:.15,screwLengthMm:12,jointsPerEdge:'auto',maxJointSpacingMm:80,jointEndMarginMm:15,panels:Object.freeze({lid:false,front:true,back:true,left:true,right:true})});
export const BOX_ROLES=Object.freeze(['base','front','back','left','right']);
export const BOX_NAMES=Object.freeze({base:'底板',front:'前板',back:'後板',left:'左板',right:'右板',lid:'上蓋'});
/** Joint sets per side edge: usable span = edge − 2×margin, evenly spaced centres (from the edge start). */
export function boxJointLayout(s){
 const m=s.jointEndMarginMm,out={};
 for(const r of BOX_ROLES.slice(1)){
  const e=r==='front'||r==='back'?s.lengthMm+2*s.thicknessMm:s.widthMm,u=e-2*m,k=s.jointsPerEdge==='auto'?Math.max(1,Math.ceil(u/s.maxJointSpacingMm-1e-9)):s.jointsPerEdge;
  out[r]={sets:k,edgeLengthMm:e,centersMm:Array.from({length:k},(_,i)=>m+u/k*(i+.5))};
 }
 return out;
}
