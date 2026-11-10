/**
 * blocks / integrity-repairs  (pack C3 of docs/SDD-CONNECTION-INTEGRITY.md)
 *
 * 開檔提示的內容：哪些檢查已啟用、每筆問題的白話說明，以及修復「候選」。純函式、不碰 DOM、不修改輸入；按需載入。
 * 每個修復是 plan(source) -> {ok, comps, params?, modules?, topo?, message}，由 integrity-hints.js 以 app 的一般提交流程
 * （pushUndo、自動存檔、rebuild/draw）一次寫入，所以是單一步復原。
 */
import {buildRelations} from './relations.js';
import {checkWork} from './integrity.js';
import {pointKeysFor} from './part-types.js';
import {offPlateMotors, offPlateMessage, planMotorReturn, planMotorLeave, attachedGroup} from './motor-release.js';
import {pruneTopoRefs} from './topo-refs.js';
import {ownIdsOf} from './ref-fields.js';

/** 逐項啟用：只有這裡列出的代號會在開檔時提示（其餘維持影子模式，見 SDD 3.3）。 */
export const ENABLED = {I1: true, I3: true, I5: true, I8: true};   // I8（C6）只提示、不修復：先解除合成，再修改
export const SHOWN = ['contradiction', 'dangling'];

const TOL = 0.01, KEYS = ['p1', 'p2', 'p3'];
const GROUND = new Set(['fixed', 'motor', 'linear']);
const fix1 = n => (Math.round(n * 10) / 10).toString();
const MOTOR_NAMES = {tt: 'TT 馬達', n20: 'N20 減速馬達', mg995: 'MG995 伺服馬達'};
// 學生看得到的名稱：自己取的名字；沒有名字時獨立馬達用型號，其他用零件種類，不顯示內部編號。
const nameOf = c => (typeof c?.name === 'string' && c.name.trim()) || (c?.type === 'motor' ? MOTOR_NAMES[c.motorType] || MOTOR_NAMES.tt : c ? ({bar: '桿件', triangle: '板件', gear: '齒輪', slider: '滑軌'})[c.type] || '零件' : '零件');
const quote = c => `「${nameOf(c)}」`;
const clone = v => structuredClone(v);

/** 目前狀態 S 的作品（與 checkWork 的輸入同形）與修復來源。 */
export const workOf = S => ({comps: S.comps, modules: S.modules || [], params: S.topo?.params || {},
  topo: {...S.topo, activeMotor: S.activeMotor, motorAngles: S.motorAngles}});
export const sourceOf = S => ({comps: S.comps, params: S.topo.params, fabrication: S.fabrication, modules: S.modules || [], counter: S.counter,
  topo: {tracePoint: S.topo.tracePoint, tracePoints: S.topo.tracePoints, referencePoint: S.topo.referencePoint, loads: S.topo.loads, dimensions: S.topo.dimensions}});
export const fingerprint = work => JSON.stringify([work.comps, work.modules, work.params, work.topo.tracePoint, work.topo.tracePoints, work.topo.referencePoint, work.topo.loads, work.topo.dimensions]);

