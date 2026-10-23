import {TAB_NUT_DEFAULTS} from './tab-nut-geometry.js';
/** Editable stock members; all fabrication dimensions remain trial values. */
const p=(id,x,y)=>({id,type:'fixed',x,y});
export const tabNutSnapshot={kind:'blocks',v:1,counter:10,projectName:'3 mm／M3 榫槽接合試作',params:{HL:100,CL:60},
  comps:[{type:'bar',id:'HostPlate',fixedLen:true,color:'#3498db',moduleId:'Host',p1:p('H0',-50,0),p2:p('H1',50,0),lenParam:'HL',frameSeparate:true,stock:{widthMm:60,thicknessMm:3,material:'unspecified'}},
    {type:'bar',id:'ChildPlate',fixedLen:true,color:'#e79a45',moduleId:'Child',p1:p('C0',-30,0),p2:p('C1',30,0),lenParam:'CL',frameSeparate:true,stock:{widthMm:40,thicknessMm:3,material:'unspecified'}}],
  modules:[{id:'Host',name:'承接板',base:'H0',outputs:[{id:'plate',name:'承接板',at:'H0',body:{kind:'bar',id:'HostPlate'}}],mount:null},
    {id:'Child',name:'立板',base:'C0',outputs:[],mount:{to:{module:'Host',output:'plate'},ref:{x:-50,y:0,a:0},home:{},face:{version:2,childPart:'ChildPlate',
      rotation:[[1,0,0],[0,0,-1],[0,1,0]],translation:{x:0,y:0,z:21.5},hostThicknessMm:3,childThicknessMm:3,
      selection:{hostFace:'top',childFace:'back',alignU:0,alignV:0,offsetU:0,offsetV:0,gap:0,quarterTurns:0,fastener:{...TAB_NUT_DEFAULTS}}}}}]};
