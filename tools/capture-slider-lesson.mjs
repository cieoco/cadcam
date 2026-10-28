/** Run inside cua_repl after browser documentation is loaded.
 * Uses only the supplied CUA tab and supported browser API. No browser driver dependency.
 * A disposable test tab/origin is required: loading the example replaces that tab's work.
 * Produces candidates only; does not overwrite published teaching images.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { APP_VERSION } from '../js/version.js';
export async function captureSliderLesson({ ui, tab, browser, baseURL, outputRoot }) {
  const url = new URL(baseURL);
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw Error('Use an isolated local test origin.');
  const directory = `${outputRoot}/${APP_VERSION}/slider`;
  await mkdir(directory, { recursive: true });
  const viewport = await browser.capabilities.get('viewport');
  const report = { version: APP_VERSION, viewport: '390x844', example: 'slider-crank', images: [], published: false };
  const state = () => ui.getAXState({ emit: false, disableDiffing: true });
  const button = name => tab.playwright.getByRole('button', { name, exact: true }).filter({ visible: true });
  async function shot(name) {
    const overflow = await tab.playwright.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow) throw Error('Mobile page overflows horizontally.');
    await writeFile(`${directory}/${name}.png`, await tab.screenshot({ fullPage: false }));
    report.images.push(name);
  }
  async function check(expected) {
    await tab.playwright.locator('.controls [data-command="fitView"]').click(); await state();
    await button('☰ 專案').click(); await state();
    await button('檢查 80 mm 推送器').click(); await state();
    const actual = await tab.playwright.locator('[data-lesson-result]').getAttribute('data-lesson-result');
    if (actual !== expected) throw Error(`Expected ${expected}, got ${actual}`);
    await shot(expected);
    await button('返回修改').click(); await state();
  }
  try {
    await viewport.set({ width: 390, height: 844 });
    await ui.goto(new URL('blocks.html?example=slider-crank-practice', url).href); await state();
    if (await button('載入此範例').isVisible()) { await button('載入此範例').click(); await state(); }
    await tab.playwright.locator('#creationTools > summary').click(); await state();
    if (!await tab.playwright.locator('[data-command="bar"]').isVisible()) throw Error('Default link tool missing.');
    await shot('add');
    await check('unknown');
    await ui.goto(new URL('blocks.html?example=slider-crank', url).href); await state();
    if (await button('載入此範例').isVisible()) { await button('載入此範例').click(); await state(); }
    await check('retry');
    await button('✎ 調整').click(); await state();
    await tab.playwright.locator('[data-link-id="Link1"]').click();
    const selected = await state();
    if (!selected.includes('A–B 30 mm')) throw Error('Crank selection changed; review the lesson.');
    // Native AX value submission triggers the existing onchange, unlike DOM-only fill in some hosts.
    const input = selected.match(/(?:^|\n)\s*(\d+) stepper[^\n]*ID: memberDimensionInput/);
    if (!input) throw Error('Dimension input unavailable; review current UI.');
    await ui.setValue(Number(input[1]), '40');
    await button('完成／收合').click(); await state();
    await check('pass');
    await writeFile(`${directory}/manifest.json`, JSON.stringify(report, null, 2));
    return report;
  } finally { await viewport.reset(); }
}
