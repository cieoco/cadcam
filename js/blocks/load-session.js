/** A wizard may confirm only after a handshake with the same loaded module graph. */
export const LOAD_MISMATCH_MESSAGE = '主頁與接合預覽版本不同，請重新整理主頁後再開啟預覽。';
export function createLoadSession(token) {
  let ready = false;
  const matches = peer => typeof peer === 'string' && peer === token;
  return {
    get ready() { return ready; },
    receiveReady(peer) { ready = matches(peer); return ready; },
    allowConfirm(peer) { if (!matches(peer)) ready = false; return ready; }
  };
}