// ---------------------------------------------------------------- I1 generic
function groundPoint(p) { return GROUND.has(p.type) || (p.physicalMotor != null && p.physicalMotor !== ''); }
// 這份副本的擁有者連同只掛在它上面的零件能不能一起剛性平移：不接地、不驅動、不接到其他零件。
function hangsOnlyHere(rel, comps, owner, id, host) {
  const {group, free} = attachedGroup(comps, {id: owner.id, center: id, host});
  if (!free) return null;
  const ids = new Set([...group].map(c => c.id));
  for (const c of group) {
    if (c.isInput || c.motorMount || c.physicalMotor != null || pointKeysFor(c).some(k => !KEYS.includes(k))) return null;
    for (const a of rel.attachmentsOf(c.id)) if (!ids.has(a.otherId) && a.via !== id) return null;
    for (const k of KEYS) {
      const p = c[k];
      if (!p || p.id === id) continue;
      if (groundPoint(p) || rel.copiesOf(p.id).some(r => !ids.has(r.compId))) return null;
    }
  }
  return group;
}
function planPutBack(source, id) {
  const next = clone(source), rel = buildRelations({...next, topo: next.topo || {}}), w = rel.worldOf(id);
  const host = next.comps.find(c => c.id === w.source.compId);
  let moved = false;
  for (const f of w.copies.filter(x => x.offset > TOL)) {
    const owner = next.comps.find(c => c.id === f.compId), p = owner?.[f.key];
    if (!p) continue;
    const dx = w.x - p.x, dy = w.y - p.y, group = hangsOnlyHere(rel, next.comps, owner, id, host);
    if (group) {
      const seen = new Set();
      for (const c of group) for (const k of KEYS) { const q = c[k]; if (q && q.id !== id && !seen.has(q)) { seen.add(q); q.x += dx; q.y += dy; moved = moved || c !== owner; } }
    }
    p.x = w.x; p.y = w.y;
  }
  return {ok: true, comps: next.comps, message: `已把端點放回${quote(host)}的孔${moved ? '，只掛在它上面的零件一起移動' : ''}；可按復原。`};
}
function planLeave(source, id) {
  const next = clone(source), rel = buildRelations({...next, topo: next.topo || {}}), w = rel.worldOf(id);
  const used = new Set(next.comps.flatMap(c => [c.id, ...pointKeysFor(c).map(k => c[k]?.id), ...(c.holes || []).map(h => h?.id), ...(c.standardBlank?.mountHoles || []).map(h => h?.id)]));
  const fresh = new Map();   // 同一位置的離開端點共用一個新接點，彼此仍相連
  for (const f of w.copies.filter(x => x.offset > TOL)) {
    const owner = next.comps.find(c => c.id === f.compId), p = owner?.[f.key];
    if (!p) continue;
    const at = `${Math.round(p.x / TOL)},${Math.round(p.y / TOL)}`;
    if (!fresh.has(at)) { let n = 1, nid = `${owner.id}.${f.key.toUpperCase()}`; while (used.has(nid)) nid = `${owner.id}.${f.key.toUpperCase()}${++n}`; used.add(nid); fresh.set(at, nid); }
    owner[f.key] = {...p, id: fresh.get(at)};
    if (owner.motorMount?.center === id) owner.motorMount = {...owner.motorMount, center: fresh.get(at)};
  }
  return {ok: true, comps: next.comps, message: `已讓端點離開${quote(next.comps.find(c => c.id === w.source.compId))}，改用自己的接點，位置不變；可按復原。`};
}

// 畫面上標示：要移動的零件用橘色，對照的零件用藍色（integrity-hints.js 的標示層）；文字同步寫出顏色，同名零件才分得出來。
const ORANGE = '橘色', BLUE = '藍色';
function i1Item(rel, issue, comps) {
  const id = issue.ids[0], w = rel.worldOf(id);
  if (!w) return null;
  const byId = cid => comps.find(c => c.id === cid), host = byId(w.source.compId);
  const far = w.copies.filter(x => x.offset > TOL), farIds = [...new Set(far.map(x => x.compId))];
  const farNames = farIds.map(cid => quote(byId(cid))).join('、'), hole = !!w.source.holeId, gap = fix1(w.spread);
  const same = farIds.some(cid => nameOf(byId(cid)) === nameOf(host));
  const text = (hole
    ? `${farNames}（${ORANGE}）的端點沒有落在${quote(host)}（${BLUE}）的孔上（相差 ${gap} mm），畫面與製作會對不起來。`
    : `${farNames}（${ORANGE}）的端點，和${quote(host)}（${BLUE}）的端點本來接在同一點，卻相差 ${gap} mm，畫面與製作會對不起來。`) + '畫面上已標出這些零件。';
  const target = same ? `${BLUE}的${quote(host)}` : quote(host);
  // 只有「跟著孔走的端點」能搬；兩塊板共用同一個孔號、孔本身對不上時，不猜哪一塊對（只說明）。
  const repairs = far.every(x => x.key) ? [
    {id: 'back', label: hole ? `放回${target}的孔` : `把端點接回${target}`, plan: s => planPutBack(s, id)},
    {id: 'leave', label: `讓它離開${target}（改用自己的接點）`, plan: s => planLeave(s, id)}] : [];
  return {key: `I1|${id}`, code: 'I1', short: hole ? `${farNames}的端點沒有落在孔上（差 ${gap} mm）` : `${farNames}的端點沒有接在共用點上（差 ${gap} mm）`, text, repairs, mark: {far: farIds, canon: [host.id]}};
}

