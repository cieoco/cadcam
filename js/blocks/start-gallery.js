/** 「你的機構，從這裡開始。」功能範例卡（參考電路板外殼生成器的開始畫面）。
 *  第一次開啟自動顯示；之後從「說明 → 功能範例」再開。用到才載入，不佔啟動大小。
 *  縮圖由 tools/capture-start-cards.mjs 用真實範例重錄（media/start/）。 */
import { COMMANDS } from './ui-commands.js';

export const START_SEEN_KEY = 'blocks.startGallerySeen';
// example＝走一般的範例載入流程（有「替換／保留」確認）；command＝執行指令清單裡的同一顆按鈕。
export const START_CARDS = [
  { n: 1, example: 'empty-challenge', blank: true, title: '從空白畫第一根桿', text: '點「連桿」，在畫布上點兩下，就有第一根桿。', image: 'media/start/blank-bar.webp' },
  { n: 2, example: 'wiper-single', title: '四連桿（雨刷）', text: '曲柄帶動浮桿，雨刷臂來回擺動；改孔距看掃過範圍。', image: 'media/start/wiper.webp' },
  { n: 3, example: 'gear-pair', title: '傳動：齒輪', text: '兩個齒輪咬合，齒數不同轉速就不同；拉滑桿試試。', image: 'media/start/gear-pair.webp' },
  { n: 4, example: 'hydraulic-h01', title: '液壓針筒', text: '推動針筒行程，看單臂被推起來。', image: 'media/start/hydraulic.webp' },
  { n: 5, example: 'assembly-lift-gripper', title: '組立：升降夾爪', text: '升降與夾爪兩個模組，接合後各自驅動。', image: 'media/start/assembly.webp' },
  { n: 6, command: 'boxMaker', title: '卡榫盒子（外掛）', text: '輸入內部尺寸，自動產生卡榫板件，可下載 SVG／DXF。', image: 'media/start/box-maker.webp' }
];

/** 只在：沒看過、不是範例連結、沒有已存作品時自動顯示。 */
export const shouldShowStartGallery = ({ seen, urlExample, hasWork }) => !seen && !urlExample && !hasWork;

/** 點卡片：空白卡在畫布真的是空的時候直接開始畫桿；其他走範例流程或指令。 */
export function pickStartCard(card, { requestExample, runCommand, hasWork, startBar }) {
  if (card.example) return card.blank && !hasWork() ? startBar() : requestExample(card.example);
  return runCommand(card.command);
}
export const runCommand = id => {
  const c = COMMANDS.find(x => x.id === id);
  if (c) c.run[0] === '#' ? document.querySelector(c.run)?.click() : window.blocks[c.run.slice(14)]?.(...c.args || []);
};

