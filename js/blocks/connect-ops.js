/**
 * blocks / connect-ops  (pack O2 of docs/SDD-OPERATION-PIPELINE.md)
 *
 * 「解除與連接」的接點動作：分開共用接點、把拖到的端點接到另一個孔。
 * planSplit／planMerge 是純規劃（不得改動傳入的作品）；提交、一致性檢查、復原與回饋都交給 edit-pipeline 的 runEdit。
 * 按需載入（不得被啟動路徑靜態 import）。
 */
import * as Model from './model.js';
import {runEdit} from './edit-pipeline.js';
import {fusionAtPoint} from '../core/bar-fusion.js';
import {partName} from './selection-target.js';
import {inspectMountingChange} from './mounting-review.js';

const OFFSET = 16;                                  // 分出來的端點向外位移量（mm），給視覺回饋也方便點選
const list = names => names.length < 3 ? names.join('和') : `${names.slice(0, -1).join('、')}和${names.at(-1)}`;
const uniq = comps => [...new Set(comps)];
// 「桿件」「2 個桿件」：同名零件用個數分辨，不顯示座標或內部代號。
const tally = (names, alike = false) => list([...new Set(names)].map(n => {
  const c = names.filter(x => x === n).length;
  return c > 1 ? `${c} 個「${n}」` : alike ? `其中一個「${n}」` : `「${n}」`;
}));

/**
 * 分開共用同一個接點的零件：非桿件（機架點／馬達座／板）留在原接點，其餘各分出新的自由端點並稍微移開。
 * work={comps,params,counter}；id=接點 id。回傳 {ok,comps,params,message,after}｜{ok:false,message}。
 */
export function planSplit(work, id) {
  if (!id) return {ok: false, message: '請先點選要分開的接點。'};
  if (fusionAtPoint(work.comps, id)) return {ok: false, message: '請先解除合成，再修改孔位。'};
  const comps = structuredClone(work.comps), refs = Model.pointRefs(comps, id);
  if (refs.length < 2) return {ok: false, message: '這個接點只有一個零件，沒有可分開的連接。'};
  const p = Model.pointCoords(comps)[id] || {x: 0, y: 0};
  let counter = work.counter, moved = false;
  refs.sort((a, b) => (a.comp.type === 'bar' ? 1 : 0) - (b.comp.type === 'bar' ? 1 : 0));
  const detach = refs.slice(1);
  detach.forEach((ref, i) => {
    const ang = (i / detach.length) * Math.PI * 2 + 0.6;
    ref.point.id = 'P' + (++counter) + 's';
    ref.point.type = 'floating';
    // A body with parts joined or fixed at its holes stays put: moving one vertex would leave those copies behind.
    const off = Model.holeJoined(comps, ref.comp) ? 0 : OFFSET;
    if (off) moved = true;
    ref.point.x = (p.x || 0) + Math.cos(ang) * off;
    ref.point.y = (p.y || 0) + Math.sin(ang) * off;
  });
  const stay = partName(refs[0].comp), gone = detach.map(r => partName(r.comp)), alike = gone.includes(stay);
  const message = `已把${tally(gone, alike)}從這個接點分開；${alike ? '另一個' : ''}「${stay}」留在原處。` + (moved ? '分出來的端點已稍微移開，方便點選。' : '');
  return {ok: true, comps, params: {...work.params}, message, after: S => { S.counter = counter; }};
}

/**
 * 把拖到的端點接到另一個孔。drop={comps,topo,points,theta,angles}＝放開當下的畫面狀態（候選的起點）；
 * work 是放開前的作品（一致性檢查與復原都以它為準）。
 */
export function planMerge(work, drop, fromId, toId) {
  const seed = structuredClone(drop.comps), topo = structuredClone(drop.topo);
  for (const [id, p] of Object.entries(drop.points || {})) Model.updatePointCoordsById(seed, id, p.x, p.y);
  const own = id => uniq(Model.pointRefs(seed, id).map(r => r.comp));
  const from = own(fromId), to = own(toId), gap = Model.pointCoords(seed);
  const cand = Model.previewPointConnection(seed, topo, fromId, toId);
  if (!cand.ok) return {ok: false, message: cand.message};
  const next = {...work, comps: cand.comps, params: topo.params};
  let review;
  try { review = inspectMountingChange(work, next); }
  catch (e) { return {ok: false, message: `無法核對固定孔位：${e.message}`}; }
  if (!review.ok) return {ok: false, message: review.issues.join('\n')};
  if (review.changes.length) {
    const names = [...new Set(review.changes.map(c => c.label))].join('、');
    if (!globalThis.confirm?.(`${names}與原固定孔位不一致。\n是否更新對應的固定孔位？\n\n確定：一起更新安裝與孔位，可一次復原。\n取消：保留原孔位，返回調整。\n已加工的板件不會因此自動改孔。`))
      return {ok: false, message: '已保留原孔位，沒有接上；請先調整後再接。'};
  }
  const a = from.map(partName), b = to.map(partName), alike = a.some(n => b.includes(n));
  const end = from.some(c => c.type === 'bar') ? '端孔' : '孔';
  const apart = gap[fromId] && gap[toId] ? Math.hypot(gap[fromId].x - gap[toId].x, gap[fromId].y - gap[toId].y) : 0;
  const message = `已把${tally(a)}的${end}接到${alike && b.length === 1 ? `另一個「${b[0]}」` : tally(b)}的孔。` + (apart > 0.5 ? '被拖的零件已移到該孔的位置。' : '');
  return {ok: true, comps: cand.comps, params: topo.params, message, clearSelection: false,
    retarget: [fromId, toId],
    after(S) {
      if (S.selectedNodeId === fromId) S.selectedNodeId = toId;
      S.theta = drop.theta; S.motorAngles = {...drop.angles};
    }};
}

/** 分開目前選到的接點。host={S,transient,pushUndo,pause,rebuild,draw,afterCommit?}。 */
export function splitSelected(host) {
  return runEdit({name: '分開連接', plan: work => planSplit(work, host.S.selectedNodeId), host});
}

/** 拖曳放開後接孔（呼叫端已把畫面還原到拖曳前，drop 是放開當下的狀態）。 */
export function mergeDropped({from, to, drop, ...host}) {
  return runEdit({name: '接孔', plan: work => planMerge(work, drop, from, to), host});
}
