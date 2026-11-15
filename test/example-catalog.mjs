import assert from 'node:assert/strict';
import {BLOCK_EXAMPLES,loadUnitStarts} from '../js/blocks/examples.js';
import {renderExampleCatalog,CATALOG_FAMILIES} from '../js/blocks/example-catalog.js';

class Element {
  constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.listeners={};this.textContent='';this.open=false;}
  append(...children){this.children.push(...children);}
  setAttribute(k,v){this.attributes[k]=v;}
  addEventListener(type,fn){this.listeners[type]=fn;}
  click(){this.listeners.click?.();}
}
const doc={createElement:tag=>new Element(tag)}, list=new Element('div'), loaded=[];
await loadUnitStarts();
const existing=BLOCK_EXAMPLES.filter(e=>e.catalog!=='blocks');
const sample={id:'block-gear-gripper',title:'積木夾爪',catalog:'blocks'};
const examples=[...existing,sample];
renderExampleCatalog(list,examples,id=>loaded.push(id),doc);
const all=n=>[n,...n.children.flatMap(all)];
const legacy=list.children.find(n=>n.dataset.exampleCatalog==='legacy');
const current=list.children.find(n=>n.dataset.exampleGroup==='blocks');
assert.ok(legacy);assert.equal(legacy.tagName,'details');assert.equal(legacy.open,false);
assert.equal(legacy.children[0].textContent,'舊範例');assert.ok(current);
const buttons=all(list).filter(n=>n.dataset.exampleId);
assert.equal(buttons.filter(b=>b.dataset.exampleId===sample.id).length,1);
assert.equal(all(current).filter(b=>b.dataset.exampleId===sample.id).length,1);
assert.equal(all(legacy).filter(b=>b.dataset.exampleId===sample.id).length,0);
assert.deepEqual(new Set(buttons.map(b=>b.dataset.exampleId)),new Set(examples.map(e=>e.id)));
assert.equal(buttons.length,examples.length,'every example has exactly one main entry');
assert.equal(all(list).filter(n=>n.dataset.exampleRef).length,0,'no duplicate recommendation shortcuts');
assert.ok(all(legacy).some(n=>n.dataset.exampleFamily==='lesson-starts'));
for(const family of CATALOG_FAMILIES) if(family.variants.some(v=>existing.some(e=>e.id===v.id))) assert.ok(all(legacy).some(n=>n.dataset.exampleFamily===family.id));
for(const id of [sample.id,existing[0].id,'unit4-start']) {const b=buttons.find(b=>b.dataset.exampleId===id);assert.ok(b,id);b.click();}
assert.deepEqual(loaded,[sample.id,existing[0].id,'unit4-start']);
console.log(`example catalog: ${existing.length} legacy examples and one blocks example, unique and loadable`);

// The integrated registry has both user-authored works, each in the blocks
// section exactly once; the legacy archive must not duplicate either entry.
const integrated=new Element('div');renderExampleCatalog(integrated,BLOCK_EXAMPLES,()=>{},doc);
const blocksSection=integrated.children.find(n=>n.dataset.exampleGroup==='blocks'),oldSection=integrated.children.find(n=>n.dataset.exampleCatalog==='legacy');
for(const id of ['block-gear-gripper','four-wheel-chassis']){assert.equal(all(blocksSection).filter(n=>n.dataset.exampleId===id).length,1);assert.equal(all(oldSection).filter(n=>n.dataset.exampleId===id).length,0);}
