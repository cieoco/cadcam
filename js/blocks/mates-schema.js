/**
 * blocks / mates-schema
 *
 * module.mates（SDD-MATE-FACES §3）的清理：純函式、不碰 DOM。獨立成檔，讓 module-schema 讀檔時不必拉進 bench（避免循環匯入）。
 * mates＝{ attach: { normalDeg }|null, receive: [{ id, name, ref }] }；ref 是對自動接口的穩定參照，不存座標。
 */
export const MATES_MAX_RECEIVE = 8;
export const MATES_NAME_MAX = 24;

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const idOk = v => typeof v === 'string' && v.length > 0 && v.length <= 80;

// 角度取最近的 90° 倍數，並換算到 [0,360)；不是有限數字回 null。
export function snapDeg90(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return (((Math.round(v / 90) * 90) % 360) + 360) % 360;
}

// 單一參照：合法回乾淨的新物件（只留該種類的鍵、固定鍵序），不合法回 null。
export function normalizeRef(r) {
  if (!isObj(r)) return null;
  if (r.kind === 'bar') return idOk(r.id) && (r.side === 1 || r.side === -1) ? { kind: 'bar', id: r.id, side: r.side } : null;
  if (r.kind === 'triangle') return idOk(r.id) && Number.isInteger(r.edge) && r.edge >= 0 && r.edge <= 2 ? { kind: 'triangle', id: r.id, edge: r.edge } : null;
  if (r.kind === 'bolt') return idOk(r.output) ? { kind: 'bolt', output: r.output } : null;
  if (r.kind === 'frame') {
    if (typeof r.normalDeg !== 'number' || !Number.isFinite(r.normalDeg) || !Number.isInteger(r.order) || r.order < 0) return null;
    return { kind: 'frame', normalDeg: ((Math.round(r.normalDeg) % 360) + 360) % 360, order: r.order };
  }
  return null;
}

export const cleanMateName = v => typeof v === 'string' ? v.trim().slice(0, MATES_NAME_MAX).trim() : '';

// 讀檔／範本用：raw 不是物件回 undefined（呼叫端就不寫 mates 欄位）；attach 不合法→null；receive 去掉壞項與重複 id，最多 8 筆。
export function normalizeMates(raw) {
  if (!isObj(raw)) return undefined;
  const d = isObj(raw.attach) ? snapDeg90(raw.attach.normalDeg) : null;
  const receive = [], seen = new Set();
  (Array.isArray(raw.receive) ? raw.receive : []).forEach(r => {
    if (receive.length >= MATES_MAX_RECEIVE || !isObj(r) || !idOk(r.id) || seen.has(r.id)) return;
    const name = cleanMateName(r.name), ref = normalizeRef(r.ref);
    if (!name || !ref) return;
    seen.add(r.id);
    receive.push({ id: r.id, name, ref });
  });
  return { attach: d === null ? null : { normalDeg: d }, receive };
}
