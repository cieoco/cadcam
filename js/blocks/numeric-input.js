/** Editable decimal text: mobile decimal keyboards do not always provide a sign. */
export const formatNumber = value => Number.isFinite(Number(value)) ? String(Number(Number(value).toFixed(2))) : '';
const normalized = raw => String(raw).trim().replace(/[−–－]/g, '-').replace(/＋/g, '+');
export function decimalNumber(raw) {
  const text = normalized(raw);
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) ? Number(text) : NaN;
}
const initialized = new WeakSet();
/** Rounded display must not silently change an untouched engineering value. */
export function showNumber(input, value) {
  input.value = formatNumber(value);
  input.dataset.numericText = input.value; input.dataset.numericValue = String(value);
  if (!initialized.has(input)) {
    initialized.add(input);
    input.addEventListener('input', () => { delete input.dataset.numericText; delete input.dataset.numericValue; }, { capture:true });
  }
}
export function readNumber(input) {
  return input.value === input.dataset.numericText ? Number(input.dataset.numericValue) : decimalNumber(input.value);
}
export function signedNumberInput(input) {
  input.type = 'text'; input.inputMode = 'decimal';
  const wrap = document.createElement('span');
  wrap.style.cssText = 'display:flex;gap:6px;align-items:center;min-width:0';
  input.before(wrap); wrap.append(input);
  input.style.minWidth = '0'; input.style.flex = '1';
  const sign = document.createElement('button'); sign.type = 'button'; sign.textContent = '±';
  sign.setAttribute('aria-label', `${input.getAttribute('aria-label') || '數值'}切換正負`);
  sign.style.cssText = 'min-width:44px;min-height:44px;flex:none';
  sign.addEventListener('pointerdown', e => e.preventDefault());
  sign.addEventListener('click', () => {
    const text = normalized(input.value);
    input.value = text.startsWith('-') ? text.slice(1) : '-' + text.replace(/^\+/, '');
    input.focus(); input.dispatchEvent(new Event('input', { bubbles:true }));
    if (Number.isFinite(decimalNumber(input.value))) input.dispatchEvent(new Event('change', { bubbles:true }));
  });
  input.addEventListener('input', () => {
    // Preserve partial edits such as "-", "+" and "-." until the user finishes.
    input.value = normalized(input.value);
  });
  wrap.append(sign);
  return sign;
}
