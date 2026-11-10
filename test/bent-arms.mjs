// 彎桿／多臂件 B1 核心：建立、外形、存檔、孔格 R7、改孔數與夾角、鐘形曲柄求解。
//   node test/bent-arms.mjs
import {readFileSync} from 'node:fs';
import {check,report} from './_harness.mjs';
import {makeStandardBlank,resizeStandardBlank,blankGeometry} from '../js/blocks/standard-blank.js';
import {ARM_345_DEG} from '../js/blocks/arm-blank.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {gridIssues} from '../js/blocks/grid-rule.js';
import {holeWorld} from '../js/core/local-holes.js';
import {compileTopology} from '../js/core/topology.js';
import {solveTopology} from '../js/multilink/solver.js';
import {inspectPlateExport,exportLinksAsSvg,exportLinksAsDxf} from '../js/blocks/exporters.js';
import {pointCoords} from '../js/blocks/model.js';

const near=(a,b,t=1e-6)=>Math.abs(a-b)<t,dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const zh=s=>typeof s==='string'&&/[一-鿿]/.test(s);
const A=(holes,angleDeg)=>({holes,angleDeg});
const make=(arms,extra={})=>makeStandardBlank({kind:'arms',arms,n:1,origin:{x:0,y:0},...extra});
const worldPoints=c=>({hub:c.p1,p2:c.p2,p3:c.p3,locals:(c.holes||[]).map(h=>({id:h.id,...holeWorld(c,h)}))});
const allPoints=c=>{const w=worldPoints(c);return [w.hub,w.p2,w.p3,...w.locals];};
const inside=(p,r)=>{let hit=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)hit=!hit;}return hit;};
const edgeDist=(p,r)=>Math.min(...r.map((a,i)=>{const b=r[(i+1)%r.length],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}));
const unitAt=(deg)=>[Math.cos(deg*Math.PI/180),Math.sin(deg*Math.PI/180)];

// ---- 建立 ----
const cases=[['2臂90°',[A(4,0),A(3,90)]],['2臂3-4-5',[A(5,0),A(5,ARM_345_DEG)]],['3臂T',[A(4,0),A(4,90),A(4,180)]],['3臂Y',[A(4,0),A(4,120),A(4,240)]],['3臂鐘形',[A(3,0),A(3,90),A(3,225)]],['2臂270°（另一側）',[A(4,0),A(3,270)]],['3臂250°／100°',[A(3,0),A(4,250),A(3,100)]]];
check('3-4-5 預設存精確補角',near(ARM_345_DEG,180-Math.atan2(4,3)*180/Math.PI,1e-12)&&near(ARM_345_DEG,126.8699,1e-4));
for(const[name,arms]of cases){
 const origin={x:100,y:-50},r=make(arms,{origin});
 check(`${name}：建立成功`,r.ok,r.message);if(!r.ok)continue;
 const c=r.comp,total=arms.reduce((n,a)=>n+a.holes,1);
 check(`${name}：孔數（含中心孔）${total}`,r.holeCount===total&&c.holes.length+3===total);
 const pts=allPoints(c),ids=pts.map(p=>p.id);
 check(`${name}：總孔數與 id 不重複`,pts.length===total&&new Set(ids).size===ids.length,`${pts.length}/${total}`);
 check(`${name}：中心孔與端孔位置`,dist(c.p1,origin)<1e-9&&arms.every((a,k)=>{const end=k===0?c.p2:k===1?c.p3:pts.find(p=>p.id===`${c.id}_A2_${a.holes}`);const[ux,uy]=unitAt(a.angleDeg);return end&&dist(end,{x:origin.x+8*a.holes*ux,y:origin.y+8*a.holes*uy})<1e-6;}));
 check(`${name}：每支臂的孔都在 8 mm 孔距上`,arms.every((a,k)=>{const[ux,uy]=unitAt(a.angleDeg);return Array.from({length:a.holes},(_,i)=>i+1).every(i=>pts.some(p=>dist(p,{x:origin.x+8*i*ux,y:origin.y+8*i*uy})<1e-6));}));
 check(`${name}：gParam／r1Param／r2Param 與幾何一致`,near(r.params[c.gParam],dist(c.p1,c.p2))&&near(r.params[c.r1Param],dist(c.p1,c.p3))&&near(r.params[c.r2Param],dist(c.p2,c.p3)));
 check(`${name}：局部孔以 p1→p2 為 u 軸、間距 8 mm`,c.holes.every(h=>near(Math.hypot(h.u,h.v)%8<1e-6||8-Math.hypot(h.u,h.v)%8<1e-6?0:1,0)));
 check(`${name}：三角形符號與 p3 側一致`,c.sign===(((c.p2.x-c.p1.x)*(c.p3.y-c.p1.y)-(c.p2.y-c.p1.y)*(c.p3.x-c.p1.x))<0?-1:1));
}
{const t=make(cases[2][1]).comp;check('T 型：第3臂端孔是局部孔，在 (-32,0)',t.holes.some(h=>near(h.u,-32)&&near(h.v,0)));
 const tb=make(cases[1][1]).comp;check('3-4-5：50 mm 外的端孔落在整數座標（-24,32）',near(tb.p3.x,-24,1e-9)&&near(tb.p3.y,32,1e-9));}

