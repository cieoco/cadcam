/** Saved-data contract (eager); defaults, names and joint layout are in box-config.js (lazy). */
const bounds={lengthMm:[60,400],widthMm:[60,400],heightMm:[25,120],thicknessMm:[2.5,3.5],flangeMm:[4,20],tabWidthMm:[4,20],tabPitchMm:[12,200],clearanceMm:[0,1],screwLengthMm:[8,30],maxJointSpacingMm:[30,200],jointEndMarginMm:[5,40]},legacy={maxJointSpacingMm:80,jointEndMarginMm:15},sides=['front','back','left','right'];
/** Pre-B2 files: five panels, one set per edge. */
export function normalizeBoxSettings(raw){
 if(!raw||typeof raw!=='object')return null;
 const out={};for(const [k,[min,max]] of Object.entries(bounds)){const v=raw[k]??legacy[k];if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)return null;out[k]=v;}
 const n=raw.jointsPerEdge??1,P=['lid',...sides],p=raw.panels??Object.fromEntries(P.map(k=>[k,k!=='lid']));
 if(n!=='auto'&&!(Number.isInteger(n)&&n>=1&&n<=6)||P.some(k=>typeof p[k]!=='boolean'))return null;
 return {...out,jointsPerEdge:n,panels:Object.fromEntries(P.map(k=>[k,p[k]]))};
}
export function normalizeBoxPanel(raw){
 if(!raw||raw.v!==1||!['base','lid',...sides].includes(raw.role)||typeof raw.rootPart!=='string'||!/^\w[\w.-]*$/.test(raw.rootPart))return null;
 const settings=normalizeBoxSettings(raw.settings);return settings?{v:1,role:raw.role,rootPart:raw.rootPart,settings,...(raw.role==='lid'&&raw.closures&&typeof raw.closures==='object'?{closures:structuredClone(raw.closures)}:{})}:null;
}
export function boxPanelSize(panel){
 const p=panel.settings,t=p.thicknessMm;
 return panel.role==='base'||panel.role==='lid'?{length:p.lengthMm+2*t+2*p.flangeMm,width:p.widthMm+2*t+2*p.flangeMm}:
 {length:['front','back'].includes(panel.role)?p.lengthMm+2*t:p.widthMm,width:p.heightMm};
}
/** Same p1-local coordinates as the existing bar catalog; reference points are not holes. */
export function boxPanelGeometry(comp){
 const p=normalizeBoxPanel(comp?.boxPanel);if(!p)return null;
 const {length,width}=boxPanelSize(p);
 return {outlines:[[{x:0,y:-width/2},{x:length,y:-width/2},{x:length,y:width/2},{x:0,y:width/2}]],holes:[],cutouts:[]};
}
