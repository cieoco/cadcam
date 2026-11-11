// 範例積木化（2026-11-09）：內建範例中可對 8 mm 孔格的一般桿改為標準桿後，只多畫淡化格孔。
// 舊值凍結自 main 5976b64（test/fixtures/blockify-examples-before.json；在舊樹以 --write 產生）。
// 逐例比對：多個輸入角／針筒行程的求解點、加工檔、質量、每件已加工孔（零件局部座標）與外形面積（1 %）、
// 所有舊零件／接點／孔 ID 仍在；可轉而未轉的零件必須在 LEFT 表列出原因。
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BLOCK_EXAMPLES,loadUnitStarts} from '../js/blocks/examples.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {compileAssembly,solveAssembly} from '../js/blocks/assembly.js';
import {solveSyringe,planSyringeStroke} from '../js/blocks/syringe-operations.js';
import {prepareScopedExport} from '../js/blocks/export-scope.js';
import {buildPartGeometryCatalog} from '../js/blocks/part-geometry.js';
import {assemblyMassModel} from '../js/blocks/part-mass.js';
import {FABRICATION_DEFAULTS} from '../js/blocks/fabrication-profile.js';

const FIXTURE=new URL('./fixtures/blockify-examples-before.json',import.meta.url),WRITE=process.argv.includes('--write');
// 符合尺寸、但轉成標準桿會改變加工結果或另有作者流程的一般桿（其餘不轉的類別見 reason()）。
export const LEFT={
 'fourbar-missing-coupler:Link3':'free-end',          // 浮桿未接，D 孔目前只靠一般桿輸出；轉標準桿會停鑽
 'hydraulic-h01-practice:H1Coupler':'free-end',       // 針筒已移除，H1P 端孔沒有其他引用
 'hydraulic-h02-practice:H2Coupler':'free-end',
 'hydraulic-h03-practice:H3Upper':'practice-mirror'  // 練習版沿完成版同源零件；完成版 H3Upper 承接針筒推桿，不轉
};
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0,16);
const r6=v=>typeof v==='number'?Math.round(v*1e4)/1e4:Array.isArray(v)?v.map(r6):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,r6(x)])):v;
const area=ring=>Math.abs(ring.reduce((s,p,i)=>{const q=ring[(i+1)%ring.length];return s+p.x*q.y-q.x*p.y;},0))/2;
const plainBar=c=>c.type==='bar'&&!c.standardBlank&&!c.isInput&&!c.shape&&!c.barFusion&&!c.barFusionRoot&&!c.boxPanel;
function reason(e,c,s){
 if(c.type==='triangle')return c.standardBlank?'already-standard':'plate-outline';
 if(c.type!=='bar')return null;
 if(c.standardBlank)return 'standard';
 if(e.id==='jansen-leg')return 'jansen';
 if(c.isInput)return 'motor-input';
 if(c.barFusion||c.barFusionRoot)return 'fusion';
 if(c.shape||c.boxPanel)return 'shaped';
 if(c.motorMountPoint||s.comps.some(d=>d.motorCarrier===c.id||d.motorMount?.frameBody===c.id))return 'motor-host';
 if(s.comps.some(d=>[d.a?.componentId,d.b?.componentId].includes(c.id)))return 'syringe-host';
 if((c.stock?.widthMm??13)!==13)return 'width';
 if([c.p1,c.p2,...(c.holes||[])].filter(p=>['fixed','motor','linear'].includes(p.type)).length>1)return 'frame-bar';
 if(s.params[c.lenParam]%8)return 'off-8';
 if(e.id==='competition-fourbar-lift')return 'module-template'; // 模組庫「四連桿升降臂」以參數把臂長放大到 140 mm，格孔會失準
 return LEFT[`${e.id}:${c.id}`]||'UNLISTED';
}
function measure(e){
 const s=normalizeSnapshot(structuredClone(e.snapshot)),P=s.params,comps=s.comps,modules=s.modules||[];
 const assembly=compileAssembly(comps,modules,{params:P}),motors=[...new Set(comps.flatMap(c=>[c.physicalMotor,c.p1?.physicalMotor,c.p2?.physicalMotor]).filter(Boolean).map(String))];
 const poses=[];
 for(const a of [-30,0,15,45,90,135,180,270]){const sol=solveAssembly(assembly,{thetaDeg:a,motorAngles:Object.fromEntries(motors.map(m=>[m,a]))});poses.push(sol?.isValid===false?null:sol?.points||null);}
 for(const sy of comps.filter(c=>c.type==='syringe')){const init=solveSyringe(comps,P);for(const k of [0,.5,1]){const r=init.ok&&planSyringeStroke(comps,P,sy.id,sy.spec.stroke*k,init.points);poses.push(r&&r.ok?r.points:null);}}
 let exportText;try{const src={...s,topo:s,fabrication:s.fabrication||structuredClone(FABRICATION_DEFAULTS),exportSettings:FABRICATION_DEFAULTS.export};exportText=prepareScopedExport(src,{scope:'assembly'},'dxf').files.map(f=>[f.name,f.text]).sort();}catch(err){exportText=String(err.message);}
 let catalog={parts:{}},mass=null;try{catalog=buildPartGeometryCatalog({comps,modules,params:P,fabrication:s.fabrication||FABRICATION_DEFAULTS});}catch(err){catalog={parts:{},error:String(err.message)};}
 try{mass=assemblyMassModel(comps,poses[1]||{},P,{fabrication:s.fabrication}).items.map(i=>[i.id,i.massG]);}catch(err){mass=String(err.message);}
 const parts={};for(const c of comps.filter(c=>c.type==='bar'&&(plainBar(c)||c.standardBlank?.kind==='bar'&&!c.isInput))){const g=catalog.parts[c.id];parts[c.id]={std:!!c.standardBlank,holes:(c.holes||[]).map(h=>[h.id,h.u,h.v]),cut:g?r6(g.holes.map(h=>[h.x,h.y,h.r])).sort((a,b)=>a[0]-b[0]||a[1]-b[1]):null,area:g?r6(g.outlines.reduce((t,o)=>t+area(o),0)):null};}
 return {s,poses,exportText,mass,catalogError:catalog.error||null,parts};
}
// Lattice holes added by the conversion are the only new ids; they are dropped before comparing.
function oldView(m,old){
 const added=new Set();for(const [id,p] of Object.entries(m.parts))if(p.std&&old.parts[id]&&!old.parts[id].std)for(const [h] of p.holes)if(!old.parts[id].holes.some(o=>o[0]===h))added.add(h);
 const strip=pts=>pts&&Object.fromEntries(Object.entries(pts).filter(([k])=>!added.has(k)).sort());
 const ids=m.s.comps.flatMap(c=>[c.id,...['p1','p2','p3'].map(k=>c[k]?.id),...(c.holes||[]).map(h=>h.id),...(c.standardBlank?.mountHoles||[]).map(h=>h.id)]).filter(id=>id&&!added.has(id)).sort();
 return {ids:sha(ids),poses:sha(r6(m.poses.map(strip))),export:sha(m.exportText),mass:sha(r6(m.mass)),catalogError:m.catalogError};
}
await loadUnitStarts();
if(WRITE){
 const out={source:'main 5976b64',examples:{}};
 for(const e of BLOCK_EXAMPLES){const m=measure(e),parts=Object.fromEntries(Object.entries(m.parts).filter(([,p])=>!p.std));out.examples[e.id]={...oldView(m,{parts}),snapshot:sha(e.snapshot),parts};}
 writeFileSync(FIXTURE,JSON.stringify(out)+'\n');console.log('fixture written',Object.keys(out.examples).length);process.exit(0);
}
// 2026-11-10: approved rounded standard outlines change export and mass, not IDs/poses/holes.
const ROUND=new URL('./fixtures/blockify-rounded-export.json',import.meta.url),writeRound=process.argv.includes('--write-rounded'),rounded=writeRound?{}:JSON.parse(readFileSync(ROUND,'utf8'));
const before=JSON.parse(readFileSync(FIXTURE,'utf8')).examples,summary={examples:0,parts:0},left={};
// The adjustment case and the bell-crank example were added after the frozen conversion baseline.
// Its geometry/export coverage lives in used-holes and the syringe edit tests.
const baselineExamples=BLOCK_EXAMPLES.filter(e=>!['adjustment-repair','bell-crank-gripper'].includes(e.id));
assert.deepEqual(baselineExamples.map(e=>e.id).sort(),Object.keys(before).sort(),'same baseline example catalog');
for(const e of baselineExamples){
 const old=before[e.id],m=measure(e),converted=Object.keys(m.parts).filter(id=>m.parts[id].std&&old.parts[id]);
 for(const c of m.s.comps){const r=reason(e,c,m.s);if(!r||converted.includes(c.id))continue;assert.notEqual(r,'UNLISTED',`${e.id}:${c.id} could be a standard bar but has no listed reason`);(left[r]||=new Set).add(`${e.id}:${c.id}`);}
 if(!converted.length){assert.equal(sha(e.snapshot),old.snapshot,e.id+' untouched');continue;}
 summary.examples++;summary.parts+=converted.length;
 const now=oldView(m,old);
 for(const k of ['ids','poses','catalogError'])assert.equal(now[k],old[k],`${e.id} ${k} unchanged`);
 if(writeRound)rounded[e.id]={export:now.export,mass:now.mass};else for(const k of ['export','mass'])assert.equal(now[k],rounded[e.id][k],`${e.id} rounded ${k}`);
 for(const id of converted){
  const a=old.parts[id],b=m.parts[id];
  for(const [hid,u,v] of a.holes)assert.ok(b.holes.some(h=>h[0]===hid&&h[1]===u&&h[2]===v),`${e.id}:${id} keeps hole ${hid} at (${u},${v})`);
  assert.deepEqual(b.cut,a.cut,`${e.id}:${id} drilled holes (part-local)`);
  // Capsule ends (r=6.5) become a bounding-box-preserving rectangle with r=3 corners.
  // Allow 2 mm² for polygon arc sampling in both old and new contours.
  const expectedDelta=(4-Math.PI)*(6.5**2-3**2);
  assert.ok(Math.abs(b.area-a.area-expectedDelta)<2,`${e.id}:${id} rounded outline area delta ${b.area-a.area}`);
  const L=m.s.params[m.s.comps.find(c=>c.id===id).lenParam];assert.equal(b.holes.length,L/8-1,`${e.id}:${id} full lattice`);
 }
}
if(writeRound)writeFileSync(ROUND,JSON.stringify(rounded,null,2)+'\n');
console.log('blockify-examples:',JSON.stringify(summary),Object.fromEntries(Object.entries(left).map(([k,v])=>[k,v.size])));
console.log('PASS blockify-examples');
