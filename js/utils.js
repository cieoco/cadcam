/**
 * Utility Functions
 * 通用工具函數
 */

/**
 * 簡化的 DOM 選擇器
 * @param {string} id - Element ID
 * @returns {HTMLElement}
 */
export const $ = (id) => document.getElementById(id);

/**
 * 角度轉弧度
 * @param {number} deg - 角度
 * @returns {number} 弧度
 */
export function deg2rad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * 弧度轉角度
 * @param {number} rad - 弧度
 * @returns {number} 角度
 */
export function rad2deg(rad) {
  return (rad * 180) / Math.PI;
}

/**
 * 限制數值範圍
 * @param {number} n - 數值
 * @param {number} lo - 最小值
 * @param {number} hi - 最大值
 * @returns {number} 限制後的數值
 */
export function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * 格式化數字（保留3位小數）
 * @param {number} n - 數字
 * @returns {string} 格式化後的字串
 */
export function fmt(n) {
  return Number.isFinite(n) ? (Math.round(n * 1000) / 1000).toString() : "NaN";
}

/**
 * 建立 SVG 元素
 * @param {string} tag - SVG 標籤名稱
 * @param {Object} attrs - 屬性物件
 * @returns {SVGElement}
 */
export function svgEl(tag, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  return el;
}

/**
 * 下載文字檔案
 * @param {string} filename - 檔案名稱
 * @param {string} text - 檔案內容
 */
export function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();

  // 延遲移除與釋放，避免 Chrome 在下載尚未啟動前就銷毀 URL 導致檔名變成 UUID
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * 下載 ZIP 壓縮檔
 * @param {string} zipName - 壓縮檔名稱
 * @param {Array<{name: string, text: string}>} files - 檔案列表
 */
