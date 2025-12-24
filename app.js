// 4-Bar Linkage → Parts → GRBL G-code (MVP)
// Target: GRBL, Work area default 3018: 300x180mm
// Coordinate: X right, Y up. G-code uses mm (G21), absolute (G90). Z up positive, cutting Z negative.

const $ = (id) => document.getElementById(id);

// Global trajectory data storage
let currentTrajectoryData = null;

// Animation state
let animationState = {
  isPlaying: false,
  intervalId: null,
  currentTheta: 0,
  direction: 1, // 1 for forward, -1 for backward
  rangeStart: -180,
  rangeEnd: 180
};

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

function renderFourbar(sol, thetaDeg, trajectoryData = null) {
  const W = 800, H = 600;
  const pad = 50;
  
  // Get view range from user input
  const viewRange = Number($("viewRange").value) || 400;
  const showGrid = $("showGrid").checked;
  
  // Fixed center: place ground link (O2-O4) horizontally centered
  // O2 and O4 are on the x-axis in model space, center them in view
  const groundCenterX = (sol.O2.x + sol.O4.x) / 2;
  const groundCenterY = (sol.O2.y + sol.O4.y) / 2;
  
  // Scale based on view range
  const scale = Math.min((W - 2*pad), (H - 2*pad)) / viewRange;
  
  // Transform: translate model center to screen center, then scale
  function tx(p) { 
    return (W / 2) + (p.x - groundCenterX) * scale; 
  }
  function ty(p) { 
    return (H / 2) - (p.y - groundCenterY) * scale; // flip Y for screen
  }

  const svg = svgEl("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  
  // Add background
  svg.appendChild(svgEl("rect", {
    x: 0, y: 0, width: W, height: H,
    fill: "#fafafa"
  }));
  
  // Draw grid if enabled
  if (showGrid) {
    const gridStep = 50; // mm
    const gridColor = "#e0e0e0";
    
    // Vertical lines
    for (let x = -viewRange/2; x <= viewRange/2; x += gridStep) {
      const screenX = tx({ x: groundCenterX + x, y: 0 });
      svg.appendChild(svgEl("line", {
        x1: screenX, y1: 0, x2: screenX, y2: H,
        stroke: gridColor, "stroke-width": x === 0 ? 1.5 : 0.5
      }));
    }
    
    // Horizontal lines
    for (let y = -viewRange/2; y <= viewRange/2; y += gridStep) {
      const screenY = ty({ x: 0, y: groundCenterY + y });
      svg.appendChild(svgEl("line", {
        x1: 0, y1: screenY, x2: W, y2: screenY,
        stroke: gridColor, "stroke-width": y === 0 ? 1.5 : 0.5
      }));
    }
    
    // Grid labels
    const labelStep = 100; // mm
    for (let x = -viewRange/2; x <= viewRange/2; x += labelStep) {
      if (x === 0) continue;
      const screenX = tx({ x: groundCenterX + x, y: 0 });
      const label = svgEl("text", {
        x: screenX, y: H/2 + 15,
        fill: "#999", "font-size": 9, "text-anchor": "middle"
      });
      label.textContent = `${x}`;
      svg.appendChild(label);
    }
    for (let y = -viewRange/2; y <= viewRange/2; y += labelStep) {
      if (y === 0) continue;
      const screenY = ty({ x: 0, y: groundCenterY + y });
      const label = svgEl("text", {
        x: W/2 + 15, y: screenY + 3,
        fill: "#999", "font-size": 9, "text-anchor": "start"
      });
      label.textContent = `${y}`;
      svg.appendChild(label);
    }
  }

  // ========== Draw trajectory first (background layer) ==========
  if (trajectoryData) {
    const { results, validRanges, invalidRanges } = trajectoryData;
    
    // Draw B point trajectory as polyline
    const validBPoints = results.filter(r => r.isValid && r.B).map(r => r.B);
    if (validBPoints.length > 1) {
      const points = validBPoints.map(b => `${tx(b)},${ty(b)}`).join(" ");
      
      svg.appendChild(svgEl("polyline", {
        points,
        fill: "none",
        stroke: "#0066cc",
        "stroke-width": 2,
        "stroke-opacity": 0.4,
        "stroke-linejoin": "round",
      }));
      
      // Mark trajectory points
      const step = Math.max(1, Math.floor(validBPoints.length / 12));
      validBPoints.forEach((b, idx) => {
        if (idx % step === 0) {
          svg.appendChild(svgEl("circle", {
            cx: tx(b), cy: ty(b),
            r: 2, fill: "#0066cc", opacity: 0.5
          }));
        }
      });
      
      // Mark start and end of trajectory
      const firstB = validBPoints[0];
      const lastB = validBPoints[validBPoints.length - 1];
      
      svg.appendChild(svgEl("circle", {
        cx: tx(firstB), cy: ty(firstB),
        r: 4, fill: "#00aa00", stroke: "#fff", "stroke-width": 1.5
      }));
      
      svg.appendChild(svgEl("circle", {
        cx: tx(lastB), cy: ty(lastB),
        r: 4, fill: "#cc0000", stroke: "#fff", "stroke-width": 1.5
      }));
    }
    
    // Draw invalid ranges indicator (small legend)
    if (invalidRanges.length > 0) {
      const legendY = 15;
      const legend = svgEl("text", { x: 10, y: legendY, fill: "#a00", "font-size": 10, opacity: 0.7 });
      legend.textContent = `✗ 不可行區間：${invalidRanges.length}個`;
      svg.appendChild(legend);
    }
  }

  // ========== Draw current linkage state (foreground layer) ==========
  
  // Draw reference line (horizontal from O2) for theta angle
  const refLineEnd = { x: sol.O2.x + Math.abs(sol.A.x - sol.O2.x) + 20, y: sol.O2.y };
  svg.appendChild(svgEl("line", {
    x1: tx(sol.O2), y1: ty(sol.O2),
    x2: tx(refLineEnd), y2: ty(refLineEnd),
    stroke: "#999", "stroke-width": 1, "stroke-dasharray": "4,2"
  }));

  // Draw theta angle arc
  const arcRadius = 30; // pixels
  const theta = deg2rad(thetaDeg);
  const startAngle = 0; // reference is horizontal
  const endAngle = -theta; // negative because screen Y is flipped
  
  const arcPath = describeArc(tx(sol.O2), ty(sol.O2), arcRadius, 
                              startAngle * 180 / Math.PI, 
                              endAngle * 180 / Math.PI);
  
  svg.appendChild(svgEl("path", {
    d: arcPath,
    fill: "none",
    stroke: "#ff6600",
    "stroke-width": 2
  }));

  // Theta label
  const labelAngle = -theta / 2; // middle of arc
  const labelRadius = arcRadius + 15;
  const labelX = tx(sol.O2) + labelRadius * Math.cos(labelAngle);
  const labelY = ty(sol.O2) + labelRadius * Math.sin(labelAngle);
  
  const thetaLabel = svgEl("text", {
    x: labelX, y: labelY,
    fill: "#ff6600",
    "font-size": 13,
    "font-weight": "bold",
    "text-anchor": "middle"
  });
  thetaLabel.textContent = `θ=${thetaDeg}°`;
  svg.appendChild(thetaLabel);

  // Links with colors: O2-A (input/b), A-B (coupler/c), B-O4 (output/d), O2-O4 (ground/a)
  const links = [
    { p1: sol.O2, p2: sol.A, color: "#e74c3c", label: "b" },   // Input (red)
    { p1: sol.A, p2: sol.B, color: "#3498db", label: "c" },    // Coupler (blue)
    { p1: sol.B, p2: sol.O4, color: "#27ae60", label: "d" },   // Output (green)
    { p1: sol.O2, p2: sol.O4, color: "#666", label: "a" },     // Ground (gray)
  ];
  for (const link of links) {
    svg.appendChild(svgEl("line", {
      x1: tx(link.p1), y1: ty(link.p1), x2: tx(link.p2), y2: ty(link.p2),
      stroke: link.color, "stroke-width": 3
    }));
    
    // Add link length label at midpoint
    const midX = (tx(link.p1) + tx(link.p2)) / 2;
    const midY = (ty(link.p1) + ty(link.p2)) / 2;
    const labelBg = svgEl("rect", {
      x: midX - 10, y: midY - 8,
      width: 20, height: 14,
      fill: "#fff", opacity: 0.8
    });
    svg.appendChild(labelBg);
    const linkLabel = svgEl("text", {
      x: midX, y: midY + 4,
      fill: link.color,
      "font-size": 11,
      "font-weight": "bold",
      "text-anchor": "middle"
    });
    linkLabel.textContent = link.label;
    svg.appendChild(linkLabel);
  }

  // Joints
  const pts = [sol.O2, sol.O4, sol.A, sol.B];
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
  
  // Highlight current B point if trajectory is shown
  if (trajectoryData) {
    svg.appendChild(svgEl("circle", {
      cx: tx(sol.B), cy: ty(sol.B),
      r: 8, fill: "none", stroke: "#ff00ff", "stroke-width": 2
    }));
  }

  return svg;
}

// Helper function to describe an SVG arc
function describeArc(x, y, radius, startAngle, endAngle) {
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = Math.abs(endAngle - startAngle) <= 180 ? "0" : "1";
  const sweepFlag = endAngle > startAngle ? "0" : "1";
  
  return [
    "M", start.x, start.y,
    "A", radius, radius, 0, largeArcFlag, sweepFlag, end.x, end.y
  ].join(" ");
}

function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
  const angleInRadians = (angleInDegrees) * Math.PI / 180.0;
  return {
    x: centerX + (radius * Math.cos(angleInRadians)),
    y: centerY + (radius * Math.sin(angleInRadians))
  };
}

