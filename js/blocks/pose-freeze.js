/**
 * blocks / pose-freeze  (pack M1 of docs/SDD-MOTOR-PART.md; 原本是 actuator-installation.js 解除輸出時的內部步驟)
 *
 * 拿掉一個輸出件的驅動之前，把與它相連的整組零件的座標改成「目前畫面上的姿勢」（含共用接點的每一份副本）：
 * 座標只是畫面種子，留著舊值，被放開的桿會跳回存檔時的姿勢。純函式：直接改傳入的 comps（呼叫端先複製）。
 */
import {localHoles, holeWorld} from '../core/local-holes.js';
import {pointKeysFor} from './part-types.js';

export function freezeDisplayedPose(comps, ownerId, points = {}) {
  const old = comps.find(c => c.id === ownerId);
  if (!old) return comps;
  const group = new Set([old.id]), nodes = new Set(pointKeysFor(old).map(k => old[k]?.id).filter(Boolean));
  let grew = true; while (grew) { grew = false; for (const c of comps) if (!group.has(c.id) && pointKeysFor(c).some(k => nodes.has(c[k]?.id))) { group.add(c.id); pointKeysFor(c).forEach(k => { if (c[k]) nodes.add(c[k].id); }); grew = true; } }
  const lattice = new Set(comps.flatMap(c => localHoles(c).map(h => h.id)));      // a hole end follows its body, not the display seed
  for (const c of comps) if (group.has(c.id)) for (const k of pointKeysFor(c)) if (c[k] && !lattice.has(c[k].id) && points[c[k].id] && [points[c[k].id].x, points[c[k].id].y].every(Number.isFinite)) Object.assign(c[k], {x: points[c[k].id].x, y: points[c[k].id].y});
  for (const o of comps) if (group.has(o.id)) for (const h of localHoles(o)) { const w = holeWorld(o, h); for (const c of comps) if (c !== o) for (const k of pointKeysFor(c)) if (c[k]?.id === h.id) Object.assign(c[k], {x: w.x, y: w.y}); }
  return comps;
}
