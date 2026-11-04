/** 共用數值欄：輸入框＋滑桿；有明確預設的工具保留 ↺（參考電路板外殼生成器的尺寸欄）。
 *  輸入框仍是唯一的資料來源：滑桿與 ↺ 只改輸入框並送出 input／change，原本的驗證、復原與提示訊息照舊。 */
const toNumber = v => typeof v === 'string' && !v.trim() ? NaN : Number(v);
export function numericFieldModel({ value, min = 0, max = 100, step = 1, defaultValue, unit = '', softMax, sliderStep }) {
  const hasDefault = Number.isFinite(defaultValue), decimals = (String(step).split('.')[1] || '').length;
  let v = toNumber(value);
  if (!Number.isFinite(v)) v = hasDefault ? defaultValue : min;
  v = Math.min(max, Math.max(min, Number((Math.round(v / step) * step).toFixed(decimals))));
  return { value: v, min, max, step, unit, sliderStep: sliderStep || step,
    sliderMax: Math.min(max, Math.max(softMax ?? max, v)),   // 滑桿只放常用範圍，免得一大段行程只剩一點解析度
    rangeText: `範圍 ${min}–${max}`, defaultText: hasDefault ? `預設 ${defaultValue}` : '',
    canReset: hasDefault && v !== defaultValue };
}

let seq = 0;
const fields = new WeakMap(), el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls, textContent: text || '' });
const fire = (node, type) => node.dispatchEvent(new Event(type, { bubbles: true }));
/** 掛在 host 上（可重複呼叫＝更新）。opts.input＝沿用既有輸入框；否則自己做一個（opts.id／label／ariaLabel）。 */
export function numericField(host, opts) {
  if (host?.nodeType !== 1) return null;            // 沒有真正的 DOM（單元測試的假頁面）就略過
  let f = fields.get(host);
  if (!f) {
    const input = opts.input || Object.assign(el('input', 'nf-input'), { type: 'number', id: opts.id || `nf${++seq}`, inputMode: opts.step % 1 ? 'decimal' : 'numeric' });
    const slider = Object.assign(el('input', 'nf-slider'), { type: 'range' }), reset = Object.assign(el('button', 'nf-reset', '↺'), { type: 'button' });
    const unit = el('span', 'nf-unit'), track = el('div', 'nf-track');
    f = { input, slider, reset, unit, o: opts };
    host.classList.add('numeric-field');
    if (!opts.input) {
      input.setAttribute('aria-label', opts.ariaLabel || opts.label || '數值');
      const head = el('div', 'nf-head');
      if (opts.label) head.append(Object.assign(el('label', 'nf-label', opts.label), { htmlFor: input.id }));
      head.append(input, unit); host.append(head);
    }
    reset.title = '還原預設值'; slider.setAttribute('aria-label', `${opts.ariaLabel || opts.label || '數值'}滑桿`);
    track.append(slider, reset); host.append(track);
    slider.oninput = () => { input.value = slider.value; fire(input, 'input'); };
    slider.onchange = () => fire(input, 'change');
    reset.onclick = () => { if (f.m.canReset) { input.value = f.o.defaultValue; fire(input, 'input'); fire(input, 'change'); } };
    input.addEventListener('input', () => refresh(f));
    input.addEventListener('change', () => { f.o.onCommit?.(input.value); refresh(f); });
    fields.set(host, f);
  }
  f.o = { ...f.o, ...opts, input: f.input };
  if (!opts.input && 'value' in opts) f.input.value = opts.value;   // 原樣顯示，不替使用者四捨五入或夾住
  return refresh(f);
}
function refresh(f) {
  const o = f.o, m = f.m = numericFieldModel({ ...o, value: f.input.value }), { input, slider } = f;
  input.min = m.min; input.max = m.max; input.step = m.step; f.unit.textContent = m.unit;
  Object.assign(slider, { min: m.min, max: m.sliderMax, step: m.sliderStep, value: m.value, disabled: Boolean(o.disabled) });
  f.reset.hidden = !m.defaultText; f.reset.disabled = !m.canReset || Boolean(o.disabled);
  f.reset.setAttribute('aria-label', `${o.ariaLabel || o.label || '數值'}還原預設值${m.defaultText ? ' ' + o.defaultValue : ''}`);
  input.setAttribute('aria-description', `${m.rangeText}${m.unit ? ' ' + m.unit : ''}`);
  slider.setAttribute('aria-description',input.getAttribute('aria-description'));
  slider.setAttribute('aria-label',`${o.ariaLabel || o.label || '數值'}滑桿`);
  return f;
}
