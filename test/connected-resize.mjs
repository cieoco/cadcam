// 已連好的機構仍可改標準桿／板孔數（2026-11-10 學生回報）。
// fixture 為學生原檔：9×7 機架板 Blank133 上的 TT 馬達（孔 Blank133_H24_32）帶動 Blank135，
// Blank136、Blank137 依序接上，末端 P138s 懸空。走 member-editor 的同一條提交路徑：
// resizeStandardBlank → commitMountingEdit（座板馬達孔核對）→ 與 app.js 相同的求解驗證。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {S} from '../js/blocks/state.js';
import {createMemberEditor,resizeRefusal} from '../js/blocks/member-editor.js';
import {alignSavedInputPhase,normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
import {storedProject,readStoredProject} from '../js/blocks/project-envelope.js';
import {getExample} from '../js/blocks/examples.js';
import {compileTopology} from '../js/core/topology.js';
import {solveTopology} from '../js/multilink/solver.js';
import {holeWorld} from '../js/core/local-holes.js';
import {makeStandardBlank} from '../js/blocks/standard-blank.js';

class FakeElement{constructor(){this.children=[];this.style={};this.dataset={};this.parentElement={style:{}};this.value='';this.textContent='';this.attributes={};}
 closest(){return this.parentElement;}replaceChildren(...c){this.children=c;}append(...c){this.children.push(...c);}before(){}setAttribute(k,v){this.attributes[k]=String(v);}}
const elements=new Map();
globalThis.document={getElementById:id=>{if(!elements.has(id))elements.set(id,new FakeElement());return elements.get(id);},createElement:()=>new FakeElement()};
const asked=[];globalThis.window={confirm:m=>{asked.push(m);return true;},alert:m=>assert.fail(m)};

const FILE=JSON.parse(readFileSync(new URL('./fixtures/connected-resize.json',import.meta.url),'utf8'));
const load=()=>alignSavedInputPhase(normalizeSnapshot(readStoredProject(structuredClone(FILE))));
const motion=()=>({thetaDeg:S.theta,motorAngles:{...S.motorAngles,[S.activeMotor]:S.theta}});
const solve=(comps=S.comps,params=S.topo.params,m=motion())=>solveTopology(compileTopology(comps,{...S.topo,params:{...params}},new Set()),m);
let notices=[],undo=[];
const editor=createMemberEditor({pause(){},rebuild(){},draw(){},reshapeTriangle(){},updatePointCoordsById(){},
 pushUndo:()=>undo.push(JSON.stringify({comps:S.comps,params:S.topo.params})),notify:m=>notices.push(m),
 // 與 app.js 的 validateCandidate 相同：用候選作品在目前角度求解。
 validateCandidate:draft=>{try{const r=solve(draft.comps,draft.params);return r?.isValid===false?resizeRefusal(r):'';}catch(e){return `孔距未修改：${e.message}`;}}});
function reset(s){Object.assign(S,{comps:s.comps,modules:s.modules||[],topo:{...S.topo,params:{...s.params}},fabrication:s.fabrication,theta:0,activeMotor:'1',motorAngles:{}});notices=[];undo=[];asked.length=0;}
const comp=id=>S.comps.find(c=>c.id===id);
const restore=()=>{const s=JSON.parse(undo.pop());S.comps=s.comps;S.topo.params=s.params;};
const near=(a,b,m)=>assert.ok(Math.abs(a-b)<1e-6,`${m}: ${a} != ${b}`);
const MOTOR='Blank133_H24_32',shaft=()=>{const p=comp('Blank133'),h=[...p.holes,...(p.standardBlank.mountHoles||[])].find(h=>h.id===MOTOR);return h&&holeWorld(p,h);};
function connected(){
 assert.equal(comp('Blank135').p2.id,MOTOR);assert.equal(comp('Blank135').p2.type,'fixed');assert.equal(comp('Blank135').motorMount.center,MOTOR);
 assert.equal(comp('Blank136').p1.id,'Blank135.A');assert.equal(comp('Blank137').p1.id,'Blank136.B');assert.equal(comp('Blank137').p2.id,'P138s');
 const s=shaft();assert.ok(s,'motor hole still on plate');near(s.x,comp('Blank135').p2.x,'motor x');near(s.y,comp('Blank135').p2.y,'motor y');
 const r=solve();assert.ok(r.isValid,r.errorReason);
 for(const id of ['Blank135','Blank136','Blank137']){const c=comp(id),a=r.points[c.p1.id],b=r.points[c.p2.id];near(Math.hypot(b.x-a.x,b.y-a.y),S.topo.params[c.lenParam],id+' solved length');
  for(const h of c.holes){const q=r.points[h.id];near(Math.hypot(q.x-a.x,q.y-a.y),h.u,id+' hole stays on body');}}
}

// 1. 原檔在載入角度（θ=0）就能求解：懸空的桿件格孔跟著桿件，不再各自亂放。
reset(load());connected();
for(const a of [0,45,90,180,270])assert.ok(solve(S.comps,S.topo.params,{thetaDeg:a,motorAngles:{1:a}}).isValid,`pose ${a}`);

// 2. 三支桿件各 +1／−1 孔：成功、一次復原、接點與馬達孔不變。
for(const id of ['Blank135','Blank136','Blank137'])for(const d of [8,-8]){
 reset(load());const before=JSON.stringify({comps:S.comps,params:S.topo.params}),L=S.topo.params[comp(id).lenParam],ids=new Set(comp(id).holes.map(h=>h.id));
 editor.setDimensionValue(id,'g',L+d,{exact:true});
 assert.deepEqual(notices,[],`${id} ${d}`);assert.deepEqual(asked,[],'same motor mount: no remount prompt');assert.equal(undo.length,1,'one undo step');assert.equal(S.topo.params[comp(id).lenParam],L+d);
 assert.equal(comp(id).holes.length,(L+d)/8-1,'lattice rebuilt');for(const h of comp(id).holes)if(h.u<L)assert.ok(ids.has(h.id),'retained hole keeps id');
 connected();restore();assert.equal(JSON.stringify({comps:S.comps,params:S.topo.params}),before,'undo restores');
}
// 連續改兩支也行（第一次修改後的作品仍可再改）。
reset(load());editor.setDimensionValue('Blank136','g',64,{exact:true});editor.setDimensionValue('Blank135','g',48,{exact:true});assert.deepEqual(notices,[]);assert.equal(undo.length,2);connected();

// 3. 機架板長向／寬向 ±1：馬達孔維持同格位與世界座標，機架 A、B 仍固定。
for(const [axis,key] of [['g','Blank133.G'],['r1','Blank133.H']])for(const d of [8,-8]){
 reset(load());const before=JSON.stringify({comps:S.comps,params:S.topo.params}),motor={...comp('Blank135').p2},A={...comp('Blank133').p1},v=S.topo.params[key];
 S.triSide=axis;editor.setDimensionValue('Blank133',axis,v+d,{exact:true});
 assert.deepEqual(notices,[],`plate ${axis} ${d}`);assert.deepEqual(asked,[]);assert.equal(undo.length,1);assert.equal(S.topo.params[key],v+d);
 assert.equal(comp('Blank133').p1.type,'fixed');assert.equal(comp('Blank133').p2.type,'fixed');near(comp('Blank133').p1.x,A.x,'frame A');
 assert.ok(comp('Blank133').standardBlank.mountHoles.some(h=>h.id===MOTOR&&h.u===24&&h.v===32),'motor hole identity');
 near(comp('Blank135').p2.x,motor.x,'motor');near(comp('Blank135').p2.y,motor.y,'motor');connected();
 restore();assert.equal(JSON.stringify({comps:S.comps,params:S.topo.params}),before);
}

// 4. 已使用的孔會被移除：拒絕並說明是哪個零件的哪一孔、要怎麼做。
reset(load());editor.setDimensionValue('Blank133','r1',24,{exact:true});
assert.equal(S.topo.params['Blank133.H'],48);assert.equal(undo.length,0);
assert.deepEqual(notices,['縮小會移除「矩形板材」長向第4、直向第5孔，但這孔已固定或有零件連接；請先解除該孔的連接，或改用較多孔數。']);
reset(load());const tip=comp('Blank136').holes.find(h=>h.u===48);comp('Blank137').p2={id:tip.id,type:'floating',...holeWorld(comp('Blank136'),tip)};
editor.setDimensionValue('Blank136','g',48,{exact:true});
assert.deepEqual(notices,['縮小會移除「孔格桿件」第7孔，但這孔已固定或有零件連接；請先解除該孔的連接，或改用較多孔數。']);assert.equal(S.topo.params['Blank136.G'],56);

// 5. 接成四連桿後改成無法閉合的長度：拒絕、說明原因、作品不變。
const closed=()=>{const s=load(),p=s.comps.find(c=>c.id==='Blank133'),h=p.holes.find(h=>h.id==='Blank133_H64_48');s.comps.find(c=>c.id==='Blank137').p2={id:h.id,type:'floating',...holeWorld(p,h)};return s;};
reset(closed());assert.ok(solve().isValid);editor.setDimensionValue('Blank137','g',64,{exact:true});assert.deepEqual(notices,[]);assert.ok(solve().isValid,'closed loop still solves');
reset(closed());const kept=JSON.stringify(S.comps);editor.setDimensionValue('Blank137','g',8,{exact:true});
assert.deepEqual(notices,['孔距未修改：改成這個尺寸後，相連的零件接不起來（長度無法閉合）。請改用其他孔數，或一起調整相連的零件。']);
assert.equal(undo.length,0);assert.equal(JSON.stringify(S.comps),kept);assert.equal(S.topo.params['Blank137.G'],56);
assert.ok(!/[A-Za-z]/.test(resizeRefusal({isValid:false,errorReason:'三角板 localHole.Blank136.Blank136_H8_0 無法保持設定孔距 56 mm'}).slice(6)),'internal ids are not shown');

// 6. 存檔／重開：改過的作品原樣回來且可求解。
reset(load());editor.setDimensionValue('Blank137','g',64,{exact:true});editor.setDimensionValue('Blank133','g',72,{exact:true});
const saved=alignSavedInputPhase(normalizeSnapshot(readStoredProject(JSON.parse(JSON.stringify(storedProject(toSnapshot(S.comps,S.topo,138,{fabrication:S.fabrication})))))));
assert.deepEqual(saved.comps,S.comps);assert.equal(saved.params['Blank137.G'],64);assert.equal(saved.params['Blank133.G'],72);assert.ok(solve(saved.comps,saved.params).isValid);

// 7. 積木化範例 fourbar-crank-rocker 照舊可改。
for(const [id,n] of [['Link1',6],['Link2',15],['Link3',12]]){
 const s=normalizeSnapshot(getExample('fourbar-crank-rocker').snapshot);reset(s);const c=comp(id);assert.ok(c.standardBlank,id);
 assert.equal(S.topo.params[c.lenParam],(n-2)*8);editor.setDimensionValue(id,'g',(n-1)*8,{exact:true});
 assert.deepEqual(notices,[]);assert.equal(S.topo.params[c.lenParam],(n-1)*8);assert.equal(undo.length,1);assert.ok(solve().isValid);
}
// 8. 連續改尺寸後，懸空的下游零件保持自身長度與格孔（不能沿用舊座標被拉長）；播放各角度亦同。
const rigid=(r,m)=>{for(const c of S.comps.filter(c=>c.standardBlank)){const a=r.points[c.p1.id],b=r.points[c.p2.id],L=Math.hypot(b.x-a.x,b.y-a.y);
  near(L,S.topo.params[c.type==='bar'?c.lenParam:c.gParam],`${m} ${c.id} length`);
  if(c.type==='triangle'){const d=r.points[c.p3.id];near(Math.hypot(d.x-a.x,d.y-a.y),S.topo.params[c.r1Param],`${m} ${c.id} height`);near(Math.hypot(d.x-b.x,d.y-b.y),S.topo.params[c.r2Param],`${m} ${c.id} diagonal`);}
  for(const h of c.holes){const q=r.points[h.id],w=holeWorld({...c,p1:{...c.p1,...a},p2:{...c.p2,...b},...(c.p3?{p3:{...c.p3,...r.points[c.p3.id]}}:{})},h);near(q.x,w.x,`${m} ${c.id} ${h.id} x`);near(q.y,w.y,`${m} ${c.id} ${h.id} y`);}}};
reset(load());
for(const [id,n] of [['Blank136',32],['Blank136',48],['Blank135',40],['Blank137',40]]){
 editor.setDimensionValue(id,'g',n,{exact:true});assert.deepEqual(notices,[],`${id} ${n}`);assert.equal(S.topo.params[comp(id).lenParam],n);
 const r=solve();assert.ok(r.isValid,r.errorReason);rigid(r,`${id}→${n}`);
 // 播放：沿用上一幀當種子（與 app 的 solveFrame 相同），懸空桿維持原角度、長度不變。
 let prev=null,angle=null;for(const a of [0,30,90,180,270,359]){const f=solve(S.comps,S.topo.params,{thetaDeg:a,motorAngles:{1:a},_prevPoints:prev});assert.ok(f.isValid,`θ=${a} ${f.errorReason}`);rigid(f,`${id}→${n} θ=${a}`);
  const B=f.points['Blank136.B'],P=f.points.P138s,now=Math.atan2(P.y-B.y,P.x-B.x);if(angle!==null)near(now,angle,`θ=${a} free bar keeps its angle`);angle=now;prev=f.points;}
}
// 懸空的標準板材（只有一角接在曲柄上）也維持剛體與格孔。
{const s=load(),plate=makeStandardBlank({kind:'plate',columns:3,rows:3,n:900,origin:{x:s.comps.find(c=>c.id==='Blank135').p1.x,y:s.comps.find(c=>c.id==='Blank135').p1.y}});assert.ok(plate.ok);plate.comp.p1={...plate.comp.p1,id:'Blank135.A'};s.comps.push(plate.comp);Object.assign(s.params,plate.params);reset(s);
 let prev=null;for(const a of [0,45,120,250]){const f=solve(S.comps,S.topo.params,{thetaDeg:a,motorAngles:{1:a},_prevPoints:prev});assert.ok(f.isValid,`hanging plate θ=${a} ${f.errorReason}`);rigid(f,`hanging plate θ=${a}`);prev=f.points;}}
// 求解結果違反剛性距離時必須回報失敗，不可當成有效。
{const s=load();s.params['Blank133.D']=10;const r=solve(s.comps,s.params);assert.equal(r.isValid,false,'broken plate diagonal is a real failure');}
// 9. 開檔時 Blank135 在存檔的 131°；改尺寸與播放都從這個姿勢連續變化。
const crank=r=>{const A=r.points['Blank135.A'],O=r.points[MOTOR];return Math.atan2(A.y-O.y,A.x-O.x)*180/Math.PI;};
reset(load());{const r=solve();assert.ok(Math.abs(crank(r)-131.04)<0.1,`open at ${crank(r)}`);
 for(const c of S.comps)for(const k of ['p1','p2','p3'])if(c[k]&&r.points[c[k].id])near(Math.hypot(r.points[c[k].id].x-c[k].x,r.points[c[k].id].y-c[k].y),0,`playback starts at saved ${c[k].id}`);}
for(const n of [64,40,56]){editor.setDimensionValue('Blank135','g',n,{exact:true});const r=solve();assert.ok(Math.abs(crank(r)-131.04)<0.1,`Blank135 ${n}: ${crank(r)}`);rigid(r,`crank ${n}`);}
{let prev=null,last=null;for(let a=0;a<=60;a+=5){const f=solve(S.comps,S.topo.params,{thetaDeg:a,motorAngles:{1:a},_prevPoints:prev});assert.ok(f.isValid);rigid(f,`crank θ=${a}`);const now=crank(f);if(last!==null)near(((now-last)%360+540)%360-180,5,`θ=${a} continuous`);else assert.ok(Math.abs(now-131.04)<0.1);last=now;prev=f.points;}}
console.log('connected resize: user work bars/plate ±1, motor hole identity, used-hole and impossible-loop refusals, undo, save/reopen and four-bar example passed');
