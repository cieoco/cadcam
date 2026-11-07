/** IQ 用途試作；只表達現有零件能求解的幾何，不模擬接觸或彈性釋放。 */
const p=(id,x,y,type='floating')=>({id,x,y,type});
const bar=(id,p1,p2,lenParam,color,extra={})=>({type:'bar',id,p1,p2,lenParam,color,fixedLen:true,isInput:false,snapLength:false,...extra});
const motor=p('RollMotor',-64,32,'motor'),axis=p('RollAxis',0,32,'fixed');
const motorPin=p('RollMotorPin',-59,32),rollPin=p('RollPin',8,32);
const throwO=p('ThrowO',0,0,'motor'),throwD=p('ThrowD',96,0,'fixed'),throwA=p('ThrowA',0,24);
const throwB=p('ThrowB',71.81344526533933,59.25378106135729),throwTip=p('ThrowTip',47.62689053067866,118.50756212271458);
const fuse=(members,points)=>members.map((c,i)=>({...c,barFusionRoot:members[0].id,...(!i?{barFusion:{version:1,members:members.map(m=>m.id),points:points.map(([id,x,y])=>({id,x,y}))}}:{})}));
// Three X stages, with a pinned end and a horizontal slider at both ends.
// 112 mm arms and the mount offsets are teaching values inferred from the photo.
const scissorH=Math.sqrt((95**2-80**2)*7/8),scissorW=Math.sqrt(112**2-scissorH**2);
const left=Array.from({length:4},(_,i)=>p(`ScissorL${i}`,0,i*scissorH,i===0?'fixed':'floating'));
const right=Array.from({length:4},(_,i)=>p(`ScissorR${i}`,scissorW,i*scissorH));
const scissorArms=left.slice(0,3).flatMap((a,i)=>{
 const mid=p(`ScissorM${i}`,scissorW/2,(i+.5)*scissorH),up=`ScissorUp${i}`,down=`ScissorDown${i}`;
 return [...fuse([bar(up,a,mid,`${up}Length`,'#e74c3c'),bar(`${up}Tip`,mid,right[i+1],`${up}TipLength`,'#e74c3c')],
  [[a.id,0,0],[mid.id,56,0],[right[i+1].id,112,0]]),
 ...fuse([bar(down,right[i],mid,`${down}Length`,'#3498db'),bar(`${down}Tip`,mid,left[i+1],`${down}TipLength`,'#3498db')],
  [[right[i].id,0,0],[mid.id,56,0],[left[i+1].id,112,0]])].map((c,k)=>({...c,name:`第 ${i+1} 層${k<2?'上升':'下降'}剪臂${k%2?'外段':'內段'}`}));
});
const scissorRailEnd=p('ScissorRailEnd',128,scissorH*3),scissorPlatformEnd=p('ScissorP',192,scissorH*3);
export const IQ_MECHANISM_EXAMPLES = [
 {
  id:'continuous-roller-intake',title:'連續滾輪吸入器：傳動試作',
  note:'側視：兩個直徑 10 mm 皮帶輪同向等速，橘色直徑 40 mm 圓盤代表滾輪外緣。下方灰桿為導板；未模擬抓球或物件運送。',
  adjustmentNote:'點橘色圓盤改外徑，觀察與導板的間隙。圓盤只是橡皮筋滾輪的端視包絡，不是完整滾筒施工圖。',
  lesson:{group:'manipulator',level:'試作',use:'參考 IQ Fling 的皮帶驅動滾輪；連續轉動，與往復擺臂進料不同。',
   learn:'傳動比由皮帶輪直徑決定，滾輪外徑改變接觸範圍。',
   try:['播放並反轉，觀察皮帶輪與滾輪轉向','點橘色圓盤，把外徑 40 改為 48 mm，再復原','保存並重開，比較滾輪外緣與灰色導板的間隙'],
   predict:'滾輪加大，轉速比會改變嗎？下方間隙如何改變？',measure:'兩輪同轉一圈；中心高 32 mm，外徑 40／48 mm 的理想下緣高為 12／8 mm，尚未扣導板厚度。',
   explain:'輪徑參考官方案例；軸距與支架為示範值。橡皮筋、摩擦、抓取力、打滑及物件接觸未模擬。'},
  snapshot:{kind:'blocks',v:1,counter:6,projectName:'連續滾輪吸入器',tracePoint:'RollPin',comps:[
   {type:'pulley',id:'IntakeMotorPulley',p1:{...motor,physicalMotor:'1'},p2:motorPin,radiusParam:'IntakeDriveRadius',pinRadius:5,phase:0,color:'#e74c3c'},
   {type:'pulley',id:'IntakeRollPulley',p1:axis,p2:rollPin,radiusParam:'IntakeDrivenRadius',pinRadius:8,phase:0,color:'#3498db'},
   {type:'belt',id:'IntakeBelt',driver:'IntakeMotorPulley',driven:'IntakeRollPulley',color:'#34495e'},
   bar('IntakeRoller',axis,rollPin,'IntakeRollPin','#e67e22',{shape:'disk',diameterMm:40,zlift:1}),
   bar('IntakeFrame',motor,axis,'IntakeAxles','#95a5a6',{frameSeparate:true}),
   bar('IntakeGuide',p('RollGuideA',-32,0,'fixed'),p('RollGuideB',32,0,'fixed'),'IntakeGuideLength','#95a5a6',{frameSeparate:true})
  ],params:{theta:0,IntakeDriveRadius:5,IntakeDrivenRadius:5,IntakeRollPin:8,IntakeAxles:64,IntakeGuideLength:64}}
 },
 {
  id:'crank-catapult-study',title:'曲柄投球臂：拉緊段示意',
  note:'紅色 60 齒輪的偏心孔經藍桿拉下橘色投球臂。這是拉緊段的固定桿近似；往返播放不是彈射，沒有接觸釋放或球的飛行。',
  adjustmentNote:'點橘色臂選第 2 段，改末端長度；點馬達改拉下角段。省略上游減速，使用現有伺服限制觀察角段，不能作為 Fling 完整投球器。',
  lesson:{group:'manipulator',level:'局部試作',use:'參考 IQ Fling 曲柄拉緊投球臂的用途，先觀察偏心孔、拉桿與臂端行程。',
   learn:'剛性拉桿可以比較拉下幾何；真正越過死點釋放需要可折臂、接觸及彈性作用。',
   try:['播放 0°～60°，看工具端逐漸下降','點橘色臂選第 2 段，把 64 改為 72 mm，再復原','保存重開；把未模擬的釋放、橡皮筋與球列為實物驗證項目'],
   predict:'延長臂端，相同轉角的垂直行程會增加嗎？',measure:'比較工作點起終高度；角度是相對起始曲柄 90° 的輸入增量。',
   explain:'60 齒取自官方案例，其餘長度為示範。沒有模擬蓄能、發射速度、射程或原機的 15:1 複合減速。'},
  snapshot:{kind:'blocks',v:1,counter:5,projectName:'曲柄投球臂拉緊段',tracePoint:'ThrowTip',comps:[
   bar('ThrowFrame',throwO,throwD,'ThrowGround','#95a5a6',{frameSeparate:true}),
   {type:'gear',id:'ThrowCrank',p1:{...throwO,physicalMotor:'1'},p2:throwA,radiusParam:'ThrowRadius',pinRadiusParam:'ThrowPin',teeth:60,module:1,phase:90,motorType:'mg995',servoStart:0,servoEnd:60,color:'#e74c3c'},
   bar('ThrowCoupler',throwA,throwB,'ThrowPull','#3498db'),
   bar('ThrowArm',throwD,throwB,'ThrowArmLength','#e67e22',{barFusionRoot:'ThrowArm',barFusion:{version:1,members:['ThrowArm','ThrowExtension'],points:[{id:'ThrowD',x:0,y:0},{id:'ThrowB',x:64,y:0},{id:'ThrowTip',x:128,y:0}]}}),
   bar('ThrowExtension',throwB,throwTip,'ThrowTipLength','#e67e22',{barFusionRoot:'ThrowArm'})
  ],params:{theta:0,ThrowGround:96,ThrowRadius:30,ThrowPin:24,ThrowPull:80,ThrowArmLength:64,ThrowTipLength:64}}
 },
 {
  id:'guided-scissor-lift',title:'針筒驅動三層剪式升降台',
  note:'依 VEX 原圖的三組交叉桿重建；底座與平台各有一個轉軸端及水平滑塊端。斜向針筒接在第一層與第三層活動剪臂上，伸出時抬高平台。',
  adjustmentNote:'沿原針筒伸出量試動；點橘色平台改長度，點上方滑軌改允許行程。尺寸是未量測的教學示範值，不是原機施工規格。',
  lesson:{group:'lift-motion',level:'幾何試作',use:'參考 VEX 剪式升降台照片的三層 X、水平上下滑槽及跨層斜置致動器。',
   learn:'三層共用交叉中軸；滑塊隨剪臂展開而收近。針筒兩端都隨剪臂移動，並非底部滑塊的直線驅動。',
   try:['調整針筒伸出量 0～40 mm，觀察三層與水平平台','點橘色平台，選外伸段，把 64 改為 72 mm，再復原','保存重開，核對針筒兩端仍接在活動剪臂及上滑塊仍接平台'],
   predict:'針筒每伸出相同距離，平台升高量也相同嗎？',measure:'每支剪臂孔距 112 mm、中心孔在 56 mm；針筒孔距 95～135 mm 時，平台高度約 143.777～305.159 mm。',
   explain:'結構取自官方照片；112 mm 剪臂、安裝孔及針筒 95+40 mm 均為未量測示範值。未驗證實物、承重、摩擦、全行程干涉或原機液壓規格。'},
  snapshot:{kind:'blocks',v:1,counter:20,projectName:'針筒驅動三層剪式升降台',tracePoint:'ScissorP',comps:[
   ...scissorArms,
   ...fuse([bar('ScissorPlatform',left[3],scissorRailEnd,'ScissorPlatformLength','#e67e22',{name:'平台滑槽段'}),bar('ScissorExtension',scissorRailEnd,scissorPlatformEnd,'ScissorExtensionLength','#e67e22',{name:'平台外伸段'})],
    [['ScissorL3',0,0],['ScissorRailEnd',128,0],['ScissorP',192,0]]),
   {type:'slider',id:'ScissorBottom',name:'底座水平滑軌',p1:left[0],p2:p('ScissorBaseEnd',192,0,'fixed'),p3:right[0],lenParam:'ScissorBottomLength',carriageLen:16,carrierLen:192,travelStart:40,travelEnd:112,color:'#16a085'},
   {type:'slider',id:'ScissorTop',name:'平台水平滑軌',movingRail:true,p1:left[3],p2:scissorRailEnd,p3:right[3],lenParam:'ScissorTopLength',carriageLen:16,carrierLen:128,travelStart:40,travelEnd:112,color:'#16a085'},
   {type:'syringe',id:'ScissorSyringe',name:'跨層斜置針筒',a:{componentId:'ScissorUp0Tip',u:40,v:0},b:{componentId:'ScissorUp2',u:16,v:0},extension:0,branch:1,
    spec:{name:'10mL 教學示範（未校正）',capacityMl:10,outerDiameter:16,bodyLength:70,rodDiameter:6,lmin:95,stroke:40,calibrated:false}}
  ],params:{theta:0,ScissorPlatformLength:128,ScissorExtensionLength:64,ScissorBottomLength:192,ScissorTopLength:128,
   ...Object.fromEntries(scissorArms.map(c=>[c.lenParam,56]))}}
 }
];
