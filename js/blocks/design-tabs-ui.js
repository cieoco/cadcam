/**
 * blocks / design-tabs-ui（H1）
 *
 * 設計模式舞台上方的分頁列：每個設計（模組／未命名設計）一個大按鈕，最後一顆「＋ 新設計」。
 * 只負責呈現與回呼；分頁清單與焦點由 app.js 提供（見 design-focus.js）。
 */
export function createDesignTabs({ el, tabs, focus, active, onFocus, onNew }) {
  let sig = '';
  let lastFocus = null;

  function button(cls, text) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.textContent = text;
    return b;
  }

  // 重畫分頁列；內容沒變就不動 DOM（draw() 每次都會呼叫，拖曳時不能一直重建）。
  function render() {
    const box = el();
    if (!box) return;
    const on = active();
    box.style.display = on ? '' : 'none';
    if (!on) { sig = ''; return; }
    const list = tabs(), cur = focus();
    const next = JSON.stringify([list, cur]);
    if (next === sig) return;
    sig = next;
    while (box.firstChild) box.removeChild(box.firstChild);
    box.setAttribute('role', 'tablist');
    let activeBtn = null;
    list.forEach(t => {
      const b = button('design-tab' + (t.id === cur ? ' active' : ''), '');
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', t.id === cur ? 'true' : 'false');
      b.dataset.tabId = t.id;
      const name = document.createElement('span');
      name.className = 'design-tab-name';
      name.textContent = t.label;
      b.appendChild(name);
      if (t.mounted) {
        const hint = document.createElement('span');
        hint.className = 'design-tab-hint';
        hint.textContent = (t.orthogonal ? '⟂' : '═') + ' 已安裝';
        b.appendChild(hint);
      }
      b.title = `${t.label}（${t.count} 個零件）`;
      b.onclick = () => onFocus(t.id);
      box.appendChild(b);
      if (t.id === cur) activeBtn = b;
    });
    const add = button('design-tab design-tab-new', '＋ 新設計');
    add.dataset.tabId = '+new';
    add.title = '開一張空白設計';
    add.onclick = () => onNew();
    box.appendChild(add);
    // 焦點換頁時把它捲到看得見（手機上分頁列要橫向捲動）。
    if (activeBtn && cur !== lastFocus && activeBtn.scrollIntoView) {
      try { activeBtn.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (_) { /* 舊瀏覽器沒有選項物件：略過 */ }
    }
    lastFocus = cur;
  }

  return { render };
}
