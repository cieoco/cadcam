/**
 * blocks / resize-plan  (pack O3b of docs/SDD-OPERATION-PIPELINE.md)
 *
 * 改尺寸的規劃（純函式）：圖上把手與數字欄共用同一份。給目前作品與「哪個零件、哪個尺寸、新值」，
 * 回傳 runEdit 的規劃結果（見 edit-pipeline.js）：{ok:false,message}｜{ok:true,unchanged:true}｜{ok:true,comps,params,modules,…}。
 * 提交（一致性檢查、安裝孔位確認、一次復原、寫入）由 runEdit 負責，這裡不碰 S、不碰 DOM，也不呼叫 pushUndo。
 *
 *   planResize(work, {componentId, id, raw, mirrorPair, exact, topo, holeDiameter, reshapeTriangle, validateCandidate})
 *     work       runEdit 交來的目前作品 {comps, params, modules, fabrication}（唯讀）
 *     topo       作品層 S.topo（只讀 tracePoints／referencePoint／loads／dimensions，用來擋「縮小會讓被使用的孔消失」）
 *     fusionValue 回傳值帶這個欄位時，表示這是合成桿的整體長度，由呼叫端交給合成編輯處理（plan 本身標為 unchanged）
 */
import {resizeStandardBlank, isOutputBlank} from './standard-blank.js';
import {memberDimensions, memberDimensionValue, planMemberDimension, mirroredJaw, dimensionLock} from './member-dimensions.js';
import {planSyringeAttachmentResize} from '../core/syringe.js';
import {planActuatorPlateHoles} from './actuator-plate-holes.js';
import {updatePointCoordsById as movePoint} from './model.js';

const KEEP = {keepIdentity: true, pruneRefs: false, clearSelection: false, message: ''};   // 改尺寸：面板留著手上的零件物件、不順手清別的引用、成功不另外說話

export function planResize(work, {componentId, id, raw, mirrorPair = false, exact = false, topo = {}, holeDiameter = () => undefined, reshapeTriangle = () => {}, validateCandidate = () => ''}) {
  const comp = work.comps.find(c => c.id === componentId);
  if (!comp) return {ok: true, unchanged: true};
  const candidate = () => structuredClone({comps: work.comps, modules: work.modules, params: work.params, fabrication: work.fabrication});
  // 座板上原本就有的問題（例如馬達離開原孔）不擋不相干的修改；只擋這次新造成的。
  const withPlate = (draft, invalid) => {
    if (invalid) return {ok: false, message: invalid};
    const plate = planActuatorPlateHoles(draft);
    if (plate.ok) draft.comps = plate.comps;
    else if (planActuatorPlateHoles({comps: work.comps, modules: work.modules, params: work.params, fabrication: work.fabrication}).ok) return {ok: false, message: plate.message};
    return {ok: true, comps: draft.comps, params: draft.params, modules: draft.modules, ...KEEP};
  };

  if (comp.standardBlank && (/^(g|r1|a)/.test(id) || isOutputBlank(comp) && id === 'width')) {
    const value = Number(raw), plan = resizeStandardBlank(comp, work.params, id, value, {comps: work.comps, modules: work.modules});
    if (!plan.ok) return {ok: false, message: plan.message};
    // A hole that trace, reference, load or dimension settings point at cannot silently disappear with a smaller size.
    const watched = JSON.stringify([topo.tracePoints, topo.tracePoint, topo.referencePoint, topo.loads, topo.dimensions]);
    const gone = (comp.holes || []).find(h => !plan.comp.holes.some(x => x.id === h.id) && watched.includes(`"${h.id}"`));
    if (gone) return {ok: false, message: '縮小會移除被軌跡追蹤、量測或負載使用的孔；請先改選其他點，再縮小。'};
    if (JSON.stringify(comp) === JSON.stringify(plan.comp) && Object.entries(plan.params).every(([k, v]) => work.params[k] === v)) return {ok: true, unchanged: true};
    const draft = candidate(), index = draft.comps.findIndex(c => c.id === comp.id);
    if (comp.type === 'bar' && id === 'g') planSyringeAttachmentResize(draft.comps, comp, Number(draft.params[comp.lenParam]), value).forEach(({id, ...patch}) => Object.assign(draft.comps.find(c => c.id === id), patch));
    draft.comps[index] = plan.comp; Object.assign(draft.params, plan.params);
    for (const key of ['p1', 'p2', ...(comp.type === 'triangle' ? ['p3'] : [])]) { const p = plan.comp[key]; movePoint(draft.comps, p.id, p.x, p.y); }
    for (const f of plan.follow || []) movePoint(draft.comps, f.id, f.x, f.y);
    return withPlate(draft, validateCandidate(draft));
  }

  const dimension = memberDimensions(comp).find(d => d.id === id);
  const lock = dimensionLock(comp, work.comps, id);
  if (lock) return {ok: false, message: lock};
  const partner = mirrorPair && mirroredJaw(comp, work.comps, work.params);
  const targets = partner ? [comp, partner] : [comp];
  const plans = targets.map(c => planMemberDimension(c, work.params, id, raw, {holeDiameterMm: holeDiameter(c), exact}));
  const failure = plans.find(plan => !plan.ok);
  if (failure) return {ok: false, message: failure.message};
  if (targets.every(c => Math.abs(memberDimensionValue(c, work.params, id) - plans[0].value) < 0.001)) return {ok: true, unchanged: true};
  if (comp.barFusionRoot) return {ok: true, unchanged: true, fusionValue: plans[0].value};
  const draft = candidate();
  targets.forEach((target, index) => {
    const c = draft.comps.find(o => o.id === target.id);
    if (c.type === 'bar' && id === 'g') {
      const patches = planSyringeAttachmentResize(draft.comps, c, Number(draft.params[c.lenParam]), plans[index].value);
      patches.forEach(({id, ...patch}) => Object.assign(draft.comps.find(c => c.id === id), patch));
    }
    Object.assign(draft.params, plans[index].params);
    Object.assign(c, plans[index].properties);
    if (id === 'tip') return;
    if (c.type === 'triangle') reshapeTriangle(c, draft.params, (id, x, y) => movePoint(draft.comps, id, x, y));
    else {
      const dx = c.p2.x - c.p1.x, dy = c.p2.y - c.p1.y, length = Math.hypot(dx, dy) || 1;
      movePoint(draft.comps, c.p2.id, c.p1.x + (dx || (dy ? 0 : 1)) / length * plans[index].value, c.p1.y + dy / length * plans[index].value);
    }
  });
  return withPlate(draft, dimension?.param ? validateCandidate(draft) : '');
}

/** 零件欄位改變（材料／板厚 stock、圓盤外徑 diameterMm）的規劃：改複本、座板核對同 planResize（原有的座板問題不擋，只擋新造成的）。targets=[{id, patch}]。 */
export function planPatch(work, targets) {
  const draft = structuredClone({comps: work.comps, modules: work.modules, params: work.params, fabrication: work.fabrication});
  for (const t of targets) Object.assign(draft.comps.find(c => c.id === t.id), t.patch);
  const plate = planActuatorPlateHoles(draft);
  if (plate.ok) draft.comps = plate.comps;
  else if (planActuatorPlateHoles({comps: work.comps, modules: work.modules, params: work.params, fabrication: work.fabrication}).ok) return {ok: false, message: plate.message};
  return {ok: true, comps: draft.comps, params: draft.params, modules: draft.modules, ...KEEP};
}
