// 合併排版端到端：內建範例全件收錄、不重疊；逐件輸出與 main 相同；匯出對話框（假 DOM）三種輸出方式。
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {BLOCK_EXAMPLES} from '../js/blocks/examples.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {prepareScopedExport} from '../js/blocks/export-scope.js';
import {FABRICATION_DEFAULTS} from '../js/blocks/fabrication-profile.js';
import {buildNestedDxf,readDxf,partFromDxf,nestBaseName} from '../js/blocks/dxf-nest.js';
import {hydraulicSnapshot} from './fixtures/hinged-syringe.mjs';
const sourceOf=id=>{const e=BLOCK_EXAMPLES.find(x=>x.id===id),s=normalizeSnapshot(e.snapshot);return {...s,topo:s,fabrication:s.fabrication||structuredClone(FABRICATION_DEFAULTS),exportSettings:FABRICATION_DEFAULTS.export};};
const hash=files=>createHash('sha256').update(JSON.stringify(files.map(f=>[f.name,f.text,f.sourceIds,f.mime]))).digest('hex');
const hydraulic=()=>{const y=structuredClone(hydraulicSnapshot);y.topo={params:y.params};y.modules ||= [];return y;};

// 1. 逐件輸出不變：雜湊取自 main 892ba48 的同一呼叫（逐件匯出器有意修改時才更新）。
const golden={'six-bar-lift':'e3d927a2a6e129e2d6a906eade5d9683da3957b753bf3411e687731c2267d4c9','parallel-gripper':'d7e50816ab6f083c361a3c540b1860b59985cbd1555d07d6fbbdd684a7b40af0',
  'tipping-bucket':'97cfab9c80e5fa5ae16d15727a3e5d6e4961ba122ec8d37fc0c446a93559a522','iq-linq-lift':'89ac27a478dcfba1c5f901d9d815157d112705998185d3bb9d5e2133f78e55ab'};
for(const [id,h] of Object.entries(golden))assert.equal(hash(prepareScopedExport(sourceOf(id),{scope:'assembly'},'dxf').files),h,id+' per-part DXF unchanged');
assert.equal(hash(prepareScopedExport(hydraulic(),{scope:'design'},'dxf').files),'8a4446736a79fd33413a145f51c9f3680cc52cd4233994a7ab7c3bfd02701326','syringe per-part DXF unchanged');

// 2. 端到端：多個內建範例＋液壓座板（數量 2），雷射與 CNC 都收錄每一件、孔數不變、互不重疊且在板材內。
const cases=[...['six-bar-lift','parallel-gripper','tipping-bucket','iq-linq-lift','jansen-leg','assembly-lift-gripper','hydraulic-h03-practice','gear-gripper','iq-wheel-grabber','tab-nut-m3'].map(id=>[id,sourceOf(id),'assembly']),['hydraulic-fixture',hydraulic(),'design']];
const stats={};
for(const [id,source,scope] of cases) {
  const prepared=prepareScopedExport(source,{scope},'dxf');
  const parts=prepared.files.map(partFromDxf),copies=parts.reduce((s,p)=>s+p.quantity,0);
  for(const method of ['laser','cnc']) {
    const n=buildNestedDxf(prepared.files,{method,baseName:nestBaseName(source,{scope})});
    assert.ok(!/NaN|Infinity/.test(n.text),id+' finite');
    assert.equal(n.parts.length,copies,id+' every part (with quantity)');
    for(const f of prepared.files)assert.ok(n.text.includes(` source=${f.name}`),`${id} contains ${f.name}`);
    const {entities}=readDxf(n.text),count=t=>entities.filter(t).length;
    assert.equal(count(e=>e.type==='CIRCLE'),parts.reduce((s,p)=>s+p.quantity*p.inner.filter(e=>e.type==='CIRCLE').length,0),id+' holes kept');
    assert.equal(count(e=>e.layer==='SHEET'),n.sheets,id+' one border per sheet');
    const W=600,H=400;
    n.placements.forEach((p,i)=>{
      const x0=p.sheet*(W+30);
      assert.ok(p.bbox.x0>=x0+n.marginMm-1e-6&&p.bbox.x1<=x0+W-n.marginMm+1e-6&&p.bbox.y0>=n.marginMm-1e-6&&p.bbox.y1<=H-n.marginMm+1e-6,`${id} ${p.name} inside sheet`);
      n.placements.forEach((q,j)=>{if(j<=i||q.sheet!==p.sheet)return;const g=n.gapMm-1e-6;
        assert.ok(p.bbox.x1+g<=q.bbox.x0||q.bbox.x1+g<=p.bbox.x0||p.bbox.y1+g<=q.bbox.y0||q.bbox.y1+g<=p.bbox.y0,`${id} ${p.name}/${q.name} no overlap`);});
    });
    assert.ok(n.cutAfterMm<=n.cutBeforeMm+1e-9,id+' merge never adds length');
    assert.equal(count(e=>e.layer===(method==='cnc'?'CNC_ONLINE':'CUT'))>0,true);
    if(method==='cnc')assert.equal(count(e=>['PART_REF','CNC_OUTSIDE'].includes(e.layer)),parts.reduce((s,p)=>s+p.quantity*p.outer.length,0),id+' reference outlines');
    stats[`${id}.${method}`]=n;
  }
}
const six=stats['six-bar-lift.laser'],sixCnc=stats['six-bar-lift.cnc'];
assert.equal(six.sheets,1);assert.equal(six.parts.length,7);assert.ok(six.savedMm>200,'six-bar shares long edges');
assert.ok(sixCnc.savedMm>200&&sixCnc.fallback.length===0,'six-bar CNC paths all offset');
assert.ok(stats['parallel-gripper.cnc'].fallback.some(f=>/Gear/.test(f.name)),'gear tooth gaps narrower than D fall back');
assert.equal(stats['hydraulic-h03-practice.laser'].thicknesses.length,2,'mixed thickness on separate sheets');
assert.ok(stats['hydraulic-fixture.laser'].parts.includes('HFrame (2/2)'),'syringe quantity copies');
const small=buildNestedDxf(prepareScopedExport(sourceOf('jansen-leg'),{scope:'assembly'},'dxf').files,{method:'laser',sheetW:200,sheetH:120});
assert.ok(small.sheets>1&&(small.text.match(/\nSHEET\n/g)||[]).length===small.sheets,'overflow continues in the same file');

