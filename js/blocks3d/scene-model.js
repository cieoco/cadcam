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
 * 以「離固定桿的距離」決定每個剛體的疊放層級。2D 的繪製疊放順序與 3D 的 z 分層
 * 共用這同一套，兩邊才會一致。
 * @param {Array} bodies - [{ joints: [nodeId...], lift? }]（桿 2 個、三角板 3 個銷孔；
 *                          lift＝手動相對位移：+1 往上一層、-1 往下一層、0/缺＝自動）
 * @param {Set}   [groundIds] - 地錨節點 id
 * @param {Object} [opts]
 * @param {(i:number)=>number} [opts.floorOf] - 完全取代「樓地板」的覆寫（預設用 rank + body.lift）
 * @returns {number[]} 與 bodies 同序的層級（越大越外/越上）
 *
 * 原則：(1) 節點離地深度 BFS（地錨 0；其餘＝相鄰最小深度＋1；無地錨/不連通視為 0）。
 *       (2) 剛體 rank ＝ 端點最大深度：機架 0 疊最內、逐級往外。
 *       (3) 依 rank 由小到大著色，取「≥ 樓地板、共銷鄰居未佔」的最小層。
 *       rank 當樓地板 → 固定桿最底、外側往上、銷柱只跨相鄰層；共銷檢查 → 同銷孔必不同層
 *       （避免穿模，dyad 閉合的兩根自動錯開）。只看拓撲不看姿勢，逐幀穩定。
 *       floorOf 可覆寫樓地板，給「移到最上 / 最下」之類的手動調整用。
 */
export function computeBodyLayers(bodies, groundIds = new Set(), opts = {}) {
  const adj = new Map();
  const link2 = (a, b) => { if (!adj.has(a)) adj.set(a, new Set()); adj.get(a).add(b); };
  bodies.forEach(body => {
    const js = body.joints;
    for (let i = 0; i < js.length; i++) {
      for (let k = i + 1; k < js.length; k++) { link2(js[i], js[k]); link2(js[k], js[i]); }
    }
  });
  const depth = new Map();
  const seeds = [...new Set(bodies.flatMap(b => b.joints))].filter(id => groundIds.has(id));
  seeds.forEach(id => depth.set(id, 0));
  const queue = [...seeds];
  while (queue.length) {
    const cur = queue.shift();
    const d = depth.get(cur);
    (adj.get(cur) || []).forEach(nb => { if (!depth.has(nb)) { depth.set(nb, d + 1); queue.push(nb); } });
  }
  const depthOf = id => (depth.has(id) ? depth.get(id) : 0);
  const rankOf = body => body.joints.reduce((m, id) => Math.max(m, depthOf(id)), 0);
  const ranks = bodies.map(rankOf);
  // 樓地板＝自然 rank ＋ 手動相對位移 body.lift（+1 往上一層、-1 往下一層）。
  // 共銷檢查仍生效：被推到同層的同銷孔剛體會自動再往上錯開，不會穿模。
  const floorOf = opts.floorOf || ((i) => ranks[i] + (bodies[i].lift || 0));
  const floors = bodies.map((_, i) => floorOf(i));

  // 共銷衝突圖（剛體 i,j 共用同一銷孔則相鄰）
  const jointTo = new Map();
  bodies.forEach((body, i) => body.joints.forEach(pid => {
    if (!jointTo.has(pid)) jointTo.set(pid, []);
    jointTo.get(pid).push(i);
  }));
  const neighbors = bodies.map(() => new Set());
  jointTo.forEach(idxs => {
    for (let a = 0; a < idxs.length; a++) {
      for (let b = a + 1; b < idxs.length; b++) { neighbors[idxs[a]].add(idxs[b]); neighbors[idxs[b]].add(idxs[a]); }
    }
  });

  // 依樓地板由小到大（同高維持原始順序）著色，取「≥樓地板、共銷鄰居未佔」的最小層
  const order = bodies.map((_, i) => i).sort((a, b) => (floors[a] - floors[b]) || (a - b));
  const layerOf = new Array(bodies.length).fill(undefined);
  order.forEach(i => {
    const used = new Set();
    neighbors[i].forEach(j => { if (layerOf[j] !== undefined) used.add(layerOf[j]); });
    let c = floors[i];
    while (used.has(c)) c++;
    layerOf[i] = c;
  });
  return layerOf;
}

