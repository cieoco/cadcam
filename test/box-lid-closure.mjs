// 卡榫盒子 B2 補充：上蓋閉合接合（只作加工用）、多組卡榫的保存／複製／3D 與舊檔相容。
// test/box-panels-joints.mjs 的「螺母卡槽」圖層規則比對不到任何圖層（卡槽是外框的一部分），這裡改查外框頂點。
import assert from 'node:assert/strict';
import {BOX_DEFAULTS,normalizeBoxSettings} from '../js/blocks/box-config.js';
import {checkedBox,boxJointSummary,boxScrewCount} from '../js/blocks/box-generator.js';
import {planBoxChange} from '../js/blocks/box-operations.js';
import {storedProject,readStoredProject} from '../js/blocks/project-envelope.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {encodeSnapshot,decodeShareString} from '../js/share-codec.js';
import {tabNutPlans,tabNutPartGeometry} from '../js/blocks/tab-nut-plan.js';
import {compositeToTemplate,instantiateComposite} from '../js/blocks/module-ops.js';
import {buildFaceCandidate,faceCandidateModel} from '../js/blocks/face-candidate.js';
import {faceFileExportData} from '../js/blocks/face-export.js';
import {applyMatrix4} from '../js/blocks3d/orthogonal-3d.js';
let pass=0;const ok=(c,m)=>{assert.ok(c,m);pass++;console.log('PASS',m);};
const lidOn=s=>({...s,panels:{...s.panels,lid:true}});
const notchRows=(work,role)=>{const comp=work.comps.find(c=>c.boxPanel.role===role),g=tabNutPartGeometry(faceFileExportData(work).extras,comp,{local:true}),ys=g.outlines[0].map(p=>+p.y.toFixed(6)),half=comp.boxPanel.settings.heightMm/2,row=half-9.5;
  return {low:ys.filter(y=>Math.abs(y+row)<1e-6).length,high:ys.filter(y=>Math.abs(y-row)<1e-6).length,tabsLow:ys.filter(y=>Math.abs(y+half+3)<1e-6).length,tabsHigh:ys.filter(y=>Math.abs(y-half-3)<1e-6).length};};

