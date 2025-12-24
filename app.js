// 4-Bar Linkage → Parts → GRBL G-code (MVP)
// Target: GRBL, Work area default 3018: 300x180mm
// Coordinate: X right, Y up. G-code uses mm (G21), absolute (G90). Z up positive, cutting Z negative.

const $ = (id) => document.getElementById(id);

function log(msg) {
  $("log").textContent = msg;
}

function deg2rad(d) { return (d * Math.PI) / 180; }

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

function fmt(n) {
  // keep gcode short but stable
  return Number.isFinite(n) ? (Math.round(n * 1000) / 1000).toString() : "NaN";
}

/**
 * Solve 4-bar for point B as intersection of two circles:
 * O2=(0,0), O4=(a,0)
 * A is on circle radius b at angle theta: A=(b cosθ, b sinθ)
 * B is intersection of circle centered at A radius c and circle centered at O4 radius d
 * Return {O2,O4,A,B} or null if no solution.
 */
function solveFourBar({ a, b, c, d, thetaDeg, assembly }) {
  const th = deg2rad(thetaDeg);
  const O2 = { x: 0, y: 0 };
  const O4 = { x: a, y: 0 };
  const A = { x: b * Math.cos(th), y: b * Math.sin(th) };

  const x0 = A.x, y0 = A.y, r0 = c;
  const x1 = O4.x, y1 = O4.y, r1 = d;

  const dx = x1 - x0;
  const dy = y1 - y0;
  const D = Math.hypot(dx, dy);

  // No solution if circles too far apart or one contains the other (strict)
  if (D > r0 + r1) return null;
  if (D < Math.abs(r0 - r1)) return null;
  if (D === 0 && r0 === r1) return null;

  // Circle intersection math
  const aSeg = (r0 * r0 - r1 * r1 + D * D) / (2 * D);
  const hSq = r0 * r0 - aSeg * aSeg;
  if (hSq < 0) return null;
  const h = Math.sqrt(hSq);

  const xm = x0 + (aSeg * dx) / D;
  const ym = y0 + (aSeg * dy) / D;

  // Two intersection points
  const rx = -dy * (h / D);
  const ry = dx * (h / D);

  const P1 = { x: xm + rx, y: ym + ry };
  const P2 = { x: xm - rx, y: ym - ry };

  // Choose open/crossed by y sign heuristic (good for typical O2/O4 on x-axis),
  // plus allow user toggle. For robust continuity you'd pick closest to previous.
  let B;
  if (assembly === "open") {
    B = (P1.y >= P2.y) ? P1 : P2;
  } else {
    B = (P1.y < P2.y) ? P1 : P2;
  }

  return { O2, O4, A, B };
}

/**
 * Generate 4 parts (straight bars) from lengths a,b,c,d.
 * Each bar is a rectangle: length = L + 2*margin, width=W
 * Holes are centered along the bar centerline at distance margin from each end.
 */
function generateParts({ a, b, c, d, barW, margin, holeD, spacing, workX, workY }) {
  const parts = [
    { id: "ground",  L: a },
    { id: "input",   L: b },
    { id: "coupler", L: c },
    { id: "output",  L: d },
  ];

  // Layout: place bars left-to-right, wrapping to next row if needed
  let xCursor = 10;
  let yCursor = 10;
  let rowH = 0;

  const out = [];
  for (const p of parts) {
    const rectL = p.L + 2 * margin;
    const rectW = barW;

    const w = rectL;
    const h = rectW;

    if (xCursor + w + 10 > workX) {
      xCursor = 10;
      yCursor += rowH + spacing;
      rowH = 0;
    }
    rowH = Math.max(rowH, h);

    const x0 = xCursor;
    const y0 = yCursor;

    // soft limit check
    if (x0 < 0 || y0 < 0 || (x0 + w) > workX || (y0 + h) > workY) {
      throw new Error(
        `零件 ${p.id} 排版超出工作範圍：需要 (${fmt(x0+w)}, ${fmt(y0+h)})，但工作區是 (${workX}, ${workY})`
      );
    }

    const cx = x0 + w / 2;
    const cy = y0 + h / 2;

    // Hole centers along x-axis (bar length direction), y at center
    const hole1 = { x: x0 + margin, y: cy };
    const hole2 = { x: x0 + margin + p.L, y: cy };

    out.push({
      id: p.id,
      L: p.L,
      rect: { x: x0, y: y0, w, h },
      holes: [hole1, hole2],
      holeD,
    });

    xCursor += w + spacing;
  }

  return out;
}

