/** Passive IQ Wheel Grabber, official steps 1–7c. Board conversion only:
 * independent pivots and wheel envelopes; no spring/contact/return simulation.
 */
const p=(id,x,y,type='fixed')=>({id,x,y,type});
function plate(id,pivot,length,width){
 const start=pivot?16:0;
 return {id,moduleId:id,name:id==='GrabBack'?'輪爪背板':id==='GrabLeft'?'左輪爪支承座':'右輪爪支承座',type:'triangle',color:'#95a5a6',
  p1:p(id+'A',start,0),p2:p(id+'B',length,0),p3:p(id+'C',start,8),
  stock:{widthMm:pivot?3.8:8,thicknessMm:3},gParam:id+'L',r1Param:id+'W',r2Param:id+'D',sign:1,shapeMode:'hull',
  vertices:[{solve:true,ref:'p1'},...(!pivot?[{solve:true,ref:'p2'}]:[]),...[[0,pivot?-3.5:0],[0,pivot?3.5:width],[length,pivot?-3.5:0],[length,pivot?3.5:width]].map(([x,y])=>({solve:false,u:x-start,v:y,hole:false}))]};
}
const comps=[plate('GrabBack',false,72,8),plate('GrabLeft',true,24,0),plate('GrabRight',true,24,0)];
const params=Object.fromEntries(comps.flatMap(c=>[[c.gParam,c.p2.x-c.p1.x],[c.r1Param,8],[c.r2Param,Math.hypot(c.p2.x-c.p1.x,8)]]));
const modules=comps.map(c=>({id:c.id,name:c.name,base:c.p1.id,outputs:[{id:'tool',name:'支承座基準',at:c.p2.id,body:{kind:'triangle',id:c.id}}],mount:null}));
// Recorded from buildFaceCandidate: actual footprints and paired holes, not
// decorative brackets. The arm pivots inside its fixed child pad independently.
for(const [id,u] of [['GrabLeft',-28],['GrabRight',28]])modules.find(m=>m.id===id).mount={
 to:{module:'GrabBack',output:'tool'},ref:{x:72,y:0,a:0},home:{},face:{version:1,childPart:id,
 rotation:[[0,-1,0],[0,0,-1],[1,0,0]],translation:{x:36+u,y:-4,z:3.4000000000000004},
 selection:{brackets:{enabled:true,offsets:{L1:0,R1:0,L2:0},childPart:id},hostFace:'top',childFace:'left',alignU:0,alignV:0,offsetU:u,offsetV:-8,gap:0,quarterTurns:0},hostThicknessMm:3,childThicknessMm:3}};
export const wheelGrabberSnapshot={kind:'blocks',v:1,counter:7,projectName:'IQ 被動輪爪',comps,params,modules,assemblyMembers:modules.map(m=>m.id)};
for(const [side,id] of [['Left','GrabLeft'],['Right','GrabRight']]){
 const axis=p(id+'A',16,0),tip=p('Grab'+side+'WheelAxis',88,0,'floating');
 comps.push({id:'Grab'+side+'Arm',moduleId:id,name:(side==='Left'?'左':'右')+'活動輪爪臂',type:'bar',p1:axis,p2:tip,lenParam:'Grab'+side+'Length',fixedLen:true,isInput:false,snapLength:false,color:'#e67e22',zlift:1,stock:{widthMm:8,thicknessMm:3}},
  {id:'Grab'+side+'Wheel',moduleId:id,name:(side==='Left'?'左':'右')+'輪胎包絡圓盤',type:'bar',shape:'disk',diameterMm:40,p1:{...tip},p2:p('Grab'+side+'WheelPin',96,0,'floating'),lenParam:'Grab'+side+'WheelPinRadius',fixedLen:true,isInput:false,snapLength:false,frameSeparate:true,color:'#34495e'});
 params['Grab'+side+'Length']=72;params['Grab'+side+'WheelPinRadius']=8;
}
export const IQ_WHEEL_GRABBER_EXAMPLE={
 id:'iq-wheel-grabber',title:'IQ 被動輪爪：兩支獨立轉臂',
 note:'兩個輪爪各繞自己的支承軸轉動，沒有馬達或齒輪連動。圓盤只表示輪胎外形，原機橡皮筋拉合未模擬。',
 adjustmentNote:'回左／右輪爪設計，拖動輪心試姿勢；點同一輪心輸入精確方向角度。一次只改一側，再復原。播放會提示自由活動，不會自動回彈。',
 lesson:{group:'manipulator',level:'來源試作',use:'辨認被動夾持的兩個獨立轉軸；以原有板件、轉軸、圓盤及角碼表示輪爪。',
  learn:'原機橡皮筋在兩臂後端附近拉合；輪子被物件推開。兩臂沒有固定齒比，也不是平行夾爪。',
  try:['切到組立及 3D，核對背板、兩顆角碼、固定支承座與活動臂','回左輪爪設計，拖動輪心，觀察右側保持；點輪心以方向角度微調同一姿勢','改活動臂孔距後復原；保存並重新開啟'],
  predict:'只把左臂向外推，右臂是否必須轉過相同角度？為甚麼播放不能表示橡皮筋回彈？',
  measure:'活動臂軸距 72 mm、輪胎包絡直徑 40 mm、兩支承軸橫向相距 56 mm。8 mm 格與 3 mm 板為看圖改製。',
  explain:'依 VEX IQ Wheel Grabber 官方 Parts List 與步驟 1～7c：兩支 1×10 臂、2×10 背梁、兩個直角接頭、5 pitch 輪胎、怠輪銷及一條矽膠橡皮筋；步驟 3c 的橡皮筋掛點約在臂後端前 2 格。保留獨立後軸、前端輪心及相互垂直的支承平面；用固定板座與 M3 角碼替代原廠塑膠直角接頭。40 mm 圓盤只是 8 mm 格的輪胎外形換算，其偏心孔是現有圓盤參考孔，不是原廠輪轂施工規格。橡皮筋沒有畫成傳動皮帶；沒有回彈、輪胎接觸／摩擦／抓持、彈力、承重與實物驗證。SVG／DXF 是板材示意，不包含完整原廠輪胎、銷軸或施工規格。'},
 snapshot:wheelGrabberSnapshot
};
