// Regression for stale query aliases, script src and main/iframe graph identity.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildLoadGraph, syncLoadGraph, moduleReferences } from '../tools/load-graph.mjs';
import { moduleEntryUrl, LOAD_GRAPH_TOKEN } from '../js/module-url.js';
import { createLoadSession } from '../js/blocks/load-session.js';
import { openFaceWizard } from '../js/blocks/face-wizard-ui.js';
import { bracketFixture } from './fixtures/face-bracket-fixture.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const current = syncLoadGraph(repository, true);
assert.equal(current.token, LOAD_GRAPH_TOKEN);
const canonical = page => {
  const html = current.outputs.get(page), map = JSON.parse(html.match(/<script type="importmap"[^>]*>([\s\S]*?)<\/script>/)[1]);
  const base = new URL(page, 'https://example.test/cadcam/');
  return Object.fromEntries(Object.entries(map.imports).map(([key,value])=>[key==='three'?key:new URL(key,base).href,new URL(value,base).href]));
};
assert.deepEqual(canonical('blocks.html'), canonical('assembly-wizard-prototype.html'));
assert.deepEqual(canonical('blocks.html'), canonical('test/face-wizard.html'));
assert.deepEqual(canonical('blocks.html'), canonical('test/face-bracket-preview.html'));
const stateUrl = canonical('blocks.html')['https://example.test/cadcam/js/blocks/state.js'];
assert.ok(stateUrl.endsWith(`?v=${LOAD_GRAPH_TOKEN}`));
assert.equal(canonical('blocks.html').three, `https://example.test/cadcam/js/vendor/three.module.js?v=${LOAD_GRAPH_TOKEN}`);
const entry = moduleEntryUrl('./entry.js?run=8&feature=a#view', 'https://example.test/cadcam/test/');
assert.equal(entry.searchParams.get('run'),'8'); assert.equal(entry.searchParams.get('feature'),'a');
assert.equal(entry.hash,'#view'); assert.equal(entry.searchParams.get('v'),LOAD_GRAPH_TOKEN);
assert.equal(moduleEntryUrl(entry.href,entry.href).searchParams.getAll('v').length,1);

const scan = moduleReferences(`// import './fake1.js';
const text="import('./fake2.js')"; const rx=/import\('fake3'\)/;
import { from as value } from './one.js'; export {value} from './two.js';
await import('./three.js'); await import('./four.js',{with:{type:'json'}});
const nested=\`hello \${await import('./five.js')}\`;
script.src=new URL('./entry.js',location.href).href;`);
assert.deepEqual(scan.map(r=>r.specifier),['./one.js','./two.js','./three.js','./four.js','./five.js','./entry.js']);
assert.throws(()=>moduleReferences("import('./x.js'+suffix)"),/computed import/);
assert.throws(()=>moduleReferences('import(path)'),/computed import/);