function renderPartsLayout(parts, workX, workY) {
  const W = 800, H = 450, pad = 10;
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

// ---------- Animation Control ----------
function startAnimation() {
  if (animationState.isPlaying) return;
  
  const motorType = $("motorType").value;
  const speed = Number($("animSpeed").value); // RPM
  
  // Set range based on motor type
  switch(motorType) {
    case "motor360":
      animationState.rangeStart = -180;
      animationState.rangeEnd = 180;
      break;
    case "servo180":
      animationState.rangeStart = 0;
      animationState.rangeEnd = 180;
      break;
    case "servo270":
      animationState.rangeStart = -135;
      animationState.rangeEnd = 135;
      break;
    case "custom":
      animationState.rangeStart = Number($("sweepStart").value);
      animationState.rangeEnd = Number($("sweepEnd").value);
      break;
  }
  
  // Initialize theta to start position
  const currentTheta = Number($("theta").value);
  if (currentTheta < animationState.rangeStart || currentTheta > animationState.rangeEnd) {
    animationState.currentTheta = animationState.rangeStart;
  } else {
    animationState.currentTheta = currentTheta;
  }
  
  animationState.direction = 1;
  animationState.isPlaying = true;
  
  // Calculate interval: RPM -> degrees per frame (60fps target)
  // degrees_per_second = RPM * 360 / 60
  // degrees_per_frame = degrees_per_second / 60
  const degreesPerSecond = (speed * 360) / 60;
  const frameRate = 30; // frames per second
  const degreesPerFrame = degreesPerSecond / frameRate;
  const interval = 1000 / frameRate; // ms per frame
  
  animationState.intervalId = setInterval(() => {
    animateFrame(degreesPerFrame);
  }, interval);
  
  // Update UI
  $("btnPlayAnim").disabled = true;
  $("btnPauseAnim").disabled = false;
  $("btnStopAnim").disabled = false;
  
  log(`動畫播放中... (${speed} RPM)`);
}

function pauseAnimation() {
  if (!animationState.isPlaying) return;
  
  clearInterval(animationState.intervalId);
  animationState.isPlaying = false;
  
  // Update UI
  $("btnPlayAnim").disabled = false;
  $("btnPauseAnim").disabled = true;
  $("btnStopAnim").disabled = false;
  
  log(`動畫已暫停於 θ=${fmt(animationState.currentTheta)}°`);
}

function stopAnimation() {
  if (animationState.intervalId) {
    clearInterval(animationState.intervalId);
  }
  
  animationState.isPlaying = false;
  animationState.currentTheta = animationState.rangeStart;
  
  // Reset to start position
  $("theta").value = animationState.rangeStart;
  updatePreview();
  
  // Update UI
  $("btnPlayAnim").disabled = false;
  $("btnPauseAnim").disabled = true;
  $("btnStopAnim").disabled = true;
  
  log(`動畫已停止`);
}

function animateFrame(degreesPerFrame) {
  const { rangeStart, rangeEnd } = animationState;
  const motorType = $("motorType").value;
  
  // Update theta
  animationState.currentTheta += degreesPerFrame * animationState.direction;
  
  // Handle boundary conditions
  if (motorType === "motor360") {
    // Continuous rotation - wrap around
    if (animationState.currentTheta > rangeEnd) {
      animationState.currentTheta = rangeStart + (animationState.currentTheta - rangeEnd);
    } else if (animationState.currentTheta < rangeStart) {
      animationState.currentTheta = rangeEnd - (rangeStart - animationState.currentTheta);
    }
  } else {
    // Servo - bounce back
    if (animationState.currentTheta >= rangeEnd) {
      animationState.currentTheta = rangeEnd;
      animationState.direction = -1;
    } else if (animationState.currentTheta <= rangeStart) {
      animationState.currentTheta = rangeStart;
      animationState.direction = 1;
    }
  }
  
  // Update UI
  $("theta").value = Math.round(animationState.currentTheta);
  updatePreview();
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

    // Render with trajectory overlay if available
    svgWrap.appendChild(renderFourbar(sol, mech.thetaDeg, currentTrajectoryData));

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

// ---------- Theta Sweep Analysis ----------
function sweepThetaAnalysis() {
  try {
    const { mech, partSpec, mfg } = readInputs();
    validateConfig(mech, partSpec, mfg);

    const sweepStart = Number($("sweepStart").value);
    const sweepEnd = Number($("sweepEnd").value);
    const sweepStep = Number($("sweepStep").value);
    const showTrajectory = $("showTrajectory").checked;
    const motorType = $("motorType").value;
    
    // Get motor type description
    const motorTypeText = $("motorType").selectedOptions[0].textContent;

    if (sweepStart >= sweepEnd) {
      throw new Error("起始角度必須小於結束角度");
    }
    if (sweepStep <= 0) {
      throw new Error("掃描間隔必須大於 0");
    }

    const results = [];
    const validRanges = [];
    const invalidRanges = [];
    let currentValid = null;
    let currentInvalid = null;

    // Sweep theta
    for (let theta = sweepStart; theta <= sweepEnd; theta += sweepStep) {
      const sol = solveFourBar({ ...mech, thetaDeg: theta });
      const isValid = sol !== null;

      results.push({
        theta,
        isValid,
        B: isValid ? sol.B : null,
      });

      // Track ranges
      if (isValid) {
        if (currentInvalid) {
          invalidRanges.push(currentInvalid);
          currentInvalid = null;
        }
        if (!currentValid) {
          currentValid = { start: theta, end: theta };
        } else {
          currentValid.end = theta;
        }
      } else {
        if (currentValid) {
          validRanges.push(currentValid);
          currentValid = null;
        }
        if (!currentInvalid) {
          currentInvalid = { start: theta, end: theta };
        } else {
          currentInvalid.end = theta;
        }
      }
    }

    // Close final range
    if (currentValid) validRanges.push(currentValid);
    if (currentInvalid) invalidRanges.push(currentInvalid);

    // Store trajectory data globally
    const validBPoints = results.filter(r => r.isValid && r.B).map(r => r.B);
    currentTrajectoryData = {
      results,
      validRanges,
      invalidRanges,
      validBPoints,
      motorType: motorTypeText
    };

    // Display results
    displaySweepResults(results, validRanges, invalidRanges, showTrajectory, partSpec, motorTypeText);
    
    // Update main 2D simulation to show trajectory overlay
    updatePreview();

    log(
      `【${motorTypeText}】\n` +
      `θ 掃描完成：${sweepStart}° → ${sweepEnd}°（每 ${sweepStep}°）\n` +
      `可行區間 ${validRanges.length} 個，不可行區間 ${invalidRanges.length} 個\n` +
      `軌跡已疊加在 2D 模擬圖上`
    );
  } catch (e) {
    log(`錯誤：${e.message}`);
    $("sweepResult").innerHTML = "";
    $("trajectoryWrap").innerHTML = "";
  }
}

function displaySweepResults(results, validRanges, invalidRanges, showTrajectory, partSpec, motorTypeText) {
  // Text summary
  const resultDiv = $("sweepResult");
  resultDiv.innerHTML = "";

  const summary = document.createElement("div");
  summary.innerHTML = `<strong>【${motorTypeText || '掃描分析'}】結果：</strong><br/>`;
  
  if (validRanges.length > 0) {
    summary.innerHTML += `<span style="color:#080;">✓ 可行角度區間（${validRanges.length} 個）：</span><br/>`;
    for (const r of validRanges) {
      summary.innerHTML += `<span style="color:#080; margin-left:16px;">• ${fmt(r.start)}° → ${fmt(r.end)}° （範圍：${fmt(r.end - r.start)}°）</span><br/>`;
    }
  } else {
    summary.innerHTML += `<span style="color:#a00;">✗ 無可行角度區間</span><br/>`;
  }

  if (invalidRanges.length > 0) {
    summary.innerHTML += `<span style="color:#a00;">✗ 不可行角度區間（${invalidRanges.length} 個）：</span><br/>`;
    for (const r of invalidRanges) {
      summary.innerHTML += `<span style="color:#a00; margin-left:16px;">• ${fmt(r.start)}° → ${fmt(r.end)}° （範圍：${fmt(r.end - r.start)}°）</span><br/>`;
    }
  }

  // Calculate B point trajectory statistics
  const validBPoints = results.filter(r => r.isValid && r.B).map(r => r.B);
  if (validBPoints.length > 0) {
    const bxs = validBPoints.map(b => b.x);
    const bys = validBPoints.map(b => b.y);
    const minBx = Math.min(...bxs);
    const maxBx = Math.max(...bxs);
    const minBy = Math.min(...bys);
    const maxBy = Math.max(...bys);
    const rangeX = maxBx - minBx;
    const rangeY = maxBy - minBy;
    const totalRange = Math.hypot(rangeX, rangeY);

    summary.innerHTML += `<br/><strong>B 點軌跡範圍：</strong><br/>`;
    summary.innerHTML += `X: ${fmt(minBx)} → ${fmt(maxBx)} mm （行程：${fmt(rangeX)} mm）<br/>`;
    summary.innerHTML += `Y: ${fmt(minBy)} → ${fmt(maxBy)} mm （行程：${fmt(rangeY)} mm）<br/>`;
    summary.innerHTML += `總行程：${fmt(totalRange)} mm<br/>`;
  }

  resultDiv.appendChild(summary);

  // Trajectory visualization
  if (showTrajectory) {
    const trajectoryDiv = $("trajectoryWrap");
    trajectoryDiv.innerHTML = "";
    const trajSvg = renderTrajectory(results, validRanges, invalidRanges);
    if (trajSvg) {
      trajectoryDiv.appendChild(trajSvg);
    }
  } else {
    $("trajectoryWrap").innerHTML = "";
  }
}

function renderTrajectory(results, validRanges, invalidRanges) {
  const W = 800, H = 600, pad = 50;

  // Collect all valid B points
  const validBPoints = results.filter(r => r.isValid && r.B).map(r => r.B);
  if (validBPoints.length === 0) {
    const msg = document.createElement("div");
    msg.textContent = "無可行解，無法繪製軌跡";
    msg.style.color = "#a00";
    return msg;
  }

  const xs = validBPoints.map(b => b.x);
  const ys = validBPoints.map(b => b.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const spanX = Math.max(1e-6, maxX - minX);
  const spanY = Math.max(1e-6, maxY - minY);

  const scale = Math.min((W - 2*pad)/spanX, (H - 2*pad)/spanY);

  function tx(x) { return pad + (x - minX) * scale; }
  function ty(y) { return H - (pad + (y - minY) * scale); }

  const svg = svgEl("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}` });

  // Add title
  const title = svgEl("text", { x: W/2, y: 20, fill: "#111", "font-size": 14, "text-anchor": "middle", "font-weight": "bold" });
  title.textContent = "B 點軌跡曲線";
  svg.appendChild(title);

  // Draw trajectory as polyline
  const points = results
    .filter(r => r.isValid && r.B)
    .map(r => `${tx(r.B.x)},${ty(r.B.y)}`)
    .join(" ");

  if (points) {
    svg.appendChild(svgEl("polyline", {
      points,
      fill: "none",
      stroke: "#0066cc",
      "stroke-width": 2,
      "stroke-linejoin": "round",
    }));

    // Mark start and end points
    const firstValid = results.find(r => r.isValid && r.B);
    const lastValid = [...results].reverse().find(r => r.isValid && r.B);

    if (firstValid && firstValid.B) {
      svg.appendChild(svgEl("circle", {
        cx: tx(firstValid.B.x), cy: ty(firstValid.B.y),
        r: 5, fill: "#00aa00", stroke: "#fff", "stroke-width": 2
      }));
      const startLabel = svgEl("text", { 
        x: tx(firstValid.B.x) + 10, y: ty(firstValid.B.y) - 10, 
        fill: "#00aa00", "font-size": 11, "font-weight": "bold" 
      });
      startLabel.textContent = `起點 (θ=${fmt(firstValid.theta)}°)`;
      svg.appendChild(startLabel);
    }

    if (lastValid && lastValid.B) {
      svg.appendChild(svgEl("circle", {
        cx: tx(lastValid.B.x), cy: ty(lastValid.B.y),
        r: 5, fill: "#cc0000", stroke: "#fff", "stroke-width": 2
      }));
      const endLabel = svgEl("text", { 
        x: tx(lastValid.B.x) + 10, y: ty(lastValid.B.y) + 15, 
        fill: "#cc0000", "font-size": 11, "font-weight": "bold" 
      });
      endLabel.textContent = `終點 (θ=${fmt(lastValid.theta)}°)`;
      svg.appendChild(endLabel);
    }

    // Mark some intermediate points
    const step = Math.max(1, Math.floor(validBPoints.length / 8));
    results.filter(r => r.isValid && r.B).forEach((r, idx) => {
      if (idx % step === 0 && idx !== 0) {
        svg.appendChild(svgEl("circle", {
          cx: tx(r.B.x), cy: ty(r.B.y),
          r: 3, fill: "#0066cc", stroke: "#fff", "stroke-width": 1
        }));
      }
    });
  }

  // Draw axes
  svg.appendChild(svgEl("line", {
    x1: pad, y1: ty(0), x2: W - pad, y2: ty(0),
    stroke: "#ccc", "stroke-width": 1, "stroke-dasharray": "4,2"
  }));
  svg.appendChild(svgEl("line", {
    x1: tx(0), y1: pad, x2: tx(0), y2: H - pad,
    stroke: "#ccc", "stroke-width": 1, "stroke-dasharray": "4,2"
  }));

  // Add legend for invalid ranges
  if (invalidRanges.length > 0) {
    const legendY = H - 10;
    const legend = svgEl("text", { x: 10, y: legendY, fill: "#a00", "font-size": 11 });
    legend.textContent = `不可行區間：${invalidRanges.map(r => `${fmt(r.start)}°~${fmt(r.end)}°`).join(", ")}`;
    svg.appendChild(legend);
  }

  return svg;
}

// Wire UI
$("btnUpdate").addEventListener("click", updatePreview);
$("btnGen").addEventListener("click", generateGcodes);

// Animation controls
$("btnPlayAnim").addEventListener("click", startAnimation);
$("btnPauseAnim").addEventListener("click", pauseAnimation);
$("btnStopAnim").addEventListener("click", stopAnimation);

// Motor type selector
$("motorType").addEventListener("change", (e) => {
  const type = e.target.value;
  const sweepStart = $("sweepStart");
  const sweepEnd = $("sweepEnd");
  
  switch(type) {
    case "motor360":
      sweepStart.value = -180;
      sweepEnd.value = 180;
      sweepStart.disabled = true;
      sweepEnd.disabled = true;
      break;
    case "servo180":
      sweepStart.value = 0;
      sweepEnd.value = 180;
      sweepStart.disabled = true;
      sweepEnd.disabled = true;
      break;
    case "servo270":
      sweepStart.value = -135;
      sweepEnd.value = 135;
      sweepStart.disabled = true;
      sweepEnd.disabled = true;
      break;
    case "custom":
      sweepStart.disabled = false;
      sweepEnd.disabled = false;
      break;
  }
});

// Initialize motor type settings
$("motorType").dispatchEvent(new Event("change"));

// Auto update on load
updatePreview();
