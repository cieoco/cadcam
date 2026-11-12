// 舵機放到矩形板材上要像 TT 馬達一樣由板件承載（共用板孔、產生安裝孔槽），
// 不是另外自帶一個固定點。素材是使用者分享的作品（預設 8×4 出線缺口）。
import {readFileSync} from 'node:fs';
import {check,report} from './_harness.mjs';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {toLegacy} from '../js/blocks/motor-part.js';
import {planMotorDrop} from '../js/blocks/motor-drop.js';
import {planActuatorPlateHoles} from '../js/blocks/actuator-plate-holes.js';

const raw=JSON.parse(readFileSync(new URL('./fixtures/servo-on-plate.json',import.meta.url))).project;
const w=normalizeSnapshot(toLegacy(raw)),m=w.comps.find(c=>c.type==='motor');
const pts=Object.fromEntries(w.comps.flatMap(c=>['p1','p2','p3'].filter(k=>c[k]).map(k=>[c[k].id,{x:c[k].x,y:c[k].y}])));
const src={comps:w.comps,params:w.params,modules:[],fabrication:w.fabrication};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const req=(type,extra={})=>({...m.motorMount,type,existingId:m.id,position:{x:m.p1.x,y:m.p1.y},start:0,end:90,...extra});

check('素材：舵機原本自帶固定點、不在板上',m.motorType==='mg995'&&!m.motorMount.frameBody&&m.p1.id==='Motor90.A');
check('素材：作品帶預設 8×4 缺口',w.fabrication.mg995Mount.cableNotchWidthMm===8&&w.fabrication.mg995Mount.cableNotchDepthMm===4);

const r=planMotorDrop(src,req('mg995'),pts,{thetaDeg:0});
check('舵機放到板上：成功',r.matched&&r.ok,r.message);
const plate=r.ok&&r.comps.find(c=>c.id==='Blank88'),servo=r.ok&&r.comps.find(c=>c.type==='motor');
check('舵機軸心共用板孔',!!servo&&servo.p1.id===r.center&&/^Blank88_H/.test(r.center));
check('舵機外殼由板件承載',servo?.motorMount?.frameBody==='Blank88'&&plate?.motorMountPoint===r.center);
check('板上被孔槽占用的格孔已停用',(plate?.standardBlank?.mountHoles?.length||0)>4);
check('結果帶回縮小後的缺口 6×2',r.fabrication?.mg995Mount.cableNotchWidthMm===6&&r.fabrication?.mg995Mount.cableNotchDepthMm===2);
check('有說明缺口改了什麼',/8×4.*6×2/.test(r.fabricationNote||''),r.fabricationNote);
check('原作品的加工設定沒有被改動',src.fabrication.mg995Mount.cableNotchWidthMm===8);
check('新設定下整份作品通過孔槽核對',r.ok&&planActuatorPlateHoles({...src,comps:r.comps,params:r.params,fabrication:r.fabrication}).ok);

// 已是可用缺口：不再改設定、不出說明
const safe={...src,fabrication:{...w.fabrication,mg995Mount:{...w.fabrication.mg995Mount,cableNotchWidthMm:5,cableNotchDepthMm:2}}};
const r2=planMotorDrop(safe,req('mg995'),pts,{thetaDeg:0});
check('缺口本來就夠小：照原設定安裝',r2.ok&&same(r2.fabrication,safe.fabrication)&&!r2.fabricationNote,r2.message);

// 縮缺口也救不了（直放超出板面）：照原訊息拒絕，不改設定
const r3=planMotorDrop(src,req('mg995',{orientation:'vertical'}),pts,{thetaDeg:0});
check('板放不下時仍拒絕並說明',r3.matched&&!r3.ok&&/座板無法容納/.test(r3.message||''),r3.message);

// TT 馬達不受影響
const r4=planMotorDrop(src,req('tt'),pts,{thetaDeg:0});
check('TT 馬達照舊安裝、不動加工設定',r4.ok&&same(r4.fabrication,src.fabrication)&&!r4.fabricationNote,r4.message);
report();
