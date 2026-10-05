/** 教材深連結只選範例，不承載課程或作品進度。先還原原作品，確認後才替換。 */
import { getExample } from './examples.js?v=20261005_unit2';

export function requestedExample(href) {
  const url = new URL(href);
  // 分享作品優先，避免同一網址有兩個互相衝突的載入來源。
  if (url.hash) return null;
  return getExample(url.searchParams.get('example'));
}

export function offerExampleFromUrl({ loadExample, notify = () => {},
  location = window.location, history = window.history, document = window.document } = {}) {
  const url = new URL(location.href);
  if (!url.searchParams.has('example') || url.hash) return;
  const example = requestedExample(url.href);
  const consume = () => {
    url.searchParams.delete('example');
    history.replaceState(history.state, '', url.href);
  };
  if (!example) { consume(); notify('找不到指定範例，已保留目前作品。'); return; }
  const dialog = document.createElement('dialog');
  dialog.className = 'example-entry-dialog';
  dialog.setAttribute('aria-label', '載入教學範例');
  const heading = document.createElement('h2'); heading.textContent = example.title;
  const message = document.createElement('p');
  message.textContent = '載入會替換目前畫布，可按復原找回原作品。重要作品請先取消並存檔。';
  const accept = document.createElement('button'); accept.type = 'button'; accept.textContent = '載入此範例';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = '保留目前作品';
  const dismiss = () => { consume(); dialog.close(); dialog.remove(); };
  accept.onclick = () => { if (loadExample(example.id) !== false) dismiss(); };
  cancel.onclick = dismiss;
  dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
  dialog.append(heading, message, accept, cancel);
  document.body.append(dialog); dialog.showModal(); cancel.focus();
}
