// 參考「電路板外殼生成器」：3D 視角快捷（頂／前／右／立體／置中）、分離（爆炸）滑桿、整體尺寸、建議與回饋。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {VIEW_PRESETS,presetCameraPose} from '../js/blocks3d/view-presets.js';
import {explodeOffsets,formatExtents} from '../js/blocks3d/explode.js';
import {COMMANDS} from '../js/blocks/ui-commands.js';
import {startupSize} from '../tools/startup-size.mjs';
let pass=0;const ok=(c,m)=>{assert.ok(c,m);pass++;console.log('PASS',m);};
const near=(a,b,e=1e-6)=>Math.abs(a-b)<=e;
const sub=(a,b)=>a.map((v,i)=>v-b[i]),len=v=>Math.hypot(...v),unit=v=>v.map(x=>x/len(v));

// 1. 視角快捷
ok(VIEW_PRESETS.map(p=>p.id).join()==='top,front,right,iso,fit','視角：頂、前、右、立體、置中（依序）');
ok(VIEW_PRESETS.map(p=>p.label).join()==='頂,前,右,立體,置中','視角標籤用中文一兩字');
const center=[10,20,5],radius=100;
for(const viewUp of ['y','z']){
  const up=viewUp==='z'?[0,0,1]:[0,1,0];
  // viewUp 'y'：畫布平面 = xy，學生畫的那一面就是「前」（相機在 +z）；viewUp 'z'：一般 CAD，前視從 −y 看。
  const frontDir=viewUp==='z'?[0,-1,0]:[0,0,1];
  const poses=Object.fromEntries(VIEW_PRESETS.map(p=>[p.id,presetCameraPose(p.id,{center,radius,viewUp})]));
  for(const [id,P] of Object.entries(poses)){
    assert.ok(P&&Array.isArray(P.position)&&Array.isArray(P.target)&&Array.isArray(P.up),`${id} 回傳 position/target/up`);
    assert.ok(P.target.every((v,i)=>near(v,center[i])),`${viewUp}:${id} 對準中心`);
    assert.ok(len(sub(P.position,P.target))>=radius*1.5,`${viewUp}:${id} 距離足以看到整體`);
  }
  const dir=id=>unit(sub(poses[id].position,poses[id].target));
  ok(dir('top').every((v,i)=>near(v,up[i])),`${viewUp}：頂視從上往下看`);
  ok(dir('front').every((v,i)=>near(v,frontDir[i])),`${viewUp}：前視方向正確`);
  ok(near(dir('right')[0],1),`${viewUp}：右視從 +x 看`);
  const d=dir('iso'),upAmt=d[0]*up[0]+d[1]*up[1]+d[2]*up[2],frontAmt=d[0]*frontDir[0]+d[1]*frontDir[1]+d[2]*frontDir[2];
  ok(d[0]>0.3&&upAmt>0.3&&frontAmt>0.3,`${viewUp}：立體視從右前上方斜看`);
  const dist=['top','front','right','iso'].map(id=>len(sub(poses[id].position,poses[id].target)));
  ok(dist.every(x=>near(x,dist[0],1e-6)),`${viewUp}：四個視角距離一致（切換不會忽大忽小）`);
  ok(Math.abs(dir('top').reduce((s,v,i)=>s+v*poses.top.up[i],0))<1e-6,`${viewUp}：頂視的 up 不與視線平行`);
}

// 2. 分離（爆炸）
const items=[{id:'a',layer:0},{id:'b',layer:1},{id:'c',layer:2},{id:'d',layer:2,normal:[1,0,0]}];
const zero=explodeOffsets(items,0,{gap:6});
ok(items.every(it=>zero[it.id].every(v=>v===0)),'分離 0%：零件回到原位');
const half=explodeOffsets(items,0.5,{gap:6}),full=explodeOffsets(items,1,{gap:6});
ok(near(half.a[2],-half.c[2])&&near(half.b[2],0),'以中間層為準，上下對稱拉開');
ok(full.c[2]>half.c[2]&&half.c[2]>0&&full.a[2]<half.a[2]&&half.a[2]<0,'分離量隨滑桿單調增加');
ok(full.c[2]-full.b[2]>=6&&full.b[2]-full.a[2]>=6,'全開時每層至少多拉開一個層距');
ok(near(full.d[1],0)&&near(full.d[2],0)&&full.d[0]>0,'直角安裝的模組沿自己的法向拉開');
ok(near(explodeOffsets(items,2,{gap:6}).c[2],full.c[2]),'超過 100% 視為 100%');

// 3. 整體尺寸
ok(formatExtents({min:[0,0,0],max:[120.4,79.6,15]})==='整體 120 × 80 × 15 mm','整體尺寸：寬 × 高 × 厚，取整數');
ok(formatExtents({min:[0,0,0],max:[50,30,0]})==='整體 50 × 30 mm','沒有厚度時只寫兩個數');

// 4. 接到 3D 檢視
const viewer=readFileSync(new URL('../js/blocks3d/viewer.js',import.meta.url),'utf8');
ok(/setViewPreset\b/.test(viewer)&&/setExplode\b/.test(viewer)&&/getExtents\b/.test(viewer),'3D 檢視提供 setViewPreset／setExplode／getExtents');
const html=readFileSync(new URL('../blocks.html',import.meta.url),'utf8');
ok(/class="[^"]*view-presets/.test(html)||/view-presets/.test(readFileSync(new URL('../js/blocks/app.js',import.meta.url),'utf8')),'3D 畫面有視角快捷列');
ok(/模型已更新/.test(html+viewer+readFileSync(new URL('../js/blocks/app.js',import.meta.url),'utf8')),'改完參數後 3D 顯示「模型已更新」');

// 5. 建議與回饋、版本
const fb=COMMANDS.find(x=>x.id==='feedback');
ok(fb&&fb.group==='help'&&/建議與回饋/.test(fb.label)&&/github\.com\/cieoco\/cadcam\/issues/.test(fb.href||fb.run||''),'說明 → 建議與回饋（開 GitHub issues）');
const ver=COMMANDS.find(x=>x.id==='version');
ok(ver&&ver.group==='help','說明 → 版本仍在');

// 6. 不吃啟動預算
const paths=startupSize().paths;
ok(!paths.includes('js/blocks3d/view-presets.js')&&!paths.includes('js/blocks3d/explode.js'),'視角與分離跟著 3D 一起延後載入');
console.log(`view-tools: ${pass} passed`);
