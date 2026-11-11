// Pack O1 of docs/SDD-OPERATION-PIPELINE.md: the shared edit pipeline (js/blocks/edit-pipeline.js) with a fake host.
//   node test/edit-pipeline.mjs
import {check,report} from './_harness.mjs';
const {runEdit}=await import('../js/blocks/edit-pipeline.js');
const gate=await import('../js/blocks/integrity-gate.js');await gate.loadIntegrity();

const deepFreeze=o=>{if(o&&typeof o==='object'&&!Object.isFrozen(o)){Object.freeze(o);Object.values(o).forEach(deepFreeze);}return o;};
const bar=(id,x)=>({id,type:'bar',name:'桿',lenParam:id+'L',p1:{id:id+'.A',type:'floating',x,y:0},p2:{id:id+'.B',type:'floating',x:x+40,y:0}});
function host(extra={}){
  const S={comps:[bar('b1',0),bar('b2',100)],modules:[],topo:{params:{b1L:40,b2L:40},tracePoints:['b1.A','gone.A'],loads:[],dimensions:[]},fabrication:{},counter:1,
    selectedLinkId:'b1',selectedTriangleId:null,selectedSliderId:null,selectedNodeId:'b1.A'};
  const log={undo:0,pause:0,rebuild:0,draw:0,msgs:[],order:[]};
  return {S,log,host:{S,transient:m=>{log.msgs.push(m);log.order.push('say');},pushUndo:()=>{log.undo++;log.order.push('undo');},pause:()=>log.pause++,rebuild:()=>log.rebuild++,draw:()=>log.draw++,...extra}};
}
const removeB2=work=>({ok:true,comps:work.comps.filter(c=>c.id!=='b2'),params:{b1L:work.params.b1L},message:'已刪除桿。'});

// success: exactly one undo (before the write), writes S, prunes topo refs, clears selection, rebuild/draw, one line of feedback
{const {S,log,host:h}=host(),ok=runEdit({name:'測試',plan:removeB2,host:h});
 check('success returns true',ok===true);
 check('success: exactly one pushUndo',log.undo===1);
 check('success: undo is pushed before the feedback',log.order[0]==='undo');
 check('success: S.comps written',S.comps.length===1&&S.comps[0].id==='b1');
 check('success: params written',!('b2L' in S.topo.params));
 check('success: dead topo refs pruned',S.topo.tracePoints.length===1&&S.topo.tracePoints[0]==='b1.A');
 check('success: selection cleared',!S.selectedLinkId&&!S.selectedNodeId);
 check('success: rebuild and draw once',log.rebuild===1&&log.draw===1);
 check('success: exactly one line of feedback',log.msgs.length===1&&log.msgs[0]==='已刪除桿。');}
// success without message still says something; clearSelection:false is honoured; after() runs
{const {S,log,host:h}=host(),ok=runEdit({name:'移動',plan:w=>({ok:true,comps:w.comps,params:w.params,clearSelection:false,after:s=>{s.touched=true;}}),host:h});
 check('default feedback when the plan has no message',ok&&log.msgs.length===1&&log.msgs[0].includes('移動'));
 check('clearSelection:false keeps the selection',S.selectedLinkId==='b1'&&S.touched===true);}
// refusal: no undo, nothing written, still one line of feedback, flash asked
{const {S,log,host:h}=host({flash:ids=>log2.push(ids)}),log2=[],before=JSON.stringify(S),ok=runEdit({name:'測試',plan:()=>({ok:false,message:'不能這樣做，因為…',flash:['b1']}),host:h});
 check('refusal returns false',ok===false);
 check('refusal: no undo, no rebuild, no draw',log.undo===0&&log.rebuild===0&&log.draw===0);
 check('refusal: work unchanged',JSON.stringify(S)===before);
 check('refusal: the reason is the one line shown',log.msgs.length===1&&log.msgs[0]==='不能這樣做，因為…');
 check('refusal: flash hook receives the parts',JSON.stringify(log2)==='[["b1"]]');}