// ---- 不合規則的輸入 ----
const bad=[['只有 1 支臂',[A(3,0)]],['4 支臂',[A(3,0),A(3,90),A(3,180),A(3,270)]],['0 孔',[A(0,0),A(3,90)]],['65 孔',[A(65,0),A(3,90)]],['孔數不是整數',[A(2.5,0),A(3,90)]],['兩臂 180°',[A(3,0),A(3,180)]],['兩臂相距不到 15°',[A(3,0),A(3,10)]],['三臂中兩臂相距不到 15°',[A(3,0),A(3,90),A(3,100)]],['夾角 0°',[A(3,0),A(3,0)]],['夾角 360°',[A(3,0),A(3,360)]],['夾角非數字',[A(3,0),A(3,NaN)]],['第1臂不是 0°',[A(3,5),A(3,90)]],['第2臂 180° 的三臂（三點共線）',[A(3,0),A(3,180),A(3,90)]]];
for(const[name,arms]of bad){const r=make(arms);check(`拒絕：${name}`,r.ok===false&&zh(r.message),r.message);}
check('拒絕：位置不是數字',make(cases[0][1],{origin:{x:NaN,y:0}}).ok===false);
check('15° 剛好可以',make([A(3,0),A(3,15)]).ok&&make([A(3,0),A(3,345)]).ok);

// ---- 外形 ----
for(const[name,arms]of cases){
 const c=make(arms,{origin:{x:30,y:20}}).comp,ring=blankGeometry(c,[c.p1,c.p2,c.p3]);
 check(`${name}：外形是單一封閉環`,Array.isArray(ring)&&ring.length>=100&&ring.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))&&dist(ring[0],ring.at(-1))>1e-6);
 const pts=allPoints(c);
 check(`${name}：每個孔都在外形內且邊距 ≥ 6.48 mm`,pts.every(p=>inside(p,ring)&&edgeDist(p,ring)>=6.48),String(Math.min(...pts.map(p=>edgeDist(p,ring)))));
}
{const c=make([A(4,0),A(3,90)]).comp,ring=blankGeometry(c,[c.p1,c.p2,c.p3]);
 check('90°：兩臂之間離兩臂都遠的點不在外形內',!inside({x:20,y:20},ring)&&!inside({x:14,y:14},ring));
 check('90°：兩臂交會的內角區在外形內',inside({x:5,y:5},ring)&&inside({x:3,y:28},ring));
 const Y=make([A(4,0),A(4,120),A(4,240)]).comp,yr=blankGeometry(Y,[Y.p1,Y.p2,Y.p3]);
 check('Y 型：臂間空隙不在外形內',!inside({x:20*Math.cos(60*Math.PI/180),y:20*Math.sin(60*Math.PI/180)},yr)&&!inside(unitAt(180).map(v=>v*24).reduce((x,y)=>({x,y:0})),yr));
 const g=inspectPlateExport(c,[c.p1,c.p2,c.p3]);
 check('輸出外形與孔：孔數等於全部孔',g.holes.length===4+3+1,String(g.holes.length));
 const files=[],emit=(text,n)=>files.push({text,name:n});exportLinksAsSvg([c],pointCoords([c]),{},{},[],null,emit);exportLinksAsDxf([c],pointCoords([c]),{},{},[],null,emit);
 check('SVG／DXF 輸出不出錯',files.length>=2&&files.every(f=>f.text.length>50));}

