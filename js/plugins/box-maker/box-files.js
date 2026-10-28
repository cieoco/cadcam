import {faceFileExportData} from '../../blocks/face-export.js';
import {tabNutPartGeometry} from '../../blocks/tab-nut-plan.js';
import {svgForFrameGeometry,dxfForFrameGeometry} from '../../blocks/exporters.js';
import {BOX_NAMES,normalizeBoxSettings} from './box-config.js';
import {boxRoles,boxScrewCount} from './box-generator.js';

/** One separate outline per panel (base, sides, lid), spaced for inspection; not machine-specific nesting. */
export function boxLayout(work){
 const data=faceFileExportData(work),geometry={outlines:[],holes:[],cutouts:[]},panels=[];let y=10;
 const first=work.comps.find(c=>c.boxPanel);
 for(const role of boxRoles(normalizeBoxSettings(first?.boxPanel.settings))){
  const comp=work.comps.find(c=>c.boxPanel?.role===role),g=comp&&tabNutPartGeometry(data.extras,comp,{local:true});
  if(!g)throw Error('盒體板件幾何遺失');
  const points=g.outlines.flat(),minX=Math.min(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxX=Math.max(...points.map(p=>p.x)),maxY=Math.max(...points.map(p=>p.y));
  const move=p=>({x:10+p.x-minX,y:y+p.y-minY}),outlines=g.outlines.map(r=>r.map(move)),holes=g.holes.map(h=>({...h,...move(h)})),cutouts=g.cutouts.map(c=>({...c,points:c.points.map(move)}));
  panels.push({role,name:BOX_NAMES[role],x:10,y,width:maxX-minX,height:maxY-minY,outlines,holes,cutouts});
  geometry.outlines.push(...outlines);geometry.holes.push(...holes);geometry.cutouts.push(...cutouts);y+=maxY-minY+16;
 }
 return {geometry,panels};
}
export function boxFile(work,format){
 const {geometry}=boxLayout(work),p=work.comps[0].boxPanel.settings;
 const title=`${p.panels.lid?'CLOSED':'OPEN'} BOX ${p.lengthMm}x${p.widthMm}x${p.heightMm}mm inside; ${p.thicknessMm}mm stock; ${boxRoles(p).join(' ').toUpperCase()} top to bottom; M3 x${boxScrewCount(p)}; NO KERF COMPENSATION`;
 return format==='dxf'?dxfForFrameGeometry(geometry,title):svgForFrameGeometry(geometry,title);
}