const CSS = `.start-gallery{box-sizing:border-box;width:min(800px,calc(100vw - 16px));max-height:calc(100dvh - 16px);padding:0;border:1px solid #bccddd;border-radius:14px;color:#234;background:#fff}
.start-gallery::backdrop{background:#18384980}.start-gallery[open]{display:flex;flex-direction:column}.start-gallery *{box-sizing:border-box}
.start-gallery header{display:flex;align-items:flex-start;gap:8px;padding:16px 18px 4px;flex:none}.start-gallery h2{flex:1;margin:0;font-size:22px;line-height:1.3}
.start-gallery .sg-sub{margin:0;padding:0 18px 10px;font-size:14px;color:#52677b;flex:none}
.start-gallery .sg-x{flex:none;width:44px;height:44px;margin:-6px -8px 0 0;border:0;background:none;font-size:22px;color:#52677b;cursor:pointer;border-radius:8px}
.start-gallery ul{list-style:none;margin:0;padding:4px 18px 12px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;overflow:auto;min-height:0}
.start-gallery .sg-card{display:grid;grid-template-columns:minmax(0,1fr);grid-template-areas:'img' 'n' 'title' 'text';align-content:start;width:100%;height:100%;padding:0 0 12px;text-align:left;font:inherit;color:inherit;background:#fff;border:1px solid #d3dde6;border-radius:12px;overflow:hidden;cursor:pointer;gap:2px}
.start-gallery .sg-card:hover,.start-gallery .sg-card:focus-visible{border-color:#2c6fbb;box-shadow:0 0 0 2px #2c6fbb33;outline:none}
.start-gallery img{grid-area:img;align-self:start;display:block;width:100%;height:auto;aspect-ratio:8/5;object-fit:cover;background:#eef3f8;border-bottom:1px solid #e1e8ef}
.start-gallery .sg-n{grid-area:n;padding:8px 14px 0;font-size:12px;font-weight:700;color:#2c6fbb;letter-spacing:.08em}
.start-gallery .sg-title{grid-area:title;padding:0 14px;font-size:16px}.start-gallery .sg-text{grid-area:text;padding:0 14px;font-size:13px;line-height:1.5;color:#46586b}
.start-gallery footer{display:flex;align-items:center;gap:12px;padding:10px 18px calc(10px + env(safe-area-inset-bottom));border-top:1px solid #e1e8ef;flex:none}
.start-gallery .sg-note{flex:1;margin:0;font-size:13px;color:#52677b}
.start-gallery .sg-go{min-height:44px;padding:8px 22px;border:0;border-radius:10px;background:#2c6fbb;color:#fff;font:inherit;font-weight:700;cursor:pointer}
@media(max-width:700px){.start-gallery h2{font-size:19px}.start-gallery ul{grid-template-columns:minmax(0,1fr);gap:10px;padding:4px 12px 10px}.start-gallery header{padding:12px 12px 2px 14px}.start-gallery .sg-sub{padding:0 14px 8px}
.start-gallery .sg-card{grid-template-columns:128px minmax(0,1fr);grid-template-areas:'img n' 'img title' 'img text';align-content:center;padding:0 8px 0 0;column-gap:0}.start-gallery img{align-self:stretch;height:100%;min-height:92px;aspect-ratio:auto;border-bottom:0;border-right:1px solid #e1e8ef}.start-gallery .sg-n{padding:8px 0 0 12px}.start-gallery .sg-title{padding:0 0 0 12px}.start-gallery .sg-text{padding:0 0 8px 12px}
.start-gallery footer{flex-wrap:wrap;gap:8px 12px;padding:8px 12px calc(8px + env(safe-area-inset-bottom))}.start-gallery .sg-go{flex:none}}`;

/** 開啟功能範例卡。auto＝第一次自動顯示（記下「看過了」，之後不再自動跳出）。 */
export function openStartGallery({ requestExample, hasWork, startBar, auto = false, document: doc = window.document } = {}) {
  try { localStorage.setItem(START_SEEN_KEY, '1'); } catch (_) { /* 沒有儲存空間：下次不自動顯示，但仍可從說明開啟 */ }
  doc.querySelector('dialog.start-gallery')?.remove();
  const dialog = doc.createElement('dialog');
  dialog.className = 'start-gallery'; dialog.setAttribute('aria-label', '功能範例');
  const el = (tag, cls, text) => Object.assign(doc.createElement(tag), { className: cls || '', textContent: text || '' });
  const style = el('style', '', CSS), close = () => { dialog.close(); dialog.remove(); };
  const head = el('header'), x = Object.assign(el('button', 'sg-x', '✕'), { type: 'button' }), list = el('ul');
  x.setAttribute('aria-label', '關閉功能範例'); x.onclick = close;
  head.append(el('h2', '', '你的機構，從這裡開始。'), x);
  for (const card of START_CARDS) {
    const item = el('li'), button = Object.assign(el('button', 'sg-card'), { type: 'button' }), img = Object.assign(doc.createElement('img'), { src: card.image, alt: '', loading: 'lazy', width: 480, height: 300 });
    button.append(img, el('span', 'sg-n', String(card.n).padStart(2, '0')), el('strong', 'sg-title', card.title), el('span', 'sg-text', card.text));
    button.dataset.card = card.example || card.command;
    button.onclick = () => { close(); pickStartCard(card, { requestExample, runCommand, hasWork, startBar }); };
    item.append(button); list.append(item);
  }
  const go = Object.assign(el('button', 'sg-go', '開始設計'), { type: 'button' }); go.onclick = close;
  const foot = el('footer'); foot.append(el('p', 'sg-note', '之後也能從「說明 → 功能範例」再打開。'), go);
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
  dialog.append(style, head, el('p', 'sg-sub', '挑一張卡，載入一個會動的機構；或從空白畫布自己畫。'), list, foot);
  doc.body.append(dialog); dialog.showModal(); go.focus();
  return dialog;
}
