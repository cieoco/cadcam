// 彎桿／多臂件 B2 介面的純邏輯：預設角度表、面板選項 → arms、整數欄位、編輯欄位清單、把手轉向。
//   node test/bent-arms-ui.mjs
import {check,report} from './_harness.mjs';
import {makeStandardBlank,resizeStandardBlank,ARMS} from '../js/blocks/standard-blank.js';
import {ARM_345_DEG,armsProblem} from '../js/blocks/arm-blank.js';
import {PRESETS_2,PRESETS_3,defaultPanel,panelArms,panelOptions,angleText,readHoles,readAngle,armExtentMm} from '../js/blocks/arm-presets.js';
import {armSide} from '../js/blocks/arm-handles.js';
import {readFileSync} from 'node:fs';

const make=arms=>makeStandardBlank({kind:'arms',arms,n:1,origin:{x:0,y:0}});
// 預設角度
check('兩臂預設：90、120、約127（3-4-5）、135、150',PRESETS_2.map(p=>p.angles[0]).join()===[90,120,ARM_345_DEG,135,150].join());
check('3-4-5 預設存精確值',PRESETS_2[2].angles[0]===ARM_345_DEG&&PRESETS_2[2].label.includes('3-4-5'));
check('三臂預設：T型、Y型、鐘形三臂',PRESETS_3.map(p=>p.label).join()==='T型,Y型,鐘形三臂'&&PRESETS_3.map(p=>p.angles.join('/')).join()==='90/180,120/240,90/225');
for(const p of PRESETS_2){const panel={...defaultPanel(2),angles:p.angles},r=make(panelArms(panel));check(`兩臂預設「${p.label}」可建立`,r.ok,r.message);}
for(const p of PRESETS_3){const panel={...defaultPanel(3),angles:p.angles},r=make(panelArms(panel));check(`三臂預設「${p.label}」可建立`,r.ok,r.message);}
// 面板選項 → arms
const d2=defaultPanel(2),d3=defaultPanel(3);
check('兩臂預設面板轉成 arms',JSON.stringify(panelArms(d2))===JSON.stringify([{holes:5,angleDeg:0},{holes:3,angleDeg:90}]));
check('三臂預設面板為 Y 型',JSON.stringify(panelArms(d3).map(a=>a.angleDeg))==='[0,120,240]'&&panelArms(d3).length===3);
const o=panelOptions(d3,{x:3,y:4});check('面板選項含 kind／arms／原點／畫面範圍',o.kind==='arms'&&o.arms.length===3&&o.origin.x===3&&o.lengthMm===armExtentMm(o.arms)&&Number.isFinite(o.heightMm));
check('面板選項可直接交給 makeStandardBlank',make(o.arms).ok&&makeStandardBlank({...o,n:2}).ok);
// 整數欄位
check('孔數接受 1–64 整數',readHoles('5',0).ok&&readHoles(' 64 ',1).value===64);
check('孔數拒絕 0／65／小數／空白／文字',['0','65','2.5','','abc'].every(t=>{const r=readHoles(t,0);return !r.ok&&/第1臂孔數/.test(r.message);}));
check('夾角只收整數 1–359',readAngle('127',1).ok&&['0','360','126.87','','x'].every(t=>!readAngle(t,1).ok));
check('夾角拒絕訊息提示用預設按鈕',/約127/.test(readAngle('126.5',1).message)&&/第2臂夾角/.test(readAngle('126.5',1).message));
check('3-4-5 角顯示「約127（3-4-5）」，整數照寫',angleText(ARM_345_DEG)==='約127（3-4-5）'&&angleText(120)==='120');
// 無效組合顯示核心的中文原因
check('兩臂 180° 的原因是中文',/直桿/.test(armsProblem(panelArms({...d2,angles:[180]}))));
check('夾角太近的原因是中文',/15°/.test(armsProblem(panelArms({...d2,angles:[10]}))));
// 命名與編輯欄位
const two=make(panelArms(d2)).comp,three=make(panelArms(d3)).comp;
check('零件名稱：兩臂「彎桿」、三臂「三臂件」',two.name==='彎桿'&&three.name==='三臂件');
const rows=ARMS.rows(two);
check('兩臂編輯欄位：第1、2臂孔數＋第2臂夾角',rows.map(r=>r[1]).join()==='第1臂孔數,第2臂孔數,第2臂夾角（度）'&&rows.map(r=>r[0]).join()==='arm0,arm1,angle1');
check('編輯欄位不出現「長向孔距」',!rows.some(r=>/長向孔距|直向孔距/.test(r[1])));
const rows3=ARMS.rows(three);
check('三臂編輯欄位：三個孔數＋兩個夾角',rows3.length===5&&rows3.map(r=>r[0]).join()==='arm0,arm1,arm2,angle1,angle2');
const e345=make([{holes:5,angleDeg:0},{holes:5,angleDeg:ARM_345_DEG}]).comp;
check('3-4-5 角的欄位留空並顯示提示字',ARMS.rows(e345)[2][3]===359&&ARMS.rows(e345)[2][4]==='約127（3-4-5）'&&ARMS.rows(two)[2][4]==='特殊角度');
// 編輯面板欄位走 resizeStandardBlank（孔數、夾角、拒絕訊息）
const params=Object.fromEntries(Object.entries(make(panelArms(d2)).params));
let r=resizeStandardBlank(two,params,'angle1',135);check('夾角 90→135 可改',r.ok&&r.comp.standardBlank.arms[1].angleDeg===135,r.message);
r=resizeStandardBlank(two,params,'angle1',ARM_345_DEG);check('夾角改成 3-4-5 存精確值',r.ok&&r.comp.standardBlank.arms[1].angleDeg===ARM_345_DEG);
r=resizeStandardBlank(two,params,'angle1',180);check('夾角 180° 被拒絕且訊息是中文',!r.ok&&/[一-鿿]/.test(r.message)&&/直桿/.test(r.message),r.message);
r=resizeStandardBlank(two,params,'arm1',9);check('第2臂孔數 3→9',r.ok&&r.comp.standardBlank.arms[1].holes===9);
r=resizeStandardBlank(two,params,'arm2',3);check('兩臂件沒有第3臂：拒絕',!r.ok&&/第3支臂/.test(r.message));
r=resizeStandardBlank(two,params,'g',20);check('臂長不是 8 的倍數：拒絕並指到孔數',!r.ok&&/孔數/.test(r.message));
// 把手轉向：翻面後仍能判斷夾角往哪個方向增加
const pts={};const at=p=>p;
const flip=resizeStandardBlank(two,params,'angle1',270);
const sideA=armSide(two,at),sideB=armSide({...two,p3:{...two.p3,y:-two.p3.y}},at);
check('armSide：一般為 +1、p3 鏡射後為 -1',sideA===1&&sideB===-1);
// 接線：選單、標準積木面板轉接、啟動接線不手寫按鈕
const cmds=readFileSync(new URL('../js/blocks/ui-commands.js',import.meta.url),'utf8');
check('選單有「彎桿／多臂件」並走 openStandardBlank',/\['arms','彎桿／多臂件'[^\]]*'openStandardBlank','arms'\]/.test(cmds));
const html=readFileSync(new URL('../blocks.html',import.meta.url),'utf8');
check('blocks.html 沒有手寫彎桿按鈕',!html.includes('彎桿／多臂件'));
const ui=readFileSync(new URL('../js/blocks/standard-blank-ui.js',import.meta.url),'utf8');
check("openStandardBlank('arms') 先載入 arm-blank-ui.js",/kind==='arms'\)return import\('\.\/arm-blank-ui\.js'\)/.test(ui));
const panel=readFileSync(new URL('../js/blocks/arm-blank-ui.js',import.meta.url),'utf8');
check('建立面板載入 arm-blank.js（經 arm-presets.js）並用 makeStandardBlank 預覽',/arm-presets\.js/.test(panel)&&/makeStandardBlank/.test(panel));
report();
