// 重錄「功能範例」開始畫面的縮圖（480×300 webp，存到 media/start/）。縮圖來自真實範例與真實畫面，不是手繪。
//
//   node tools/capture-start-cards.mjs                    全部重錄到 media/start/
//   node tools/capture-start-cards.mjs --only wiper,gear-pair
//   node tools/capture-start-cards.mjs --out output/start-cards   改輸出資料夾（不動 media/）
//
// 做法：電腦版 1280×800 載入範例 → 隱藏介面只留畫布 → 把畫布視窗收緊到機構外框並置中（8:5）→ 截圖縮成 480×300。
// 需要 Playwright 與 Chromium（CHROMIUM 環境變數可指定路徑）。自己開本機靜態伺服器。
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { START_CARDS } from '../js/blocks/start-gallery.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const value = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : ''; };
const only = value('only') ? new Set(value('only').split(',')) : null;
const outDir = resolve(root, value('out') || 'media/start');
const W = 480, H = 300;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const key = card => card.image.replace(/^.*\/|\.\w+$/g, '');

/** 每張卡怎麼走到畫面：prepare 之後呼叫 shot('stage') 取畫布，或 shot(元素) 取某個元素。 */
const SCENES = {
  'blank-bar': async (p, shot) => {   // 空白畫布 → 真的用「連桿」畫一根桿
    await load(p, 'empty-challenge');
    await p.click('[data-command="bar"]'); await sleep(200);
    const r = await stageRect(p);
    await p.mouse.click(r.x + r.w * 0.34, r.y + r.h * 0.5); await sleep(200);
    await p.mouse.click(r.x + r.w * 0.66, r.y + r.h * 0.5); await sleep(500);
    await p.keyboard.press('Escape'); await p.mouse.click(r.x + r.w * 0.5, r.y + r.h * 0.9); await sleep(300);
    return shot('stage', { skip: 'line', pad: 2.4 });   // 空白畫布的地面線太長：不算外框、也不畫
  },
  'wiper': async (p, shot) => { await load(p, 'wiper-single'); return shot('stage'); },
  'gear-pair': async (p, shot) => { await load(p, 'gear-pair'); return shot('stage'); },
  'hydraulic': async (p, shot) => { await load(p, 'hydraulic-h01'); return shot('stage'); },
  'assembly': async (p, shot) => { await load(p, 'assembly-lift-gripper'); await p.click('#modeBtnBench'); await sleep(900); return shot('stage'); },
  'box-maker': async (p, shot) => {   // 外掛：開真實的卡榫盒子對話框，取組合預覽
    await load(p, 'empty-challenge');
    await p.evaluate(() => window.blocks.openBoxMaker());
    await p.waitForSelector('dialog.box-maker svg path', { timeout: 15000 }); await sleep(600);
    return shot(p.locator('dialog.box-maker svg'));
  }
};

async function load(p, id) {
  await p.goto(base + 'blocks.html?example=' + id);
  await p.waitForSelector('#modeBtnDesign');
  await p.click('dialog.example-entry-dialog button:has-text("載入此範例")'); await sleep(900);
  await p.click('[data-command="fitView"]').catch(() => {}); await sleep(300);
}
const stageRect = p => p.evaluate(() => { const r = document.getElementById('stageSvg').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });

