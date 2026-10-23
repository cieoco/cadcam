import {faceFileExportData} from './face-export.js';
import {tabNutPartGeometry} from './tab-nut-plan.js';
import {svgForFrameGeometry,dxfForFrameGeometry} from './exporters.js';
import {BOX_ROLES,BOX_NAMES} from './box-config.js';

/** Five separate outlines, spaced for inspection; not machine-specific nesting. */
export function boxLayout(work){
 const data=faceFileExportData(work),geometry={outlines:[],holes:[],cutouts:[]},panels=[];let y=10;
 for(const role of BOX_ROLES){
  const comp=work.comps.find(c=>c.boxPanel?.role===role),g=tabNutPartGeometry(data.extras,comp,{local:true});
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
 const title=`OPEN BOX ${p.lengthMm}x${p.widthMm}x${p.heightMm}mm inside; ${p.thicknessMm}mm stock; BASE FRONT BACK LEFT RIGHT top to bottom; M3 x4; NO KERF COMPENSATION`;
 return format==='dxf'?dxfForFrameGeometry(geometry,title):svgForFrameGeometry(geometry,title);
}
