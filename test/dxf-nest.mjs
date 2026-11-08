// 合併排版 DXF：讀檔往返、貨架排版、雷射共用邊、CNC 刀心偏移與退回。
import assert from 'node:assert/strict';
import {readDxf,partFromDxf,packRects,mergeCommonLines,offsetRing,ringSelfIntersects,buildNestedDxf,signedArea,pathLength} from '../js/blocks/dxf-nest.js';
import {exportLinksAsDxf} from '../js/blocks/exporters.js';
import {BLOCK_EXAMPLES} from '../js/blocks/examples.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {prepareScopedExport} from '../js/blocks/export-scope.js';
import {FABRICATION_DEFAULTS} from '../js/blocks/fabrication-profile.js';
const near=(a,b,t=1e-6,m='')=>assert.ok(Math.abs(a-b)<=t,`${m} ${a} != ${b}`);
const D=FABRICATION_DEFAULTS.cnc.toolDiameterMm;
// 原始文字逐對計數（0 碼圖元＋其 8 碼圖層），作為讀取器的獨立對照。
function rawCounts(text){const L=text.split('\n'),m=new Map();let type=null,inEnt=false;for(let i=0;i+1<L.length;i+=2){const c=L[i],v=L[i+1];if(c==='2'&&v==='ENTITIES')inEnt=true;if(c==='0'){type=inEnt&&!['SECTION','ENDSEC','EOF'].includes(v)?v:null;if(v==='ENDSEC')inEnt=false;}else if(c==='8'&&type){const k=`${type}@${v}`;m.set(k,(m.get(k)||0)+1);type=null;}}return m;}
const countsOf=entities=>{const m=new Map();for(const e of entities){const k=`${e.type}@${e.layer}`;m.set(k,(m.get(k)||0)+1);}return m;};
function exampleFiles(id){const e=BLOCK_EXAMPLES.find(x=>x.id===id),s=normalizeSnapshot(e.snapshot);return prepareScopedExport({...s,topo:s,fabrication:s.fabrication||structuredClone(FABRICATION_DEFAULTS),exportSettings:FABRICATION_DEFAULTS.export},{scope:'assembly'},'dxf').files;}

// 1. 讀取往返：桿、聯集桿、板、齒輪、機架（含 CUT／GEAR_CUT／FRAME_CUT 與各種孔圖層）。
const samples=[...exampleFiles('six-bar-lift'),...exampleFiles('parallel-gripper'),...exampleFiles('wiper-single'),...exampleFiles('tipping-bucket')];
const kinds=new Set();
for(const f of samples){
  const {entities}=readDxf(f.text),raw=rawCounts(f.text);
  assert.deepEqual([...countsOf(entities)].sort(),[...raw].sort(),f.name+' entity counts and layers');
  const part=partFromDxf(f);
  assert.equal(part.outer.length+part.inner.length,entities.length,f.name+' every entity kept');
  assert.ok(part.outer.every(r=>signedArea(r)>0),f.name+' outer contour CCW');
  for(const e of entities)kinds.add(e.layer);
  const circles=entities.filter(e=>e.type==='CIRCLE'),kept=part.inner.filter(e=>e.type==='CIRCLE');
  assert.deepEqual(kept.map(c=>[c.x,c.y,c.r,c.layer]),circles.map(c=>[c.x,c.y,c.r,c.layer]),f.name+' holes unchanged');
}
assert.ok(['CUT','GEAR_CUT','FRAME_CUT','HOLE'].every(k=>kinds.has(k)),'round-trip covers bar, gear and frame layers');
assert.ok(samples.some(f=>f.sourceIds.length>1),'round-trip covers a fused bar');
assert.ok(samples.some(f=>f.name==='frame.dxf'),'round-trip covers frame.dxf');
const bulge=readDxf('0\nSECTION\n2\nENTITIES\n0\nLWPOLYLINE\n8\nCUT\n90\n2\n70\n1\n10\n0\n20\n0\n42\n1\n10\n10\n20\n0\n0\nENDSEC\n0\nEOF');
assert.equal(bulge.entities[0].points[0].b,1,'bulge read');
const disk=partFromDxf({name:'disk.dxf',text:'0\nSECTION\n2\nENTITIES\n0\nLWPOLYLINE\n8\nCUT\n90\n2\n70\n1\n10\n0\n20\n0\n42\n1\n10\n10\n20\n0\n42\n1\n0\nENDSEC\n0\nEOF'});
near(Math.abs(signedArea(disk.outer[0])),Math.PI*25,0.5,'two bulges make a circle');
assert.throws(()=>readDxf('0\nSECTION\n2\nENTITIES\n0\nSPLINE\n8\nCUT\n0\nENDSEC\n0\nEOF'),/不支援/);
assert.throws(()=>partFromDxf({name:'x.dxf',text:'0\nSECTION\n2\nENTITIES\n0\nCIRCLE\n8\nHOLE\n10\n0\n20\n0\n40\n1\n0\nENDSEC\n0\nEOF'}),/「x」找不到外形/);

