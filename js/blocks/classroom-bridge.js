// 僅供 Classroom 學習頁在學生點擊送件按鈕時取得快照。
export function trustedClassroomOrigin(origin) {
  return /^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(origin);
}
export function initClassroomBridge(getSnapshot, version) {
  if (new URLSearchParams(location.search).get('classroom') !== '1' || window.parent === window) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'version-button';
  button.textContent = '回報問題';
  button.disabled = true;
  button.title = '確認學校帳號中';
  const host = document.querySelector('.learning-actions') || document.querySelector('.appbar');
  host.insertBefore(button, host.querySelector('.version-button'));
  let parentOrigin = null;
  button.addEventListener('click', () => {
    if (!parentOrigin || button.disabled) return;
    button.disabled = true;
    window.parent.postMessage({type:'cadcam:report-open'}, parentOrigin);
  });
  window.addEventListener('message', event => {
    const data = event.data;
    if (event.source !== window.parent || !trustedClassroomOrigin(event.origin)) return;
    if (data?.type === 'cadcam:report-state') {
      parentOrigin = event.origin;
      button.disabled = data.enabled !== true;
      button.title = button.disabled ? '請稍候，回報功能尚未就緒' : '附上目前機構，回報問題';
      return;
    }
    if (data?.type !== 'cadcam:snapshot-request' || !/^[a-f0-9-]{36}$/i.test(data.id || '')) return;
    let reply = {type:'cadcam:snapshot',id:data.id,version};
    try { reply.snapshot = JSON.stringify(getSnapshot()); }
    catch (_) { reply.error = '目前無法取得作品，請先結束組立預覽再試。'; }
    event.source.postMessage(reply, event.origin);
  });
  // 只廣播就緒訊號；作品僅回傳給驗證過的 Google Apps Script 父頁。
  window.parent.postMessage({type:'cadcam:ready'}, '*');
}