// a refusal without a message and a throwing plan still say something and change nothing
{const a=host(),b=host();
 const r1=runEdit({name:'甲',plan:()=>({ok:false}),host:a.host});
 const quiet=console.error;console.error=()=>{};const r2=runEdit({name:'乙',plan:()=>{throw new Error('boom');},host:b.host});console.error=quiet;
 check('refusal without message still gives feedback',r1===false&&a.log.msgs.length===1&&a.log.msgs[0].length>3);
 check('throwing plan: feedback, no undo, no change',r2===false&&b.log.msgs.length===1&&b.log.undo===0&&b.S.comps.length===2);}
// plan purity: the pipeline hands over the live work; a plan that only reads it works on frozen data, and inputs are not mutated
{const h=host();deepFreeze(h.S.comps);deepFreeze(h.S.topo.params);
 const orig=h.S.comps,snap=JSON.stringify(orig);let ok;
 try{ok=runEdit({name:'測試',plan:w=>{const comps=structuredClone(w.comps).filter(c=>c.id!=='b2');return {ok:true,comps,params:{...w.params},message:'ok'};},host:h.host});}catch(e){ok='threw '+e.message;}
 check('pure plan runs on frozen inputs',ok===true,String(ok));
 check('plan inputs are not mutated by the pipeline',orig.length===2&&JSON.stringify(orig)===snap);}
{const h=host();deepFreeze(h.S.comps);deepFreeze(h.S.topo.params);const quiet=console.error;console.error=()=>{};
 const ok=runEdit({name:'壞計畫',plan:w=>{w.comps.pop();return {ok:true,comps:w.comps,params:w.params};},host:h.host});console.error=quiet;
 check('a plan that mutates its input is stopped (frozen data throws) and nothing is committed',ok===false&&h.log.undo===0&&h.S.comps.length===2);}
// declared checks: run on both before and after
const failing=(msg)=>({id:'x',run:w=>w.comps.some(c=>c.id==='b2')?msg:''});          // fails while b2 exists
{const {S,log,host:h}=host(),calls=[];
 const ok=runEdit({name:'測試',plan:w=>({ok:true,comps:[...w.comps,bar('b3',200)],params:{...w.params,b3L:40},message:'加了'}),host:h,
   checks:[{id:'seen',run:w=>{calls.push(w.comps.length);return '有問題';}}]});
 check('declared check is run on both before and after',ok&&calls.length===2&&calls[0]===3&&calls[1]===2);}
{const {S,log,host:h}=host(),before=JSON.stringify(S);   // problem exists before and after -> does not block an unrelated edit
 const ok=runEdit({name:'測試',plan:w=>({ok:true,comps:[...w.comps],params:{...w.params},message:'好'}),host:h,checks:[failing('舊問題')]});
 check('pre-existing failing check does not block',ok===true&&log.undo===1&&S.comps.length===2);}
{const {S,log,host:h}=host();   // problem is newly created -> blocks, with the check's own words, no undo
 const ok=runEdit({name:'測試',plan:w=>({ok:true,comps:[...w.comps,bar('b2',300)],params:{...w.params},message:'好'}),host:h,
   checks:[{id:'new',run:w=>w.comps.length>2?'這次會多出問題':''}]});
 check('newly failing check blocks and explains',ok===false&&log.undo===0&&S.comps.length===2&&log.msgs.length===1&&log.msgs[0]==='這次會多出問題');}
// the shared integrity gate blocks too (new contradictions only)
{gate.setIntegrityForTest({checkWork:w=>w.comps.length>2?[{severity:'contradiction',code:'I1',ids:['b1.A'],parts:['b1'],message:'矛盾'}]:[],describe:(w,i)=>({text:i.message,far:i.parts,canon:[]})});
 const {S,log,host:h}=host(),ok=runEdit({name:'測試',plan:w=>({ok:true,comps:[...w.comps,bar('b3',300)],params:{...w.params,b3L:40}}),host:h});
 check('integrity gate refusal: no undo, no change, one line',ok===false&&log.undo===0&&S.comps.length===2&&log.msgs.length===1&&log.msgs[0].includes('矛盾'));
 await gate.loadIntegrity();}
