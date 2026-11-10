// 已連好的機構仍可改標準桿／板孔數（2026-11-10 學生回報）。
// fixture 為學生原檔：9×7 機架板 Blank133 上的 TT 馬達（孔 Blank133_H24_32）帶動 Blank135，
// Blank136、Blank137 依序接上，末端 P138s 懸空。走 member-editor 的同一條提交路徑：
// resizeStandardBlank → commitMountingEdit（座板馬達孔核對）→ 與 app.js 相同的求解驗證。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {S} from '../js/blocks/state.js';
import {createMemberEditor,resizeRefusal} from '../js/blocks/member-editor.js';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
import {storedProject,readStoredProject} from '../js/blocks/project-envelope.js';
import {getExample} from '../js/blocks/examples.js';
import {compileTopology} from '../js/core/topology.js';
import {solveTopology} from '../js/multilink/solver.js';
import {holeWorld} from '../js/core/local-holes.js';

class FakeElement{constructor(){this.children=[];this.style={};this.dataset={};this.parentElement={style:{}};this.value='';this.textContent='';this.attributes={};}
 closest(){return this.parentElement;}replaceChildren(...c){this.children=c;}append(...c){this.children.push(...c);}before(){}setAttribute(k,v){this.attributes[k]=String(v);}}
const elements=new Map();
globalThis.document={getElementById:id=>{if(!elements.has(id))elements.set(id,new FakeElement());return elements.get(id);},createElement:()=>new FakeElement()};
const asked=[];globalThis.window={confirm:m=>{asked.push(m);return true;},alert:m=>assert.fail(m)};

const FILE=JSON.parse(readFileSync(new URL('./fixtures/connected-resize.json',import.meta.url),'utf8'));
const load=()=>normalizeSnapshot(readStoredProject(structuredClone(FILE)));
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
const saved=normalizeSnapshot(readStoredProject(JSON.parse(JSON.stringify(storedProject(toSnapshot(S.comps,S.topo,138,{fabrication:S.fabrication}))))));
assert.deepEqual(saved.comps,S.comps);assert.equal(saved.params['Blank137.G'],64);assert.equal(saved.params['Blank133.G'],72);assert.ok(solve(saved.comps,saved.params).isValid);

// 7. 積木化範例 fourbar-crank-rocker 照舊可改。
for(const [id,n] of [['Link1',6],['Link2',15],['Link3',12]]){
 const s=normalizeSnapshot(getExample('fourbar-crank-rocker').snapshot);reset(s);const c=comp(id);assert.ok(c.standardBlank,id);
 assert.equal(S.topo.params[c.lenParam],(n-2)*8);editor.setDimensionValue(id,'g',(n-1)*8,{exact:true});
 assert.deepEqual(notices,[]);assert.equal(S.topo.params[c.lenParam],(n-1)*8);assert.equal(undo.length,1);assert.ok(solve().isValid);
}
console.log('connected resize: user work bars/plate ±1, motor hole identity, used-hole and impossible-loop refusals, undo, save/reopen and four-bar example passed');
