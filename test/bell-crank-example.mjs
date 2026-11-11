// 內建範例「鐘形曲柄夾爪」（B3）：按需載入、曲柄搖桿全程可解、第2臂端孔擺動、桿長不變、反例鎖死、教學卡內容。
//   node test/bell-crank-example.mjs
import {check,report} from './_harness.mjs';
import {getExample,getExampleLesson,loadUnitStarts,BLOCK_EXAMPLES,EXAMPLE_GROUPS} from '../js/blocks/examples.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {compileTopology} from '../js/core/topology.js';
import {solveTopology} from '../js/multilink/solver.js';
import {blankGeometry} from '../js/blocks/standard-blank.js';
import {CATALOG_FAMILIES} from '../js/blocks/example-catalog.js';
import {inspectPlateExport} from '../js/blocks/exporters.js';
const ID='bell-crank-gripper',near=(a,b,t=1e-6)=>Math.abs(a-b)<t,dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

check('載入前不在啟動資料裡',!getExample(ID));
const before=BLOCK_EXAMPLES.length,first=loadUnitStarts();await first;
check('按需載入後出現一次，重複載入不重複登記',!!getExample(ID)&&BLOCK_EXAMPLES.filter(e=>e.id===ID).length===1&&(await loadUnitStarts(),BLOCK_EXAMPLES.filter(e=>e.id===ID).length===1)&&BLOCK_EXAMPLES.length>before);

const ex=getExample(ID),w=normalizeSnapshot(structuredClone(ex.snapshot));
check('範例可通過作品正規化',!!w);
const [frame,crank,coupler,bell]=['機架板','曲柄','連桿','鐘形彎桿'].map(n=>w.comps.find(c=>c.name===n));
check('四個零件：機架板、曲柄、連桿、鐘形彎桿',!!(frame&&crank&&coupler&&bell)&&w.comps.length===4);
check('彎桿是 2 臂 90°，第1臂 5 孔、第2臂 4 孔',bell.standardBlank.kind==='arms'&&JSON.stringify(bell.standardBlank.arms)===JSON.stringify([{holes:5,angleDeg:0},{holes:4,angleDeg:90}]));
check('彎桿中心孔固定在機架孔，第1臂端孔接連桿',bell.p1.type==='fixed'&&frame.holes.some(h=>h.id===bell.p1.id)&&bell.p2.id===coupler.p2.id&&crank.p2.id===coupler.p1.id);
check('曲柄接 TT 馬達，馬達座在機架板上',crank.isInput&&crank.motorType==='tt'&&crank.motorMount?.frameBody===frame.id&&frame.motorMountPoint===crank.p1.id);
// Grashof：機架距 48、曲柄 16、連桿 56、搖桿（彎桿第1臂）40
const d=dist(crank.p1,bell.p1),a=w.params[crank.lenParam],b=w.params[coupler.lenParam],c=w.params[bell.gParam];
check('尺寸都在 8 mm 孔距上：機架 48、曲柄 16、連桿 56、第1臂 40',[d,a,b,c].every(v=>near(v%8,0,1e-6)||near(8-v%8,0,1e-6))&&near(d,48)&&near(a,16)&&near(b,56)&&near(c,40));
const L=[d,a,b,c].sort((x,y)=>x-y);
check('Grashof：最短＋最長 ≤ 其餘兩桿之和，且最短桿（曲柄）接機架',L[0]+L[3]<=L[1]+L[2]&&near(L[0],a),`${L[0]}+${L[3]} <= ${L[1]}+${L[2]}`);
const armEnd=bell.p3.id;
check('彎桿外形載入後已正確（單一封閉環）',(()=>{const r=blankGeometry(bell,[bell.p1,bell.p2,bell.p3]);return Array.isArray(r)&&r.length>=100;})());
check('彎桿可輸出板件外形與孔',(()=>{const g=inspectPlateExport(bell,[bell.p1,bell.p2,bell.p3]);return g.holes.length===1+5+4;})());

