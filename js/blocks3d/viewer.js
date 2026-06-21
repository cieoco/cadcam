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

export function createViewer(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0f1420');

  const camera = new THREE.PerspectiveCamera(45, 1, 1, 20000);
  camera.position.set(0, 0, 600);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
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
  // TT 齒輪馬達：黃色齒輪箱 + 深色 DC 罐（與 2D drawTTMotor 同色系）
  const motorBoxMat = new THREE.MeshStandardMaterial({ color: 0xf7c948, metalness: 0.1, roughness: 0.55 });
  const motorCanMat = new THREE.MeshStandardMaterial({ color: 0x37474f, metalness: 0.4, roughness: 0.5 });
  // TT 馬達真實比例（mm）：齒輪箱 37(長)×22.5(寬)×16(厚)、DC 罐 ⌀20.5×22、輸出軸 ⌀~5。
  // 馬達躺在與機構平行的平面、沉在桿件背面；長軸(boxLen)朝機架方向，輸出軸沿 z。
  // shaftInset = 輸出軸距齒輪箱近端的距離（與 2D 的 ax 一致）。
  const MOTOR = { boxLen: 37, boxW: 22.5, boxThick: 16, canD: 20.5, canLen: 22, shaftR: 2.6, shaftInset: 11, gap: 1 };
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
      const shape = triPlateShape(pl.corners, pl.r, holeR);
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: pl.thickness,
        bevelEnabled: false,
        curveSegments: 24,
      });
      const mesh = new THREE.Mesh(geo, plateMaterial(pl.color));
      mesh.position.z = pl.z;
      dynamic.add(mesh);
    });

    // 馬達：躺在機構背面（z<0）、長軸朝機架方向，輸出軸沿 +z 往上頂到曲柄那層帶動它。
    // 用一個 group 擺位 + 繞 z 轉到朝向；輸出軸在 local 原點（不受轉向影響、永遠在關節軸上）。
    // 輸出軸兼當該關節的軸，因此 scene-model 不再為馬達中心畫銷柱／地錨支柱。
    (model.motors || []).forEach(m => {
      const g = new THREE.Group();
      g.position.set(m.x, m.y, 0);
      g.rotation.z = Math.atan2(m.dir ? m.dir.y : -1, m.dir ? m.dir.x : 0);

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

      // 輸出軸：沿 z，從齒輪箱頂面頂到曲柄
      const boxTopZ = -MOTOR.gap;
      const shaftLen = Math.max(1, m.shaftTopZ - boxTopZ);
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(MOTOR.shaftR, MOTOR.shaftR, shaftLen, 16), pinMat);
      shaft.rotation.x = Math.PI / 2;
      shaft.position.set(0, 0, boxTopZ + shaftLen / 2);
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

    // 地錨：在 y=0 地面與關節之間立一根支柱，暗示「釘在地上」
    model.grounds.forEach(g => {
      const top = g.y;
      const h = Math.max(2, top);          // 從地面 y=0 拉到關節高度
      const geo = new THREE.CylinderGeometry(5, 7, h, 6);
      const mesh = new THREE.Mesh(geo, groundMat);
      mesh.position.set(g.x, top - h / 2, -8);
      dynamic.add(mesh);
    });

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
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  let raf = null;
  function loop() {
    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  }
  function start() { if (!raf) loop(); }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = null; }

  function dispose() {
    stop();
    clearDynamic();
    matCache.forEach(m => m.dispose());
    pinMat.dispose();
    groundMat.dispose();
    motorBoxMat.dispose();
    motorCanMat.dispose();
    controls.dispose();
    renderer.dispose();
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
  }

  resize();
  start();

  return { update, resize, dispose, start, stop, get camera() { return camera; }, get controls() { return controls; } };
}
