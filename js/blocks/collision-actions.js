/** Read-only navigation from a checked pose; never guesses a collision fix. */
export function appendCollisionActions(container, rows, { locate, edit, document = globalThis.document }) {
  if (!rows.length) return;
  const details = document.createElement('details');
  details.className = 'collision-actions';
  const summary = document.createElement('summary');
  summary.textContent = `查看干涉位置與修改入口（${rows.length}）`;
  details.appendChild(summary);
  for (const row of rows) {
    const item = document.createElement('div');
    const label = document.createElement('p'); label.textContent = row.label;
    item.appendChild(label);
    if (row.keys.length) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = '定位這一處';
      button.onclick = () => locate(row); item.appendChild(button);
    }
    for (const module of row.modules) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = `修改「${module.name}」`;
      button.onclick = () => edit(row, module.id); item.appendChild(button);
    }
    details.appendChild(item);
  }
  const note = document.createElement('p');
  note.textContent = '先定位，再檢查板件外形、疊放與接合位置；修改後回組立，暫停並重新檢查。換層仍需核對軸長與支承，不能保證解除干涉。';
  details.appendChild(note); container.appendChild(details);
}
