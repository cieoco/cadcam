// UI-1：由 ui-commands.js 產生頂端選單、畫布工具列、手機面板與控制列；點擊集中在這裡派送。
import { COMMANDS, COMMAND_GROUPS, SHORTCUTS, ADD_SECTIONS } from './ui-commands.js';
const byId = Object.fromEntries(COMMANDS.map(c => [c.id, c]));
const $ = id => document.getElementById(id);
function button(c, short) {
  const b = document.createElement('button');
  b.type = 'button'; b.dataset.command = c.id; b.title = c.tip || c.label;
  if (c.modes) b.dataset.modes = c.modes.join(' ');
  if (short) { b.className = 'clear-btn'; b.setAttribute('aria-label', c.label); b.textContent = c.icon || c.label; }
  else if (c.group === 'add') { b.className = 'block'; b.innerHTML = `<span class="ico">${c.icon}</span><span class="name">${c.label}</span><span class="role">${c.tip}</span>`; }
  else { b.className = 'tool-btn' + (c.danger ? ' danger-btn' : ''); b.textContent = (c.icon ? c.icon + ' ' : '') + c.label; }
  return b;
}
// 其他指令用到的小動作；app.js 併入 window.blocks。
export const commandActions = {
  openExamples: () => $('examplesDialog').showModal(),
  openFabrication: () => $('fabricationDialog').showModal(),
  openGuide: () => { const d = $('designGuide'); d.open ? d.close() : d.show(); },
  openHelp: () => $('helpDialog').showModal(),
  openTeaching: () => window.open('teaching.html', '_blank', 'noopener')
};
export function setCommandState(id, on) {
  document.querySelectorAll(`[data-command="${id}"]`).forEach(b => { b.classList.toggle('active', on); b.setAttribute('aria-pressed', on); });
}
export function initCommandUi() {
  for (const el of document.querySelectorAll('[data-command-group]')) {
    const skip = el.dataset.commandExcept || '';
    el.append(...COMMANDS.filter(c => c.group === el.dataset.commandGroup && !skip.includes(c.id)).map(c => button(c)));
  }
  for (const el of document.querySelectorAll('[data-add-sections]')) for (const sec of ADD_SECTIONS) {
    const items = COMMANDS.filter(c => c.section === sec.id), d = document.createElement('details'), box = document.createElement('div');
    d.className = 'creation-category'; d.dataset.addSection = sec.id; d.open = !!sec.open;
    d.innerHTML = `<summary>${sec.label}<span class="add-count">${items.length ? `（${items.length}）` : ''}</span><small>${sec.hint}</small></summary>`;
    if (sec.id === 'modules') { box.id = 'moduleLibrary'; box.className = 'tray-section-items'; }
    else { box.className = 'creation-items'; box.append(...items.map(c => button(c))); }
    d.append(box); el.append(d);
  }
  document.querySelectorAll('[data-command-shortcuts]').forEach(el => el.append(...SHORTCUTS.map(id => button(byId[id], 1))));
  for (const el of document.querySelectorAll('[data-group-label]')) el.textContent = COMMAND_GROUPS.find(g => g.id === el.dataset.groupLabel).label;
  const closeMenus = keep => document.querySelectorAll('details.cmd-menu[open]').forEach(d => { if (!keep || !d.contains(keep)) d.open = false; });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-command]'), c = b && !b.disabled && byId[b.dataset.command];
    if (c) c.run[0] === '#' ? document.querySelector(c.run)?.click() : window.blocks[c.run.slice(14)]?.(...c.args || []);
    closeMenus(c ? null : e.target);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenus(); });
}