const temp = mkdtempSync(join(tmpdir(),'cadcam-load-'));
const put = (path,text) => { mkdirSync(dirname(join(temp,path)),{recursive:true}); writeFileSync(join(temp,path),text); };
try {
  for (const dir of ['test','js/blocks','js/blocks3d']) mkdirSync(join(temp,dir),{recursive:true});
  put('tools/load-graph.mjs',readFileSync(join(repository,'tools/load-graph.mjs'),'utf8'));
  put('js/blocks/state.js','export const S={};');
  put('js/blocks/geometry.js','export const shape=()=>1;');
  put('js/vendor/three.module.js','export const Three=1;');
  const app="import {S} from './state.js'; import {S as alias} from './state.js?v=old'; import {shape} from './geometry.js?v=first'; await import('./geometry.js?v=second'); import {Three} from 'three';";
  put('js/blocks/app.js',app);
  const page='<html><head></head><body><script src="./js/blocks/app.js?run=7#view" type="module"></script></body></html>';
  put('blocks.html',page);
  put('assembly-wizard-prototype.html','<html><script type="module">import "./js/blocks/state.js";</script></html>');
  put('test/sample.html','<html><script type="module">import "../js/blocks/state.js"; script.src=new URL("../js/blocks/app.js",location.href).href;</script></html>');
  const first=syncLoadGraph(temp);
  assert.equal(syncLoadGraph(temp,true).token,first.token,'generated cache keys must not self-hash');
  rmSync(join(temp,'js/load-graph.js'));
  assert.throws(()=>syncLoadGraph(temp,true),/Stale generated/);
  syncLoadGraph(temp);
  const generated=readFileSync(join(temp,'blocks.html'),'utf8');
  assert.ok(generated.includes(`app.js?run=7&v=${first.token}#view`),'src before type receives the graph version, preserving run/hash');
  assert.ok(readFileSync(join(temp,'test/sample.html'),'utf8').includes(`../js/blocks/app.js?v=${first.token}`),'literal script.src is versioned');
  assert.equal(first.imports['https://load.invalid/js/blocks/state.js'],first.imports['https://load.invalid/js/blocks/state.js?v=old']);
  assert.equal(first.imports['https://load.invalid/js/blocks/geometry.js?v=first'],first.imports['https://load.invalid/js/blocks/geometry.js?v=second']);
  put('js/blocks/state.js','export const S={changed:true};');
  assert.throws(()=>syncLoadGraph(temp,true),/Stale generated/);
  assert.notEqual(buildLoadGraph(temp).token,first.token,'a dependency change invalidates entry URLs too');
  put('js/blocks/state.js','export const S={};');
  put('js/blocks/app.js',app+"import './missing.js';");
  assert.throws(()=>buildLoadGraph(temp),/missing module/); put('js/blocks/app.js',app);
  put('blocks.html',generated+'<!-- BEGIN GENERATED LOAD MAP --><!-- END GENERATED LOAD MAP -->');
  assert.throws(()=>buildLoadGraph(temp),/duplicate/); put('blocks.html',generated);
  put('blocks.html',generated+'<script type="importmap">{"imports":{}}</script>');
  assert.throws(()=>buildLoadGraph(temp),/conflicting/); put('blocks.html',generated);
  put('js/blocks/new.js','export const fresh=1;');
  assert.throws(()=>syncLoadGraph(temp,true),/Stale generated/);
  const next=syncLoadGraph(temp); assert.ok(next.sources.has('js/blocks/new.js'));
  put('js/blocks/app.js',app+"import './state.js?v=unknown';");
  assert.throws(()=>syncLoadGraph(temp,true),/Stale generated/);
  const variant=syncLoadGraph(temp); assert.equal(variant.imports['https://load.invalid/js/blocks/state.js?v=unknown'],variant.imports['https://load.invalid/js/blocks/state.js']);
  put('js/blocks/app.js',app+"import './state.js?mode=other';");
  assert.throws(()=>buildLoadGraph(temp),/semantic query/);
} finally { rmSync(temp,{recursive:true,force:true}); }

const session=createLoadSession('same');
assert.equal(session.allowConfirm('same'),false,'confirmation requires a handshake');
assert.equal(session.receiveReady('same'),true); assert.equal(session.allowConfirm('same'),true);
assert.equal(session.allowConfirm('other'),false); assert.equal(session.allowConfirm('same'),false);
assert.equal(session.receiveReady(undefined),false); assert.equal(session.receiveReady('same'),true);

