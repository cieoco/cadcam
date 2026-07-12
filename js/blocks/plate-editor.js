/**
 * blocks / plate-editor
 *
 * 三點桿 / 板件域：選取與屬性列、外形模式（包絡板 / 多邊形板 / 折線桿）、
 * 造形點新增 / 拖曳 / 鑽孔切換 / 刪除，以及 g / r1 / r2 邊長調整與重擺。
 * 函式本體自 app.js 照搬、零行為改變；app 層以注入回呼提供重建 / 繪製 / undo / 面板能力。
 */

import { S } from './state.js';
import * as Panels from './panels.js';
import { MAX_PLATE_POINTS, worldToLocal, defaultPlateVertices, plateVertices, polylineTriangleParams, preservedDiagonalLength } from './plate-geometry.js';

export function createPlateEditor({
  svg, pushUndo, pause, rebuild, draw, cancelMotorMode, deselectGear, openMobileEditPanel,
  setSliderDetailRows, setBanner, snapLego, worldFromEvent, pointCoords, updatePointCoordsById
}) {

  function plateBasisFor(comp) {
    const P = pointCoords();
    const a = comp.p1 && P[comp.p1.id];
    const b = comp.p2 && P[comp.p2.id];
    if (a && b && Number.isFinite(a.x) && Number.isFinite(b.x)) return [a, b];
    if (comp.p1 && comp.p2) return [{ x: comp.p1.x, y: comp.p1.y }, { x: comp.p2.x, y: comp.p2.y }];
    return null;
  }
  function startShapeDrag(e, compId, vi) {
    const comp = S.comps.find(x => x.id === compId && x.type === 'triangle');
    if (!comp) return;
    pause();
    S.dragShape = { compId, vi, moved: false, startX: e.clientX, startY: e.clientY };
    try { svg.setPointerCapture(e.pointerId); } catch (_) {}
    const onMove = (ev) => shapeDragMove(ev);
    const onUp = (ev) => {
      svg.removeEventListener('pointermove', onMove);
      svg.removeEventListener('pointerup', onUp);
      svg.removeEventListener('pointercancel', onUp);
      shapeDragEnd(ev);
    };
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onUp);
  }
  function shapeDragMove(e) {
    const ds = S.dragShape;
    if (!ds) return;
    if (!ds.moved) {
      if (Math.hypot(e.clientX - ds.startX, e.clientY - ds.startY) < 4) return; // 抖動門檻：分辨點擊 vs 拖曳
      ds.moved = true;
      const c0 = S.comps.find(x => x.id === ds.compId && x.type === 'triangle');
      if (c0) { ensurePlateVertices(c0); pushUndo(); }
    }
    const comp = S.comps.find(x => x.id === ds.compId && x.type === 'triangle');
    if (!comp) return;
    const basis = plateBasisFor(comp);
    const w = worldFromEvent(e);
    if (!basis || !w) return;
    const local = worldToLocal(basis, w);
    if (!local) return;
    const vt = comp.vertices && comp.vertices[ds.vi];
    if (!vt || vt.solve) return;
    vt.u = Number(local.u.toFixed(1));
    vt.v = Number(local.v.toFixed(1));
    draw();
  }
  function shapeDragEnd() {
    const ds = S.dragShape;
    S.dragShape = null;
    if (!ds) return;
    const comp = S.comps.find(x => x.id === ds.compId && x.type === 'triangle');
    if (!comp) return;
    if (!ds.moved) {                                   // 純點擊＝切換是否鑽孔
      ensurePlateVertices(comp);
      const vt = comp.vertices[ds.vi];
      if (vt && !vt.solve) {
        pushUndo();
        if (vt.hole === true) delete vt.hole; else vt.hole = true;
      }
    }
    rebuild(); draw();
  }
  function deleteShapeVertex(compId, vi) {
    const comp = S.comps.find(x => x.id === compId && x.type === 'triangle');
    if (!comp) return;
    ensurePlateVertices(comp);
    const vt = comp.vertices[vi];
    if (!vt || vt.solve) return;
    pushUndo();
    comp.vertices.splice(vi, 1);
    rebuild(); draw();
  }

  function selectTriangle(id) {
    cancelMotorMode();
    deselectGear();
    if (!S.comps.some(x => x.id === id && x.type === 'triangle')) return;
    openMobileEditPanel();
    S.selectedTriangleId = id;
    S.selectedLinkId = null;
    S.selectedNodeId = null;
    S.selectedSliderId = null;
    document.getElementById('roleEditor').style.display = 'none';
    document.getElementById('servoEditor').style.display = 'none';
    document.getElementById('strokeEditor').style.display = 'none';
    const comp = S.comps.find(x => x.id === id && x.type === 'triangle');
    document.getElementById('lenTitle').textContent = comp && comp.shape === 'jaw' ? '⌒ 夾爪板' : '🔺 三點桿';
    Panels.setLenButtonTitles('短 8mm（少一孔）', '長 8mm（多一孔）');
    S.triSide = 'g';
    const sel = document.getElementById('triSideSelect');
    sel.value = 'g';
    sel.style.display = '';
    updatePlateShapeControls(comp);
    document.getElementById('sliderFlipBtn').style.display = 'none';
    document.getElementById('sliderBaseBtn').style.display = 'none';
    document.getElementById('linkToRailBtn').style.display = 'none';
    setSliderDetailRows(false);
    document.getElementById('zliftRow').style.display = 'flex';
    document.getElementById('lenControls').style.display = 'flex';
    document.getElementById('lenEditor').style.display = 'flex';
    Panels.renderTriValue();
    Panels.updateZliftButtons();
    draw();
  }
  // 三點板外形：前三點仍給求解器，其它點只作加工外形控制。
  function updatePlateShapeControls(comp = null) {
    const modeSel = document.getElementById('plateShapeModeSelect');
    const addBtn = document.getElementById('addOutlinePointBtn');
    if (!modeSel || !addBtn) return;
    if (!comp || comp.type !== 'triangle') {
      modeSel.style.display = 'none';
      addBtn.style.display = 'none';
      return;
    }
    const mode = comp.shapeMode || (comp.shape === 'jaw' ? 'polyline' : 'hull');
    modeSel.value = ['hull', 'polygon', 'polyline'].includes(mode) ? mode : 'hull';
    modeSel.style.display = '';
    addBtn.style.display = '';
    addBtn.disabled = plateVertices(comp).length >= MAX_PLATE_POINTS;
  }
  // 首次編輯造形時，把板件就地轉成有順序的 vertices（相容舊資料；outlinePoints 併入後移除）。
  function ensurePlateVertices(comp) {
    if (!Array.isArray(comp.vertices) || !comp.vertices.length) {
      comp.vertices = defaultPlateVertices(comp);
    }
    if (comp.outlinePoints) delete comp.outlinePoints;
    return comp.vertices;
  }
  function triangleWorldPoints(comp) {
    if (!comp || !comp.p1 || !comp.p2 || !comp.p3) return null;
    const P = pointCoords();
    const read = (p) => {
      const solved = p.id && P[p.id];
      if (solved && Number.isFinite(solved.x) && Number.isFinite(solved.y)) return solved;
      if (Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y))) return { x: Number(p.x), y: Number(p.y) };
      return null;
    };
    const pts = [read(comp.p1), read(comp.p2), read(comp.p3)];
    return pts.every(Boolean) ? pts : null;
  }
  function setTriangleShapeMode(mode) {
    const comp = S.comps.find(x => x.id === S.selectedTriangleId && x.type === 'triangle');
    if (!comp) return;
    pushUndo();
    comp.shapeMode = ['hull', 'polygon', 'polyline'].includes(mode) ? mode : 'hull';
    updatePlateShapeControls(comp);
    rebuild(); draw();
  }
  function addTriangleOutlinePoint() {
    const comp = S.comps.find(x => x.id === S.selectedTriangleId && x.type === 'triangle');
    if (!comp) return;
    if (plateVertices(comp).length >= MAX_PLATE_POINTS) {
      setBanner(`多點桿最多 ${MAX_PLATE_POINTS} 點；其它點只作外形控制。`);
      return;
    }
    const pts = triangleWorldPoints(comp);
    if (!pts) return;
    const [a, , c] = pts;
    const dx = c.x - a.x;
    const dy = c.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;
    const shapeCount = plateVertices(comp).filter(v => !v.solve).length;
    const world = {
      x: c.x + ux * 32 + nx * shapeCount * 12,
      y: c.y + uy * 32 + ny * shapeCount * 12
    };
    const local = worldToLocal(pts, world);
    if (!local) return;
    pushUndo();
    ensurePlateVertices(comp);
    comp.vertices = [...comp.vertices, {
      solve: false,
      u: Number(local.u.toFixed(1)),
      v: Number(local.v.toFixed(1))
    }];
    updatePlateShapeControls(comp);
    rebuild(); draw();
  }

  // 三點桿：下拉切換要調的邊（底邊 g / P1–P3 r1 / P2–P3 r2），−/＋ 就調該邊
  function triParamFor(c) {
    return S.triSide === 'r1' ? c.r1Param : S.triSide === 'r2' ? c.r2Param : c.gParam;
  }
  function setTriSide(side) {
    S.triSide = (side === 'r1' || side === 'r2') ? side : 'g';
    Panels.renderTriValue();
  }
  function changeTriSide(delta) {
    const c = S.comps.find(x => x.id === S.selectedTriangleId);
    if (!c) return;
    pushUndo();
    const key = triParamFor(c);
    const L = snapLego((S.topo.params[key] || 0) + delta);
    // 折線桿：改實體桿段長度時，自動重算對角線以保持當下彎角（直角改長仍是直角）；
    // 直接調對角線那一邊才會改變彎角。對角線需 0.1mm 精度，關掉整數化避免重載後彎角漂移。
    const poly = polylineTriangleParams(c);
    if (poly && key !== poly.diagParam) {
      const a0 = Number(S.topo.params[poly.segParams[0]]) || 0;
      const b0 = Number(S.topo.params[poly.segParams[1]]) || 0;
      const d0 = Number(S.topo.params[poly.diagParam]) || 0;
      const a1 = key === poly.segParams[0] ? L : a0;
      const b1 = key === poly.segParams[1] ? L : b0;
      const d1 = preservedDiagonalLength(a0, b0, d0, a1, b1);
      if (d1 !== null) {
        S.topo.params[poly.diagParam] = Math.round(d1 * 10) / 10;
        c.snapLength = false;
      }
    }
    S.topo.params[key] = L;
    reshapeTriangle(c);   // 自由三點桿才看得到；已連接的由 solver 接手
    Panels.renderLenEditor(L);
    rebuild(); draw();
  }
  // 依 g/r1/r2 重擺三點桿：固定 P1 與底邊方向，P2 落在距 P1 為 g 處，P3 取兩圓交點
  // 中離目前位置較近的那個（避免翻面）。三角不等式不成立時 P3 不動，交給驗證提示。
  function reshapeTriangle(c) {
    const g = S.topo.params[c.gParam], r1 = S.topo.params[c.r1Param], r2 = S.topo.params[c.r2Param];
    if (!(g > 0 && r1 > 0 && r2 > 0)) return;
    const P1 = { x: c.p1.x || 0, y: c.p1.y || 0 };
    const dx = (c.p2.x || 0) - P1.x, dy = (c.p2.y || 0) - P1.y;
    const d = Math.hypot(dx, dy) || 1;
    const P2 = { x: P1.x + dx / d * g, y: P1.y + dy / d * g };
    updatePointCoordsById(c.p2.id, P2.x, P2.y);   // 更新所有共用此接點 id 的副本（見 setLen 說明）
    const bx = P2.x - P1.x, by = P2.y - P1.y;
    const base = Math.hypot(bx, by) || 1;
    if (base > r1 + r2 || base < Math.abs(r1 - r2)) return; // 三角不等式不成立
    const a = (r1 * r1 - r2 * r2 + base * base) / (2 * base);
    const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
    const mx = P1.x + a * (bx / base), my = P1.y + a * (by / base);
    const ox = -by / base * h, oy = bx / base * h;
    const cur = { x: c.p3.x || 0, y: c.p3.y || 0 };
    const cand = [{ x: mx + ox, y: my + oy }, { x: mx - ox, y: my - oy }];
    const pick = cand.reduce((best, p) =>
      Math.hypot(p.x - cur.x, p.y - cur.y) < Math.hypot(best.x - cur.x, best.y - cur.y) ? p : best);
    updatePointCoordsById(c.p3.id, pick.x, pick.y);   // 更新所有共用此接點 id 的副本（見 setLen 說明）
  }

  return {
    plateBasisFor, startShapeDrag, shapeDragMove, shapeDragEnd, deleteShapeVertex,
    selectTriangle, updatePlateShapeControls, ensurePlateVertices, triangleWorldPoints,
    setTriangleShapeMode, addTriangleOutlinePoint,
    triParamFor, setTriSide, changeTriSide, reshapeTriangle
  };
}
