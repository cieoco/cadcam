// 重錄教學頁的手機操作截圖（390×844，與原圖同尺寸）。UI 改版後只要執行這一個指令。
//
//   node tools/capture-tutorial-shots.mjs                 全部重錄到 output/tutorial-shots/（不動教材）
//   node tools/capture-tutorial-shots.mjs --only slider-length,first-link-add
//   node tools/capture-tutorial-shots.mjs --publish       另外覆蓋 media/tutorials/keyshots、assets/teaching/hydraulic，
//                                                         並依畫面實際位置更新教學頁 .shot-mark 圈選編號
//   node tools/capture-tutorial-shots.mjs --list          只列出清單
//   --include-ok                                          連審核判定仍相符（verify）的圖也一併覆蓋
//
// 需要 Playwright 與 Chromium（CHROMIUM 環境變數可指定路徑）。自己開本機靜態伺服器，不需另外啟動。
// 每張圖用全新的瀏覽器環境，從網址範例或空白畫布走真實按鈕到教學當下的狀態；
// 編號圈選（marks）用目標元素在畫面上的實際位置計算，教學頁 HTML 不必手算百分比。
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { extname, join, normalize, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const value = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : ''; };
const outDir = resolve(value('out') || join(root, 'output/tutorial-shots'));
const only = value('only') ? new Set(value('only').split(',')) : null;

const MEDIA = 'media/tutorials/keyshots';
const HYD = 'assets/teaching/hydraulic';
const W = 390, H = 844;

// ───────── 共用小工具（每張圖的 run 只用這些） ─────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