/**
 * GRBL G-code Writer
 */
function gcodeHeader({ safeZ, spindle }) {
  const lines = [];
  lines.push("(MVP 4-bar parts, GRBL)");
  lines.push("G21  (mm)");
  lines.push("G90  (absolute)");
  lines.push("G17  (XY plane)");
  lines.push("G94  (feed per minute)");
  lines.push(`G0 Z${fmt(safeZ)}`);
  if (Number.isFinite(spindle) && spindle > 0) {
    lines.push(`M3 S${fmt(spindle)}`);
  }
  return lines;
}

function gcodeFooter({ safeZ, spindle }) {
  const lines = [];
  lines.push(`G0 Z${fmt(safeZ)}`);
  if (Number.isFinite(spindle) && spindle > 0) {
    lines.push("M5");
  }
  lines.push("M2");
  return lines;
}

function drillOps({ holes, safeZ, drillZ, feedZ }) {
  const lines = [];
  lines.push("(Drill holes)");
  for (const h of holes) {
    lines.push(`G0 Z${fmt(safeZ)}`);
    lines.push(`G0 X${fmt(h.x)} Y${fmt(h.y)}`);
    lines.push(`G1 Z${fmt(drillZ)} F${fmt(feedZ)}`);
    lines.push(`G0 Z${fmt(safeZ)}`);
  }
  return lines;
}

function profileRectOps({ rect, safeZ, cutDepth, stepdown, feedXY, feedZ }) {
  const lines = [];
  lines.push("(Profile rectangle)");
  const x0 = rect.x, y0 = rect.y, x1 = rect.x + rect.w, y1 = rect.y + rect.h;

  // Start point: lower-left corner
  const startX = x0;
  const startY = y0;

  // Multi-pass Z levels: -stepdown, -2*stepdown, ... until -cutDepth
  const zLevels = [];
  const total = Math.abs(cutDepth);
  const sd = Math.abs(stepdown);
  const n = Math.max(1, Math.ceil(total / sd));
  for (let i = 1; i <= n; i++) {
    const z = -Math.min(i * sd, total);
    zLevels.push(z);
  }

  for (const z of zLevels) {
    lines.push(`G0 Z${fmt(safeZ)}`);
    lines.push(`G0 X${fmt(startX)} Y${fmt(startY)}`);
    lines.push(`G1 Z${fmt(z)} F${fmt(feedZ)}`);

    // CCW around rectangle
    lines.push(`G1 X${fmt(x1)} Y${fmt(y0)} F${fmt(feedXY)}`);
    lines.push(`G1 X${fmt(x1)} Y${fmt(y1)} F${fmt(feedXY)}`);
    lines.push(`G1 X${fmt(x0)} Y${fmt(y1)} F${fmt(feedXY)}`);
    lines.push(`G1 X${fmt(x0)} Y${fmt(y0)} F${fmt(feedXY)}`);

    lines.push(`G0 Z${fmt(safeZ)}`);
  }

  return lines;
}

function buildPartGcode(part, mfg) {
  const {
    safeZ, feedXY, feedZ, thickness, overcut, stepdown, spindle
  } = mfg;

  const cutDepth = -(thickness + overcut); // negative
  const drillZ = cutDepth;                 // drill through same depth

  const lines = [];
  lines.push(...gcodeHeader({ safeZ, spindle }));
  lines.push(`(Part: ${part.id}, link L=${fmt(part.L)}mm)`);
  lines.push(...drillOps({ holes: part.holes, safeZ, drillZ, feedZ }));
  lines.push(...profileRectOps({ rect: part.rect, safeZ, cutDepth, stepdown, feedXY, feedZ }));
  lines.push(...gcodeFooter({ safeZ, spindle }));
  return lines.join("\n") + "\n";
}

