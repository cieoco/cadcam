// 學生回報「馬達和連桿沒法解除連接」（2026-11-10）。fixture 為學生原檔：解除位置鎖定後把座板孔上的
// 馬達軸心 Blank133_H24_32 拖到座板外，軸心孔號不變、位置與座板原孔不符。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeSnapshot,toSnapshot,alignSavedInputPhase} from '../js/blocks/schema.js';
import {readStoredProject,storedProject} from '../js/blocks/project-envelope.js';
import {compileTopology} from '../js/core/topology.js';
import {solveTopology} from '../js/multilink/solver.js';
import {holeWorld} from '../js/core/local-holes.js';
import {planActuatorPlateHoles} from '../js/blocks/actuator-plate-holes.js';
import {planMotorInstallation,actuatorHostPoints} from '../js/blocks/actuator-installation.js';
import {offPlateMotors,offPlateMessage,planMotorRelease,planMotorReturn,planMotorLeave,run} from '../js/blocks/motor-release.js';
import {S} from '../js/blocks/state.js';
import {loadIntegrity} from '../js/blocks/integrity-gate.js';
await loadIntegrity();   // C4: the commit gate is live; a repair of an already broken work must not be refused

class FakeElement{constructor(){this.children=[];this.style={};this.dataset={};this.attributes={};this.textContent='';}
 replaceChildren(...c){this.children=c;this.textContent=c.filter(x=>typeof x==='string').join('');}append(...c){this.children.push(...c);}after(){}setAttribute(k,v){this.attributes[k]=v;}}
const nodes=new Map();
globalThis.document={getElementById:id=>nodes.get(id)||null,createElement:()=>new FakeElement()};
nodes.set('solveBanner',Object.assign(new FakeElement(),{after:n=>nodes.set('motorMountNotice',n)}));

const read=name=>JSON.parse(readFileSync(new URL(`./fixtures/${name}`,import.meta.url),'utf8'));
const load=name=>alignSavedInputPhase(normalizeSnapshot(readStoredProject(read(name))));
const solve=s=>solveTopology(compileTopology(s.comps,{params:{...s.params}},new Set()),{thetaDeg:0,motorAngles:{1:0}});
const comp=(s,id)=>s.comps.find(c=>c.id===id);
const near=(a,b,m)=>assert.ok(Math.abs(a-b)<1e-6,`${m}: ${a} != ${b}`);
const reopen=s=>alignSavedInputPhase(normalizeSnapshot(readStoredProject(JSON.parse(JSON.stringify(storedProject(toSnapshot(s.comps,{params:s.params},139,{fabrication:s.fabrication})))))));
const lengths=s=>{const r=solve(s);assert.ok(r.isValid,r.errorReason);for(const c of s.comps.filter(c=>c.type==='bar')){const a=r.points[c.p1.id],b=r.points[c.p2.id];near(Math.hypot(b.x-a.x,b.y-a.y),s.params[c.lenParam],c.id);}return r;};

const work=load('motor-off-plate.json'),plate=comp(work,'Blank133'),SHAFT='Blank133_H24_32';
// 1. 偵測：軸心孔號是座板格孔，但不在那個孔上。
const [item]=offPlateMotors(work.comps);
assert.equal(item.id,'Blank135');assert.equal(item.center,SHAFT);
assert.ok(Math.hypot(item.world.x-item.shaft.x,item.world.y-item.shaft.y)>60);
assert.equal(offPlateMessage(item),'馬達軸心不在「矩形板材」的原孔（長向第4、直向第5孔）上，畫面與製作會對不起來。請選「把馬達放回座板原孔」或「讓馬達離開座板（改成獨立固定點）」，也可以刪除馬達。');
assert.deepEqual(offPlateMotors(load('connected-resize.json').comps),[],'consistent work is not flagged');

// 2. 解除連接：即使安裝位置無效也能解除並保存；馬達與桿件都保留。
const points=solve(work).points;
{
 const hostEnd=actuatorHostPoints(plate).find(p=>p.id===SHAFT).key,req={type:'tt',motorId:'1',existingId:'Blank135',hostId:'Blank133',hostEnd,face:'back',orientation:'follow-frame',angleDeg:0,reversed:false,outputEnd:'p2',start:0,end:90,angle:0};
 assert.equal(planMotorInstallation(work,{...req,outputId:'Blank135'},points,{}).ok,false,'keeping the broken mount is still refused');
 const ui=planMotorInstallation(work,{...req,outputId:'',position:null},points,{});
 assert.ok(ui.ok&&ui.release,'the install panel release is saveable');assert.ok(ui.mountIssue);
}
const released=planMotorRelease(work,'Blank135',points,{});
assert.ok(released.ok,released.message);
assert.equal(released.message,'已解除「孔格桿件」與馬達的連接；馬達與桿件都保留，可再接回，也可按復原。');
{const s={...work,comps:released.comps,params:released.params},bar=comp(s,'Blank135'),motor=s.comps.find(c=>c.type==='motor');
 assert.ok(!bar.isInput&&!bar.physicalMotor&&!bar.motorMount);assert.notEqual(bar.p2.id,SHAFT);assert.equal(bar.p1.id,'Blank135.A');assert.equal(comp(s,'Blank136').p1.id,'Blank135.A');
 assert.ok(motor&&motor.motorMount.center===SHAFT);near(motor.p1.x,item.shaft.x,'motor stays where it is drawn');
 assert.equal(solve(s).isValid,true);const again=reopen(s);assert.deepEqual(again.comps,s.comps,'save/reopen');}
