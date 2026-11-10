// 指標事件路由回歸：以 capture/target/bubble 的假 SVG 驗證，不代表真實觸控硬體驗收。
import { check, report } from './_harness.mjs';
import * as Input from '../js/blocks/input.js';
import * as View from '../js/blocks/view.js';
import {isFreeBody,movePointById,updatePointCoordsById,pointCoords} from '../js/blocks/model.js';
import { S } from '../js/blocks/state.js';

globalThis.document = Object.assign(new EventTarget(),{ getElementById: id => ['lenEditor', 'gearEditor', 'sliderBaseBtn', 'linkToRailBtn'].includes(id) ? { style: {} } : null });
globalThis.DOMPoint = class {
  constructor(x, y) { this.x = x; this.y = y; }
  matrixTransform() { return this; }
};
let nextRaf = 0;
const rafs = new Map();
globalThis.requestAnimationFrame = fn => { rafs.set(++nextRaf, fn); return nextRaf; };
globalThis.cancelAnimationFrame = id => rafs.delete(id);
const flush = () => { const pending = [...rafs.values()]; rafs.clear(); pending.forEach(fn => fn()); };
const noop = () => {};
let mobile = false, openedEditor = 0, mergeCount = 0;
let snapPoint=null;
const listeners = new Map();
const svg = {
  getBoundingClientRect: () => ({left:0,right:1000,top:0,bottom:1000}), querySelectorAll: () => [], contains: () => false, ownerDocument: {elementsFromPoint: () => []},
  addEventListener(type, fn, options) {
    const list = listeners.get(type) || [];
    list.push({ fn, capture: options === true || options?.capture === true }); listeners.set(type, list);
  },
  setPointerCapture: noop,
  getScreenCTM: () => ({ a: 1, d: 1, inverse: () => ({}) })
};
function emit(type, id, x, y, target = noop, targetElement = null) {
  const event = { type, pointerId: id, pointerType: 'touch', clientX: x, clientY: y,
    target: targetElement, preventDefault: noop, stopPropagation() { this.stopped = true; },
    stopImmediatePropagation() { this.stopped = true; this.immediate = true; } };
  const list = listeners.get(type) || [];
  for (const item of list.filter(item => item.capture)) { item.fn(event); if (event.immediate) break; }
  if (!event.stopped) target(event);
  if (!event.stopped) for (const item of list.filter(item => !item.capture)) { item.fn(event); if (event.immediate) break; }
}
Input.init({ selectLink:noop, selectTriangle:noop, movePointById:(id,dx,dy)=>movePointById(S.comps,id,dx,dy), svg, draw: noop, rebuild: noop, pause: noop, cancelMotorMode: noop, deselectLink: noop,
  worldFromEvent: e => ({ x: e.clientX, y: e.clientY }), pointCoords: () => pointCoords(S.comps), displayCoords:()=>({...pointCoords(S.comps),...(snapPoint?{Target:snapPoint}:{})}), mobilePrompt: () => mobile,
  updatePointCoordsById:(id,x,y)=>updatePointCoordsById(S.comps,id,x,y),
  snapshotStr: () => JSON.stringify({comps:S.comps,params:S.topo.params,theta:S.theta,motorAngles:S.motorAngles}), updateUndoBtn: noop, nearestDisplayTo: (id,exclude,world) => snapPoint&&world&&Math.hypot(world.x-snapPoint.x,world.y-snapPoint.y)<5?'Target':null,
  frameNodeIds: () => new Set(), recomputeLengths: noop, mergePoints: () => mergeCount++, pointIsGround: id => S.comps.some(c=>c.type==='motor'&&c.p1?.id===id),
  setSliderDetailRows: noop, openMobileEditPanel: () => openedEditor++
});

View.resetView();
emit('pointerdown', 1, 100, 100); emit('pointerdown', 2, 200, 100);
emit('pointermove', 2, 250, 100); flush();
check('背景雙指拉開會放大', View.getScale() > 1.4);
emit('pointerup', 1, 100, 100); emit('pointerup', 2, 250, 100);

