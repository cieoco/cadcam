/** 設計台的求解邊界與可見分頁一致；組立台保留完整組合求解。 */
import {compsInFocus} from './design-focus.js';
import {compileTopology} from '../core/topology.js';

export function createSimulationScope({comps,modules,topo,compiled,assembly,mode,designFocus}){
  const isolated=mode==='design'&&modules.length>0;
  const local=isolated?compsInFocus(comps,modules,designFocus):comps;
  return {
    comps:local,
    compiled:isolated?compileTopology(local,topo,new Set()):compiled,
    assembly:isolated?null:assembly,
    // 整份範例的任務契約不可套用在單一子設計；局部仍走一般求解與行程檢查。
    wholeWork:!isolated,
    modules:isolated?modules.filter(m=>m.id===designFocus).map(m=>({...m,mount:undefined})):modules
  };
}