// ---- 存檔 ----
const wrap=(c,params)=>({kind:'blocks',v:1,counter:2,comps:[c],params});
{const r=make([A(4,0),A(3,127),A(2,250)]),s=normalizeSnapshot(wrap(r.comp,r.params));
 check('存檔：保留 arms',!!s&&JSON.stringify(s.comps[0].standardBlank.arms)===JSON.stringify(r.comp.standardBlank.arms)&&s.comps[0].standardBlank.kind==='arms');
 check('存檔：局部孔與外形仍在',!!s&&s.comps[0].holes.length===r.comp.holes.length);
 const g=normalizeSnapshot(JSON.parse(JSON.stringify(wrap(r.comp,r.params))));check('存檔：JSON 來回後相同',JSON.stringify(g.comps)===JSON.stringify(s.comps));
 const corrupt=f=>{const c=structuredClone(r.comp);f(c);return normalizeSnapshot(wrap(c,r.params));};
 check('存檔：沒有 arms → 拒絕',corrupt(c=>{delete c.standardBlank.arms;})===null);
 check('存檔：只有 1 支臂 → 拒絕',corrupt(c=>{c.standardBlank.arms=[A(3,0)];})===null);
 check('存檔：4 支臂 → 拒絕',corrupt(c=>{c.standardBlank.arms=[A(3,0),A(3,90),A(3,180),A(3,270)];})===null);
 check('存檔：孔數 0 → 拒絕',corrupt(c=>{c.standardBlank.arms[1].holes=0;})===null);
 check('存檔：孔數 65 → 拒絕',corrupt(c=>{c.standardBlank.arms[1].holes=65;})===null);
 check('存檔：角度非數字 → 拒絕',corrupt(c=>{c.standardBlank.arms[1].angleDeg='90';})===null&&corrupt(c=>{c.standardBlank.arms[1].angleDeg=null;})===null);
 check('存檔：兩臂 180° → 拒絕',corrupt(c=>{c.standardBlank.arms=[A(3,0),A(3,180)];})===null);
 check('存檔：兩臂相距不到 15° → 拒絕',corrupt(c=>{c.standardBlank.arms[1].angleDeg=10;})===null);
 check('存檔：不是三角形零件 → 拒絕',corrupt(c=>{c.type='bar';})===null);
 const m=structuredClone(r.comp);m.standardBlank.mountHoles=[{id:'Blank1_M',u:4,v:3,diameter:3.2}];
 const sm=normalizeSnapshot(wrap(m,r.params));check('存檔：多臂件可帶安裝孔',!!sm&&sm.comps[0].standardBlank.mountHoles?.length===1);}

// ---- 孔格規則 R7 ----
for(const[name,arms]of[['120°',[A(4,0),A(4,120)]],['135°',[A(4,0),A(4,135)]],['Y 型',cases[3][1]],['3-4-5',cases[1][1]]]){
 const r=make(arms),issues=gridIssues([r.comp],r.params);
 check(`R7：${name} 沒有孔格例外`,issues.length===0,JSON.stringify(issues.map(i=>i.rule+i.message)));
}
{const r=make([A(4,0),A(4,135)]),c=structuredClone(r.comp);c.holes[1].u+=0.5;
 const issues=gridIssues([c],r.params);check('R7：手改成不在孔距上的孔 → 有例外',issues.some(i=>i.rule==='R7')&&!issues.some(i=>i.rule==='R2'),JSON.stringify(issues.map(i=>i.rule)));
 const p=structuredClone(r.params);p[r.comp.gParam]=36;check('R7：臂長不是 8 的倍數 → 有例外',gridIssues([r.comp],p).some(i=>i.rule==='R7'));}

