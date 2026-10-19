// H05（前半）：升降（H02）＋夾爪（H03）兩支針筒組成側視組立。尺寸全部取自 H02／H03 範例，不另抄數字。
// 夾爪模組裝在升降臂工具端（H2C），隨臂一起轉；兩支針筒各自獨立控制。
import {fixedLiftSnapshot,fixedGripSnapshot,fixedBaseSnapshot} from './fixed-syringe-examples.js';
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

// H06（三軸手臂）：H04 轉盤＋H02 升降（直角立在轉盤 H4Turn 的邊上）＋H03 夾爪（裝在升降臂工具端）。三支針筒各管一軸。
// 升降的平面垂直於轉盤，隨轉盤繞垂直軸轉；夾爪留在升降平面裡。安裝資料與學生在組立台「直角安裝」得到的同一個形狀
// （to.body＋edge、orient.type 'orthogonal'），這裡直接由幾何算出，不抄座標：
//  - 邊：轉盤三角板的第 1 邊（H4B→H4M，69 mm，朝外）；第 0 邊 15 mm 比轉接座 20 mm 短，不能用。
//  - base 取 H2A（H02 最低的點）：升降整組在轉盤板面之上；childAxisDeg 180：升降「上」朝 +z、臂沿邊朝外。
//  - offsetMm＝邊上能放的最遠處（邊長/2−轉接座長），避開連桿 H4Coupler 掃過的位置。
// 轉盤條寬 16 mm：轉接座／角碼的孔離邊 9–9.5 mm，原 10 mm 條寬孔會破邊。夾爪疊 3 層：直角平面的場景要靠它與升降臂分層。
const arm=(()=>{
  const turn=fixedBaseSnapshot.comps.find(c=>c.id==='H4Turn');
  const comps=[...tag(fixedBaseSnapshot,'Base'),...tag(fixedLiftSnapshot,'Lift'),...tag(fixedGripSnapshot,'Grip',3)];
  comps.find(c=>c.id===turn.id).stock={...turn.stock,widthMm:16};
  const params={...structuredClone(fixedBaseSnapshot.params),...structuredClone(fixedLiftSnapshot.params),...structuredClone(fixedGripSnapshot.params)};
  const edgeIndex=1,to={module:'Base',body:turn.id,edge:edgeIndex};
  const modules=[
    {id:'Base',name:'旋轉底盤',base:'H4O',outputs:[],mount:null},
    {id:'Lift',name:'升降',base:'H2A',outputs:[{id:'tool',name:'工具端',at:'H2C',body:{kind:'triangle',id:'H2Arm'}}],mount:null},
    {id:'Grip',name:'夾爪',base:'H3O',outputs:[],mount:{to:{module:'Lift',output:'tool'},ref:{x:grip.p2.x,y:grip.p2.y,a:0},home:{}}}
  ];
  // 邊的幾何（轉盤三角板 p1→p2→p3；第 k 邊＝p_k→p_(k+1)），算法同 assembly.js orthogonalHostEdge；不 import 它，避免與 examples.js 循環引用。
  const V=[turn.p1,turn.p2,turn.p3],A=V[edgeIndex],B=V[(edgeIndex+1)%3],len=Math.hypot(B.x-A.x,B.y-A.y),dx=(B.x-A.x)/len,dy=(B.y-A.y)/len;
  const cx=(V[0].x+V[1].x+V[2].x)/3,cy=(V[0].y+V[1].y+V[2].y)/3,side=(-dy*((A.x+B.x)/2-cx)+dx*((A.y+B.y)/2-cy))>=0?1:-1;   // 外法線朝外
  const ADAPTER_LENGTH_MM=20;   // 與 orthogonal-joint.js 的 ADAPTER_LENGTH_MM 一致（測試核對）
  const offsetMm=Math.floor((len/2-ADAPTER_LENGTH_MM)*10)/10;   // 轉接座占 [offset, offset+20]；offset 上限＝邊長/2−20
  const edge={pose:{x:A.x,y:A.y,a:Math.atan2(dy,dx)*180/Math.PI},side};
  modules.find(m=>m.id==='Lift').mount={to,ref:{x:edge.pose.x,y:edge.pose.y,a:edge.pose.a},home:{},
    orient:{type:'orthogonal',edge:'host',side:edge.side,childAxisDeg:180,...(offsetMm?{offsetMm}:{}),joint:{kind:'printed',wallMm:4,holesPerFlange:2}}};
  return {comps,params,modules};
})();
export const hydraulicArmSnapshot={kind:'blocks',v:1,projectName:'H06 液壓三軸手臂（旋轉底盤＋升降＋夾爪）',rootDesignName:'H06 液壓三軸手臂',counter:100,
 params:arm.params,tracePoint:'H2C',comps:arm.comps,modules:arm.modules};
