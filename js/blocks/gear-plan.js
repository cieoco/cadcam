/**
 * blocks / gear-plan  (pack O4 of docs/SDD-OPERATION-PIPELINE.md)
 *
 * 齒輪的「刪除」與「分開咬合」規劃（純函式，不碰 S、不碰 DOM）。提交、一致性檢查、一次復原、一行回饋都交給 edit-pipeline 的 runEdit。
 *
 * 刪除一個齒輪＝只刪這一個（結果要符合所選動作），不再順手刪掉整條嚙合鏈：
 *   - 被它帶動的齒輪留在原位，只是不再嚙合（拿掉 mesh），並且說出來；
 *   - 掛在它上面的齒條離開小齒輪就無法成立（齒條的位置是相對小齒輪定義的），所以連同齒條的固定導銷一起刪，並且說出來；
 *   - 它的驅動輪、共軸（同一對定位孔）的齒輪都不受影響。
 * 分開咬合＝選到的齒輪與所有嚙合夥伴（驅動它的、被它帶動的）分開，齒輪都留在原位。
 */
import {runEdit} from './edit-pipeline.js';
import {ownedParamKeys, pointKeysFor} from './part-types.js';
import {sameGearBody} from '../core/gear-train.js';
import {detachDeletedAttachments} from './detached-attachments.js';
import {localHoles} from '../core/local-holes.js';
import {frameHoleAxis} from './frame-holes.js';

const gearsOf = comps => comps.filter(c => c.type === 'gear');
const list = names => names.length < 3 ? names.join('和') : `${names.slice(0, -1).join('、')}和${names.at(-1)}`;

/** 學生看得到的齒輪名稱：自己取的名字，否則「24 齒齒輪」；同樣齒數有好幾個時用「左起第 N 個」分開。不顯示內部編號。 */
export function gearLabel(gear, comps) {
  const base = g => (typeof g.name === 'string' && g.name.trim()) || `${g.teeth} 齒齒輪`;
  const same = gearsOf(comps).filter(g => base(g) === base(gear)).sort((a, b) => (a.p1?.x ?? 0) - (b.p1?.x ?? 0) || (a.p1?.y ?? 0) - (b.p1?.y ?? 0));
  return `「${same.length > 1 ? `左起第 ${same.indexOf(gear) + 1} 個 ` : ''}${base(gear)}」`;
}
const labels = (gears, comps) => gears.map(g => gearLabel(g, comps));

/** work={comps,params,modules,fabrication,points}；part 是要刪的齒輪（comp）。 */
export function planDeleteGear(work, part) {
  const {comps} = work;
  if (comps.some(c => c.fusedWith === part.id)) return {ok: false, message: '請先解除合成，再刪除齒輪'};
  const followers = gearsOf(comps).filter(g => g.mesh === part.id);
  const racks = comps.filter(c => c.type === 'rack' && c.pinion === part.id);
  const guidePins = new Set(racks.flatMap(r => r.framePins || []));
  const gone = new Set([part.id, ...racks.map(r => r.id)]);
  const own = new Set([...pointKeysFor(part).map(k => part[k]?.id), ...localHoles(part).map(h => h.id)].filter(Boolean));
  const name = gearLabel(part, comps), followerNames = labels(followers, comps);

  const unmeshed = comps.map(c => { if (c.mesh !== part.id) return c; const {mesh, ...rest} = c; return rest; });
  const params = {...work.params};
  [part, ...racks].forEach(c => ownedParamKeys(c).forEach(k => delete params[k]));
  const candidate = detachDeletedAttachments(structuredClone(unmeshed), gone, params, work.points)
    .filter(c => !gone.has(c.id) && !(c.type === 'anchor' && guidePins.has(c.p1?.id)));

  const notes = [];
  if (followers.length) notes.push(`${list(followerNames)}不再被它帶動，留在原位。`);
  if (racks.length) notes.push('它帶動的齒條（含固定導銷）離開齒輪就無法成立，已一起刪除。');
  if (part.p1?.physicalMotor) notes.push('裝在它上面的馬達設定也一起移除。');
  const joined = candidate.filter(c => !['anchor', 'syringe', 'motor', 'rack'].includes(c.type) && !(c.type === 'gear' && sameGearBody(c, part)) && pointKeysFor(c).some(k => own.has(c[k]?.id)));
  if (joined.length) notes.push(`原本相接的 ${joined.length} 個零件保留，接孔已放開。`);
  for (const c of candidate) if (c.frameHole && !frameHoleAxis(candidate, c)) { delete c.frameHole; notes.push('機架孔的基準已移除，孔保留在原位置成為獨立固定點。'); }
  return {ok: true, comps: candidate, params, message: `已刪除${name}。${notes.join('')}`, after: S => { S.selectedGearId = null; }};
}

/** work={comps}；id＝選到的齒輪。 */
export function planReleaseMesh(work, id) {
  const {comps} = work, gear = gearsOf(comps).find(g => g.id === id);
  if (!gear) return {ok: false, message: '請先選取要分開咬合的齒輪。'};
  const driver = gear.mesh ? gearsOf(comps).find(g => g.id === gear.mesh) : null;
  const followers = gearsOf(comps).filter(g => g.mesh === gear.id);
  const partners = [...(driver ? [driver] : []), ...followers];
  if (!partners.length) {
    const rack = comps.some(c => c.type === 'rack' && c.pinion === gear.id);
    return {ok: false, message: rack ? `${gearLabel(gear, comps)}只和齒條配對，齒條無法單獨分開；要拆開請刪除齒條或齒輪。` : `${gearLabel(gear, comps)}沒有和別的齒輪嚙合，不用分開。`};
  }
  const released = new Set([...(driver ? [gear.id] : []), ...followers.map(g => g.id)]);
  const next = comps.map(c => { if (!released.has(c.id)) return c; const {mesh, ...rest} = c; return rest; });
  const idle = gearsOf(comps).filter(g => released.has(g.id) && !g.p1?.physicalMotor);   // 失去驅動輪、自己又沒有馬達的
  const note = idle.length ? `${list(labels(idle, comps))}不再被帶動。` : '';
  return {ok: true, comps: next, params: {...work.params}, clearSelection: false,
    message: `已把${list(labels([gear, ...partners], comps))}分開，不再嚙合；齒輪都留在原位。${note}`};
}

/** 選到的齒輪分開咬合。host={S,transient,pushUndo,pause,rebuild,draw,afterCommit?}。 */
export function releaseSelectedMesh(host) {
  return runEdit({name: '分開咬合', plan: work => planReleaseMesh(work, host.S.selectedGearId), host});
}