// ---------- Rendering (SVG) ----------
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function renderFourbar(sol) {
  const W = 520, H = 320;
  const pad = 30;

  const pts = [sol.O2, sol.O4, sol.A, sol.B];
  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.y);

  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);

  const spanX = Math.max(1e-6, maxX - minX);
  const spanY = Math.max(1e-6, maxY - minY);

  const scale = Math.min((W - 2*pad)/spanX, (H - 2*pad)/spanY);

  function tx(p) { return pad + (p.x - minX) * scale; }
  function ty(p) { return H - (pad + (p.y - minY) * scale); } // flip Y for screen

  const svg = svgEl("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}` });

  // Links: O2-A, A-B, B-O4, O2-O4
  const links = [
    [sol.O2, sol.A],
    [sol.A, sol.B],
    [sol.B, sol.O4],
    [sol.O2, sol.O4],
  ];
  for (const [p, q] of links) {
    svg.appendChild(svgEl("line", {
      x1: tx(p), y1: ty(p), x2: tx(q), y2: ty(q),
      stroke: "#111", "stroke-width": 2
    }));
  }

  // Joints
  const jointStyle = { fill: "#fff", stroke: "#111", "stroke-width": 2 };
  for (const p of pts) {
    svg.appendChild(svgEl("circle", { cx: tx(p), cy: ty(p), r: 6, ...jointStyle }));
  }

  // Labels
  const labels = [
    ["O2", sol.O2], ["O4", sol.O4], ["A", sol.A], ["B", sol.B]
  ];
  for (const [name, p] of labels) {
    const t = svgEl("text", { x: tx(p) + 8, y: ty(p) - 8, fill: "#111", "font-size": 12 });
    t.textContent = name;
    svg.appendChild(t);
  }

  return svg;
}