class Shot {
  constructor(page) { this.p = page; this.rects = []; }
  /** 等畫面穩定（動畫、toast 淡入） */
  async settle(ms = 400) { await this.p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); await sleep(ms); }
  /** 開範例：網址深連結 → 按「載入此範例」。id 空白＝空白畫布 */
  async open(id) {
    await this.p.goto(this.base + 'blocks.html' + (id ? `?example=${id}` : ''));
    await this.p.waitForSelector('#modeBtnDesign');
    if (id) { await this.p.click('dialog.example-entry-dialog button:has-text("載入此範例")'); }
    await this.settle(600);
  }
  /** 手機下方分頁：build 新增／edit 調整／view 視圖／project 專案 */
  async tab(name) { await this.p.click(`.mobile-tab[data-tab="${name}"]`); await this.settle(300); }
  /** 指令按鈕（新增面板、視圖、專案等共用 data-command） */
  async cmd(id) { await this.p.locator(`.mobile-panel [data-command="${id}"], .part-palette [data-command="${id}"]`).filter({ visible: true }).first().click(); await this.settle(300); }
  /** 展開／收合新增面板的分類（常用零件以外）：其他零件、加入模組、外掛 */
  async section(id, open = true) { await this.p.evaluate(([id, open]) => { const d = document.querySelector(`[data-add-section="${id}"]`); if (d) d.open = open; }, [id, open]); await this.settle(200); }
  async tap(x, y) { await this.p.touchscreen.tap(x, y); await this.settle(250); }
  async text(label, opts = {}) { await this.p.locator(`button:has-text("${label}"), summary:has-text("${label}")`).filter({ visible: true }).first().click(opts); await this.settle(300); }
  async mode(name) { await this.p.click(name === 'bench' ? '#modeBtnBench' : '#modeBtnDesign'); await this.settle(500); }
  /** 在數值欄輸入並離開欄位 */
  async fill(selector, v) { const el = this.p.locator(selector).filter({ visible: true }).first(); await el.fill(String(v)); await el.press('Enter'); await el.blur().catch(() => {}); await this.settle(300); }
  /** 畫兩點桿（手機：新增 → 連桿，依序點頭尾） */
  async drawBar(a, b) { await this.tab('build'); await this.cmd('bar'); await this.tap(...a); await this.tap(...b); }
  /** 完成／收合調整面板 */
  async done() { await this.text('完成／收合'); }
  /** 新增 → 馬達 → TT／N20 → 在預覽圖點第 n 個孔 → 確認安裝 */
  async installMotor(type = 'TT馬達', hole = 0) {
    await this.tab('build'); await this.cmd('motor'); await this.text(type);
    const circles = this.p.locator('#motorInstallation svg circle'); await circles.first().waitFor();
    const boxes = (await circles.evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width }; })))
      .filter(b => b.w > 8 && b.w < 20).sort((a, b) => a.x - b.x);
    await this.tap(boxes[hole].x, boxes[hole].y); await this.text('確認安裝'); await this.settle(500);
  }
  /** 畫布上接點 id 的畫面中心（取最小的那顆圓＝可見的孔，不是透明點選圈） */
  async node(id) {
    const r = await this.p.evaluate(id => [...document.querySelectorAll(`#stageSvg circle[data-id="${id}"]`)].map(e => e.getBoundingClientRect()).filter(b => b.width).sort((a, b) => a.width - b.width)[0] || null, id);
    if (!r) throw Error('node not found: ' + id);
    return [r.x + r.width / 2, r.y + r.height / 2];
  }
  /** 點接點；若跳出「這裡有多個物件」，pick 指定要選哪一項（按鈕文字片段） */
  async tapNode(id, pick) {
    await this.tap(...await this.node(id));
    if (pick && await this.p.getByText('這裡有多個物件').isVisible().catch(() => false)) { await this.p.locator(`button:has-text("${pick}")`).first().click(); await this.settle(400); }
  }
  /** 點兩個接點中間（點桿身選取） */
  async tapBetween(a, b) { const [p, q] = [await this.node(a), await this.node(b)]; await this.tap((p[0] + q[0]) / 2, (p[1] + q[1]) / 2); }
  /** 點桿身；手機若跳出「這裡有多個物件」就選連桿那一項 */
  async pickBar(a, b, name = '連桿 ·') {
    await this.tapBetween(a, b);
    const picker = this.p.getByText('這裡有多個物件', { exact: false });
    if (await picker.isVisible().catch(() => false)) { await this.p.locator(`button:has-text("${name}")`).first().click(); await this.settle(400); }
  }
  /** 元件（齒輪等，data-pick-component）在畫面上的外框 */
  async comp(id) {
    const r = await this.p.evaluate(id => { const b = document.querySelector(`#stageSvg [data-pick-component="${id}"]`)?.getBoundingClientRect(); return b && { x: b.x, y: b.y, w: b.width, h: b.height }; }, id);
    if (!r) throw Error('component not found: ' + id);
    return r;
  }
  /** 真的點得到該元件的位置（避開壓在上面的馬達、孔位）：由外圈往內、由上往下掃 */
  async hitComp(id) {
    const pt = await this.p.evaluate(id => {
      const b = document.querySelector(`#stageSvg [data-pick-component="${id}"]`).getBoundingClientRect(), cx = b.x + b.width / 2, cy = b.y + b.height / 2;
      for (const f of [0.42, 0.38, 0.34, 0.3, 0.25, 0.2]) for (let a = -90; a < 270; a += 10) {
        const r = a * Math.PI / 180, x = cx + Math.cos(r) * f * b.width, y = cy + Math.sin(r) * f * b.height;
        if (document.elementFromPoint(x, y)?.closest('[data-pick-component]')?.dataset.pickComponent === id) return [x, y];
      }
      return null;
    }, id);
    if (!pt) throw Error('no hit point for ' + id); return pt;
  }
  /** 以 (x,y) 為中心放大畫布（手機用雙指，這裡用滾輪）；選小元件前用，選完再按置中 */
  async zoom(x, y, notches = 3) { await this.p.mouse.move(x, y); for (let i = 0; i < notches; i++) { await this.p.mouse.wheel(0, -300); await sleep(60); } await this.settle(300); }
  async zoomOn(id, notches = 3) { const r = await this.comp(id); await this.zoom(r.x + r.w / 2, r.y + r.h / 2, notches); }
  /** 桿件／板件（data-link-id）上真的點得到的位置：在外框內掃格點 */
  async tapLink(id) {
    const pt = await this.p.evaluate(id => {
      const sel = `[data-link-id="${id}"],[data-pick-component="${id}"]`;
      const b = document.querySelector('#stageSvg ' + sel).getBoundingClientRect();
      for (let i = 1; i < 24; i++) for (let j = 1; j < 24; j++) {
        const x = b.x + b.width * i / 24, y = b.y + b.height * j / 24;
        if (document.elementFromPoint(x, y)?.closest(sel)) return [x, y];
      }
      return null;
    }, id);
    if (!pt) throw Error('no hit point for ' + id); await this.tap(...pt);
  }
  async tapHit(id) { await this.tap(...await this.hitComp(id)); }
  async tapComp(id, dx = 0, dy = 0) { const r = await this.comp(id); await this.tap(r.x + r.w / 2 + dx * r.w, r.y + r.h / 2 + dy * r.h); }
  /** 把某元素所在的可捲動面板捲到該元素置中（edge: 'bottom' 則捲到底） */
  async scrollTo(locator, edge) {
    await locator.evaluate((el, edge) => {
      let p = el.parentElement; while (p && !(p.scrollHeight > p.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(p).overflowY))) p = p.parentElement;
      if (!p) return; if (edge === 'bottom') p.scrollTop = p.scrollHeight; else el.scrollIntoView({ block: edge || 'center' });
    }, edge); await this.settle(250);
  }
  /** 等畫布上的提示訊息自己消失（原圖沒有提示時用） */
  async quiet() { await this.p.waitForFunction(() => { const b = document.getElementById('modeBanner'); return !b || !b.textContent.trim() || getComputedStyle(b).display === 'none' || getComputedStyle(b).opacity === '0'; }, null, { timeout: 8000 }).catch(() => {}); await this.settle(500); }
  /** 收起手機「新增」面板（原圖保留較大的畫布） */
  async collapseAdd() { await this.p.evaluate(() => document.querySelectorAll('.part-palette > details, .part-palette > summary').forEach(d => { if (d.tagName === 'DETAILS') d.open = false; })); await this.p.locator('.part-palette > summary, .part-palette summary').first().evaluate(el => el.parentElement.tagName === 'DETAILS' && (el.parentElement.open = false)).catch(() => {}); await this.settle(300); }
  /** 用程式選桿（畫面上被馬達或孔位蓋住、手指點不到時）；之後面板與手指點選相同 */
  async selectLink(id) { await this.p.evaluate(id => window.blocks.selectLink(id), id); await this.settle(400); }
  async fit() { await this.p.locator('.controls [data-command="fitView"]').click(); await this.settle(400); }
  /** 登記要圈選的元素（依序＝①②③）；locator 或 [x,y] 畫面座標 */
  async mark(...targets) {
    this.rects = [];
    for (const t of targets) {
      if (Array.isArray(t)) { this.rects.push({ x: t[0], y: t[1] }); continue; }
      const box = await (typeof t === 'string' ? this.p.locator(t).filter({ visible: true }).first() : t).boundingBox();
      if (!box) throw Error(`mark target not visible: ${t}`);
      this.rects.push({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    }
  }
  async pause() { // 播放中就按暫停
    const play = this.p.locator('#playBtn'); if ((await play.textContent()).trim() !== '▶') { await play.click(); await this.settle(300); }
  }
  /** 播放到角度（度）後立刻暫停（在頁面內逐畫格檢查，誤差不超過一格） */
  async playTo(deg) {
    await this.p.evaluate(d => new Promise(done => {
      const theta = document.getElementById('thetaVal'), play = document.getElementById('playBtn');
      play.click();
      const tick = () => { if (Number(theta.textContent) >= d) { play.click(); done(); } else requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }), deg);
    await this.settle(400);
  }
  async angle() { return Number(await this.p.locator('#thetaVal').textContent()) || 0; }
}

// ───────── 清單 ─────────
// file：發佈位置；page：用到這張圖的教學頁；run(s)：走到畫面；marks 在 run 內以 s.mark(...) 登記。
export const SHOTS = [];
const add = (file, page, run, opts = {}) => SHOTS.push({ file, page, run, ...opts });

// 第一單元（teaching.html）
add(`${MEDIA}/first-link-add.png`, 'teaching.html', async s => {
  await s.open();
  await s.mark('.mobile-tab[data-tab="build"]', '.part-palette [data-command="bar"]');
});

add(`${MEDIA}/first-link-size.png`, 'teaching.html', async s => {
  await s.open(); await s.drawBar([87, 300], [304, 300]);
  await s.fill('#memberDimensionInput', 80); await s.fit();
  await s.mark(s.p.getByText('孔距 A–B', { exact: true }).locator('visible=true').first(), '#memberDimensionInput', 'button:has-text("完成／收合")');
});
add(`${MEDIA}/first-link-play.png`, 'teaching.html', async s => {
  await s.open(); await s.drawBar([87, 300], [304, 300]); await s.fill('#memberDimensionInput', 80); await s.done();
  await s.installMotor(); await s.fit(); await s.playTo(28); await s.tab('view');
  await s.mark('#playBtn');
});
add(`${MEDIA}/first-link-save.png`, 'teaching.html', async s => {
  await s.open(); await s.drawBar([87, 300], [304, 300]); await s.fill('#memberDimensionInput', 80); await s.done();
  await s.installMotor(); await s.fit(); await s.playTo(28); await s.tab('project');
  await s.mark('.mobile-tab[data-tab="project"]', '.mobile-panel [data-command="save"]', '.mobile-panel [data-command="open"]');
});

add(`${MEDIA}/member-tools-current.png`, 'teaching.html', async s => {
  // 同一張圖給第一單元速查、第五課（折線桿）、第七課（三角板）共用：新增面板展開「其他零件」
  await s.open('wiper-missing-coupler'); await s.tab('build'); await s.p.locator('.part-palette > summary, .mobile-panel summary').first().click().catch(() => {});
  await s.section('other', true);
});

// 第二單元（teaching-fourbar.html）：缺桿雨刷
async function openWiper(s) { await s.open('wiper-missing-coupler'); await s.tab('build'); await s.quiet(); }
add(`${MEDIA}/wiper-add-current.png`, 'teaching-fourbar.html', async s => { await openWiper(s); });
add(`${MEDIA}/wiper-connect-current.png`, 'teaching-fourbar.html', async s => {
  await openWiper(s); await s.cmd('bar'); await s.tapNode('C'); await s.tapNode('D');
});
add(`${MEDIA}/wiper-length-current.png`, 'teaching-fourbar.html', async s => {
  await openWiper(s); await s.cmd('bar'); await s.tapNode('C'); await s.tapNode('D'); await s.done();
  await s.tab('edit'); await s.pickBar('A', 'C'); await s.p.locator('#lenPlusBtn').click({ timeout: 5000 }); await s.settle(400);
});

// 第四單元（teaching-gears.html）：齒輪對
add(`${MEDIA}/gears-select.webp`, 'teaching-gears.html', async s => {
  await s.open('gear-pair'); await s.fit(); await s.tab('edit'); await s.quiet();
  const a = await s.comp('GearA'), b = await s.comp('GearB');
  await s.mark([a.x + a.w / 2, a.y + a.h / 2], [b.x + b.w * 0.72, b.y + b.h * 0.28]);
});
async function selectGearB(s) { await s.open('gear-pair'); await s.fit(); await s.tab('edit'); await s.tapHit('GearB'); }
add(`${MEDIA}/gears-direct-motor.png`, 'teaching-gears.html', async s => {
  await selectGearB(s); await s.text('更多：傳動、孔位與動力'); await s.scrollTo(s.p.getByText('使用 MG995 舵機'), 'center');
});
add(`${MEDIA}/gears-direct-servo.png`, 'teaching-gears.html', async s => {
  await selectGearB(s); await s.text('更多：傳動、孔位與動力'); await s.text('使用 MG995 舵機');
  const end = s.p.getByText('結束', { exact: true }); await s.scrollTo(end, 'center');
  const row = end.locator('xpath=ancestor::*[.//button][1]');
  for (let i = 0; i < 4; i++) await row.locator('button:has-text("−")').click();
  await s.settle(300);
});
add(`${MEDIA}/gears-teeth.webp`, 'teaching-gears.html', async s => {
  await selectGearB(s);
  const plus = s.p.getByText('齒數', { exact: true }).first().locator('xpath=following::button[normalize-space()="＋"][1]');
  for (let i = 0; i < 10; i++) await plus.click();
  await s.quiet(); await s.fit(); await s.mark(plus);
});

// 第四單元延伸：鏈條傳動（sprocket-chain）
add(`${MEDIA}/chain-example.png`, 'teaching-gears.html', async s => { await s.open('sprocket-chain'); await s.tab('build'); await s.collapseAdd(); await s.quiet(); });
async function chainPanel(s) {
  await s.open('sprocket-chain'); await s.tab('edit'); await s.quiet(); await s.tapHit('SprocketB');
  await s.text('更多：包角、偏差與動力');
}
add(`${MEDIA}/chain-warning.png`, 'teaching-gears.html', async s => {
  await chainPanel(s);
  const plus = s.p.getByText('兩輪距離', { exact: true }).first().locator('xpath=following::button[normalize-space()="＋"][1]');
  for (let i = 0; i < 3; i++) await plus.click();
  await s.quiet();
});
add(`${MEDIA}/chain-aligned.png`, 'teaching-gears.html', async s => {
  await chainPanel(s);
  const plus = s.p.getByText('兩輪距離', { exact: true }).first().locator('xpath=following::button[normalize-space()="＋"][1]');
  for (let i = 0; i < 3; i++) await plus.click();
  await s.text('對齊整數鏈節'); await s.settle(600);
});

// 第六單元（teaching-rack.html）：齒條升降器（從本課的起始練習檔 unit6-start 開始）
add(`${MEDIA}/rack-select.webp`, 'teaching-rack.html', async s => {
  await s.open('unit6-start'); await s.fit(); await s.tab('build'); await s.collapseAdd(); await s.quiet();
  const g = await s.comp('LiftPinion'); await s.mark([g.x + g.w / 2, g.y + g.h * 0.2]);
});
add(`${MEDIA}/rack-slot.webp`, 'teaching-rack.html', async s => {
  await s.open('unit6-start'); await s.tab('edit'); await s.zoomOn('LiftPinion', 5); await s.tapHit('LiftPinion'); await s.fit(); await s.text('更多：傳動、孔位與動力');
  const row = s.p.getByText('導軌槽長', { exact: true }).first();
  await s.scrollTo(row, 'center');
  const minus = row.locator('xpath=following::button[normalize-space()="−"][1]');
  for (let i = 0; i < 2; i++) await minus.click();
  await s.quiet(); await s.mark(minus);
});

// 第三單元（teaching-slider.html）：滑塊曲柄推送器
add(`${MEDIA}/slider-add-current.png`, 'teaching-slider.html', async s => {
  await s.open('slider-crank-practice'); await s.fit(); await s.tab('build');
});
async function sliderConnect(s) { await s.open('slider-crank-practice'); await s.fit(); await s.tab('build'); await s.quiet(); await s.cmd('bar'); }
add(`${MEDIA}/slider-connect.webp`, 'teaching-slider.html', async s => {
  await sliderConnect(s); await s.mark(await s.node('A'), await s.node('P3'));
});
async function sliderLength(s, to) {
  await sliderConnect(s); await s.tapNode('A'); await s.tapNode('P3'); await s.done();
  await s.tab('edit'); await s.selectLink('Link1');
  await s.p.locator('#lenPlusBtn').click(); await s.quiet();
}
add(`${MEDIA}/slider-length.webp`, 'teaching-slider.html', async s => {
  await sliderLength(s); await s.mark('#memberDimensionInput', 'button:has-text("完成／收合")');
});
add(`${MEDIA}/slider-check.png`, 'teaching-slider.html', async s => {
  await sliderLength(s); await s.done(); await s.fit(); await s.tab('project');
  await s.cmd('fabrication'); await s.text('檢查 80 mm 推送器'); await s.settle(800);
});

// 第五單元（teaching-gripper.html）：齒輪夾爪聯集
async function jawSelected(s) { await s.open('gear-gripper'); await s.tab('edit'); await s.tapLink('LeftJaw'); await s.quiet(); await s.p.locator('#memberOperationsToggle').click(); await s.settle(400); }
add(`${MEDIA}/gripper-fusion-before.webp`, 'teaching-gripper.html', async s => { await jawSelected(s); });
add(`${MEDIA}/gripper-fusion-preview.webp`, 'teaching-gripper.html', async s => {
  await jawSelected(s); await s.text('聯集／合成一片…'); await s.settle(500);
});
async function fuseLeft(s) {
  await jawSelected(s); await s.text('聯集／合成一片…'); await s.p.locator('dialog[open] button:has-text("齒輪 GearA")').click(); await s.settle(600);
  await s.text('確認合成'); await s.settle(700);
}
add(`${MEDIA}/gripper-fusion-after.webp`, 'teaching-gripper.html', async s => {
  await fuseLeft(s); await s.quiet();
  await s.mark(s.p.getByText('解除合成').first(), s.p.getByText('齒輪設定').first());
});
add(`${MEDIA}/gripper-fused-close.webp`, 'teaching-gripper.html', async s => {
  await s.open('gear-gripper'); await s.quiet();
  const open = s.p.locator('button:has-text("張開")').filter({ visible: true }).first(), close = s.p.locator('button:has-text("閉合")').filter({ visible: true }).first();
  await close.click(); await s.settle(1500); await s.mark(open, close);
});

// 第七單元（teaching-tipping-bucket.html）：單軸翻斗（從本課的起始練習檔 unit7-start 開始）
add(`${MEDIA}/bucket-assembly.webp`, 'teaching-tipping-bucket.html', async s => {
  await s.open('unit7-start'); await s.mode('bench'); await s.settle(1500); await s.mark('#modeBtnBench');
});
add(`${MEDIA}/bucket-angle.webp`, 'teaching-tipping-bucket.html', async s => {
  await s.open('unit7-start'); await s.tab('edit'); await s.tapNode('O', '舵機軸心'); await s.quiet();
  const end = s.p.getByText('結束', { exact: true }).first(); await s.scrollTo(end, 'center');
  const plus = end.locator('xpath=following::button[normalize-space()="＋"][1]');
  for (let i = 0; i < 2; i++) await plus.click();
  await s.settle(300); await s.mark(plus);
});

// 第八單元（teaching-assembly.html）：升降夾爪接合（組立模式；接合精靈在 iframe 內）
async function openAssembly(s) {
  await s.open('assembly-lift-gripper-practice'); await s.mode('bench'); await s.settle(1500);
}
const wiz = s => s.p.frameLocator('iframe[title="選面與尺寸"]');
async function wizard(s, until) {
  await s.p.locator('#benchFaceWizard').click(); await wiz(s).locator('#next').waitFor(); await s.settle(1200);
  const step = async name => { await wiz(s).locator('#next').click(); await s.settle(900); };
  if (until === 1) return;
  await step(); await wiz(s).locator('button:has-text("機架底板（建議）")').click(); await s.settle(300);   // 2 安裝零件：機架底板
  await step();                                                                                              // 3 承接面（預設前面）
  if (until === 3) return;
  await step();                                                                                              // 4 安裝面（預設下面）
  if (until === 4) return;
  await step();                                                                                              // 5 位置與方向
  await wiz(s).locator('#turnMinus').click(); await s.settle(400);                                          // −90° → 270°
  await wiz(s).locator('#mateUChip').click(); await wiz(s).locator('#dimensionValue').fill('-60');
  await wiz(s).locator('button:has-text("確定")').click(); await s.settle(900);
  const holes = wiz(s).locator('#bracketHoles');                                                            // 課文：預覽應有兩顆角碼（加入角碼固定孔）
  if (!(await holes.isChecked())) await holes.check(); await s.settle(1200);
}
add(`${MEDIA}/assembly-horizontal-start.png`, 'teaching-assembly.html', async s => { await openAssembly(s); });
add(`${MEDIA}/assembly-select-part.png`, 'teaching-assembly.html', async s => {
  await openAssembly(s); await s.p.locator('#benchFaceWizard').click(); await wiz(s).locator('#next').waitFor();
  await wiz(s).locator('button:has-text("連桿 Link1")').click(); await s.settle(800);
});
add(`${MEDIA}/assembly-host-face.png`, 'teaching-assembly.html', async s => { await openAssembly(s); await wizard(s, 3); });
add(`${MEDIA}/assembly-child-face.png`, 'teaching-assembly.html', async s => { await openAssembly(s); await wizard(s, 4); });
add(`${MEDIA}/assembly-horizontal-preview.png`, 'teaching-assembly.html', async s => { await openAssembly(s); await wizard(s, 5); });
add(`${MEDIA}/assembly-horizontal-complete.png`, 'teaching-assembly.html', async s => {
  await openAssembly(s); await wizard(s, 5); await wiz(s).locator('#next').click(); await s.settle(2500);
});

// 第九～十二單元（teaching-hydraulic.html）
const HYD_PRACTICE = 'hydraulic-h01-practice';
/** 新增 → 其他零件 → 液壓針筒 → 調整安裝，走到安裝精靈第 step 步（1～4） */
async function syringeWizard(s, step) {
  await s.open(HYD_PRACTICE); await s.tab('build'); await s.section('other', true); await s.cmd('syringe');
  await s.text('調整安裝'); await s.settle(800);
  const next = async () => { await s.p.locator('button:has-text("下一步")').filter({ visible: true }).click(); await s.settle(700); };
  await s.p.locator('select').filter({ visible: true }).first().selectOption({ label: 'H1Frame' }); await s.settle(400);   // 1 固定外殼：H1Frame、正面
  if (step === 1) return; await next();
  for (const [label, v] of [['筒身位置 X (mm)', '-100'], ['筒身位置 Y (mm)', '-60'], ['推進方向角度 (°)', '0']]) {   // 2 位置方向：X −100、Y −60、向右 0°
    const f = s.p.getByLabel(label).locator('visible=true').first(); await f.fill(v); await f.press('Tab');
  }
  await s.settle(600);
  if (step === 2) return; await next();
  const sel = s.p.locator('select').filter({ visible: true });                                                              // 3 連接輸出：H1Coupler、第一孔
  await sel.nth(0).selectOption({ label: 'H1Coupler' }); await s.settle(300); await sel.nth(1).selectOption({ index: 0 }); await s.settle(500);
  if (step === 3) return; await next();
}
add(`${HYD}/installation-frame-mobile.png`, 'teaching-hydraulic.html', s => syringeWizard(s, 1), { verify: true });
add(`${HYD}/installation-mobile.png`, 'teaching-hydraulic.html', s => syringeWizard(s, 2));
add(`${HYD}/installation-unfixed-mobile.png`, 'teaching-hydraulic.html', s => syringeWizard(s, 3), { verify: true });
add(`${HYD}/installation-trial-mobile.png`, 'teaching-hydraulic.html', async s => {
  await syringeWizard(s, 4); await s.text('檢查全行程'); await s.settle(1500);
  await s.scrollTo(s.p.getByText('更多：安裝、規格與檢查').locator('visible=true').first(), 'start'); await s.settle(300);
});

add(`${HYD}/h02-settings-mobile.png`, 'teaching-hydraulic.html', async s => {
  await s.open('hydraulic-h02'); await s.text('針筒設定'); await s.settle(800);
  await s.text('更多：安裝、規格與檢查'); await s.text('進階：針筒規格與軸向'); await s.text('其他尺寸與加工設定'); await s.settle(800);
  await s.text('更多：孔位與連桿尺寸'); await s.text('孔位 145.89 mm');   // 課文：臂端距主軸維持，只把驅動孔位選成 145.89 mm
  const dlg = s.p.locator('dialog[open]').last();
  await dlg.evaluate(d => { for (const el of [d, ...d.querySelectorAll('*')]) if (el.scrollHeight > el.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(el).overflowY)) el.scrollTop = el.scrollHeight; });
  await s.settle(400);
});

// 組立模式的液壓參考作品（組立清單、3D、動作面板）
async function hydraulicBench(s, example, pickRow) {
  await s.open(example); await s.mode('bench'); await s.settle(5000);
  if (pickRow) { await s.p.mouse.click(...pickRow); await s.settle(1200); }
}
add(`${HYD}/h05-mobile.png`, 'teaching-hydraulic.html', async s => { await hydraulicBench(s, 'hydraulic-h05'); await s.quiet(); });
add(`${HYD}/h06-mobile.png`, 'teaching-hydraulic.html', async s => { await hydraulicBench(s, 'hydraulic-h06'); await s.quiet(); });
// 第十二單元：從起始練習檔 unit12-start 開始（升降＋夾爪已接好、旋轉底盤分開），直接選「升降」開接合精靈。
add(`${HYD}/h06-face-placement-mobile.png`, 'teaching-hydraulic.html', async s => {
  await s.open('unit12-start'); await s.mode('bench'); await s.settle(5000);
  await s.p.locator('div,li,button').filter({ hasText: /^·?\s*升降\s*(未安裝)?$/ }).last().click(); await s.settle(1200);
  await s.p.locator('#benchFaceWizard').click(); await wiz(s).locator('#next').waitFor(); await s.settle(1500);
  await wiz(s).locator('button:has-text("板件 H4Turn")').click(); await wiz(s).locator('#next').click(); await s.settle(900);   // 承接：轉盤板
  await wiz(s).locator('button:has-text("H2Frame")').click(); await wiz(s).locator('#next').click(); await s.settle(900);      // 安裝：升降機架
  await wiz(s).locator('#next').click(); await s.settle(900); await wiz(s).locator('#next').click(); await s.settle(1800);     // 承接面、安裝面用預設，停在第 5 步位置調整（有干涉，尚未接上）
});

add(`${HYD}/h03-mobile.png`, 'teaching-hydraulic.html', async s => {
  await s.open('hydraulic-h03'); await s.tab('edit'); await s.tapLink('H3JawA'); await s.quiet();
});

// 第九單元加做：從空白畫三根桿（機架 208、活動臂 144、短連桿 173 mm），再用四步安裝針筒
add(`${HYD}/h01-selfdraw-mobile.png`, 'teaching-hydraulic.html', async s => {
  const setDim = async v => { await s.fill('#memberDimensionInput', v); await s.done(); };
  await s.open(); await s.drawBar([70, 330], [230, 200]); await s.fill('#memberDimensionInput', 208); await s.done(); await s.fit();     // 機架
  for (const id of ['P1a', 'P1b']) { await s.tab('edit'); await s.tapNode(id); await s.p.locator('#nodeFixedBtn').click(); await s.settle(400); }  // 兩孔都固定
  await s.tab('build'); await s.cmd('bar'); const b = await s.node('P1b'); await s.tap(...b); await s.tap(b[0] + 70, b[1] + 110);              // 擺臂：從機架右上孔往右下
  await setDim(144); await s.fit();
  await s.tab('build'); await s.cmd('bar'); const a = await s.node('P1a'), e = await s.node('P2b'); await s.tap(a[0] + 112, a[1]); await s.tap(...e);   // 短連桿：機架左下孔右方到臂端
  await setDim(173); await s.fit();
  await s.tab('build'); await s.section('other', true); await s.cmd('syringe'); await s.text('調整安裝'); await s.settle(800);
  const next = async () => { await s.p.locator('button:has-text("下一步")').filter({ visible: true }).click(); await s.settle(800); };
  await s.p.getByLabel('筒身固定在哪個零件？').selectOption('Link1'); await s.settle(500); await next();                                           // 1 固定外殼：機架
  await s.tap(69, 314); await s.settle(500); await next();                                                                                        // 2 位置方向：機架左下孔、向右
  await s.p.getByLabel('推桿接哪個短連桿？').selectOption('Link3'); await s.p.getByLabel('連接端孔').selectOption('0'); await s.settle(500); await next(); // 3 連接輸出：短連桿第一孔
  await s.text('確認安裝'); await s.settle(2000);
  await s.p.locator('input[type="range"]').filter({ visible: true }).first().fill('0'); await s.tap(40, 250);                                   // 伸出量 0.0 / 20 mm
  await s.section('other', false); await s.collapseAdd(); await s.fit();
  await s.quiet();
});

// 首頁「完成後：保存可編輯作品與動畫」（slider-crank 範例，專案 → MP4 動畫）
async function sliderProject(s) {
  await s.open('slider-crank'); await s.fit(); await s.playTo(81); await s.tab('project');
}
add(`${MEDIA}/export-project.webp`, 'teaching.html', async s => {
  await sliderProject(s); await s.mark('.mobile-tab[data-tab="project"]', '.mobile-panel [data-command="exportVideo"]');
});
add(`${MEDIA}/export-download.webp`, 'teaching.html', async s => {
  await sliderProject(s); await s.cmd('exportVideo');
  await s.p.locator('a:has-text("下載 MP4")').waitFor({ timeout: 120000 }); await s.settle(1500);
  await s.mark(s.p.locator('dialog[open] video').first(), s.p.locator('a:has-text("下載 MP4")'));
}, { mp4Shim: true });

// ───────── 執行 ─────────
const types = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.mjs': 'text/javascript;charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.wasm': 'application/wasm', '.mp4': 'video/mp4' };
async function main() {
  const selected = SHOTS.filter(x => !only || only.has(basename(x.file).replace(/\.\w+$/, '')));
  if (flag('list')) { for (const x of SHOTS) console.log(x.file, '←', x.page); return; }
  const load = async () => {
    try { return await import('playwright'); } catch { /* 全域安裝 */ }
    const base = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim() + '/';
    return createRequire(base)('playwright');
  };
  const { chromium } = await load();
  const server = createServer(async (req, res) => {
    try {
      const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '') || 'index.html';
      const file = join(root, path);
      if (!file.startsWith(root)) throw Error('outside');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
  const failures = [], marks = {};
  try {
    for (const x of selected) {
      const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, locale: 'zh-TW' });
      await context.route(url => !/^(http:\/\/127\.0\.0\.1|data:|blob:)/.test(url.href), route => route.abort()); // 不連外網，截圖不受外部資源影響
      if (x.mp4Shim) await context.route(/\/video-export\.js/, async route => {
        // 無頭 Chromium 沒有 H.264 編碼器：只為截圖把編碼改成 VP9（仍是 mediabunny 的真實匯出流程與同一個對話框）
        const res = await route.fetch(); const body = (await res.text()).replace(/'avc'/g, "'vp9'");
        await route.fulfill({ response: res, body, headers: { ...res.headers(), 'content-type': 'text/javascript;charset=utf-8' } });
      });
      const page = await context.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      const s = new Shot(page); s.base = base;
      try {
        await x.run(s);
        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('page overflows horizontally');
        if (errors.length) throw Error('page error: ' + errors[0]);
        let png = await page.screenshot({ fullPage: false });
        const out = join(outDir, basename(x.file));
        await mkdir(outDir, { recursive: true });
        const bytes = x.file.endsWith('.webp') ? await toWebp(context, png) : png;
        await writeFile(out, bytes);
        marks[x.file] = s.rects.map(r => ({ left: +(r.x / W * 100).toFixed(2), top: +(r.y / H * 100).toFixed(2) }));
        console.log('ok  ', basename(x.file), (bytes.length / 1024).toFixed(0) + 'KB');
        if (flag('publish') && !(x.verify && !flag('include-ok'))) await writeFile(join(root, x.file), bytes);   // verify＝審核時判定仍相符的圖：只輸出到 output 供比對，不覆蓋
      } catch (e) { await mkdir(outDir, { recursive: true }); await page.screenshot({ path: join(outDir, basename(x.file) + '.fail.png') }).catch(() => {}); failures.push(basename(x.file)); console.log('FAIL', basename(x.file), e.message.split('\n')[0]); }
      await context.close();
    }
  } finally { await browser.close(); server.close(); }
  await writeFile(join(outDir, 'marks.json'), JSON.stringify(marks, null, 1));
  if (flag('publish')) await updateMarks(selected.filter(x => !x.verify || flag('include-ok')), marks);
  if (failures.length) { console.log('失敗：' + failures.join(', ')); process.exitCode = 1; }
}

/** PNG → WebP（用瀏覽器內建編碼，不需額外工具） */
async function toWebp(context, png) {
  const page = await context.newPage();
  const b64 = await page.evaluate(async data => {
    const bmp = await createImageBitmap(await (await fetch('data:image/png;base64,' + data)).blob());
    const c = new OffscreenCanvas(bmp.width, bmp.height); c.getContext('2d').drawImage(bmp, 0, 0);
    const blob = await c.convertToBlob({ type: 'image/webp', quality: 0.82 });
    return btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer())));
  }, png.toString('base64'));
  await page.close();
  return Buffer.from(b64, 'base64');
}

/** 把圈選編號 .shot-mark 的 left/top 改成這次畫面上的實際位置 */
async function updateMarks(selected, marks) {
  const pages = [...new Set(selected.map(x => x.page))];
  for (const page of pages) {
    const path = join(root, page); let html = await readFile(path, 'utf8'), changed = 0;
    for (const x of selected.filter(y => y.page === page)) {
      const pts = marks[x.file]; if (!pts?.length) continue;
      const name = basename(x.file).replace(/[.]/g, '\\.');
      html = html.replace(new RegExp(`(<img[^>]*src="[^"]*${name}"[^>]*>)((?:<span class="shot-mark"[^>]*></span>)+)`), (all, img, spans) => {
        let n = 0;
        return img + spans.replace(/(<span class="shot-mark"[^>]*style=")[^"]*(")/g, (m, a, b) => { const p = pts[n++]; if (!p) return m; changed++; return `${a}left:${p.left}%;top:${p.top}%${b}`; });
      });
    }
    await writeFile(path, html);
    console.log(`marks ${page}: ${changed} 個`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