/** 隱藏介面、把畫布 viewBox 收緊到機構外框（8:5，置中），回傳要截圖的範圍。 */
async function framedStage(p, { skip = '', pad = 1.22 } = {}) {
  await p.addStyleTag({ content: '.canvas-wrap > :not(#stageSvg){display:none!important}#stageSvg{background:#f5f8fc}' });
  await p.evaluate(([skip, pad]) => {
    const svg = document.getElementById('stageSvg'), inv = svg.getScreenCTM().inverse(); let box = null;
    for (const c of svg.children) {   // 畫面座標的外框（含各自的 transform），再換回畫布單位
      if (skip && c.matches(skip)) { c.style.display = 'none'; continue; }
      const r = c.getBoundingClientRect(); if (!r.width && !r.height) continue;
      const a = new DOMPoint(r.left, r.top).matrixTransform(inv), d = new DOMPoint(r.right, r.bottom).matrixTransform(inv);
      box = box ? { x0: Math.min(box.x0, a.x), y0: Math.min(box.y0, a.y), x1: Math.max(box.x1, d.x), y1: Math.max(box.y1, d.y) } : { x0: a.x, y0: a.y, x1: d.x, y1: d.y };
    }
    const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2, w = Math.max((box.x1 - box.x0) * pad, (box.y1 - box.y0) * pad * 1.6, 160);
    svg.setAttribute('viewBox', `${cx - w / 2} ${cy - w / 1.6 / 2} ${w} ${w / 1.6}`);
  }, [skip, pad]);
  await sleep(250);
  const r = await stageRect(p), h = r.w / 1.6;   // meet：寬度填滿，上下置中
  const inset = 8, k = (r.w - 2 * inset) / r.w;   // 內縮一點，避開畫布邊框與陰影
  return { x: r.x + inset, y: r.y + (r.h - h) / 2 + h * (1 - k) / 2, width: r.w - 2 * inset, height: h * k };
}

/** PNG → 480×300 webp（置中裁切、用瀏覽器內建編碼） */
async function toWebp(p, png) {
  const b64 = await p.evaluate(async ([data, W, H]) => {
    const bmp = await createImageBitmap(await (await fetch('data:image/png;base64,' + data)).blob());
    const s = Math.max(W / bmp.width, H / bmp.height), c = new OffscreenCanvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#f5f8fc'; g.fillRect(0, 0, W, H); g.imageSmoothingQuality = 'high';
    g.drawImage(bmp, (W - bmp.width * s) / 2, (H - bmp.height * s) / 2, bmp.width * s, bmp.height * s);
    const blob = await c.convertToBlob({ type: 'image/webp', quality: 0.86 });
    return btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer())));
  }, [png.toString('base64'), W, H]);
  return Buffer.from(b64, 'base64');
}

const types = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.mjs': 'text/javascript;charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.wasm': 'application/wasm' };
let base;
const load2 = async () => {
  try { return await import('playwright'); } catch { /* 全域安裝 */ }
  return createRequire(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim() + '/')('playwright');
};
const { chromium } = await load2();
const server = createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '') || 'index.html';
    const file = join(root, path); if (!file.startsWith(root)) throw Error('outside');
    const body = await readFile(file); res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' }); res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
await mkdir(outDir, { recursive: true });
let failed = 0;
try {
  for (const card of START_CARDS) {
    const id = key(card); if (only && !only.has(id)) continue;
    const scene = SCENES[id];
    if (!scene) { console.log('FAIL', id, '沒有對應的畫面腳本'); failed++; continue; }
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, locale: 'zh-TW' });
    await context.addInitScript(() => { try { localStorage.setItem('blocks.startGallerySeen', '1'); } catch { /* 不自動跳出開始畫面 */ } });
    const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    try {
      const png = await scene(page, async (what, opts) => what === 'stage' ? page.screenshot({ clip: await framedStage(page, opts) }) : what.screenshot());
      if (errors.length) throw Error('page error: ' + errors[0]);
      const bytes = await toWebp(page, png);
      await writeFile(join(outDir, `${id}.webp`), bytes);
      console.log('ok  ', `${id}.webp`, (bytes.length / 1024).toFixed(0) + 'KB');
    } catch (e) { failed++; console.log('FAIL', id, e.message.split('\n')[0]); await page.screenshot({ path: join(outDir, `${id}.fail.png`) }).catch(() => {}); }
    await context.close();
  }
} finally { await browser.close(); server.close(); }
process.exitCode = failed ? 1 : 0;
