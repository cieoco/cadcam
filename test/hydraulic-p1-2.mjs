// 液壓第一期 P1-2（PLAN-HYDRAULIC-ARM）：H04 旋轉底盤（俯視）——管夾固定針筒＋短連桿帶動轉盤。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as FX from '../js/blocks/fixed-syringe-examples.js';
import * as Op from '../js/blocks/syringe-operations.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
let pass=0;const ok=(cond,msg)=>{assert.ok(cond,msg);pass++;console.log('PASS',msg);};
const snap=FX.fixedBaseSnapshot;
ok(snap&&snap.kind==='blocks','fixed-syringe-examples.js 匯出 fixedBaseSnapshot');
const before=JSON.stringify(snap);
const n=normalizeSnapshot(snap),syr=n.comps.filter(x=>x.type==='syringe');
ok(syr.length===1,'只有一支針筒');
const c=syr[0];
ok(c.mountMode==='fixed-axis','筒身以管夾固定（fixed-axis）');
ok(c.spec.capacityMl===10&&c.spec.stroke===20,'10 mL 針筒、20 mm 教學區間');
ok(c.outputId==='H4Turn','輸出件是轉盤 H4Turn');
const turn=n.comps.find(x=>x.id==='H4Turn');
ok(turn&&turn.p1?.type==='fixed','轉盤中心是固定轉軸');
ok(turn.p3&&Math.hypot(turn.p3.x-turn.p1.x,turn.p3.y-turn.p1.y)>=40,'轉盤上有距中心 ≥ 40 mm 的安裝點（之後放升降總成）');
const scan=Op.scanSyringe(n.comps,n.params,c.id,0.5);
ok(scan.ok&&scan.samples.length===41,'0–20 mm 全行程可解（41 點）');
const ang=scan.samples.map(s=>s.angle);let un=[ang[0]];
for(let i=1;i<ang.length;i++){let d=ang[i]-ang[i-1];d=((d+540)%360)-180;un.push(un[i-1]+d);}
const dir=Math.sign(un.at(-1)-un[0]),steps=un.slice(1).map((a,i)=>(a-un[i])*dir);
ok(dir!==0&&steps.every(d=>d>1e-6),'轉盤轉角隨伸出量單調變化，不折返');
const swing=Math.abs(un.at(-1)-un[0]);
ok(swing>=60&&swing<=120,`轉盤總轉角 60–120°（實際 ${swing.toFixed(1)}°）`);
const coup=n.comps.find(x=>x.id===c.b.componentId);
let prev=null,minMu=180,maxMu=0;
for(const s of scan.samples){
  const r=Op.planSyringeStroke(n.comps,n.params,c.id,s.extension,prev);prev=r.points;
  const O=prev[turn.p1.id]||turn.p1,pin=prev[coup.p2.id],rod=prev[coup.p1.id];
  const v1={x:rod.x-pin.x,y:rod.y-pin.y},v2={x:O.x-pin.x,y:O.y-pin.y};
  const mu=Math.acos((v1.x*v2.x+v1.y*v2.y)/Math.hypot(v1.x,v1.y)/Math.hypot(v2.x,v2.y))*180/Math.PI;
  minMu=Math.min(minMu,mu);maxMu=Math.max(maxMu,mu);
}
ok(minMu>=35&&maxMu<=145,`傳動角全程 35–145°，遠離死點（實際 ${minMu.toFixed(1)}–${maxMu.toFixed(1)}°）`);
const mid=Op.planSyringeStroke(n.comps,n.params,c.id,10,null);
const g=Op.syringeGain(mid.comps,n.params,c.id,mid.points);
ok(g&&g.degPerMm>=2&&g.degPerMm<=8,`10 mm 處每推 1 mm 轉 2–8°（實際 ${g?.degPerMm.toFixed(2)}°）`);
ok(JSON.stringify(snap)===before,'不改範例原始資料');
const ex=readFileSync(new URL('../js/blocks/examples.js',import.meta.url),'utf8');
ok(/id:'hydraulic-h04'/.test(ex)&&/fixedBaseSnapshot/.test(ex),'範例清單登錄 hydraulic-h04');
ok(!/hydraulic-h03[^\n]*交叉/.test(ex),'H03 範例說明不再寫「交叉臂」（已改為對稱不交叉）');
const html=readFileSync(new URL('../teaching-hydraulic.html',import.meta.url),'utf8');
ok(/blocks\.html\?example=hydraulic-h04/.test(html),'教材有開啟 H04 的連結');
ok(/第十一單元/.test(html)&&/俯視/.test(html)&&/轉盤/.test(html),'第十一單元以俯視說明轉盤');
console.log(`hydraulic-p1-2: ${pass} passed`);
