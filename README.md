# 機構設計輔助系統

> 從運動需求到 G-code 的一站式機構設計與製造解決方案

## 🎯 專案概述

這是一個模組化的機構設計輔助系統，提供完整的機構設計工作流程：

1. **機構選擇** - 根據運動需求選擇合適的機構類型
2. **參數化設計** - 輸入設計參數，即時視覺化模擬
3. **驅動配置** - 支援多種驅動方式（馬達/舵機/氣壓）
4. **運動分析** - 計算軌跡、速度、力矩等運動學參數
5. **零件生成** - 自動產生可加工的 2D 零件圖與 G-code

## ✨ 主要特色

- 🎨 **即時視覺化** - 2D 動畫模擬，直觀理解機構運動
- ⚙️ **參數化設計** - 調整參數立即看到效果
- 🔧 **零件自動化** - 一鍵生成所有零件的加工程式
- 📐 **適用 CNC 加工** - 產生 GRBL 相容的 G-code
- 🎯 **模組化架構** - 易於擴展新機構類型
- 📱 **響應式設計** - 支援各種螢幕尺寸

## 🗂️ 專案結構

```
cadcam/
├── index.html                  # 機構選單首頁
├── mechanism.html              # 統一的機構模擬頁面
├── mechanism-template.html     # 機構頁面範本
├── app.js                      # 舊版程式碼（備份）
├── README.md                   # 專案說明文件
├── ROADMAP.md                  # 開發路線圖
├── TEMPLATE-GUIDE.md           # 範本使用指南
├── css/
│   └── styles.css              # 全域樣式表
└── js/
    ├── main.js                 # 主程式入口
    ├── utils.js                # 通用工具函數
    ├── config.js               # 配置管理（舊版）
    ├── mechanism-config.js     # 機構配置系統（新版）
    ├── mechanism-loader.js     # 動態機構載入器
    ├── motor-data.js           # 馬達/驅動器資料庫
    ├── fourbar/                # 四連桿機構模組
    │   ├── solver.js           # 運動學求解器
    │   └── animation.js        # 動畫控制器
    ├── slider-crank/           # 曲柄滑塊機構模組
    │   ├── solver.js           # 運動學求解器
    │   ├── parts.js            # 零件生成器
    │   └── visualization.js    # 視覺化渲染
    ├── rack-pinion/            # 齒輪齒條機構模組
    │   ├── solver.js           # 運動學求解器
    │   ├── parts.js            # 零件生成器
    │   └── visualization.js    # 視覺化渲染
    ├── multilink/              # 多連桿機構模組
    │   ├── solver.js           # 運動學求解器
    │   └── visualization.js    # 視覺化渲染
    ├── bardrawer/              # 棒料牽引機構模組
    │   ├── solver.js           # 運動學求解器
    │   ├── parts.js            # 零件生成器
    │   └── visualization.js    # 視覺化渲染
    ├── jansen/                 # Jansen 步行機構模組（開發中）
    │   ├── solver.js           # 運動學求解器
    │   ├── topology.js         # 拓樸定義
    │   ├── parts.js            # 零件生成器
    │   └── visualization.js    # 視覺化渲染
    ├── parts/                  # 零件模組
    │   ├── generator.js        # 零件生成器
    │   └── renderer.js         # 零件渲染器
    ├── gcode/                  # G-code 模組
    │   ├── operations.js       # 基本操作
    │   └── generator.js        # G-code 生成器
    ├── ui/                     # UI 模組
    │   ├── controls.js         # UI 控制器
    │   └── visualization.js    # 視覺化渲染
    └── utils/                  # 工具模組
        ├── dxf-generator.js    # DXF 檔案生成器
        └── gear-geometry.js    # 齒輪幾何計算
```

## 🔧 支援的機構類型

### ✅ 已實作機構

#### 1. 四連桿機構（Four-Bar Linkage）
- **應用**：擺動輸出、軌跡控制、機械手臂關節
- **特點**：可產生複雜的連桿點軌跡
- **輸出**：角度擺動、點軌跡

#### 2. 曲柄滑塊機構（Crank-Slider）
- **應用**：直線往復運動、壓縮機、引擎
- **特點**：旋轉轉換為直線運動
- **輸出**：直線往復位移

#### 3. 齒輪齒條機構（Rack and Pinion）
- **應用**：精確直線傳動、CNC 軸、轉向系統
- **特點**：精確的旋轉-直線轉換
- **輸出**：高精度直線運動

