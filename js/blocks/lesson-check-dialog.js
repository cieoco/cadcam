export { checkSliderLesson } from './lesson-check.js';

export function showSliderLessonResult(result, record) {
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-label', '80 mm 推送器成果');
  dialog.style.cssText = 'box-sizing:border-box;width:min(92vw,420px);max-height:85vh;overflow:auto;border:1px solid #bccddd;border-radius:14px;padding:20px;color:#234;background:white';
  const title = document.createElement('h2'); title.textContent = '80 mm 推送器成果';
  const message = document.createElement('p'); message.dataset.lessonResult = result.status;
  message.textContent = (result.status === 'unknown' ? '無法判定：' : '') + result.message;
  const note = document.createElement('p'); note.textContent = '整圈每 1° 取樣，目標容許差 ±0.2 mm；不包含碰撞、推力與實物驗證。';
  const close = document.createElement('button'); close.textContent = '返回修改'; close.style.minHeight = '44px';
  close.onclick = () => dialog.close();
  dialog.append(title, message, note, close);
  if (result.status === 'pass') {
    const video = document.createElement('button'); video.textContent = '繼續匯出動畫'; video.style.cssText='min-height:44px;margin-left:8px';
    video.onclick = () => { dialog.close(); record(); }; dialog.append(video);
  }
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog); dialog.showModal();
}
