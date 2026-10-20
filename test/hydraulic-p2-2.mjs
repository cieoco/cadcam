// 液壓第二期 P2-2（PLAN-HYDRAULIC-ARM C5）：動作序列支援針筒——「張開 → 降 → 夾 → 升 → 放」可存、可驗證、可播放。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hydraulicLiftGripSnapshot as SNAP} from '../js/blocks/hydraulic-assembly-example.js';
import {DEFAULT_HYDRAULIC_SEQUENCE,prepareHydraulicSequence,sequenceExtensionsAt} from '../js/blocks/hydraulic-sequence.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
let pass=0;const ok=(cond,msg)=>{assert.ok(cond,msg);pass++;console.log('PASS',msg);};
const near=(a,b,t=1e-9)=>Math.abs(a-b)<=t;
const src=normalizeSnapshot(SNAP);
const syr=src.comps.filter(c=>c.type==='syringe');
const lift=syr.find(c=>!c.jawIds?.length).id,grip=syr.find(c=>c.jawIds?.length).id;
const start=Object.fromEntries(syr.map(c=>[c.id,c.extension]));
const steps=DEFAULT_HYDRAULIC_SEQUENCE(src);
ok(Array.isArray(steps)&&steps.length>=5,'H05 有預設序列（至少 5 步）');
ok(steps.every(s=>[lift,grip].includes(s.syringe)&&Number.isFinite(s.extension)&&s.seconds>=0.5&&s.seconds<=5&&s.name),'每步：名稱、針筒、目標伸出量、秒數');
ok(steps.some(s=>s.syringe===lift)&&steps.some(s=>s.syringe===grip),'序列同時用到升降與夾爪');
const names=steps.map(s=>s.name).join('');
ok(/夾/.test(names)&&/升/.test(names)&&/(降|放)/.test(names),`步驟名稱說得出動作（${names}）`);
const before=JSON.stringify(src);
const plan=prepareHydraulicSequence(src,steps,start);
ok(plan.ok,`預設序列可解（${plan.message||''}）`);
ok(near(plan.duration,steps.reduce((t,s)=>t+s.seconds,0)),'總時間＝各步秒數相加');
let need=0,prev={...start};for(const s of steps){need+=Math.ceil(Math.abs(s.extension-prev[s.syringe])/0.5);prev[s.syringe]=s.extension;}
ok(plan.samples>=need,`每 0.5 mm 至少驗一次（${plan.samples} ≥ ${need}）`);
ok(JSON.stringify(src)===before,'不改傳入資料');

// ---------- 時間 → 伸出量 ----------
{
  const at0=sequenceExtensionsAt(plan,0).extensions;
  ok(syr.every(c=>near(at0[c.id],start[c.id])),'t=0 為起始伸出量');
  let t=0,cur={...start},onlyOne=true,ends=true;
  for(let i=0;i<steps.length;i++){
    const s=steps[i],mid=sequenceExtensionsAt(plan,t+s.seconds/2);
    if(mid.index!==i)onlyOne=false;
    for(const c of syr){const v=mid.extensions[c.id];
      if(c.id===s.syringe){if(!near(v,(cur[c.id]+s.extension)/2,1e-6))onlyOne=false;}
      else if(!near(v,cur[c.id]))onlyOne=false;}
    t+=s.seconds;cur[s.syringe]=s.extension;
    const end=sequenceExtensionsAt(plan,t).extensions;if(!syr.every(c=>near(end[c.id],cur[c.id],1e-6)))ends=false;
  }
  ok(onlyOne,'每一步只動一支針筒，等速移到目標');
  ok(ends,'每一步結束時到達目標伸出量');
  const after=sequenceExtensionsAt(plan,plan.duration+5);
  ok(syr.every(c=>near(after.extensions[c.id],cur[c.id]))&&after.index===steps.length-1,'超過總時間停在最後姿勢');
}
// ---------- 拒絕並說明 ----------
{
  const bad=(st,re,msg,s0=start)=>{const r=prepareHydraulicSequence(src,st,s0);ok(!r.ok&&re.test(r.message||''),`${msg}（${r.message}）`);};
  const mod=(i,patch)=>steps.map((s,j)=>j===i?{...s,...patch}:s);
  bad([], /步驟|至少/,'沒有步驟');
  bad(mod(2,{syringe:'nope'}),/第 3 步/,'找不到的針筒指出是第幾步');
  bad(mod(1,{extension:25}),/第 2 步.*(行程|0～20|0–20)/,'超出行程');
  bad(mod(0,{seconds:0.2}),/第 1 步.*(秒|時間)/,'時間太短');
  bad(Array.from({length:21},()=>steps[0]),/20|太多/,'步驟太多（> 20）');
  const broken=structuredClone(src);broken.params.H2Arm=198.958;broken.params.H2Tail=broken.params.H2Reach-198.958;
  const r=prepareHydraulicSequence(broken,steps,start);
  ok(!r.ok&&/(第 \d+ 步|起始|目前)/.test(r.message||''),`姿勢不可解要拒絕並指出位置（${r.message}）`);
}
// ---------- 存檔 ----------
{
  const saved={...structuredClone(SNAP),hydraulicSequence:{start,steps}};
  const n=normalizeSnapshot(saved);
  ok(JSON.stringify(n.hydraulicSequence?.steps)===JSON.stringify(steps),'序列隨作品存檔、讀回相同');
  const dirty={...structuredClone(SNAP),hydraulicSequence:{start,steps:[...steps,{name:'x',syringe:lift,extension:'abc',seconds:1},null]}};
  const d=normalizeSnapshot(dirty).hydraulicSequence?.steps||[];
  ok(d.length===steps.length,'讀檔時丟掉壞掉的步驟');
  ok(normalizeSnapshot(structuredClone(SNAP)).hydraulicSequence===undefined||normalizeSnapshot(structuredClone(SNAP)).hydraulicSequence===null,'沒有序列的作品不會多出欄位');
}
// ---------- 介面與教材 ----------
{
  const dlg=readFileSync(new URL('../js/blocks/lesson-sequence-dialog.js',import.meta.url),'utf8');
  ok(/hydraulic-sequence/.test(dlg),'「動作序列」對液壓組立改用針筒序列');
  const t=readFileSync(new URL('../teaching-hydraulic.html',import.meta.url),'utf8');
  const h5=t.slice(t.indexOf('第十單元'));
  ok(/動作序列/.test(h5)&&/MP4/i.test(h5),'第十單元教用動作序列排出「張開→降→夾→升→放」並輸出 MP4');
}
console.log(`hydraulic-p2-2: ${pass} passed`);
