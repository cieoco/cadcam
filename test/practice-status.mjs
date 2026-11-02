// 練習檔狀態：只有改到機構本身才算改過（量尺等只看不改的變動不算）；未註冊的 unitN-start 要能結束。
import {isMechanismEdit,invalidPoseStatus} from '../js/blocks/status-text.js';
import {createExampleController} from '../js/blocks/example-controller.js';
import {offerExampleFromUrl} from '../js/blocks/example-entry.js';
import {check,report} from './_harness.mjs';
const base={comps:[{id:'L1',type:'bar',p1:{id:'A',x:0,y:0},p2:{id:'B',x:50,y:0}}],params:{L1:50},modules:[],counter:2};
const clone=v=>JSON.parse(JSON.stringify(v));
const withRuler={...clone(base),dimensions:[{id:'D1',kind:'height',a:{pointId:'B'},baseline:'ground',name:'高度 1'}]};
check('加量尺（作品多了 dimensions）不算改過機構',!isMechanismEdit(base,withRuler));
check('馬達角度、專案名稱等看得到但不改機構的欄位不算改過',!isMechanismEdit(base,{...clone(base),motorAngles:{1:30},projectName:'練習'}));
const moved=clone(base);moved.comps[0].p2.x=60;
check('改零件位置算改過',isMechanismEdit(base,moved));
check('改尺寸參數算改過',isMechanismEdit(base,{...clone(base),params:{L1:60}}));
check('加模組算改過',isMechanismEdit(base,{...clone(base),modules:[{id:'M1'}]}));
check('加零件算改過',isMechanismEdit(base,{...clone(base),comps:[...clone(base).comps,{id:'L2',type:'bar'}]}));
const stay=invalidPoseStatus({fromPractice:true,edited:isMechanismEdit(base,withRuler)});
check('練習檔加量尺後仍是黃色提示',stay.state==='warn'&&/練習/.test(stay.text));
check('練習檔改了機構才是紅色',invalidPoseStatus({fromPractice:true,edited:isMechanismEdit(base,moved)}).state==='error');

// 未註冊的 unitN-start：懶載入起始練習檔一次後，回報找不到並結束（不無限重試）。
const waitFor=(fn,ms=5000)=>new Promise((ok,no)=>{const t0=Date.now();const tick=()=>fn()?ok(true):Date.now()-t0>ms?no(new Error('timeout')):setTimeout(tick,10);tick();});
{
  const notes=[];
  const c=createExampleController({applySnapshot(){},insertModule(){},notify:m=>notes.push(m),isMobile:()=>false,showBuildPanel(){}});
  const r=c.requestLoad('unit2-start');
  let done=true;try{await waitFor(()=>notes.length>0);}catch{done=false;}
  await new Promise(r=>setTimeout(r,100));
  check('requestLoad 未註冊的起始檔：回報「找不到範例」並結束',r===true&&done&&notes.length===1&&notes[0]==='找不到範例');
}
{
  const notes=[],replaced=[];
  const location={href:'http://x/blocks.html?example=unit2-start'};
  const history={state:null,replaceState:(s,t,u)=>replaced.push(u)};
  offerExampleFromUrl({loadExample(){},insertModule(){},notify:m=>notes.push(m),location,history,document:{}});
  let done=true;try{await waitFor(()=>notes.length>0);}catch{done=false;}
  await new Promise(r=>setTimeout(r,100));
  check('?example=unit2-start：提示找不到、清掉網址參數並結束',done&&notes.length===1&&/找不到/.test(notes[0])&&replaced.length===1&&!/example=/.test(replaced[0]));
}
report('practice-status');
