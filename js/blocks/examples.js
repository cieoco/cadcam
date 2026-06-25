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
    note: '黃色點是追蹤點，外端輸出點會保持在同方向的 2 倍距離；兩段菱形剪架呈現縮放儀的比例結構。',
    snapshot: {
      kind: 'blocks',
      v: 1,
      counter: 12,
      tracePoint: 'P',
      comps: [
        { type: 'anchor', id: 'Anchor1', p1: pt('O', 'fixed', 0, 0) },
        bar('Link1', pt('O', 'fixed', 0, 0, { physicalMotor: '1' }), pt('P', 'floating', 96, 0), 96, {
          color: '#e74c3c',
          isInput: true,
          physicalMotor: '1',
          phaseOffset: 0,
          holes: [{ id: 'I', distParam: 'DI' }]
        }),
        bar('Link2', pt('O', 'fixed', 0, 0), pt('U', 'floating', 24, 32), 40, { color: '#3498db' }),
        bar('Link3', pt('U', 'floating', 24, 32), pt('I', 'floating', 48, 0), 40, { color: '#3498db' }),
        bar('Link4', pt('I', 'floating', 48, 0), pt('W', 'floating', 72, 32), 40, { color: '#3498db' }),
        bar('Link5', pt('W', 'floating', 72, 32), pt('P', 'floating', 96, 0), 40, { color: '#3498db' }),
        bar('Link6', pt('O', 'fixed', 0, 0), pt('V', 'floating', 24, -32), 40, { color: '#27ae60' }),
        bar('Link7', pt('V', 'floating', 24, -32), pt('I', 'floating', 48, 0), 40, { color: '#27ae60' }),
        bar('Link8', pt('I', 'floating', 48, 0), pt('X', 'floating', 72, -32), 40, { color: '#27ae60' }),
        bar('Link9', pt('X', 'floating', 72, -32), pt('P', 'floating', 96, 0), 40, { color: '#27ae60' }),
        bar('Link10', pt('U', 'floating', 24, 32), pt('W', 'floating', 72, 32), 48, { color: '#8e44ad' }),
        bar('Link11', pt('V', 'floating', 24, -32), pt('X', 'floating', 72, -32), 48, { color: '#8e44ad' })
      ],
      params: { LL1: 96, LL2: 40, LL3: 40, LL4: 40, LL5: 40, LL6: 40, LL7: 40, LL8: 40, LL9: 40, LL10: 48, LL11: 48, DI: 48 }
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
    id: 'empty-challenge',
    title: '空白挑戰',
    note: '從零開始，試著做出馬達可整圈轉的機構。',
    snapshot: { kind: 'blocks', v: 1, counter: 0, comps: [], params: { theta: 0 } }
  }
];

export function getExample(id) {
  return BLOCK_EXAMPLES.find(example => example.id === id) || null;
}
