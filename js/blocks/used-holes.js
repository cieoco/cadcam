/** Standard parts drill used lattice holes only, unless drill='all'. */
import {attachmentPoint} from '../core/syringe.js';
import {holeWorld,idCounts} from '../core/local-holes.js';
import {pointKeysFor} from './part-types.js';
// The one machining rule (relations.holeRoles delegates here). Used = id seen beyond itself, ground, motor or syringe joint.
export const isHoleUsed=(c,p,comps,{modules,params,use=idCounts(comps,modules)}={})=>p.manufactured===true||['fixed','motor','linear'].includes(p.type)||!!p.physicalMotor||use.get(p.id)>1||comps.some(o=>[o.a,o.b].some(r=>{const a=r?.componentId==c.id&&attachmentPoint(r,comps,params),q=p.u==null?p:holeWorld(c,p);return a&&Math.hypot(a.x-q.x,a.y-q.y)<.001}));
export function machinedComps(comps=[],modules,params){const o={params,use:idCounts(comps,modules)},u=(c,p)=>isHoleUsed(c,p,comps,o);return comps.map(c=>!c?.standardBlank||c.drilled||c.standardBlank.drill=='all'?c:{...c,drilled:1,holes:(c.holes||[]).filter(h=>u(c,h)),undrilled:pointKeysFor(c).filter(k=>c[k]&&!u(c,c[k]))})}
export function undrilledIds(comps,modules,params){const s=new Set;machinedComps(comps,modules,params).forEach((m,i,_,c=comps[i])=>{if(m!=c)for(const p of [...c.holes||[],...m.undrilled.map(k=>m[k])])m.holes.includes(p)||s.add(p.id)});return s}
