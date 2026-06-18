/**
 * Share Codec
 * 分享網址編解碼器（純函式、零相依、不碰 DOM）
 *
 * 用途：把一份「機構 snapshot」(同存檔格式) 壓成可放進 URL hash 的字串，
 * 以及把別人傳來的分享字串安全地還原成物件。
 *
 * 安全設計（重點）：
 * - 只做資料編解碼：一律 `JSON.parse`，永不 `eval`，外來內容只可能是純資料。
 * - 還原後過一道「字元白名單閘」：機構的 id / 參數名 / 顏色等本來就只會是
 *   簡單識別字或 hex 色碼，任何含 < > " ' ` 的字串一律整包拒絕——把 XSS
 *   向量擋在「解碼外來資料」這個單一入口，render 層不必再逐處跳脫。
 * - snapshot 內的 `topology` 欄位是「字串化的 JSON」(本身含大量 ")，因此遇到
 *   它時先 JSON.parse 再檢查其葉節點，惡意的內層 id / 顏色才抓得到。
 */

// 還原字串的長度上限（防止異常龐大的連結拖垮頁面）
const MAX_ENCODED_LEN = 300000;
// 走訪外來資料時的層級與節點上限（防止病態巢狀）
const MAX_DEPTH = 64;
const MAX_NODES = 50000;
// 不允許出現在任何字串值/欄位名中的字元（HTML / 屬性 / 樣板字串突破用）
const UNSAFE_CHARS = /[<>"'`]/;

// ── base64url <-> bytes（UTF-8 安全，可容納中文 id）──────────────
function bytesToBase64Url(bytes) {
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(str) {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

/**
 * 把 snapshot 物件編碼成可放進 URL 的字串。
 * @param {object} obj 機構 snapshot（同存檔格式）
 * @returns {string} URL-safe base64 字串
 */
export function encodeSnapshot(obj) {
    const json = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(json);
    const encoded = bytesToBase64Url(bytes);
    if (encoded.length > MAX_ENCODED_LEN) {
        throw new Error('機構太大，無法放進分享連結');
    }
    return encoded;
}

/**
 * 把分享字串安全還原成 snapshot 物件。失敗或內容可疑時拋出帶有中文說明的錯誤。
 * @param {string} str encodeSnapshot 產生的字串
 * @returns {object} 通過安全檢查的 snapshot 物件
 */
export function decodeShareString(str) {
    if (typeof str !== 'string' || !str) throw new Error('連結內容是空的');
    if (str.length > MAX_ENCODED_LEN) throw new Error('連結內容過長');

    let obj;
    try {
        const bytes = base64UrlToBytes(str);
        const json = new TextDecoder().decode(bytes);
        obj = JSON.parse(json); // 只當資料讀，永不執行
    } catch (e) {
        throw new Error('連結格式不正確或已損壞');
    }

    assertSafeShareObject(obj);
    return obj;
}

/**
 * 字元白名單閘：遞迴走訪整包資料，任何含不允許字元的字串值或欄位名都拒絕。
 * 遇到 `topology` 字串時先 JSON.parse 再檢查（處理雙層編碼）。
 * @param {object} snapshot
 */
export function assertSafeShareObject(snapshot) {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
        throw new Error('連結內容不是有效的機構資料');
    }
    const counter = { n: 0 };
    walkStrict(snapshot, 0, counter);
}

function walkStrict(val, depth, counter) {
    if (depth > MAX_DEPTH) throw new Error('機構資料層級過深');
    if (++counter.n > MAX_NODES) throw new Error('機構資料過於龐大');

    if (typeof val === 'string') {
        if (UNSAFE_CHARS.test(val)) {
            throw new Error('機構資料含有不允許的字元（可能是惡意連結）');
        }
        return;
    }
    if (val === null || typeof val === 'number' || typeof val === 'boolean') return;

    if (Array.isArray(val)) {
        for (const v of val) walkStrict(v, depth + 1, counter);
        return;
    }
    if (typeof val === 'object') {
        for (const k of Object.keys(val)) {
            if (UNSAFE_CHARS.test(k)) throw new Error('機構資料含有不允許的欄位名');
            const child = val[k];
            // topology 是字串化的 JSON：先解開再嚴格檢查它的葉節點
            if (k === 'topology' && typeof child === 'string') {
                let parsed;
                try {
                    parsed = JSON.parse(child);
                } catch (e) {
                    throw new Error('分享的機構結構無法解析');
                }
                walkStrict(parsed, depth + 1, counter);
            } else {
                walkStrict(child, depth + 1, counter);
            }
        }
        return;
    }
    // 其他型別（function/symbol 等）不可能來自 JSON.parse，保險拒絕
    throw new Error('機構資料含有不支援的內容');
}
