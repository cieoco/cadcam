import {assemblyWork} from './assembly-membership.js';
import {compileAssembly} from './assembly.js';
/** 設計台只解本頁；組立台只解已加入的設計（隱藏畫面不改此範圍）。 */
import {compsInFocus} from './design-focus.js';
import {compileTopology} from '../core/topology.js';

export function createSimulationScope({comps,modules,topo,compiled,assembly,mode,designFocus}){
  const isolated=mode==='design'&&modules.length>0;
  const active=mode==='bench'?assemblyWork(comps,modules,topo):{comps,modules};
  const partial=active.comps.length!==comps.length||active.modules.length!==modules.length;
  const local=isolated?compsInFocus(comps,modules,designFocus):active.comps;
  return {
    comps:local,
    compiled:isolated||partial?compileTopology(local,topo,new Set()):compiled,
    assembly:isolated?null:partial?(active.modules.length?compileAssembly(local,active.modules,topo):null):assembly,
    // 整份範例的任務契約不可套用在單一子設計；局部仍走一般求解與行程檢查。
    wholeWork:!isolated&&!partial,
    modules:isolated?modules.filter(m=>m.id===designFocus).map(m=>({...m,mount:undefined})):active.modules
  };
}
