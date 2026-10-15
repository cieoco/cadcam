import assert from 'node:assert/strict';
import {getExample} from '../js/blocks/examples.js';
import {builtinTemplate,normalizeTemplate,instantiateComposite} from '../js/blocks/module-ops.js';
import {compileAssembly,solveAssembly} from '../js/blocks/assembly.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
for(const id of ['tipping-bucket','lift-bucket']){
 const original=JSON.stringify(getExample(id).snapshot),t=builtinTemplate(id);
 assert.equal(t.kind,'blocks-composite');assert.ok(normalizeTemplate(t).ok);
 assert.equal(t.comps.length,getExample(id).snapshot.comps.length);
 assert.equal(t.modules.length,getExample(id).snapshot.modules.length);
 const a=instantiateComposite(t,{counter:100,usedMotorIds:['1'],existingTokens:new Set(['Lift','Floor','LL1']),place:{x:400,y:50}});
 assert.ok(a.comps.every(c=>c.moduleId));
 assert.ok(a.modules.every(m=>!['Lift','Floor'].includes(m.id)));
 const s=normalizeSnapshot(JSON.parse(JSON.stringify({kind:'blocks',v:1,comps:a.comps,modules:a.modules,params:a.params})));
 assert.equal(s.modules.filter(m=>m.mount).length,t.modules.length-1);
 const asm=compileAssembly(s.comps,s.modules,{params:s.params});
 for(let angle=id==='tipping-bucket'?-100:-40;angle<=60;angle+=2){
   if(id==='tipping-bucket'&&angle>0)break;
   assert.equal(solveAssembly(asm,{thetaDeg:angle,motorAngles:{'2':angle}}).isValid,true,`${id} ${angle}`);
 }
 assert.equal(JSON.stringify(getExample(id).snapshot),original);
 console.log('PASS',id,'same source, whole composite, remap, save and motion');
}
