/**
 * blocks3d / scene-model
 *
 * 純函式：把 2D 解算結果（solved points）+ 可見桿件，轉成 3D viewer 能消費的
 * 「場景模型」。不依賴 THREE、也不碰 DOM——所有 z 分層、銷柱貫穿、置中等幾何
 * 決策都在這裡，方便單獨驗證。座標沿用世界 mm；z 由分層策略決定。
 *
 * 設計理念見 CLAUDE.md 的 core/ui 分層：這支屬於 core（純計算）。
 */

/**
 * @param {Array} links  - compiled.visualization.links 風格：{ id, p1, p2, style, color, hidden }
 * @param {Object} points - id -> { x, y }（已合併靜態點與 solver 解）
 * @param {Object} [opts]
 * @param {Set}    [opts.groundIds]      - 視為地錨的節點 id
 * @param {Array}  [opts.polygons]       - compiled.visualization.polygons：三點桿，{ points:[id,id,id], color }
 * @param {number} [opts.hullR=9]        - 冰棒棍外形半徑（與 2D 一致）
 * @param {number} [opts.plateGap=6]     - 相鄰層的 z 間距 (mm)
 * @param {number} [opts.plateThickness=4] - 每片板的厚度 (mm)
 * @param {number} [opts.pinR=3.2]       - 銷柱半徑 (mm)
 * @returns {{ sticks, plates, pins, grounds, plateGap, plateThickness, center, span }}
 */
