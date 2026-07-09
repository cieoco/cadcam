/**
 * blocks3d / viewer
 *
 * THREE.js 3D 預覽器（碰 DOM / WebGL 的 ui 層）。吃 scene-model.js 產生的「場景模型」，
 * 把每根桿擠出成「有厚度、打了孔的扁板」（沿用 2D 的冰棒棍外形），關節畫成銷柱。
 *
 * 唯讀：相機可繞、可縮放，但不編輯機構——建構/拖曳仍在 2D SVG 完成。
 *
 * 用法：
 *   const viewer = createViewer(containerEl);
 *   viewer.update(model);   // 每幀（或每次編輯）把最新姿勢推進來
 *   viewer.resize();        // 容器尺寸改變時
 *   viewer.dispose();       // 卸載
 */

import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { createGearPath } from '../utils/gear-geometry.js';

// 把一根桿（兩端 a、b、半徑 r、兩端孔徑 holeR）做成 THREE.Shape。
// 外形與 blocks.html 的 barHullPath 一致：兩端圓 + 外切線 + 半圓封口，外加兩個孔。
function stadiumShape(a, b, r, holeR) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dy / dist;   // 右側法線
  const ny = -dx / dist;

  const s1 = { x: a.x + nx * r, y: a.y + ny * r };
  const e1 = { x: b.x + nx * r, y: b.y + ny * r };
  const s2 = { x: b.x - nx * r, y: b.y - ny * r };
  const e2 = { x: a.x - nx * r, y: a.y - ny * r };

  const shape = new THREE.Shape();
  shape.moveTo(s1.x, s1.y);
  shape.lineTo(e1.x, e1.y);
  // b 端封口：從 e1 繞到 s2，外凸（CCW）
  shape.absarc(b.x, b.y, r,
    Math.atan2(e1.y - b.y, e1.x - b.x),
    Math.atan2(s2.y - b.y, s2.x - b.x), false);
  shape.lineTo(e2.x, e2.y);
  // a 端封口：從 e2 繞到 s1，外凸（CCW）
  shape.absarc(a.x, a.y, r,
    Math.atan2(e2.y - a.y, e2.x - a.x),
    Math.atan2(s1.y - a.y, s1.x - a.x), false);

  // 兩端鑽孔（反向繞，當作 hole）
  const ha = new THREE.Path();
  ha.absarc(a.x, a.y, holeR, 0, Math.PI * 2, true);
  const hb = new THREE.Path();
  hb.absarc(b.x, b.y, holeR, 0, Math.PI * 2, true);
  shape.holes.push(ha, hb);

  return shape;
}

// 膠囊形（stadium）孔路徑：給軌道挖長槽用。順時針繞（與圓孔同向），當作 hole。
function capsuleHolePath(a, b, r) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dy / dist;   // 右側法線
  const ny = -dx / dist;
  const aR = { x: a.x + nx * r, y: a.y + ny * r };
  const bR = { x: b.x + nx * r, y: b.y + ny * r };
  const aL = { x: a.x - nx * r, y: a.y - ny * r };
  const bL = { x: b.x - nx * r, y: b.y - ny * r };
  const p = new THREE.Path();
  p.moveTo(aR.x, aR.y);
  p.lineTo(bR.x, bR.y);
  p.absarc(b.x, b.y, r,
    Math.atan2(bR.y - b.y, bR.x - b.x),
    Math.atan2(bL.y - b.y, bL.x - b.x), true);   // b 端半圓（CW）
  p.lineTo(aL.x, aL.y);
  p.absarc(a.x, a.y, r,
    Math.atan2(aL.y - a.y, aL.x - a.x),
    Math.atan2(aR.y - a.y, aR.x - a.x), true);   // a 端半圓（CW）
  return p;
}

