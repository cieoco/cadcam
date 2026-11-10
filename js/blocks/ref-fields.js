// C6：零件互相引用的欄位表（單一來源）。只讀這些欄位，不掃任意字串；relations.attachmentsOf 與啟動路徑共用。
import {pointKeysFor} from './part-types.js';
const F=[['syringe','a.componentId','b.componentId','outputId','jawIds','passiveTips.hostId'],
  ['motor','motorCarrier','motorMountPoint','mountLocatorPoint','motorMount.center','motorMount.frameBody','motorMount.outputBody'],
  ['fusion','barFusionRoot','barFusion.members','barFusion.points.id','barFusion.framePointIds'],['plate-gear-fusion','fusedWith'],
  ['mesh','mesh'],['rack','pinion','framePins'],['belt','driver','driven'],['reference','frameHole.a','frameHole.b']];
const get=(c,p)=>p.split('.').reduce((a,k)=>a.flatMap(x=>x==null?[]:[].concat(x[k])),[c]).filter(s=>s&&typeof s=='string');
/** 每個引用 {kind,field,id}（id 是零件、接點或孔的 id）；共用點／孔的宣告（p1.id、holes.id…）是 kind shared-point。 */
export const refsOf=c=>[...F.flatMap(([kind,...fs])=>fs.flatMap(field=>get(c,field).map(id=>({kind,field,id})))),
  ...[...pointKeysFor(c).map(k=>k+'.id'),'holes.id','standardBlank.mountHoles.id'].flatMap(f=>get(c,f).map(id=>({kind:'shared-point',field:f.slice(0,-3),id})))];
export const ownIdsOf=c=>[c.id,...refsOf(c).filter(r=>r.kind=='shared-point').map(r=>r.id)];
/** 零件之間的邊 [{kind,field,from,to,via}]：A 的引用欄位指到 B 擁有的 id。 */
export function compEdges(comps){
  const own=new Map(),out=[],seen=new Set();
  comps.forEach((c,i)=>ownIdsOf(c).forEach(id=>own.set(id,[...own.get(id)||[],i])));
  comps.forEach((c,i)=>refsOf(c).forEach(r=>(own.get(r.id)||[]).forEach(t=>{
    const e={kind:r.kind,field:r.field,from:c.id,to:comps[t].id,via:r.id},k=Object.values(e).join('|');
    if(t!=i&&!seen.has(k)){seen.add(k);out.push(e);}})));
  return out;
}
