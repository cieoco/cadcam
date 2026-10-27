// 卡榫盒子 B2：① 每邊卡榫組數依邊長自動決定（間距 ≤ 80 mm、離角落留料）；② 面板可選：預設五面，可加上蓋（六面）或拿掉側板。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOX_DEFAULTS,normalizeBoxSettings,boxJointLayout} from '../js/blocks/box-config.js';
import {checkedBox} from '../js/blocks/box-generator.js';
import {planBoxChange} from '../js/blocks/box-operations.js';
import {faceFileExportData} from '../js/blocks/face-export.js';
import {exportLinksAsSvg} from '../js/blocks/exporters.js';
import {buildPlan,hardwareList} from '../js/blocks/build-plan.js';
import {applyMatrix4} from '../js/blocks3d/orthogonal-3d.js';
let pass=0;const ok=(c,m)=>{assert.ok(c,m);pass++;console.log('PASS',m);};
const near=(a,b,t=1e-6)=>Math.abs(a-b)<=t;
const svgs=w=>{const d=faceFileExportData(w),f=[];exportLinksAsSvg(d.comps,d.points,d.params,d.settings,d.mounts,d.extras,(text,name)=>f.push({text,name}));return {files:f,extras:d.extras};};
const count=(t,layer)=>(t.match(new RegExp(`data-layer="${layer}"`,'g'))||[]).length;
const screws=(w)=>{const {extras}=svgs(w);const b=hardwareList(buildPlan({...w,extras}));return b.find(x=>/^M3×/.test(x.spec))?.qty||0;};
const roleOf=(w,role)=>w.comps.find(c=>c.boxPanel?.role===role);
const bounds=(cand,role)=>{const id=roleOf(cand.work,role).id,part=cand.model.materialParts.find(p=>p.partId===id);
  const pts=part.geometry.outlines.flat().flatMap(p=>[0,part.geometry.thicknessMm].map(z=>applyMatrix4(part.pose.matrix,{...p,z})));
  return Object.fromEntries(['x','y','z'].map(k=>[k,[Math.min(...pts.map(p=>p[k])),Math.max(...pts.map(p=>p[k]))]]));};

