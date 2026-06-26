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
 * @param {Array}  [opts.sliders]        - 滑塊：{ id, p1, p2, m1, m2, p3, baseEnd, travelStart, travelEnd, carriageLen, color }
 *                                          （開槽軌道＋兩螺絲導引的滑件）
 * @param {Array}  [opts.gears]          - 齒輪：{ id, center, pin, radius, teeth, module, mesh, color }
 * @param {number} [opts.hullR=9]        - 冰棒棍外形半徑（與 2D 一致）
 * @param {number} [opts.plateGap=6]     - 相鄰層的 z 間距 (mm)
 * @param {number} [opts.plateThickness=4] - 每片板的厚度 (mm)
 * @param {number} [opts.pinR=3.2]       - 銷柱半徑 (mm)
 * @returns {{ sticks, plates, pins, grounds, motors, rails, carriages, gears, plateGap, plateThickness, center, span }}
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
  const gearDefs = opts.gears || [];

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

  // 只取「可見、兩端有效、且不落在三角板邊上」的桿。
  // style:'track' 是滑塊軌道的視覺輔助線，3D 另以實體軌道槽呈現（見下方 rails），不當普通桿。
  const visible = (links || []).filter(l =>
    l && !l.hidden && l.style !== 'track' && valid(l.p1) && valid(l.p2) &&
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

  // 滑塊（無動力）＝開槽連桿 + 帶兩根導引螺絲的滑件：
  //   - 軌道：m1-m2 承載桿（固定底座），沿行程範圍挖一條長槽。
  //   - 滑件：中心 p3，沿軸向前後各 carriageLen/2 放一根螺絲穿過槽（兩螺絲定出直線、鎖死旋轉）；
  //           短滑件本體把兩螺絲連起來，連接桿接在正中 p3（中心銷由現有關節銷處理）。
  //   - z 疊放：滑件在連接桿那層（在前），軌道緊貼其背面，螺絲沿 z 貫穿軌道槽到滑件。
  // baseEnd / travelStart / travelEnd 沿用 2D 慣例：行程距離從 base 端沿軸向量、夾在 [0, railLen]。
  const sliderDefs = opts.sliders || [];
  const rails = [];
  const carriages = [];
  sliderDefs.forEach(sl => {
    const m1 = points[sl.m1], m2 = points[sl.m2];
    const a1 = points[sl.p1], a2 = points[sl.p2], pc = points[sl.p3];
    if (![m1, m2, a1, a2, pc].every(p => p && Number.isFinite(p.x))) return;
    const base = sl.baseEnd === 'p2' ? a2 : a1;
    const other = sl.baseEnd === 'p2' ? a1 : a2;
    const adx = other.x - base.x, ady = other.y - base.y;
    const L = Math.hypot(adx, ady) || 1;
    const ux = adx / L, uy = ady / L;
    const half = Math.max(2, (sl.carriageLen || 32) / 2);   // 前後螺絲距中心
    const screwA = { x: pc.x - ux * half, y: pc.y - uy * half };
    const screwB = { x: pc.x + ux * half, y: pc.y + uy * half };

    const screwR = 1.5;                          // M3 導引螺絲（⌀3mm）
    const slotHalf = screwR + 1;                 // 槽寬 ~5mm：螺絲外留滑動間隙，通道才看得到
    const driver = sticks.find(s => s.p1 === sl.p3 || s.p2 === sl.p3);
    const linkLayer = driver ? driver.layer : 1;
    const bodyLayer = linkLayer - 1;             // 滑件在連接桿內側一層 → 連桿在更外層，避免穿模
    const bodyZ = bodyLayer * plateGap;
    const railZ = (linkLayer - 2) * plateGap;    // 軌道再內一層，緊貼滑件背面
    touch(sl.p3, bodyLayer);                     // 中心銷往內延伸到滑件，連桿↔滑件才接得上

    // 槽涵蓋螺絲的掃掠範圍（行程 ± 螺絲半距），夾在軌道 [0, L] 內
    const ts = Math.max(0, Math.min(L, (Number(sl.travelStart) || 0) - half));
    const te = Math.max(0, Math.min(L, (Number.isFinite(Number(sl.travelEnd)) ? Number(sl.travelEnd) : L) + half));
    const slotA = { x: base.x + ux * ts, y: base.y + uy * ts };
    const slotB = { x: base.x + ux * te, y: base.y + uy * te };

    rails.push({
      a: { x: m1.x, y: m1.y }, b: { x: m2.x, y: m2.y },
      r: hullR * 0.9, thickness: plateThickness,
      z: railZ, color: '#7f8c9b',
      slot: { a: slotA, b: slotB, half: slotHalf, color: '#3a4452' },
    });
    carriages.push({
      bodyA: screwA, bodyB: screwB, bodyR: hullR * 0.7,
      thickness: plateThickness, z: bodyZ, color: sl.color || '#16a085',
      screws: [screwA, screwB], screwR,
      screwZ0: railZ - 1, screwZ1: bodyZ + plateThickness + 1,
    });
  });

  // 齒輪：2D 中畫在連桿下方；3D 中整條嚙合鏈放在同一個內側平面，讓齒面能互相咬合。
  // 齒形本體使用嚙合相位補償；輪緣輸出銷仍直接使用 solver 的 p2 位置，不受齒形相位影響。
  const gears = [];
  const gearLayer = -1;
  const gearZ = gearLayer * plateGap;
  const gearById = new Map(gearDefs.map(g => [g.id, g]));
  gearDefs.forEach(g => {
    const center = points[g.center];
    const pin = points[g.pin];
    if (![center, pin].every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))) return;
    const teeth = Math.max(6, Math.round(Number(g.teeth) || 12));
    const radius = Math.max(1, Number(g.radius) || Math.hypot(pin.x - center.x, pin.y - center.y) || 40);
    const module = Math.max(0.1, Number(g.module) || (2 * radius / teeth));
    const angle = Math.atan2(pin.y - center.y, pin.x - center.x);
    let meshPhase = 0;
    const driver = g.mesh ? gearById.get(g.mesh) : null;
    if (driver && driver.center && points[driver.center]) {
      const dc = points[driver.center];
      const NA = Math.max(6, Math.round(Number(driver.teeth) || 12));
      const betaA = Math.atan2(center.y - dc.y, center.x - dc.x);
      const betaB = Math.atan2(dc.y - center.y, dc.x - center.x);
      let q = (NA * betaA + teeth * betaB) / (2 * Math.PI);
      q -= Math.floor(q);
      meshPhase = (q - 0.5) * (2 * Math.PI / teeth);
    }
    gears.push({
      id: g.id,
      center: { x: center.x, y: center.y },
      pin: { x: pin.x, y: pin.y },
      radius,
      teeth,
      module,
      angle,
      meshPhase,
      z: gearZ,
      layer: gearLayer,
      thickness: plateThickness,
      color: g.color || '#b0772e',
    });
    touch(g.center, gearLayer);
    touch(g.pin, gearLayer);
  });

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
  rails.forEach(r => { xs.push(r.a.x, r.b.x); ys.push(r.a.y, r.b.y); });
  gears.forEach(g => {
    const outer = g.radius + g.module;
    xs.push(g.center.x - outer, g.center.x + outer);
    ys.push(g.center.y - outer, g.center.y + outer);
  });
  if (xs.length) {
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    bboxCenter = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    span = Math.max(maxX - minX, maxY - minY, 1);
  }

  // 相機對焦點：有地錨就用地錨形心（恆定不動，動畫時不會晃）；沒地錨才退回外接框中心。
  // anchored=true 時 viewer 可每幀同步（反正不動）；false 時 viewer 只在初次定位、之後凍結。
  const maxLayer = [...sticks, ...plates, ...gears].reduce((m, s) => Math.max(m, s.layer), 0);
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

  return { sticks, plates, pins, grounds, motors, rails, carriages, gears, plateGap, plateThickness, span, focus, anchored };
}
