// Static startup closure, not a claim about compressed network transfer or latency.
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {posix,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {moduleReferences,tokensOf} from './load-graph.mjs';
export function startupSize(read = p=>readFileSync(p,'utf8')) {
  const seen=new Set(),lazy=new Set(),todo=['js/blocks/app.js','js/version-info.js'];let bytes=0;
  while(todo.length){
    const path=todo.pop();if(seen.has(path))continue;seen.add(path);
    const source=read(path).replaceAll('\r\n','\n'),tokens=tokensOf(source);bytes+=Buffer.byteLength(source);
    for(const ref of moduleReferences(source,path)){
      if(ref.kind!=='import')continue;
      const spec=ref.specifier.split('?')[0];
      const target=spec==='three'?'js/vendor/three.module.js':spec.startsWith('.')?posix.normalize(posix.join(posix.dirname(path),spec)):null;
      if(!target)throw Error('Unknown startup module: '+spec);
      const i=tokens.findIndex(t=>t.start===ref.start);
      if(tokens[i-1]?.value==='('&&tokens[i-2]?.value==='import'){lazy.add(target);continue;}
      todo.push(target);
    }
  }
  return {modules:seen.size,bytes,htmlBytes:Buffer.byteLength(read('blocks.html').replaceAll('\r\n','\n')),paths:[...seen].sort(),lazyEntries:[...lazy].sort()};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const revision=process.argv[2];
  const result=startupSize(revision?p=>execFileSync('git',['show',`${revision}:${p}`],{encoding:'utf8',maxBuffer:8e6}):undefined);
  const {paths,...summary}=result;console.log(JSON.stringify({...summary,threeInitially:paths.includes('js/vendor/three.module.js'),videoInitially:paths.includes('js/vendor/mediabunny/mediabunny.mjs')},null,2));
}