/**
 * @param {Array} links  - compiled.visualization.links 風格：{ id, p1, p2, style, color, hidden }
 * @param {Object} points - id -> { x, y }（已合併靜態點與 solver 解）
 * @param {Object} [opts]
 * @param {Set}    [opts.groundIds]      - 視為地錨的節點 id
 * @param {Set}    [opts.motorCenters]   - 馬達輸出軸所在的節點 id（input crank 的中心）
 * @param {Array}  [opts.polygons]       - compiled.visualization.polygons：三點桿，{ points:[id,id,id], color }
 * @param {number} [opts.hullR=9]        - 冰棒棍外形半徑（與 2D 一致）
 * @param {number} [opts.plateGap=6]     - 相鄰層的 z 間距 (mm)
 * @param {number} [opts.plateThickness=4] - 每片板的厚度 (mm)
 * @param {number} [opts.pinR=3.2]       - 銷柱半徑 (mm)
 * @returns {{ sticks, plates, pins, grounds, motors, plateGap, plateThickness, center, span }}
 */
export function buildSceneModel(links, points, opts = {}) {
  const hullR = opts.hullR ?? 9;
  const plateGap = opts.plateGap ?? 6;
  const plateThickness = opts.plateThickness ?? 4;
  const pinR = opts.pinR ?? 3.2;
  const groundIds = opts.groundIds || new Set();
  const motorCenters = opts.motorCenters || new Set();
  const motorTypes = opts.motorTypes || new Map();   // id -> 'tt' | 'mg995'
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

  // 把桿與三角板統一成「剛體」（joints = 它佔用的銷孔；桿 2 個、三角板 3 個）。
  // lift = 手動疊放偏好（由 app.js 標在 visualization 物件的 _zlift 上，2D/3D 共用同一份）。
  const bodies = [
    ...visible.map(l => ({ kind: 'stick', src: l, joints: [l.p1, l.p2], lift: l._zlift || 0 })),
    ...triPlates.map(poly => ({ kind: 'plate', src: poly, joints: [...poly.points], lift: poly._zlift || 0 })),
  ];

  // 分層（離地深度，2D 疊放順序與此共用同一套 → 兩邊一致）
  const layerOf = computeBodyLayers(bodies, groundIds);

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
  const motors = [];
  joints.forEach(j => {
    const z0 = j.min * plateGap;
    const z1 = j.max * plateGap + plateThickness;
    if (motorCenters.has(j.id)) {
      // 馬達鎖在固定桿上：本體沉到機構背面（z<0）、躺平往機架方向延伸，輸出軸沿 z 往上帶動曲柄。
      // 輸出軸兼當這個關節的軸，所以這裡不再另畫銷柱、也不畫地錨支柱（改由 viewer 畫馬達）。
      // 朝向：對準接在中心、非曲柄的那根桿的另一端（通常是機架）；沒有就朝最近的另一個地錨；都沒有朝 -y。
      let tx = null, ty = null;
      const frameBar = sticks.find(s => !s.isCrank && (s.p1 === j.id || s.p2 === j.id));
      if (frameBar) {
        const oid = frameBar.p1 === j.id ? frameBar.p2 : frameBar.p1;
        const op = points[oid];
        if (op && Number.isFinite(op.x)) { tx = op.x; ty = op.y; }
      }
      if (tx === null) {
        let bd = Infinity;
        groundIds.forEach(gid => {
          if (gid === j.id) return;
          const gp = points[gid];
          if (gp && Number.isFinite(gp.x)) {
            const d = Math.hypot(gp.x - j.x, gp.y - j.y);
            if (d < bd) { bd = d; tx = gp.x; ty = gp.y; }
          }
        });
      }
      const dx = tx !== null ? tx - j.x : 0;
      const dy = ty !== null ? ty - j.y : -1;
      const dl = Math.hypot(dx, dy) || 1;
      const type = motorTypes.get(j.id) === 'mg995' ? 'mg995' : 'tt';
      motors.push({ id: j.id, x: j.x, y: j.y, baseZ: z0, shaftTopZ: z1 + 1.5, dir: { x: dx / dl, y: dy / dl }, type });
      return;
    }
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
  // 馬達中心也是固定點，一併納入對焦形心（否則只有馬達、沒有其他地錨時相機會抓不到定點）
  const anchorPts = [...grounds, ...motors];
  const anchored = anchorPts.length > 0;
  const focus = anchored
    ? {
        x: anchorPts.reduce((s, g) => s + g.x, 0) / anchorPts.length,
        y: anchorPts.reduce((s, g) => s + g.y, 0) / anchorPts.length,
        z: midZ,
      }
    : { x: bboxCenter.x, y: bboxCenter.y, z: midZ };

  return { sticks, plates, pins, grounds, motors, plateGap, plateThickness, span, focus, anchored };
}
