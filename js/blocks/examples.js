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
        { type: 'anchor', id: 'Anchor1', p1: pt('A', 'fixed', -120, 0) },
        { type: 'anchor', id: 'Anchor2', p1: pt('B', 'fixed', 90, 0) },
        bar('Link1', pt('A', 'fixed', -120, 0, { physicalMotor: '1' }), pt('C', 'floating', -80, 0), 40, {
          color: '#e74c3c',
          isInput: true,
          physicalMotor: '1',
          phaseOffset: 0
        }),
        bar('Link2', pt('C', 'floating', -80, 0), pt('D', 'floating', 10, 50), 104),
        bar('Link3', pt('B', 'fixed', 90, 0), pt('D', 'floating', 10, 50), 96)
      ],
      params: { LL1: 40, LL2: 104, LL3: 96 }
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
    id: 'empty-challenge',
    title: '空白挑戰',
    note: '從零開始，試著做出馬達可整圈轉的機構。',
    snapshot: { kind: 'blocks', v: 1, counter: 0, comps: [], params: { theta: 0 } }
  }
];

export function getExample(id) {
  return BLOCK_EXAMPLES.find(example => example.id === id) || null;
}

