// 標準孔格件只開「用到的孔」：每個內建範例中，真正連接的點／孔都仍輸出，未使用的格孔不輸出；
// 「全部格孔」切換、保存往返、畫布隱藏與連接後出現都走同一個 used-holes 判定。
import assert from 'node:assert/strict';
import {BLOCK_EXAMPLES,loadUnitStarts} from '../js/blocks/examples.js';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
import {buildPartGeometryCatalog} from '../js/blocks/part-geometry.js';
import {prepareScopedExport} from '../js/blocks/export-scope.js';
import {readDxf} from '../js/blocks/dxf-nest.js';
import {buildPlan} from '../js/blocks/build-plan.js';
import {FABRICATION_DEFAULTS} from '../js/blocks/fabrication-profile.js';
import {machinedComps,undrilledIds,isHoleUsed} from '../js/blocks/used-holes.js';
import {makeStandardBlank} from '../js/blocks/standard-blank.js';
import {exportLinksAsDxf} from '../js/blocks/exporters.js';
import {pointCoords} from '../js/blocks/model.js';
import {drillCounts,setStandardDrill} from '../js/blocks/standard-drill-ui.js';
import {check,report} from './_harness.mjs';

await loadUnitStarts();
const K=['p1','p2','p3'],OWN=['id','p1','p2','p3','holes','standardBlank'];
const local=(a,b)=>{const t=Math.atan2(b.y-a.y,b.x-a.x),c=Math.cos(t),s=Math.sin(t);return p=>({x:(p.x-a.x)*c+(p.y-a.y)*s,y:-(p.x-a.x)*s+(p.y-a.y)*c});};
const inPoly=(p,r)=>{let h=false;for(let i=0,j=r.length-1;i<r.length;j=i++)if((r[i].y>p.y)!==(r[j].y>p.y)&&p.x<(r[j].x-r[i].x)*(p.y-r[i].y)/(r[j].y-r[i].y)+r[i].x)h=!h;return h;};
// 獨立參考：以 JSON 字串搜尋其他零件／模組／本件非孔欄位，不共用 used-holes 的走訪程式。
const connected=(s,c,p)=>{
  const others=JSON.stringify([s.comps.filter(o=>o!==c),s.modules || []]),own=JSON.stringify(Object.fromEntries(Object.entries(c).filter(([k])=>!OWN.includes(k)))),q=JSON.stringify(p.id);
  return ['fixed','motor','linear'].includes(p.type)||!!p.physicalMotor||others.includes(q)||own.includes(q);
};
const rows=[];let examples=0,connectedChecked=0;
for(const e of BLOCK_EXAMPLES){
  const s=normalizeSnapshot(e.snapshot);if(!s?.comps.some(c=>c.standardBlank))continue;examples++;
  const fabrication=s.fabrication || structuredClone(FABRICATION_DEFAULTS);
  const cat=buildPartGeometryCatalog({comps:s.comps,modules:s.modules,params:s.params,fabrication});
  const files=prepareScopedExport({...s,topo:s,fabrication,exportSettings:FABRICATION_DEFAULTS.export},{scope:'design'},'dxf').files;
  for(const c of s.comps.filter(c=>c.standardBlank)){
    const part=cat.parts[c.id];assert.ok(part,`${e.id}/${c.id} has fabrication geometry`);
    const home=cat.homePoints,move=local(home[c.p1.id],home[c.p2.id]);
    const points=[...K.filter(k=>c[k]).map(k=>c[k]),...c.holes || []],used=points.filter(p=>connected(s,c,p));
    for(const p of used){
      const at=move(home[p.id]);connectedChecked++;
      assert.ok(part.holes.some(h=>Math.hypot(h.x-at.x,h.y-at.y)<.05)||part.cutouts.some(k=>inPoly(at,k.points)),`${e.id}/${c.id}: connected ${p.id} must stay drilled`);
    }
    const lattice=part.holes.filter(h=>Math.abs(h.r-1.6)<1e-6&&(!h.layer||h.layer==='HOLE'));
    for(const h of lattice)assert.ok(used.some(p=>{const at=move(home[p.id]);return Math.hypot(h.x-at.x,h.y-at.y)<.05;}),`${e.id}/${c.id}: exported grid hole at ${h.x},${h.y} is connected`);
    const file=files.find(f=>f.sourceIds.includes(c.id));assert.ok(file,`${e.id}/${c.id} DXF file`);
    const circles=readDxf(file.text).entities.filter(x=>x.type==='CIRCLE').length;
    assert.equal(circles,part.holes.length,`${e.id}/${c.id}: DXF and 3D/STEP catalog drill the same holes`);
    rows.push(`${e.id}/${c.id}: ${points.length} 格位 → ${part.holes.length} 孔`);
  }
  // 製作包零件清單使用同一判定（孔圖層計數）。
  const plan=buildPlan({comps:s.comps,modules:s.modules,params:s.params,exportSettings:{...fabrication.export,drive:fabrication.drive},fabrication});
  for(const c of s.comps.filter(c=>c.standardBlank)){const p=plan.parts.find(p=>p.compId===c.id);if(p?.holeLayers)assert.equal(Object.values(p.holeLayers).reduce((a,b)=>a+b,0),cat.parts[c.id].holes.length,`${e.id}/${c.id} build plan hole count`);}
}
check('每個含標準件的內建範例：連接點都輸出、輸出的格孔都有連接',examples>=16&&connectedChecked>0,`${examples} 例、${connectedChecked} 個連接點`);
console.log(rows.join('\n'));

