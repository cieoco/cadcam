/** Connection preparation shared by normal rebuild and isolated candidate work. */
import {normalizeModules} from './module-schema.js';
import {compileTopology} from '../core/topology.js';
import {rebakeModules} from './assembly.js';
import {refreshFaceMounts} from './face-mount-refresh.js';
export function prepareConnectionWork(comps,modules,topo,options={}){
 if(modules.length){const n=normalizeModules(modules,comps);if(n.ok)modules=n.modules;
  const rb=rebakeModules(comps,modules,topo.params);if(rb.changed){rb.comps.forEach((c,i)=>Object.assign(comps[i],c));modules=rb.modules;}}
 const compiled=compileTopology(comps,topo,new Set());let warnings=[];
 if(modules.some(m=>m.mount?.face)){const r=refreshFaceMounts(comps,modules,topo.params,options);modules=r.modules;warnings=r.warnings;}
 topo.params=compiled.params;
 return {comps,modules,topo,compiled,warnings};
}
