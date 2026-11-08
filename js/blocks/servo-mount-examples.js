/** Two MG995 prototypes using an editable standard board; hardware dimensions await measurement. */
import {makeStandardBlank} from './standard-blank.js';
import {planActuatorPlateHoles} from './actuator-plate-holes.js';
import {FABRICATION_DEFAULTS} from './fabrication-profile.js';

const stock = {widthMm:13, thicknessMm:3, material:'unspecified'};
// 作品層的加工設定。尾端線槽缺口預設 8×4 會和遠端兩個耳孔重疊 0.59 mm（P8），
// 這裡只改這幾個範例的作品，不動全域預設；試作舵盤螺絲 → 3.2。
function fabrication() {
  const f = structuredClone(FABRICATION_DEFAULTS);
  f.mg995Mount.cableNotchWidthMm = 6;
  f.mg995Mount.cableNotchDepthMm = 2;
  f.drive.hornScrewMm = 3.2;
  return f;
}
function seat(columns,axisId,rockerId=null){const made=makeStandardBlank({kind:'plate',columns,rows:5,n:1,origin:{x:-40,y:-16}}),c=made.comp;c.id='ServoPlate';c.name='標準舵機座板';c.p1.type=c.p2.type='fixed';c.frameSeparate=true;c.motorMountPoint=axisId;c.holes.find(h=>h.u===40&&h.v===16).id=axisId;if(rockerId){const h=c.holes.find(h=>h.u===88&&h.v===16);h.id=rockerId;h.type='fixed';}return made;}
function withSeat(example,columns,axisId,rockerId=null){const m=seat(columns,axisId,rockerId);example.snapshot.comps.unshift(m.comp);Object.assign(example.snapshot.params,m.params);const input=example.snapshot.comps.find(c=>c.isInput);input.motorMount={motor:'1',center:axisId,frameBody:m.comp.id,outputBody:input.id,orientation:'horizontal',reversed:true,face:'back',order:['motor','frameBody','outputBody']};const planned=planActuatorPlateHoles({...example.snapshot,fabrication:example.snapshot.fabrication});if(!planned.ok)throw Error(planned.message);example.snapshot.comps=planned.comps;return example;}

const gridHoles = (id, us) => us.map(u => ({id:`${id}H${u}`, u, v:0, type:'floating', diameter:3.2}));

export const SERVO_PLATE_ARM_EXAMPLE = {
  id:'servo-plate-arm',
  title:'舵機座板＋輸出棍',
  note:'MG995 穿過 8×5 孔標準板（69×45×3 mm），輸出一支 13 mm 標準棍擺動 0°～90°。軸心是板格點；槽與耳孔是外購介面孔。',
  adjustmentNote:'播放看棍在0°～90°擺動；座板可按孔數或毫米修改。點棍的末端孔改孔距（8 的倍數），再復原。軸心目前在棍端，棍端不能再往軸心外側延伸。',
  lesson:{group:'challenge', level:'外購件示範',
    use:'看一顆 MG995 如何裝在標準孔板上，並帶動一支標準棍。',
    learn:'輸出軸心落在板的格點；穿板槽與四個耳孔依零件規格開，不在 8 mm 格上。棍上 +7 mm 的舵盤孔離 8 mm 格孔只差 1 mm，所以 8 mm 位置不開孔，格孔從 16 mm 起。',
    try:['播放，觀察棍從 0°擺到 90°','點棍的末端孔，把 48 mm 改為 40 mm 再復原','開 3D，看座板、伺服槽與耳孔的位置'],
    predict:'棍加長一格（8 mm），端點的掃過弧長會多多少？',
    measure:'座板 69×45×3 mm，板格 x=−40…+16、y=−16…+16，軸心在第 6 欄中列。棍軸心到末孔 48 mm；MG995 擺角 0°～90°。',
    explain:'座板、軸心、尺寸為板材化試作（耳孔距與槽尺寸待實量）。尾端線槽缺口在作品層改為 6×2 mm，與遠端耳孔保留 1.34 mm 材料；全域預設8×4未變；本座板安裝若孔槽相撞會拒絕。軸心在棍端時舵盤只有中心孔與一顆螺絲孔，「軸心往內一格、兩顆螺絲」需要引擎支援輸入桿在軸心外側延伸，尚未實作。承載、扭力與實物未驗證。'},
  snapshot:{kind:'blocks', v:1, counter:4, projectName:'舵機座板＋輸出棍', tracePoint:'ServoArmTip', fabrication:fabrication(),
    params:{theta:0, ServoArmLen:48},
    comps:[
      {type:'bar', id:'ServoArm', name:'輸出棍', color:'#e74c3c', isInput:true, physicalMotor:'1', motorType:'mg995', servoStart:0, servoEnd:90,
        p1:{id:'ServoAxis', type:'fixed', x:0, y:0, physicalMotor:'1'},
        p2:{id:'ServoArmTip', type:'floating', x:48, y:0},
        lenParam:'ServoArmLen', fixedLen:true, snapLength:false, stock:{...stock},
        motorMount:{center:'ServoAxis', orientation:'horizontal', reversed:true},
        holes:gridHoles('ServoArm', [16, 24, 32, 40])}
    ]}
};