// 膠囊形（stadium）實心 THREE.Shape：給槽底有色墊片用（逆時針繞，當實心輪廓）。
function capsuleShape(a, b, r) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dy / dist;
  const ny = -dx / dist;
  const aR = { x: a.x + nx * r, y: a.y + ny * r };
  const bR = { x: b.x + nx * r, y: b.y + ny * r };
  const aL = { x: a.x - nx * r, y: a.y - ny * r };
  const bL = { x: b.x - nx * r, y: b.y - ny * r };
  const s = new THREE.Shape();
  s.moveTo(aR.x, aR.y);
  s.lineTo(bR.x, bR.y);
  s.absarc(b.x, b.y, r,
    Math.atan2(bR.y - b.y, bR.x - b.x),
    Math.atan2(bL.y - b.y, bL.x - b.x), false);
  s.lineTo(aL.x, aL.y);
  s.absarc(a.x, a.y, r,
    Math.atan2(aL.y - a.y, aL.x - a.x),
    Math.atan2(aR.y - a.y, aR.x - a.x), false);
  return s;
}

// 三點桿（三角板）做成 THREE.Shape：三個孔中心圓 + 外切線 hull + 三個角鑽孔。
// 外形與 2D 的 roundedTriangleHullPath 一致（三個等半徑圓的外切線 hull）。
function triPlateShape(corners, r, holeR) {
  const [A, B, C] = corners;
  const area = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x);
  const ordered = area < 0 ? [A, C, B] : [A, B, C]; // 走 CCW，外凸弧才朝外
  const tangent = (p, q) => {
    const dx = q.x - p.x, dy = q.y - p.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dy / dist, ny = -dx / dist; // 右側法線
    return {
      start: { x: p.x + nx * r, y: p.y + ny * r },
      end: { x: q.x + nx * r, y: q.y + ny * r },
    };
  };
  const ts = ordered.map((p, i) => tangent(p, ordered[(i + 1) % 3]));
  const shape = new THREE.Shape();
  shape.moveTo(ts[0].start.x, ts[0].start.y);
  for (let i = 0; i < 3; i++) {
    const curr = ts[i];
    const next = ts[(i + 1) % 3];
    const corner = ordered[(i + 1) % 3];
    shape.lineTo(curr.end.x, curr.end.y);
    // 角落外凸圓弧（CCW，與冰棒棍封口同向）
    shape.absarc(corner.x, corner.y, r,
      Math.atan2(curr.end.y - corner.y, curr.end.x - corner.x),
      Math.atan2(next.start.y - corner.y, next.start.x - corner.x), false);
  }
  // 三個角鑽孔
  ordered.forEach(p => {
    const h = new THREE.Path();
    h.absarc(p.x, p.y, holeR, 0, Math.PI * 2, true);
    shape.holes.push(h);
  });
  return shape;
}

function jawPlateShape(corners, r, holeR, turnSign = 0) {
  const addHole = (shape, p) => {
    const h = new THREE.Path();
    h.absarc(p.x, p.y, holeR, 0, Math.PI * 2, true);
    shape.holes.push(h);
  };
  const [pivot, drive, tip] = corners;
  const dx = tip.x - pivot.x;
  const dy = tip.y - pivot.y;
  const len = Math.hypot(dx, dy);
  if (len <= 1e-6) return triPlateShape(corners, r, holeR);
  const ux = dx / len;
  const uy = dy / len;
  const cross = ux * (drive.y - pivot.y) - uy * (drive.x - pivot.x);
  const side = Number(turnSign) < 0 ? -1 : (Number(turnSign) > 0 ? 1 : (Math.sign(cross) || 1));
  const turn = side * 55 * Math.PI / 180;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const ex = ux * cos - uy * sin;
  const ey = ux * sin + uy * cos;
  const extend = Math.max(38, Math.min(84, len * 0.58));
  const end = { x: tip.x + ex * extend, y: tip.y + ey * extend };
  const a = stickShape(drive, pivot, r);
  addHole(a, drive);
  addHole(a, pivot);
  const b = stickShape(pivot, tip, r);
  addHole(b, pivot);
  addHole(b, tip);
  const c = stickShape(tip, end, r);
  addHole(c, tip);
  return [a, b, c];
}

