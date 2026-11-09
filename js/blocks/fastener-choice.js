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