// ---------- 預設：五面、組數自動 ----------
ok(BOX_DEFAULTS.jointsPerEdge==='auto'&&BOX_DEFAULTS.maxJointSpacingMm===80&&BOX_DEFAULTS.jointEndMarginMm===15,'預設：組數自動、最大間距 80 mm、離角落 15 mm');
ok(JSON.stringify(BOX_DEFAULTS.panels)===JSON.stringify({lid:false,front:true,back:true,left:true,right:true}),'預設五面（無上蓋）');
{
  const L=boxJointLayout(BOX_DEFAULTS);
  ok(L.front.sets===2&&L.back.sets===2&&L.left.sets===1&&L.right.sets===1,'120×80 盒：長邊各 2 組、短邊各 1 組');
  for(const [role,e] of Object.entries(L)){
    const gaps=e.centersMm.slice(1).map((c,i)=>c-e.centersMm[i]);
    if(e.centersMm.length!==e.sets)assert.fail(`${role} 組數與中心數不符`);
    if(gaps.some(g=>g>80+1e-9))assert.fail(`${role} 間距超過 80 mm`);
    if(gaps.length&&gaps.some(g=>Math.abs(g-gaps[0])>1e-9))assert.fail(`${role} 沒有等距`);
    const half=(BOX_DEFAULTS.tabPitchMm+BOX_DEFAULTS.tabWidthMm)/2;
    if(Math.min(...e.centersMm)-half<15-1e-9||e.edgeLengthMm-Math.max(...e.centersMm)-half<15-1e-9)assert.fail(`${role} 榫離角落不足 15 mm`);
  }
  ok(true,'每邊等距、間距 ≤ 80 mm、最外側榫離角落 ≥ 15 mm');
  const big=boxJointLayout({...BOX_DEFAULTS,lengthMm:400,widthMm:400,heightMm:120}),small=boxJointLayout({...BOX_DEFAULTS,lengthMm:60,widthMm:60,heightMm:25});
  ok(big.front.sets===5&&big.left.sets===5,'400×400 盒：每邊 5 組');
  ok(small.front.sets===1&&small.left.sets===1,'60×60 盒：每邊 1 組');
  const r=await checkedBox(BOX_DEFAULTS);
  ok(r.saveable&&r.work.comps.length===5&&r.validation.material.findings.length===0,'預設盒可建立、五片、無干涉');
  const base=svgs(r.work).files.find(f=>f.name==='BoxBase.svg').text;
  ok(count(base,'TAB_NUT_SLOT')===12&&count(base,'TAB_NUT_BOLT')===6,'底板 12 個插槽、6 個螺絲孔（6 組）');
  ok(screws(r.work)===6,'五金清單：M3 螺絲 6 顆');
  const rb=await checkedBox({...BOX_DEFAULTS,lengthMm:400,widthMm:400,heightMm:120});
  ok(rb.saveable&&rb.validation.material.findings.length===0&&screws(rb.work)===20,'400×400 盒：20 組可建立、無干涉');
}
// ---------- 手動組數 ----------
{
  const r=await checkedBox({...BOX_DEFAULTS,jointsPerEdge:1});
  ok(r.saveable&&screws(r.work)===4,'手動每邊 1 組：共 4 顆（同舊版）');
  const bad=await checkedBox({...BOX_DEFAULTS,lengthMm:60,widthMm:60,jointsPerEdge:3});
  ok(bad.saveable!==true&&/組|放不下|間距/.test(bad.reason||''),`邊太短放不下 3 組要拒絕並說明（${bad.reason}）`);
  ok(normalizeBoxSettings({...BOX_DEFAULTS,jointsPerEdge:0})===null&&normalizeBoxSettings({...BOX_DEFAULTS,maxJointSpacingMm:10})===null,'不合理的組數或間距不接受');
}
// ---------- 六面（上蓋）----------
{
  const s={...BOX_DEFAULTS,panels:{...BOX_DEFAULTS.panels,lid:true}};
  const r=await checkedBox(s);
  ok(r.saveable&&r.work.comps.length===6&&roleOf(r.work,'lid'),`六面盒可建立（${r.reason||''}）`);
  ok(r.validation.material.findings.length===0,'六面盒無干涉');
  const b=Object.fromEntries(['base','lid','front','left','right','back'].map(k=>[k,bounds(r,k)]));
  ok(near(b.lid.z[0]-b.base.z[1],s.heightMm),'上蓋下表面距底板上表面＝內高');
  ok(near(b.lid.x[1]-b.lid.x[0],b.base.x[1]-b.base.x[0])&&near(b.lid.y[1]-b.lid.y[0],b.base.y[1]-b.base.y[0]),'上蓋與底板同尺寸（留邊給插槽）');
  const f=svgs(r.work).files,lid=f.find(x=>/lid/i.test(x.name)).text,front=f.find(x=>x.name==='Boxfront.svg'||/front/i.test(x.name)).text;
  ok(count(lid,'TAB_NUT_SLOT')===12&&count(lid,'TAB_NUT_BOLT')===6,'上蓋也有 12 槽、6 孔，對到四面側板上緣');
  ok(screws(r.work)===12,'六面盒：M3 螺絲 12 顆');
  const five=svgs((await checkedBox(BOX_DEFAULTS)).work).files.find(x=>/front/i.test(x.name)).text;
  ok((front.match(/data-layer="TAB_NUT_[A-Z_]*NUT[A-Z_]*"/g)||[]).length===2*(five.match(/data-layer="TAB_NUT_[A-Z_]*NUT[A-Z_]*"/g)||[]).length,'加上蓋後，側板上下兩端都有螺母卡槽');
}
// ---------- 少於五面 ----------
{
  const s={...BOX_DEFAULTS,panels:{...BOX_DEFAULTS.panels,front:false}};
  const r=await checkedBox(s);
  ok(r.saveable&&r.work.comps.length===4&&!roleOf(r.work,'front'),'拿掉前板：四片');
  const b=Object.fromEntries(['base','back','left','right'].map(k=>[k,bounds(r,k)]));
  ok(near(b.right.x[0]-b.left.x[1],s.lengthMm),'內長不因少一面改變');
  const base=svgs(r.work).files.find(f=>f.name==='BoxBase.svg').text;
  ok(count(base,'TAB_NUT_BOLT')===4,'底板只為存在的三面開槽（2＋1＋1 組）');
  const two=await checkedBox({...BOX_DEFAULTS,panels:{lid:false,front:false,back:false,left:true,right:true}});
  ok(two.saveable&&two.work.comps.length===3,'只留左右兩面（U 形）也可');
  const none=await checkedBox({...BOX_DEFAULTS,panels:{lid:true,front:false,back:false,left:false,right:false}});
  ok(none.saveable!==true&&/側板|至少/.test(none.reason||''),'沒有側板要拒絕（上蓋無處固定）');
  ok(normalizeBoxSettings({...BOX_DEFAULTS,panels:{lid:false,front:'yes',back:true,left:true,right:true}})===null,'面板設定格式錯誤不接受');
}
// ---------- 舊檔相容與修改 ----------
{
  const {jointsPerEdge,maxJointSpacingMm,jointEndMarginMm,panels,...old}=BOX_DEFAULTS;
  const n=normalizeBoxSettings(old);
  ok(n&&n.jointsPerEdge===1&&JSON.stringify(n.panels)===JSON.stringify(BOX_DEFAULTS.panels),'舊存檔（沒有新欄位）讀成：五面、每邊 1 組（保持原樣，不偷改加工檔）');
  const src={kind:'blocks',v:1,counter:1,params:{},comps:[],modules:[],assemblyMembers:['#root']};
  const first=await planBoxChange(src,BOX_DEFAULTS);
  const six=await planBoxChange(first.work,{...BOX_DEFAULTS,panels:{...BOX_DEFAULTS.panels,lid:true}},{rootPart:first.rootPart});
  ok(six.ok&&six.work.comps.filter(c=>c.boxPanel).length===6,'既有五面盒改成六面');
  ok(first.work.comps.filter(c=>c.boxPanel).every(c=>six.work.comps.some(x=>x.id===c.id)),'原有五片的編號保留');
  const four=await planBoxChange(six.work,{...BOX_DEFAULTS,panels:{...BOX_DEFAULTS.panels,front:false}},{rootPart:first.rootPart});
  ok(four.ok&&four.work.comps.filter(c=>c.boxPanel).length===4&&four.work.modules.every(m=>four.work.comps.some(c=>c.moduleId===m.id)),'再改成四面：多的板與模組一起移除，不留孤兒');
}
// ---------- 介面 ----------
{
  const ui=readFileSync(new URL('../js/blocks/box-dialog.js',import.meta.url),'utf8');
  ok(/上蓋/.test(ui)&&/前板|前/.test(ui)&&/底板/.test(ui),'對話框可勾選面板（底板固定、上蓋與四面可選）');
  ok(/組數/.test(ui)&&/自動/.test(ui)&&/間距/.test(ui),'對話框有卡榫組數（自動／手動）與最大間距');
  ok(/顆/.test(ui),'預覽顯示螺絲總數');
}
console.log(`box-panels-joints: ${pass} passed`);
