// 3D 視角快捷（頂／前／右／立體／置中）：純函式，與 THREE、DOM 無關。
// 場景座標：x 向右、y/z 其中之一向上（viewUp）；viewUp 'y'＝學生畫的那一面（xy 平面）就是「前」，相機在 +z；
// viewUp 'z'＝一般 CAD，前視從 −y 看。
export const VIEW_PRESETS = Object.freeze([
  { id: 'top', label: '頂' }, { id: 'front', label: '前' }, { id: 'right', label: '右' },
  { id: 'iso', label: '立體' }, { id: 'fit', label: '置中' }
]);
const norm = v => { const n = Math.hypot(...v) || 1; return v.map(x => x / n); };
export function presetCameraPose(id, { center = [0, 0, 0], radius = 100, viewUp = 'y' } = {}) {
  const up = viewUp === 'z' ? [0, 0, 1] : [0, 1, 0], front = viewUp === 'z' ? [0, -1, 0] : [0, 0, 1];
  const dir = id === 'top' ? up : id === 'right' ? [1, 0, 0] : id === 'iso' ? norm([1, 1, 1].map((_, i) => (i === 0 ? 1 : 0) + up[i] + front[i])) : front;
  const dist = Math.max(1, radius) * 2.8;   // 視角 45°：球半徑 r 需要約 2.6r；四個視角同距，切換不忽大忽小
  return {
    position: center.map((c, i) => c + dir[i] * dist), target: [...center],
    up: id === 'top' ? front.map(v => -v || 0) : [...up]   // 頂視：畫面的上方＝遠離「前」
  };
}