function renderPartsLayout(parts, workX, workY) {
  const W = 520, H = 320, pad = 10;
  const scale = Math.min((W - 2*pad)/workX, (H - 2*pad)/workY);

  function tx(x) { return pad + x * scale; }
  function ty(y) { return H - (pad + y * scale); }

  const svg = svgEl("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}` });

  // work area border
  svg.appendChild(svgEl("rect", {
    x: tx(0), y: ty(workY),
    width: workX * scale, height: workY * scale,
    fill: "none", stroke: "#111", "stroke-width": 1
  }));

  for (const p of parts) {
    const r = p.rect;
    // rectangle
    svg.appendChild(svgEl("rect", {
      x: tx(r.x), y: ty(r.y + r.h),
      width: r.w * scale, height: r.h * scale,
      fill: "rgba(0,0,0,0.03)", stroke: "#111", "stroke-width": 1
    }));
    // holes
    for (const h of p.holes) {
      svg.appendChild(svgEl("circle", {
        cx: tx(h.x), cy: ty(h.y),
        r: (p.holeD/2) * scale,
        fill: "none", stroke: "#111", "stroke-width": 1
      }));
    }
    // label
    const t = svgEl("text", { x: tx(r.x + 2), y: ty(r.y + r.h - 2), fill: "#111", "font-size": 12 });
    t.textContent = p.id;
    svg.appendChild(t);
  }

  return svg;
}

// ---------- Download helpers ----------
function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------- App ----------
function readInputs() {
  const a = Number($("a").value);
  const b = Number($("b").value);
  const c = Number($("c").value);
  const d = Number($("d").value);
  const thetaDeg = Number($("theta").value);
  const assembly = $("assembly").value;

  const barW = Number($("barW").value);
  const margin = Number($("margin").value);
  const holeD = Number($("holeD").value);
  const spacing = Number($("spacing").value);

  const workX = Number($("workX").value);
  const workY = Number($("workY").value);

  const toolD = Number($("toolD").value);
  const thickness = Number($("thickness").value);
  const overcut = Number($("overcut").value);
  const stepdown = Number($("stepdown").value);
  const safeZ = Number($("safeZ").value);
  const feedXY = Number($("feedXY").value);
  const feedZ = Number($("feedZ").value);
  const spindleRaw = $("spindle").value.trim();
  const spindle = spindleRaw === "" ? NaN : Number(spindleRaw);

  return {
    mech: { a, b, c, d, thetaDeg, assembly },
    partSpec: { barW, margin, holeD, spacing, workX, workY },
    mfg: { toolD, thickness, overcut, stepdown, safeZ, feedXY, feedZ, spindle },
  };
}

function validateConfig(mech, partSpec, mfg) {
  const nums = [
    ["a", mech.a], ["b", mech.b], ["c", mech.c], ["d", mech.d],
    ["barW", partSpec.barW], ["margin", partSpec.margin], ["holeD", partSpec.holeD],
    ["workX", partSpec.workX], ["workY", partSpec.workY],
    ["toolD", mfg.toolD], ["thickness", mfg.thickness], ["overcut", mfg.overcut],
    ["stepdown", mfg.stepdown], ["safeZ", mfg.safeZ], ["feedXY", mfg.feedXY], ["feedZ", mfg.feedZ],
  ];
  for (const [k, v] of nums) {
    if (!Number.isFinite(v) || v <= 0) throw new Error(`參數 ${k} 無效：${v}`);
  }
  if (partSpec.holeD <= mfg.toolD) {
    // Not strictly invalid (you can interpolate), but for MVP we warn / block
    throw new Error(`孔徑 holeD(${partSpec.holeD}) 需大於刀徑 toolD(${mfg.toolD})（MVP 先不做內插擴孔）`);
  }
  if (mfg.stepdown > (mfg.thickness + mfg.overcut)) {
    throw new Error(`stepdown 不應大於總切深（厚度+穿透餘量）`);
  }
}

function updatePreview() {
  try {
    const { mech, partSpec, mfg } = readInputs();
    validateConfig(mech, partSpec, mfg);

    const sol = solveFourBar(mech);
    const svgWrap = $("svgWrap");
    svgWrap.innerHTML = "";

    if (!sol) {
      log("四連桿：此角度不可行（兩圓不相交/無解）。請改 θ 或改 a,b,c,d。");
      svgWrap.textContent = "（無解）";
      $("partsWrap").innerHTML = "";
      $("dlButtons").innerHTML = "";
      return;
    }

    svgWrap.appendChild(renderFourbar(sol));

    const parts = generateParts(partSpec);
    $("partsWrap").innerHTML = "";
    $("partsWrap").appendChild(renderPartsLayout(parts, partSpec.workX, partSpec.workY));

    // show summary
    const cutDepth = mfg.thickness + mfg.overcut;
    const layers = Math.max(1, Math.ceil(cutDepth / mfg.stepdown));
    log(
      [
        `四連桿解算：OK（${mech.assembly}），θ=${mech.thetaDeg}°`,
        `桿件：ground=${mech.a} / input=${mech.b} / coupler=${mech.c} / output=${mech.d} (mm)`,
        `加工：總切深=${fmt(cutDepth)}mm，stepdown=${fmt(mfg.stepdown)}mm → 層數≈${layers}`,
        `工作區：${partSpec.workX} x ${partSpec.workY} (mm)`,
      ].join("\n")
    );

    $("dlButtons").innerHTML = "";
  } catch (e) {
    log(`錯誤：${e.message}`);
    $("svgWrap").innerHTML = "";
    $("partsWrap").innerHTML = "";
    $("dlButtons").innerHTML = "";
  }
}

function generateGcodes() {
  try {
    const { mech, partSpec, mfg } = readInputs();
    validateConfig(mech, partSpec, mfg);

    // we don't strictly need the current theta solution to generate parts,
    // but we keep it to maintain the "simulate then export" workflow.
    const sol = solveFourBar(mech);
    if (!sol) throw new Error("此 θ 無解：請先讓模擬可行，再輸出零件。");

    const parts = generateParts(partSpec);

    // Build gcode per part
    const files = [];
    for (const p of parts) {
      const g = buildPartGcode(p, mfg);
      files.push({ name: `${p.id}.gcode`, text: g });
    }

    // Create download buttons
    const dl = $("dlButtons");
    dl.innerHTML = "";
    for (const f of files) {
      const btn = document.createElement("button");
      btn.textContent = `下載 ${f.name}`;
      btn.onclick = () => downloadText(f.name, f.text);
      dl.appendChild(btn);
    }

    log($("log").textContent + "\n\n已生成 4 份 G-code（每根桿件各一份）。");
  } catch (e) {
    log(`錯誤：${e.message}`);
    $("dlButtons").innerHTML = "";
  }
}

// Wire UI
$("btnUpdate").addEventListener("click", updatePreview);
$("btnGen").addEventListener("click", generateGcodes);

// Auto update on load
updatePreview();
