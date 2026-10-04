/** 課程草稿與作品格式分離；所有傳入、傳出 snapshot 都複製。 */
import { getExample } from './examples.js';
import { normalizeSnapshot } from './schema.js';
import { compileTopology } from '../core/topology.js';
import { solveTopology } from '../multilink/solver.js';

const copy = value => JSON.parse(JSON.stringify(value));
export const COURSE_STAGES = ['observe', 'build', 'challenge', 'create'];
export function createCourseStart(stage) {
  const snapshot = normalizeSnapshot(getExample('fourbar-crank-rocker').snapshot);
  const topology = compileTopology(copy(snapshot.comps), { params: snapshot.params }, new Set());
  const solved = solveTopology(topology, { thetaDeg: 0 });
  for (const comp of snapshot.comps) for (const key of ['p1', 'p2']) {
    const point = comp[key], position = point && solved.points?.[point.id];
    if (position) Object.assign(point, { x: position.x, y: position.y });
  }
  if (stage === 'build' || stage === 'challenge') snapshot.comps = snapshot.comps.filter(c => c.id !== 'Link2');
  return snapshot;
}

export function checkCourseAssembly(snapshot, solve = true) {
  const comps = snapshot?.comps || [];
  const joins = (c, a, b) => c.type === 'bar' && [c.p1?.id, c.p2?.id].includes(a) && [c.p1?.id, c.p2?.id].includes(b);
  const anchors = comps.filter(c => c.type === 'anchor');
  const input = comps.find(c => joins(c, 'A', 'C') && c.isInput);
  const output = comps.find(c => joins(c, 'B', 'D') && !c.isInput);
  const coupler = comps.find(c => joins(c, 'C', 'D') && !c.isInput);
  if (!coupler) return { complete: false, message: '尚未接好：需要一根連桿真正連接兩個活動端。外觀碰到不等於接點相連。' };
  if (!input || !output || anchors.length !== 2 || !anchors.some(c => c.p1.id === 'A') || !anchors.some(c => c.p1.id === 'B') || comps.length !== 5) {
    return { complete: false, message: '請保留原有兩個固定支點與兩根活動桿，只補上一根浮桿。' };
  }
  if (coupler.p1.type !== 'floating' || coupler.p2.type !== 'floating') return { complete: false, message: '浮桿兩端需要可以相對轉動，不能另設為固定點。' };
  if (!solve) return { complete: true, message: '接點結構已完成，請按檢查連接。' };
  try {
    const compiled = compileTopology(copy(comps), { params: snapshot.params }, new Set());
    const result = solveTopology(compiled, { thetaDeg: Number(snapshot.params?.theta) || 0 });
    if (result.isValid === false || !['A', 'B', 'C', 'D'].every(id => Number.isFinite(result.points?.[id]?.x) && Number.isFinite(result.points?.[id]?.y))) throw new Error('unsolved');
  } catch (_) { return { complete: false, message: '接點已相連，但目前尺寸或角度無法求解；請調整或重新練習。' }; }
  return { complete: true, message: '接點檢查通過！請播放確認運動，再向同學說明機架與四個迴轉對。這不代表所有角度都能通過。' };
}

export function createCourseDrafts() {
  const drafts = new Map();
  return {
    save(stage, snapshot) { if (COURSE_STAGES.includes(stage)) drafts.set(stage, copy(snapshot)); },
    load(stage) { return drafts.has(stage) ? copy(drafts.get(stage)) : createCourseStart(stage); },
    reset(stage) { drafts.delete(stage); return createCourseStart(stage); }
  };
}
