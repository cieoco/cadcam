import {S} from '../blocks/state.js';
import {sheetMode,setSheet} from '../blocks/mobile-workspace.js';

/** Resolve actual scene ownership; never infer an owner from a nearby screen point. */
export function previewEditTarget(hit,comps){
  if(!hit)return null;
  const raw=hit.key.split('/').at(-1),colon=raw.indexOf(':'),kind=raw.slice(0,colon),id=raw.slice(colon+1);
  if(kind==='motor')return comps.some(c=>[c.p1,c.p2].some(p=>p?.id===id&&p.physicalMotor))?{motor:id}:null;
  let comp=comps.find(c=>c.id===hit.partId);
  if(!comp&&['stick','gear','rack','pulley','syringe'].includes(kind))comp=comps.find(c=>c.id===id);
  if(comp?.type==='rack')comp=comps.find(c=>c.type==='gear'&&c.id===comp.pinion);
  if(!comp||!(['bar','triangle','gear','slider','syringe'].includes(comp.type)||comp.type==='pulley'&&comp.kind==='sprocket'))return null;
  return {comp};
}

export function bindPreviewEditing(viewer){
  viewer.onPick=async hit=>{
    if(S.mode!=='design')return;
    const comps=S.comps.filter(c=>(c.moduleId||'#root')===S.designFocus);
    const target=previewEditTarget(hit,comps);if(!target)return;
    const app=window.blocks;
    await app.toggle3D();
    if(target.motor){await app.configureMotorMount(target.motor);return;}
    app.selectModuleTarget(target.comp);
    if(target.comp.type!=='syringe'&&sheetMode())setSheet('half');
  };
}
