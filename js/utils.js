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
export function drawGrid(svg, W, H, viewRange, originX, originY, tx, ty, gridStep = 50) {
  const step = Number.isFinite(gridStep) && gridStep > 0 ? gridStep : 50;
  const gridColor = "#e0e0e0";

  // 垂直線
  for (let x = -viewRange / 2; x <= viewRange / 2; x += step) {
    // Assume tx is linear: tx(val) = tx(0) + val * scale
    // We can just calculate screenX for model X relative to origin.
    // Or if tx() accepts absolute model coordinates, we need to know the origin in model space.
    // Usually origin in model space is (0,0) or (groundCenterX, groundCenterY).
    // Let's assume tx/ty handle the conversion and we pass model coordinates relative to the "center" of view.
    // But tx/ty implementation differs per module.
    // However, if we assume tx(0) is the center, we might need to adjust.

    // Simpler approach: Calculate model coordinates.
    // In fourbar: tx(p) = W/2 + (p.x - groundCenterX) * scale.
    // So we iterate x offset from groundCenterX.

    // Wait, to be generic, we might just loop through model coordinates around the "focus point".
    // Let's rely on tx/ty to map model coordinates.
    // But we need to know WHAT model coordinates to draw.
    // Usually, [-viewRange/2, viewRange/2] relative to the mechanism center.

    // Let's try to map model x from (center - viewRange/2) to (center + viewRange/2)
    // We don't know the center in model space here easily unless passed.
    // BUT, tx(0) or tx(groundCenterX) is usually the screen center W/2.
    // Let's assume the caller configures tx/ty such that the "interest point" is centered.
    // We just need to find the inverse of tx/ty to know the bounds? No that's hard.

    // Alternative: Pass the model center to this function?
    // In fourbar visualization: groundCenterX is passed.
    // In slider-crank: O is (0,0).
    // In rack-pinion: (0,0) is center.

    // So we can define "centerModelX" and "centerModelY" parameters?
    // Or just let the caller handle the range iteration? No, that duplicates loop code.

    // Let's assume the grid should be centered at 'origin in model space' (0,0) or specific point.
    // The previous implementation in fourbar passed `groundCenterX`.
    // Let's adopt that pattern: `centerModelX`, `centerModelY`.

    // Re-signature: drawGrid(svg, W, H, viewRange, centerModelX, centerModelY, tx, ty)

    const modelX = originX + x; // x is offset from center
    const screenX = tx(modelX);

    // Check bounds (optional, but SVG clips anyway usually)
    if (screenX < 0 || screenX > W) continue;

    svg.appendChild(
      svgEl("line", {
        x1: screenX, y1: 0, x2: screenX, y2: H,
        stroke: gridColor, "stroke-width": modelX === 0 ? 1.5 : 0.5, // Highlight X=0 if possible? No, highlight when modelX matches absolute 0? 
        // In fourbar code: x===0 (loop variable) meant the center line.
        // Let's stick to x===0 being the center line of the VIEW.
      })
    );
  }

  // 水平線
  for (let y = -viewRange / 2; y <= viewRange / 2; y += step) {
    const modelY = originY + y;
    const screenY = ty(modelY); // Note: ty usually handles Y-flip

    if (screenY < 0 || screenY > H) continue;

    svg.appendChild(
      svgEl("line", {
        x1: 0, y1: screenY, x2: W, y2: screenY,
        stroke: gridColor, "stroke-width": y === 0 ? 1.5 : 0.5,
      })
    );
  }

  // Labels
  const labelStep = Math.max(step * 2, 50);
  for (let x = -viewRange / 2; x <= viewRange / 2; x += labelStep) {
    if (x === 0) continue;
    const modelX = originX + x;
    const screenX = tx(modelX);
    const label = svgEl("text", {
      x: screenX, y: H / 2 + 15,
      fill: "#999", "font-size": 9, "text-anchor": "middle"
    });
    label.textContent = `${Math.round(x)}`; // Show offset from center
    svg.appendChild(label);
  }
  for (let y = -viewRange / 2; y <= viewRange / 2; y += labelStep) {
    if (y === 0) continue;
    const modelY = originY + y;
    const screenY = ty(modelY);
    const label = svgEl("text", {
      x: W / 2 + 15, y: screenY + 3,
      fill: "#999", "font-size": 9, "text-anchor": "start"
    });
    label.textContent = `${Math.round(y)}`;
    svg.appendChild(label);
  }
}

/**
 * Helper to update grid drawing in a standard way
 * Requires the tx function to accept a simple number (coord) or {x,y} object depending on implementation.
 * Actually, standard tx/ty in this project seem to take {x,y} point or just number?
 * Fourbar: tx(p) -> p.x
 * SliderCrank: tx(p) -> p.x but definition `const tx = (p) => ...`
 * RackPinion: tx(x) -> x (number)
 * 
 * We need to standardize or handle both.
 * Let's make a wrapper or check type.
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
