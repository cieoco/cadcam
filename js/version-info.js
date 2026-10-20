// 發布時更新版本與紀錄，再執行 node tools/load-graph.mjs 同步 HTML 載入圖。
import { APP_VERSION as version } from './version.js?v=20261008_bracketalign';
const style = document.createElement('style');
style.textContent = `
.version-button{font:12px system-ui;color:#176b87;background:#eef7fa;border:1px solid #b8cbd2;border-radius:7px;padding:7px 9px;cursor:pointer;white-space:nowrap}
.version-dialog{box-sizing:border-box;width:min(480px,calc(100% - 32px));max-height:80vh;overflow:auto;border:1px solid #b8cbd2;border-radius:14px;padding:22px;color:#18324b;background:white;font:16px/1.6 system-ui}
.version-dialog::backdrop{background:#10283866}.version-dialog h2{margin:0;font-size:21px}.version-dialog h3{margin:18px 0 4px;font-size:16px}.version-dialog p{margin:10px 0}.version-dialog ul{padding-left:22px}.version-dialog button{min-height:40px}.version-dialog form{text-align:right}.version-button:focus-visible{outline:3px solid #df6b38;outline-offset:3px}
@media print{.version-button,.version-dialog{display:none}}
`;
document.head.append(style);
const button = document.createElement('button');
button.className = 'version-button';
button.type = 'button';
button.textContent = `v${version}`;
button.title = '查看版本與更新紀錄';
button.setAttribute('aria-label', `目前版本 ${version}，查看更新紀錄`);
const host = document.querySelector('#learningMore') || document.querySelector('.learning-actions') || document.querySelector('.appbar') || document.querySelector('main') || document.body;
host.append(button);
const dialog = document.createElement('dialog');
dialog.className = 'version-dialog';
dialog.setAttribute('aria-labelledby', 'version-title');
const title = document.createElement('h2');
title.id = 'version-title'; title.textContent = '版本與更新紀錄';
const note = document.createElement('p');
note.textContent = `目前載入版本：${version}。更新發布後，請重新整理頁面並比對版本號；若仍是舊版，可用 Ctrl＋F5（電腦）重新載入。請先存檔。`;
dialog.append(title, note);
const history = document.createElement('section');
dialog.append(history);
const form = document.createElement('form'); form.method = 'dialog';
const close = document.createElement('button'); close.className = 'version-button'; close.textContent = '關閉';
form.append(close); dialog.append(form); document.body.append(dialog);
let historyLoaded = false, historyLoading = false;
button.addEventListener('click', async () => {
  if (!dialog.open) dialog.showModal();
  if (historyLoaded || historyLoading) return;
  historyLoading = true;
  history.textContent = '載入更新紀錄…';
  try {
    const { releases } = await import('./version-history.js');
    history.replaceChildren();
    for (const [number, date, items] of releases) {
      const heading = document.createElement('h3');
      heading.textContent = `${number} · ${date}`;
      const list = document.createElement('ul');
      for (const text of items) { const li = document.createElement('li'); li.textContent = text; list.append(li); }
      history.append(heading, list);
    }
    historyLoaded = true;
  } catch {
    history.textContent = '更新紀錄載入失敗，請關閉後再試一次。';
  } finally {
    historyLoading = false;
  }
});
