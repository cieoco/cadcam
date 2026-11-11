// Pack O3-A (docs/SDD-OPERATION-PIPELINE.md): a drag that cannot do anything explains why — once per gesture, only after the pointer
// really moved past the drag threshold; a plain click only selects; a drag that works says nothing.
// Fake-DOM approach of test/input-gestures.mjs (no real touch hardware).
import {readFileSync} from 'node:fs';
import {check,report} from './_harness.mjs';
import * as Model from '../js/blocks/model.js';
import {S} from '../js/blocks/state.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {readStoredProject} from '../js/blocks/project-envelope.js';
import {makeStandardBlank} from '../js/blocks/standard-blank.js';
import {loadIntegrity} from '../js/blocks/integrity-gate.js';
import * as MR from '../js/blocks/motor-release.js';
import {localHoles} from '../js/core/local-holes.js';
await loadIntegrity();

import {gesture,load,bodyDown,nodeDown,setDrive,emit,flush,settle,resetMsgs,msgs,noop} from './_drag-rig.mjs';
const FIX=new URL('./fixtures/',import.meta.url);
const fixture=n=>normalizeSnapshot(readStoredProject(JSON.parse(readFileSync(new URL(n,FIX),'utf8'))));
const blocked=fixture('delete-blocked.json');
const w0=structuredClone(blocked);
// ---------------------------------------------------------------- body drag of a connected part
load(w0);
let r=await gesture(bodyDown('Blank136'),[]);
check('A1 點已接零件的桿身只選取、不說話',r.length===0);
r=await gesture(bodyDown('Blank136'),[[103,100]]);
check('A2 移動沒超過門檻（滑鼠 6px）不說話',r.length===0);
r=await gesture(bodyDown('Blank136'),[[110,100],[130,110],[160,120],[200,130]]);
check('A3 已接零件沒有動力：超過門檻後說明一次',r.length===1&&/已接上其他零件，不能單獨搬移/.test(r[0])&&/裝上馬達/.test(r[0]));
check('A3b 說明不含內部代號',!/Blank\d|P\d+s|_H\d/.test(r[0]));
const before=JSON.stringify(S.comps);
r=await gesture(bodyDown('Blank136'),[[110,100]],'touch');
check('A4 觸控門檻 12px：移動 10px 不說話',r.length===0);
r=await gesture(bodyDown('Blank136'),[[114,100],[140,100]],'touch');
check('A5 觸控超過門檻後說明',r.length===1);
check('A6 說明期間作品完全不變',JSON.stringify(S.comps)===before);
setDrive('ready');r=await gesture(bodyDown('Blank136'),[[120,100],[150,100]]);
check('A7 有動力但這個零件不會跟著轉：另一句說明',r.length===1&&/不會隨馬達轉動/.test(r[0])&&!/裝上馬達後/.test(r[0]));
setDrive('loading');r=await gesture(bodyDown('Blank136'),[[120,100],[150,100]]);
check('A8 試動模組還在載入時不說（避免誤報）',r.length===0);
setDrive('none');
// plate and L / arms share the same path
r=await gesture(bodyDown('Blank133'),[[120,100],[150,100]]);
check('A9 已接的板件同樣說明',r.length===1&&/已接上其他零件/.test(r[0]));
// ---------------------------------------------------------------- free part: the drag works, nothing is said
const free=makeStandardBlank({kind:'bar',n:1});
load({comps:[free.comp],params:{theta:0,...free.params},modules:[]});
const x0=S.comps[0].p1.x;
r=await gesture(bodyDown(free.comp.id),[[110,100],[140,100]]);
check('A10 自由桿拖得動：不說話',r.length===0&&S.comps[0].p1.x!==x0);
// ---------------------------------------------------------------- a hole of a connected bar
load(w0);
const bar=S.comps.find(c=>c.id==='Blank136'),hole=localHoles(bar).find(Boolean);
check('A11 夾具：桿上有孔',!!hole&&!Model.isFreeBody(S.comps,bar,[]));
const holeBefore=JSON.stringify(S.comps);
r=await gesture(nodeDown(hole.id),[[110,100],[130,110],[160,120]]);
check('A12 拖已接桿件的孔：說明一次，作品不變',r.length===1&&/這個孔屬於已接上其他零件/.test(r[0])&&JSON.stringify(S.comps)===holeBefore);
r=await gesture(nodeDown(hole.id),[]);
check('A13 只點孔：不說話，仍選取該孔',r.length===0&&S.selectedNodeId===hole.id);
// ---------------------------------------------------------------- a fully determined triangle vertex
const tri={id:'T',type:'triangle',p1:{id:'a',type:'fixed',x:0,y:0},p2:{id:'b',type:'fixed',x:80,y:0},p3:{id:'c',type:'floating',x:40,y:60},gParam:'g',r1Param:'r1',r2Param:'r2'};
load({comps:[tri],params:{g:80,r1:72.1,r2:72.1,theta:0},modules:[]});
check('A14 夾具：頂點被鎖住',Model.lockedTriangleVertex(S.comps,'c'));
const triBefore=JSON.stringify(S.comps);
r=await gesture(nodeDown('c'),[[110,100],[140,100],[170,100]]);
check('A15 被鎖住的頂點：說明一次，位置不變',r.length===1&&/這個頂點已被相接的零件鎖住/.test(r[0])&&JSON.stringify(S.comps)===triBefore);
// ---------------------------------------------------------------- a motor hosted on a plate
const rep=(()=>{const back=MR.planMotorReturn(blocked,MR.offPlateMotors(blocked.comps)[0].id);return {...blocked,comps:back.comps,params:back.params};})();
const rel=(()=>{const x=MR.planMotorRelease({comps:rep.comps,params:rep.params,fabrication:rep.fabrication,modules:rep.modules},'Blank135',{},{});return {...rep,comps:x.comps,params:x.params};})();
load(rel);
const motor=S.comps.find(c=>c.type==='motor');
check('A16 夾具：馬達裝在座板上',!!motor?.motorMount?.frameBody&&!Model.isFreeBody(S.comps,motor,[]));
const mBefore=JSON.stringify(S.comps);
r=await gesture(nodeDown(motor.p1.id),[[110,100],[140,100]]);
check('A17 座板上的馬達：說明去哪裡換孔，位置不變',r.length===1&&/馬達固定在座板上/.test(r[0])&&/安裝設定/.test(r[0])&&JSON.stringify(S.comps)===mBefore);
r=await gesture(nodeDown(motor.p1.id),[]);
check('A18 只點馬達：不說話',r.length===0);
// pinch (second finger) cancels a pending explanation
resetMsgs();emit('pointerdown',1,100,100,bodyDown('Blank136'),'touch');emit('pointerdown',2,200,100,noop,'touch');emit('pointermove',1,160,100,noop,'touch');flush();await settle();
check('A19 第二指落下（縮放）不說話',msgs.length===0);
emit('pointerup',1,160,100);emit('pointerup',2,200,100);
report('drag-feedback');
