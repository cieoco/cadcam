/**
 * blocks / view
 *
 * 視圖投影層：世界座標 (mm) <-> 畫面座標 (px)，以及桿件的「冰棒棍」外形路徑。
 * 純計算（barHullPath 不碰 DOM；worldFromEvent 只讀傳入的 svg 做 CTM 反轉）。
 *
 * 之後要做的縮放 / 平移會落在這裡——把 SCALE / OX / OY 變成可變狀態即可，
 * 其餘模組透過這支的介面取用，不必知道投影細節。
 */

export const W = 900;
export const H = 560;
export const SCALE = 1.4;             // 1mm = 1.4px（固定，避免播放時畫面跳動）
export const HULL_R_WORLD = 9;        // 冰棒棍外形半徑（世界 mm）
export const SNAP_WORLD = 18 / SCALE; // 吸附門檻（世界座標 mm）

const OX = W / 2, OY = H / 2;         // 世界原點對到畫布中心
export const TX = x => OX + x * SCALE;
export const TY = y => OY - y * SCALE; // y 向上為正

// 由指標事件反推世界座標（需要 svg 元素做 CTM 反轉）
export function worldFromEvent(svg, e) {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
  return { x: (p.x - OX) / SCALE, y: (OY - p.y) / SCALE };
}

// 把一根桿（兩端點 a、b）算成「冰棒棍」外形：兩端圓 + 外切線 + 半圓封口。
// 切線/封弧的幾何沿用 mechanism 零件外形（js/parts/renderer.js 的 computeTangentHullPathQuiet），
// 確保半圓封口方向正確。座標用 TX/TY 轉到畫面，弧半徑乘 SCALE。
export function barHullPath(a, b) {
  const r = HULL_R_WORLD;
  const getTangent = (p, q) => {
    const dx = q.x - p.x, dy = q.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return null;
    const nx = dy / dist, ny = -dx / dist; // 右側法線（CCW 走訪的外側）
    return {
      start: { x: p.x + nx * r, y: p.y + ny * r },
      end: { x: q.x + nx * r, y: q.y + ny * r }
    };
  };
  const t1 = getTangent(a, b), t2 = getTangent(b, a);
  if (!t1 || !t2) return '';
  const R = r * SCALE;
  let d = `M ${TX(t1.start.x)} ${TY(t1.start.y)} `;
  d += `L ${TX(t1.end.x)} ${TY(t1.end.y)} `;
  d += `A ${R} ${R} 0 1 0 ${TX(t2.start.x)} ${TY(t2.start.y)} `;
  d += `L ${TX(t2.end.x)} ${TY(t2.end.y)} `;
  d += `A ${R} ${R} 0 1 0 ${TX(t1.start.x)} ${TY(t1.start.y)} Z`;
  return d;
}
