// 共用數值欄：範圍語意保留供驗證與輔助閱讀；有明確預設的工具可還原。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {numericFieldModel} from '../js/blocks/numeric-field.js';
let pass=0;const ok=(c,m)=>{assert.ok(c,m);pass++;console.log('PASS',m);};
const m=numericFieldModel({value:120,min:25,max:350,step:1,defaultValue:100,unit:'mm'});
ok(m.value===120&&m.min===25&&m.max===350&&m.step===1,'保留值與範圍');
ok(m.rangeText==='範圍 25–350'&&m.defaultText==='預設 100'&&m.unit==='mm','保留範圍與預設描述供輔助閱讀');
ok(m.canReset===true&&numericFieldModel({value:100,min:25,max:350,defaultValue:100}).canReset===false,'↺ 只在改過時可按');
ok(numericFieldModel({value:999,min:25,max:350}).value===350&&numericFieldModel({value:-5,min:25,max:350}).value===25,'超出範圍夾回邊界');
ok(numericFieldModel({value:12.345,min:0,max:20,step:0.1}).value===12.3,'依步距取整（0.1）');
ok(numericFieldModel({value:'abc',min:0,max:20,defaultValue:5}).value===5,'不是數字時回到預設');
for(const [f,what] of [['js/blocks/gear-editor.js','齒輪齒數'],['js/plugins/box-maker/box-dialog.js','盒子長寬高']])
  ok(/numeric-field/.test(readFileSync(new URL('../'+f,import.meta.url),'utf8')),`${what} 改用共用數值欄`);
const css=readFileSync(new URL('../js/blocks/workspace-mobile.css',import.meta.url),'utf8')+readFileSync(new URL('../blocks.html',import.meta.url),'utf8');
ok(/\.numeric-field[^{]*input\[type=["']?range["']?\][^{]*\{[^}]*(height|min-height):\s*(2[8-9]|[3-9]\d)px/.test(css)||/numeric-field[^{]*::-webkit-slider-thumb[^{]*\{[^}]*(width|height):\s*(2[8-9]|[3-9]\d)px/.test(css),'手機滑桿好拉（觸控高度 ≥ 28px）');
console.log(`numeric-field: ${pass} passed`);

// A graphical length follows its projected axis even in an oblique view.
const {projectedDimension,projectedAngle}=await import('../js/blocks/dimension-handle.js');
assert.equal(projectedDimension(80,{x:30,y:40},{x:3,y:4}),90);
assert.equal(projectedDimension(80,{x:-40,y:30},{x:3,y:4}),80);
assert.equal(projectedDimension(80,{x:-100,y:0},{x:1,y:0},{min:8,max:200}),8);
assert.equal(projectedDimension(80,{x:1000,y:0},{x:1,y:0},{min:8,max:200}),200);
assert.equal(projectedDimension(80.25,{x:1.4,y:0},{x:1,y:0}),82,'drag snaps absolute size, not just its delta');
assert.equal(projectedDimension(80.25,{x:-1.4,y:0},{x:1,y:0}),79);
assert.equal(projectedDimension(80,{x:1000,y:0},{x:1,y:0},{min:8.2,max:90.8}),90,'fractional upper bound stays on the integer grid');
assert.equal(projectedDimension(80,{x:-1000,y:0},{x:1,y:0},{min:8.2,max:90.8}),9);
assert.equal(projectedDimension(-2.3,{x:-100,y:0},{x:1,y:0},{min:-4.8,max:4.8}),-4);
assert.equal(projectedDimension(8.5,{x:100,y:0},{x:1,y:0},{min:8.2,max:8.8}),8.5,'no feasible integer preserves the original dimension');
assert.equal(projectedDimension(80.25,{x:100,y:0},{x:0,y:0}),80.25);
assert.equal(projectedAngle({x:0,y:0},{u:{x:2,y:1},v:{x:-1,y:3}},{x:2,y:1},{x:-1,y:3}),90);
assert.equal(projectedAngle({x:0,y:0},{u:{x:2,y:1},v:{x:4,y:2}},{x:2,y:1},{x:4,y:2}),0);
