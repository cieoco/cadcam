import assert from 'node:assert/strict';
import {createPlaybackProbe,PERFORMANCE_PROTOCOL} from '../js/blocks/playback-probe.js';
assert.deepEqual(PERFORMANCE_PROTOCOL,{warmupMs:10000,durationMs:60000,repetitions:3});
let time=0;const p=createPlaybackProbe({now:()=>time}),sample={solveMs:1,draw2dMs:2,poseMs:3,submit3dMs:4,totalMs:10,rafIntervalMs:16,valid:true};
p.start({runId:'r1'});time=9999;p.record(sample);assert.equal(p.status().samples,0);
time=10000;p.record(sample);time=11000;p.record({...sample,totalMs:20,rafIntervalMs:120});time=69999;p.record(sample);time=70000;p.record(sample);
let r=p.snapshot().runs[0];assert.equal(r.status,'complete');assert.equal(r.samples.length,3);assert.equal(r.summary.totalMs.p95,20);assert.equal(r.over100ms,1);
for(const reason of ['aborted','page_hidden','reload_or_navigation']){p.start({runId:reason});p.abort(reason);assert.equal(p.snapshot().runs.at(-1).invalidReason,reason);}
p.start({runId:'invalid'});time+=10001;p.record({...sample,valid:false});assert.equal(p.snapshot().runs.at(-1).status,'invalid');assert.equal(p.snapshot().runs.length,5,'all runs preserved');
console.log('playback probe: exact protocol, warmup, all samples, summary, interrupted and unsolved runs');