// 3. 對話框（假 DOM）：輸出方式、板材尺寸、所選零件停用合併、下載單一合併檔。
class El{constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.style={};this.attrs={};this.textContent='';this.hidden=false;this.disabled=false;this._value='';this.listeners={};}
  append(...n){for(const c of n){this.children.push(c);c.parent=this;}} appendChild(n){this.append(n);return n;} replaceChildren(...n){this.children=[];this.append(...n);}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);}
  setAttribute(k,v){this.attrs[k]=String(v);} getAttribute(k){return this.attrs[k]??null;} addEventListener(t,f){(this.listeners[t]||=[]).push(f);}
  showModal(){this.open=true;} close(){this.open=false;} focus(){} click(){if(this.tagName==='A')downloaded.push(this.download);else this.onclick?.();}
  get options(){return this.children.filter(c=>c.tagName==='OPTION');}
  get selectedIndex(){const i=this.options.findIndex(o=>o._sel);return i<0?0:i;}
  get value(){if(this.tagName!=='SELECT')return this._value;const o=this.options[this.selectedIndex];return o?o._value:'';}
  set value(v){if(this.tagName==='SELECT')this.options.forEach(o=>o._sel=o._value===String(v));else this._value=String(v);}}
const downloaded=[],all=el=>[el,...el.children.flatMap(all)],text=el=>all(el).map(e=>e.textContent).join('\n');
globalThis.document={createElement:t=>new El(t),body:new El('body')};
globalThis.URL.createObjectURL=()=>'blob:test';globalThis.URL.revokeObjectURL=()=>{};
const {openScopedExport}=await import('../js/blocks/export-dialog.js');
const src=sourceOf('six-bar-lift');
openScopedExport({format:'dxf',readSource:()=>src,readOptions:()=>({mode:'assembly',focus:'#root',selectedId:null}),notify:()=>{}});
const dialog=document.body.children.at(-1),by=label=>all(dialog).find(e=>e.attrs['aria-label']===label);
const method=by('輸出方式'),scope=by('匯出範圍'),w=by('板材長（mm）'),h=by('板材寬（mm）'),result=all(dialog).find(e=>e.attrs['aria-live']==='polite');
assert.deepEqual(method.options.map(o=>o.textContent),['每個零件一份','合併一份（雷射切割）','合併一份（CNC 銑削）']);
assert.equal(method.value,'parts');assert.equal(by('板材尺寸').style.display,'none');assert.equal(all(by('選擇輸出板件')).filter(e=>e.type==='checkbox').length,7,'per-part list unchanged');
method.value='laser';method.onchange();
assert.equal(by('板材尺寸').style.display,'flex');assert.equal(w.value,'600');assert.equal(h.value,'400');
assert.deepEqual(by('合併檔').children.map(c=>c.textContent),['機構作品-雷切-600x400.dxf']);
assert.equal(by('合併檔內的零件').children.length,7);
assert.match(text(result),/共 1 張板材/);assert.match(text(result),/共用邊省下 224 mm 切割路徑/);assert.match(text(result),/kerf/);
w.value='160';h.value='100';h.oninput();assert.match(text(result),/共 [2-9] 張板材/,'smaller sheet needs more sheets');assert.match(text(result),/160x100/);
w.value='60';w.oninput();assert.match(text(result),/尚未匯出：零件「SixDrive」約 141×13 mm，超過板材可用範圍/,'oversized part named');
w.value='600';h.value='400';w.oninput();method.value='cnc';method.onchange();
assert.deepEqual(by('合併檔').children.map(c=>c.textContent),['機構作品-CNC-600x400.dxf']);assert.match(text(result),/CNC_ONLINE/);assert.match(text(result),/D = 3.175 mm/);
scope.value='selected';scope.onchange();
assert.equal(method.value,'parts','selected scope falls back to per-part');assert.ok(method.options.slice(1).every(o=>o.disabled),'merged disabled for selected');
scope.value='assembly';scope.onchange();assert.ok(method.options.every(o=>!o.disabled));
method.value='laser';method.onchange();
const confirm=all(dialog).find(e=>e.tagName==='BUTTON'&&e.textContent==='確認下載');confirm.click();
assert.deepEqual(downloaded,['機構作品-雷切-600x400.dxf'],'one merged file downloaded');assert.ok(method.disabled&&w.disabled);
console.log('PASS dxf-nest-export:',['six-bar-lift.laser','six-bar-lift.cnc'].map(k=>`${k} sheets=${stats[k].sheets} cut ${stats[k].cutBeforeMm.toFixed(1)}→${stats[k].cutAfterMm.toFixed(1)}`).join('; '),'; per-part parity, dialog');
// Hydraulic manufacturing warnings remain visible in both nested methods, not just notices.
const hs=hydraulic(),hw=prepareScopedExport(hs,{scope:'design'},'dxf').warnings;
assert.ok(hw.length);
openScopedExport({format:'dxf',readSource:()=>hs,readOptions:()=>({mode:'design',focus:'#root'}),notify:()=>{}});
const hd=document.body.children.at(-1),hm=all(hd).find(e=>e.attrs['aria-label']==='輸出方式');
for(const value of ['laser','cnc']){hm.value=value;hm.onchange();for(const warning of hw)assert.ok(text(hd).includes(warning),value+' preserves manufacturing warning');}
// Current main's TT direct shaft keeps its non-circular opening in both nesting modes.
const {MOTOR_PLATE_EXAMPLES}=await import('../js/blocks/motor-plate-examples.js');
const {planActuatorPlateHoles}=await import('../js/blocks/actuator-plate-holes.js');
const tt=normalizeSnapshot(MOTOR_PLATE_EXAMPLES[0].snapshot);tt.comps.find(c=>c.isInput).ttOutput='shaft';
Object.assign(tt.fabrication.export,{ttShaftFlatDiameterMm:6.2,ttShaftFlatThicknessMm:4.1});
const tp=planActuatorPlateHoles(tt);assert.ok(tp.ok);tt.comps=tp.comps;
const tf=prepareScopedExport({...tt,topo:tt,exportSettings:tt.fabrication.export},{scope:'assembly'},'dxf').files;
const originalFlat=tf.flatMap(f=>readDxf(f.text).entities).find(e=>e.layer==='TT_SHAFT_FLAT');assert.ok(originalFlat);
const spans=e=>[Math.max(...e.points.map(p=>p.x))-Math.min(...e.points.map(p=>p.x)),Math.max(...e.points.map(p=>p.y))-Math.min(...e.points.map(p=>p.y))].sort((a,b)=>a-b);
for(const method of ['laser','cnc']){const output=buildNestedDxf(tf,{method}),es=readDxf(output.text).entities,flat=es.filter(e=>e.layer==='TT_SHAFT_FLAT');assert.equal(flat.length,1);assert.equal(flat[0].points.length,originalFlat.points.length);spans(flat[0]).forEach((v,i)=>assert.ok(Math.abs(v-spans(originalFlat)[i])<.0002));assert.ok(!es.some(e=>e.layer==='TT_HUB_SCREW'));}
process.exit(0);
