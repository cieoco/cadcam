/** Clawbot IQ 的單平面等效試作。12:36 取自官方組裝；其餘尺寸為板材化示範。
 * 原機兩個同軸 36 齒輪在此只畫一個，不是第二級減速；橡皮筋平衡未模擬。
 */
import {assemblyLessonSnapshot} from './assembly-lesson-example.js?v=parallel';
const p=(id,x,y,type='floating')=>({id,x,y,type});
const motor=p('ClawLiftMotor',0,-72,'motor'),axis=p('ClawLiftAxis',0,0,'fixed');
// Diagonal of the 8 mm hole grid: clears both the servo horn holes and tooth roots.
const drivePinRadius=Math.hypot(8,8);
const pin=p('ClawLiftPin',24,0),tip=p('ClawLiftTip',160,0);
export const CLAWBOT_LIFT_EXAMPLE={
 id:'clawbot-geared-lift',title:'IQ Clawbot：3:1 單轉軸升降臂',
 note:'紅色 12 齒帶動藍色 36 齒，橘色一體臂隨輸出軸抬起；工具端方向也跟著轉。原機同軸雙齒輪與雙側支承在此合為單平面示意。',
 adjustmentNote:'馬達輸入 −180°～0° 對應臂角 60°～0°。先點橘色外段改孔距；齒數取自來源，模數、臂長及行程是示範值，橡皮筋平衡與承載未模擬。',
 lesson:{group:'lift-motion',level:'來源試作',
  use:'先獨立試動 Clawbot 的齒輪單轉軸升降，再以原組立操作接夾爪；此臂不保持工具水平。',
  learn:'12:36 外嚙合使輸出反向、轉角為輸入的三分之一；兩個同軸輸出齒輪不會再減速一次。',
  try:['播放並觀察輸入 −180° 與輸出抬臂 60°','點橘色外段，把孔距 136 改為 144 mm，再復原','保存重開，核對一體臂與齒輪仍共用兩個定位孔'],
  predict:'同樣輸入角度下，加長臂會改變輸出角度，還是只改變端點行程？',
  measure:'示範臂總長 160 mm，抬起 60° 時端點為 (80,138.564) mm；不是垂直直線升降。',
  explain:'官方 IQ Clawbot 2.0 步驟 15～20c 與 VEX 齒輪教材支持 12:36、同軸雙輪與單支點升降。模數 3、軸距 72、兩孔定位 24、臂長 160 mm 及限制角段為板材化示範；原機橡皮筋、雙側支承、層間五金、全行程干涉與承載未驗證。'},
 snapshot:{kind:'blocks',v:1,counter:5,projectName:'IQ Clawbot 3:1 單轉軸升降臂',tracePoint:'ClawLiftTip',
  comps:[
   {type:'bar',id:'ClawLiftFrame',name:'升降臂支承基準',p1:{...motor},p2:{...axis},lenParam:'ClawLiftCenters',color:'#95a5a6',fixedLen:true,isInput:false,snapLength:false,frameSeparate:true},
   {type:'gear',id:'ClawLiftDrive',name:'12 齒輸入輪',p1:{...motor,physicalMotor:'1'},p2:p('ClawLiftMotorPin',drivePinRadius,-72),radiusParam:'ClawLiftDriveRadius',pinRadius:drivePinRadius,teeth:12,module:3,phase:0,color:'#e74c3c',motorType:'mg995',servoStart:-180,servoEnd:0},
   {type:'gear',id:'ClawLiftGear',name:'36 齒升降輸出輪',p1:{...axis},p2:{...pin},radiusParam:'ClawLiftGearRadius',pinRadiusParam:'ClawLiftPinRadius',teeth:36,module:3,phase:0,mesh:'ClawLiftDrive',color:'#3498db'},
   {type:'bar',id:'ClawLiftArm',name:'升降臂定位段',p1:{...axis},p2:{...pin},lenParam:'ClawLiftPinRadius',color:'#e67e22',fixedLen:true,isInput:false,snapLength:false,barFusionRoot:'ClawLiftArm',barFusion:{version:1,members:['ClawLiftArm','ClawLiftExtension'],points:[{id:axis.id,x:0,y:0},{id:pin.id,x:24,y:0},{id:tip.id,x:160,y:0}]}},
   {type:'bar',id:'ClawLiftExtension',name:'升降臂外段',p1:{...pin},p2:{...tip},lenParam:'ClawLiftExtensionLength',color:'#e67e22',fixedLen:true,isInput:false,snapLength:false,barFusionRoot:'ClawLiftArm'}
  ],params:{theta:0,ClawLiftCenters:72,ClawLiftDriveRadius:18,ClawLiftGearRadius:54,ClawLiftPinRadius:24,ClawLiftExtensionLength:136}}
};
// Reuse the independently available dual-gear claw. Its dimensions are teaching
// values, not the original moulded IQ finger or gear specifications.
const gripComps=structuredClone(assemblyLessonSnapshot.comps.filter(c=>c.moduleId==='Grip1'));
Object.assign(gripComps.find(c=>c.type==='gear'&&c.p1.physicalMotor),{motorType:'mg995',servoStart:0,servoEnd:30});
const gripModule=structuredClone(assemblyLessonSnapshot.modules.find(m=>m.id==='Grip1'));
// Recorded by buildFaceCandidate: arm front face → claw base bottom edge.
// The arm is horizontal at home; the claw plane is perpendicular and follows it.
gripModule.mount={to:{module:'ClawLift',output:'tool'},ref:{x:160,y:0,a:0},home:{},face:{
 version:1,childPart:'frame',rotation:[[1.8369701987210297e-16,-1,0],[0,0,1],[-1,-1.8369701987210297e-16,0]],translation:{x:191.99999999999997,y:8,z:80},
 selection:{brackets:{enabled:true,offsets:{L1:0,R1:0,L2:0},childPart:'frame'},hostFace:'front',childFace:'bottom',alignU:0,alignV:0,offsetU:-100,offsetV:0,gap:0,quarterTurns:3},hostThicknessMm:3,childThicknessMm:3}};
