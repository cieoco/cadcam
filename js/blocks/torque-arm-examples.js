// 「TT 為什麼舉不起手臂？」對照練習的兩個範例（按需載入，不進啟動；由 unit-start-examples.js 的 register 帶入）。
// 同一支 160 mm 手臂（孔距 8 的倍數）、末端掛 50 g：A 是 TT 直接帶手臂，B 是 TT＋12:36（3:1）齒輪。
// 學生在「⚖ 扭力」面板換動力規格（TT／MG995）比較使用率；數字是靜態估算，規格為廠商標示值。
import { standardizeExampleFrame } from './example-frame-stock.js';

const stock = { widthMm: 13, thicknessMm: 3, material: 'plywood' };
const load = pointId => [{ id: 'Load1', name: '末端重物', massG: 50, at: { pointId } }];

const DIRECT = () => ({
  kind: 'blocks', v: 1, counter: 2, projectName: 'TT 直接帶手臂', tracePoint: 'TqTip',
  comps: [{ type: 'bar', id: 'TqArm', name: '手臂', color: '#e74c3c', isInput: true, physicalMotor: '1', motorType: 'tt',
    p1: { id: 'TqAxis', type: 'fixed', x: 0, y: 0, physicalMotor: '1' }, p2: { id: 'TqTip', type: 'floating', x: 160, y: 0 },
    lenParam: 'TqArmLen', fixedLen: true, snapLength: false, stock: { ...stock } }],
  params: { theta: 0, TqArmLen: 160 }, loads: load('TqTip')
});

/** B 由已有的「3:1 單轉軸升降」複製：輸入輪改成 TT（連續轉），掛上同樣的 50 g。 */
function geared(examples) {
  const source = examples.find(e => e.id === 'clawbot-geared-lift');
  if (!source) return null;
  const snapshot = structuredClone(source.snapshot), drive = snapshot.comps.find(c => c.id === 'ClawLiftDrive');
  drive.motorType = 'tt'; delete drive.servoStart; delete drive.servoEnd;
  snapshot.projectName = 'TT＋3:1 齒輪帶手臂'; snapshot.loads = load('ClawLiftTip');
  return snapshot;
}

const COMMON = {
  group: 'transmission', level: '比較',
  predict: '先猜：TT 直接帶這支手臂，舉得起末端 50 g 嗎？加一組 3:1 齒輪呢？換成 MG995 呢？',
  explain: '用「扭力 ≈ 重量 × 力臂」說明為什麼手臂水平時最吃力；用「齒輪比換速度、換扭力」說明 3:1 為什麼有幫助，以及為什麼 TT 加了齒輪仍是黃燈（超過 25%）。數字是靜態估算，不含摩擦與慣量，規格為廠商標示值，市售品常較弱，要以實測為準。'
};
export const TORQUE_ARM_LESSONS = {
  'torque-arm-direct': {
    ...COMMON,
    use: '同一支 160 mm 手臂、末端掛 50 g，比較 TT、TT＋3:1 齒輪、MG995 三種動力。這一個是 TT 直接帶手臂。',
    learn: '手臂水平時最吃力，需要的扭力大約是「重量 × 力臂」。按上方「⚖ 扭力」，看最大需求和動力的失速扭力差多少。',
    try: ['按 ⚖ 扭力，記下 TT 6 V 的最大需求與使用率（約 0.84 kgf·cm、約 105%，紅燈：估算舉不起來）', '把「動力規格」換成 MG995 4.8 V，記下使用率（約 10%，綠燈）', '到範例「TT＋3:1 齒輪帶手臂」，用同一個面板再記一次', '把末端重物改成 20 g，再比較三種'],
    measure: '填一張表：TT 直接帶、TT＋3:1 齒輪、MG995 直接帶，各自的最大需求（kgf·cm）、使用率與燈號。參考：約 105% 紅、約 39% 黃、約 10% 綠。'
  },
  'torque-arm-geared': {
    ...COMMON,
    use: '同一支 160 mm 手臂、末端掛 50 g。這一個是 TT 加 12:36（3:1）齒輪再帶手臂。',
    learn: '3:1 減速讓輸出扭力約變成輸入的 3 × 0.9（每級效率預設 0.9），所以馬達端需求降到約 0.31 kgf·cm（約 39%，黃燈）；代價是手臂速度變成約 1/3，面板的「行程時間」會變長。',
    try: ['按 ⚖ 扭力，記下 TT 6 V 的使用率（約 39%，黃燈）和行程時間', '換成 MG995 4.8 V，比較使用率與行程時間', '回到「TT 直接帶手臂」，把三種結果放在一起比', '想一想：還要再降到綠燈（25% 以下），可以再加一級齒輪、縮短手臂，或換更強的動力'],
    measure: '馬達轉 360°，手臂只轉 120°。記下三種組合的使用率、燈號與行程時間，說明速度和扭力怎麼互換。'
  }
};

/** 加進範例清單與教學資料；重複呼叫不會重複加入。 */
export function register(examples, lessons) {
  if (!examples.some(e => e.id === 'torque-arm-direct')) {
    const direct = DIRECT(); standardizeExampleFrame(direct);
    examples.push({ id: 'torque-arm-direct', title: 'TT 直接帶手臂（舉不起 50 g？）', note: '160 mm 手臂、末端 50 g。按 ⚖ 扭力看 TT 夠不夠，再換 MG995 比較。', snapshot: direct });
  }
  if (!examples.some(e => e.id === 'torque-arm-geared')) {
    const snapshot = geared(examples);
    if (snapshot) examples.push({ id: 'torque-arm-geared', title: 'TT＋3:1 齒輪帶手臂', note: '同一支手臂與 50 g，TT 加 12:36 齒輪。按 ⚖ 扭力看使用率降多少、速度慢多少。', snapshot });
  }
  Object.assign(lessons, TORQUE_ARM_LESSONS);
}
