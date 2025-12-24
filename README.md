# 機構設計輔助系統（Mechanism Design Assistant）

> 從運動需求到 G-code 的一站式機構設計解決方案

## 🎯 專案目標

這是一個模組化的機構設計輔助系統，幫助使用者：
1. **選擇合適的機構** - 根據運動需求（擺動/直線/往復/平移）選擇最佳機構
2. **參數化設計** - 輸入尺寸參數，即時 2D 模擬
3. **驅動方式選擇** - 支援馬達/舵機/氣壓等不同驅動方式
4. **力學計算** - 計算力矩、速度、行程等參數
5. **自動生成零件** - 一鍵生成桿件 G-code，可直接用於 CNC 加工

## 📐 設計流程

```
運動需求 → 選擇機構 → 驅動方式 → 參數計算 → 生成加工
   ↓          ↓          ↓          ↓          ↓
擺動/直線   四連桿    馬達/舵機   力矩/速度   2D模擬+G-code
```

## 🗂️ 專案結構

```
cadcam/
├── index.html              # 機構選單首頁（新）
├── fourbar.html            # 四連桿機構頁面
├── app.js                  # 舊版程式碼（保留作為備份）
├── css/
│   └── styles.css          # 樣式表
└── js/
    ├── main.js             # 主程式入口
    ├── utils.js            # 通用工具函數
    ├── config.js           # 配置管理
    ├── fourbar/            # 四連桿機構模組
    │   ├── solver.js       # 機構求解器
    │   └── animation.js    # 動畫控制器
    ├── parts/              # 零件模組
    │   ├── generator.js    # 零件生成器
    │   └── renderer.js     # 零件渲染器
    ├── gcode/              # G-code 模組
    │   ├── operations.js   # 基本操作
    │   └── generator.js    # G-code 生成器
    └── ui/                 # UI 模組
        ├── controls.js     # UI 控制器
        └── visualization.js # 視覺化渲染
```

    └── ui/                 # UI 模組
        ├── controls.js     # UI 控制器
        └── visualization.js # 視覺化渲染
```

## 🔧 支援的機構類型

### ✅ 已完成
- **四連桿機構** (Four-Bar Linkage)
  - 擺動輸出、軌跡控制
  - 支援馬達/舵機驅動
  - 適用：機械手臂關節、擺動夾爪、往復運動

### 📋 規劃中
- **曲柄滑塊機構** (Slider-Crank) - 直線往復運動
- **平行四邊形機構** (Parallelogram) - 平行平移、姿態保持
- **Toggle 夾爪機構** (Toggle Gripper) - 力放大、自鎖定
- **凸輪機構** (Cam Mechanism) - 精確軌跡控制
- **齒輪齒條機構** (Rack and Pinion) - 精確直線傳動

## 模組說明

### 核心模組

#### `js/utils.js` - 通用工具
- DOM 選擇器 (`$`)
- 數學函數（角度/弧度轉換、數值限制、格式化）
- SVG 元素建立
- 檔案下載
- 日誌記錄

#### `js/config.js` - 配置管理
- `readInputs()` - 從 UI 讀取所有參數
- `validateConfig()` - 驗證參數有效性
- `readSweepParams()` - 讀取掃描參數
- `readViewParams()` - 讀取視圖參數

### 四連桿機構模組 (`fourbar/`)

#### `solver.js` - 機構求解器
- `solveFourBar()` - 求解四連桿機構位置
- `sweepTheta()` - 掃描角度範圍分析
- `calculateTrajectoryStats()` - 計算軌跡統計資訊

#### `animation.js` - 動畫控制器
- `startAnimation()` - 開始動畫
- `pauseAnimation()` - 暫停動畫
- `stopAnimation()` - 停止動畫
- `setupMotorTypeHandler()` - 設定馬達類型處理

### 零件模組 (`parts/`)

#### `generator.js` - 零件生成器
- `generateParts()` - 生成四根桿件的幾何形狀
- `validatePartsLayout()` - 驗證零件排版
- `calculatePartsArea()` - 計算零件佔用面積

#### `renderer.js` - 零件渲染器
- `renderPartsLayout()` - 渲染零件排版 SVG
- `renderTrajectory()` - 渲染軌跡曲線 SVG

### G-code 模組 (`gcode/`)

#### `operations.js` - 基本操作
- `gcodeHeader()` - G-code 檔頭
- `gcodeFooter()` - G-code 檔尾
- `drillOps()` - 鑽孔操作
- `profileRectOps()` - 矩形外形切割

#### `generator.js` - G-code 生成器
- `buildPartGcode()` - 為單個零件生成 G-code
- `buildAllGcodes()` - 為所有零件生成 G-code
- `generateMachiningInfo()` - 生成加工摘要資訊

### UI 模組 (`ui/`)

#### `controls.js` - UI 控制器
- `updatePreview()` - 更新預覽
- `generateGcodes()` - 生成 G-code
- `performSweepAnalysis()` - 執行掃描分析
- `setupUIHandlers()` - 設定所有 UI 事件處理器

#### `visualization.js` - 視覺化渲染
- `renderFourbar()` - 渲染四連桿機構 SVG
- 包含格線、軌跡、連桿、角度標示等

## 使用方式

### 開發環境
由於使用 ES6 模組，需要透過 HTTP 伺服器執行（不能直接開啟 HTML 檔案）。

**方法 1：使用 Python**
```bash
# Python 3
python -m http.server 8000

# 然後在瀏覽器開啟
# http://localhost:8000
```

**方法 2：使用 Node.js**
```bash
npx http-server -p 8000
```

**方法 3：使用 VS Code**
安裝 "Live Server" 擴充套件，右鍵點擊 `index.html` → "Open with Live Server"

### 生產環境
直接部署所有檔案到 Web 伺服器即可。

## 擴展指南

### 新增桿件外形類型

1. 在 `js/parts/generator.js` 中新增生成函數
2. 在 `js/gcode/operations.js` 中新增對應的切割操作
3. 在 UI 中新增選項讓使用者選擇外形類型

範例：新增圓角矩形
```javascript
// 在 parts/generator.js 中
export function generateRoundedRectPart(params) {
  // 實作圓角矩形生成邏輯
}

// 在 gcode/operations.js 中
export function profileRoundedRectOps(params) {
  // 實作圓角矩形切割路徑
}
```

### 新增其他機構類型

1. 在 `js/fourbar/` 下建立新的求解器（例如 `slider-crank-solver.js`）
2. 實作對應的視覺化渲染
3. 在 UI 中新增機構類型選擇

### 新增加工功能

1. 在 `js/gcode/operations.js` 中新增操作函數
2. 在 `js/gcode/generator.js` 中整合到生成流程
3. 在 UI 中新增對應的參數輸入

## 優點

✅ **模組化**：每個功能獨立，易於維護和測試  
✅ **可擴展**：新增功能不影響現有程式碼  
✅ **可讀性**：程式碼結構清晰，易於理解  
✅ **可重用**：模組可在其他專案中重用  
✅ **易於除錯**：問題定位更容易  

## 注意事項

- 舊版 `app.js` 已保留作為備份，可隨時回退
- 所有模組使用 ES6 語法，需要現代瀏覽器支援
- 建議使用 Chrome/Edge/Firefox 最新版本

## 版本歷史

- **v2.0 (Modular)** - 2025-12-25
  - 完全重構為模組化架構
  - 分離 CSS 樣式
  - 改善程式碼組織

- **v1.0 (MVP)** - 之前版本
  - 單一檔案實作
  - 所有功能在 app.js 中
