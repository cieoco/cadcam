// 液壓第二期 P2-1（PLAN-HYDRAULIC-ARM C2＋H05 前半）：升降＋夾爪兩支針筒組成側視組立，各自控制、互不影響。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hydraulicLiftGripSnapshot as SNAP} from '../js/blocks/hydraulic-assembly-example.js';
import {assemblySyringeControls,planAssemblySyringe} from '../js/blocks/assembly-syringe.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {compileAssembly,solveAssembly} from '../js/blocks/assembly.js';
import {plateVertexWorldPoints} from '../js/blocks/plate-geometry.js';
let pass=0;const ok=(cond,msg)=>{assert.ok(cond,msg);pass++;console.log('PASS',msg);};
const near=(a,b,t=1e-6)=>Math.abs(a-b)<=t;
const before=JSON.stringify(SNAP);
const n=normalizeSnapshot(SNAP);
ok(Array.isArray(n.modules)&&n.modules.length===2,'組立有兩個模組（升降、夾爪）');
const syr=n.comps.filter(c=>c.type==='syringe');
ok(syr.length===2&&new Set(syr.map(c=>c.moduleId)).size===2,'兩支針筒分屬兩個模組');
ok(syr.every(c=>c.mountMode==='fixed-axis'&&c.spec.capacityMl===10&&c.spec.stroke===20),'都是管夾固定 10 mL、20 mm');
const lift=syr.find(c=>!c.jawIds?.length),grip=syr.find(c=>c.jawIds?.length===2);
ok(lift&&grip,'一支驅動升降臂、一支驅動夾臂');
const gm=n.modules.find(m=>m.id===grip.moduleId),lm=n.modules.find(m=>m.id===lift.moduleId);
ok(gm.mount?.to?.module===lm.id,'夾爪模組裝在升降模組的輸出端');

const solve=(le,ge)=>{const cs=structuredClone(n.comps);cs.find(c=>c.id===lift.id).extension=le;cs.find(c=>c.id===grip.id).extension=ge;
  const s=solveAssembly(compileAssembly(cs,n.modules,{params:n.params}),{thetaDeg:0,motorAngles:{}});return {s,cs};};
const arm=n.comps.find(c=>c.id===lift.outputId),out=lm.outputs.find(o=>o.id===gm.mount.to.output);
const deg=(P,a,b)=>Math.atan2(P[b].y-P[a].y,P[b].x-P[a].x)*180/Math.PI;
const gframe=n.comps.find(c=>c.id===grip.a.componentId);
const tipGap=(P,cs)=>{const e=grip.jawIds.map(id=>{const j=cs.find(c=>c.id===id);return plateVertexWorldPoints(j,[j.p1,j.p2,j.p3].map(p=>P[p.id]||p)).at(-1);});return Math.hypot(e[0].x-e[1].x,e[0].y-e[1].y);};
let allValid=true,attached=true,rigid=true,offset=null;const armAt={},gapAt={};let armOnlyLift=true,gapOnlyGrip=true;
for(const le of [0,5,10,15,20])for(const ge of [0,10,20]){
  const {s,cs}=solve(le,ge),P=s.points;if(!s.isValid){allValid=false;continue;}
  if(Math.hypot(P[gm.base].x-P[out.at].x,P[gm.base].y-P[out.at].y)>1e-6)attached=false;
  const d=((deg(P,gframe.p1.id,gframe.p2.id)-deg(P,arm.p1.id,arm.p2.id))%360+540)%360-180;
  if(offset===null)offset=d;else if(!near(d,offset,1e-6))rigid=false;
  const a=deg(P,arm.p1.id,arm.p2.id),g=tipGap(P,cs);
  if(armAt[le]===undefined)armAt[le]=a;else if(!near(a,armAt[le]))armOnlyLift=false;
  if(gapAt[ge]===undefined)gapAt[ge]=g;else if(!near(g,gapAt[ge]))gapOnlyGrip=false;
}
ok(allValid,'升降 0–20 mm × 夾爪 0–20 mm 各組合都可解');
ok(attached,'夾爪支點始終貼在升降臂工具端');
ok(rigid,'夾爪隨升降臂一起轉（相對角度固定）');
ok(armOnlyLift&&Math.abs(armAt[20]-armAt[0])>3,'升降臂角度只隨升降針筒改變');
ok(gapOnlyGrip&&gapAt[0]-gapAt[20]>25,'夾臂端孔距只隨夾爪針筒改變，推出＝夾緊');
ok(JSON.stringify(SNAP)===before,'不改範例原始資料');

// ---------- 控制清單 ----------
const ctl=assemblySyringeControls(n.comps,n.modules);
ok(ctl.length===2&&ctl[0].id===lift.id&&ctl[1].id===grip.id,'控制清單依安裝順序：先升降、後夾爪');
ok(ctl.every(x=>x.label.includes(n.modules.find(m=>m.id===x.moduleId).name)),'每條控制以模組名稱標示');
ok(ctl.every(x=>x.stroke===20&&Number.isFinite(x.extension)),'每條控制有自己的伸出量與行程');

// ---------- 單獨推一支 ----------
const base=solve(lift.extension,grip.extension).s.points;
const r=planAssemblySyringe(n.comps,n.modules,n.params,grip.id,20,base);
ok(r.ok,`可單獨推夾爪針筒（${r.message||''}）`);
ok(r.comps.find(c=>c.id===grip.id).extension===20&&r.comps.find(c=>c.id===lift.id).extension===lift.extension,'只改這支的伸出量，另一支不變');
ok(near(deg(r.points,arm.p1.id,arm.p2.id),deg(base,arm.p1.id,arm.p2.id)),'推夾爪時升降臂不動');
const bad=planAssemblySyringe(n.comps,n.modules,n.params,lift.id,25,base);
ok(!bad.ok&&/行程|20/.test(bad.message||''),'超出行程要拒絕並說明');
ok(!planAssemblySyringe(n.comps,n.modules,n.params,'nope',5,base).ok,'找不到針筒時拒絕');
ok(n.comps.find(c=>c.id===grip.id).extension===grip.extension,'不改傳入資料');

// ---------- 範例、教材、介面 ----------
const ex=readFileSync(new URL('../js/blocks/examples.js',import.meta.url),'utf8');
ok(/id:'hydraulic-h05'/.test(ex)&&/hydraulicLiftGripSnapshot/.test(ex),'範例清單登錄 hydraulic-h05');
const t=readFileSync(new URL('../teaching-hydraulic.html',import.meta.url),'utf8');
ok(/blocks\.html\?example=hydraulic-h05/.test(t)&&/第十單元/.test(t),'教材第十單元有開啟 H05 的連結');
const ui=readFileSync(new URL('../js/blocks/syringe-ui.js',import.meta.url),'utf8');
ok(/assemblySyringeControls/.test(ui)&&/planAssemblySyringe/.test(ui),'針筒介面在組立模式使用多針筒控制');
ok(!/組立 3D 尚未支援針筒/.test(ui),'組立模式可以操作針筒（移除「尚未支援」提示）');
console.log(`hydraulic-p2-1: ${pass} passed`);
