import {S} from './state.js';
import {planWheel} from './wheel.js';
import {confirmMountingChange} from './mounting-review-ui.js';
import * as View from './view.js';
/** Add the default independent wheel, then edit it in the normal property panel. */
export function openWheel(){
 const work={comps:S.comps,params:S.topo.params,modules:S.modules,fabrication:S.fabrication};
 const plan=planWheel(work,{position:View.worldFromScreen(View.W/2,View.H/2),moduleId:S.designFocus==='#root'?undefined:S.designFocus});
 if(!plan.ok){window.blocks.notify(plan.message);return;}
 if(!confirmMountingChange(work,{...work,comps:plan.comps,params:plan.params},{notify:window.blocks.notify}))return;
 window.blocks.pause();window.blocks.pushUndo();S.comps=plan.comps;S.topo.params=plan.params;S.selectedLinkId=plan.wheelId;
 window.blocks.rebuild();window.blocks.selectLink(plan.wheelId);window.blocks.fitView();window.blocks.draw();window.blocks.scheduleAutosave();
}