// ---------------------------------------------------------------- I3 / I5 dangling references
const SYRINGE_END = {a: '固定（管夾）', b: '推桿'};
function dropHost(c, dead) {
  const out = {...c};
  if (out.motorCarrier === dead) delete out.motorCarrier;
  const m = c.motorMount && typeof c.motorMount === 'object' ? {...c.motorMount} : null;
  if (m && m.frameBody === dead) {
    delete m.frameBody;
    if (Array.isArray(m.order)) m.order = m.order.filter(k => k !== 'frameBody');
    if (m.orientation === 'follow-frame') m.orientation = 'horizontal';   // 沒有承載件可跟隨：保留目前的角度
    for (const k of KEYS) if (out[k]?.id === m.center && !['fixed', 'motor'].includes(out[k].type)) out[k] = {...out[k], type: 'fixed'};
    out.motorMount = m;
  }
  return out;
}
function planClear(source, ref) {
  const next = clone(source), done = '已清除失效的連結，其他零件都保留；可按復原。';
  if (ref.what === 'topo') {
    const topo = next.topo || {};
    pruneTopoRefs(topo, next.comps);
    return {ok: true, comps: next.comps, topo, message: done};
  }
  const i = next.comps.findIndex(c => c.id === ref.comp);
  if (i < 0) return {ok: false, message: '找不到這個零件，作品可能已經改變。'};
  let c = next.comps[i];
  if (ref.what === 'frameBody') c = dropHost(c, c.motorMount?.frameBody);
  else if (ref.what === 'motorCarrier') c = dropHost(c, c.motorCarrier);
  else if (ref.what === 'motorMountPoint') { c = {...c}; delete c.motorMountPoint; }
  else if (ref.what === 'syringeEnd') { const e = c[ref.end]; c = {...c, [ref.end]: {componentId: '', u: 0, v: 0, ...(e?.position ? {position: e.position} : {})}}; }
  else if (ref.what === 'syringeOutput') c = {...c, outputId: ''};
  else if (ref.what === 'moduleId') { c = {...c}; delete c.moduleId; }
  else return {ok: false, message: '這項問題需要自己決定怎麼修。'};
  next.comps[i] = c;
  return {ok: true, comps: next.comps, message: `已清除${quote(c)}失效的連結，其他零件都保留；可按復原。`};
}
function danglingText(ref, c, count) {
  const n = quote(c);
  switch (ref.what) {
    case 'frameBody': return `${n}記錄的馬達承載零件已經不存在，馬達的位置與方向無法對應。`;
    case 'motorCarrier': return `${n}記錄的馬達承載零件已經不存在。`;
    case 'motorMountPoint': return `${n}記錄的馬達座孔已不在這個零件上。`;
    case 'center': return `${n}記錄的馬達軸心不是它自己的孔，請重新設定馬達安裝。`;
    case 'carrierConflict': return `${n}的馬達承載零件有兩種不同的記錄，請重新選擇馬達裝在哪個零件上。`;
    case 'syringeEnd': return `${n}的${SYRINGE_END[ref.end]}端接在已經不存在的零件上。`;
    case 'syringeOutput': return `${n}要推動的零件已經不存在。`;
    case 'moduleId': return `${n}屬於已經不存在的模組。`;
    case 'barFusion': return `${n}的合成資料對不起來：${ref.why}`;
    case 'barFusionRoot': return `${n}記錄屬於一個合成件，但那個合成件已不存在或不含它，請先解除合成。`;
    case 'fusedWith': return `${n}合成的齒輪已經不存在，請先解除合成。`;
    case 'fusedPair': return `${n}和齒輪的合成不成立：${ref.why}請先解除合成，再修改。`;
    case 'moduleRef': return `模組「${ref.moduleName}」的${ref.role === 'output' ? `輸出端「${ref.outName}」` : ref.role === 'base' ? '基座' : '接合零件'}指向已經不存在的零件，請重新設定，或解散模組。`;
    case 'topo': return `作品裡有 ${count} 項軌跡追蹤、參考點、負載或量尺指向已經不存在的點。`;
    default: return null;
  }
}

