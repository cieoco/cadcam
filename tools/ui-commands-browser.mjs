// UI-1 瀏覽器驗收：電腦（1280×800）與手機（390×844）顯示同一份指令清單。
// 用法：node tools/ui-commands-browser.mjs [截圖資料夾]　需要 Playwright 與 Chromium（CHROMIUM 環境變數可指定路徑）。
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { COMMANDS, COMMAND_GROUPS, SHORTCUTS, ADD_SECTIONS } from '../js/blocks/ui-commands.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shotsDir = process.argv[2] ? resolve(process.argv[2]) : '';
const load = async () => {
  try { return await import('playwright'); } catch { /* 全域安裝 */ }
  const base = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim() + '/';
  return createRequire(base)('playwright');
};
const { chromium } = await load();
const types = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.mjs': 'text/javascript;charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.wasm': 'application/wasm' };
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
const url = `http://127.0.0.1:${server.address().port}/blocks.html`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
if (shotsDir) await mkdir(shotsDir, { recursive: true });

let pass = 0;
const ok = (c, m) => { assert.ok(c, m); pass++; console.log('PASS', m); };
const errors = [];
const groupOf = Object.fromEntries(COMMANDS.map(c => [c.id, c.group]));
const labelOf = Object.fromEntries(COMMAND_GROUPS.map(g => [g.id, g.label]));
const inMode = (c, mode) => !c.modes || c.modes.includes(mode);
const LAYOUTS = { desktop: { viewport: { width: 1280, height: 800 } }, mobile: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } };

// 目前看得見的指令：{id, where}
const visible = page => page.evaluate(() => [...document.querySelectorAll('[data-command]')]
  .filter(el => el.checkVisibility({ checkVisibilityCSS: true }) && !el.closest('dialog:not([open])'))
  .map(el => ({ id: el.dataset.command, where: el.closest('.controls') ? 'bar' : el.closest('.canvas-toolbar') ? 'toolbar' : el.closest('.mobile-panel') ? 'panel' : el.closest('.part-palette') ? 'palette' : el.closest('header') ? 'header' : 'other' })));

// 新增面板各分類的預設狀態（順序、展開、數量、說明、按鈕順序），之後全部展開才看得到每顆按鈕
const readSections = page => page.evaluate(() => [...document.querySelectorAll('[data-add-section]')].map(d => ({ id: d.dataset.addSection, open: d.open,
  summary: d.querySelector('summary').textContent.replace(/\s+/g, ' ').trim(), items: [...d.querySelectorAll('[data-command]')].map(b => b.dataset.command) })));
const expandSections = page => page.evaluate(() => document.querySelectorAll('[data-add-section]').forEach(d => { d.open = true; }));

async function collect(page, layout, mode) {
  const seen = new Map();   // id -> Set(where)
  const add = async () => { for (const { id, where } of await visible(page)) (seen.get(id) ?? seen.set(id, new Set()).get(id)).add(where); };
  const menu = async g => { await page.click(`header [data-command-menu="${g}"] > summary`); await add(); await page.keyboard.press('Escape'); };
  const sections = mode === 'design' ? await readSections(page) : [];
  if (mode === 'design') await expandSections(page);
  await add();
  if (layout === 'desktop') { await menu('project'); await menu('help'); }
  else {
    if (mode === 'design') for (const tab of ['build', 'edit', 'view', 'project']) { await page.click(`.mobile-tab[data-tab="${tab}"]`); await add(); }
    else await menu('project');   // 組立沒有下方分頁，專案改由頂端選單
    await menu('help');
  }
  const groups = {};
  for (const g of COMMAND_GROUPS) groups[g.id] = new Set([...seen.keys()].filter(id => groupOf[id] === g.id));
  return { seen, groups, sections };
}
const same = (a, b) => [...a].every(x => b.has(x)) && [...b].every(x => a.has(x));

