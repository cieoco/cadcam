/** Lessons may omit one explicitly owned, stationary actuator seat from their
 * member signature. Unknown plates and additional moving parts remain visible. */
import {holeWorld,localHoles} from '../core/local-holes.js';
function fixedActuatorSeat(c,comps){
 if(c?.type!=='triangle'||c.standardBlank?.kind!=='plate'||c.isInput||c.motorCarrier||c.physicalMotor||c.physical_motor||comps.filter(x=>x?.id===c.id).length!==1)return false;
 if(c.holes!==undefined&&!Array.isArray(c.holes)||c.standardBlank.mountHoles!==undefined&&!Array.isArray(c.standardBlank.mountHoles))return false;
 const primary=['p1','p2','p3'].map(k=>c[k]);
 if(primary.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)))return false;
 if([...primary,...(c.holes||[]),...(c.standardBlank.mountHoles||[])].some(p=>p?.physicalMotor||p?.physical_motor))return false;
 const fixed=[...primary,...localHoles(c).map(h=>({...h,...holeWorld(c,h)}))].filter(p=>p.type==='fixed'&&Number.isFinite(p.x)&&Number.isFinite(p.y));
 if(!fixed.some((p,i)=>fixed.slice(i+1).some(q=>p.id!==q.id&&Math.hypot(p.x-q.x,p.y-q.y)>1e-6)))return false;
 return comps.some(d=>d?.type==='bar'&&d.isInput&&d.p1?.id&&d.motorMount?.frameBody===c.id&&d.motorMount.center===d.p1.id&&Boolean(d.physicalMotor||d.p1.physicalMotor));
}
export const lessonMechanismComps=comps=>Array.isArray(comps)?comps.filter(c=>!fixedActuatorSeat(c,comps)):comps;
