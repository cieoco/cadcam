---
description: 如何在現有架構中新增複雜機構 (如 Theo Jansen 仿生獸)
---

# 新增複雜機構開發指南

目前的系統採用「參數化模組」架構，非常適合 **拓撲結構固定、尺寸可變** 的機構設計（例如：四連桿、多連桿、仿生獸腳）。

## 1. 數據結構分析 (Theo Jansen 範例)

泰奧•揚森機構通常由 11 根桿件組成 (另加曲柄與固定架)。
雖然看起來複雜，但它是 **單自由度** 機構。這意味著所有點的位置都可以透過幾何順序由「曲柄角度」推導出來。

### 關鍵參數 (Parameters)
需要在 `mechanism-config.js` 定義約 11+ 個參數 (通常命名為 a, b, c, d, e, f, g, h, i, j, k, l...)。
*   這是我們架構的強項：UI 會自動生成這些滑桿。

## 2. 模組實作步驟

### A. 建立目錄
建立 `js/jansen/` 目錄，包含三個核心檔案：
1.  `solver.js` (數學核心)
2.  `visualization.js` (顯示核心)
3.  `parts.js` (製造核心)

### B. 實作 Solver (數學解算)
複雜機構不需要同時解聯立方程式，通常可以 **「拆解」** 為連續的幾何運算。

```javascript
// js/jansen/solver.js
import { solveTwoCircles } from '../utils/geometry.js'; // 假設我們提取共用函式

export function solveJansen(params) {
    const { theta, a, b, c, ... } = params;
    
    // 1. 固定點 (Frame)
    const O_crank = { x: 0, y: 0 };
    const O_leg = { x: -38, y: -7.8 }; // 範例數據
    
    // 2. 計算曲柄點 (P0)
    const P0 = { 
        x: O_crank.x + m * Math.cos(theta), 
        y: O_crank.y + m * Math.sin(theta) 
    };
    
    // 3. 計算連動點 (P1) - 利用 P0 和 O_leg 的距離約束 (兩圓交點)
    // 這就是我們四連桿 solver 裡面的核心邏輯，可以重用
    const P1 = solveInteraction(O_leg, P0, j, b); 
    
    // 4. 依此類推，計算 P2, P3, P4... 一路推導到腳底
    // ...
    
    return { points: { O_crank, O_leg, P0, P1, ... } };
}
```

### C. 實作 Visualization (視覺化)
利用 `createDriveComponent` 和 `svgEl`。
*   使用 `polyline` 或 `polygon` 繪製那些三角形的連桿片。
*   Jansen 機構很多部分是三角形片狀結構，而非單純直線桿。
*   利用 `drawGridCompatible` 保持底圖一致性。

### D. 實作 Parts Generator (加工圖)
Jansen 機構的特色是它有很多「三角形零件」。
這需要擴充我們的 `parts/generator.js` 邏輯，從目前的「長條形」擴充支援「多邊形/三角形」。

```javascript
// js/jansen/parts.js
export function generateJansenParts(params) {
    return [
        // 定義三角形零件：需要三個孔位的座標 (相對零件中心)
        { id: 'UpperLeg', type: 'triangle', holes: [h1, h2, h3], ... },
        { id: 'LowerLeg', type: 'triangle', holes: [h4, h5, h6], ... },
        // ...
    ];
}
```
*註：我們現有的 G-code 生成器可能需要小幅更新以支援非矩形的「任意多邊形外框」，但這也是一次性的架構升級。*

## 3. 結論
目前的架構 **絕對可行**。
*   **Solver**: 沒問題，只是數學式子比較長。
*   **UI**: 沒問題，自動生成參數表單。
*   **Viz**: 沒問題，SVG 效能足夠繪製多連桿。
*   **G-code**: 需要處理三角形的外型生成邏輯 (目前是針對 Bar/Rect)，這是唯一需要擴充的功能點。
