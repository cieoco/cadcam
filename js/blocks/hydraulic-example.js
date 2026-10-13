import {SYRINGE_DEMO} from '../core/syringe.js';
const p=(id,x,y,type='floating')=>({id,x,y,type});
const A=p('H1A',-100,-60,'fixed'),O=p('H1O',0,0,'fixed'),P=p('H1P',-20,-60);
// Teaching dimensions: horizontal plunger + pinned coupler + single rocker.
// Circle-intersection seed for the 80 mm arm and 80 mm coupler at s=10 mm.
const C=p('H1C',-10+Math.sqrt(5400)*3/Math.sqrt(10),-30-Math.sqrt(5400)/Math.sqrt(10));
const bar=(id,p1,p2,color)=>({type:'bar',id,p1,p2,lenParam:id,fixedLen:true,snapLength:false,color});
export const hydraulicSnapshot={kind:'blocks',v:1,projectName:'H01 固定針筒單臂抬升',rootDesignName:'H01 固定筒身單臂',counter:10,
 params:{H1Frame:Math.hypot(100,60),H1Arm:80,H1Coupler:80},tracePoint:'H1C',
 comps:[bar('H1Frame',A,O,'#94a3b8'),bar('H1Arm',O,C,'#e99a33'),bar('H1Coupler',P,C,'#64748b'),
  {type:'syringe',id:'H1Syringe',mountMode:'fixed-axis',axisDeg:0,outputId:'H1Arm',a:{componentId:'H1Frame',u:0,v:0},b:{componentId:'H1Coupler',u:0,v:0},
   spec:{...SYRINGE_DEMO,name:'F3D 外形參考／20 mm 教學區間（未實測）',outerDiameter:17.5,bodyLength:72,rodDiameter:8,lmin:70,stroke:20,calibrated:false},extension:10,branch:1}
 ]};
