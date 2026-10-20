const point=(id,type,x,y)=>({id,type,x,y});
export const actuatorSource={kind:'blocks',v:1,counter:2,params:{F:80,L:80},comps:[
  {type:'bar',id:'Frame',color:'#1686b3',p1:point('A','fixed',0,0),p2:point('B','fixed',80,0),lenParam:'F',fixedLen:true},
  {type:'bar',id:'Arm',color:'#e88d27',p1:point('C','floating',120,0),p2:point('D','floating',120,80),lenParam:'L',fixedLen:true}
]};
