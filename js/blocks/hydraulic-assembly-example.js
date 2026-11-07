// H05（前半）：升降（H02）＋夾爪（H03）兩支針筒組成側視組立。尺寸全部取自 H02／H03 範例，不另抄數字。
// 夾爪模組裝在升降臂工具端（H2C），隨臂一起轉；兩支針筒各自獨立控制。
import {fixedLiftSnapshot,assemblyGripSnapshot as fixedGripSnapshot} from './fixed-syringe-examples.js';
import {diskTurntableSnapshot} from './disk-turntable-example.js';
// 組合時將 H02 整組朝上安裝；只改剛體安裝姿態，不改孔距、行程或支點。
// 原側視姿態的工具端低於主軸，直立組裝後會讓一側夾指落到轉盤以下。
const liftUpright=structuredClone(fixedLiftSnapshot);
const liftOrigin=liftUpright.comps.find(c=>c.id==='H2Frame').p1;
const liftX=liftOrigin.x,liftY=liftOrigin.y,liftAngle=-48*Math.PI/180;
const rotatedPoints=new Set();
for(const c of liftUpright.comps){
  for(const p of [c.p1,c.p2,c.p3].filter(Boolean))if(!rotatedPoints.has(p)){
    rotatedPoints.add(p);const x=p.x-liftX,y=p.y-liftY;
    p.x=liftX+x*Math.cos(liftAngle)-y*Math.sin(liftAngle);
    p.y=liftY+x*Math.sin(liftAngle)+y*Math.cos(liftAngle);
  }
  if(c.type==='syringe')c.axisDeg-=48;
}
// zlift：夾爪整組桿／板往外抬 3 層（疊放相對位移，同組同抬，組內相對層序與組裝計畫不變），夾爪疊在升降臂與連接桿前面，各自一層、不穿模。
const tag=(snapshot,moduleId,zlift=0)=>structuredClone(snapshot.comps).map(c=>({...c,moduleId,...(zlift&&['bar','triangle'].includes(c.type)?{zlift}:{})}));
// H03 單例回復原版；組合範例保留已驗收的接合分支，不回寫共用單例。
const assemblyGrip=structuredClone(fixedGripSnapshot);
for(const c of assemblyGrip.comps)if(c.type==='triangle'){
  const [a,b,p]=[c.p1,c.p2,c.p3];c.sign=Math.sign((b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x))||1;
}
const grip=fixedGripSnapshot.comps.find(c=>c.id==='H3Frame');
export const hydraulicLiftGripSnapshot={kind:'blocks',v:1,projectName:'H05 液壓升降＋夾爪（側視組立）',rootDesignName:'H05 液壓升降＋夾爪',counter:50,
 params:{...structuredClone(fixedLiftSnapshot.params),...structuredClone(fixedGripSnapshot.params)},tracePoint:'H2C',
 comps:[...tag(liftUpright,'Lift'),...tag(assemblyGrip,'Grip',3)],
 modules:[
  {id:'Lift',name:'升降',base:'H2O',outputs:[{id:'tool',name:'工具端',at:'H2C',body:{kind:'triangle',id:'H2Arm'}}],mount:null},
  {id:'Grip',name:'夾爪',base:'H3O',outputs:[],mount:{to:{module:'Lift',output:'tool'},ref:{x:grip.p2.x,y:grip.p2.y,a:0},home:{}}}
 ]};

// H06（三軸手臂）：H07 雙圓盤＋H02 升降＋H03 夾爪；三支針筒各管一軸。
// 升降機架下緣直立在活動圓盤的上板面；沿用六面接合保存契約，不把圓邊當成直線邊。
// 以下 face 由 buildFaceCandidate 的 top/back、置中、0° 產生；驗收重建並核對。
// 此版保存幾何定位，角碼／轉接座固定仍待配置，不沿用舊 H04 三角板的孔位。
const arm=(()=>{
  const comps=[...tag(diskTurntableSnapshot,'Base'),...tag(liftUpright,'Lift'),...tag(assemblyGrip,'Grip',3)];
  const params={...structuredClone(diskTurntableSnapshot.params),...structuredClone(fixedLiftSnapshot.params),...structuredClone(fixedGripSnapshot.params)};
  const modules=[
    {id:'Base',name:'旋轉底盤',source:'hydraulic-h07',base:'H7O',outputs:[{id:'turn',name:'轉盤',at:'H7O',body:{kind:'bar',id:'H7Turn'}}],mount:null},
    {id:'Lift',name:'升降',base:'H2A',outputs:[{id:'tool',name:'工具端',at:'H2C',body:{kind:'triangle',id:'H2Arm'}}],mount:{"to":{"module":"Base","output":"turn"},"ref":{"x":0,"y":0,"a":89.99999999999994},"home":{},"face":{"version":1,"childPart":"frame","rotation":[[1,0,0],[0,0,-1],[0,1,0]],"translation":{"x":-130.1482595125717,"y":0,"z":-71.71171799344064},"selection":{"hostFace":"top","childFace":"back","alignU":0,"alignV":0,"offsetU":0,"offsetV":0,"gap":0,"quarterTurns":0},"hostThicknessMm":3,"childThicknessMm":3}}},
    {id:'Grip',name:'夾爪',base:'H3O',outputs:[],mount:{to:{module:'Lift',output:'tool'},ref:{x:grip.p2.x,y:grip.p2.y,a:0},home:{}}}
  ];
  return {comps,params,modules};
})();
export const hydraulicArmSnapshot={kind:'blocks',v:1,projectName:'H06 液壓三軸手臂（旋轉底盤＋升降＋夾爪）',rootDesignName:'H06 液壓三軸手臂',counter:100,
 params:arm.params,tracePoint:'H2C',comps:arm.comps,modules:arm.modules};
