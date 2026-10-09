import {f1AssemblyFixture,f1NestedFixture} from './fixtures/f1-assembly-fixture.mjs';
import {toSnapshot} from '../js/blocks/schema.js';
import {LOAD_GRAPH_TOKEN} from '../js/load-graph.js';
const $=id=>document.getElementById(id),frame=$('work'),key='cadcam.performance.runs.v1';
let running=false,stopped=false,records=[],sourceLoaded=frame.contentDocument?.readyState==='complete';
frame.addEventListener('load',()=>{sourceLoaded=true;});
const database=new Promise((resolve,reject)=>{const request=indexedDB.open('cadcam.performance',1);request.onupgradeneeded=()=>request.result.createObjectStore('runs',{keyPath:'runId'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
const history=database.then(db=>new Promise((resolve,reject)=>{const r=db.transaction('runs').objectStore('runs').getAll();r.onsuccess=()=>{records=r.result;try{const interrupted=JSON.parse(localStorage.getItem(key+'.interrupted') || 'null');if(interrupted&&!records.some(r=>r.runId===interrupted.runId))records.push(interrupted);}catch(_){}render();resolve();};r.onerror=()=>reject(r.error);}));
const status=text=>$('status').textContent=text;
const persist=()=>database.then(db=>{const tx=db.transaction('runs','readwrite');for(const r of records)tx.objectStore('runs').put(r);tx.oncomplete=()=>localStorage.removeItem(key+'.interrupted');tx.onerror=()=>status('紀錄儲存失敗，請下載保存；目前紀錄仍在此頁。');}).catch(()=>status('IndexedDB無法儲存，請下載全部紀錄。'));
const displayCoverage=coverage=>coverage?.geometryCounters?{...coverage,geometryCounters:Object.fromEntries(Object.entries(coverage.geometryCounters).filter(([name])=>name!=='key'))}:coverage;
const render=()=>$('results').textContent=JSON.stringify(records.map(r=>({source:r.source,fixture:r.fixture,run:r.run,status:r.status,reason:r.invalidReason,summary:r.summary,geometry:r.samples?.at(-1)?.geometryCounters,coverage:displayCoverage(r.coverage)})),null,2);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const api=()=>frame.contentWindow?.blocks?.benchmark;
async function ready(){for(let i=0;i<100;i++){const b=api();if(sourceLoaded&&b?.identity?.source===$('source').value&&($('source').value==='baseline'?b.identity.sha?.startsWith('1537242'):b.identity.token===LOAD_GRAPH_TOKEN))return b;await delay(100);}throw Error('量測工作頁版本尚未就緒；原版需先執行 tools/performance-baseline.mjs。');}
function saveRun(run){if(run&&!records.some(r=>r.runId===run.runId)){records.push(run);persist();render();}}
function stop(reason){stopped=true;const b=api();b?.abort(reason);const result=b?.result(),last=result?.runs.at(-1);if(last?.status==='invalid')try{localStorage.setItem(key+'.interrupted',JSON.stringify(last));}catch(_){}saveRun(last);}
$('abort').onclick=()=>{stop('aborted');status('已中止，本次紀錄標示invalid並保留。');};
$('source').onchange=()=>{stop('source_changed');sourceLoaded=false;frame.src=$('source').value==='baseline'?'../output/framework-stabilization/w4a-cache/baseline-1537242/blocks.html?benchmark=1':'../blocks.html?benchmark=1';};
$('start').onclick=async()=>{
 if(running)return;running=true;stopped=false;$('start').disabled=true;
 try{
  await history;const b=await ready();
  for(const [name,make] of [['F1',f1AssemblyFixture],['F3-provisional-nested',f1NestedFixture]]){
   for(let run=1;run<=3&&!stopped;run++){
    const f=make(),snapshot=toSnapshot(f.comps,{params:f.params},3,{modules:f.modules,fabrication:f.fabrication,activeMotor:'1',motorAngles:{'2':0}});
    const coverage=await b.load(snapshot);
    if(stopped)break;
    b.start({runId:crypto.randomUUID(),fixture:name,source:$('source').value,run,deviceNote:$('device').value || '未提供型號／硬體資料',parentSourceToken:LOAD_GRAPH_TOKEN,coverage,
     physicalDeviceRequired:true,fixtureProvisional:name!=='F1',motion:{activeMotor:'1',otherMotorDeg:0,input:f.comps.filter(c=>c.isInput).map(c=>({id:c.id,type:c.motorType,start:c.servoStart,end:c.servoEnd}))}});
    while(!stopped&&b.status().status!=='idle'){const s=b.status();status(`${name} 第${run}/3次：${s.status} · ${(s.elapsedMs/1000).toFixed(0)}秒 · ${s.samples} samples`);await delay(1000);}
    const last=b.result().runs.at(-1);saveRun(last);b.abort('run_finished');if(last?.status!=='complete'){stopped=true;break;}
   }
  }
  status(stopped?'已中止，全部完成與invalid紀錄均保留。':'6次量測完成；請下載全部紀錄。同裝置原版需另執行，OPPO實機未量不能視為手機gate通過。');
 }catch(e){stop('setup_failed');status(e.message);}finally{running=false;$('start').disabled=false;}
};
$('download').onclick=()=>{const blob=new Blob([JSON.stringify({version:1,measurement:'CPU submission and rAF; GPU not measured',protocol:{warmupMs:10000,durationMs:60000,repetitions:3},runs:records},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='cadcam-performance.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)stop('page_hidden');});
window.addEventListener('pagehide',()=>{if(running)stop('reload_or_navigation');});
history.catch(()=>status('歷史紀錄無法載入；仍可量測並下載。'));