// 2. 排版：不重疊、在邊距內、溢出到第二張、過大零件報錯。
let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
for(const gap of [0,D]){
  const items=Array.from({length:60},(_,i)=>({name:'P'+i,w:10+Math.round(rnd()*120),h:i%3?13:8+Math.round(rnd()*60)}));
  const {placements,sheetCount}=packRects(items,{sheetW:300,sheetH:200,marginMm:5,gapMm:gap});
  assert.ok(sheetCount>=2,'overflow continues on sheet 2');
  placements.forEach((p,i)=>{
    assert.ok(p.x>=5-1e-9&&p.y>=5-1e-9&&p.x+p.w<=295+1e-9&&p.y+p.h<=195+1e-9,'inside margins');
    const it=items[i];near(p.w,p.rot?it.h:it.w);near(p.h,p.rot?it.w:it.h);
    placements.forEach((q,j)=>{if(j<=i||q.sheet!==p.sheet)return;
      const sep=p.x+p.w+gap<=q.x+1e-9||q.x+q.w+gap<=p.x+1e-9||p.y+p.h+gap<=q.y+1e-9||q.y+q.h+gap<=p.y+1e-9;
      assert.ok(sep,`no overlap ${i}/${j} gap ${gap}`);});
  });
}
const tall=packRects([{name:'Tall',w:20,h:150}],{sheetW:300,sheetH:200});assert.equal(tall.placements[0].rot,90,'long side horizontal');
assert.throws(()=>packRects([{name:'BigPlate',w:700,h:100}],{sheetW:600,sheetH:400}),/BigPlate/);

// 3. 雷射：兩支相同 8 孔桿（外形 69×13）疊放，共用長 56 的直邊只切一次。
const bar=id=>({id,type:'bar',p1:{id:id+'A',x:0,y:0},p2:{id:id+'B',x:56,y:0},holes:[8,16,24,32,40,48].map((u,k)=>({id:`${id}h${k}`,u,v:0}))});
const comps=[bar('BarA'),bar('BarB')],pts=Object.fromEntries(comps.flatMap(c=>[[c.p1.id,c.p1],[c.p2.id,c.p2]])),bars=[];
exportLinksAsDxf(comps,pts,{},FABRICATION_DEFAULTS.export,[],null,(text,name,mime,sourceIds)=>bars.push({text,name,sourceIds}));
const one=partFromDxf(bars[0]),bb=one.outer[0].reduce((b,p)=>({x0:Math.min(b.x0,p.x),x1:Math.max(b.x1,p.x),y0:Math.min(b.y0,p.y),y1:Math.max(b.y1,p.y)}),{x0:1e9,x1:-1e9,y0:1e9,y1:-1e9});
near(bb.x1-bb.x0,69);near(bb.y1-bb.y0,13);assert.equal(one.inner.filter(e=>e.type==='CIRCLE').length,8,'8 holes');
const laser=buildNestedDxf(bars,{method:'laser'}),perimeter=pathLength(one.outer[0],true);
assert.equal(laser.sheets,1);near(laser.cutBeforeMm,2*perimeter,1e-6,'before');near(laser.savedMm,56,1e-6,'saved exactly 56');
const merged=readDxf(laser.text).entities,cut=merged.filter(e=>e.layer==='CUT');
const sharedY=5+13,onShared=[];
for(const e of cut)for(let i=0;i+1<e.points.length+(e.closed?1:0);i++){const a=e.points[i],b=e.points[(i+1)%e.points.length];if(Math.abs(a.y-sharedY)<1e-6&&Math.abs(b.y-sharedY)<1e-6)onShared.push(Math.abs(b.x-a.x));}
assert.deepEqual(onShared.map(v=>Math.round(v*1e6)/1e6),[56],'one shared edge of length 56');
const holes=merged.filter(e=>e.type==='CIRCLE');assert.equal(holes.length,16,'hole count unchanged');
laser.placements.forEach((p,k)=>{const dx=p.bbox.x0-bb.x0,dy=p.bbox.y0-bb.y0;
  for(const h of one.inner.filter(e=>e.type==='CIRCLE'))assert.ok(holes.some(c=>Math.abs(c.x-h.x-dx)<1e-4&&Math.abs(c.y-h.y-dy)<1e-4&&c.r===h.r),'hole translated '+k);});
