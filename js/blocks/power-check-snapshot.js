/** Freeze the exact fabrication request before asynchronous pack enrichment. No DOM/state singleton. */
export function freezePowerWork(state,work,angles={},specIds={}){
 return structuredClone({comps:work.comps,modules:work.modules||[],allComps:state.comps,counter:state.counter,activeMotor:state.activeMotor,motorAngles:angles,specIds,
  fabrication:work.fabrication||state.fabrication,topo:{params:work.params||state.topo.params,loads:work.topo?.loads??state.topo.loads,gravity:work.topo?.gravity??state.topo.gravity}});
}
