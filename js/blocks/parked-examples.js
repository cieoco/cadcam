// 暫不公開的範例：不在範例清單，也不載入啟動程式（原本在 examples.js，以 id 濾掉；移出是為了縮小首次載入）。
// 要重新公開時，把它加回 examples.js 的 ALL_BLOCK_EXAMPLES，並補回 pt／bar 兩個小工具的寫法。
const pt = (id, type, x, y, extra = {}) => ({ id, type, x, y, ...extra });
const bar = (id, p1, p2, len, extra = {}) => ({ type: 'bar', id, color: extra.color || '#3498db', p1, p2, lenParam: `LL${id.replace(/\D/g, '') || id}`, fixedLen: true, isInput: false, ...extra });
export const PARKED_EXAMPLES = [
  {
    id: 'competition-flywheel-shooter',
    title: '競賽飛輪射球：皮帶加速',
    note: '大皮帶輪帶小飛輪，讓輸出輪高速旋轉。可用來討論射球速度、打滑與減速/加速取捨。',
    snapshot: {
      kind: 'blocks',
      v: 1,
      counter: 4,
      comps: [
        { type: 'pulley', id: 'ShooterDrivePulley', color: '#e74c3c',
          p1: pt('SDC', 'motor', -72, 0, { physicalMotor: '1' }),
          p2: pt('SDP', 'floating', -24, 0),
          radiusParam: 'SH_DRIVE_R', phase: 0 },
        { type: 'pulley', id: 'ShooterFlywheel', color: '#2c6fbb',
          p1: pt('SFC', 'fixed', 72, 0),
          p2: pt('SFP', 'floating', 96, 0),
          radiusParam: 'SH_FLY_R', phase: 0 },
        { type: 'belt', id: 'ShooterBelt', color: '#2c3e50',
          driver: 'ShooterDrivePulley', driven: 'ShooterFlywheel' },
        bar('ShooterFrame', pt('SDC', 'motor', -72, 0, { physicalMotor: '1' }), pt('SFC', 'fixed', 72, 0), 144, {
          lenParam: 'SH_FRAME',
          color: '#95a5a6'
        })
      ],
      params: { SH_DRIVE_R: 48, SH_FLY_R: 24, SH_FRAME: 144, theta: 0 }
    }
  },
];
