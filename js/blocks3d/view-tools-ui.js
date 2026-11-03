// 3D 畫面上的視角快捷列、分離滑桿、整體尺寸與「模型已更新」提示（標記在 blocks.html 的 #view3d）。
import { formatExtents } from './explode.js';
export function bindViewTools(root, viewer) {
  const $ = s => root.querySelector(s), bar = $('.view-presets'), range = $('.vp-explode input'), pct = $('.vp-explode output'), size = $('.vp-size'), pill = $('.model-updated');
  if (!bar) return;
  const showSize = () => {
    const e = viewer.getExtents();
    if (!e) { size.textContent = ''; return; }
    if (viewer.viewUp === 'z') { [e.min[1], e.min[2]] = [e.min[2], e.min[1]]; [e.max[1], e.max[2]] = [e.max[2], e.max[1]]; }   // 寬 × 高 × 厚：高＝向上那一軸
    size.textContent = formatExtents(e);
  };
  bar.addEventListener('click', ev => {
    const b = ev.target.closest('[data-view]');
    if (b && viewer.setViewPreset(b.dataset.view)) setTimeout(showSize, 450);
  });
  range.addEventListener('input', () => { pct.textContent = `${range.value}%`; range.setAttribute('aria-valuetext', `${range.value}%`); viewer.setExplode(range.value / 100); });
  let fade = 0;
  viewer.onRebuilt = ({ first, sinceStart }) => {
    showSize();
    if (first || sinceStart < 900) return;   // 剛開 3D 的第一次建置不算「更新」
    pill.classList.add('show'); clearTimeout(fade); fade = setTimeout(() => pill.classList.remove('show'), 1500);
  };
  const timer = setInterval(() => { if (!root.isConnected) clearInterval(timer); else if (root.offsetParent) showSize(); }, 1000);
  showSize();
}