// ---- confirm stage (O3b): between the checks and the commit
const keepB2Plan=w=>({ok:true,comps:w.comps.filter(c=>c.id!=='b2'),params:{b1L:w.params.b1L},message:'已刪除桿。'});
{const {S,log,host:h}=host(),seen=[],ok=runEdit({name:'測試',plan:keepB2Plan,host:h,confirm:after=>{seen.push([after.comps.length,S.comps.length,log.undo]);return true;}});
 check('confirm → true: commits once; confirm sees the candidate while the work and undo are untouched',ok===true&&log.undo===1&&S.comps.length===1&&JSON.stringify(seen)==='[[1,2,0]]');}
{const {S,log,host:h}=host(),before=JSON.stringify(S),ok=runEdit({name:'測試',plan:keepB2Plan,host:h,confirm:()=>false});
 check('confirm → false: nothing changes, no undo, no rebuild',ok===false&&JSON.stringify(S)===before&&log.undo===0&&log.rebuild===0&&log.draw===0);
 check('confirm → false: exactly one line 「已取消，未套用。」',log.msgs.length===1&&log.msgs[0]==='已取消，未套用。');}
{const {S,log,host:h}=host(),before=JSON.stringify(S),ok=runEdit({name:'測試',plan:keepB2Plan,host:h,confirm:()=>({ok:false,message:'孔位對不上。'})});
 check('confirm → {ok:false,message}: refused with that one line, nothing changes',ok===false&&JSON.stringify(S)===before&&log.undo===0&&log.msgs.join('|')==='孔位對不上。');}
{const {S,log,host:h}=host(),ok=runEdit({name:'測試',plan:keepB2Plan,host:h,confirm:()=>{throw new Error('boom');}});
 check('a throwing confirm counts as declined (never commits)',ok===false&&log.undo===0&&S.comps.length===2&&log.msgs.length===1);}
{const {S,log,host:h}=host(),alt=[bar('b1',0),bar('b9',300)],ok=runEdit({name:'測試',plan:keepB2Plan,host:h,confirm:()=>({comps:alt,params:{b1L:40,b9L:40}})});
 check('confirm → {comps,…}: the replacement candidate is what gets committed',ok===true&&S.comps.map(c=>c.id).join()==='b1,b9'&&S.topo.params.b9L===40&&log.undo===1);}
{const {S,log,host:h}=host(),p=runEdit({name:'測試',plan:keepB2Plan,host:h,confirm:async()=>true});
 check('async confirm: runEdit returns a promise and nothing is written yet',typeof p.then==='function'&&S.comps.length===2&&log.undo===0);
 check('async confirm: commits once after it resolves',await p===true&&S.comps.length===1&&log.undo===1);}
{const {S,log,host:h}=host(),p=runEdit({name:'測試',plan:keepB2Plan,host:h,confirm:async()=>false});
 check('async confirm declined: nothing changes, one 已取消 line',await p===false&&S.comps.length===2&&log.undo===0&&log.msgs.join()==='已取消，未套用。');}
{const {S,log,host:h}=host(),p=runEdit({name:'測試',plan:keepB2Plan,host:h,confirm:async()=>{S.comps=[...S.comps];return true;}});
 check('async confirm: the work changed meanwhile → cancelled, not overwritten',await p===false&&S.comps.length===2&&log.undo===0&&log.msgs.length===1);}
// object identity, quiet success, unchanged
{const {S,log,host:h}=host(),held=S.comps[0],ok=runEdit({name:'尺寸',host:h,plan:w=>({ok:true,comps:w.comps.map(c=>c.id==='b1'?{...c,name:'新名'}:c),params:w.params,keepIdentity:true,clearSelection:false,message:''})});
 check('keepIdentity: a part that already exists keeps its object and takes the new fields',ok&&S.comps[0]===held&&held.name==='新名');
 check('message "" : success without an extra line; selection kept',log.msgs.length===0&&S.selectedLinkId==='b1');}
{const {S,log,host:h}=host(),ok=runEdit({name:'尺寸',host:h,plan:w=>({ok:true,comps:w.comps,params:w.params,pruneRefs:false})});
 check('pruneRefs:false leaves existing dangling references alone',ok&&S.topo.tracePoints.includes('gone.A'));}
{const {S,log,host:h}=host(),ok=runEdit({name:'尺寸',host:h,plan:()=>({ok:true,unchanged:true})});
 check('unchanged: no undo, no write, no line',ok===false&&log.undo===0&&log.msgs.length===0&&log.rebuild===0);}
