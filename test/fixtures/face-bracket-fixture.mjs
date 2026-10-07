// Two independent flat parts for end-to-end drilling tests (no localStorage).
export function bracketFixture() {
  const p=(id,x,y)=>({id,type:'fixed',x,y});
  const comps=[
    {type:'bar',id:'HostBar',moduleId:'Host',p1:p('H0',-60,0),p2:p('H1',60,0),lenParam:'L',stock:{widthMm:60,thicknessMm:3,material:'plywood'}},
    ...[[-40,0],[40,0],[0,40]].map(([x,y],i)=>({type:'anchor',id:`Anchor${i}`,moduleId:'Child',p1:p(`C${i}`,x,y)}))
  ];
  const modules=[{id:'Host',name:'承接桿',base:'H0',outputs:[{id:'plate',name:'承接桿',at:'H0',body:{kind:'bar',id:'HostBar'}}],mount:null,faceParts:{part:'HostBar',face:'top'}},
    {id:'Child',name:'直立底板',base:'C0',outputs:[],mount:null,faceParts:{part:'frame',face:'back'}}];
  return {kind:'blocks',v:1,comps,modules,params:{L:120},counter:10};
}