// 一般桿件／板件不變；已加工的副本不再重算。
{const s=normalizeSnapshot(BLOCK_EXAMPLES.find(e=>e.id==='servo-plate-fourbar').snapshot),m=machinedComps(s.comps,s.modules,s.params);
 check('非標準零件保持原物件',s.comps.every((c,i)=>c.standardBlank||m[i]===c));
 check('加工檢視可重複套用',machinedComps(m).every((c,i)=>c===m[i]));
 check('作品本身不被修改',s.comps.every(c=>!c.drilled&&!c.undrilled));}

// 畫布：未用孔淡化（data-unused）；連上後變實心，拆掉又淡化。
{const made=makeStandardBlank({kind:'plate',columns:8,rows:5,origin:{x:0,y:0}}),plate=made.comp,params={...made.params};
 const hole=plate.holes.find(h=>h.u===16&&h.v===8),bar={id:'Bar1',type:'bar',p1:{id:'Q1',type:'fixed',x:-40,y:8},p2:{id:'Q2',type:'floating',x:16,y:8},lenParam:'L1'};params.L1=56;
 let hidden=undrilledIds([plate,bar],[],params);
 check('未連接的板：所有格孔與板角都淡化',hidden.size===40&&hidden.has(hole.id)&&hidden.has(plate.p1.id));
 const joined={...bar,p2:{...bar.p2,id:hole.id}};hidden=undrilledIds([plate,joined],[],params);
 check('桿端放到淡化格孔（同一 id）後該孔變實心',!hidden.has(hole.id)&&hidden.size===39);
 const files=[];exportLinksAsDxf([plate,joined],pointCoords([plate,joined]),params,{},[],null,(text,name)=>files.push({text,name}));
 const circles=readDxf(files.find(f=>f.name.startsWith(plate.id)).text).entities.filter(x=>x.type==='CIRCLE');
 check('匯出只有那一個連接孔',circles.length===1&&Math.abs(circles[0].x??0)>=0);
 check('拆開後又淡化',undrilledIds([plate,bar],[],params).has(hole.id));
 check('孤立格孔不算連接（軌跡點／負載在作品頂層，不列入判定）',!isHoleUsed(plate,hole,[plate],{modules:[]}));
 // 「全部格孔」：只存非預設值、保存往返、畫布全顯示、輸出全部格位。
 const all=structuredClone(plate);setStandardDrill(all,'all');
 check('切到全部格孔：畫布全實心、輸出全開',undrilledIds([all],[],params).size===0&&drillCounts({comps:[all],modules:[],topo:{params}},all).drilled===40);
 check('預設計數：只開用到的孔',drillCounts({comps:[plate,joined],modules:[],topo:{params}},plate).drilled===1);
 const snap=c=>normalizeSnapshot(JSON.parse(JSON.stringify(toSnapshot([c],{params},1)))).comps[0];
 check('保存往返保留 drill=all',snap(all).standardBlank.drill==='all');
 check('舊檔沒有欄位＝預設只開用到的孔',!('drill' in snap(plate).standardBlank));
 const odd=structuredClone(plate);odd.standardBlank.drill='some';check('未知值不保存',!('drill' in snap(odd).standardBlank));
 setStandardDrill(all,'used');check('切回預設會刪除欄位',!('drill' in all.standardBlank));}

// 針筒接在標準桿的格孔（以 u,v 參照、不共用 id）也算連接。
{const made=makeStandardBlank({kind:'bar',columns:6,origin:{x:0,y:0}}),bar=made.comp,h=bar.holes.find(h=>h.u===16);
 const syringe={id:'Syr',type:'syringe',a:{componentId:bar.id,u:16,v:0},b:{componentId:'X',u:0,v:0}};
 check('針筒接合點的格孔保留',isHoleUsed(bar,h,[bar,syringe],{params:made.params})&&!isHoleUsed(bar,bar.holes.find(h=>h.u===24),[bar,syringe],{params:made.params}));}
report('used-holes');
