# 模板化機構系統 - 實作指南

## 🎯 核心概念

**一個模板頁面 + URL 參數 = 所有機構**

```
mechanism.html?type=fourbar      → 四連桿
mechanism.html?type=crankslider  → 曲柄滑塊  
mechanism.html?type=parallelogram → 平行四邊形
```

## 📁 檔案結構

```
linkage/
├── index.html                    # 你的新首頁（已完成）✅
├── mechanism.html                # 統一的機構模擬頁面 ⭐ 新
├── fourbar.html                  # 保留作為獨立版本（可選）
├── js/
│   ├── mechanism-config.js       # 機構配置定義 ⭐ 新
│   ├── mechanism-loader.js       # 動態載入器 ⭐ 新
│   ├── fourbar/
│   │   ├── solver.js            # 四連桿求解器（已有）
│   │   └── animation.js         # 四連桿動畫（已有）
│   ├── slider-crank/            # 曲柄滑塊（未來）
│   │   ├── solver.js
│   │   └── visualization.js
│   └── ...
```

## 🔧 使用方式

### 方案 A：統一入口（推薦）

**優點：** 一個頁面維護所有機構，程式碼複用最大化

1. **更新首頁連結**（index.html 第 672 行）
   ```javascript
   href: "./mechanism.html?type=fourbar"  // 改這裡
   ```

2. **未來新增機構**只需：
   - 在 `mechanism-config.js` 加入配置
   - 建立對應的 solver 模組
   - 首頁連結改為 `mechanism.html?type=新機構`

### 方案 B：保留獨立頁面（相容性）

**優點：** 向後相容，fourbar.html 仍可獨立運作

1. 保留 `fourbar.html` 不變
2. 新機構使用 `mechanism.html?type=xxx`
3. 逐步遷移

## 🚀 快速開始：新增曲柄滑塊

### Step 1: 建立求解器

```javascript
// js/slider-crank/solver.js
export function solveSliderCrank({ crankRadius, rodLength, theta }) {
  const r = crankRadius;
  const l = rodLength;
  const th = (theta * Math.PI) / 180;
  
  // 計算滑塊位置
  const x = r * Math.cos(th) + Math.sqrt(l * l - r * r * Math.sin(th) * Math.sin(th));
  
  return {
    crank: { x: r * Math.cos(th), y: r * Math.sin(th) },
    slider: { x, y: 0 },
    isValid: true
  };
}
```

### Step 2: 在 mechanism-config.js 加入配置

已經在 `mechanism-config.js` 中定義好了！

### Step 3: 更新首頁連結

```javascript
// index.html 第 694 行附近
href: "./mechanism.html?type=crankslider",  // 改這裡
enabled: true  // 改為 true
```

## 📊 實作優先順序

### 立即可做（5分鐘）
1. ✅ 已建立 `mechanism.html`
2. ✅ 已建立 `mechanism-config.js`
3. ✅ 已建立 `mechanism-loader.js`
4. ⏳ 更新首頁連結（見下方）

### 短期（1-2天）
5. 實作曲柄滑塊求解器
6. 實作曲柄滑塊視覺化
7. 測試完整流程

### 中期（1週）
8. 實作零件生成（圓形零件）
9. 實作 DXF / 零件輸出
10. 完善文件

## 🔄 立即行動：更新首頁連結

只需修改 index.html 的一行：

```javascript
// 找到第 672 行
href: "./fourbar.html",

// 改為
href: "./mechanism.html?type=fourbar",
```

這樣：
- ✅ 四連桿立即可用
- ✅ 未來機構只需加配置
- ✅ 程式碼複用最大化

## 💡 關鍵優勢

### 傳統方式（每個機構一個頁面）
```
fourbar.html (500 行)
crankslider.html (500 行)  ← 90% 重複
parallelogram.html (500 行) ← 90% 重複
```

### 模板方式（共用模板）
```
mechanism.html (200 行)
mechanism-config.js (100 行/機構)
各機構 solver.js (50-100 行)
```

**節省：** 每個新機構只需 100-200 行，而非 500 行！

## 🎨 自訂化

每個機構可以有：
- ✅ 不同的參數輸入
- ✅ 不同的零件規格
- ✅ 不同的視覺化
- ✅ 不同的說明文字
- ✅ 相同的 UI 框架和零件輸出流程

## 📝 下一步

1. **測試現有系統**
   ```bash
   # 確認伺服器運行中
   # 開啟 http://localhost:8000/mechanism.html?type=fourbar
   ```

2. **更新首頁連結**
   - 修改 index.html 第 672 行
   - 測試點擊是否正常

3. **開始實作曲柄滑塊**
   - 建立 `js/slider-crank/solver.js`
   - 測試 `mechanism.html?type=crankslider`

---

**結論：** 你的想法完全正確！模板化可以大幅減少開發時間，讓你專注在機構邏輯而非 UI 重複。
