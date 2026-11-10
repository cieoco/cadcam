// 學生原檔（test/fixtures/connected-resize.json）：Blank136、Blank137 懸空，末端 P138s 沒接。
// 狀態列不能再寫「解不出」，要指出沒接好的零件；真的解不出時才保留「解不出」。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {alignSavedInputPhase,normalizeSnapshot} from '../js/blocks/schema.js';
import {readStoredProject} from '../js/blocks/project-envelope.js';
import {compileTopology} from '../js/core/topology.js';
import {solveTopology} from '../js/multilink/solver.js';
import {motionPoseIssue} from '../js/blocks/solve-health.js';
import {invalidPoseStatus} from '../js/blocks/status-text.js';
import {holeWorld} from '../js/core/local-holes.js';

const load=()=>alignSavedInputPhase(normalizeSnapshot(readStoredProject(JSON.parse(readFileSync(new URL('./fixtures/connected-resize.json',import.meta.url),'utf8')))));
// 與 app.js solveFrame／updateMechanismStatus 相同：θ 與馬達角度求解 → motionPoseIssue → 狀態文字。
const status=(s,theta=0,practice={})=>{const sol=solveTopology(compileTopology(s.comps,{params:{...s.params}},new Set()),{thetaDeg:theta,motorAngles:{1:theta}});
 const issue=motionPoseIssue(s.comps,sol);return {sol,issue,status:issue?invalidPoseStatus({...practice,issue,comps:s.comps}):null};};
const LOOSE='「孔格桿件」(Blank137) 有一端沒接，機構會晃動；接上固定孔或其他零件後才能正確播放';

for(const a of [0,45,180]){const r=status(load(),a);
 assert.equal(r.sol.isValid,true,`θ=${a} solver result is valid`);assert.equal(r.issue.code,'underconstrained');
 assert.deepEqual(r.status,{state:'warn',text:LOOSE});assert.ok(!r.status.text.includes('解不出'));}
// 改尺寸後仍指出同一個沒接的零件。
{const s=load();s.params['Blank136.G']=64;const r=status(s);assert.deepEqual(r.status,{state:'warn',text:LOOSE});}
// 練習檔剛打開時維持原本的練習提示。
assert.equal(status(load(),0,{fromPractice:true,edited:false}).status.text,'練習檔：照步驟把零件補上');
// 把末端接到板孔：機構可解，沒有任何狀態警示。
const closed=()=>{const s=load(),p=s.comps.find(c=>c.id==='Blank133'),h=p.holes.find(h=>h.id==='Blank133_H64_48');s.comps.find(c=>c.id==='Blank137').p2={id:h.id,type:'floating',...holeWorld(p,h)};return s;};
{const r=status(closed());assert.equal(r.sol.isValid,true);assert.equal(r.issue,null);}
// 真的接不起來（2 孔無法閉合）才是「解不出」。
{const s=closed();s.params['Blank137.G']=8;const r=status(s);assert.equal(r.issue.code,'invalid_pose');assert.deepEqual(r.status,{state:'error',text:'解不出：檢查孔有沒有接好，或按復原'});}
// 拿掉 Blank137 後，改點名末端沒接的 Blank136。
{const s=load();s.comps=s.comps.filter(c=>c.id!=='Blank137');const r=status(s);assert.equal(r.status.text,'「孔格桿件」(Blank136) 有一端沒接，機構會晃動；接上固定孔或其他零件後才能正確播放');}
console.log('connected status: loose end named instead of 解不出, closed loop clean, real failure still 解不出');
