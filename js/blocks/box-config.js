/** Persistent generator inputs only; geometry and mounts are derived. */
export const BOX_DEFAULTS=Object.freeze({lengthMm:120,widthMm:80,heightMm:50,thicknessMm:3,flangeMm:6,tabWidthMm:8,tabPitchMm:24,clearanceMm:.15,screwLengthMm:12});
export const BOX_ROLES=Object.freeze(['base','front','back','left','right']);
export const BOX_NAMES=Object.freeze({base:'底板',front:'前板',back:'後板',left:'左板',right:'右板'});
const bounds={lengthMm:[60,400],widthMm:[60,400],heightMm:[25,120],thicknessMm:[2.5,3.5],flangeMm:[4,20],tabWidthMm:[4,20],tabPitchMm:[12,200],clearanceMm:[0,1],screwLengthMm:[8,30]};
export function normalizeBoxSettings(raw){
 if(!raw||typeof raw!=='object')return null;
 const out={};for(const [k,[min,max]] of Object.entries(bounds)){const v=raw[k];if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)return null;out[k]=v;}
 return out;
}
export function normalizeBoxPanel(raw){
 if(!raw||raw.v!==1||!BOX_ROLES.includes(raw.role)||typeof raw.rootPart!=='string'||!/^\w[\w.-]*$/.test(raw.rootPart))return null;
 const settings=normalizeBoxSettings(raw.settings);return settings?{v:1,role:raw.role,rootPart:raw.rootPart,settings}:null;
}
export function boxPanelSize(panel){
 const p=panel.settings,t=p.thicknessMm;
 return panel.role==='base'?{length:p.lengthMm+2*t+2*p.flangeMm,width:p.widthMm+2*t+2*p.flangeMm}:
 {length:['front','back'].includes(panel.role)?p.lengthMm+2*t:p.widthMm,width:p.heightMm};
}
/** Same p1-local coordinates as the existing bar catalog; reference points are not holes. */
export function boxPanelGeometry(comp){
 const p=normalizeBoxPanel(comp?.boxPanel);if(!p)return null;
 const {length,width}=boxPanelSize(p);
 return {outlines:[[{x:0,y:-width/2},{x:length,y:-width/2},{x:length,y:width/2},{x:0,y:width/2}]],holes:[],cutouts:[]};
}
