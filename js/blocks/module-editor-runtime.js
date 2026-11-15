import {S} from './state.js';
// Library management is optional; ordinary drawing and assembly do not need it.
export function createModuleEditor(deps){
  let api,pending,observed;
  const load=()=>pending ||= import('./module-editor.js').then(m=>{api=m.createModuleEditor(deps);api.sync();return api;}).catch(e=>{pending=null;deps.transient(e.message);throw e;});
  const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))load().catch(()=>{});});
  return {
    sync(){
      if(api){api.sync();return;}
      const library=document.getElementById('moduleLibrary');
      if(library&&library!==observed){if(observed)observer.unobserve(observed);observed=library;observer.observe(library);}
      if(S.selectedLinkId||S.selectedTriangleId||S.selectedGearId||S.selectedSliderId||S.selectedNodeId)load().catch(()=>{});
    },
    async insertBuiltin(id){return (await load()).insertBuiltin(id);},
    async saveCompositeToLibrary(id){return (await load()).saveCompositeToLibrary(id);},
    async exportComposite(id){return (await load()).exportComposite(id);}
  };
}
