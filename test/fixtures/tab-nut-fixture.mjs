import {TAB_NUT_DEFAULTS} from '../../js/blocks/tab-nut-geometry.js';
export function tabNutFixture(){
  const p=(id,x,y)=>({id,type:'fixed',x,y});
  const comps=[{type:'bar',id:'HostPlate',fixedLen:true,color:'#3498db',moduleId:'Host',p1:p('H0',-50,0),p2:p('H1',50,0),lenParam:'HL',frameSeparate:true,stock:{widthMm:60,thicknessMm:3,material:'unspecified'}},
    {type:'bar',id:'ChildPlate',fixedLen:true,color:'#e79a45',moduleId:'Child',p1:p('C0',-30,0),p2:p('C1',30,0),lenParam:'CL',frameSeparate:true,stock:{widthMm:40,thicknessMm:3,material:'unspecified'}}];
  const modules=[{id:'Host',name:'承接板',base:'H0',outputs:[{id:'plate',name:'承接板',at:'H0',body:{kind:'bar',id:'HostPlate'}}],mount:null},
    {id:'Child',name:'立板',base:'C0',outputs:[],mount:null}];
  return {kind:'blocks',v:1,comps,modules,params:{HL:100,CL:60},counter:10,stockMm:3,exportSettings:{holeDiameterMm:3.4}};
}
export const tabNutRequest=()=>({childId:'Child',hostEndpoint:{moduleId:'Host',outputId:'plate',partId:'HostPlate'},childEndpoint:{partId:'ChildPlate'},
  selection:{hostFace:'top',childFace:'back',alignU:0,alignV:0,offsetU:0,offsetV:0,gap:0,quarterTurns:0,fastener:{...TAB_NUT_DEFAULTS}}});