assert.ok(laser.placements.every(p=>p.rot===0),'bars stay horizontal');near(laser.placements[1].bbox.y0,laser.placements[0].bbox.y1,1e-9,'stacked touching');
assert.ok(merged.some(e=>e.type==='TEXT'&&e.layer==='LABEL'&&e.text==='BarA'),'part label');
assert.match(laser.text,/999\nLAYER CUT: outer contours/);assert.match(laser.text,/KERF: not compensated/);
assert.equal(laser.name,'機構作品-雷切-600x400.dxf');

// 4. CNC：桿外形偏移 D/2；直邊在 ±(6.5+D/2)，端弧半徑 6.5+D/2；間距 D 的兩桿共用一條刀心線。
const off=offsetRing(one.outer[0],D/2);assert.ok(off.ok);
const R=6.5+D/2,straight=off.points.filter(p=>p.x>-1e-6&&p.x<56+1e-6&&Math.abs(p.y)>R-0.01);
assert.equal(straight.length,4,'two straight tool-path edges');
assert.ok(straight.every(p=>Math.abs(Math.abs(p.y)-R)<1e-9),'straight edges at ±(6.5+D/2)');
for(const p of off.points.filter(p=>p.x>56+1e-6))assert.ok(Math.abs(Math.hypot(p.x-56,p.y)-R)<0.01,'end radius 6.5+D/2');
for(const p of off.points.filter(p=>p.x<-1e-6))assert.ok(Math.abs(Math.hypot(p.x,p.y)-R)<0.01,'start radius');
assert.ok(!ringSelfIntersects(off.points));
const cnc=buildNestedDxf(bars,{method:'cnc',toolDiameterMm:D});
near(cnc.savedMm,56,1e-6,'CNC shared tool path');near(cnc.placements[1].bbox.y0-cnc.placements[0].bbox.y1,D,1e-9,'gap D');
const toolY=cnc.placements[0].bbox.y1+D/2,cncEnt=readDxf(cnc.text).entities;
const onTool=cncEnt.filter(e=>e.layer==='CNC_ONLINE').flatMap(e=>e.points.map((a,i)=>[a,e.points[(i+1)%e.points.length],i+1<e.points.length||e.closed])).filter(([a,b,ok])=>ok&&Math.abs(a.y-toolY)<1e-6&&Math.abs(b.y-toolY)<1e-6);
assert.equal(onTool.length,1,'one tool line between the two bars');near(Math.abs(onTool[0][1].x-onTool[0][0].x),56,1e-6);
assert.equal(cncEnt.filter(e=>e.layer==='PART_REF').length,2,'true outlines kept as reference');
assert.equal(cncEnt.filter(e=>e.type==='CIRCLE').length,16);
assert.match(cnc.text,/CNC_ONLINE: tool-centre path/);
// 凹角：L 形板的刀心路徑在凹角取交點、不切入零件。
const L=[{x:0,y:0},{x:40,y:0},{x:40,y:10},{x:10,y:10},{x:10,y:30},{x:0,y:30}];
const lo=offsetRing(L,D/2);assert.ok(lo.ok);assert.ok(lo.points.some(p=>Math.abs(p.x-(10+D/2))<1e-9&&Math.abs(p.y-(10+D/2))<1e-9),'concave miter point');
// 窄於刀具的缺口：退回 CNC_OUTSIDE，並加大間距。
const slot=[{x:0,y:0},{x:40,y:0},{x:40,y:20},{x:20.5,y:20},{x:20.5,y:8},{x:19.5,y:8},{x:19.5,y:20},{x:0,y:20}];
assert.equal(offsetRing(slot,D/2).ok,false,'narrow slot cannot be pre-offset');
const dxfOf=(points,layer='FRAME_CUT')=>['0','SECTION','2','ENTITIES','0','LWPOLYLINE','8',layer,'90',String(points.length),'70','1',...points.flatMap(p=>['10',String(p.x),'20',String(p.y)]),'0','ENDSEC','0','EOF'].join('\n');
const fb=buildNestedDxf([{name:'Comb.dxf',text:dxfOf(slot)},...bars],{method:'cnc',toolDiameterMm:D});
assert.deepEqual(fb.fallback.map(f=>f.name),['Comb']);
const fbEnt=readDxf(fb.text).entities;assert.equal(fbEnt.filter(e=>e.layer==='CNC_OUTSIDE').length,1);
const comb=fb.placements.find(p=>p.name==='Comb');
for(const p of fb.placements.filter(p=>p!==comb)){const b=comb.bbox,q=p.bbox,clear=Math.max(q.x0-b.x1,b.x0-q.x1,q.y0-b.y1,b.y0-q.y1);assert.ok(clear>=1.5*D-1e-9,'fallback part keeps extra spacing');}
// 板厚不同：分開排板。
const thin={name:'Thin.dxf',text:'999\nSTOCK material=unspecified widthMm=13 thicknessMm=2\n'+bars[0].text.split('\n').slice(2).join('\n')};
const mixed=buildNestedDxf([bars[0],thin],{method:'laser'});assert.equal(mixed.sheets,2);assert.deepEqual(mixed.thicknesses,[2,3]);
assert.throws(()=>buildNestedDxf(bars,{method:'laser',sheetW:50,sheetH:50}),/BarA/);
assert.throws(()=>buildNestedDxf(bars,{method:'laser',sheetW:5,sheetH:400}),/20–5000/);
console.log('PASS dxf-nest: reader round-trip, shelf packing, laser common line 56 mm, CNC tool-centre offset/shared line/fallback, thickness groups');

