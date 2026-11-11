// Imported helper for the O4 pipeline tests (gear / copy / slider): a fake host around runEdit with undo bookkeeping.
import {readFileSync} from 'node:fs';
globalThis.document??={getElementById:()=>({style:{}})};
const R='../js/blocks/';
export const {normalizeSnapshot,toSnapshot}=await import(R+'schema.js');
export const {readStoredProject}=await import(R+'project-envelope.js');
const {loadIntegrity}=await import(R+'integrity-gate.js');
export const {getExample,loadUnitStarts}=await import(R+'examples.js');
await loadIntegrity();await loadUnitStarts();

export const fixture=name=>normalizeSnapshot(readStoredProject(JSON.parse(readFileSync(new URL('./fixtures/'+name,import.meta.url),'utf8'))));
export const example=id=>normalizeSnapshot(structuredClone(getExample(id).snapshot));
export const NONE={selectedLinkId:null,selectedTriangleId:null,selectedSliderId:null,selectedNodeId:null,selectedGearId:null};
export const noInternalId=m=>!/Blank\d|H7|Motor\d|P\d+s|_H\d|Gear[A-Z]|Pinion|Rack\d|Link\d|GC[A-Z]|GP[A-Z]|RK[A-Z]|\.A\b|\.B\b/.test(m);

/** 作品 w（normalizeSnapshot 的結果）→ 假的編輯環境。 */
export function session(w,sel={}){
  const S={comps:structuredClone(w.comps),modules:structuredClone(w.modules||[]),topo:{params:{...w.params},tracePoints:[],dimensions:[],loads:[]},fabrication:w.fabrication,counter:w.counter??500,theta:0,motorAngles:{},activeMotor:1,...NONE,...sel};
  const log={undo:0,undoSnap:null,rebuild:0,draw:0,flashed:null,msgs:[]};
  const state=()=>JSON.stringify([S.comps,S.topo.params]);
  const orig=state();
  const host={S,transient:m=>log.msgs.push(m),pushUndo(){log.undo++;log.undoSnap=state();},pause(){},rebuild(){log.rebuild++;},draw(){log.draw++;},points:{},flash:ids=>{log.flashed=ids;}};
  return {S,host,log,orig,state,get changed(){return state()!==orig;},ids:()=>S.comps.map(c=>c.id)};
}
/** 存檔重開：正規化後作品不變。 */
export const roundTrips=s=>{const snap=normalizeSnapshot(toSnapshot(s.S.comps,s.S.topo,s.S.counter));
  return !!snap&&JSON.stringify(snap.comps)===JSON.stringify(s.S.comps)&&JSON.stringify(snap.params)===JSON.stringify(s.S.topo.params);};