// 解除後可修復離開座板的馬達。
{const s={...work,comps:released.comps,params:released.params},m=s.comps.find(c=>c.type==='motor');assert.equal(offPlateMotors(s.comps)[0].id,m.id);
 const back=planMotorReturn(s,m.id);assert.ok(back.ok,back.message);assert.deepEqual(offPlateMotors(back.comps),[]);}

// 3. 把馬達放回座板原孔：軸心回到原孔，只接在馬達上的桿件一起平移，長度與相對姿勢不變。
const back=planMotorReturn(work,'Blank135');
assert.ok(back.ok,back.message);assert.equal(back.message,'已把馬達與接在它上面的桿件放回座板原孔，可按復原。');
{const s={...work,comps:back.comps,params:back.params},hole=holeWorld(plate,[...plate.holes,...plate.standardBlank.mountHoles].find(h=>h.id===SHAFT));
 assert.deepEqual(offPlateMotors(s.comps),[]);const bar=comp(s,'Blank135');near(bar.p2.x,hole.x,'shaft x');near(bar.p2.y,hole.y,'shaft y');assert.equal(bar.p2.id,SHAFT);assert.ok(bar.isInput);
 const dx=hole.x-item.shaft.x;for(const [id,k] of [['Blank135','p1'],['Blank136','p2'],['Blank137','p2']])near(comp(s,id)[k].x-comp(work,id)[k].x,dx,`${id} moved with the motor`);
 const r=lengths(s);near(Math.hypot(r.points['Blank135.A'].x-hole.x,r.points['Blank135.A'].y-hole.y),40,'crank on the hole');
 assert.ok(planActuatorPlateHoles(s).ok,'mount checks pass again');assert.deepEqual(reopen(s).comps,s.comps);}

// 4. 讓馬達離開座板：軸心改成獨立固定點，保持目前位置，座板原孔釋出。
const leave=planMotorLeave(work,'Blank135');
assert.ok(leave.ok,leave.message);
{const s={...work,comps:leave.comps,params:leave.params},bar=comp(s,'Blank135');
 assert.notEqual(bar.p2.id,SHAFT);assert.equal(bar.p2.type,'fixed');assert.equal(bar.motorMount.center,bar.p2.id);assert.ok(!bar.motorMount.frameBody);
 near(bar.p2.x,item.shaft.x,'shaft keeps its drawn x');near(bar.p2.y,item.shaft.y,'shaft keeps its drawn y');
 assert.deepEqual(offPlateMotors(s.comps),[]);const host=comp(s,'Blank133');assert.ok(!host.motorMountPoint);assert.ok(host.holes.some(h=>h.id===SHAFT),'plate hole released');
 lengths(s);assert.ok(planActuatorPlateHoles(s).ok);assert.deepEqual(reopen(s).comps,s.comps);}

// 5. 畫面接頭：每個動作一次復原；提示改由 integrity-hints.js 顯示（test/integrity-hints.mjs），這裡只確認修復後會要求重新檢查。
for(const action of ['release','back','leave']){
 const s=load('motor-off-plate.json'),undo=[],notes=[];let refreshed=0;Object.assign(S,{comps:s.comps,modules:[],topo:{params:s.params},fabrication:s.fabrication,counter:139,mode:'design',selectedLinkId:'Blank135'});
 const api={S,pause(){},pushUndo:()=>undo.push(JSON.stringify({comps:S.comps,params:S.topo.params})),rebuild(){},draw(){},notify:m=>notes.push(m),save(){},refresh:()=>refreshed++,points:()=>points,motion:{}};
 const before=undo.length,original=JSON.stringify({comps:S.comps,params:S.topo.params});
 assert.ok(run(action,api),notes.join(' '));assert.equal(undo.length,before+1,`${action}: one undo step`);assert.equal(undo[0],original);
 assert.equal(refreshed,1,`${action}: asks the hint to re-check`);
 assert.equal(offPlateMotors(S.comps).length,action==='release'?1:0,`${action}: off-plate state`);
}

// 6. 拖曳防護：座板格孔上的軸心不能解除位置鎖定（就不會被單獨拖離座板）。
{
 const {createNodeEditor}=await import('../js/blocks/node-editor.js');
 const s=load('connected-resize.json'),notes=[];Object.assign(S,{comps:s.comps,topo:{params:s.params},selectedNodeId:SHAFT});
 const editor=createNodeEditor({transient:m=>notes.push(m),pointIsGround:()=>true,hasPoint:()=>true});
 editor.toggleGroundPositionLock();
 assert.deepEqual(notes,['這個軸心在零件的格孔上，不能單獨拖動；要換孔請用「調整馬達安裝」，或移動整個零件。']);
 assert.equal(editor.isGroundPositionUnlocked(SHAFT),false);
}
console.log('motor release: off-plate detection, saveable release, return/leave repairs, one-step undo and drag guard passed');