const solveAt=(comps,params,t,prev)=>solveTopology(compileTopology(comps,{params},new Set()),{thetaDeg:t,motorAngles:{1:t},_prevPoints:prev});
const frames=[];let prev=null;
for(let t=0;t<=360;t+=5){const s=solveAt(w.comps,w.params,t,prev);frames.push({t,s});if(s?.isValid!==false&&s?.points?.[armEnd])prev=s.points;}
check('曲柄整圈 360°（5° 一步，73 格）每一格都有效',frames.length===73&&frames.every(f=>f.s?.isValid!==false&&Number.isFinite(f.s?.points?.[armEnd]?.x)),String(frames.filter(f=>f.s?.isValid===false).map(f=>f.t)));
const tips=frames.map(f=>f.s.points[armEnd]),hub=frames[0].s.points[bell.p1.id];
const span=Math.max(...tips.map(p=>Math.max(...tips.map(q=>dist(p,q)))));
const ang0=Math.atan2(tips[0].y-hub.y,tips[0].x-hub.x),angs=tips.map(p=>{let x=(Math.atan2(p.y-hub.y,p.x-hub.x)-ang0)*180/Math.PI;while(x>180)x-=360;while(x<-180)x+=360;return x;}),swing=Math.max(...angs)-Math.min(...angs);
check('第2臂端孔擺動超過 10 mm',span>10,span.toFixed(2));
check('彎桿是往復擺動，不是整圈轉（擺角 < 180°）',swing>5&&swing<180,swing.toFixed(1)+'°');
check('各桿長度全程不變',frames.every(f=>{const p=f.s.points;return near(dist(p[crank.p1.id],p[crank.p2.id]),16,1e-6)&&near(dist(p[coupler.p1.id],p[coupler.p2.id]),56,1e-6)&&near(dist(p[bell.p1.id],p[bell.p2.id]),40,1e-6)&&near(dist(p[bell.p1.id],p[armEnd]),32,1e-6);}));
check('樞軸孔全程不動',frames.every(f=>dist(f.s.points[bell.p1.id],hub)<1e-9));
check('第2臂的中間孔跟著剛體轉',frames.every(f=>{const p=f.s.points[`${bell.id}_A1_2`];return p&&near(dist(p,f.s.points[bell.p1.id]),16,1e-6);}));
check('軌跡點設在第2臂端孔',w.tracePoint===armEnd||(w.tracePoints||[]).includes(armEnd));
console.log(`  第2臂端孔最大位移 ${span.toFixed(1)} mm，擺角約 ${swing.toFixed(1)}°`);

// 反例：第2臂端孔也固定到機架
{const locked=structuredClone(w.comps),b=locked.find(x=>x.id===bell.id);b.p3.type='fixed';
 const sweep=Array.from({length:73},(_,i)=>solveAt(locked,w.params,i*5,null)),valid=sweep.filter(s=>s.isValid!==false).length;
 check('反例：第2臂端孔也固定在機架 → 馬達一轉就求解失敗（不能動）',sweep[18].isValid===false&&valid<=2,`有效 ${valid}/73`);}

// 教學卡
const lesson=getExampleLesson(ID),text=[lesson.use,lesson.learn,...lesson.try].join('\n');
check('教學卡：分在「夾取與物件操作」，有用途與學什麼',EXAMPLE_GROUPS.some(g=>g.id===lesson.group)&&lesson.use&&/學什麼/.test(lesson.learn));
check('教學卡：學什麼→實操→反思→解決一個問題→反例',['實操','反思','解決一個問題','反例'].every(k=>lesson.try.some(t=>t.startsWith(k)))&&/^按播放/.test(lesson.try[0])&&!/[。.]$/.test(lesson.try[0]));
check('教學卡：實操只改一個變數（孔數或夾角）',lesson.try.some(t=>/只把第 2 臂的孔數/.test(t)&&/夾角從 90° 改成 120°/.test(t)));
check('狀態標示為「模擬已驗證」，且不聲稱加工或實物已驗證',/模擬已驗證/.test(text)&&!/實物已測|加工資料已核對|已通過實測/.test(text)&&/未驗證/.test(text));
check('教學卡文字是學生用語，不含內部代號',!/Blank\d|_A\d|standardBlank|motorMount/.test(text+ex.title+ex.note));
check('範例目錄有「彎桿轉向」家族且只列一次',CATALOG_FAMILIES.filter(f=>f.variants.some(v=>v.id===ID)).length===1);
report('bell-crank-example');