View.resetView();
const anchorBefore = View.worldFromScreen(150, 100);
emit('pointerdown', 11, 100, 100); emit('pointerdown', 12, 200, 100);
emit('pointermove', 11, 120, 140); emit('pointermove', 12, 220, 140); flush();
const anchorAfter = View.worldFromScreen(170, 140);
check('雙指平移保留中心所對應的世界位置', Math.hypot(anchorBefore.x - anchorAfter.x, anchorBefore.y - anchorAfter.y) < 1e-8);
emit('pointercancel', 11, 120, 140); emit('pointercancel', 12, 220, 140);

View.resetView();
emit('pointerdown', 3, 100, 100, e => e.stopPropagation());
emit('pointerdown', 4, 200, 100, e => e.stopPropagation());
emit('pointermove', 4, 250, 100); flush();
check('零件阻止冒泡時仍能開始雙指縮放', View.getScale() > 1.4);
emit('pointerup', 3, 100, 100); emit('pointerup', 4, 250, 100);

S.comps=[{id:'frame',type:'bar',p1:{id:'P1',type:'fixed',x:0,y:0},p2:{id:'P2',type:'fixed',x:80,y:0},lenParam:'L'}];
S.topo.params={L:80};
S.dragFrame = true; S.dragLastWorld = { x: 100, y: 100 }; S.preDragSnap = JSON.stringify({comps:S.comps,params:S.topo.params,theta:S.theta,motorAngles:S.motorAngles});
S.comps[0].p1.x=20;
const undoBefore=S.undoStack.length;
emit('pointerdown', 5, 100, 100); emit('pointerdown', 6, 200, 100);
check('第二指接手時清除機架拖曳', !S.dragFrame && S.dragLastWorld === null);
check('第二指接手還原未完成位移且不新增復原', S.comps[0].p1.x===0 && S.undoStack.length===undoBefore);
emit('pointercancel', 5, 100, 100); emit('pointercancel', 6, 200, 100);
S.dragFrame = false;

S.preDragSnap=JSON.stringify({comps:S.comps,params:S.topo.params});
S.comps[0].p1.x=13.25;S.dragId='P1';
const escape=new Event('keydown',{cancelable:true});Object.assign(escape,{key:'Escape'});document.dispatchEvent(escape);
check('Escape 還原接點草稿且不新增復原',S.comps[0].p1.x===0&&S.dragId===null&&S.preDragSnap===null&&S.undoStack.length===undoBefore);

// 第一指放開後，第二指仍屬於同一次 pinch；不能落入單指移動或放開合併。
// 即使其他零件 handler 留有拖曳狀態，也不能讓最後一指放開執行吸附合併。
emit('pointerdown', 7, 100, 100); emit('pointerdown', 8, 200, 100);
emit('pointerup', 7, 100, 100);
S.dragId = 'unexpected'; S.snapTarget = 'target';
emit('pointerup', 8, 200, 100);
check('雙指最後放開不執行單指合併路徑', mergeCount === 0);
S.dragId = null; S.snapTarget = null;

emit('pointerdown', 13, 100, 100, e => Input.onNodeDown(e, 'P1'));
emit('pointerdown', 14, 200, 100);
emit('pointermove', 14, 250, 100); flush();
check('pinch 不會喚醒尚未越過拖曳門檻的接點', S.dragId === null);
emit('pointerup', 13, 100, 100);
emit('pointermove', 14, 280, 100); flush();
check('第一指離開後剩餘手指不會恢復接點拖曳', S.dragId === null);
emit('pointerup', 14, 280, 100);

