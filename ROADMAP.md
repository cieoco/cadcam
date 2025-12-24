# 機構設計輔助系統 - 開發計劃

## 📅 開發路線圖

### Phase 1: 基礎架構 ✅ **已完成**
- [x] 模組化程式碼架構
- [x] 機構選單首頁
- [x] 四連桿機構完整實作
  - [x] 機構求解器
  - [x] 2D 視覺化
  - [x] 動畫控制
  - [x] 零件生成
  - [x] G-code 輸出

### Phase 2: 曲柄滑塊機構 🔄 **下一步**
**目標：** 實現旋轉→直線往復運動的機構

#### 2.1 求解器開發
- [ ] 建立 `js/slider-crank/solver.js`
  - [ ] 實作曲柄滑塊運動學方程式
  - [ ] 計算滑塊位置、速度、加速度
  - [ ] 死點檢測與警告
  - [ ] 行程計算

#### 2.2 視覺化
- [ ] 建立 `js/slider-crank/visualization.js`
  - [ ] 繪製曲柄、連桿、滑塊
  - [ ] 顯示滑塊軌跡
  - [ ] 速度/加速度曲線圖
  - [ ] 動畫播放

#### 2.3 零件設計
- [ ] 曲柄零件（圓盤 + 偏心孔）
- [ ] 連桿零件（直桿 + 兩端孔）
- [ ] 滑塊零件（矩形 + 導軌槽）
- [ ] 導軌零件（長條 + 固定孔）

#### 2.4 G-code 生成
- [ ] 圓形外形切割（曲柄）
- [ ] 矩形外形切割（滑塊、導軌）
- [ ] 槽加工（滑塊導軌槽）

#### 2.5 UI 頁面
- [ ] 建立 `slider-crank.html`
- [ ] 參數輸入介面
- [ ] 模擬顯示區域
- [ ] G-code 下載功能

### Phase 3: 平行四邊形機構
**目標：** 保持平台水平的平移機構

#### 功能需求
- [ ] 平行四邊形運動學求解
- [ ] 平台姿態保持驗證
- [ ] 升降行程計算
- [ ] 零件生成（4 根等長連桿）

### Phase 4: Toggle 夾爪機構
**目標：** 死點鎖定的強力夾持

#### 功能需求
- [ ] Toggle 機構運動學
- [ ] 力放大比計算
- [ ] 死點位置分析
- [ ] 夾持力計算
- [ ] 夾爪零件設計

### Phase 5: 進階功能
- [ ] 力學分析模組
  - [ ] 靜力分析
  - [ ] 力矩計算
  - [ ] 馬達選型建議
- [ ] 材料資料庫
  - [ ] 木材、壓克力、鋁材參數
  - [ ] 加工參數建議
- [ ] 組裝指南生成
  - [ ] 零件清單
  - [ ] 組裝步驟圖
  - [ ] BOM 表

---

## 🛠️ 曲柄滑塊機構實作細節

### 運動學方程式

```
已知：
- r: 曲柄半徑
- l: 連桿長度
- θ: 曲柄角度

求解：
- x: 滑塊位置
- v: 滑塊速度
- a: 滑塊加速度

位置：x = r·cos(θ) + √(l² - r²·sin²(θ))
速度：v = -r·ω·sin(θ) - (r²·ω·sin(θ)·cos(θ)) / √(l² - r²·sin²(θ))
加速度：a = ... (二階導數)
```

### 零件設計規格

#### 1. 曲柄（Crank）
- 外形：圓盤
- 直徑：根據曲柄半徑 r 計算
- 中心孔：馬達軸孔
- 偏心孔：連桿連接孔（距中心 r）

#### 2. 連桿（Connecting Rod）
- 外形：直桿
- 長度：l
- 兩端孔：連接曲柄和滑塊

#### 3. 滑塊（Slider）
- 外形：矩形
- 導軌槽：T型槽或燕尾槽
- 連桿連接孔

#### 4. 導軌（Guide Rail）
- 外形：長條
- 長度：滑塊行程 + 餘量
- 固定孔：安裝到底座

### UI 參數設定

