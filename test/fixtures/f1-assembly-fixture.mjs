import {builtinTemplate,instantiateTemplate} from '../../js/blocks/module-ops.js';
import {realMountExamples} from '../../js/blocks/face-mate-examples.js';
import {buildFacePlacement} from '../../js/blocks/face-placement.js';
import {mountFacePlacement} from '../../js/blocks/face-mount.js';
import {FABRICATION_DEFAULTS} from '../../js/blocks/fabrication-profile.js';
export function f1AssemblyFixture({mounted=true}={}) {
const {hosts,children}=realMountExamples(),h=hosts[0],c=children[0];
const normalChild=instantiateTemplate(builtinTemplate('gear-gripper'),{counter:2,place:{x:0,y:0},usedMotorIds:['1']});
c.instance=normalChild;
const f={comps:[...h.instance.comps,...c.instance.comps],modules:[h.instance.module,c.instance.module],params:{...h.instance.params,...c.instance.params}};
f.modules[0].faceParts={part:h.surface.compId,face:'back'};
f.modules[1].faceParts={part:'frame',face:'bottom'};
const fabrication=structuredClone(FABRICATION_DEFAULTS);fabrication.cnc.stockThicknessMm=4;
const selection={hostFace:'back',childFace:'bottom',alignU:0,alignV:0,offsetU:0,offsetV:0,gap:0,quarterTurns:1,brackets:{enabled:true,offsets:{},childPart:'frame'}};
const record=buildFacePlacement({host:h,child:c,selection}).record;
const face={version:1,childPart:'frame',...record.transform,selection:record.selection,hostThicknessMm:4,childThicknessMm:4};
if(mounted)f.modules[1].mount=mountFacePlacement(f.comps,f.modules,c.surface.moduleId,{hostId:h.surface.moduleId,outputId:h.surface.outputId,face},f.params).mount;
return {...f,fabrication};
}
