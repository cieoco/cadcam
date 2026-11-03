// 手機工作區驗收：390×844 與 360×640 量「沒被擋住的工作區高度」佔畫面高度的比例，
// 另檢查置中只用看得到的區域、訊息不擋點選、抽屜三段與桌機版面不變。
//
//   node tools/mobile-workspace-check.mjs                       檢查目前程式（自己開本機靜態伺服器）
//   node tools/mobile-workspace-check.mjs --base http://127.0.0.1:8731/   改用已經在跑的伺服器（例如舊版的複本）
//   --tag before|after      截圖檔名標籤（預設 after）；before 只印表格、不做通過／失敗判斷
//   --shots <資料夾>        截圖輸出位置（預設 output/mspace）
//   --desktop               另外拍 1280×800 桌機截圖（供前後比對）
//
// 「沒被擋住」：畫布 svg 範圍內，逐列取樣三個欄位，最上層元素都還是畫布本身（點得到零件）才算。
// 抽屜、播放列、浮動卡片都會被扣掉；pointer-events:none 的訊息不算擋住（點擊會穿透），另外專門測。
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {extname, join, normalize, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = n => args.includes(`--${n}`);
const opt = (n, d = '') => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const tag = opt('tag', 'after'), shots = resolve(opt('shots', join(root, 'output/mspace')));
const gate = tag !== 'before';
const load = async () => {
  try { return await import('playwright'); } catch { /* 全域安裝 */ }
  const base = execFileSync('npm', ['root', '-g'], {encoding: 'utf8'}).trim() + '/';
  return createRequire(base)('playwright');
};
const {chromium} = await load();
const types = {'.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.mjs': 'text/javascript;charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp'};
let server = null, base = opt('base');
if (!base) {
  server = createServer(async (req, res) => {
    try {
      const file = join(root, normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '') || 'index.html');
      if (!file.startsWith(root)) throw Error('outside');
      res.writeHead(200, {'content-type': types[extname(file)] || 'application/octet-stream'}); res.end(await readFile(file));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
}
await mkdir(shots, {recursive: true});
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium'});
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : gate ? 'FAIL' : 'note'} ${m}`); if (!c && gate) failed++; };

// 在頁面裡量：沒被擋住的畫布高度、第一個被擋住的 y、機構外框（畫面 px）
const MEASURE = () => {
  const svg = document.getElementById('stageSvg'), r = svg.getBoundingClientRect(), vh = innerHeight;
  const xs = [0.12, 0.5, 0.88].map(f => r.left + r.width * f), step = 2;
  let free = 0, firstBlocked = null, blockers = new Set();
  for (let y = Math.max(0, Math.ceil(r.top)); y < Math.min(vh, r.bottom); y += step) {
    let clear = true;
    for (const x of xs) {
      const top = document.elementsFromPoint(x, y)[0];
      if (!top || !(top === svg || svg.contains(top))) { clear = false; if (top) blockers.add(top.id || top.className?.baseVal || top.className || top.tagName); }
    }
    if (clear) free += step; else if (firstBlocked === null) firstBlocked = y;
  }
  let L = 1e9, T = 1e9, R = -1e9, B = -1e9;
  for (const el of svg.children) {
    const b = el.getBoundingClientRect();
    if (!b.width && !b.height) continue;
    if (el.id === 'dimLayer' || el.getAttribute('pointer-events') === 'none' || el.style.pointerEvents === 'none') continue;
    L = Math.min(L, b.left); T = Math.min(T, b.top); R = Math.max(R, b.right); B = Math.max(B, b.bottom);
  }
  return {free, vh, ratio: free / vh, top: r.top, visibleBottom: firstBlocked ?? r.bottom, bbox: R > L ? {L, T, R, B} : null, blockers: [...blockers], sheet: document.body.dataset.sheet || '-'};
};
const inside = m => !m.bbox || (m.bbox.L >= -1 && m.bbox.R <= 391 + 1000 && m.bbox.T >= m.top - 1 && m.bbox.B <= m.visibleBottom + 1);

async function fresh(vp, query = '') {
  const ctx = await browser.newContext({viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 2});
  await ctx.addInitScript(() => { try { localStorage.setItem('blocks.startGallerySeen', '1'); } catch { /* 工具腳本不要被開始畫面擋住 */ } });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGEERROR', e.message); failed++; });
  await page.goto(base + 'blocks.html' + query);
  await page.waitForSelector('#modeBtnDesign');
  await sleep(900);
  return {ctx, page};
}
const settle = async (page, ms = 500) => { await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); await sleep(ms); };
// 桿件上真的點得到的位置（避開孔位與馬達）
const hitPoint = (page, id) => page.evaluate(id => {
  const sel = `[data-link-id="${id}"],[data-pick-component="${id}"]`, e = document.querySelector('#stageSvg ' + sel), b = e.getBoundingClientRect();
  for (let i = 1; i < 30; i++) for (let j = 1; j < 30; j++) {
    const x = b.x + b.width * i / 30, y = b.y + b.height * j / 30;
    if (document.elementFromPoint(x, y)?.closest(sel)) return [x, y];
  }
  return null;
}, id);
const hasSheet = page => page.evaluate(() => !!document.getElementById('workSheet') && getComputedStyle(document.getElementById('workSheet')).display !== 'none');
// 抽屜轉到指定高度（舊版沒有抽屜就跳過）：點摘要列往上展開，全開再點收回一段，Esc 收合
async function setSheetTo(page, state) {
  if (!await hasSheet(page)) return false;
  const rank = {collapsed: 0, half: 1, full: 2}, cur = () => page.evaluate(() => document.body.dataset.sheet || 'collapsed');
  for (let i = 0; i < 4 && await cur() !== state; i++) {
    const c = await cur();
    if (state === 'collapsed') { await page.focus('#sheetBar'); await page.keyboard.press('Escape'); }
    else if (rank[c] < rank[state] || c === 'full') await page.tap('#sheetBar');
    await settle(page, 150);
  }
  return await cur() === state;
}

const STATES = {
  blank: async () => {},
  example: async page => { await page.evaluate(() => window.blocks.loadExample('fourbar-crank-rocker')); await sleep(4800); },
  selected: async page => {
    await page.evaluate(() => window.blocks.loadExample('fourbar-crank-rocker')); await sleep(4800);
    const pt = await hitPoint(page, 'Link2'); await page.touchscreen.tap(...pt); await settle(page, 600);
  },
  measuring: async page => {
    await page.evaluate(() => window.blocks.loadExample('fourbar-crank-rocker')); await sleep(1200);
    await page.tap('.mobile-tab[data-tab="view"]'); await settle(page, 250);
    await page.locator('[data-command="dimension"]').filter({visible: true}).first().click(); await settle(page, 900);
    // 量尺開始選點時抽屜會讓出畫布；挑一顆看得到、沒被擋住的點
    const [x, y] = await page.evaluate(() => {
      const c = [...document.querySelectorAll('#dimLayer circle')].map(e => e.getBoundingClientRect()).filter(b => b.width > 8)
        .map(b => [b.x + b.width / 2, b.y + b.height / 2]).find(([x, y]) => document.elementsFromPoint(x, y)[0]?.closest('#stageSvg'));
      return c;
    });
    await page.touchscreen.tap(x, y); await settle(page, 500);
    await page.getByRole('button', {name: '到地面'}).filter({visible: true}).first().click(); await settle(page, 1500);
    if (await hasSheet(page)) { const top = await page.evaluate(() => document.getElementById('stageSvg').getBoundingClientRect().top); await page.touchscreen.tap(24, top + 30); await settle(page, 400); }   // 點空白：抽屜收合，只剩畫出來的尺寸線
    await sleep(500);
  },
  lesson: async (page, vp, ctx) => {
    await page.goto(base + 'blocks.html?example=unit6-start'); await page.waitForSelector('dialog.example-entry-dialog button:has-text("載入此範例")');
    await page.click('dialog.example-entry-dialog button:has-text("載入此範例")'); await sleep(4800);
  }
};
const rows = [];
for (const vp of [{width: 390, height: 844}, {width: 360, height: 640}]) {
  for (const [name, run] of Object.entries(STATES)) {
    const {ctx, page} = await fresh(vp);
    try { await run(page, vp, ctx); } catch (e) { console.log(`STEP-FAIL ${name} ${vp.width}x${vp.height}: ${e.message.split('\n')[0]}`); failed++; await page.screenshot({path: join(shots, `mspace_${tag}_${name}_${vp.width}x${vp.height}_err.png`)}); await ctx.close(); continue; }
    await settle(page, 300);
    const m = await page.evaluate(MEASURE), row = {state: name, vp: `${vp.width}x${vp.height}`, default: m, sheet: m.sheet};
    await page.screenshot({path: join(shots, `mspace_${tag}_${name}_${vp.width}x${vp.height}.png`)});
    if (await hasSheet(page)) {
      for (const st of ['half', 'full']) {
        if (await setSheetTo(page, st)) { await settle(page, 200); row[st] = await page.evaluate(MEASURE); await page.screenshot({path: join(shots, `mspace_${tag}_${name}_${vp.width}x${vp.height}_${st}.png`)}); }
      }
    }
    rows.push(row);
    ok(m.ratio >= 0.6, `${name} ${row.vp}：預設${m.sheet === '-' ? '' : `（${m.sheet}）`}工作區 ${(m.ratio * 100).toFixed(1)}%（≥60%）${m.blockers.length ? ' 擋住的：' + m.blockers.join(',') : ''}`);
    if (['example', 'lesson'].includes(name)) ok(inside(m), `${name} ${row.vp}：機構外框在看得到的區域內（機構 y ${m.bbox && m.bbox.T.toFixed(0)}–${m.bbox && m.bbox.B.toFixed(0)}，可見 ${m.top.toFixed(0)}–${m.visibleBottom.toFixed(0)}）`);
    await ctx.close();
  }
}
console.log('\n狀態            視窗      預設      半開      全開');
for (const r of rows) console.log(`${r.state.padEnd(14)} ${r.vp.padEnd(9)} ${(r.default.ratio * 100).toFixed(1).padStart(5)}%    ${r.half ? (r.half.ratio * 100).toFixed(1).padStart(5) + '%' : '    -'}    ${r.full ? (r.full.ratio * 100).toFixed(1).padStart(5) + '%' : '    -'}`);

// ---------- 訊息顯示時，點它底下的桿件要選得到 ----------
for (const vp of [{width: 390, height: 844}, {width: 360, height: 640}]) {
  const {ctx, page} = await fresh(vp);
  await page.evaluate(() => window.blocks.loadExample('fourbar-crank-rocker')); await sleep(350);   // 「已載入」訊息剛出現
  const rect = () => page.evaluate(() => { const e = document.getElementById('modeBanner'), b = e.getBoundingClientRect(); return {x: b.x, y: b.y, w: b.width, h: b.height, shown: getComputedStyle(e).display !== 'none'}; });
  const under = r => page.evaluate(r => {
    for (let y = r.y + 3; y < r.y + r.h - 3; y += 2) for (let x = r.x + 6; x < r.x + r.w - 6; x += 3) {
      const hit = document.elementFromPoint(x, y)?.closest('[data-link-id]');
      if (hit) return [x, y, hit.dataset.linkId];
    }
    return null;
  }, r);
  let target = null, r = await rect();
  // 把畫面一步一步往上拖（空白處平移），讓某根桿剛好經過訊息的位置
  for (let i = 0; i < 9 && r.shown && !(target = await under(r)); i++) {
    await page.mouse.move(20, vp.height * 0.62); await page.mouse.down(); await page.mouse.move(20, vp.height * 0.62 - 45, {steps: 3}); await page.mouse.up();
    r = await rect();
  }
  if (!target) { ok(false, `訊息穿透 ${vp.width}x${vp.height}：找不到落在訊息下的桿件（訊息${r.shown ? '' : '已消失'}）`); await ctx.close(); continue; }
  const label = await page.evaluate(() => document.getElementById('modeBanner').textContent);
  await page.touchscreen.tap(target[0], target[1]); await settle(page, 400);
  const selected = await page.evaluate(() => document.getElementById('lenEditor').style.display === 'flex');
  const pe = await page.evaluate(() => getComputedStyle(document.getElementById('modeBanner')).pointerEvents);
  ok(selected && pe === 'none', `訊息穿透 ${vp.width}x${vp.height}：訊息「${label.slice(0, 14)}」顯示中（y ${r.y.toFixed(0)}–${(r.y + r.h).toFixed(0)}），點它底下的 ${target[2]} 被選取，訊息 pointer-events:${pe}`);
  await page.screenshot({path: join(shots, `mspace_${tag}_message_${vp.width}x${vp.height}.png`)});
  await ctx.close();
}

// ---------- 抽屜行為（新版才有）----------
{
  const {ctx, page} = await fresh({width: 390, height: 844});
  if (await hasSheet(page)) {
    const st = () => page.evaluate(() => document.body.dataset.sheet || 'collapsed');
    ok(await st() === 'collapsed', '抽屜預設收合');
    await page.tap('.mobile-tab[data-tab="build"]'); await settle(page, 200); ok(await st() === 'half', '點下方分頁：半開');
    await page.tap('#sheetBar'); await settle(page, 200); ok(await st() === 'full', '點摘要列：再展開一段（全開）');
    await page.tap('#sheetBar'); await settle(page, 200); ok(await st() === 'half', '全開時再點摘要列：收回一段');
    await page.touchscreen.tap(195, 250); await settle(page, 200); ok(await st() === 'collapsed', '點畫布空白處：收合');
    await page.tap('.mobile-tab[data-tab="build"]'); await settle(page, 200);
    await page.mouse.move(195, 250); await page.mouse.down(); await page.mouse.move(195, 300, {steps: 5}); await page.mouse.up(); await settle(page, 200);
    ok(await st() === 'collapsed', '開始拖曳／平移畫布：收合');
    await page.tap('.mobile-tab[data-tab="build"]'); await settle(page, 200);
    await page.mouse.move(195, 250); await page.mouse.wheel(0, -200); await settle(page, 200); ok(await st() === 'collapsed', '滾輪縮放：收合');
    const grab = await page.evaluate(() => { const g = document.querySelector('.sheet-grab'); return g && g.getBoundingClientRect().width > 20; });
    ok(grab, '有看得到的抓取把手');
    // 選零件：維持收合、出現精簡列
    await page.evaluate(() => window.blocks.loadExample('fourbar-crank-rocker')); await sleep(900);
    const pt = await hitPoint(page, 'Link2'); await page.touchscreen.tap(...pt); await settle(page, 400);
    const text = await page.textContent('#sheetSummary'), more = await page.textContent('#sheetMore');
    ok(await st() === 'collapsed' && /連桿/.test(text) && /更多/.test(more), `選取零件：維持收合，精簡列「${text}」＋「${more.trim()}」`);
    await page.tap('#sheetBar'); await settle(page, 200); ok(await st() === 'half', '點精簡列：展開到半開');
    const inputVisible = await page.evaluate(() => { const i = document.getElementById('memberDimensionInput'); return !!i && i.getBoundingClientRect().height > 0 && i.getBoundingClientRect().bottom <= document.getElementById('workSheet').getBoundingClientRect().bottom; });
    ok(inputVisible, '半開就看得到主要欄位（孔距）');
  } else console.log('（舊版沒有抽屜，略過抽屜檢查）');
  await ctx.close();
}

// ---------- 桌機截圖：前後比對 ----------
if (flag('desktop')) {
  const ctx = await browser.newContext({viewport: {width: 1280, height: 800}});
  await ctx.addInitScript(() => { try { localStorage.setItem('blocks.startGallerySeen', '1'); } catch { /* 工具腳本不要被開始畫面擋住 */ } });
  const page = await ctx.newPage();
  await page.goto(base + 'blocks.html'); await page.waitForSelector('#modeBtnDesign'); await sleep(900);
  await page.addStyleTag({content: '#versionBtn,[data-command="version"]{visibility:hidden!important}'});
  await page.screenshot({path: join(shots, `mspace_${tag}_desktop_blank.png`)});
  await page.evaluate(() => window.blocks.loadExample('fourbar-crank-rocker')); await sleep(4800);
  await page.screenshot({path: join(shots, `mspace_${tag}_desktop_example.png`)});
  const pt = await hitPoint(page, 'Link2'); await page.mouse.click(...pt); await sleep(700);
  await page.screenshot({path: join(shots, `mspace_${tag}_desktop_selected.png`)});
  await page.evaluate(() => window.blocks.startDimension()); await sleep(900);
  await page.screenshot({path: join(shots, `mspace_${tag}_desktop_measure.png`)});
  await ctx.close();
}
await browser.close();
server?.close();
console.log(failed ? `\nFAILED ${failed}` : '\nmobile-workspace-check: all passed');
process.exit(failed ? 1 : 0);
