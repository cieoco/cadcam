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
      if (obj.geometry) obj.geometry.dispose();
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
    controls.dispose();
    renderer.dispose();
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
  }

  resize();
  start();

  return { update, resize, dispose, start, stop, get camera() { return camera; }, get controls() { return controls; } };
}
