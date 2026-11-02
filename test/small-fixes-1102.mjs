// 小修正：練習檔不再一打開就紅字「角度無解」；量尺摘要分隔；播放列狀態短字具體；舊名稱「現成組件」。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {invalidPoseStatus} from '../js/blocks/status-text.js';
import {dimensionSummaryText} from '../js/blocks/dimensions.js';
let pass=0;const ok=(c,m)=>{assert.ok(c,m);pass++;console.log('PASS',m);};
{
  const p=invalidPoseStatus({fromPractice:true,edited:false});
  ok(p.state==='warn'&&/練習/.test(p.text)&&/(補|接)/.test(p.text),`剛開的練習檔：黃色提示，請照步驟補上（${p.text}）`);
  const e=invalidPoseStatus({fromPractice:true,edited:true}),f=invalidPoseStatus({fromPractice:false,edited:true});
  ok(e.state==='error'&&f.state==='error','改過之後解不出：才是紅色');
  ok([p,e,f].every(s=>!/角度無解/.test(s.text)),'不再說「角度無解」');
  ok(/接/.test(f.text)&&/復原/.test(f.text)&&f.text.length<=24,`紅字說明短而具體：先檢查孔有沒有接好，或復原（${f.text}）`);
}
ok(dimensionSummaryText({name:'高度 1',value:0})==='高度 1：目前 0.0 mm'&&dimensionSummaryText({name:'夾口',value:70.87})==='夾口：目前 70.9 mm','量尺摘要：「名稱：目前 x.x mm」');
ok(dimensionSummaryText({name:'夾口',value:null})==='夾口：—','量不到時顯示破折號');
const app=readFileSync(new URL('../js/blocks/app.js',import.meta.url),'utf8');
ok(!/目前角度無解/.test(app)&&/invalidPoseStatus/.test(app),'app 改用共用的狀態文字');
const css=readFileSync(new URL('../js/blocks/workspace-mobile.css',import.meta.url),'utf8');
const label=st=>(css.match(new RegExp(`data-state="${st}"\\]::after\\s*\\{[^}]*content:\\s*"([^"]+)"`))||[])[1];
ok(label('warn')&&label('warn')!=='注意','播放列黃色狀態不再只寫「注意」');
ok(['ready','warn','error','static'].every(s=>label(s)&&label(s).length<=5),`各狀態短字具體且 ≤5 字（${['ready','warn','error','static'].map(label).join('／')}）`);
for(const f of ['js/blocks/example-entry.js','js/blocks/examples.js'])
  ok(!/現成組件/.test(readFileSync(new URL('../'+f,import.meta.url),'utf8')),`${f} 改用目前名稱「加入模組」`);
console.log(`small-fixes-1102: ${pass} passed`);