// 真正走接點按下 handler，驗證手機編輯面板不在拖曳起點改變畫布尺寸。
mobile = true;
openedEditor = 0;
Input.onNodeDown({ clientX: 100, clientY: 100, pointerId: 9, pointerType: 'touch', preventDefault: noop, stopPropagation: noop }, 'P1');
check('手機按下接點時不提前展開編輯面板', openedEditor === 0);
emit('pointerup', 9, 100, 100);
check('手機放開接點後才展開編輯面板', openedEditor === 1);
mobile = false;
View.resetView();
const beforePan = View.worldFromScreen(100, 100);
emit('pointerdown', 21, 100, 100);
emit('pointermove', 21, 140, 130); flush();
const afterPan = View.worldFromScreen(140, 130);
check('單指空白平移不改世界錨點', Math.hypot(beforePan.x-afterPan.x,beforePan.y-afterPan.y)<1e-8);
emit('pointercancel',21,140,130);
const stopped = View.worldFromScreen(140,130);
emit('pointermove',21,200,200); flush();
check('取消後不殘留畫布拖曳', JSON.stringify(stopped)===JSON.stringify(View.worldFromScreen(140,130)));
emit('pointerdown',22,100,100);
S.drawActive=true;
emit('pointerdown',23,200,100);
check('第二指會取消未完成畫桿', S.drawActive===false);
emit('pointerup',22,100,100);emit('pointerup',23,200,100);
mobile = true;
let bodyPicked = false;
const motorTarget = { getAttribute: name => name === 'data-motor-hit' ? 'ServoO' : null };
emit('pointerdown', 30, 120, 100, () => bodyPicked = true, motorTarget);
check('觸控圓環直接選軸心，不落到後面的板件', S.selectedNodeId === 'ServoO' && !bodyPicked);
emit('pointerdown', 31, 200, 100, () => bodyPicked = true, motorTarget);
check('圓環上的第二指仍優先縮放，不啟動第二次零件選取', !bodyPicked && S.dragId === null);
emit('pointerup', 30, 120, 100); emit('pointerup', 31, 200, 100);
mobile=false;
S.modules=[];
const plate={id:'Plate',type:'triangle',p1:{id:'a',type:'floating',x:0.25,y:0.5},p2:{id:'b',type:'floating',x:80.25,y:0.5},p3:{id:'c',type:'floating',x:0.25,y:40.5},holes:[{id:'h',u:8,v:8,type:'floating'}]};
S.comps=[structuredClone(plate)];S.topo.params={g:80,r1:40,r2:Math.hypot(80,40)};
const bodyUndo=S.undoStack.length;
const bodyDown=e=>{e.stopPropagation();Input.startFreeLinkDrag(e,'Plate');};
emit('pointerdown',40,10,10,bodyDown);emit('pointerup',40,10,10);
check('只點板身不新增 undo',S.undoStack.length===bodyUndo);
emit('pointerdown',41,10,10,bodyDown);emit('pointermove',41,25,30);flush();emit('pointerup',41,25,30);
check('板身拖曳整片平移且保留小數、孔距及局部孔',S.comps[0].p1.x===15.25&&S.comps[0].p2.x===95.25&&S.comps[0].p3.y===60.5&&S.comps[0].holes[0].u===8);
check('整片拖曳一次 undo 可還原所有頂點',S.undoStack.length===bodyUndo+1&&JSON.stringify(JSON.parse(S.undoStack.at(-1)).comps[0])===JSON.stringify(plate));
const moved=JSON.stringify(S.comps);
emit('pointerdown',42,10,10,bodyDown);emit('pointermove',42,40,40);flush();
const cancelBody=new Event('keydown',{cancelable:true});Object.assign(cancelBody,{key:'Escape'});document.dispatchEvent(cancelBody);emit('pointerup',42,40,40);
check('取消整片拖曳還原',JSON.stringify(S.comps)===moved&&S.undoStack.length===bodyUndo+1);
S.comps=[structuredClone(plate)];S.comps[0].holes[0].type='fixed';
check('局部固定孔阻止整片移動',!isFreeBody(S.comps,S.comps[0]));
S.comps=[structuredClone(plate),{id:'attach',type:'bar',p1:{id:'h'},p2:{id:'z'}}];
check('局部孔已接其他桿件不能整片移動',!isFreeBody(S.comps,S.comps[0]));
S.comps=[structuredClone(plate),{id:'actuator',a:{componentId:'Plate'}}];
check('致動器間接引用阻止整片移動',!isFreeBody(S.comps,S.comps[0]));
S.comps=[structuredClone(plate)];
check('模組引用阻止整片移動',!isFreeBody(S.comps,S.comps[0],[{members:['Plate']}]));
mobile=true;
const localStart=S.undoStack.length;
Input.onNodeDown({clientX:10,clientY:10,pointerId:43,pointerType:'touch',preventDefault:noop,stopPropagation:noop},'h');emit('pointermove',43,35,30);flush();emit('pointerup',43,35,30);
check('手機拖局部格孔會平移自由板而非吞掉手勢',S.comps[0].p1.x===25.25&&S.comps[0].p3.y===60.5&&S.undoStack.length===localStart+1);
const beforePickNode=S.selectedNodeId;
let syringePickReached=false;
svg.querySelector=selector=>selector==='[data-syringe-pick-holes]'?{}:null;
emit('pointerdown',44,120,100,e=>{syringePickReached=true;e.stopPropagation();},motorTarget);
emit('pointerup',44,120,100);
check('針筒改接時手機一般孔選取讓出事件',syringePickReached&&S.selectedNodeId===beforePickNode);
delete svg.querySelector;
for(const type of ['tt','n20','mg995']){
 mobile=false;const motor={id:'Motor',type:'motor',motorType:type,p1:{id:'M',type:'fixed',physicalMotor:'1',x:12.5,y:8.25},motorMount:{center:'M',angleDeg:17.25}};
 S.comps=[structuredClone(motor),structuredClone(plate)];S.modules=[];const original=JSON.stringify(S.comps),count=S.undoStack.length;
 const down=e=>Input.onNodeDown(e,'M');
 emit('pointerdown',60,30,20,down);emit('pointerup',60,30,20);check(type+' 點本體只選取、不跳位',JSON.stringify(S.comps)===original&&S.selectedNodeId==='M'&&S.undoStack.length===count);
 emit('pointerdown',61,30,20,down);emit('pointermove',61,55,50);flush();emit('pointerup',61,55,50);
 check(type+' 固定模擬軸可拖動獨立本體、保留抓取偏移與角度',S.comps[0].p1.x===37.5&&S.comps[0].p1.y===38.25&&S.comps[0].motorMount.angleDeg===17.25);
 check(type+' 不拉動旁邊板件且只有一次復原',JSON.stringify(S.comps[1])===JSON.stringify(plate)&&S.undoStack.length===count+1&&JSON.stringify(JSON.parse(S.undoStack.at(-1)).comps)===original);
 const beforeCancel=JSON.stringify(S.comps);emit('pointerdown',62,30,20,down);emit('pointermove',62,75,60);flush();emit('pointercancel',62,75,60);
 check(type+' 取消拖動回復原位置',JSON.stringify(S.comps)===beforeCancel&&S.undoStack.length===count+1);
 snapPoint={x:60.75,y:55.5};const snapBefore=JSON.stringify(S.comps),snapUndo=S.undoStack.length;
 emit('pointerdown',63,30,20,down);emit('pointermove',63,52,36);flush();
 check(type+' 軸心靠近孔時吸附且保留馬達身分',S.snapTarget==='Target'&&S.comps[0].p1.x===60.75&&S.comps[0].p1.y===55.5&&S.comps[0].p1.id==='M');
 emit('pointermove',63,80,70);flush();
 check(type+' 離開吸附不累積偏移',S.snapTarget===null&&S.comps[0].p1.x===87.5&&S.comps[0].p1.y===88.25);
 emit('pointermove',63,52,36);flush();emit('pointerup',63,52,36);
 check(type+' 放開對齊只存一次位置且不暗改裝配',S.comps[0].p1.x===60.75&&S.comps[0].motorMount.center==='M'&&!S.comps[0].motorMount.frameBody&&mergeCount===0&&S.snapTarget===null&&S.undoStack.length===snapUndo+1&&JSON.stringify(JSON.parse(S.undoStack.at(-1)).comps)===snapBefore);
 const snapped=JSON.stringify(S.comps);snapPoint={x:85,y:75};emit('pointerdown',64,30,20,down);emit('pointermove',64,53,40);flush();emit('pointercancel',64,53,40);
 check(type+' 取消吸附還原已保存位置',JSON.stringify(S.comps)===snapped&&S.snapTarget===null&&S.undoStack.length===snapUndo+1);
 Input.moveNodeTo('M',{x:85.125,y:75.375},{snap:false});
 check(type+' 精確座標不被附近孔改寫',S.comps[0].p1.x===85.125&&S.comps[0].p1.y===75.375&&S.snapTarget===null);snapPoint=null;
 S.comps[0].motorMount.frameBody='Plate';check(type+' 已固定到板件不可自由拖動',!isFreeBody(S.comps,S.comps[0]));delete S.comps[0].motorMount.frameBody;
 S.comps.push({id:'Attached',type:'bar',p1:{id:'M'},p2:{id:'Other'}});check(type+' 共用軸心不可當自由本體拖走',!isFreeBody(S.comps,S.comps[0]));
}
report('input-gestures');
