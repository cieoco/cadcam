// Build a public-assets-only directory. Never expose the workspace or archive.
import {cpSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve,relative,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {LOAD_GRAPH_TOKEN} from '../js/load-graph.js';
const root=resolve('.'),out=resolve('output/framework-stabilization/phone-'+LOAD_GRAPH_TOKEN),baseline=resolve('output/framework-stabilization/w4a-cache/baseline-1537242');
const copy=(from,to)=>{mkdirSync(resolve(to,'..'),{recursive:true});cpSync(from,to);};
const tracked=spawnSync('git',['ls-files','js','css'],{encoding:'utf8'});if(tracked.status)throw Error(tracked.stderr);
for(const name of tracked.stdout.trim().split(/\r?\n/).filter(n=>/\.(js|css|json)$/.test(n)))copy(resolve(root,name),resolve(out,name));
for(const name of ['blocks.html','assembly-wizard-prototype.html','test/performance.html','test/performance-browser.js','test/fixtures/performance/common.json'])copy(resolve(root,name),resolve(out,name));
const baselineOut=resolve(out,'output/framework-stabilization/w4a-cache/baseline-1537242');
function publicTree(path){for(const e of readdirSync(path,{withFileTypes:true})){const p=join(path,e.name);if(e.isDirectory())publicTree(p);else if(/\.(js|css|json)$/.test(e.name))copy(p,join(baselineOut,relative(baseline,p)));}}
for(const dir of ['js','css'])publicTree(join(baseline,dir));
copy(join(baseline,'blocks.html'),join(baselineOut,'blocks.html'));
writeFileSync(join(out,'index.html'),'<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=test/performance.html"><a href="test/performance.html">開啟效能量測</a>');
writeFileSync(join(out,'bundle.json'),JSON.stringify({sourceToken:LOAD_GRAPH_TOKEN,baselineSha:JSON.parse(readFileSync(join(baseline,'measurement-patch.json'))).sourceSha,publicAssetsOnly:true,createdAt:new Date().toISOString()},null,2));
console.log(out);