export function buildSceneModel(links, points, opts = {}) {
  const hullR = opts.hullR ?? 9;
  const plateGap = opts.plateGap ?? 6;
  const plateThickness = opts.plateThickness ?? 4;
  const pinR = opts.pinR ?? 3.2;
  const groundIds = opts.groundIds || new Set();
  const polygons = opts.polygons || [];

  const valid = (id) => {
    const p = points[id];
    return p && Number.isFinite(p.x) && Number.isFinite(p.y);
  };

  // 三點桿：以實心三角板呈現（與 2D 的圓角三角板一致）。它的三條邊不再各自畫成桿——
  // 否則 triangle 編譯出的邊 link 會和使用者明確畫出的桿（如切比雪夫的 Link2）重疊，
  // 在 3D 變成「同一根桿件兩支」。這裡與 2D draw() 的 triangleEdgeKeys 過濾邏輯一致。
  const triPlates = (polygons || []).filter(poly =>
    poly && Array.isArray(poly.points) && poly.points.length === 3 && poly.points.every(valid));
  const triEdgeKeys = new Set();
  triPlates.forEach(poly => {
    const [a, b, c] = poly.points;
    [[a, b], [a, c], [b, c]].forEach(([x, y]) => triEdgeKeys.add([x, y].sort().join('|')));
  });

  // 只取「可見、兩端有效、且不落在三角板邊上」的桿
  const visible = (links || []).filter(l =>
    l && !l.hidden && valid(l.p1) && valid(l.p2) &&
    !triEdgeKeys.has([l.p1, l.p2].sort().join('|')));

  // 把桿與三角板統一成「剛體」做分層 = 圖著色：唯一硬約束是「共用同一個銷孔的剛體不能同層」
  // （同層會在銷孔處穿模）。衝突圖的節點是剛體、邊是「共銷」；用貪婪著色取最少層——四連桿
  // （4-cycle）自然只要 2 層，只有三個以上共用一個銷孔的關節才需要更多層。依固定順序著色，
  // 結果穩定不會逐幀跳動。
  const bodies = [
    ...visible.map(l => ({ kind: 'stick', src: l, joints: [l.p1, l.p2] })),
    ...triPlates.map(poly => ({ kind: 'plate', src: poly, joints: [...poly.points] })),
  ];
  const jointToBodies = new Map();
  bodies.forEach((body, i) => {
    body.joints.forEach(pid => {
      if (!jointToBodies.has(pid)) jointToBodies.set(pid, []);
      jointToBodies.get(pid).push(i);
    });
  });
  const neighbors = bodies.map(() => new Set());
  jointToBodies.forEach(idxs => {
    for (let a = 0; a < idxs.length; a++) {
      for (let b = a + 1; b < idxs.length; b++) {
        neighbors[idxs[a]].add(idxs[b]);
        neighbors[idxs[b]].add(idxs[a]);
      }
    }
  });
  const layerOf = new Array(bodies.length).fill(0);
  for (let i = 0; i < bodies.length; i++) {
    const used = new Set();
    neighbors[i].forEach(j => { if (j < i) used.add(layerOf[j]); });
    let c = 0;
    while (used.has(c)) c++;
    layerOf[i] = c;
  }

  const sticks = [];
  const plates = [];
  bodies.forEach((body, i) => {
    const layer = layerOf[i];
    const z = layer * plateGap;
    if (body.kind === 'stick') {
      const l = body.src;
      const a = points[l.p1];
      const b = points[l.p2];
      sticks.push({
        id: l.id,
        p1: l.p1,
        p2: l.p2,
        a: { x: a.x, y: a.y },
        b: { x: b.x, y: b.y },
        layer,
        z,
        r: hullR,
        thickness: plateThickness,
        isCrank: l.style === 'crank',
        color: l.style === 'crank' ? '#e74c3c' : (l.color || '#3498db'),
      });
    } else {
      const poly = body.src;
      const corners = poly.points.map(id => ({ x: points[id].x, y: points[id].y }));
      plates.push({
        ids: [...poly.points],
        corners,
        layer,
        z,
        r: hullR,
        thickness: plateThickness,
        color: poly.color || '#27ae60',
      });
    }
  });

  // 每個關節蒐集「接到它的桿層」，銷柱從最低層貫穿到最高層
  const joints = new Map(); // id -> { id, x, y, min, max, ground }
  const touch = (id, layer) => {
    const p = points[id];
    if (!p || !Number.isFinite(p.x)) return;
    let j = joints.get(id);
    if (!j) {
      joints.set(id, { id, x: p.x, y: p.y, min: layer, max: layer, ground: groundIds.has(id) });
    } else {
      j.min = Math.min(j.min, layer);
      j.max = Math.max(j.max, layer);
    }
  };
  sticks.forEach(s => { touch(s.p1, s.layer); touch(s.p2, s.layer); });
  plates.forEach(pl => pl.ids.forEach(id => touch(id, pl.layer)));

  const pins = [];
  const grounds = [];
  joints.forEach(j => {
    const z0 = j.min * plateGap;
    const z1 = j.max * plateGap + plateThickness;
    pins.push({
      id: j.id,
      x: j.x,
      y: j.y,
      z0: z0 - 1.5,          // 略凸出板面，像真的銷
      z1: z1 + 1.5,
      r: pinR,
      ground: j.ground,
    });
    if (j.ground) grounds.push({ id: j.id, x: j.x, y: j.y });
  });

  // 整體外接框：只用來估初始相機距離（span）。含三角板角點，純三角板的機構也估得準。
  let span = 100;
  let bboxCenter = { x: 0, y: 0 };
  const xs = [];
  const ys = [];
  sticks.forEach(s => { xs.push(s.a.x, s.b.x); ys.push(s.a.y, s.b.y); });
  plates.forEach(pl => pl.corners.forEach(c => { xs.push(c.x); ys.push(c.y); }));
  if (xs.length) {
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    bboxCenter = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    span = Math.max(maxX - minX, maxY - minY, 1);
  }

  // 相機對焦點：有地錨就用地錨形心（恆定不動，動畫時不會晃）；沒地錨才退回外接框中心。
  // anchored=true 時 viewer 可每幀同步（反正不動）；false 時 viewer 只在初次定位、之後凍結。
  const maxLayer = [...sticks, ...plates].reduce((m, s) => Math.max(m, s.layer), 0);
  const midZ = (maxLayer * plateGap + plateThickness) / 2;
  const anchored = grounds.length > 0;
  const focus = anchored
    ? {
        x: grounds.reduce((s, g) => s + g.x, 0) / grounds.length,
        y: grounds.reduce((s, g) => s + g.y, 0) / grounds.length,
        z: midZ,
      }
    : { x: bboxCenter.x, y: bboxCenter.y, z: midZ };

  return { sticks, plates, pins, grounds, plateGap, plateThickness, span, focus, anchored };
}