// ---- shape:'parts' (M1 of docs/SDD-MOTOR-PART.md): convert in once, plan, convert out once, then the same checks/commit as before
{const {registerShape}=await import('../js/blocks/edit-pipeline.js');
 const calls={enter:0,leave:0};registerShape('count',{enter:w=>{calls.enter++;return {...w,comps:w.comps.map(c=>({...c,seen:true}))};},leave:(comps,before)=>{calls.leave++;return comps.map(({seen,...c})=>c);}});
 const seen=[];
 let {S,log,host:h}=host(),ok=runEdit({name:'測試',shape:'count',plan:w=>{seen.push(w.comps.every(c=>c.seen));return removeB2(w);},host:h});
 check('shape: enter once before the plan, leave once after, the plan sees the converted work',ok&&calls.enter===1&&calls.leave===1&&seen[0]===true);
 check('shape: the committed work is the converted-back one, one undo, one line',S.comps.length===1&&!('seen' in S.comps[0])&&log.undo===1&&log.msgs.join()==='已刪除桿。');
 calls.enter=calls.leave=0;({S,log,host:h}=host());
 ok=runEdit({name:'測試',shape:'count',plan:()=>({ok:false,message:'不行'}),host:h});
 check('shape: a refusal converts nothing back',ok===false&&calls.enter===1&&calls.leave===0&&log.msgs.join()==='不行'&&S.comps.length===2);
 calls.enter=calls.leave=0;({S,log,host:h}=host());
 ok=runEdit({name:'測試',shape:'count',plan:()=>({ok:true,unchanged:true}),host:h});
 check('shape: unchanged converts nothing back, says nothing',ok===false&&calls.leave===0&&log.msgs.length===0&&log.undo===0);
 ({S,log,host:h}=host());const quiet=console.error;console.error=()=>{};
 ok=runEdit({name:'測試',shape:'no-such-shape',plan:removeB2,host:h});console.error=quiet;
 check('shape: an unregistered shape is refused with one line, nothing written (never silent)',ok===false&&log.msgs.length===1&&log.undo===0&&S.comps.length===2);
 ({S,log,host:h}=host());ok=runEdit({name:'測試',plan:w=>{seen.push(w.comps.some(c=>c.seen));return removeB2(w);},host:h});
 check('without shape the plan gets the live work, as before',ok&&seen.at(-1)===false);}
{const {readFileSync}=await import('node:fs');
 const {normalizeSnapshot}=await import('../js/blocks/schema.js'),{readStoredProject}=await import('../js/blocks/project-envelope.js');
 await import('../js/blocks/plan-shape.js');
 for(const f of ['motor-off-plate','delete-blocked','connected-resize','fourbar-drag-rocker','free-bar-blocks-motor']){
  const w=normalizeSnapshot(readStoredProject(JSON.parse(readFileSync(new URL(`./fixtures/${f}.json`,import.meta.url),'utf8'))));
  const S={comps:structuredClone(w.comps),modules:[],topo:{params:{...w.params},tracePoints:[],loads:[],dimensions:[]},fabrication:w.fabrication,counter:1,selectedLinkId:null,selectedTriangleId:null,selectedSliderId:null,selectedNodeId:null};
  const orig=structuredClone(S.comps),msgs=[],ok=runEdit({name:'不動',shape:'parts',plan:x=>({ok:true,comps:x.comps,params:x.params,clearSelection:false,pruneRefs:false,message:''}),
   host:{S,transient:m=>msgs.push(m),pushUndo(){},pause(){},rebuild(){},draw(){}}});
  let eq=false;try{(await import('node:assert/strict')).deepEqual(S.comps,orig);eq=true;}catch(e){console.log(f,String(e.message).slice(0,300));}
  check(`shape parts: a plan that does nothing round-trips ${f} to deep-equal legacy data`,ok&&eq&&msgs.length===0);}}
report('edit-pipeline');