export async function downloadZip(zipName, files) {
  if (typeof JSZip === 'undefined') {
    alert("JSZip 函式庫尚未載入，請確認 mechanism.html 已引入 JSZip。");
    return;
  }

  const zip = new JSZip();
  for (const f of files) {
    zip.file(f.name, f.text);
  }

  const content = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(content);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipName;
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * 記錄訊息到 log 區域
 * @param {string} msg - 訊息內容
 */
export function log(msg) {
  const logEl = $("log");
  if (logEl) {
    logEl.textContent = msg;
  }
}

/**
 * 極座標轉直角座標
 * @param {number} centerX - 中心 X
 * @param {number} centerY - 中心 Y
 * @param {number} radius - 半徑
 * @param {number} angleInDegrees - 角度
 * @returns {{x: number, y: number}}
 */
export function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
  const angleInRadians = (angleInDegrees * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

/**
 * 描述 SVG 圓弧路徑
 * @param {number} x - 圓心 X
 * @param {number} y - 圓心 Y
 * @param {number} radius - 半徑
 * @param {number} startAngle - 起始角度
 * @param {number} endAngle - 結束角度
 * @returns {string} SVG path 字串
 */
export function describeArc(x, y, radius, startAngle, endAngle) {
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = Math.abs(endAngle - startAngle) <= 180 ? "0" : "1";
  const sweepFlag = endAngle > startAngle ? "0" : "1";

  return [
    "M",
    start.x,
    start.y,
    "A",
    radius,
    radius,
    0,
    largeArcFlag,
    sweepFlag,
    end.x,
    end.y,
  ].join(" ");
}

/**
 * 繪製通用格線 (背景)
 * @param {SVGElement} svg - SVG 元素
 * @param {number} W - 寬度
 * @param {number} H - 高度
 * @param {number} viewRange - 視圖範圍 (mm)
 * @param {number} originX - 原點 X (Screen Coords)
 * @param {number} originY - 原點 Y (Screen Coords)
 * @param {Function} tx - X 座標轉換函數 (Model -> Screen)
 * @param {Function} ty - Y 座標轉換函數 (Model -> Screen)
 */
export function calcAdaptiveGridStep(viewRange) {
  // Adaptive Grid Step
  // Target: roughly 30-40 divisions for finer control
  const roughStep = viewRange / 30;
  // Snap to nice intervals: 1, 2, 5, 10, 20, 50, 100, 200...
  const power = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const base = roughStep / power;

  if (base < 1.5) return 1 * power;
  else if (base < 3.5) return 2 * power;
  else if (base < 7.5) return 5 * power;
  else return 10 * power;
}

export function drawGrid(svg, W, H, viewRange, originX, originY, tx, ty, gridStep = 'auto') {
  let step = 50;
  if (gridStep === 'auto' || !gridStep) {
    // Calculate effective range for adaptive step
    // Probe scale
    let scale = 1;
    try {
      // Probe scale using tx
      // Assuming linear: tx(val) = offset + val * scale
      const x0 = tx(0);
      const x1 = tx(100);
      if (Number.isFinite(x0) && Number.isFinite(x1)) {
        scale = Math.abs(x1 - x0) / 100;
      }
    } catch (e) { }

    const effectiveViewRange = Math.min(W, H) / (scale || 1);
    step = calcAdaptiveGridStep(effectiveViewRange);
  } else {
    step = Number(gridStep);
  }

  // Calculate Scale again for usage
  let scale = 1;
  try {
    const x0 = tx(0);
    const x1 = tx(100);
    if (Number.isFinite(x0) && Number.isFinite(x1)) {
      scale = Math.abs(x1 - x0) / 100;
    }
  } catch (e) { }
  if (!scale) scale = 1;

  // Determine Visible Model Bounds
  const screenOriginX = tx(0); // Screen X where Model X=0
  const screenOriginY = ty(0); // Screen Y where Model Y=0 (assuming Y=0 is ground)

  // Inverse mapping:
  // screenX = screenOriginX + modelX * scale
  // => modelX = (screenX - screenOriginX) / scale
  const minModelX = (0 - screenOriginX) / scale;
  const maxModelX = (W - screenOriginX) / scale;

  // screenY = screenOriginY - modelY * scale (Y-up convention)
  // => modelY = (screenOriginY - screenY) / scale
  // Screen Top (0) -> High Model Y
  // Screen Bottom (H) -> Low Model Y
  const modelYAtTop = (screenOriginY - 0) / scale;
  const modelYAtBottom = (screenOriginY - H) / scale;

  const minModelY = Math.min(modelYAtTop, modelYAtBottom);
  const maxModelY = Math.max(modelYAtTop, modelYAtBottom);

  // Snap Start to Step
  const startX = Math.floor(minModelX / step) * step;
  const startY = Math.floor(minModelY / step) * step;

  const gridColor = "#e0e0e0";

  // Draw Vertical Lines (iterate X)
  for (let x = startX; x <= maxModelX + step; x += step) {
    const screenX = tx(x + originX); // Apply origin offset if needed. usually originX is 0 in new visualizer
    // Actually originX passed to this function is usually "centerModelX".
    // But wait, our inverse math assumed x relative to 0. 
    // If the caller passes originX != 0, it means the grid is shifted.
    // In multlink/viz, originX is passed as 0. So x is absolute coordinate.

    if (screenX < -1 || screenX > W + 1) continue;

    svg.appendChild(svgEl("line", {
      x1: screenX, y1: 0, x2: screenX, y2: H,
      stroke: gridColor, "stroke-width": Math.abs(x) < step / 10 ? 1.5 : 0.5
    }));

    // Labels (Top/Bottom)
    if (Math.abs(x) > step / 10) {
      const lblTop = svgEl("text", { x: screenX, y: 12, fill: "#999", "font-size": 9, "text-anchor": "middle" });
      lblTop.textContent = Math.round(x);
      svg.appendChild(lblTop);

      const lblBot = svgEl("text", { x: screenX, y: H - 6, fill: "#999", "font-size": 9, "text-anchor": "middle" });
      lblBot.textContent = Math.round(x);
      svg.appendChild(lblBot);
    }
  }

  // Draw Horizontal Lines (iterate Y)
  for (let y = startY; y <= maxModelY + step; y += step) {
    const screenY = ty(y + originY);

    if (screenY < -1 || screenY > H + 1) continue;

    svg.appendChild(svgEl("line", {
      x1: 0, y1: screenY, x2: W, y2: screenY,
      stroke: gridColor, "stroke-width": Math.abs(y) < step / 10 ? 1.5 : 0.5
    }));

    // Labels (Left/Right)
    if (Math.abs(y) > step / 10) {
      const lblLeft = svgEl("text", { x: 6, y: screenY + 3, fill: "#999", "font-size": 9, "text-anchor": "start" });
      lblLeft.textContent = Math.round(y);
      svg.appendChild(lblLeft);

      const lblRight = svgEl("text", { x: W - 6, y: screenY + 3, fill: "#999", "font-size": 9, "text-anchor": "end" });
      lblRight.textContent = Math.round(y);
      svg.appendChild(lblRight);
    }
  }
}

/**
 * Helper to update grid drawing in a standard way
 */
export function drawGridCompatible(svg, W, H, viewRange, centerModelX, centerModelY, tx, ty, gridStep) {
  // Wrapper to handle tx/ty differences
  const safeTx = (val) => {
    try {
      const res = tx(val); // Try number
      if (Number.isFinite(res)) return res;
      return tx({ x: val, y: centerModelY }); // Try object
    } catch (e) {
      return tx({ x: val, y: centerModelY });
    }
  };
  const safeTy = (val) => {
    try {
      const res = ty(val);
      if (Number.isFinite(res)) return res;
      return ty({ x: centerModelX, y: val });
    } catch (e) {
      return ty({ x: centerModelX, y: val });
    }
  };

  drawGrid(svg, W, H, viewRange, centerModelX, centerModelY, safeTx, safeTy, gridStep);
}