const combinedSnapshot={...structuredClone(CLAWBOT_LIFT_EXAMPLE.snapshot),counter:9,projectName:'IQ Clawbot 升降與夾取',
 comps:[...structuredClone(CLAWBOT_LIFT_EXAMPLE.snapshot.comps).map(c=>({...c,moduleId:'ClawLift'})),...gripComps],
 params:{...CLAWBOT_LIFT_EXAMPLE.snapshot.params,...Object.fromEntries(['GRA','GRB','GPRA','GPRB','LJ_tip','LJ_edge','RJ_tip','RJ_edge'].map(k=>[k,assemblyLessonSnapshot.params[k]]))},
 modules:[{id:'ClawLift',name:'Clawbot 3:1 升降臂',source:'clawbot-geared-lift',base:'ClawLiftMotor',outputs:[{id:'tool',name:'升降臂工具端',at:'ClawLiftTip',body:{kind:'bar',id:'ClawLiftExtension'}}],mount:null},gripModule],
 assemblyMembers:['ClawLift','Grip1'],motorAngles:{'2':0},tracePoints:['LT','RT']};
const practiceSnapshot=structuredClone(combinedSnapshot);
practiceSnapshot.projectName='IQ Clawbot 升降與夾取組立練習';
practiceSnapshot.modules.find(m=>m.id==='Grip1').mount=null;
export const IQ_CLAWBOT_EXAMPLES=[CLAWBOT_LIFT_EXAMPLE,{
 id:'clawbot-lift-gripper',title:'IQ Clawbot：升降與夾取組立',
 note:'先分別學升降臂與雙齒輪夾爪，再看兩個獨立馬達組合。夾爪底板垂直接在臂前段，升降時隨臂傾斜；不含行走底盤。',
 adjustmentNote:'組立台選 M1 抬臂、M2 開合；兩機構分別在原設計分頁修改。板材、馬達與角件是改製示範，不是 IQ 原廠零件。',
 lesson:{group:'challenge',level:'來源組立',use:'Clawbot 單轉軸升降臂加雙齒輪反向夾爪；沿原模組與選面組立操作。',
  learn:'升降與開合是兩個輸入。夾爪平面與升降平面垂直，固定在臂端就會隨臂傾斜。',
  try:['先開獨立升降臂及既有雙齒輪夾爪，各自試動','切到組立，用 M1 與 M2 分別抬臂、開合','回升降臂設計，改橘色外段孔距；保存後重新開啟'],
  predict:'只抬臂，夾爪開口會改變嗎？夾爪底板還保持水平嗎？',measure:'M1 輸入 −180° 時臂抬起 60°；M2 保持時，夾爪內部各孔距不變。',
  explain:'依官方 IQ Clawbot 2.0 步驟 45c～54 的雙側反向夾爪與前端剛性安裝。保留單轉軸及兩個輸入；夾爪沿用本專案 16 齒／模數 4 與板件尺寸，不是原廠齒數、尺寸或裝配圖。橡皮筋、接觸、抓取力、馬達支架與實物承載未驗證；角件材料核對仍有未覆蓋項目。'},
 snapshot:combinedSnapshot
},{
 id:'clawbot-lift-gripper-practice',title:'IQ Clawbot：兩個機構組立練習',
 note:'升降臂與夾爪先分開。由原組立台選夾爪，以「接合預覽」選升降臂外段及夾爪底板，練習確認、取消與復原。',
 lesson:{group:'challenge',level:'組立練習',use:'先各自修改兩個機構，再用既有接合操作完成 Clawbot 用途組立。',
  try:['分別試動升降臂 M1 與夾爪 M2','切組立，選夾爪接合預覽；宿主選升降臂外段正面、夾爪選底面，轉向 270°、左右 −100 mm','預覽取消一次，再確認並復原；保存重新開啟'],
  explain:'原範例頁另有已組立版本可對照。來源結構與改製尺寸的界限相同；未含底盤、橡皮筋平衡、接觸或實物驗證。'},snapshot:practiceSnapshot
}];