// Review regressions: stocks cannot share a sheet, source manufacturing notes must survive.
const plywood={...thin,name:'Plywood.dxf',text:thin.text.replace('material=unspecified','material=plywood')};
const acrylic={...thin,name:'Acrylic.dxf',text:thin.text.replace('material=unspecified','material=acrylic')};
const stockSplit=buildNestedDxf([plywood,acrylic],{method:'laser'});
assert.equal(stockSplit.sheets,2);assert.deepEqual(stockSplit.materials,['plywood','acrylic']);assert.match(stockSplit.text,/material=plywood/);assert.match(stockSplit.text,/material=acrylic/);
const concept={name:'Concept.dxf',text:'999\nCONCEPT ONLY - HARDWARE CHECK REQUIRED; thickness 3 mm; qty 2\n'+dxfOf(L)};
const conceptNest=buildNestedDxf([concept]);assert.equal(conceptNest.parts.length,2);assert.match(conceptNest.text,/SOURCE Concept.dxf: CONCEPT ONLY - HARDWARE CHECK REQUIRED/);
assert.throws(()=>buildNestedDxf(bars,{method:'cnc',toolDiameterMm:Infinity}),/刀具直徑無效/);
const rect=[{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}],other=rect.map(p=>({x:p.x+11,y:p.y}));
const islandText=dxfOf(rect).replace('0\nENDSEC\n0\nEOF',dxfOf(other).split('2\nENTITIES\n')[1]);
const islands=buildNestedDxf([{name:'Islands.dxf',text:islandText}],{method:'cnc',toolDiameterMm:3});
assert.equal(islands.fallback.length,1);assert.match(islands.fallback[0].reason,/分離輪廓/);
