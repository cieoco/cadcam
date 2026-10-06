/**
 * 純六面體面接合幾何。座標採 X 右、Y 前、Z 上；每個面固定使用右手局部座標。
 */

const FACE_AXES = {
  right:  { normal: [ 1, 0, 0], u: [0, 1, 0], v: [0, 0, 1], width: 'y', height: 'z' },
  left:   { normal: [-1, 0, 0], u: [0,-1, 0], v: [0, 0, 1], width: 'y', height: 'z' },
  front:  { normal: [ 0, 1, 0], u: [-1,0, 0], v: [0, 0, 1], width: 'x', height: 'z' },
  back:   { normal: [ 0,-1, 0], u: [ 1,0, 0], v: [0, 0, 1], width: 'x', height: 'z' },
  top:    { normal: [ 0, 0, 1], u: [ 1,0, 0], v: [0, 1, 0], width: 'x', height: 'y' },
  bottom: { normal: [ 0, 0,-1], u: [ 1,0, 0], v: [0,-1, 0], width: 'x', height: 'y' },
};

const finiteVec = p => p && typeof p === 'object' && ['x', 'y', 'z'].every(k => Number.isFinite(p[k]));
const toArray = p => [p.x, p.y, p.z];
const fromArray = p => ({ x: p[0], y: p[1], z: p[2] });
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

function validBox(box) {
  if (!box || typeof box !== 'object' || !finiteVec(box.min) || !finiteVec(box.max)) return false;
  return ['x', 'y', 'z'].every(k => Number.isFinite(box.max[k] - box.min[k]) && box.max[k] > box.min[k]);
}

function makeFaces(box) {
  if (!validBox(box)) return [];
  const center = {
    x: box.min.x + (box.max.x - box.min.x) / 2,
    y: box.min.y + (box.max.y - box.min.y) / 2,
    z: box.min.z + (box.max.z - box.min.z) / 2,
  };
  const size = { x: box.max.x - box.min.x, y: box.max.y - box.min.y, z: box.max.z - box.min.z };
  return Object.entries(FACE_AXES).map(([id, frame]) => {
    const axis = frame.normal.findIndex(value => value !== 0);
    const faceCenter = { ...center };
    const key = ['x', 'y', 'z'][axis];
    faceCenter[key] = frame.normal[axis] > 0 ? box.max[key] : box.min[key];
    return {
      id,
      center: faceCenter,
      n: fromArray(frame.normal),
      u: fromArray(frame.u),
      v: fromArray(frame.v),
      width: size[frame.width],
      height: size[frame.height],
    };
  });
}

/** 回傳固定次序 right/left/front/back/top/bottom 的六面；無效尺寸回傳空陣列。 */
export function boxFaces(box) {
  return makeFaces(box);
}

/** 以 row-major 3×3 rotation 和 translation 將點轉到組立座標。 */
export function transformMatePoint(mate, point) {
  if (!mate || !Array.isArray(mate.rotation) || mate.rotation.length !== 3 ||
      !mate.rotation.every(row => Array.isArray(row) && row.length === 3 && row.every(Number.isFinite)) ||
      !finiteVec(mate.translation) || !finiteVec(point)) {
    throw new Error('接合轉換或點座標無效');
  }
  const p = toArray(point);
  const t = toArray(mate.translation);
  return fromArray(mate.rotation.map((row, i) => row[0] * p[0] + row[1] * p[1] + row[2] * p[2] + t[i]));
}

function failure(reason) {
  return { ok: false, reason };
}

/** 將 childFace 接到 hostFace；面內偏置與間距均以 mm 表示。 */
export function solveFaceMate({
  hostBox, childBox, hostFace, childFace,
  alignU = 0, alignV = 0, offsetU = 0, offsetV = 0, gap = 0, quarterTurns = 0,
} = {}) {
  if (!validBox(hostBox) || !validBox(childBox)) return failure('兩個外框都必須有有限且大於零的長寬高');
  if (!Object.hasOwn(FACE_AXES, hostFace) || !Object.hasOwn(FACE_AXES, childFace)) return failure('請選擇有效的接合面');
  if (![alignU, alignV].every(value => value === -1 || value === 0 || value === 1)) return failure('面內對齊只能選 -1、0 或 1');
  if (![offsetU, offsetV].every(Number.isFinite)) return failure('面內偏置必須是有限數值');
  if (!Number.isFinite(gap) || gap < 0) return failure('接合間距必須是大於或等於 0 的有限數值');
  if (!Number.isInteger(quarterTurns) || quarterTurns < 0 || quarterTurns > 3) return failure('轉向只能是 0 到 3 個四分之一圈');

  const host = makeFaces(hostBox).find(face => face.id === hostFace);
  const child = makeFaces(childBox).find(face => face.id === childFace);
  const hu = toArray(host.u), hv = toArray(host.v), hn = toArray(host.n);
  const cu = toArray(child.u), cv = toArray(child.v);

  // 零轉向時 child.u 對 host.u，child.v 對 -host.v，保持 child 法向指向 host。
  const targetU = [hu, hv, scale(hu, -1), scale(hv, -1)][quarterTurns];
  const targetV = [scale(hv, -1), hu, hv, scale(hu, -1)][quarterTurns];
  const targetN = scale(hn, -1);
  const rotation = [0, 1, 2].map(row => [
    targetU[row] * cu[0] + targetV[row] * cv[0] + targetN[row] * toArray(child.n)[0],
    targetU[row] * cu[1] + targetV[row] * cv[1] + targetN[row] * toArray(child.n)[1],
    targetU[row] * cu[2] + targetV[row] * cv[2] + targetN[row] * toArray(child.n)[2],
  ]);

  const projectedWidth = Math.abs(dot(targetU, hu)) * child.width + Math.abs(dot(targetV, hu)) * child.height;
  const projectedHeight = Math.abs(dot(targetU, hv)) * child.width + Math.abs(dot(targetV, hv)) * child.height;
  const shiftU = alignU * (host.width - projectedWidth) / 2 + offsetU;
  const shiftV = alignV * (host.height - projectedHeight) / 2 + offsetV;
  const desiredCenter = add(add(add(toArray(host.center), scale(hu, shiftU)), scale(hv, shiftV)), scale(hn, gap));
  const childCenter = toArray(child.center);
  const rotatedChildCenter = rotation.map(row => dot(row, childCenter));
  const translation = fromArray(desiredCenter.map((value, i) => value - rotatedChildCenter[i]));
  if (!rotation.every(row => row.every(Number.isFinite)) || !finiteVec(translation)) {
    return failure('接合位置超出可計算範圍');
  }

  return { ok: true, rotation, translation, host, child };
}
