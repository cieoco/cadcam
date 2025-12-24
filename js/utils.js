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
  a.remove();
  URL.revokeObjectURL(url);
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
