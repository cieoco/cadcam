let render;
export async function loadAssemblyPinScene(){render ||= (await import('./assembly-pin.js')).attachAssemblyPins;}
export function attachAssemblyPins(model,modules){
 if(!modules.some(m=>m.mount?.face?.selection?.pin))return model;
 if(render)return render(model,modules);
 model.geometryDiagnostics.push({status:'not_supported',code:'assembly_pin_scene_not_ready'});return model;
}
