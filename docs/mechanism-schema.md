# mechanism.json Schema

`linkage` 匯出給 `arm` 的第一版交換格式：

- 檔名建議：`<mechanism-name>.mechanism.json`
- schema: `com.tool.linkage.mechanism@1`
- 單位：`mm`

## 目的

這份格式不是 `URDF`，也不是 `arm` 的最終 `assembly.json`。

它的角色是：

- 保存閉環機構拓樸
- 保存目前驅動參數與零件規格
- 提供 `arm` 匯入時可用的拓樸、求解與 marker 提示

## 結構

```json
{
  "schema": "com.tool.linkage.mechanism@1",
  "source": {
    "tool": "linkage",
    "mechanismId": "multilink",
    "mechanismName": "多連桿機構"
  },
  "units": "mm",
  "mechanism": {
    "id": "multilink",
    "name": "多連桿機構",
    "description": ""
  },
  "parameters": {
    "motion": {},
    "partSpec": {},
    "driver": {
      "thetaDeg": 45,
      "motorType": "servo",
      "motorRotationDeg": 0
    }
  },
  "topology": {
    "tracePoint": "P1",
    "steps": [],
    "visualization": {},
    "parts": [],
    "wizardData": []
  },
  "generatedParts": [],
  "solution": {
    "isValid": true,
    "points": {},
    "inputThetaDeg": 45,
    "errorReason": null
  },
  "armHints": {
    "intendedConsumer": "arm",
    "topologyType": "multilink",
    "markerHints": []
  }
}
```

## 欄位說明

- `parameters.motion`
  - 目前機構參數，包含 `theta` 與動態參數。
- `parameters.partSpec`
  - 目前零件規格，例如桿寬、孔徑、工作區。
- `topology.steps`
  - 機構求解步驟，適合 solver 重建。
- `topology.parts`
  - 拓樸層零件摘要，不是最終 CAD 零件。
- `topology.wizardData`
  - Wizard 原始資料，保留完整組裝語義。
- `generatedParts`
  - 目前由 `linkage` 推導出的 2D 零件資料。
- `solution.points`
  - 當前求解出的點位，可供 `arm` 初始姿態參考。
- `armHints.markerHints`
  - 給 `arm` 匯入時的關節提示，例如 bar 的近端 / 遠端 joint。

## 設計原則

- `linkage` 管閉環拓樸
- `arm` 管 3D 組裝與顯示
- `mechanism.json` 是兩者之間的中介格式

後續如果 `arm` 需要，會再把這份資料轉成：

- `assembly.json`
- `URDF`
