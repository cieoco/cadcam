// Legacy two-hinge example retained for saved-work and solver compatibility tests.
import {SYRINGE_DEMO} from '../../js/core/syringe.js';
const p=(id,x,y,type='floating')=>({id,x,y,type});
// Local x of the arm runs O→C. A is on a real fixed frame bar, not on the syringe.
export const hydraulicSnapshot={kind:'blocks',v:1,projectName:'H01 針筒單臂抬升',rootDesignName:'H01 單臂',counter:10,
  params:{HFrame:80,HArm:180},tracePoint:'HC',
  comps:[
    {type:'bar',id:'HFrame',p1:p('HA',0,-80,'fixed'),p2:p('HO',0,0,'fixed'),lenParam:'HFrame',fixedLen:true,color:'#94a3b8'},
    {type:'bar',id:'HArm',p1:p('HO',0,0,'fixed'),p2:p('HC',180,0),lenParam:'HArm',fixedLen:true,color:'#e99a33'},
    {type:'syringe',id:'HSyringe',a:{componentId:'HFrame',u:0,v:0},b:{componentId:'HArm',u:80,v:0},spec:{...SYRINGE_DEMO},extension:20,branch:1}
  ]};
