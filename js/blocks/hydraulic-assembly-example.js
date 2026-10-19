// H05（前半）：升降（H02）＋夾爪（H03）兩支針筒組成側視組立。尺寸全部取自 H02／H03 範例，不另抄數字。
// 夾爪模組裝在升降臂工具端（H2C），隨臂一起轉；兩支針筒各自獨立控制。
import {fixedLiftSnapshot,fixedGripSnapshot} from './fixed-syringe-examples.js';
// zlift：夾爪整組桿／板往外抬 2 層（疊放相對位移，同組同抬，組內相對層序與組裝計畫不變），夾爪疊在升降臂與連接桿前面，各自一層、不穿模。
const tag=(snapshot,moduleId,zlift=0)=>structuredClone(snapshot.comps).map(c=>({...c,moduleId,...(zlift&&['bar','triangle'].includes(c.type)?{zlift}:{})}));
const grip=fixedGripSnapshot.comps.find(c=>c.id==='H3Frame');
export const hydraulicLiftGripSnapshot={kind:'blocks',v:1,projectName:'H05 液壓升降＋夾爪（側視組立）',rootDesignName:'H05 液壓升降＋夾爪',counter:50,
 params:{...structuredClone(fixedLiftSnapshot.params),...structuredClone(fixedGripSnapshot.params)},tracePoint:'H2C',
 comps:[...tag(fixedLiftSnapshot,'Lift'),...tag(fixedGripSnapshot,'Grip',2)],
 modules:[
  {id:'Lift',name:'升降',base:'H2O',outputs:[{id:'tool',name:'工具端',at:'H2C',body:{kind:'triangle',id:'H2Arm'}}],mount:null},
  {id:'Grip',name:'夾爪',base:'H3O',outputs:[],mount:{to:{module:'Lift',output:'tool'},ref:{x:grip.p2.x,y:grip.p2.y,a:0},home:{}}}
 ]};
