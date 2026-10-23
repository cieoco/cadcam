// 鏈輪與 #25 鏈條的 3D 形狀（viewer 第一次畫到才載入）。
// 鏈輪：薄圓盤（厚 2.8 mm）＋滾子槽與齒尖；鏈條：每節一個滾子圓柱＋兩側鏈板，沿兩輪外公切線與包角弧排列。
import * as THREE from 'three';
import { CHAIN_25 } from '../core/chain-drive.js';
import { sprocketOutline, openBeltTangents } from '../blocks/transmission-geometry.js';

export const SPROCKET_THICKNESS = 2.8;

export function sprocketGeometry(teeth, boreR) {
  const outline = sprocketOutline(teeth);
  const shape = new THREE.Shape();
  outline.forEach((q, i) => (i ? shape.lineTo(q.x, q.y) : shape.moveTo(q.x, q.y)));
  shape.closePath();
  const bore = new THREE.Path();
  bore.absarc(0, 0, boreR, 0, Math.PI * 2, true);
  shape.holes.push(bore);
  return new THREE.ExtrudeGeometry(shape, { depth: SPROCKET_THICKNESS, bevelEnabled: false, curveSegments: 8 });
}

// 閉合鏈路徑（外公切線＋包角弧）；回傳均勻取樣到 links 個點（滾子中心）。
export function chainRollerPoints(c1, r1, c2, r2, links) {
  const t = openBeltTangents(c1, r1, c2, r2);
  if (t.length < 2) return [];
  const arc = (c, r, from, to, away) => {
    const a0 = Math.atan2(from.y - c.y, from.x - c.x);
    let ccw = Math.atan2(to.y - c.y, to.x - c.x) - a0;
    while (ccw < 0) ccw += Math.PI * 2;
    const cw = ccw - Math.PI * 2;
    const mid = d => Math.hypot(c.x + Math.cos(a0 + d / 2) * r - away.x, c.y + Math.sin(a0 + d / 2) * r - away.y);
    const delta = mid(ccw) >= mid(cw) ? ccw : cw;
    const n = Math.max(8, Math.round(Math.abs(delta) / (Math.PI * 2) * 96));
    return Array.from({ length: n }, (_, i) => ({ x: c.x + Math.cos(a0 + delta * (i + 1) / n) * r, y: c.y + Math.sin(a0 + delta * (i + 1) / n) * r }));
  };
  const path = [t[0].a, t[0].b, ...arc(c2, r2, t[0].b, t[1].b, c1), t[1].a, ...arc(c1, r1, t[1].a, t[0].a, c2)];
  const seg = path.map((p, i) => Math.hypot(path[(i + 1) % path.length].x - p.x, path[(i + 1) % path.length].y - p.y));
  const total = seg.reduce((a, b) => a + b, 0);
  const out = [];
  let i = 0, acc = 0;
  for (let k = 0; k < links; k++) {
    const target = total * k / links;
    while (i < seg.length - 1 && acc + seg[i] < target) { acc += seg[i]; i++; }
    const f = seg[i] > 0 ? (target - acc) / seg[i] : 0, a = path[i], b = path[(i + 1) % path.length];
    out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
  }
  return out;
}

// 回傳一個 Group：滾子（InstancedMesh）＋內外鏈板（InstancedMesh），中心面在 zMid。
export function chainGroup(b, materials) {
  const links = Math.max(2, Math.round(Number(b.links) || 0));
  const pts = chainRollerPoints(b.driver.center, b.driver.radius, b.driven.center, b.driven.radius, links);
  const group = new THREE.Group();
  if (pts.length < links) return group;
  const zMid = b.zMid;
  const roller = new THREE.InstancedMesh(new THREE.CylinderGeometry(CHAIN_25.rollerDiameter / 2, CHAIN_25.rollerDiameter / 2, CHAIN_25.innerWidth, 12), materials.roller, links);
  const plates = new THREE.InstancedMesh(new THREE.BoxGeometry(1, CHAIN_25.plateHeight, CHAIN_25.plateThickness), materials.plate, links * 2);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const side = CHAIN_25.innerWidth / 2 + CHAIN_25.plateThickness / 2;
  pts.forEach((a, i) => {
    const n = pts[(i + 1) % pts.length];
    m.compose(p.set(a.x, a.y, zMid), flat, s);
    roller.setMatrixAt(i, m);
    const len = Math.hypot(n.x - a.x, n.y - a.y) + CHAIN_25.plateHeight * 0.6;   // 鏈板長度略大於節距，兩端包住滾子
    q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(n.y - a.y, n.x - a.x));
    [-1, 1].forEach((sign, j) => {
      m.compose(p.set((a.x + n.x) / 2, (a.y + n.y) / 2, zMid + sign * side), q, s.set(len, 1, 1));
      plates.setMatrixAt(i * 2 + j, m);
    });
    s.set(1, 1, 1);
  });
  roller.instanceMatrix.needsUpdate = plates.instanceMatrix.needsUpdate = true;
  group.add(roller, plates);
  return group;
}
