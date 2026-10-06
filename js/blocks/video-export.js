import { Output, Mp4OutputFormat, BufferTarget, CanvasSource, canEncodeVideo } from '../vendor/mediabunny/mediabunny.mjs';

// Fixed timestamps keep the exported motion independent of encoding speed.
export const VIDEO_FPS = 24;
export const VIDEO_SECONDS = 10;
let open = false;
export async function exportAnimation({ svg, begin }) {
  if (open) return;
  open = true;
  const dialog = document.createElement('dialog');
  dialog.style.cssText = 'box-sizing:border-box;max-height:90dvh;overflow:auto;width:min(600px,90vw);border:1px solid #b8cbd2;border-radius:14px;padding:20px;color:#18324b';
  dialog.innerHTML = '<h2>匯出 MP4 動畫</h2><p role="status">正在確認 MP4 支援…</p><video controls playsinline style="display:none;width:100%"></video><p><a hidden download="mechanism.mp4">下載 MP4</a> <button type="button">取消</button></p>';
  document.body.append(dialog);
  const status = dialog.querySelector('[role=status]'), video = dialog.querySelector('video');
  const download = dialog.querySelector('a'), close = dialog.querySelector('button');
  close.style.cssText = download.style.cssText = 'display:inline-block;padding:9px 14px;border:1px solid #b8cbd2;border-radius:8px;color:#176b87;background:#eef7fa;font:inherit;cursor:pointer';
  download.style.display = 'none';
  let cancelled = false, running = true, output, restore, url;
  close.onclick = () => { cancelled = true; if (!running) dialog.close(); };
  dialog.addEventListener('cancel', e => { if (running) { e.preventDefault(); cancelled = true; } });
  dialog.addEventListener('close', () => { if (url) URL.revokeObjectURL(url); dialog.remove(); open = false; });
  dialog.showModal();
  try {
    const width = 960, height = 600, bitrate = 2_000_000;
    if (!await canEncodeVideo('avc', { width, height, bitrate })) {
      throw new Error('此瀏覽器無法產生 MP4，請改用新版 Chrome／Safari，或使用裝置內建螢幕錄影。');
    }
    if (cancelled) return;
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
    const source = new CanvasSource(canvas, { codec: 'avc', bitrate });
    output.addVideoTrack(source, { frameRate: VIDEO_FPS });
    await output.start();
    const motion = begin(); restore = motion.restore;
    const css = [...document.styleSheets].flatMap(sheet => { try { return [...sheet.cssRules].map(r => r.cssText); } catch { return []; } }).join('\n');
    for (let frame = 0; frame < VIDEO_FPS * VIDEO_SECONDS; frame++) {
      if (cancelled) return;
      motion.frame(frame === 0 ? 0 : 1000 / VIDEO_FPS);
      const clone = svg.cloneNode(true);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('width', width); clone.setAttribute('height', height);
      clone.style.cssText = `width:${width}px;height:${height}px;background:#f5f7fa`;
      const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
      style.textContent = css; clone.prepend(style);
      const frameUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
      try {
        const img = new Image(); img.src = frameUrl; await img.decode();
        ctx.fillStyle = '#f5f7fa'; ctx.fillRect(0, 0, width, height); ctx.drawImage(img, 0, 0, width, height);
      } finally { URL.revokeObjectURL(frameUrl); }
      await source.add(frame / VIDEO_FPS, 1 / VIDEO_FPS);
      status.textContent = `正在產生 10 秒動畫… ${Math.round((frame + 1) / (VIDEO_FPS * VIDEO_SECONDS) * 100)}%`;
      // Yield so cancel and mobile rendering stay responsive.
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    await output.finalize(); const buffer = output.target.buffer; output = null;
    url = URL.createObjectURL(new Blob([buffer], { type: 'video/mp4' }));
    video.src = url; video.style.display = 'block'; download.href = url; download.hidden = false; download.style.display = 'inline-block';
    status.textContent = '完成！預覽後下載影片，再回 Classroom 繳交。';
  } catch (e) {
    status.textContent = e.message || '影片產生失敗，請使用裝置內建螢幕錄影。';
  } finally {
    if (output) await output.cancel().catch(() => {});
    restore?.(); running = false; close.textContent = '關閉';
    if (cancelled) dialog.close();
  }
}
