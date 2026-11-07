/** IQ 用途試作；只表達現有零件能求解的幾何，不模擬接觸或彈性釋放。 */
const p=(id,x,y,type='floating')=>({id,x,y,type});
const bar=(id,p1,p2,lenParam,color,extra={})=>({type:'bar',id,p1,p2,lenParam,color,fixedLen:true,isInput:false,snapLength:false,...extra});
const motor=p('RollMotor',-64,32,'motor'),axis=p('RollAxis',0,32,'fixed');
const motorPin=p('RollMotorPin',-59,32),rollPin=p('RollPin',8,32);
const throwO=p('ThrowO',0,0,'motor'),throwD=p('ThrowD',96,0,'fixed'),throwA=p('ThrowA',0,24);
const throwB=p('ThrowB',71.81344526533933,59.25378106135729),throwTip=p('ThrowTip',47.62689053067866,118.50756212271458);
const sa=p('ScissorA',0,0,'fixed'),sb=p('ScissorB',96,0),sm=p('ScissorM',48,64);
const sc=p('ScissorC',0,128),sd=p('ScissorD',96,128),sp=p('ScissorP',192,128),sq=p('ScissorQ',192,184);
const fuse=(members,points)=>members.map((c,i)=>({...c,barFusionRoot:members[0].id,...(!i?{barFusion:{version:1,members:members.map(m=>m.id),points:points.map(([id,x,y])=>({id,x,y}))}}:{})}));
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
  id:'guided-scissor-lift',title:'導軌式剪式升降台',
  note:'底部滑塊收近時升高、拉遠時下降。交叉桿左上端抬平台，右側導軌經斜撐保持平台水平；右上剪臂端未固定在平台上。',
  adjustmentNote:'這是單側抬升、右側導向的試作，不是雙端接移動滑槽的標準剪式台。點橘色平台改伸出長度，或點底部滑軌改行程。',
  lesson:{group:'lift-motion',level:'試作',use:'沿用交叉一體桿、直線輸入及固定導軌，探索剪式升降。右上剪臂端只呈現位置，不模擬與平台接觸。',
   learn:'兩根交叉桿共用中間轉軸；底部跨度變小，高度增加，平台另由右側導軌限制方向。',
   try:['播放底部跨度 96～144 mm，觀察平台下降，再反向升高','點橘色平台選水平段，把 192 改為 200 mm，再復原','保存重開；不要把右上剪臂端直接固定到平台，否則會鎖死'],
   predict:'底部滑塊每移動相同距離，升降高度也相同嗎？',measure:'剪臂端距 160 mm，跨度 96／144 mm 時高度約 128／69.7424 mm。',
   explain:'屬幾何試作；直線驅動為理想輸入，沒有指定實體致動器。板材、軸承、導軌支承、接觸與承載未驗證。'},
  snapshot:{kind:'blocks',v:1,counter:8,projectName:'導軌式剪式升降台',tracePoint:'ScissorP',comps:[
   ...fuse([bar('ScissorAscending',sa,sm,'ScissorAscendingLength','#e74c3c'),bar('ScissorFreeTip',sm,sd,'ScissorFreeTipLength','#e74c3c')],
    [['ScissorA',0,0],['ScissorM',80,0],['ScissorD',160,0]]),
   ...fuse([bar('ScissorDescending',sm,sb,'ScissorDescendingLength','#3498db'),bar('ScissorLiftTip',sm,sc,'ScissorLiftTipLength','#3498db')],
    [['ScissorM',0,0],['ScissorB',80,0],['ScissorC',-80,0]]),
   // 右導軌先依 C–Q 斜撐求交點；水平段仍是合成基準，局部孔位落在 8 mm 格上。
   bar('ScissorBrace',sc,sq,'ScissorBraceLength','#e67e22',{barFusionRoot:'ScissorPlatform'}),
   bar('ScissorPlatform',sc,sp,'ScissorPlatformLength','#e67e22',{barFusionRoot:'ScissorPlatform',barFusion:{version:1,members:['ScissorPlatform','ScissorBrace'],points:[{id:'ScissorC',x:0,y:0},{id:'ScissorP',x:192,y:0},{id:'ScissorQ',x:192,y:56}]}}),
   {type:'slider',id:'ScissorBottom',p1:p('ScissorS1',0,0,'fixed'),p2:p('ScissorS2',176,0,'fixed'),p3:sb,lenParam:'ScissorBottomLength',carriageLen:24,carrierLen:176,travelStart:96,travelEnd:144,sign:-1,isInput:true,physicalMotor:'1',color:'#16a085'},
   {type:'slider',id:'ScissorGuide',p1:p('ScissorR1',192,0,'fixed'),p2:p('ScissorR2',192,224,'fixed'),p3:sq,lenParam:'ScissorGuideLength',carriageLen:24,carrierLen:224,travelStart:0,travelEnd:224,sign:-1,color:'#16a085'}
  ],params:{theta:0,ScissorAscendingLength:80,ScissorFreeTipLength:80,ScissorDescendingLength:80,ScissorLiftTipLength:80,ScissorBraceLength:200,ScissorPlatformLength:192,ScissorBottomLength:176,ScissorGuideLength:224}}
 }
];
