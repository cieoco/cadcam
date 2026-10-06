// 僅供 Classroom 學習頁在學生點擊送件按鈕時取得快照。
export function trustedClassroomOrigin(origin) {
  return /^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(origin);
}
export function initClassroomBridge(getSnapshot, version) {
  if (new URLSearchParams(location.search).get('classroom') !== '1' || window.parent === window) return;
  window.addEventListener('message', event => {
    const data = event.data;
    if (event.source !== window.parent || !trustedClassroomOrigin(event.origin) || data?.type !== 'cadcam:snapshot-request' || !/^[a-f0-9-]{36}$/i.test(data.id || '')) return;
    let reply = {type:'cadcam:snapshot',id:data.id,version};
    try { reply.snapshot = JSON.stringify(getSnapshot()); }
    catch (_) { reply.error = '目前無法取得作品，請先結束組立預覽再試。'; }
    event.source.postMessage(reply, event.origin);
  });
}