/** 已啟用且正在發生的問題：[{key, code, text, repairs:[{id,label,plan(source)}]}]。馬達離開座板優先，並沿用原本的說明與兩個修復。 */
export function findings(work) {
  const rel = buildRelations(work), motors = offPlateMotors(work.comps), items = [];
  let topo = null;
  for (const issue of checkWork(work, rel)) {
    if (!ENABLED[issue.code] || !SHOWN.includes(issue.severity)) continue;
    if (issue.code === 'I1') {
      const motor = motors.find(m => m.center === issue.ids[0]);
      const item = motor ? {key: `I1|${issue.ids[0]}`, code: 'I1', short: '馬達軸心不在座板原孔上', mark: {far: [motor.id], canon: [motor.host.id]}, text: offPlateMessage(motor), repairs: [
        {id: 'back', label: '把馬達放回座板原孔', plan: s => planMotorReturn(s, motor.id)},
        {id: 'leave', label: '讓馬達離開座板（改成獨立固定點）', plan: s => planMotorLeave(s, motor.id)}]} : i1Item(rel, issue, work.comps);
      if (item) items.push(motor ? {...item, first: true} : item);
      continue;
    }
    const ref = issue.ref || {};
    if (ref.what === 'topo') { if (topo) topo.count++; else { topo = {key: 'I5|topo', code: issue.code, count: 1, mark: {far: [], canon: []}, repairs: [{id: 'clear', label: '清除失效的連結', plan: s => planClear(s, ref)}]}; items.push(topo); } continue; }
    const c = work.comps.find(x => x.id === ref.comp) || work.comps.find(x => x.id === issue.parts[0]);
    const text = danglingText(ref, c, 1) || issue.message;
    const fused = issue.code === 'I8';   // 合成件：標出涉及的所有零件，只說明、不提供修復（先解除合成，再修改）
    items.push({key: `${issue.code}|${ref.what || issue.message}|${ref.comp || ''}${ref.end || ''}`, code: issue.code, text, short: fused ? (c ? `${quote(c)}的合成資料對不起來` : '有一組合成件對不起來') : c ? `${quote(c)}有失效的馬達或接合記錄` : '有一項連接需要處理', mark: {far: fused ? issue.parts : c ? [c.id] : [], canon: []},
      repairs: ['frameBody', 'motorCarrier', 'motorMountPoint', 'syringeEnd', 'syringeOutput', 'moduleId'].includes(ref.what) ? [{id: 'clear', label: '清除失效的連結', plan: s => planClear(s, ref)}] : []});
  }
  if (topo) { topo.text = danglingText({what: 'topo'}, null, topo.count); topo.short = `有 ${topo.count} 項設定指向不存在的點`; }
  return items.sort((a, b) => (b.first ? 1 : 0) - (a.first ? 1 : 0));
}

/** 提交關卡拒絕時的說明（integrity-gate.js）：與開檔提示同一套名稱與色彩規則。回傳 {text, far, canon}。 */
export function describeIssue(work, issue, before) {
  const comps = work.comps || [];
  const mr = issue.ref;
  if (mr?.what === 'moduleRef') {   // 零件已在候選裡被刪掉：名稱從刪除前的作品取；整句就是給學生的說明，不加前綴
    const gone = (before?.comps || []).find(c => ownIdsOf(c).includes(mr.id)), own = gone ? ownIdsOf(gone) : [];
    const isOut = ((before?.modules || []).find(m => m?.id === mr.module)?.outputs || []).some(o => [o?.at, o?.body?.id, o?.body?.a, o?.body?.b, ...(o?.bolts || [])].some(v => own.includes(v)));   // 同一零件同時是基座與輸出件時只說輸出件
    return {text: `${quote(gone)}是模組「${mr.moduleName}」的${isOut ? '輸出件' : mr.role === 'base' ? '基座' : '接合件'}，請先拆下或解散模組，再刪除。`, far: [], canon: [], plain: true};
  }
  if (issue.code === 'I1') {
    const it = i1Item(buildRelations(work), issue, comps);
    if (it) return {text: it.text, far: it.mark.far, canon: it.mark.canon};
  }
  const ref = issue.ref || {}, c = comps.find(x => x.id === ref.comp) || comps.find(x => x.id === issue.parts[0]);
  const names = issue.parts.map(id => quote(comps.find(x => x.id === id))).join('、');
  const text = ref.what === 'partIdDup' ? `${names}的馬達零件編號重複，請重新編號其中一個。` : danglingText(ref, c, 1) || `${names}的馬達記錄自相矛盾。`;
  return {text: `${text}畫面上已標出這些零件。`, far: issue.parts, canon: []};
}