// 機架 48、曲柄 24、連桿 48、搖桿 32（全為 8 的倍數）：曲柄最短且鄰接機架，24+48 < 48+32，Grashof 成立。
// 曲柄起始朝上（phaseOffset 90°），MG995 0°～90° 使曲柄轉到 90°→180°，搖桿由約 91° 擺到 148°，傳力角最小約 53°。
export const SERVO_PLATE_FOURBAR_EXAMPLE = {
  id:'servo-plate-fourbar',
  title:'舵機曲柄四連桿',
  note:'MG995 裝在 12×5 孔標準板（101×45×3 mm）的左端，板的右端格點是搖桿固定孔。MG995 在 0°～90° 來回擺，搖桿跟著往復。',
  adjustmentNote:'播放看搖桿往復。點連桿改 48→56 mm 再復原；MG995 只有角度範圍，曲柄不是整圈轉。',
  lesson:{group:'challenge', level:'外購件示範',
    use:'用一顆 MG995 驅動標準棍組成的四連桿，座板同時是機架。',
    learn:'同一片標準孔板兼作機架：左端是伺服座板，右端格點是搖桿固定孔。曲柄、連桿與搖桿孔距都是 8 的倍數。',
    try:['播放，量搖桿擺過的角度','把連桿 48 改 56 mm，看搖桿擺角變大還是變小，再復原','保存重開，核對座板尺寸與孔位'],
    predict:'曲柄只轉 90°，搖桿擺角會比 90° 大還是小？',
    measure:'座板 101×45×3 mm，板格 x=−40…+48；機架 48、曲柄 24、連桿 48、搖桿 32 mm。曲柄由朝上 90°轉到 180°，搖桿約 91°→148°。',
    explain:'尺寸為教學示範值。尾端線槽缺口在作品層改為 6×2 mm，避免與耳孔重疊；軸心在曲柄棍端，舵盤孔只有中心孔與一顆螺絲孔（引擎尚不支援軸心往內一格）。承載、全行程干涉與實物未驗證。'},
  snapshot:{kind:'blocks', v:1, counter:7, projectName:'舵機曲柄四連桿', tracePoint:'FourbarJ2', fabrication:fabrication(),
    params:{theta:0, FourbarCrank:24, FourbarCoupler:48, FourbarRocker:32},
    comps:[
      {type:'bar', id:'FourbarCrank', name:'曲柄棍（MG995 輸出）', color:'#e74c3c', isInput:true, physicalMotor:'1', motorType:'mg995', servoStart:0, servoEnd:90,
        p1:{id:'FourbarAxis', type:'fixed', x:0, y:0, physicalMotor:'1'},
        p2:{id:'FourbarJ1', type:'floating', x:0, y:24}, phaseOffset:90,
        lenParam:'FourbarCrank', fixedLen:true, snapLength:false, stock:{...stock},
        motorMount:{center:'FourbarAxis', orientation:'horizontal', reversed:true}},
      {type:'bar', id:'FourbarCoupler', name:'連桿', color:'#3498db',
        p1:{id:'FourbarJ1', type:'floating', x:0, y:24}, p2:{id:'FourbarJ2', type:'floating', x:47.329824075289345, y:31.992981483912036},
        lenParam:'FourbarCoupler', fixedLen:true, isInput:false, snapLength:false, stock:{...stock}},
      {type:'bar', id:'FourbarRocker', name:'搖桿', color:'#27ae60',
        p1:{id:'FourbarF', type:'fixed', x:48, y:0}, p2:{id:'FourbarJ2', type:'floating', x:47.329824075289345, y:31.992981483912036},
        lenParam:'FourbarRocker', fixedLen:true, isInput:false, snapLength:false, stock:{...stock}}
    ]}
};

export const SERVO_PLATE_EXAMPLES = [withSeat(SERVO_PLATE_ARM_EXAMPLE,8,'ServoAxis'),withSeat(SERVO_PLATE_FOURBAR_EXAMPLE,12,'FourbarAxis','FourbarF')];

/** 加進範例清單與教學資料；重複呼叫不會重複加入。 */
export function register(examples, lessons) {
  for (const example of SERVO_PLATE_EXAMPLES) {
    if (examples.some(e => e.id === example.id)) continue;
    examples.push({id:example.id, title:example.title, note:example.note, adjustmentNote:example.adjustmentNote, snapshot:structuredClone(example.snapshot)});
    lessons[example.id] = example.lesson;
  }
}