// Exercise the real parent message receiver: a mismatched batch cannot reach the
// placement/commit path, even if it sends an otherwise valid confirmation.
let receiver, iframe, commits=0; const messages=[], notices=[];
class Element {
  constructor(tag) { this.style={};this.listeners={};this.children=[];this.tag=tag;
    if(tag==='iframe') { iframe=this;this.contentWindow={postMessage:data=>messages.push(data)}; } }
  setAttribute() {} append(...children) {this.children.push(...children);} remove() {}
  addEventListener(type,handler) {this.listeners[type]=handler;} showModal() {}
  close() {this.listeners.close?.();}
}
globalThis.document={createElement:tag=>new Element(tag),body:new Element('body')};
globalThis.window={addEventListener:(type,handler)=>{if(type==='message')receiver=handler;},removeEventListener(){}};
globalThis.location={origin:'https://example.test'};
globalThis.matchMedia=()=>({matches:false});
const fixture=bracketFixture(), before=JSON.stringify(fixture);
openFaceWizard({...fixture,childId:'Child',exportSettings:{},stockMm:3,isCurrent:()=>true,commit:()=>commits++,say:t=>notices.push(t)});
assert.ok(receiver && iframe);
assert.equal(new URL(iframe.src).searchParams.get('load'),LOAD_GRAPH_TOKEN);
const send=data=>receiver({origin:location.origin,source:iframe.contentWindow,data});
send({type:'face-wizard-confirm',loadGraph:LOAD_GRAPH_TOKEN}); assert.equal(commits,0);
send({type:'face-wizard-ready',loadGraph:'stale'}); assert.ok(messages.at(-1).loadMismatch);
send({type:'face-wizard-ready',loadGraph:LOAD_GRAPH_TOKEN});
const init=messages.at(-1);assert.equal(init.type,'face-wizard-init');assert.equal(init.loadGraph,LOAD_GRAPH_TOKEN);
const selection={alignU:0,alignV:0,offsetU:0,offsetV:0,gap:0,quarterTurns:0,...init.selection,host:0,child:0};
send({type:'face-wizard-confirm',loadGraph:'stale',selection});assert.equal(commits,0);
send({type:'face-wizard-confirm',loadGraph:LOAD_GRAPH_TOKEN,selection});assert.equal(commits,0,'mismatch invalidates the handshake');
send({type:'face-wizard-ready',loadGraph:LOAD_GRAPH_TOKEN});
send({type:'face-wizard-confirm',loadGraph:LOAD_GRAPH_TOKEN,selection});assert.equal(commits,1,JSON.stringify(messages.at(-1)));
assert.equal(JSON.stringify(fixture),before);assert.ok(notices.some(t=>t.includes('重新整理')));

// Evaluate real ES modules with the generated import-map resolver, not just URL
// strings. Query aliases must export the very same state and geometry functions.
const vmCode = `
import assert from 'node:assert/strict'; import vm from 'node:vm';
import {readFileSync} from 'node:fs'; import {resolve} from 'node:path';
import {buildLoadGraph} from './tools/load-graph.mjs';
const graph=buildLoadGraph(), cache=new Map(), context=vm.createContext({console,URL});
const get=url=>{if(!cache.has(url)){const p=new URL(url).pathname.slice(1);cache.set(url,new vm.SourceTextModule(readFileSync(resolve(p),'utf8'),{identifier:url,context}));}return cache.get(url);};
const canonicalState=graph.imports['https://load.invalid/js/blocks/state.js'];
assert.notEqual(canonicalState,'https://load.invalid/js/blocks/state.js');
const entry=new vm.SourceTextModule('import {S as a} from "./js/blocks/state.js"; import {S as b} from '+JSON.stringify(canonicalState)+'; import {inspectFrameExport as c} from "./js/blocks/exporters.js?v=20261007_7"; import {inspectFrameExport as d} from "./js/blocks/exporters.js?v=20261007_9"; export {a,b,c,d};',{identifier:'https://load.invalid/entry.js',context});
await entry.link((s,m)=>{const key=new URL(s,m.identifier).href;return get(graph.imports[key]||key);});await entry.evaluate();
assert.equal(entry.namespace.a,entry.namespace.b);assert.equal(entry.namespace.c,entry.namespace.d);
console.log('real ES module state/geometry identity passed');`;
const vmResult=spawnSync(process.execPath,['--experimental-vm-modules','--input-type=module','-e',vmCode],{cwd:repository,encoding:'utf8'});
assert.equal(vmResult.status,0,vmResult.stdout+vmResult.stderr);
console.log('load-graph: graph/source/alias/entry/query/handshake regressions and real ES module identity passed');
