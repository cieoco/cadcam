/**
 * blocks / dof
 *
 * 平面機構自由度（mobility）估算。這是純拓撲計算：不碰 DOM、不呼叫求解器，
 * 因而能在使用者每次接點或拆點後立刻回饋。
 *
 * 基本式為 Gruebler–Kutzbach：F = 3 (n - 1) - 2 j1 - j2。
 * n 含固定機架；j1 為轉軸／滑軌等低副，j2 為齒輪、齒條、皮帶等高副。
 *
 * 兩個共用接點的零件會合併成同一剛體（例如齒輪上的三點夾爪板）；
 * 兩端都固定的桿也會併入機架。這讓積木頁常見的複合桿件不會被誤判為
 * 「約束過多」。結果是理論拓撲 DOF，仍需由求解器確認桿長、嚙合與死點。
 */

import { pointKeysFor } from './part-types.js';

const GROUND = '__ground__';
const BODY_TYPES = new Set(['bar', 'triangle', 'slider', 'gear', 'rack', 'cam', 'pulley']);

class UnionFind {
  constructor(items) {
    this.parent = new Map(items.map(item => [item, item]));
  }
  find(item) {
    const parent = this.parent.get(item);
    if (parent === item) return item;
    const root = this.find(parent);
    this.parent.set(item, root);
    return root;
  }
  union(a, b) {
    const ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

function pointIds(comp) {
  if (!comp) return [];
  // 滑軌的可動剛體是滑塊 p3；p1/p2/m1/m2 是承載它的軌道／機架。
  if (comp.type === 'slider') return comp.p3?.id ? [comp.p3.id] : [];
  return pointKeysFor(comp).map(key => comp[key]?.id).filter(Boolean);
}

function isGroundPoint(point) {
  return Boolean(point && (point.type === 'fixed' || point.type === 'motor' || point.type === 'linear' ||
    point.physicalMotor || point.physical_motor));
}

function allGroundPointIds(comps) {
  const ground = new Set();
  comps.forEach(comp => pointKeysFor(comp).forEach(key => {
    const point = comp[key];
    if (point?.id && isGroundPoint(point)) ground.add(point.id);
  }));
  return ground;
}

function sharedCount(a, b) {
  let count = 0;
  a.forEach(id => { if (b.has(id)) count++; });
  return count;
}

/**
 * 回傳 { dof, bodies, lowerPairs, higherPairs, classification }。
 * classification 僅描述拓撲，呼叫端仍應把求解失敗與齒輪未嚙合當較高優先警告。
 */
export function analyzeDof(comps = []) {
  const assemblyMobility = comps.map(comp => Number(comp?.assemblyMobility)).find(Number.isFinite);
  const bodies = comps.filter(comp => BODY_TYPES.has(comp?.type) && !comp.visualOnly)
    .map((comp, index) => ({ id: `body:${index}`, comp, points: new Set(pointIds(comp)) }));
  const groundPoints = allGroundPointIds(comps);
  const uf = new UnionFind([GROUND, ...bodies.map(body => body.id)]);

  // 兩個以上共用銷代表兩個零件沒有相對運動，合成同一剛體。
  for (let i = 0; i < bodies.length; i++) {
    if (sharedCount(bodies[i].points, groundPoints) >= 2) uf.union(GROUND, bodies[i].id);
    for (let j = i + 1; j < bodies.length; j++) {
      if (sharedCount(bodies[i].points, bodies[j].points) >= 2) uf.union(bodies[i].id, bodies[j].id);
    }
  }

  const groups = new Set([uf.find(GROUND)]);
  bodies.forEach(body => groups.add(uf.find(body.id)));
  const pointBodies = new Map();
  const addAtPoint = (pointId, bodyId) => {
    if (!pointId) return;
    const set = pointBodies.get(pointId) || new Set();
    set.add(bodyId);
    pointBodies.set(pointId, set);
  };
  bodies.forEach(body => body.points.forEach(pointId => addAtPoint(pointId, uf.find(body.id))));
  groundPoints.forEach(pointId => addAtPoint(pointId, uf.find(GROUND)));

  // 多元轉軸有 k 個剛體相交時，相當於 k - 1 個二元低副。
  let lowerPairs = 0;
  pointBodies.forEach(set => { lowerPairs += Math.max(0, set.size - 1); });

  // 每個滑塊與齒條另有一個直線導引（低副）；其軌道可能固定或由別的桿承載，
  // 但對 DOF 計數而言都提供一個低副約束。
  bodies.filter(body => (body.comp.type === 'slider' || body.comp.type === 'rack') && uf.find(body.id) !== uf.find(GROUND))
    .forEach(() => { lowerPairs++; });

  // 高副傳動：資料只在從動端記 mesh/pinion，故每一項剛好計一次。
  let higherPairs = 0;
  comps.forEach(comp => {
    if ((comp.type === 'gear' && comp.mesh) ||
        (comp.type === 'rack' && comp.pinion) ||
        (comp.type === 'belt' && comp.driver && comp.driven)) higherPairs++;
  });

  const formulaDof = 3 * (groups.size - 1) - 2 * lowerPairs - higherPairs;
  // 特殊幾何組裝（例如雙平行四連桿升降臂）含冗餘平行約束，通用 Grübler
  // 計數無法反映其實際 mobility。範例可明確宣告經機構驗證的組裝自由度；
  // formulaDof 仍回傳供狀態提示與除錯使用，避免把覆寫當成公式結果。
  const dof = Number.isFinite(assemblyMobility) ? assemblyMobility : formulaDof;
  const classification = bodies.length === 0 ? 'empty' : (dof < 0 ? 'overconstrained' :
    (dof === 0 ? 'structure' : (dof === 1 ? 'single' : 'underconstrained')));
  return { dof, formulaDof, mobilityOverride: Number.isFinite(assemblyMobility), bodies: groups.size - 1, lowerPairs, higherPairs, classification };
}