const five=await checkedBox(BOX_DEFAULTS),six=await checkedBox(lidOn(BOX_DEFAULTS));
ok(five.saveable&&six.saveable,'五面與六面預設盒都可建立');
{ // 螺母卡槽（外框頂點）：五面只在下端，六面上下兩端、組數相同
  const a=notchRows(five.work,'front'),b=notchRows(six.work,'front');
  ok(a.low===4&&a.high===0&&a.tabsLow===8&&a.tabsHigh===0,'五面：前板只有底端 2 組卡槽、4 個榫');
  ok(b.low===4&&b.high===4&&b.tabsLow===8&&b.tabsHigh===8,'六面：前板上下兩端各 2 組卡槽、4 個榫');
  const l=notchRows(six.work,'left');ok(l.low===2&&l.high===2,'左板每端 1 個卡槽');
}
{ // 閉合接合：每側板各一筆，與底板接合數相同；螺絲孔與側板榫逐一對應
  const plans=tabNutPlans(six.work.comps,six.work.modules,six.work.params),closing=plans.filter(p=>p.connectionId.endsWith('/lid'));
  ok(plans.length===8&&closing.length===4&&plans.every(p=>p.ok),'4 筆底板接合＋4 筆上蓋閉合接合皆有效');
  const lid=six.work.comps.find(c=>c.boxPanel.role==='lid');
  ok(closing.every(p=>p.host.compId===lid.id&&p.sets.length===(p.child.compId.endsWith('left')||p.child.compId.endsWith('right')?1:2)),'閉合接合以上蓋為承接板，組數與底端相同');
  ok(Object.keys(lid.boxPanel.closures).join()==='front,back,left,right','上蓋只保存閉合接合的位置，榫槽外形由程式重算');
  const mods=six.work.modules.filter(m=>m.mount),lidMod=six.work.modules.find(m=>m.id===lid.moduleId);
  ok(mods.length===5&&lidMod.mount.to.module.endsWith('front')&&closing.every(p=>p.moduleId===lid.moduleId),'姿態上只有一個宿主（上蓋貼在前板）；4 筆閉合接合記在上蓋名下，不進姿態樹，也不重複計算');
}
{ // 3D 五金：每組一顆螺絲＋螺帽頭＋墊片＋螺母
  const hw=six.model.materialParts.filter(p=>/\/(screw|head|washer|nut)$/.test(p.partId));ok(hw.length===48,'六面盒 12 組：3D 螺絲／螺絲頭／墊片／螺母共 48 件');
}
{ // 保存、分享與複製
  const disk=storedProject({...six.work,kind:'blocks',v:1});
  ok(disk.requires.includes('tab-nut-sets-v1')&&readStoredProject(disk)!==null,'多組／上蓋作品要求 tab-nut-sets-v1（舊版讀取器會拒絕，不會少算幾組）');
  const bad=structuredClone(disk);bad.requires.push('tab-nut-sets-v2');ok(readStoredProject(bad)===null,'未知能力標記要拒絕');
  const reopened=normalizeSnapshot(decodeShareString(encodeSnapshot(disk)));
  ok(reopened&&tabNutPlans(reopened.comps,reopened.modules,reopened.params).every(p=>p.ok)&&reopened.comps.length===6,'分享字串往返後仍是 6 片、8 筆有效接合');
  const old=await checkedBox({...BOX_DEFAULTS,jointsPerEdge:1});ok(!storedProject({...old.work,kind:'blocks',v:1}).requires.includes('tab-nut-sets-v1'),'舊式每邊 1 組、無上蓋的作品不加新標記');
  const first=await planBoxChange({kind:'blocks',v:1,counter:1,params:{},comps:[],modules:[],assemblyMembers:['#root']},lidOn(BOX_DEFAULTS));
  const tpl=compositeToTemplate(first.work.comps,first.work.modules,first.work.params,first.rootModule),copy=instantiateComposite(tpl,{counter:90,place:{x:700,y:200}});
  const lidCopy=copy.comps.find(c=>c.boxPanel.role==='lid');
  ok(tabNutPlans(copy.comps,copy.modules,copy.params).every(p=>p.ok)&&Object.values(lidCopy.boxPanel.closures).every(f=>copy.comps.some(c=>c.id===f.childPart)),'複製成組合積木後重新編號，閉合接合仍指向新側板');
}
{ // 整盒接在動力桿上轉動：六片相對位置不變
  const motor={type:'bar',id:'MotorArm',moduleId:'Motor',fixedLen:true,isInput:true,physicalMotor:'1',motorType:'n20',p1:{id:'MA',type:'motor',physicalMotor:'1',x:0,y:0},p2:{id:'MB',type:'floating',x:80,y:0},lenParam:'ML',stock:{widthMm:18,thicknessMm:3,material:'unspecified'}};
  const w=six.work,root=w.comps.find(c=>c.boxPanel.role==='base');
  const src={...w,comps:[motor,...w.comps],modules:[{id:'Motor',name:'驅動桿',base:'MA',outputs:[{id:'arm',at:'MB',body:{kind:'bar',id:'MotorArm'}}],mount:null},...w.modules],params:{...w.params,ML:80}};
  const joined=buildFaceCandidate(src,{childId:root.moduleId,hostEndpoint:{moduleId:'Motor',outputId:'arm',partId:'MotorArm'},childEndpoint:{partId:root.id},selection:{hostFace:'top',childFace:'bottom',alignU:0,alignV:0,offsetU:0,offsetV:0,gap:6,quarterTurns:0}});
  ok(joined.ok,'六面盒可整組接到動力桿');let ref;
  for(const theta of [0,45,90]){
    const parts=faceCandidateModel(joined,{theta}).model.materialParts.filter(p=>joined.work.comps.some(c=>c.id===p.partId&&c.boxPanel)),pts=parts.map(p=>applyMatrix4(p.pose.matrix,{x:0,y:0,z:0})),d=pts.map(p=>Math.hypot(p.x-pts[0].x,p.y-pts[0].y,p.z-pts[0].z));
    ref||=d;assert.ok(parts.length===6&&d.every((v,i)=>Math.abs(v-ref[i])<1e-6),`θ=${theta} 六片相對位置不變`);
  }
  ok(true,'轉動 0／45／90° 時，上蓋與五片板的相對位置不變');
}
{ // 不同宿主側板：拿掉前板時上蓋改貼在後板，仍置中、同高
  for(const panels of [{lid:true,front:false,back:true,left:true,right:true},{lid:true,front:false,back:false,left:true,right:false}]){
    const r=await checkedBox({...BOX_DEFAULTS,panels}),lid=r.work.comps.find(c=>c.boxPanel.role==='lid'),part=r.model.materialParts.find(p=>p.partId===lid.id);
    const pts=part.geometry.outlines.flat().map(p=>applyMatrix4(part.pose.matrix,{...p,z:0}));
    ok(r.saveable&&Math.abs(Math.min(...pts.map(p=>p.x))+Math.max(...pts.map(p=>p.x)))<1e-6&&Math.abs(Math.min(...pts.map(p=>p.z))-53)<1e-6,`缺側板（${Object.values(panels).filter(Boolean).length-1} 面側板）時上蓋仍置中、離底板上表面 50 mm`);
  }
}
{ // 設定與提示
  ok(boxJointSummary(BOX_DEFAULTS)==='每邊組數：前後各 2、左右各 1，共 6 顆 M3'&&boxScrewCount(lidOn(BOX_DEFAULTS))===12,'預覽句與螺絲總數');
  ok(boxJointSummary({...BOX_DEFAULTS,panels:{...BOX_DEFAULTS.panels,front:false}})==='每邊組數：後 2、左右各 1，共 4 顆 M3','少一面時的預覽句');
  const many=await checkedBox({...BOX_DEFAULTS,lengthMm:400,widthMm:400,maxJointSpacingMm:30});ok(many.saveable!==true&&/6 組|上限/.test(many.reason),`超過 6 組要擋下並說明（${many.reason}）`);
  ok(normalizeBoxSettings({...BOX_DEFAULTS,jointsPerEdge:7})===null&&normalizeBoxSettings({...BOX_DEFAULTS,jointsPerEdge:1.5})===null&&normalizeBoxSettings({...BOX_DEFAULTS,jointEndMarginMm:2})===null,'組數 7、小數、過小的離角留料不接受');
}
console.log(`box-lid-closure: ${pass} passed`);