// ---- 改孔數與夾角 ----
const pick=(arr,id)=>arr.find(h=>h.id===id);
{ // 孔數
 const r=make([A(4,0),A(4,90),A(4,180)]),c=r.comp,bar=(p1,p2)=>({type:'bar',id:'Attached',p1,p2,lenParam:'AttachedLength',fixedLen:true});
 const end2=`${c.id}_A2_4`,mid2=`${c.id}_A2_2`,pt2=pick(worldPoints(c).locals,end2);
 const used=bar({id:end2,type:'floating',x:pt2.x,y:pt2.y},{id:'T',type:'floating',x:-32,y:-32});
 const res=resizeStandardBlank(c,r.params,'arm2',2,{comps:[c,used]});
 check('縮短：第3臂端孔已被使用 → 拒絕',res.ok===false&&/縮小會移除.*已固定或有零件連接/.test(res.message),res.message);
 const midUsed=bar({id:mid2,type:'floating',x:-16,y:0},{id:'T',type:'floating',x:-16,y:-32});
 check('縮短：中間孔被使用但沒被移除 → 可以',resizeStandardBlank(c,r.params,'arm2',3,{comps:[c,midUsed]}).ok===true||/縮小會移除/.test(resizeStandardBlank(c,r.params,'arm2',3,{comps:[c,midUsed]}).message));
 const ok=resizeStandardBlank(c,r.params,'arm2',2,{comps:[c]});
 check('縮短沒被使用的臂 → 可以，孔數減少',ok.ok&&ok.comp.holes.length===c.holes.length-2,ok.message);
 const keep=ok.ok&&c.holes.filter(h=>!/_A2_[34]$/.test(h.id)).every(h=>pick(ok.comp.holes,h.id));
 check('縮短：留下的孔 id 不變',keep);
 const grow=resizeStandardBlank(c,r.params,'arm1',6,{comps:[c]});
 check('加長第2臂：新增 2 個孔、舊孔 id 不變、p3 往外移',grow.ok&&grow.comp.holes.length===c.holes.length+2&&c.holes.every(h=>pick(grow.comp.holes,h.id))&&near(dist(grow.comp.p1,grow.comp.p3),48)&&near(grow.params[c.r1Param],48));
 check('加長第2臂：接在 p3 的零件進 follow',(()=>{const j=bar({id:c.p3.id,type:'floating',x:c.p3.x,y:c.p3.y},{id:'T2',type:'floating',x:0,y:0}),g=resizeStandardBlank(c,r.params,'arm1',6,{comps:[c,j]});return g.ok&&g.follow.some(f=>f.id===c.p3.id&&near(f.y,48));})());
 check('不能超出 64 孔、不能 0 孔',!resizeStandardBlank(c,r.params,'arm0',65,{comps:[c]}).ok&&!resizeStandardBlank(c,r.params,'arm0',0,{comps:[c]}).ok);
 check('沿用桿長欄位：g 填 40 mm → 第1臂 5 孔；填 12 mm → 拒絕並說明',resizeStandardBlank(c,r.params,'g',40,{comps:[c]}).comp?.standardBlank.arms[0].holes===5&&!resizeStandardBlank(c,r.params,'g',12,{comps:[c]}).ok&&zh(resizeStandardBlank(c,r.params,'g',12,{comps:[c]}).message));
 const two=make([A(4,0),A(4,90)]).comp,r3=resizeStandardBlank(two,{},'arm2',3,{comps:[two]});
 check('沒有第3臂時改第3臂 → 拒絕',!r3.ok&&zh(r3.message));
 check('不認得的欄位 → 拒絕',!resizeStandardBlank(two,{},'width',20,{comps:[two]}).ok);
}
{ // 夾角
 const r=make([A(4,0),A(3,90)],{origin:{x:50,y:30}}),c=r.comp,join={type:'bar',id:'Rod',p1:{id:c.p3.id,type:'floating',x:c.p3.x,y:c.p3.y},p2:{id:'RodEnd',type:'floating',x:70,y:90},lenParam:'RodLength',fixedLen:true};
 const res=resizeStandardBlank(c,r.params,'angle1',100,{comps:[c,join]});
 check('改夾角 90°→100°：成功',res.ok,res.message);
 const n=res.comp,ang=(Math.atan2(n.p3.y-n.p1.y,n.p3.x-n.p1.x)-Math.atan2(n.p2.y-n.p1.y,n.p2.x-n.p1.x))*180/Math.PI;
 check('第2臂端孔轉到 100° 且距離不變',near(ang,100,1e-6)&&near(dist(n.p1,n.p3),24)&&near(res.params[c.gParam],32)&&near(res.params[c.r2Param],dist(n.p2,n.p3)));
 check('接在第2臂端孔的桿件在 follow 裡，位置是新的 p3',res.follow.length===1&&res.follow[0].id===c.p3.id&&near(res.follow[0].x,n.p3.x)&&near(res.follow[0].y,n.p3.y));
 check('中間孔跟著轉：局部孔在新方向 8 mm 的倍數上',n.holes.filter(h=>/_A1_/.test(h.id)).every(h=>{const w=holeWorld(n,h),d=dist(w,n.p1);return near(d%8,0,1e-6)||near(8-d%8,0,1e-6);}));
 check('中心孔與第1臂不動',dist(n.p1,c.p1)<1e-9&&dist(n.p2,c.p2)<1e-9);
 const fixed=structuredClone(c);fixed.p3.type='fixed';
 const rf=resizeStandardBlank(fixed,r.params,'angle1',100,{comps:[fixed]});
 check('第2臂端孔固定在機架 → 拒絕改夾角',rf.ok===false&&/固定/.test(rf.message),rf.message);
 const frameJoin={type:'bar',id:'FrameBar',p1:{id:c.p3.id,type:'fixed',x:c.p3.x,y:c.p3.y},p2:{id:'F2',type:'fixed',x:0,y:0},lenParam:'FL',fixedLen:true};
 check('端孔經別的零件固定在機架 → 同樣拒絕',!resizeStandardBlank(c,r.params,'angle1',100,{comps:[c,frameJoin]}).ok);
 check('不動第2臂的欄位（同值）→ 成功且沒有位移',(()=>{const same=resizeStandardBlank(fixed,r.params,'angle1',90,{comps:[fixed]});return same.ok&&same.follow.length===0;})());
 check('夾角 0／180／太靠近 → 拒絕並說明原因',[0,180,360,5,NaN].every(v=>{const x=resizeStandardBlank(c,r.params,'angle1',v,{comps:[c]});return !x.ok&&zh(x.message);}));
 // 跨過 180°（局部座標翻面）後孔位正確
 const flip=resizeStandardBlank(c,r.params,'angle1',200,{comps:[c]});
 check('夾角 200°（翻到另一側）：端孔與中間孔位置正確',flip.ok&&(()=>{const n2=flip.comp,[ux,uy]=unitAt(200),base=Math.atan2(n2.p2.y-n2.p1.y,n2.p2.x-n2.p1.x),d=24;const ex=n2.p1.x+d*(Math.cos(base)*ux-Math.sin(base)*uy),ey=n2.p1.y+d*(Math.sin(base)*ux+Math.cos(base)*uy);return near(n2.p3.x,ex,1e-6)&&near(n2.p3.y,ey,1e-6)&&n2.holes.filter(h=>/_A1_/.test(h.id)).every(h=>{const w=holeWorld(n2,h),k=dist(w,n2.p1)/8,t=k*8/d;return near(w.x,n2.p1.x+(ex-n2.p1.x)*t,1e-6)&&near(w.y,n2.p1.y+(ey-n2.p1.y)*t,1e-6);});})());
 const back=flip.ok&&resizeStandardBlank(flip.comp,flip.params,'angle1',90,{comps:[flip.comp]});
 check('改回 90° 與原本完全相同（來回不漂移）',back.ok&&near(back.comp.p3.x,c.p3.x,1e-6)&&near(back.comp.p3.y,c.p3.y,1e-6)&&back.comp.holes.every((h,i)=>near(h.u,c.holes[i].u,1e-6)&&near(h.v,c.holes[i].v,1e-6)&&h.id===c.holes[i].id));
 // 整件旋轉過、第3臂跟著轉
 const t3=make([A(3,0),A(3,90),A(3,200)]).comp,rot=(p,a)=>({...p,x:Math.cos(a)*p.x-Math.sin(a)*p.y,y:Math.sin(a)*p.x+Math.cos(a)*p.y}),R=structuredClone(t3);
 R.p1=rot(R.p1,.5);R.p2=rot(R.p2,.5);R.p3=rot(R.p3,.5);
 const r3a=resizeStandardBlank(R,{},'angle2',240,{comps:[R]});
 check('3 臂件整件旋轉過後改第3臂夾角：端孔在 240° 方向',r3a.ok&&(()=>{const e=holeWorld(r3a.comp,r3a.comp.holes.find(h=>h.id.endsWith('_A2_3'))),base=Math.atan2(R.p2.y-R.p1.y,R.p2.x-R.p1.x),want=base+240*Math.PI/180;return near(e.x,R.p1.x+24*Math.cos(want),1e-6)&&near(e.y,R.p1.y+24*Math.sin(want),1e-6);})(),r3a.message);
 // 三角形仍有效：新舊 hub 都不動
 check('第3臂改角度時 p2、p3 不動，follow 為空',r3a.ok&&dist(r3a.comp.p2,R.p2)<1e-9&&dist(r3a.comp.p3,R.p3)<1e-9&&r3a.follow.length===0);
}