function gearShape(gear, centerHoleR) {
  const pts = createGearPath({
    teeth: gear.teeth,
    module: gear.module,
    segmentsPerTooth: 5,
  });
  const shape = new THREE.Shape();
  if (!pts.length) return shape;
  shape.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x, pts[i].y);
  shape.closePath();

  const center = new THREE.Path();
  center.absarc(0, 0, centerHoleR, 0, Math.PI * 2, true);
  shape.holes.push(center);
  return shape;
}

function polygonShape(points) {
  const shape = new THREE.Shape();
  if (!points || !points.length) return shape;
  shape.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i].x, points[i].y);
  shape.closePath();
  return shape;
}

function pulleyShape(radius, centerHoleR) {
  const shape = new THREE.Shape();
  shape.moveTo(radius, 0);
  shape.absarc(0, 0, radius, 0, Math.PI * 2, false);
  const center = new THREE.Path();
  center.absarc(0, 0, centerHoleR, 0, Math.PI * 2, true);
  shape.holes.push(center);
  return shape;
}

function doubleDShape(radius, flatWidth, boreR) {
  const r = Math.max(0.1, Number(radius) || 2.7);
  const halfFlat = Math.min(r * 0.98, Math.max(0.1, (Number(flatWidth) || 3.7) / 2));
  const xFlat = Math.sqrt(Math.max(0, r * r - halfFlat * halfFlat));
  const a = Math.atan2(halfFlat, xFlat);
  const shape = new THREE.Shape();
  shape.moveTo(xFlat, halfFlat);
  shape.lineTo(-xFlat, halfFlat);
  shape.absarc(0, 0, r, Math.PI - a, Math.PI + a, false);
  shape.lineTo(xFlat, -halfFlat);
  shape.absarc(0, 0, r, -a, a, false);
  shape.closePath();
  if (boreR > 0) {
    const bore = new THREE.Path();
    bore.absarc(0, 0, boreR, 0, Math.PI * 2, true);
    shape.holes.push(bore);
  }
  return shape;
}

function openBeltTangents(c1, r1, c2, r2) {
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const d = Math.hypot(dx, dy);
  if (!Number.isFinite(d) || d <= Math.abs(r1 - r2) || d < 1e-6) return [];
  const ux = dx / d, uy = dy / d;
  const nx = -uy, ny = ux;
  const h = (r1 - r2) / d;
  const k = Math.sqrt(Math.max(0, 1 - h * h));
  return [-1, 1].map(sign => {
    const vx = h * ux + sign * k * nx;
    const vy = h * uy + sign * k * ny;
    return {
      a: { x: c1.x + vx * r1, y: c1.y + vy * r1 },
      b: { x: c2.x + vx * r2, y: c2.y + vy * r2 }
    };
  });
}

function beltArcPoints(center, radius, from, to, awayFrom, steps = 24) {
  const a0 = Math.atan2(from.y - center.y, from.x - center.x);
  const a1 = Math.atan2(to.y - center.y, to.x - center.x);
  let ccw = a1 - a0;
  while (ccw < 0) ccw += Math.PI * 2;
  const cw = ccw - Math.PI * 2;
  const score = (delta) => {
    const mid = a0 + delta / 2;
    const p = { x: center.x + Math.cos(mid) * radius, y: center.y + Math.sin(mid) * radius };
    return Math.hypot(p.x - awayFrom.x, p.y - awayFrom.y);
  };
  const delta = score(ccw) >= score(cw) ? ccw : cw;
  const n = Math.max(4, Math.round(Math.abs(delta) / (Math.PI * 2) * steps));
  const pts = [];
  for (let i = 1; i <= n; i++) {
    const a = a0 + delta * (i / n);
    pts.push({ x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius });
  }
  return pts;
}

function openBeltPoints(c1, r1, c2, r2) {
  const t = openBeltTangents(c1, r1, c2, r2);
  if (t.length < 2) return [];
  return [
    t[0].a,
    t[0].b,
    ...beltArcPoints(c2, r2, t[0].b, t[1].b, c1),
    t[1].a,
    ...beltArcPoints(c1, r1, t[1].a, t[0].a, c2)
  ];
}

