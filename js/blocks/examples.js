/**
 * blocks / examples
 *
 * 課堂範例一律使用 blocks snapshot。載入後和學生自己畫出的作品完全相同，
 * 可以繼續拖曳、改長度、存檔與分享。
 */

const bar = (id, p1, p2, len, extra = {}) => ({
  type: 'bar',
  id,
  color: extra.color || '#3498db',
  p1,
  p2,
  lenParam: `LL${id.replace(/\D/g, '') || id}`,
  fixedLen: true,
  isInput: false,
  ...extra
});

const exactBar = (id, p1, p2, len, extra = {}) => bar(id, p1, p2, len, { snapLength: false, ...extra });

const triangle = (id, p1, p2, p3, extra = {}) => ({
  type: 'triangle',
  id,
  color: extra.color || '#e74c3c',
  p1,
  p2,
  p3,
  gParam: `TG${id.replace(/\D/g, '') || id}`,
  r1Param: `TR1_${id}`,
  r2Param: `TR2_${id}`,
  sign: extra.sign || 1,
  ...extra
});

const pt = (id, type, x, y, extra = {}) => ({ id, type, x, y, ...extra });

export const BLOCK_EXAMPLES = [
  {
    id: 'fourbar-crank-rocker',
    title: '四連桿：曲柄搖桿',
    note: '紅色馬達整圈轉，右邊搖桿來回擺。適合第一個驗證任務。',
    snapshot: {
      kind: 'blocks',
      v: 1,
      counter: 6,
      comps: [
        { type: 'anchor', id: 'Anchor1', p1: pt('A', 'fixed', -80, 0) },
        { type: 'anchor', id: 'Anchor2', p1: pt('B', 'fixed', 20, 0) },
        bar('Link1', pt('A', 'fixed', -80, 0, { physicalMotor: '1' }), pt('C', 'floating', -50, 0), 30, {
          color: '#e74c3c',
          isInput: true,
          physicalMotor: '1',
          phaseOffset: 0
        }),
        bar('Link2', pt('C', 'floating', -50, 0), pt('D', 'floating', 10.7, 79.5), 100),
        bar('Link3', pt('B', 'fixed', 20, 0), pt('D', 'floating', 10.7, 79.5), 80)
      ],
      params: { LL1: 30, LL2: 100, LL3: 80 }
    }
  },
  {
    id: 'parallel-fourbar',
    title: '四連桿：平行保持',
    note: '上下兩根長桿等長，觀察輸出桿如何保持姿態。',
    snapshot: {
      kind: 'blocks',
      v: 1,
      counter: 6,
      comps: [
        { type: 'anchor', id: 'Anchor1', p1: pt('A', 'fixed', -110, 0) },
        { type: 'anchor', id: 'Anchor2', p1: pt('B', 'fixed', -110, 72) },
        bar('Link1', pt('A', 'fixed', -110, 0, { physicalMotor: '1' }), pt('C', 'floating', -62, 0), 48, {
          color: '#e74c3c',
          isInput: true,
          physicalMotor: '1',
          phaseOffset: 0
        }),
        bar('Link2', pt('B', 'fixed', -110, 72), pt('D', 'floating', -62, 72), 48),
        bar('Link3', pt('C', 'floating', -62, 0), pt('D', 'floating', -62, 72), 72)
      ],
      params: { LL1: 48, LL2: 48, LL3: 72 }
    }
  },
  {
    id: 'chebyshev-linkage',
    title: '切比雪夫連桿：近似直線',
    note: '固定桿:曲柄:連桿:搖桿 = 2:1:2.5:2.5，觀察下方接點的近似直線軌跡。',
    snapshot: {
      kind: 'blocks',
      v: 1,
      counter: 6,
      tracePoint: 'P',
      comps: [
        { type: 'anchor', id: 'Anchor1', p1: pt('A', 'fixed', -32, 80) },
        { type: 'anchor', id: 'Anchor2', p1: pt('D', 'fixed', 32, 80) },
        bar('Link1', pt('A', 'fixed', -32, 80, { physicalMotor: '1' }), pt('B', 'floating', -9.373, 57.373), 32, {
          color: '#3498db',
          isInput: true,
          physicalMotor: '1',
          phaseOffset: -45
        }),
        bar('Link2', pt('B', 'floating', -9.373, 57.373), pt('C', 'floating', 47.996, 1.616), 80, { color: '#e74c3c' }),
        bar('Link3', pt('D', 'fixed', 32, 80), pt('C', 'floating', 47.996, 1.616), 80, { color: '#e74c3c' }),
        triangle('Tri1', pt('B', 'floating', -9.373, 57.373), pt('C', 'floating', 47.996, 1.616), pt('P', 'floating', 88, -37), { color: '#e74c3c' }),
        bar('Link4', pt('A', 'fixed', -32, 80), pt('D', 'fixed', 32, 80), 64, { color: '#27ae60' })
      ],
      params: { LL1: 32, LL2: 80, LL3: 80, LL4: 64, TG1: 80, TR1_Tri1: 136, TR2_Tri1: 56 }
    }
  },
  {
    id: 'slider-crank',
    title: '滑塊曲柄：往復運動',
    note: '紅色馬達整圈轉，透過連桿推動綠色滑塊在🟩滑軌上往復滑動（活塞原理）。',
    snapshot: {
      kind: 'blocks',
      v: 1,
      counter: 6,
      comps: [
        { type: 'anchor', id: 'Anchor1', p1: pt('O', 'fixed', 0, 0) },
        { type: 'anchor', id: 'Anchor2', p1: pt('M1', 'fixed', 40, 0) },
        { type: 'anchor', id: 'Anchor3', p1: pt('M2', 'fixed', 152, 0) },
        bar('Link1', pt('O', 'fixed', 0, 0, { physicalMotor: '1' }), pt('A', 'floating', 30, 0), 30, {
          color: '#e74c3c',
          isInput: true,
          physicalMotor: '1',
          phaseOffset: 0
        }),
        bar('Link3', pt('M1', 'fixed', 40, 0), pt('M2', 'fixed', 152, 0), 112, { color: '#95a5a6' }),
        {
          type: 'slider', id: 'Slider1', color: '#16a085', sign: 1, lenParam: 'SL1',
          m1: pt('M1', 'fixed', 40, 0), m2: pt('M2', 'fixed', 152, 0),
          p1: pt('Sa', 'fixed', 45, 0), p2: pt('Sb', 'fixed', 140, 0), p3: pt('P3', 'floating', 120, 0),
          carrierLen: 112, railOffset: 5, carriageLen: 24, travelStart: 0, travelEnd: 95
        },
        bar('Link2', pt('A', 'floating', 30, 0), pt('P3', 'floating', 120, 0), 90)
      ],
      params: { LL1: 30, LL2: 90, LL3: 112, SL1: 95 }
    }
  },
  {
    id: 'pantograph',
    title: '縮放儀：2 倍放大',
    note: '左下 O 固定，拖曳右端 R 操作縮放儀；中點 P 與右端 R 會留下不同色軌跡，R 永遠是 B→P 方向的 2 倍輸出。',
    snapshot: {
      kind: 'blocks',
      v: 1,
      counter: 12,
      tracePoints: ['P', 'R'],
      comps: [
        { type: 'anchor', id: 'Anchor1', p1: pt('O', 'fixed', 0, 0) },
        // 左側固定三孔桿 O-A-B：80 + 80 = 160。
        triangle('Tri1', pt('O', 'fixed', 0, 0), pt('A', 'floating', 0, 80), pt('B', 'floating', 0, 160), { color: '#27ae60' }),
        // 藍色平行四邊形 A-D-P-B，維持右側三孔桿的姿態。
        bar('Link2', pt('A', 'floating', 0, 80), pt('D', 'floating', 96, 80), 96, { color: '#3498db' }),
        bar('Link3', pt('D', 'floating', 96, 80), pt('P', 'floating', 96, 160), 80, { color: '#3498db' }),
        // 右側手抓三孔桿 B-P-R：96 + 96 = 192，故 R = B + 2 × (P - B)。
        triangle('Tri4', pt('B', 'floating', 0, 160), pt('P', 'floating', 96, 160), pt('R', 'floating', 192, 160), { color: '#27ae60' })
      ],
      params: { TG1: 80, TR1_Tri1: 160, TR2_Tri1: 80, LL2: 96, LL3: 80, TG4: 96, TR1_Tri4: 192, TR2_Tri4: 96 }
    }
  },
  {
    id: 'quick-return',
    title: '急回機構：偏置曲柄滑塊',
    note: '滑軌刻意放在曲柄中心上方；同樣的水平行程，一段約用 220° 慢慢走，另一段約用 140° 快速回來。',
    snapshot: {
      kind: 'blocks',
      v: 1,
      counter: 6,
      tracePoint: 'S',
      comps: [
        { type: 'anchor', id: 'Anchor1', p1: pt('O', 'fixed', 0, 0) },
        { type: 'anchor', id: 'Anchor2', p1: pt('M1', 'fixed', 0, 48) },
        { type: 'anchor', id: 'Anchor3', p1: pt('M2', 'fixed', 184, 48) },
        bar('Link1', pt('O', 'fixed', 0, 0, { physicalMotor: '1' }), pt('A', 'floating', 48, 0), 48, {
          color: '#e74c3c',
          isInput: true,
          physicalMotor: '1',
          phaseOffset: 0
        }),
        {
          type: 'slider', id: 'Slider1', color: '#16a085', sign: 1, lenParam: 'SL1',
          m1: pt('M1', 'fixed', 0, 48), m2: pt('M2', 'fixed', 184, 48),
          p1: pt('Sa', 'fixed', 0, 48), p2: pt('Sb', 'fixed', 184, 48), p3: pt('S', 'floating', 140.26, 48),
          carrierLen: 184, railOffset: 0, carriageLen: 24, travelStart: 0, travelEnd: 184
        },
        bar('Link2', pt('A', 'floating', 48, 0), pt('S', 'floating', 140.26, 48), 104)
      ],
      params: { LL1: 48, LL2: 104, SL1: 184 }
    }
  },
  {
    id: 'gear-pair',
    title: '齒輪對：嚙合傳動',
    note: '紅色驅動齒輪整圈轉、藍色從動齒輪反向轉，轉速比＝半徑反比（30:40，大輪較慢）。',
    snapshot: {
      kind: 'blocks',
      v: 1,
      counter: 2,
      comps: [
        { type: 'gear', id: 'GearA', color: '#e74c3c',
          p1: pt('GCA', 'motor', -40, 0, { physicalMotor: '1' }),
          p2: pt('GPA', 'floating', -10, 0),
          radiusParam: 'GRA', teeth: 15, phase: 0 },
        { type: 'gear', id: 'GearB', color: '#2c6fbb',
          p1: pt('GCB', 'fixed', 30, 0),
          p2: pt('GPB', 'floating', 70, 0),
          radiusParam: 'GRB', teeth: 20, phase: 0, mesh: 'GearA' }
      ],
      params: { GRA: 30, GRB: 40, theta: 0 }
    }
  },
  {
    id: 'reduction-gear-train',
    title: '減速齒輪列：4 倍減速',
    note: '紅色 12 齒小齒輪驅動，中間 24 齒惰輪換方向，最後 48 齒大齒輪同向慢速輸出（末輪/首輪 = 1/4）。',
    snapshot: {
      kind: 'blocks',
      v: 1,
      counter: 3,
      comps: [
        { type: 'gear', id: 'GearA', color: '#e74c3c',
          p1: pt('GCA', 'motor', -128, 0, { physicalMotor: '1' }),
          p2: pt('GPA', 'floating', -104, 0),
          radiusParam: 'GRA', teeth: 12, module: 4, phase: 0 },
        { type: 'gear', id: 'GearB', color: '#2c6fbb',
          p1: pt('GCB', 'fixed', -56, 0),
          p2: pt('GPB', 'floating', -8, 0),
          radiusParam: 'GRB', teeth: 24, module: 4, phase: 0, mesh: 'GearA' },
        { type: 'gear', id: 'GearC', color: '#27ae60',
          p1: pt('GCC', 'fixed', 88, 0),
          p2: pt('GPC', 'floating', 184, 0),
          radiusParam: 'GRC', teeth: 48, module: 4, phase: 0, mesh: 'GearB' }
      ],
      params: { GRA: 24, GRB: 48, GRC: 96, theta: 0 }
    }
  },
  {
    id: 'rack-pinion',
    title: '齒條齒輪：轉→直線',
    note: '紅色小齒輪帶動綠色齒條沿水平方向平移；因為齒條是有限長，接觸點到端部前會反向，保持齒輪與齒條一直嚙合。',
    snapshot: {
      kind: 'blocks',
      v: 1,
      counter: 2,
      comps: [
        { type: 'gear', id: 'Pinion', color: '#e74c3c',
          p1: pt('PC', 'motor', 0, 0, { physicalMotor: '1' }),
          p2: pt('PP', 'floating', 18, 0),
          radiusParam: 'PR', teeth: 15, module: 4, phase: 0 },
        { type: 'rack', id: 'Rack1', color: '#16a085',
          p1: pt('RKP', 'floating', 0, -30),
          pinion: 'Pinion', lenParam: 'RKL', axisDeg: 0, sign: 1 }
      ],
      params: { PR: 30, RKL: 160, theta: 0 }
    }
  },
  {
    id: 'gear-gripper',
    title: '雙齒輪夾持器：偏心孔帶動夾爪',
    note: '兩顆嚙合齒輪反向轉，齒輪上的偏心輸出孔推動左右「夾爪板」同步開合。可選齒輪調整「輸出孔距」改變夾爪行程。',
    snapshot: {
      kind: 'blocks',
      v: 1,
      counter: 8,
      tracePoints: ['LT', 'RT'],
      comps: [
        { type: 'gear', id: 'GearA', color: '#e74c3c',
          p1: pt('GCA', 'motor', -30, 0, { physicalMotor: '1' }),
          p2: pt('GPA', 'floating', -30, 18),
          radiusParam: 'GRA', pinRadiusParam: 'GPRA', pinHoleDiameter: 5, teeth: 15, module: 4, phase: 90 },
        { type: 'gear', id: 'GearB', color: '#2c6fbb',
          p1: pt('GCB', 'fixed', 30, 0),
          p2: pt('GPB', 'floating', 30, 18),
          radiusParam: 'GRB', pinRadiusParam: 'GPRB', pinHoleDiameter: 5, teeth: 15, module: 4, phase: 90, mesh: 'GearA' },
        triangle('LeftJaw', pt('GCA', 'motor', -30, 0, { physicalMotor: '1' }), pt('GPA', 'floating', -30, 18), pt('LT', 'floating', -95, -85), {
          color: '#ff6b35',
          shape: 'jaw',
          shapeMode: 'polyline',
          jawTurnSign: -1,
          gParam: 'GPRA',
          r1Param: 'LJ_tip',
          r2Param: 'LJ_edge',
          sign: 1
        }),
        triangle('RightJaw', pt('GCB', 'fixed', 30, 0), pt('GPB', 'floating', 30, 18), pt('RT', 'floating', 95, -85), {
          color: '#ff6b35',
          shape: 'jaw',
          shapeMode: 'polyline',
          jawTurnSign: 1,
          gParam: 'GPRB',
          r1Param: 'RJ_tip',
          r2Param: 'RJ_edge',
          sign: -1
        })
      ],
      params: {
        GRA: 30, GRB: 30, GPRA: 18, GPRB: 18,
        LJ_tip: 107, LJ_edge: 121.8,
        RJ_tip: 107, RJ_edge: 121.8,
        theta: 0
      }
    }
  },
  {
    id: 'cam-follower',
    title: '凸輪從動件：轉→上下',
    note: '紫色凸輪旋轉，滾子從動件沿導桿上下移動；輪廓用 harmonic 半徑函數建立，從動件位置由凸輪外形與滾子相切的幾何推出。',
    snapshot: {
      kind: 'blocks',
      v: 1,
      counter: 2,
      tracePoint: 'CF',
      comps: [
        { type: 'cam', id: 'Cam1', color: '#9b59b6',
          p1: pt('CC', 'motor', 0, 0, { physicalMotor: '1' }),
          p2: pt('CF', 'floating', 0, 28),
          baseRadiusParam: 'CBR', liftParam: 'CLF', axisDeg: 90, profile: 'harmonic', phase: 0 }
      ],
      params: { CBR: 24, CLF: 40, theta: 0 }
    }
  },
  {
    id: 'pulley-belt',
    title: '皮帶輪傳動：同向變速',
    note: '紅色小皮帶輪用開口皮帶帶動藍色大皮帶輪；兩輪同向旋轉，角速度比等於半徑反比。',
    snapshot: {
      kind: 'blocks',
      v: 1,
      counter: 3,
      comps: [
        { type: 'pulley', id: 'PulleyA', color: '#e74c3c',
          p1: pt('PLA', 'motor', -56, 0, { physicalMotor: '1' }),
          p2: pt('PPA', 'floating', -35, 0),
          radiusParam: 'PRA', phase: 0 },
        { type: 'pulley', id: 'PulleyB', color: '#2c6fbb',
          p1: pt('PLB', 'fixed', 64, 0),
          p2: pt('PPB', 'floating', 106, 0),
          radiusParam: 'PRB', phase: 0 },
        { type: 'belt', id: 'Belt1', color: '#2c3e50',
          driver: 'PulleyA', driven: 'PulleyB' }
      ],
      params: { PRA: 24, PRB: 48, theta: 0 }
    }
  },
  {
    id: 'jansen-leg',
    title: '步行腿：Jansen',
    note: 'Theo Jansen 腿的教具比例；右側 TT 馬達帶動紅色曲柄，藍色連桿讓足端 P5 走出閉合步態軌跡。',
    snapshot: {
      kind: 'blocks',
      v: 1,
      counter: 14,
      tracePoint: 'P5',
      comps: [
        { type: 'anchor', id: 'Anchor1', p1: pt('F', 'fixed', 0, 0) },
        { type: 'anchor', id: 'Anchor2', p1: pt('O', 'motor', 38, 7.8, { physicalMotor: '1' }) },
        exactBar('LinkM', pt('O', 'motor', 38, 7.8, { physicalMotor: '1' }), pt('P0', 'floating', 53, 7.8), 15, {
          lenParam: 'm',
          color: '#e74c3c',
          isInput: true,
          physicalMotor: '1'
        }),
        exactBar('LinkJ', pt('P0', 'floating', 53, 7.8), pt('P1', 'floating', 13.986, 39.072, { solveSign: -1 }), 50, { lenParam: 'j', color: '#168bd1' }),
        exactBar('LinkK', pt('P0', 'floating', 53, 7.8), pt('P2', 'floating', 11.048, -37.715), 61.9, { lenParam: 'k', color: '#168bd1' }),
        exactBar('LinkB', pt('F', 'fixed', 0, 0), pt('P1', 'floating', 13.986, 39.072, { solveSign: -1 }), 41.5, { lenParam: 'b', color: '#168bd1' }),
        exactBar('LinkC', pt('F', 'fixed', 0, 0), pt('P2', 'floating', 11.048, -37.715), 39.3, { lenParam: 'c', color: '#168bd1' }),
        exactBar('LinkE', pt('P1', 'floating', 13.986, 39.072, { solveSign: -1 }), pt('P3', 'floating', -36.794, 15.943, { solveSign: -1 }), 55.8, { lenParam: 'e', color: '#168bd1' }),
        exactBar('LinkD', pt('F', 'fixed', 0, 0), pt('P3', 'floating', -36.794, 15.943, { solveSign: -1 }), 40.1, { lenParam: 'd', color: '#168bd1' }),
        triangle('TriUpper', pt('F', 'fixed', 0, 0), pt('P1', 'floating', 13.986, 39.072), pt('P3', 'floating', -36.794, 15.943), {
          color: '#168bd1',
          gParam: 'b',
          r1Param: 'd',
          r2Param: 'e',
          sign: -1,
          visualOnly: true,
          snapLength: false,
          zlift: 1
        }),
        exactBar('LinkF', pt('P3', 'floating', -36.794, 15.943, { solveSign: -1 }), pt('P4', 'floating', -21.232, -20.253, { solveSign: -1 }), 39.4, { lenParam: 'f', color: '#168bd1' }),
        exactBar('LinkG', pt('P2', 'floating', 11.048, -37.715), pt('P4', 'floating', -21.232, -20.253, { solveSign: -1 }), 36.7, { lenParam: 'g', color: '#168bd1' }),
        exactBar('LinkH', pt('P4', 'floating', -21.232, -20.253, { solveSign: -1 }), pt('P5', 'floating', -5.16, -83.957, { solveSign: -1 }), 65.7, { lenParam: 'h', color: '#168bd1' }),
        exactBar('LinkI', pt('P2', 'floating', 11.048, -37.715), pt('P5', 'floating', -5.16, -83.957, { solveSign: -1 }), 49, { lenParam: 'i', color: '#168bd1' }),
        triangle('TriLower', pt('P2', 'floating', 11.048, -37.715), pt('P4', 'floating', -21.232, -20.253), pt('P5', 'floating', -5.16, -83.957), {
          color: '#168bd1',
          gParam: 'g',
          r1Param: 'i',
          r2Param: 'h',
          sign: -1,
          visualOnly: true,
          snapLength: false,
          zlift: 1
        })
      ],
      params: { a: 38, l: 7.8, m: 15, j: 50, k: 61.9, b: 41.5, c: 39.3, e: 55.8, d: 40.1, f: 39.4, g: 36.7, h: 65.7, i: 49 }
    }
  },
  {
    id: 'empty-challenge',
    title: '空白挑戰',
    note: '從零開始，試著做出馬達可整圈轉的機構。',
    snapshot: { kind: 'blocks', v: 1, counter: 0, comps: [], params: { theta: 0 } }
  }
];

export function getExample(id) {
  return BLOCK_EXAMPLES.find(example => example.id === id) || null;
}
