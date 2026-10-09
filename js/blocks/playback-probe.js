/** Opt-in CPU/rAF measurements; no GPU/FPS claim, no work-state access. */
export const PERFORMANCE_PROTOCOL={warmupMs:10000,durationMs:60000,repetitions:3};
const summary=values=>{const v=[...values].sort((a,b)=>a-b);return {samples:v.length,p50:v.length?v[Math.ceil(v.length*.5)-1]:null,p95:v.length?v[Math.ceil(v.length*.95)-1]:null,max:v.at(-1) ?? null};};
export function createPlaybackProbe({now=()=>performance.now(),protocol=PERFORMANCE_PROTOCOL}={}){
 let current=null;const runs=[];
 const finish=(reason=null)=>{if(!current)return;if(!reason&&!current.samples.length)reason='no_samples';current.status=reason?'invalid':'complete';current.invalidReason=reason;current.endedAt=now();
  const fields=['solveMs','draw2dMs','poseMs','submit3dMs','rendererCpuMs','totalMs','rafIntervalMs'];current.summary=Object.fromEntries(fields.map(k=>[k,summary(current.samples.map(s=>s[k]).filter(Number.isFinite))]));current.over100ms=current.samples.filter(s=>s.rafIntervalMs>100).length;runs.push(current);current=null;};
 return {start(meta){if(current)finish('restarted');current={...structuredClone(meta),protocol:{...protocol},startedAt:now(),status:'warming',samples:[]};},
 record(sample){if(!current)return;const elapsed=now()-current.startedAt;if(sample.valid===false){finish('unsolved_pose');return;}if(elapsed<protocol.warmupMs)return;current.status='measuring';if(['solveMs','draw2dMs','poseMs','submit3dMs','totalMs','rafIntervalMs'].some(k=>!Number.isFinite(sample[k])||sample[k]<0)){finish('missing_frame_metrics');return;}if(elapsed>=protocol.warmupMs+protocol.durationMs){finish();return;}current.samples.push({...sample});},
 abort:reason=>finish(reason || 'aborted'),active:()=>!!current,status:()=>({status:current?.status || 'idle',samples:current?.samples.length || 0,elapsedMs:current?now()-current.startedAt:0,runs:runs.length}),snapshot:()=>structuredClone({current,runs}),clear(){if(current)finish('cleared');runs.length=0;}};
}
