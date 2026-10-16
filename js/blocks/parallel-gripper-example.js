/** Double parallelogram jaws, synchronized by equal external gears.
 * Project demonstration dimensions, not a vendor drawing or verified hardware design.
 */
const p=(id,x,y,type='floating',extra={})=>({id,type,x,y,...extra});
const d=24/Math.sqrt(2);
const left=p('PGLeftAxis',-36,0,'motor',{physicalMotor:'1'}),right=p('PGRightAxis',36,0,'fixed');
const lf=p('PGLeftFixed',-36,48,'fixed'),rf=p('PGRightFixed',36,48,'fixed');
const a=p('PGLeftPin',-36-d,d),b=p('PGRightPin',36+d,d);
const c=p('PGLeftTop',-36-d,48+d),e=p('PGRightTop',36+d,48+d);
const bar=(id,p1,p2,lenParam,color)=>({type:'bar',id,p1,p2,lenParam,color,fixedLen:true,snapLength:false,isInput:false});
export const PARALLEL_GRIPPER_EXAMPLE={
 id:'parallel-gripper',title:'雙側平行四連桿夾爪',
 note:'等齒輪同步帶動左右四連桿，兩個夾指保持平行；夾指沿圓弧平移，不是純直線滑台。',
 adjustmentNote:'可調：馬達起終角（已驗證 −30°～30°）、共同臂長。越過死點可能切換分支而失去平行。兩齒輪的輸出半徑與兩從動桿共用臂長；任意改其他孔距可能破壞平行。接觸、承載、層間干涉與五金未驗證。',
 lesson:{group:'manipulator',level:'實戰',use:'比較平行夾指與旋轉式夾爪：開合時夾指方向保持不變。',
  learn:'左右各一組平行四連桿，由同一顆馬達經等齒輪反向同步。',
  try:['點馬達，將起角 −30° 改為 −15°，比較開口','點從動連桿改共同臂長，再確認兩夾指方向','從範例視窗加入目前作品，接到手腕或升降輸出端'],
  predict:'改變開合角度時，兩片夾指會跟著轉斜嗎？',measure:'比較夾指兩孔的連線方向；孔中心間距不是淨開口。',explain:'平行只描述方向；不保證夾持、避碰或直線運動。'},
 snapshot:{kind:'blocks',v:1,counter:9,projectName:'雙側平行夾爪',tracePoints:['PGLeftTop','PGRightTop'],
  params:{theta:0,PG_RADIUS:36,PG_ARM:24,PG_SPAN:48},
  comps:[
   {type:'gear',id:'PGGearLeft',p1:left,p2:a,radiusParam:'PG_RADIUS',pinRadiusParam:'PG_ARM',teeth:18,module:4,phase:135,motorType:'mg995',servoStart:-30,servoEnd:30,color:'#e74c3c',pinHoleDiameter:3.2},
   {type:'gear',id:'PGGearRight',p1:right,p2:b,radiusParam:'PG_RADIUS',pinRadiusParam:'PG_ARM',teeth:18,module:4,phase:45,mesh:'PGGearLeft',color:'#3498db',pinHoleDiameter:3.2},
   bar('PGLeftGround',p(left.id,left.x,left.y,'fixed'),lf,'PG_SPAN','#95a5a6'),bar('PGRightGround',right,rf,'PG_SPAN','#95a5a6'),
   bar('PGLeftFollower',lf,c,'PG_ARM','#2ecc71'),bar('PGRightFollower',rf,e,'PG_ARM','#2ecc71'),
   bar('PGLeftJaw',a,c,'PG_SPAN','#f39c12'),bar('PGRightJaw',b,e,'PG_SPAN','#f39c12'),
   {type:'anchor',id:'PGMount',p1:p('PGMount',0,-48,'fixed')}
  ]}
};
