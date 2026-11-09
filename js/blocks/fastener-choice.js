/** Same labels and availability in the existing face and edge mounting editors. */
export const FASTENER_CHOICES = Object.freeze([
  ['bracket', '金屬角碼'], ['printed', '列印角件'],
  ['tab-nut', '榫槽＋螺絲鎖固（M3）'], ['none', '先只定位']
]);

export function faceFastenerKind(selection, configured = true) {
  return selection.fastener ? 'tab-nut' : selection.brackets || !configured ? 'bracket' : 'none';
}

export function faceFastenerSelection(draft, kind, { offsets, childPart, tabNut }) {
  const selected = { ...draft };
  delete selected.fastener;
  delete selected.brackets;
  if (kind === 'tab-nut') selected.fastener = { ...tabNut };
  else if (kind === 'bracket') selected.brackets = { enabled: true, offsets: { ...offsets }, childPart };
  else if (kind !== 'none') throw new Error('此選面接合尚未支援列印角件');
  return selected;
}

export function fillFastenerChoices(select, value, unavailable = {}) {
  select.replaceChildren();
  for (const [kind, label] of FASTENER_CHOICES) {
    const option = document.createElement('option');
    option.value = kind;
    option.disabled = !!unavailable[kind];
    option.textContent = label + (unavailable[kind] ? `（${unavailable[kind]}）` : '');
    select.appendChild(option);
  }
  select.value = value;
}

export function renderFastenerButtons(root, {current, onChange, onSelectFaces, isCurrent}) {
  const label = document.createElement('div'), group = document.createElement('div');
  label.className = 'bench-label'; label.textContent = '固定方式';
  group.className = 'bench-seg';
  group.setAttribute('role','group'); group.setAttribute('aria-label','固定方式');
  for (const [kind, text] of FASTENER_CHOICES) {
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = text;
    button.className = 'bench-btn bench-seg-btn' + (current === kind ? ' is-on' : '');
    button.setAttribute('aria-pressed', String(current === kind));
    button.disabled = kind !== 'bracket' && kind !== 'printed';
    if (button.disabled) button.title = '請使用下方選面接合';
    // Finish the pointer event before opening the existing fixed-hole review.
    button.onclick = () => setTimeout(() => {
      if (root.isConnected && isCurrent() && current !== kind) onChange(kind);
    }, 0);
    group.appendChild(button);
  }
  const faces = document.createElement('button'); faces.type = 'button'; faces.className = 'bench-btn';
  faces.textContent = '改用選面接合（榫槽／只定位）';
  faces.onclick = () => { if (isCurrent()) onSelectFaces(); };
  root.replaceChildren(label, group, faces);
}