#### 4. 多連桿機構（Multi-Link）
- **應用**：複雜軌跡生成、機器人腿部
- **特點**：多自由度、複雜運動模式
- **輸出**：自訂軌跡與姿態

#### 5. 棒料牽引機構（Bar Drawer）
- **應用**：棒料進給、材料推送系統
- **特點**：穩定的推拉運動
- **輸出**：可控進給距離

### 📋 規劃中
- **Jansen 步行機構** - 仿生六足步行
- **凸輪機構** - 精確軌跡控制
- **Toggle 夾爪機構** - 力放大、自鎖定
- **平行四邊形機構** - 平行平移、姿態保持

## 📚 核心模組說明

### 系統架構

#### `mechanism-config.js` - 機構配置系統
- 定義所有機構的參數、特性和行為
- 統一的機構註冊介面
- 參數驗證與預設值管理

#### `mechanism-loader.js` - 動態載入器
- 根據 URL 參數動態載入對應機構
- 處理機構初始化與事件綁定
- 統一的 UI 生成邏輯

#### `motor-data.js` - 驅動器資料庫
- 馬達、舵機、氣壓缸等驅動元件規格
- 扭矩、速度、尺寸等參數資料
- 驅動器選型建議

### 通用模組

#### `utils.js` - 工具函數庫
- DOM 操作 (`$`, `$$`)
- 數學函數（角度轉換、數值格式化）
- SVG 元素建立
- 檔案下載功能
- 日誌記錄

#### `parts/` - 零件生成系統
- **generator.js** - 零件幾何生成
  - 桿件、連接件、支架等
  - 自動佈局與間距
  - 孔位計算
- **renderer.js** - SVG 渲染
  - 零件圖形繪製
  - 尺寸標註
  - 軌跡顯示

#### `gcode/` - G-code 生成系統
- **operations.js** - 基本加工操作
  - 鑽孔 (`drillOps`)
  - 矩形切割 (`profileRectOps`)
  - 圓形切割 (`profileCircleOps`)
  - 槽加工 (`slotOps`)
- **generator.js** - 程式整合
  - 多層切割控制
  - 刀具補償
  - 加工順序優化
  - G-code 輸出

#### `utils/` - 進階工具
- **gear-geometry.js** - 齒輪幾何
  - 漸開線齒形計算
  - 齒輪嚙合分析
  - 中心距計算
- **dxf-generator.js** - DXF 輸出
  - CAD 檔案格式轉換
  - 圖層管理

### 機構專用模組

每個機構都有獨立的模組資料夾，包含：

#### `solver.js` - 運動學求解器
- 位置、速度、加速度計算
- 機構組態判斷
- 軌跡掃描分析
- 死點檢測

#### `visualization.js` - 視覺化
- SVG 機構圖繪製
- 動畫更新邏輯
- 軌跡顯示
- 參數標註

#### `parts.js` - 專用零件生成
- 機構特定的零件設計
- 客製化孔位與外形
- 組裝介面設計

## 🚀 快速開始

### 1. 環境需求

- 現代瀏覽器（Chrome、Edge、Firefox 最新版）
- HTTP 伺服器（不可直接開啟 HTML 檔案，因使用 ES6 模組）

### 2. 啟動專案

**方法 A：Python HTTP 伺服器**
```bash
# 進入專案目錄
cd cadcam

# 啟動伺服器（Python 3）
python -m http.server 8000

# 開啟瀏覽器
# http://localhost:8000
```

**方法 B：Node.js HTTP 伺服器**
```bash
# 安裝 http-server（僅需一次）
npm install -g http-server

# 啟動伺服器
http-server -p 8000

# 開啟瀏覽器
# http://localhost:8000
```

**方法 C：VS Code Live Server**
1. 安裝 "Live Server" 擴充套件
2. 右鍵點擊 `index.html`
3. 選擇 "Open with Live Server"

### 3. 使用流程

1. **選擇機構** - 在首頁選擇適合的機構類型
2. **輸入參數** - 設定桿長、孔徑、材料等參數
3. **即時預覽** - 查看機構運動模擬
4. **播放動畫** - 觀察完整運動週期
5. **生成零件** - 點擊生成 G-code 按鈕
6. **下載檔案** - 取得可用於 CNC 加工的程式檔

## 🛠️ 開發指南

### 新增機構類型

1. **建立機構資料夾**
   ```
   js/your-mechanism/
   ├── solver.js           # 運動學求解
   ├── visualization.js    # 視覺化
   └── parts.js           # 零件生成（選用）
   ```