export function createViewer(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0f1420');

  const camera = new THREE.PerspectiveCamera(45, 1, 1, 20000);
  camera.position.set(0, 0, 600);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  // 燈光：半球補光 + 主方向光，板面才有立體層次
  scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2f3a, 1.0));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(0.5, 0.8, 1);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xafc4ff, 0.4);
  fill.position.set(-0.6, -0.3, -0.8);
  scene.add(fill);

  // 地面格線：XZ 平面、y=0，對應 2D 的地面基線
  const grid = new THREE.GridHelper(2000, 40, 0x3a4660, 0x222a3a);
  grid.position.y = 0;
  scene.add(grid);

  // 動態內容都掛在這個 group，update() 時整批換掉
  const dynamic = new THREE.Group();
  scene.add(dynamic);

  const holeR = 3.4;   // 板上孔徑（視覺用）
  const pinMat = new THREE.MeshStandardMaterial({ color: 0x9aa4b2, metalness: 0.6, roughness: 0.35 });
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x34495e, metalness: 0.2, roughness: 0.8 });
  // TT 齒輪馬達：黃色齒輪箱 + 鐵灰色 DC 罐（與 2D drawTTMotor 同色系）
  const motorBoxMat = new THREE.MeshStandardMaterial({ color: 0xf7c948, metalness: 0.1, roughness: 0.55 });
  const motorCanMat = new THREE.MeshStandardMaterial({ color: 0x5f6b75, metalness: 0.5, roughness: 0.45 });
  // MG995 伺服：藍色殼體 + 白色舵盤（與 2D drawMG995Servo 同色系）
  const servoBodyMat = new THREE.MeshStandardMaterial({ color: 0x3d8bf0, metalness: 0.1, roughness: 0.5 });
  const servoHornMat = new THREE.MeshStandardMaterial({ color: 0xeef3fb, metalness: 0.1, roughness: 0.6 });
  const gearBoltMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.15, roughness: 0.45 });
  const beltMat = new THREE.MeshStandardMaterial({ color: 0x1f2933, metalness: 0.05, roughness: 0.75 });
  const rollerMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.2, roughness: 0.45 });
  // TT 馬達真實比例（mm）：齒輪箱 37(長)×22.5(寬)×16(厚)、DC 罐 ⌀20.5×22、輸出軸 ⌀~5。
  // 馬達躺在與機構平行的平面、沉在桿件背面；長軸(boxLen)朝機架方向，輸出軸沿 z。
  // shaftInset = 輸出軸距齒輪箱近端的距離（與 2D 的 ax 一致）。
  const MOTOR = {
    boxLen: 37, boxW: 22.5, boxThick: 16, canD: 20.5, canLen: 22,
    shaftR: 2.7, shaftFlatW: 3.7, shaftBoreR: 0.95,
    shaftInset: 11, gap: 1, collarR: 5.2, collarH: 3.2, shaftLen: 8
  };
  // MG995 標準伺服真實比例（mm）：本體 40×20×38、輸出軸距近端 10、舵盤 ⌀~20。
  const SERVO = { boxLen: 40, boxW: 20, boxThick: 38, hornR: 10, hornThick: 3, shaftInset: 10, gap: 1 };
  const matCache = new Map(); // color -> material（避免每幀重建材質）

  function plateMaterial(color) {
    if (!matCache.has(color)) {
      matCache.set(color, new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        metalness: 0.1,
        roughness: 0.6,
        side: THREE.DoubleSide,
      }));
    }
    return matCache.get(color);
  }

  function clearDynamic() {
    for (let i = dynamic.children.length - 1; i >= 0; i--) {
      const obj = dynamic.children[i];
      dynamic.remove(obj);
      // 含 group（馬達）：把底下每個 mesh 的 geometry 都釋放掉，避免逐幀洩漏
      obj.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      // 材質有快取共用，不在這裡 dispose
    }
  }

  let initialized = false;

  function update(model) {
    clearDynamic();
    if (!model) return;

    // 桿件：擠出成扁板
    model.sticks.forEach(s => {
      const shape = stadiumShape(s.a, s.b, s.r, holeR);
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: s.thickness,
        bevelEnabled: false,
        curveSegments: 24,
      });
      const mesh = new THREE.Mesh(geo, plateMaterial(s.color));
      mesh.position.z = s.z;     // 幾何已是世界 XY 絕對座標，只需抬 z
      dynamic.add(mesh);
    });

    // 三點桿：擠出成實心三角板（取代它三條邊各自的桿）
    (model.plates || []).forEach(pl => {
      const shape = pl.shape === 'jaw' ? jawPlateShape(pl.corners, pl.r, holeR, pl.jawTurnSign) : triPlateShape(pl.corners, pl.r, holeR);
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: pl.thickness,
        bevelEnabled: false,
        curveSegments: 24,
      });
      const mesh = new THREE.Mesh(geo, plateMaterial(pl.color));
      mesh.position.z = pl.z;
      dynamic.add(mesh);
    });

    // 滑塊軌道：m1-m2 承載桿擠成扁條（兩端鎖孔＝固定螺絲），沿行程方向挖一條長槽
    (model.rails || []).forEach(r => {
      const shape = stadiumShape(r.a, r.b, r.r, holeR);
      if (r.slot) shape.holes.push(capsuleHolePath(r.slot.a, r.slot.b, r.slot.half));
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: r.thickness,
        bevelEnabled: false,
        curveSegments: 24,
      });
      const mesh = new THREE.Mesh(geo, plateMaterial(r.color));
      mesh.position.z = r.z;
      dynamic.add(mesh);

      // 槽底有色墊片：墊在洞後方、只填底部一小段厚度 → 看起來像「有色底的凹槽」而非透空黑洞
      if (r.slot && r.slot.color) {
        const floorGeo = new THREE.ExtrudeGeometry(
          capsuleShape(r.slot.a, r.slot.b, r.slot.half),
          { depth: 1.5, bevelEnabled: false, curveSegments: 20 });
        const floor = new THREE.Mesh(floorGeo, plateMaterial(r.slot.color));
        floor.position.z = r.z;   // 與軌道背面齊，凹槽剩 (thickness-1.5) 的深度
        dynamic.add(floor);
      }
    });

    // 滑件：短滑件本體連起前後兩螺絲；兩根導引螺絲沿 z 穿過軌道槽（中心銷接連桿由 pins 處理）
    (model.carriages || []).forEach(c => {
      const shape = stadiumShape(c.bodyA, c.bodyB, c.bodyR, c.screwR);
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: c.thickness,
        bevelEnabled: false,
        curveSegments: 20,
      });
      const body = new THREE.Mesh(geo, plateMaterial(c.color));
      body.position.z = c.z;
      dynamic.add(body);
      (c.screws || []).forEach(s => {
        const h = Math.max(1, c.screwZ1 - c.screwZ0);
        const pin = new THREE.Mesh(new THREE.CylinderGeometry(c.screwR, c.screwR, h, 16), pinMat);
        pin.rotation.x = Math.PI / 2;
        pin.position.set(s.x, s.y, (c.screwZ0 + c.screwZ1) / 2);
        dynamic.add(pin);
      });
    });

    // 齒輪：和 2D 共用齒形產生器，整條嚙合鏈在同一個內側 z 平面。
    // 齒形本體套 meshPhase 讓齒對齒隙；輪緣輸出銷另依 solver p2 畫在真實位置。
    (model.gears || []).forEach(g => {
      const group = new THREE.Group();
      group.position.set(g.center.x, g.center.y, 0);
      group.rotation.z = g.angle + g.meshPhase;

      const shape = gearShape(g, holeR * 1.05);
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: g.thickness,
        bevelEnabled: false,
        curveSegments: 18,
      });
      const body = new THREE.Mesh(geo, plateMaterial(g.color));
      body.position.z = g.z;
      group.add(body);
      dynamic.add(group);

      const boltH = Math.max(1, g.thickness * 0.35);
      const pinR = Math.max(0.5, Number(g.pinHoleDiameter || 5) / 2);
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(pinR, pinR, boltH, 20), gearBoltMat);
      bolt.rotation.x = Math.PI / 2;
      bolt.position.set(g.pin.x, g.pin.y, g.z + g.thickness + boltH / 2 + 0.2);
      dynamic.add(bolt);
    });

    // 齒條：和齒輪同在內側傳動平面，齒形本身擠出成一片有厚度的齒桿。
    (model.racks || []).forEach(r => {
      const group = new THREE.Group();
      group.position.set(r.ref.x, r.ref.y, 0);
      group.rotation.z = (r.axisDeg || 0) * Math.PI / 180;
      const geo = new THREE.ExtrudeGeometry(polygonShape(r.local), {
        depth: r.thickness,
        bevelEnabled: false,
        curveSegments: 8,
      });
      const mesh = new THREE.Mesh(geo, plateMaterial(r.color));
      mesh.position.z = r.z;
      group.add(mesh);
      dynamic.add(group);
    });

    // 皮帶輪與皮帶：圓盤留中心孔，輪緣銷由 solver 位置決定；皮帶用閉合管線繞外公切線。
    (model.pulleys || []).forEach(p => {
      const group = new THREE.Group();
      group.position.set(p.center.x, p.center.y, 0);
      group.rotation.z = p.angle || 0;
      const geo = new THREE.ExtrudeGeometry(pulleyShape(p.radius, holeR * 1.05), {
        depth: p.thickness,
        bevelEnabled: false,
        curveSegments: 36,
      });
      const disk = new THREE.Mesh(geo, plateMaterial(p.color));
      disk.position.z = p.z;
      group.add(disk);

      const groove = new THREE.Mesh(
        new THREE.TorusGeometry(Math.max(1, p.radius - 2.2), 0.8, 8, 48),
        plateMaterial('#7f4a17'));
      groove.position.z = p.z + p.thickness + 0.35;
      group.add(groove);

      const spokeLen = Math.max(1, p.pinRadius);
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(spokeLen, 2.4, 1.8), plateMaterial(p.color));
      spoke.position.set(spokeLen / 2, 0, p.z + p.thickness + 1.2);
      group.add(spoke);
      dynamic.add(group);

      const boltH = Math.max(1, p.thickness * 0.35);
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(holeR * 1.05, holeR * 1.05, boltH, 20), gearBoltMat);
      bolt.rotation.x = Math.PI / 2;
      bolt.position.set(p.pin.x, p.pin.y, p.z + p.thickness + boltH / 2 + 0.2);
      dynamic.add(bolt);
    });

    (model.belts || []).forEach(b => {
      const pts = openBeltPoints(b.driver.center, b.driver.radius, b.driven.center, b.driven.radius);
      if (pts.length < 4) return;
      const curve = new THREE.CatmullRomCurve3(
        pts.map(p => new THREE.Vector3(p.x, p.y, b.z)),
        true,
        'centripetal'
      );
      const geo = new THREE.TubeGeometry(curve, Math.max(12, pts.length * 2), b.thickness, 8, true);
      const mat = b.color ? plateMaterial(b.color) : beltMat;
      dynamic.add(new THREE.Mesh(geo, mat));
    });

    // 凸輪從動件：凸輪輪廓在底層旋轉，滾子/從動塊沿導桿方向顯示輸出位置。
    (model.cams || []).forEach(c => {
      const group = new THREE.Group();
      group.position.set(c.center.x, c.center.y, 0);
      group.rotation.z = c.angle || 0;
      const geo = new THREE.ExtrudeGeometry(polygonShape(c.local), {
        depth: c.thickness,
        bevelEnabled: false,
        curveSegments: 18,
      });
      const body = new THREE.Mesh(geo, plateMaterial(c.color));
      body.position.z = c.z;
      group.add(body);
      dynamic.add(group);

      const hub = new THREE.Mesh(new THREE.CylinderGeometry(holeR * 1.05, holeR * 1.05, c.thickness + 1, 24), gearBoltMat);
      hub.rotation.x = Math.PI / 2;
      hub.position.set(c.center.x, c.center.y, c.z + c.thickness / 2);
      dynamic.add(hub);

      const roller = new THREE.Mesh(
        new THREE.CylinderGeometry(c.rollerRadius, c.rollerRadius, c.thickness, 24),
        rollerMat);
      roller.rotation.x = Math.PI / 2;
      roller.position.set(c.follower.x, c.follower.y, c.z + c.thickness / 2);
      dynamic.add(roller);

      const blockLen = 22;
      const blockW = 16;
      const block = new THREE.Mesh(new THREE.BoxGeometry(blockLen, blockW, c.thickness), rollerMat);
      block.position.set(
        c.follower.x + c.axis.x * (c.rollerRadius + blockLen / 2 + 3),
        c.follower.y + c.axis.y * (c.rollerRadius + blockLen / 2 + 3),
        c.z + c.thickness / 2
      );
      block.rotation.z = c.axis.deg * Math.PI / 180;
      dynamic.add(block);

      const guideLen = 120;
      const guide = new THREE.Mesh(new THREE.BoxGeometry(guideLen, 2.2, 1.8), plateMaterial('#8a96a3'));
      guide.position.set(
        c.center.x + c.axis.x * (guideLen / 2),
        c.center.y + c.axis.y * (guideLen / 2),
        c.z - 1
      );
      guide.rotation.z = c.axis.deg * Math.PI / 180;
      dynamic.add(guide);
    });

    // 馬達：躺在機構背面（z<0）、長軸朝機架方向，輸出軸沿 +z 往上頂到曲柄那層帶動它。
    // 用一個 group 擺位 + 繞 z 轉到朝向；輸出軸在 local 原點（不受轉向影響、永遠在關節軸上）。
    // 輸出軸兼當該關節的軸，因此 scene-model 不再為馬達中心畫銷柱／地錨支柱。
    (model.motors || []).forEach(m => {
      const g = new THREE.Group();
      g.position.set(m.x, m.y, 0);
      g.rotation.z = Math.atan2(m.dir ? m.dir.y : -1, m.dir ? m.dir.x : 0);

      if (m.type === 'mg995') {
        // MG995 伺服：藍色扁方殼沉在背面、輸出軸近端有白色舵盤
        const bodyCz = -(SERVO.gap + SERVO.boxThick / 2);
        const body = new THREE.Mesh(
          new THREE.BoxGeometry(SERVO.boxLen, SERVO.boxW, SERVO.boxThick), servoBodyMat);
        body.position.set(SERVO.boxLen / 2 - SERVO.shaftInset, 0, bodyCz);
        g.add(body);

        // 舵盤（horn）：圓盤，貼在齒輪箱頂面、繞輸出軸
        const hornZ = -SERVO.gap + SERVO.hornThick / 2;
        const horn = new THREE.Mesh(
          new THREE.CylinderGeometry(SERVO.hornR, SERVO.hornR, SERVO.hornThick, 24), servoHornMat);
        horn.rotation.x = Math.PI / 2;
        horn.position.set(0, 0, hornZ);
        g.add(horn);

        // 輸出軸：沿 z，從舵盤頂到原動件外側；末端略突出，讓「軸接到原動件」看得見。
        const topZ = -SERVO.gap;
        const shaftTop = m.shaftTopZ + 3.5;
        const sLen = Math.max(1, shaftTop - topZ);
        const shaft = new THREE.Mesh(
          new THREE.CylinderGeometry(MOTOR.shaftR, MOTOR.shaftR, sLen, 16), pinMat);
        shaft.rotation.x = Math.PI / 2;
        shaft.position.set(0, 0, topZ + sLen / 2);
        g.add(shaft);

        dynamic.add(g);
        return;
      }

      const bodyCz = -(MOTOR.gap + MOTOR.boxThick / 2);   // 本體中心 z（沉在桿件背面）
      // 齒輪箱：寬面平行機構平面、薄邊沿 z；輸出軸在近端，本體往機架方向延伸不壓到連桿
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(MOTOR.boxLen, MOTOR.boxW, MOTOR.boxThick), motorBoxMat);
      box.position.set(MOTOR.boxLen / 2 - MOTOR.shaftInset, 0, bodyCz);
      g.add(box);

      // DC 罐：軸沿馬達長軸（local x），接在齒輪箱遠端再往外凸
      const can = new THREE.Mesh(
        new THREE.CylinderGeometry(MOTOR.canD / 2, MOTOR.canD / 2, MOTOR.canLen, 20), motorCanMat);
      can.rotation.z = Math.PI / 2;   // 預設沿 y → 轉成沿 x（長軸）
      can.position.set(MOTOR.boxLen - MOTOR.shaftInset + MOTOR.canLen / 2 - 2, 0, bodyCz);
      g.add(can);

      // 輸出軸：沿 z，從齒輪箱頂面頂到原動件外側；殼體不直接貼桿，真正接觸的是這支軸。
      const boxTopZ = -MOTOR.gap;
      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(MOTOR.collarR, MOTOR.collarR, MOTOR.collarH, 24), pinMat);
      collar.rotation.x = Math.PI / 2;
      collar.position.set(0, 0, boxTopZ + MOTOR.collarH / 2);
      g.add(collar);

      const shaftBaseZ = boxTopZ + MOTOR.collarH;
      const shaftLen = MOTOR.shaftLen;
      const shaftTopZ = shaftBaseZ + shaftLen;
      g.position.z = (Number.isFinite(m.baseZ) ? m.baseZ : shaftTopZ) - shaftTopZ;
      const shaft = new THREE.Mesh(
        new THREE.ExtrudeGeometry(
          doubleDShape(MOTOR.shaftR, MOTOR.shaftFlatW, MOTOR.shaftBoreR),
          { depth: shaftLen, bevelEnabled: false, curveSegments: 20 }
        ),
        pinMat
      );
      shaft.position.set(0, 0, shaftBaseZ);
      g.add(shaft);

      dynamic.add(g);
    });

    // 關節：銷柱（圓柱預設沿 Y 軸，轉成沿 Z）
    model.pins.forEach(p => {
      const h = Math.max(1, p.z1 - p.z0);
      const geo = new THREE.CylinderGeometry(p.r, p.r, h, 16);
      const mesh = new THREE.Mesh(geo, p.ground ? groundMat : pinMat);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(p.x, p.y, (p.z0 + p.z1) / 2);
      dynamic.add(mesh);
    });

    // 地錨是「固定」的慣例（接點本身的銷柱已標示），不另外畫立柱實體。
    // model.grounds 仍保留，供下方相機對焦用。

    // 相機對焦：對到固定的地錨形心（model.focus）。動畫時 focus 不動，畫面就不會晃。
    // 有地錨（anchored）時每幀同步沒差（反正是同一點）；沒地錨時只在初次定位、之後凍結。
    const f = model.focus;
    if (f) {
      if (!initialized) {
        controls.target.set(f.x, f.y, f.z);
        const dist = Math.max(300, model.span * 2.2);
        camera.position.set(f.x, f.y, dist);
        initialized = true;
      } else if (model.anchored) {
        controls.target.set(f.x, f.y, f.z);
      }
    }
  }

  function resize() {
    const box = container.getBoundingClientRect();
    const w = Math.max(1, Math.round(box.width || container.clientWidth || window.innerWidth || 1));
    const h = Math.max(1, Math.round(box.height || container.clientHeight || window.innerHeight || 1));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }

  let raf = null;
  function loop() {
    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  }
  function start() { if (!raf) loop(); }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = null; }

  const resizeObserver = 'ResizeObserver' in window ? new ResizeObserver(() => resize()) : null;
  if (resizeObserver) resizeObserver.observe(container);

  function dispose() {
    stop();
    clearDynamic();
    matCache.forEach(m => m.dispose());
    pinMat.dispose();
    groundMat.dispose();
    motorBoxMat.dispose();
    motorCanMat.dispose();
    servoBodyMat.dispose();
    servoHornMat.dispose();
    gearBoltMat.dispose();
    beltMat.dispose();
    rollerMat.dispose();
    controls.dispose();
    if (resizeObserver) resizeObserver.disconnect();
    renderer.dispose();
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
  }

  resize();
  start();

  return { update, resize, dispose, start, stop, get camera() { return camera; }, get controls() { return controls; } };
}