const results = {};
for (const mode of ['design', 'bench']) {
  for (const [layout, viewport] of Object.entries(LAYOUTS)) {
    const ctx = await browser.newContext(viewport);
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.location().url || '')) errors.push(`${layout}/${mode}: ${m.text()}`); });
    page.on('pageerror', e => errors.push(`${layout}/${mode}: ${e.message}`));
    await page.goto(url);
    await page.waitForFunction(() => window.blocks?.setMode && document.querySelector('.controls [data-command]'));
    if (mode === 'bench') { await page.evaluate(() => window.blocks.setMode('bench')); await page.waitForFunction(() => document.body.dataset.mode === 'bench'); }
    await page.waitForTimeout(300);
    if (shotsDir) await page.screenshot({ path: join(shotsDir, `ui1_${layout}_${mode}.png`) });
    const r = results[`${layout}/${mode}`] = await collect(page, layout, mode);
    const label = `${layout === 'desktop' ? '電腦' : '手機'}／${mode === 'design' ? '設計' : '組立'}`;
    // 該模式下每個指令都找得到
    const expected = COMMANDS.filter(c => inMode(c, mode)).map(c => c.id).sort();
    ok(JSON.stringify([...r.seen.keys()].sort()) === JSON.stringify(expected), `${label}：看得見的指令 = 清單中該模式的全部指令（${expected.length} 個）`);
    if (mode === 'design') {   // 新增面板：依工作順序分類，預設只展開固定、構件，收合時顯示數量與說明
      const got = r.sections.map(({ id, items }) => ({ id, items }));
      const want = ADD_SECTIONS.map(sec => ({ id: sec.id, items: COMMANDS.filter(c => c.section === sec.id).map(c => c.id) }));   // 現成組件由模組庫填入，不在指令清單
      ok(JSON.stringify(got) === JSON.stringify(want), `${label}：新增面板分類與按鈕順序＝清單（${got.map(x => x.id).join('→')}）`);
      ok(r.sections.every(x => x.open === (x.id === 'ground' || x.id === 'member')), `${label}：預設只展開固定、構件`);
      const sec = id => r.sections.find(x => x.id === id).summary;
      ok(/^傳動（3）/.test(sec('transmission')) && /^動力（4）/.test(sec('power')) && ADD_SECTIONS.every(x => sec(x.id).includes(x.hint)), `${label}：收合的分類顯示數量與說明（${sec('transmission')}）`);
      ok(await page.evaluate(() => !document.querySelector('#linkMenu, #linkMenuToggle')), `${label}：沒有「連桿 ▾」下拉`);
    }
    // 控制列的快捷鍵
    const bar = [...r.seen].filter(([, w]) => w.has('bar')).map(([id]) => id).sort();
    ok(JSON.stringify(bar) === JSON.stringify(SHORTCUTS.filter(id => inMode(byId(id), mode)).sort()), `${label}：控制列只放快捷鍵 ${bar.join('、')}`);
    // 頂端只有身分、模式切換、復原與兩個選單
    const header = await page.evaluate(() => [...document.querySelectorAll('header.appbar button, header.appbar summary, header.appbar select, header.appbar a')]
      .filter(el => el.checkVisibility({ checkVisibilityCSS: true }) && !el.closest('.cmd-menu-body')).map(el => el.id || 'menu:' + el.parentElement.dataset.commandMenu));
    const wantHeader = ['modeBtnDesign', 'modeBtnBench', ...(layout === 'desktop' ? ['btnUndo', 'menu:project', 'menu:help'] : mode === 'design' ? ['menu:help'] : ['menu:project', 'menu:help'])];
    ok(JSON.stringify([...header].sort()) === JSON.stringify([...wantHeader].sort()), `${label}：頂端只有 ${wantHeader.join('、')}（實際：${header.join('、')}）`);
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}：沒有橫向捲動`);
    ok(await page.evaluate(() => !document.querySelector('header.appbar #mechanismStatus') && document.querySelector('.canvas-status #mechanismStatus')), `${label}：狀態訊息在畫布狀態列`);
    if (shotsDir) {
      if (layout === 'desktop') { for (const g of ['project', 'help']) { await page.click(`header [data-command-menu="${g}"] > summary`); await page.screenshot({ path: join(shotsDir, `ui1_${layout}_${mode}_menu_${g}.png`) }); await page.keyboard.press('Escape'); } }
      else {
        if (mode === 'design') for (const tab of ['edit', 'view', 'project']) { await page.click(`.mobile-tab[data-tab="${tab}"]`); await page.screenshot({ path: join(shotsDir, `ui1_${layout}_${mode}_tab_${tab}.png`) }); }
        else { await page.click('header [data-command-menu="project"] > summary'); await page.screenshot({ path: join(shotsDir, `ui1_${layout}_${mode}_menu_project.png`) }); await page.keyboard.press('Escape'); }
        await page.click('header [data-command-menu="help"] > summary'); await page.screenshot({ path: join(shotsDir, `ui1_${layout}_${mode}_menu_help.png`) }); await page.keyboard.press('Escape');
      }
    }
    await ctx.close();
  }
  // 兩種版面逐類比對
  if (mode === 'design') ok(JSON.stringify(results['desktop/design'].sections) === JSON.stringify(results['mobile/design'].sections), '設計：新增面板的分類、展開、數量、說明、按鈕順序電腦＝手機');
  for (const g of COMMAND_GROUPS) {
    const d = results[`desktop/${mode}`].groups[g.id], m = results[`mobile/${mode}`].groups[g.id];
    const diff = [...d].filter(x => !m.has(x)).concat([...m].filter(x => !d.has(x)));
    ok(diff.every(id => SHORTCUTS.includes(id)), `${mode === 'design' ? '設計' : '組立'}：「${g.label}」電腦＝手機（${[...d].join('、') || '無'}）`);
  }
}
function byId(id) { return COMMANDS.find(c => c.id === id); }

// 指令真的會動：兩種版面都從各自的入口點一次
for (const [layout, viewport] of Object.entries(LAYOUTS)) {
  const ctx = await browser.newContext(viewport);
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.location().url || '')) errors.push(`${layout}/act: ${m.text()}`); });
  page.on('pageerror', e => errors.push(`${layout}/act: ${e.message}`));
  await page.goto(url);
  await page.waitForFunction(() => window.blocks?.setMode && document.querySelector('.controls [data-command]'));
  const label = layout === 'desktop' ? '電腦' : '手機';
  const trigger = async id => {   // 用該版面的入口點擊指令
    const g = groupOf[id];
    if (g === 'add') await expandSections(page);
    if (layout === 'desktop') {
      if (g === 'project' || g === 'help') { await page.click(`header [data-command-menu="${g}"] > summary`); await page.click(`header [data-command-menu="${g}"] [data-command="${id}"]`); }
      else await page.click(`${id === 'undo' ? 'header' : g === 'add' ? '.part-palette' : '.canvas-toolbar'} [data-command="${id}"]`);
    } else if (g === 'help') { await page.click('header [data-command-menu="help"] > summary'); await page.click(`header [data-command-menu="help"] [data-command="${id}"]`); }
    else { await page.click(`.mobile-tab[data-tab="${g === 'add' ? 'build' : g}"]`); await page.click(`${g === 'add' ? '.part-palette' : '.mobile-panel'} [data-command="${id}"]`); }
  };
  const open = sel => page.evaluate(s => !!document.querySelector(s)?.open, sel);
  const closeAll = () => page.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
  await trigger('examples'); ok(await open('#examplesDialog') && await page.locator('#exampleList .example-btn').count() > 10, `${label}：專案 → 範例… 打開同一份範例清單`); await closeAll();
  await trigger('help'); ok(await open('#helpDialog'), `${label}：說明 → 操作說明`); await closeAll();
  await trigger('guide'); ok(await open('#designGuide') && (await page.textContent('#guideTitle')).length > 0, `${label}：說明 → 設計引導`); await trigger('guide'); ok(!await open('#designGuide'), `${label}：再按一次收起設計引導`);
  await trigger('version'); ok(await open('.version-dialog'), `${label}：說明 → 版本`); await closeAll();
  await trigger('fabrication'); ok(await open('#fabricationDialog'), `${label}：專案 → 製作設定與零件輸出`); await closeAll();
  await page.evaluate(() => { window.__opened = []; window.open = (...a) => { window.__opened.push(a[0]); return null; }; });
  await trigger('teaching'); ok((await page.evaluate(() => window.__opened)).join() === 'teaching.html', `${label}：說明 → 教學單元`);
  await trigger('save'); ok(await page.evaluate(() => !!document.querySelector('dialog[open] #saveProjectName')), `${label}：專案 → 存檔開出命名視窗`); await closeAll();
  const chooser = page.waitForEvent('filechooser'); await trigger('open'); await chooser; ok(true, `${label}：專案 → 開啟選檔`);
  let asked = ''; page.once('dialog', d => { asked = d.message(); d.dismiss(); }); await trigger('clearAll'); ok(/清空/.test(asked), `${label}：專案 → 清空全部先確認`);
  await trigger('frameLock'); ok(await page.evaluate(() => [...document.querySelectorAll('[data-command="frameLock"]')].every(b => b.getAttribute('aria-pressed') === 'true')), `${label}：鎖孔距開啟，兩個入口同步亮起`);
  await trigger('frameLock');
  const full = await page.evaluate(() => document.querySelector('[data-command="rulers"]').getAttribute('aria-pressed'));
  ok(full === (layout === 'desktop' ? 'true' : 'false'), `${label}：尺規預設${layout === 'desktop' ? '完整' : '只留比例尺'}`);
  await trigger('rulers'); ok(await page.evaluate(want => [...document.querySelectorAll('[data-command="rulers"]')].every(b => b.getAttribute('aria-pressed') === want), layout === 'desktop' ? 'false' : 'true'), `${label}：按「尺規」切換`);
  await trigger('view3d'); await page.waitForFunction(() => document.getElementById('view3d').style.display === 'block');
  ok(await page.evaluate(() => [...document.querySelectorAll('[data-command="view3d"]')].every(b => b.getAttribute('aria-pressed') === 'true')), `${label}：3D 開啟，視圖與控制列同步亮起`);
  await page.click('.controls [data-command="view3d"]'); ok(await page.evaluate(() => document.getElementById('view3d').style.display === 'none'), `${label}：控制列的 3D 快捷鍵關閉 3D`);
  await trigger('dimension'); await page.waitForTimeout(600); ok(true, `${label}：視圖 → 量尺可啟動`);
  await trigger('fitView'); ok(true, `${label}：視圖 → 置中`);
  for (const id of ['bar', 'triangle', 'polyline', 'plate', 'rail']) {   // 新增 → 構件／導引：進入繪製，出現「取消繪製」
    await trigger(id); await page.waitForTimeout(150);
    ok(await page.evaluate(() => !document.getElementById('cancelCreation').hidden), `${label}：新增 → ${byId(id).label} 進入繪製`);
    await page.evaluate(() => document.getElementById('cancelCreation').click());
  }
  await trigger('motor'); ok(await page.evaluate(() => getComputedStyle(document.getElementById('powerMenu')).display !== 'none' && document.querySelectorAll('#powerMenu .pm-opt').length === 2), `${label}：新增 → 動力 → 馬達 再選 TT／N20 兩項`);
  await page.click('#powerMenu .pm-opt >> nth=0'); ok(await page.evaluate(() => getComputedStyle(document.getElementById('powerMenu')).display === 'none'), `${label}：選定馬達型號後進入放置`);
  await page.evaluate(() => document.getElementById('cancelCreation').click());
  await closeAll(); await page.evaluate(() => window.blocks.setMode('bench')); await page.waitForFunction(() => document.body.dataset.mode === 'bench');
  await page.click('header [data-command-menu="project"] > summary'); await page.click('header [data-command-menu="project"] [data-command="designList"]');
  ok(await open('#designListDialog'), `${label}：組立中 專案 → 設計清單`);
  await ctx.close();
}
await browser.close();
server.close();
ok(errors.length === 0, `沒有主控台錯誤${errors.length ? '：' + errors.join(' | ') : ''}`);
console.log(`ui-commands-browser: ${pass} passed`);
