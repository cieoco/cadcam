// Pack O4 (gap #8): on desktop, clicking the same spot again selects the next overlapping part underneath; one hint per session.
import {check,report} from './_harness.mjs';
const {installOverlapCycle,stackAt,nextUnder}=await import('../js/blocks/overlap-cycle.js');
const comps=[{id:'Top'},{id:'Mid'},{id:'Low'}];
const el=id=>({getAttribute:k=>k==='data-pick-component'?id:null,closest:()=>null});
let under=[el('Top'),el('Mid'),el('Low')];
const handlers={};
const svg={addEventListener:(t,f)=>{handlers[t]=f;},contains:()=>true,ownerDocument:{elementsFromPoint:()=>under}};
let selected='',said=[],picked=[],activeNow=true;
installOverlapCycle({svg,comps:()=>comps,selectedId:()=>selected,select:id=>{picked.push(id);selected=id;},active:()=>activeNow,say:m=>said.push(m)});
// the existing handler selects the top part on pointerdown; emulate that between our capture-phase down and up
const tap=(x=100,y=100,{type='mouse',target={closest:()=>null},moveTo}={})=>{
  const before=selected;handlers.pointerdown({pointerType:type,button:0,clientX:x,clientY:y,target});
  selected=under[0]?.getAttribute('data-pick-component')||selected;                       // the normal click picks the top part
  handlers.pointerup({clientX:moveTo?moveTo[0]:x,clientY:moveTo?moveTo[1]:y});return before;};
check('stackAt lists parts top to bottom without duplicates',stackAt(svg,0,0,comps).join()==='Top,Mid,Low'&&stackAt({...svg,ownerDocument:{elementsFromPoint:()=>[el('Top'),el('Top'),el('Ghost')]}},0,0,comps).join()==='Top');
check('nextUnder: next only when the selected one is in the stack and has one below',nextUnder(['A','B','C'],'A')==='B'&&nextUnder(['A','B','C'],'C')===null&&nextUnder(['A','B'],'Z')===null);
tap();
check('first click: normal pick of the top part, nothing re-selected, one hint naming the count',selected==='Top'&&picked.length===0&&said.join()==='這裡有 3 個零件重疊；再點一次可選到下面的零件。');
tap();
check('second click at the same spot selects the part underneath',picked.join()==='Mid'&&selected==='Mid');
tap();
check('third click goes one further down',picked.join()==='Mid,Low');
tap();
check('fourth click wraps back to the top (normal pick) and does not re-select',picked.join()==='Mid,Low'&&selected==='Top');
check('the hint is shown only once per session',said.length===1);
tap(300,300);
check('a click elsewhere starts over: no cycling on the first click there',picked.length===2);
tap(300,300,{moveTo:[330,330]});
check('a drag is never treated as a click',picked.length===2);
under=[el('Top')];tap(10,10);tap(10,10);
check('a single part never cycles',picked.length===2);
under=[el('Top'),el('Mid')];selected='';tap(50,50);
tap(50,50,{type:'touch'});
check('touch (phone has its own picker) is ignored',picked.length===2);
tap(50,50,{target:{closest:()=>({})}});
check('clicking a hole/node is ignored',picked.length===2);
activeNow=false;tap(50,50);tap(50,50);
check('inactive while a tool is open (drawing, placing...)',picked.length===2);
{const h2={};let node=true,n=0;const svg2={...svg,addEventListener:(t,f)=>{h2[t]=f;}};
 installOverlapCycle({svg:svg2,comps:()=>comps,selectedId:()=>'',select:()=>n++,active:()=>true,say:()=>n++,nodeSelected:()=>node});
 under=[el('Top'),el('Mid')];h2.pointerdown({pointerType:'mouse',button:0,clientX:5,clientY:5,target:null});h2.pointerup({clientX:5,clientY:5});
 check('a tap whose normal handling selected a hole says and selects nothing',n===0);}
report('overlap-cycle');
