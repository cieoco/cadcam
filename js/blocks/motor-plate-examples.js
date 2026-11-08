import {FABRICATION_DEFAULTS} from './fabrication-profile.js';
/** Model-specific board prototypes. Catalog is lazy; no new solver or assembly workflow. */
import {makeStandardBlank} from './standard-blank.js';
import {SERVO_PLATE_ARM_EXAMPLE} from './servo-mount-examples.js';
import {planActuatorPlateHoles} from './actuator-plate-holes.js';
export const MOTOR_PLATE_EXAMPLES=['tt','n20'].map(type=>{
 const snapshot=structuredClone(SERVO_PLATE_ARM_EXAMPLE.snapshot),out=snapshot.comps.find(c=>c.isInput),seat=snapshot.comps.find(c=>c.type==='triangle');
 snapshot.fabrication=structuredClone(FABRICATION_DEFAULTS);out.motorType=type;delete out.servoStart;delete out.servoEnd;seat.name='標準馬達座板';snapshot.fabrication.drive.n20Spec=type==='n20'?1:0;
 if(type==='n20'){const m=makeStandardBlank({kind:'plate',columns:5,rows:5,n:1,origin:{x:-16,y:-16}}),c=m.comp;c.id=seat.id;c.name=seat.name;c.p1.type=c.p2.type='fixed';c.frameSeparate=true;c.motorMountPoint=out.p1.id;c.holes.find(h=>h.u===16&&h.v===16).id=out.p1.id;snapshot.comps[snapshot.comps.indexOf(seat)]=c;Object.assign(snapshot.params,m.params);}
 const planned=planActuatorPlateHoles(snapshot);if(!planned.ok)throw Error(planned.message);snapshot.comps=planned.comps;
 const title=type==='tt'?'TT座板＋雙孔輪轂輸出板':'N20前端雙孔座＋四孔輪轂輸出板';snapshot.projectName=title;
 return {id:`motor-plate-${type}`,title,snapshot,note:type==='tt'?'沿既有TT座孔與12 mm雙孔輪轂，裝在69×45×3 mm標準板；輸出板69×29×3 mm可整圈試動，孔規格待實量。':'特定12×10 mm減速箱前端雙M1.6（孔距9 mm）及3 mm軸輪轂試作。清孔1.8／凸台4.2與板材接法為改製推論，非所有N20通用規格。',
 adjustmentNote:'點輸出工作孔改長度，開安裝調整選孔、正背面及方向；確認才修改，取消保留原作。',
 lesson:{group:'challenge',level:'外購件試作',use:'以實際標準孔板固定馬達，透過至少雙螺絲輪轂帶動輸出板。',learn:type==='tt'?'TT沿既有座孔、定位孔與輪轂雙孔。普通舊桿仍用原扁軸孔，只有選用輸出板才改輪轂介面。':'N20明選特定前端座與3 mm軸輪轂，規格套用本作品全部N20。前座兩顆M1.6與輪轂板上四顆M3不同；輪轂側M3止付也不是板上螺絲。',try:['播放，觀察輸出板整圈旋轉','改輸出板48→56 mm，再復原','開安裝，比對2D、3D與保存重開'],measure:`${type==='tt'?'座板8×5孔格、69×45×3 mm':'座板5×5孔格、45×45×3 mm'}；輸出軸距48 mm、板寬29 mm、軸後留8 mm。專用孔占用的格孔停用，其他格孔可接桿。`,explain:type==='tt'?'座孔及輪轂沿既有可調試作值；軸長、螺絲規格、間隙、承載與實物未核對。':'參考特定前端尺寸圖及3 mm軸四M3輪轂圖：前座孔距9 mm、凸台4 mm；輪轂孔圓徑12.7 mm。清孔1.8／讓位4.2／輪轂板孔3.2 mm為板材化推論。小孔需另鑽；M1.6螺絲長度需依3 mm板與實際牙深決定。馬達與輪轂3D外形為示意，軸向位置、配對、承載與實物未驗證。'}};
});
export function register(examples,lessons){for(const e of MOTOR_PLATE_EXAMPLES){if(examples.some(x=>x.id===e.id))continue;const {lesson,...entry}=e;examples.push(entry);lessons[e.id]=lesson;}}