2. **在 `mechanism-config.js` 註冊機構**
   ```javascript
   export const MECHANISMS = {
     // ... 其他機構
     yourMechanism: {
       id: 'yourMechanism',
       name: '你的機構名稱',
       icon: '🔧',
       description: '機構說明',
       parameters: [ /* 參數定義 */ ],
       partSpecs: [ /* 零件規格 */ ],
       driveOptions: [ /* 驅動選項 */ ]
     }
   };
   ```

3. **實作求解器**
   ```javascript
   // js/your-mechanism/solver.js
   export function solve(params, theta) {
     // 運動學計算
     return { /* 位置、速度等 */ };
   }
   ```

4. **實作視覺化**
   ```javascript
   // js/your-mechanism/visualization.js
   export function render(svg, state, params) {
     // SVG 繪製邏輯
   }
   ```

### 新增零件類型

在 `parts/generator.js` 新增生成函數：
```javascript
export function generateCustomPart(params) {
  return {
    holes: [ /* 孔位陣列 */ ],
    outline: [ /* 外形路徑 */ ],
    label: '零件名稱'
  };
}
```

在 `gcode/operations.js` 新增對應加工操作：
```javascript
export function customProfileOps(params) {
  // G-code 路徑計算
  return [ /* 座標點陣列 */ ];
}
```

### 新增驅動器規格

在 `motor-data.js` 新增驅動器資料：
```javascript
export const DRIVE_COMPONENTS = {
  motors: {
    yourMotor: {
      name: '馬達名稱',
      torque: 10, // N⋅m
      speed: 3000, // RPM
      // ... 其他規格
    }
  }
};
```

## 💡 技術亮點

✅ **模組化架構** - 每個功能獨立，易於維護和測試  
✅ **動態載入** - 統一的機構頁面，按需載入模組  
✅ **可擴展性** - 新增機構不影響現有程式碼  
✅ **參數驅動** - 配置化設計，減少重複程式碼  
✅ **即時計算** - 高效能的運動學求解器  
✅ **視覺化** - 清晰的 2D 動畫與軌跡顯示  
✅ **實用輸出** - 產生可直接用於 CNC 的 G-code

## 📖 相關文件

- **[ROADMAP.md](ROADMAP.md)** - 開發路線圖與未來規劃
- **[TEMPLATE-GUIDE.md](TEMPLATE-GUIDE.md)** - 機構範本使用指南
- **[mechanism-config.js](js/mechanism-config.js)** - 機構配置說明

## 🎯 適用場景

- **教育學習** - 理解機構運動學原理
- **快速原型** - 驗證機構設計概念
- **DIY 製作** - 使用 CNC 製作實體機構
- **機器人開發** - 設計機械結構
- **自動化設計** - 簡單機械裝置設計

## ⚙️ 技術堆疊

- **前端框架**：原生 JavaScript（ES6+ 模組）
- **視覺化**：SVG + Canvas
- **模組系統**：ES6 Import/Export
- **樣式**：CSS3（響應式設計）
- **相容性**：現代瀏覽器（Chrome、Edge、Firefox）

## 📝 版本歷史

### v3.0 - 2025-12-26
- ✨ 新增多種機構類型（曲柄滑塊、齒輪齒條、多連桿、棒料牽引）
- 🔧 統一機構頁面 (`mechanism.html`)
- 📦 機構配置系統重構 (`mechanism-config.js`)
- 🎨 改進 UI 與視覺化
- 📚 更新文件與範本指南

### v2.0 - 2025-12-25
- 🏗️ 完全重構為模組化架構
- 📁 分離 CSS 樣式
- 🔄 改善程式碼組織
- 📋 新增機構選單首頁

### v1.0 - 初始版本
- 🎯 四連桿機構基本功能
- 📐 2D 模擬與動畫
- 🔧 G-code 生成
- 💾 單一檔案實作 (`app.js`)

## 🤝 貢獻指南

歡迎提交 Issue 和 Pull Request！

### 開發流程
1. Fork 本專案
2. 建立功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交變更 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 開啟 Pull Request

### 程式碼規範
- 使用 ES6+ 語法
- 遵循模組化原則
- 添加適當的註解
- 保持程式碼可讀性

## 📄 授權

本專案採用 MIT 授權條款 - 詳見 LICENSE 檔案

## 📧 聯絡方式

如有問題或建議，歡迎透過 GitHub Issues 聯繫。

---

**⭐ 如果這個專案對您有幫助，請給個星星支持！**