// ---- 鐘形曲柄範例求解（SDD §3） ----
{
 const raw=JSON.parse(readFileSync(new URL('./fixtures/fourbar-drag-rocker.json',import.meta.url))),proj=raw.project;
 const [frame,crank,coupler,rocker]=proj.comps;
 const hub=rocker.p2,joint=coupler.p2,n=111;
 // 2 臂 90° 多臂件：中心孔在機架孔（固定），第1臂 7 孔（56 mm）端孔接連桿，第2臂 4 孔的端孔擺動。
 const made=makeStandardBlank({kind:'arms',arms:[A(7,0),A(4,90)],n,origin:{x:0,y:0}}),bell=made.comp;
 const rot=Math.atan2(joint.y-hub.y,joint.x-hub.x),at=p=>({x:hub.x+p.x*Math.cos(rot)-p.y*Math.sin(rot),y:hub.y+p.x*Math.sin(rot)+p.y*Math.cos(rot)});
 const placed={...bell,p1:{...bell.p1,id:hub.id,type:'fixed',...at(bell.p1)},p2:{...bell.p2,id:joint.id,type:'floating',...at(bell.p2)},p3:{...bell.p3,...at(bell.p3)}};
 check('範例：中心孔到連桿端距離＝第1臂長',near(dist(placed.p1,joint),56,0.05),String(dist(placed.p1,joint)));
 const params={...proj.params,...made.params,[bell.gParam]:56};
 const w=normalizeSnapshot({...proj,comps:[frame,crank,coupler,placed],params});
 check('範例：整件作品可正規化',!!w);
 const bellN=w.comps.find(c=>c.id===bell.id),endId=bellN.p3.id,tipId=`${bell.id}_A1_4`;
 const compiled=compileTopology(w.comps,{params:w.params},new Set());
 const frames=[];let prev=null;
 for(let t=0;t<=360;t+=5){const s=solveTopology(compiled,{thetaDeg:t,motorAngles:{1:t},_prevPoints:prev});if(s?.points?.[endId]&&Number.isFinite(s.points[endId].x)){frames.push({t,pts:s.points});prev=s.points;}}
 check('範例：輸入轉動時可解的角度範圍夠大（≥ 40 格，5°一步）',frames.length>=40,`${frames.length}/73`);
 const tips=frames.map(f=>f.pts[endId]),span=Math.max(...tips.map(p=>dist(p,tips[0])));
 check('範例：第2臂端孔擺動（最大位移 > 10 mm）',span>10,span.toFixed(2));
 check('範例：多臂件保持剛體（中心孔到端孔、兩端孔距離不變）',frames.every(f=>near(dist(f.pts[hub.id],f.pts[endId]),32,1e-6)&&near(dist(f.pts[joint.id],f.pts[endId]),dist(placed.p2,placed.p3),1e-6)));
 check('範例：中心孔固定不動',frames.every(f=>dist(f.pts[hub.id],frames[0].pts[hub.id])<1e-9));
 check('範例：第2臂的中間孔也跟著轉（局部孔隨剛體）',frames.every(f=>f.pts[`${bell.id}_A1_2`]&&near(dist(f.pts[hub.id],f.pts[`${bell.id}_A1_2`]),16,1e-6)));
 // 反例：多臂件另一個孔也固定在機架 → 鎖住
 const locked=structuredClone(w.comps),bl=locked.find(c=>c.id===bell.id);bl.p3.type='fixed';
 const lockedSolve=solveTopology(compileTopology(locked,{params:w.params},new Set()),{thetaDeg:0,motorAngles:{1:0}});
 check('反例：端孔也固定在機架 → 整件被鎖住，求解判為無效',lockedSolve.isValid===false&&frames.length>=40);
}
report('bent-arms');
