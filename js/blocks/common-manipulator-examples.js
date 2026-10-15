/** FTC 末端用途的板件化概念。尺寸為本專案示範值，並非 REV 原廠圖。 */
const point = (id, type, x, y, extra = {}) => ({ id, type, x, y, ...extra });
const link = (id, p1, p2, lenParam, extra = {}) => ({
  type: 'bar', id, p1, p2, lenParam, fixedLen: true, snapLength: false,
  isInput: false, color: '#3498db', ...extra
});
const drive = { isInput: true, physicalMotor: '1', motorType: 'mg995', color: '#e67e22' };
export const COMMON_MANIPULATOR_EXAMPLES = [
  {
    id: 'single-servo-claw', title: '單側活動夾爪',
    note: '紅色夾指轉動、藍色夾指固定。點夾指改長度，點馬達改開合角度；不是雙側連動或平行夾爪。',
    adjustmentNote: '可調：活動夾指長度、舵機起終角。只驗證幾何運動；接觸、夾持力、支承與加工尚未驗證。',
    lesson: { group: 'manipulator', level: '實戰', use: '以一根固定夾指與一根旋轉夾指取放物件，先比較開口與占用空間。',
      learn: '單側旋轉會同時改變夾指方向與接觸位置。',
      try: ['點紅色夾指，把長度由 80 改為 96 mm', '點馬達，把終角 30° 改為 45°', '存檔，或由加入模組放入既有作品'],
      predict: '加長活動夾指後，張開時會更占空間嗎？', measure: '用工作點比較兩端位置；中心點間距不等於實際淨開口。',
      explain: '動畫不計接觸或摩擦，不能證明物件已被夾住。' },
    snapshot: { kind: 'blocks', v: 1, counter: 3, projectName: '單側活動夾爪', tracePoint: 'ClawTip',
      comps: [
        link('ClawFrame', point('ClawMount', 'fixed', 40, 0), point('ClawAxis', 'fixed', 0, 0), 'CLAW_BASE', { color: '#95a5a6', frameSeparate: true }),
        link('FixedFinger', point('ClawMount', 'fixed', 40, 0), point('FixedTip', 'fixed', 40, 80), 'CLAW_FIXED', { frameSeparate: true }),
        link('MovingFinger', point('ClawAxis', 'fixed', 0, 0, { physicalMotor: '1' }), point('ClawTip', 'floating', 0, 80), 'CLAW_LENGTH',
          { ...drive, phaseOffset: 90, servoStart: -15, servoEnd: 30 })
      ], params: { theta: 0, CLAW_BASE: 40, CLAW_FIXED: 80, CLAW_LENGTH: 80 } }
  },
  {
    id: 'single-axis-wrist', title: '單軸手腕：末端翻轉',
    note: '馬達帶動紅色工具臂翻轉。點工具臂改長度、點馬達改起終角；加入模組後可把夾爪接到末端。',
    adjustmentNote: '可調：工具臂長、起終角。輸出端跟隨工具臂旋轉，不保持水平；軸承、五金、扭力與干涉需另核對。',
    lesson: { group: 'manipulator', level: '實戰', use: '放在升降機構末端調整工具朝向，用一個旋轉自由度探索收納與放置姿態。',
      learn: '手腕改變工具朝向，與保持姿態的平行四連桿不同。',
      try: ['點紅色工具臂，把長度由 64 改為 96 mm', '點馬達，把終角 60° 改為 90°', '由加入模組放入作品，再把其他模組安裝到工具端'],
      predict: '工具臂變長後，同樣的轉角會掃過更大的空間嗎？', measure: '比較工作點軌跡半徑與起終位置。',
      explain: '示範使用既有 MG995 模型；不是原廠手腕的尺寸、減速比或承載規格。' },
    snapshot: { kind: 'blocks', v: 1, counter: 2, projectName: '單軸手腕', tracePoint: 'WristTip',
      comps: [
        link('WristFrame', point('WristMount', 'fixed', -48, 0), point('WristAxis', 'fixed', 0, 0), 'WRIST_BASE', { color: '#95a5a6', frameSeparate: true }),
        link('WristArm', point('WristAxis', 'fixed', 0, 0, { physicalMotor: '1' }), point('WristTip', 'floating', 64, 0), 'WRIST_LENGTH',
          { ...drive, phaseOffset: 0, servoStart: -45, servoEnd: 60 })
      ], params: { theta: 0, WRIST_BASE: 48, WRIST_LENGTH: 64 } }
  }
];