```javascript
{
  // 機構參數
  crankRadius: 30,        // 曲柄半徑 (mm)
  rodLength: 100,         // 連桿長度 (mm)
  
  // 驅動參數
  motorType: "motor360",  // 馬達類型
  rpm: 60,                // 轉速
  
  // 零件參數
  crankDiameter: 80,      // 曲柄盤直徑
  rodWidth: 15,           // 連桿寬度
  sliderWidth: 40,        // 滑塊寬度
  sliderHeight: 30,       // 滑塊高度
  railLength: 200,        // 導軌長度
  
  // 加工參數
  // ... (同四連桿)
}
```

### 檔案結構

```
js/
├── slider-crank/
│   ├── solver.js           # 運動學求解
│   ├── animation.js        # 動畫控制
│   ├── visualization.js    # 2D 渲染
│   └── parts-generator.js  # 零件生成
└── ...

slider-crank.html           # 主頁面
```

---

## 📝 開發檢查清單

### 新增機構的標準流程

每個新機構都應該包含：

1. **求解器** (`solver.js`)
   - [ ] 運動學方程式實作
   - [ ] 參數驗證
   - [ ] 邊界條件檢查
   - [ ] 單元測試

2. **視覺化** (`visualization.js`)
   - [ ] SVG 渲染
   - [ ] 動畫支援
   - [ ] 軌跡顯示
   - [ ] 參數標註

3. **零件生成** (`parts-generator.js`)
   - [ ] 零件幾何定義
   - [ ] 排版演算法
   - [ ] 尺寸驗證

4. **G-code 生成**
   - [ ] 外形切割路徑
   - [ ] 孔加工
   - [ ] 特殊加工（槽、倒角等）

5. **UI 頁面**
   - [ ] 參數輸入表單
   - [ ] 模擬顯示區
   - [ ] 結果輸出區
   - [ ] 返回首頁連結

6. **文件**
   - [ ] 使用說明
   - [ ] 參數範圍建議
   - [ ] 應用案例

---

## 🎯 優先順序建議

### 立即開始（本週）
1. **曲柄滑塊求解器** - 核心運動學
2. **曲柄滑塊視覺化** - 基本 2D 顯示

### 短期目標（2週內）
3. **曲柄滑塊零件生成** - 4種零件
4. **曲柄滑塊 G-code** - 圓形切割實作
5. **曲柄滑塊頁面** - 完整 UI

### 中期目標（1個月內）
6. **平行四邊形機構** - 完整實作
7. **Toggle 夾爪機構** - 完整實作

### 長期目標（3個月內）
8. **力學分析模組**
9. **材料資料庫**
10. **組裝指南生成**

---

## 💡 技術挑戰與解決方案

### 挑戰 1: 圓形零件的 G-code 生成
**問題：** 目前只有矩形外形切割  
**解決：** 在 `gcode/operations.js` 中新增 `profileCircleOps()`

### 挑戰 2: 槽加工路徑
**問題：** 滑塊需要 T型槽或燕尾槽  
**解決：** 實作 `slotMillingOps()` 函數

### 挑戰 3: 複雜零件排版
**問題：** 圓形零件排版較複雜  
**解決：** 使用 2D bin packing 演算法

### 挑戰 4: 動態模擬性能
**問題：** 複雜機構動畫可能卡頓  
**解決：** 使用 requestAnimationFrame + 節流

---

## 📚 參考資料

### 運動學
- [Four-Bar Linkage - Wikipedia](https://en.wikipedia.org/wiki/Four-bar_linkage)
- [Slider-Crank Mechanism - Wikipedia](https://en.wikipedia.org/wiki/Slider-crank_linkage)

### G-code
- [GRBL G-code Reference](https://github.com/gnea/grbl/wiki/Grbl-v1.1-Commands)
- [G-code Basics](https://www.cnccookbook.com/g-code-tutorial-g-code-programming-basics/)

### 機構設計
- [Mechanisms and Mechanical Devices Sourcebook](https://www.amazon.com/Mechanisms-Mechanical-Devices-Sourcebook-Fifth/dp/0071704426)

---

**最後更新：** 2025-12-25  
**版本：** v2.0 (Modular Architecture)
