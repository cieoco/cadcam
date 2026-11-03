// 參考「電路板外殼生成器」：數值欄＝輸入框＋滑桿＋↺回預設＋「範圍 a–b」，手機用拇指拉也能改。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {numericFieldModel} from '../js/blocks/numeric-field.js';
let pass=0;const ok=(c,m)=>{assert.ok(c,m);pass++;console.log('PASS',m);};
const m=numericFieldModel({value:120,min:25,max:350,step:1,defaultValue:100,unit:'mm'});
ok(m.value===120&&m.min===25&&m.max===350&&m.step===1,'保留值與範圍');
ok(m.rangeText==='範圍 25–350'&&m.defaultText==='預設 100'&&m.unit==='mm','顯示「範圍 25–350」與預設值');
ok(m.canReset===true&&numericFieldModel({value:100,min:25,max:350,defaultValue:100}).canReset===false,'↺ 只在改過時可按');
ok(numericFieldModel({value:999,min:25,max:350}).value===350&&numericFieldModel({value:-5,min:25,max:350}).value===25,'超出範圍夾回邊界');
ok(numericFieldModel({value:12.345,min:0,max:20,step:0.1}).value===12.3,'依步距取整（0.1）');
ok(numericFieldModel({value:'abc',min:0,max:20,defaultValue:5}).value===5,'不是數字時回到預設');
for(const [f,what] of [['js/blocks/member-editor.js','連桿孔距'],['js/blocks/gear-editor.js','齒輪齒數'],['js/plugins/box-maker/box-dialog.js','盒子長寬高']])
  ok(/numeric-field/.test(readFileSync(new URL('../'+f,import.meta.url),'utf8')),`${what} 改用共用數值欄`);
const css=readFileSync(new URL('../js/blocks/workspace-mobile.css',import.meta.url),'utf8')+readFileSync(new URL('../blocks.html',import.meta.url),'utf8');
ok(/\.numeric-field[^{]*input\[type=["']?range["']?\][^{]*\{[^}]*(height|min-height):\s*(2[8-9]|[3-9]\d)px/.test(css)||/numeric-field[^{]*::-webkit-slider-thumb[^{]*\{[^}]*(width|height):\s*(2[8-9]|[3-9]\d)px/.test(css),'手機滑桿好拉（觸控高度 ≥ 28px）');
console.log(`numeric-field: ${pass} passed`);
