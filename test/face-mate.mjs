import { boxFaces, solveFaceMate, transformMatePoint } from '../js/blocks/face-mate.js';

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${name}`);
  }
}

const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const vecClose = (a, b) => ['x', 'y', 'z'].every(k => close(a[k], b[k]));
const hostBox = { min: { x: -40, y: -30, z: -20 }, max: { x: 40, y: 30, z: 20 } };
const childBox = { min: { x: -24, y: -16, z: -12 }, max: { x: 24, y: 16, z: 12 } };
const faceIds = ['right', 'left', 'front', 'back', 'top', 'bottom'];

check('boxFaces 回傳固定六面及完整面欄位', boxFaces(hostBox).length === 6 && boxFaces(hostBox).every(f =>
  faceIds.includes(f.id) && f.center && f.n && f.u && f.v && f.width > 0 && f.height > 0));
check('錯誤外框回傳空陣列', boxFaces(null).length === 0 && boxFaces({ min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 0, z: 1 } }).length === 0);
check('六個面 frame 都符合 u × v = n', boxFaces(hostBox).every(f => {
  const cross = { x: f.u.y * f.v.z - f.u.z * f.v.y, y: f.u.z * f.v.x - f.u.x * f.v.z, z: f.u.x * f.v.y - f.u.y * f.v.x };
  return vecClose(cross, f.n);
}));

let pairCount = 0;
for (const hostFace of faceIds) for (const childFace of faceIds) for (let quarterTurns = 0; quarterTurns < 4; quarterTurns += 1) {
  const mate = solveFaceMate({ hostBox, childBox, hostFace, childFace, quarterTurns });
  const valid = mate.ok && mate.rotation.length === 3 && mate.rotation.every(row => row.length === 3 && row.every(Number.isFinite));
  const R = mate.rotation;
  const rowsOrCols = [0, 1, 2].every(i => close(R[i][0] ** 2 + R[i][1] ** 2 + R[i][2] ** 2, 1)) &&
    [0, 1, 2].every(i => close(R[0][i] ** 2 + R[1][i] ** 2 + R[2][i] ** 2, 1));
  const det = R[0][0] * (R[1][1] * R[2][2] - R[1][2] * R[2][1]) - R[0][1] * (R[1][0] * R[2][2] - R[1][2] * R[2][0]) + R[0][2] * (R[1][0] * R[2][1] - R[1][1] * R[2][0]);
  const hostNormal = [mate.host.n.x, mate.host.n.y, mate.host.n.z];
  const childNormal = [mate.child.n.x, mate.child.n.y, mate.child.n.z];
  const transformedNormal = [0, 1, 2].map(i => R[i][0] * childNormal[0] + R[i][1] * childNormal[1] + R[i][2] * childNormal[2]);
  const point = transformMatePoint(mate, mate.child.center);
  const expected = { x: mate.host.center.x + mate.host.n.x * 0, y: mate.host.center.y + mate.host.n.y * 0, z: mate.host.center.z + mate.host.n.z * 0 };
  pairCount += 1;
  check(`面配對 ${hostFace}/${childFace}/轉 ${quarterTurns}`, valid && rowsOrCols && close(det, 1) &&
    transformedNormal.every((v, i) => close(v, -hostNormal[i])) && vecClose(point, expected) && mate.host.id === hostFace && mate.child.id === childFace);
}

const base = solveFaceMate({ hostBox, childBox, hostFace: 'top', childFace: 'bottom' });
const edge = solveFaceMate({ hostBox, childBox, hostFace: 'top', childFace: 'bottom', alignU: 1, alignV: -1 });
const shifted = solveFaceMate({ hostBox, childBox, hostFace: 'top', childFace: 'bottom', alignU: 1, alignV: -1, offsetU: 3.5, offsetV: -2, gap: 7 });
check('置中接合', vecClose(transformMatePoint(base, base.child.center), base.host.center));
check('靠角接合使用面內投影尺寸', vecClose(transformMatePoint(edge, edge.child.center), { x: 16, y: -14, z: 20 }));
check('偏置與間距沿宿主 u/v/n', vecClose(transformMatePoint(shifted, shifted.child.center), { x: 19.5, y: -16, z: 27 }));

const turned = solveFaceMate({ hostBox, childBox, hostFace: 'top', childFace: 'bottom', quarterTurns: 1, alignU: 1 });
check('90 度後交換投影寬高並靠邊', vecClose(transformMatePoint(turned, turned.child.center), { x: 24, y: 0, z: 20 }));

// 獨立以變換後四角的實際投影驗收九種對齊，不只重算求解器的中心公式。
let alignmentCount = 0, allAligned = true;
for (const hostFace of faceIds) for (const childFace of faceIds) for (let quarterTurns = 0; quarterTurns < 4; quarterTurns++) {
  for (const alignU of [-1, 0, 1]) for (const alignV of [-1, 0, 1]) {
    const mate = solveFaceMate({ hostBox, childBox, hostFace, childFace, quarterTurns, alignU, alignV, offsetU: 3, offsetV: -7, gap: 9 });
    const points = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => transformMatePoint(mate, {
      x: mate.child.center.x + u * mate.child.u.x * mate.child.width / 2 + v * mate.child.v.x * mate.child.height / 2,
      y: mate.child.center.y + u * mate.child.u.y * mate.child.width / 2 + v * mate.child.v.y * mate.child.height / 2,
      z: mate.child.center.z + u * mate.child.u.z * mate.child.width / 2 + v * mate.child.v.z * mate.child.height / 2,
    }));
    const projection = axis => points.map(p => (p.x - mate.host.center.x) * axis.x + (p.y - mate.host.center.y) * axis.y + (p.z - mate.host.center.z) * axis.z);
    for (const [axis, alignment, size, offset] of [[mate.host.u, alignU, mate.host.width, 3], [mate.host.v, alignV, mate.host.height, -7]]) {
      const values = projection(axis), min = Math.min(...values), max = Math.max(...values);
      allAligned &&= close(alignment === -1 ? min : alignment === 1 ? max : (min + max) / 2, alignment * size / 2 + offset);
    }
    allAligned &&= projection(mate.host.n).every(value => close(value, 9));
    alignmentCount++;
  }
}
check(`全部 ${alignmentCount} 種靠角／靠邊／置中以四角投影保持偏置及間距`, allAligned);

const movedHost = { min: { x: 100, y: -180, z: 40 }, max: { x: 180, y: -120, z: 80 } };
const movedChild = { min: { x: -90, y: 64, z: 10 }, max: { x: -42, y: 96, z: 34 } };
const moved = solveFaceMate({ hostBox: movedHost, childBox: movedChild, hostFace: 'right', childFace: 'front', gap: 6 });
check('非原點外框的面中心精確對齊', vecClose(transformMatePoint(moved, moved.child.center), { x: 186, y: -150, z: 60 }));

const invalid = [
  { hostBox: null, childBox },
  { hostBox, childBox, hostFace: 'north', childFace: 'top' },
  { hostBox, childBox, hostFace: '__proto__', childFace: 'top' },
  { hostBox, childBox, hostFace: 'constructor', childFace: 'top' },
  { hostBox, childBox, hostFace: 'toString', childFace: 'top' },
  { hostBox, childBox, hostFace: 'top', childFace: 'bottom', alignU: 0.5 },
  { hostBox, childBox, hostFace: 'top', childFace: 'bottom', offsetV: Infinity },
  { hostBox, childBox, hostFace: 'top', childFace: 'bottom', gap: -1 },
  { hostBox, childBox, hostFace: 'top', childFace: 'bottom', quarterTurns: 4 },
  {
    hostBox: { min: { x: 1e308, y: 0, z: 0 }, max: { x: 1.1e308, y: 10, z: 10 } },
    childBox, hostFace: 'top', childFace: 'bottom', offsetU: 1e308,
  },
];
check('非法輸入都有繁體中文失敗原因', invalid.every(input => {
  const result = solveFaceMate(input);
  return result.ok === false && typeof result.reason === 'string' && result.reason.length > 0;
}));
const original = JSON.stringify({ hostBox, childBox });
solveFaceMate({ hostBox, childBox, hostFace: 'front', childFace: 'right', quarterTurns: 3, offsetU: 5 });
check('求解不修改輸入外框', JSON.stringify({ hostBox, childBox }) === original);

for (const rotationDeg of [37.5, -22, 450]) {
  const m = solveFaceMate({ hostBox, childBox, hostFace: 'top', childFace: 'bottom', rotationDeg, alignU: 1, gap: 5 });
  const points = [[-24,-16],[24,-16],[24,16],[-24,16]].map(([x,y]) => transformMatePoint(m,{x,y,z:-12}));
  check(`任意角 ${rotationDeg} 保持面間距與靠右邊`, points.every(p => close(p.z,25)) && close(Math.max(...points.map(p => p.x)),40));
}
check('拒絕非法角度', !solveFaceMate({ hostBox, childBox, hostFace:'top', childFace:'bottom', rotationDeg: NaN }).ok);
console.log(`face-mate: ${passed} passed, ${failed} failed (${pairCount} 面配對朝向)`);
if (failed) process.exitCode = 1;
