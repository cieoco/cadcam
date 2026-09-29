/**
 * blocks / module-editor
 *
 * 模組面板與模組庫控制器（M1c 刀 2，SDD-ASSEMBLY-MODULES §4.3、D8）。所有資料操作都呼叫
 * ./module-ops.js 的純函式，這裡只做選取判讀、面板狀態組裝與 DOM 呈現。
 */
import { S } from './state.js';
import { pointKeysFor } from './part-types.js';
import { selectionModule } from './assembly.js';
import {
  createModule, addOutput, inferOutput, mountModule, unmountModule, dissolveModule,
  moduleToTemplate, normalizeTemplate, instantiateTemplate,
  BUILTIN_MODULES, builtinTemplate, parseLibrary, serializeLibrary
} from './module-ops.js';

// 操作失敗時的提示文字（module-ops 回傳的 reason code → 繁中訊息）。
const REASON_MESSAGES = {
  'not-found': '找不到可存成模組的零件。',
  'no-module': '找不到目標模組。',
  'already-mounted': '這個模組已經裝好了。',
  'no-base': '模組沒有固定點，無法安裝。',
  'no-target': '請先選擇安裝目標。',
  'cycle': '不能裝到自己或子模組上。',
  'no-host': '找不到要安裝的宿主模組。',
  'no-output': '宿主沒有這個輸出端。',
  'unsolved': '目前姿態無法求解，先移動到能求解的角度再試。',
  'no-position': '算不出安裝位置。',
  'no-ref-pose': '算不出輸出端姿態。',
  'not-mounted': '這個模組還沒安裝。',
  'host-invalid': '宿主目前解不出來，無法拆下。',
  'mounted': '請先拆下再解散。',
  'has-children': '還有模組裝在它上面，無法解散。'
};
function reasonMessage(reason) { return REASON_MESSAGES[reason] || '操作失敗。'; }

// candidateId 是否為 ancestorId 的子孫（沿 mount 鏈往上走）——只給候選清單排除用，不影響 mountModule 本身的檢查。
function isDescendant(modules, candidateId, ancestorId) {
  const byId = new Map(modules.map(m => [m.id, m]));
  let cur = byId.get(candidateId);
  const seen = new Set();
  while (cur && cur.mount) {
    if (seen.has(cur.id)) break;
    seen.add(cur.id);
    const nextId = cur.mount.to.module;
    if (nextId === ancestorId) return true;
    cur = byId.get(nextId);
  }
  return false;
}

const fileSafeName = (name, fallback) => {
  const cleaned = String(name || '').replace(/[\\/:*?"<>|\s]/g, '');
  return cleaned || fallback;
};

export function createModuleEditor(deps) {
  const {
    pushUndo, rebuild, draw, transient, downloadJson,
    viewCenter, loadLibraryText, saveLibraryText
  } = deps;

  // 依零件 type 設定選取欄位（沒有注入 deps.select 時的預設行為）。
  function defaultSelect(comp) {
    S.selectedLinkId = null;
    S.selectedTriangleId = null;
    S.selectedGearId = null;
    S.selectedSliderId = null;
    S.selectedNodeId = null;
    if (comp.type === 'bar') S.selectedLinkId = comp.id;
    else if (comp.type === 'triangle') S.selectedTriangleId = comp.id;
    else if (comp.type === 'gear') S.selectedGearId = comp.id;
    else if (comp.type === 'slider') S.selectedSliderId = comp.id;
  }
  const select = deps.select || defaultSelect;

  // 目前選取（連桿／三點桿／滑塊／齒輪／節點，依優先序，同 selectionModule）所屬的模組 id；根／沒選 → null。
  function currentModuleId() {
    return selectionModule(S.comps, {
      linkId: S.selectedLinkId, triangleId: S.selectedTriangleId, sliderId: S.selectedSliderId,
      gearId: S.selectedGearId, nodeId: S.selectedNodeId
    });
  }
  // 目前選取要拿去操作的零件 id：優先取已選的零件本身；只選了節點時取引用它的第一個零件。
  function selectedCompId() {
    if (S.selectedLinkId) return S.selectedLinkId;
    if (S.selectedTriangleId) return S.selectedTriangleId;
    if (S.selectedSliderId) return S.selectedSliderId;
    if (S.selectedGearId) return S.selectedGearId;
    if (S.selectedNodeId) {
      const c = S.comps.find(comp =>
        pointKeysFor(comp).some(k => comp[k] && comp[k].id === S.selectedNodeId) ||
        (Array.isArray(comp.holes) && comp.holes.some(h => h && h.id === S.selectedNodeId)));
      return c ? c.id : null;
    }
    return null;
  }
  function motorState() {
    return { activeMotor: String(S.activeMotor), theta: S.theta, motorAngles: S.motorAngles };
  }

  // module-ops 回傳的 { ok, comps?, modules?, reason }：成功才 pushUndo + 套用 + rebuild/draw；失敗只提示。
  function applyResult(r) {
    if (!r || !r.ok) { transient(reasonMessage(r && r.reason)); return false; }
    pushUndo();
    if (r.comps) S.comps = r.comps;
    if (r.modules) S.modules = r.modules;
    rebuild(); draw();
    return true;
  }

  function outputNameOf(mod, outputId) {
    const o = (mod.outputs || []).find(x => x.id === outputId);
    return o ? o.name : outputId;
  }
  function buildMountLabel(mod) {
    const host = S.modules.find(m => m.id === mod.mount.to.module);
    const hostName = host ? host.name : mod.mount.to.module;
    const outName = host ? outputNameOf(host, mod.mount.to.output) : mod.mount.to.output;
    return `裝在 ${hostName}・${outName}`;
  }
  // 安裝候選：其他模組的每個輸出端，排除自己與自己的子孫；已安裝的模組不需要再列候選。
  function candidatesFor(mod) {
    if (mod.mount) return [];
    const list = [];
    S.modules.forEach(m => {
      if (m.id === mod.id || isDescendant(S.modules, m.id, mod.id)) return;
      (m.outputs || []).forEach(o => list.push({ module: m.id, output: o.id, label: `${m.name}・${o.name}` }));
    });
    return list;
  }

  function library() {
    const builtins = BUILTIN_MODULES.map(m => ({ kind: 'builtin', id: m.id, name: m.name }));
    const locals = parseLibrary(loadLibraryText()).map((t, index) => ({ kind: 'local', index, name: t.name }));
    return [...builtins, ...locals];
  }

  function panelState() {
    const hasSelection = !!(S.selectedLinkId || S.selectedTriangleId || S.selectedSliderId || S.selectedGearId || S.selectedNodeId);
    if (!hasSelection) return { visible: false };
    const modId = currentModuleId();
    if (modId == null) return { visible: true, kind: 'root' };
    const mod = S.modules.find(m => m.id === modId);
    if (!mod) return { visible: false };
    const mounted = !!mod.mount;
    const canSetOutput = !!S.selectedNodeId && inferOutput(S.comps, mod, S.selectedNodeId).ok;
    const canDissolve = !mounted && !S.modules.some(m => m.mount && m.mount.to.module === mod.id);
    return {
      visible: true, kind: 'module', moduleId: mod.id, name: mod.name, mounted,
      mountLabel: mounted ? buildMountLabel(mod) : '未安裝',
      candidates: candidatesFor(mod),
      canSetOutput, canUnmount: mounted, canDissolve
    };
  }

  // ---- 插入模組實例（內建／本機模組庫）：ctx 依作品目前狀態計算，避免 token／馬達編號撞名 ----
  function usedMotorIdsOfWork() {
    const s = new Set();
    JSON.stringify(S.comps, (k, v) => { if (k === 'physicalMotor') s.add(String(v)); return v; });
    return s;
  }
  function existingTokensOfWork() {
    const s = new Set();
    S.comps.forEach(c => {
      if (c.id) s.add(c.id);
      pointKeysFor(c).forEach(k => { const p = c[k]; if (p && p.id) s.add(p.id); });
      if (Array.isArray(c.holes)) c.holes.forEach(h => { if (h && h.id) s.add(h.id); });
    });
    Object.keys(S.topo.params || {}).forEach(k => s.add(k));
    return s;
  }
  function insertTemplate(template) {
    if (!template) return;
    const ctx = {
      counter: S.counter,
      usedMotorIds: [...usedMotorIdsOfWork()],
      existingTokens: existingTokensOfWork(),
      place: viewCenter()
    };
    const r = instantiateTemplate(template, ctx);
    pushUndo();
    S.comps = [...S.comps, ...r.comps];
    Object.keys(r.params).forEach(k => { S.topo.params[k] = r.params[k]; });
    S.modules = [...S.modules, r.module];
    S.counter = r.counter;
    const target = r.comps.find(c => c.type === 'bar' || c.type === 'triangle' || c.type === 'gear' || c.type === 'slider');
    if (target) select(target);
    rebuild(); draw();
    transient(`已加入模組「${r.module.name}」，可在模組面板安裝或調整。`);
  }
  function insertBuiltin(id) { insertTemplate(builtinTemplate(id)); }
  function insertLocal(index) { insertTemplate(parseLibrary(loadLibraryText())[index] || null); }

  // ---- 存成模組／改名 ----
  function saveAsModule() {
    const compId = selectedCompId();
    if (!compId) return;
    const name = `模組 ${S.modules.length + 1}`;
    applyResult(createModule(S.comps, S.modules, compId, name));
  }
  function rename(name) {
    const modId = currentModuleId();
    if (!modId) return;
    const clean = typeof name === 'string' ? name.replace(/[<>"'`]/g, '').slice(0, 40) : '';
    if (!clean) return;
    pushUndo();
    S.modules = S.modules.map(m => m.id === modId ? { ...m, name: clean } : m);
    rebuild(); draw();
  }

  // ---- 安裝／拆下／輸出端／解散 ----
  function mountTo(moduleId, outputId) {
    const selId = currentModuleId();
    if (!selId) { transient('請先選取要安裝的模組。'); return; }
    applyResult(mountModule(S.comps, S.modules, selId, { module: moduleId, output: outputId }, S.topo.params, motorState()));
  }
  function unmount() {
    const modId = currentModuleId();
    if (!modId) return;
    applyResult(unmountModule(S.comps, S.modules, modId, S.topo.params, motorState()));
  }
  function setOutput() {
    const modId = currentModuleId();
    if (!modId || !S.selectedNodeId) { transient('請先選取模組內要設為輸出端的接點。'); return; }
    applyResult(addOutput(S.comps, S.modules, modId, S.selectedNodeId));
  }
  function dissolve() {
    const modId = currentModuleId();
    if (!modId) return;
    applyResult(dissolveModule(S.comps, S.modules, modId));
  }

  // ---- 我的模組庫：儲存 / 匯出 / 匯入 / 移除 ----
  function saveToLibrary() {
    const modId = currentModuleId();
    if (!modId) return;
    const template = moduleToTemplate(S.comps, S.modules, S.topo.params, modId);
    const lib = parseLibrary(loadLibraryText());
    lib.push(template);
    saveLibraryText(serializeLibrary(lib));
    transient(`已存入我的模組庫「${template.name}」。`);
  }
  function exportTemplate() {
    const modId = currentModuleId();
    if (!modId) return;
    const mod = S.modules.find(m => m.id === modId);
    const template = moduleToTemplate(S.comps, S.modules, S.topo.params, modId);
    downloadJson(template, `${fileSafeName(template.name, mod.id)}.blocks-module.json`);
  }
  function importLibraryText(text) {
    let data;
    try { data = JSON.parse(text); } catch { transient('模組檔案格式錯誤，未匯入。'); return; }
    const items = Array.isArray(data) ? data : [data];
    const lib = parseLibrary(loadLibraryText());
    let added = 0;
    items.forEach(item => { const r = normalizeTemplate(item); if (r.ok) { lib.push(r.template); added++; } });
    if (!added) { transient('沒有可匯入的模組。'); return; }
    saveLibraryText(serializeLibrary(lib));
    transient(`已匯入 ${added} 個模組。`);
  }
  function removeFromLibrary(index) {
    const lib = parseLibrary(loadLibraryText());
    if (index < 0 || index >= lib.length) return;
    lib.splice(index, 1);
    saveLibraryText(serializeLibrary(lib));
  }

  // ---- DOM 呈現：零件盤的模組庫 + 檢查器旁的模組列 ----
  function clearEl(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  function buildLibraryBlock(item) {
    const div = document.createElement('div');
    div.setAttribute('class', 'block module-block');
    const ico = document.createElement('span');
    ico.setAttribute('class', 'ico');
    ico.textContent = '🧩';
    const name = document.createElement('span');
    name.setAttribute('class', 'name');
    name.textContent = item.name;
    const role = document.createElement('span');
    role.setAttribute('class', 'role');
    role.textContent = item.kind === 'builtin' ? '內建模組' : '我的模組';
    div.appendChild(ico); div.appendChild(name); div.appendChild(role);
    div.addEventListener('click', () => {
      if (item.kind === 'builtin') insertBuiltin(item.id);
      else insertLocal(item.index);
    });
    if (item.kind === 'local') {
      const rm = document.createElement('button');
      rm.setAttribute('class', 'module-remove');
      rm.setAttribute('title', '從我的模組庫移除');
      rm.textContent = '×';
      rm.addEventListener('click', (e) => {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        removeFromLibrary(item.index);
        renderLibrary();
      });
      div.appendChild(rm);
    }
    return div;
  }
  function buildImportBlock() {
    const div = document.createElement('div');
    div.setAttribute('class', 'block module-block');
    const ico = document.createElement('span');
    ico.setAttribute('class', 'ico');
    ico.textContent = '📥';
    const name = document.createElement('span');
    name.setAttribute('class', 'name');
    name.textContent = '匯入模組';
    const role = document.createElement('span');
    role.setAttribute('class', 'role');
    role.textContent = '從 .json 讀入';
    div.appendChild(ico); div.appendChild(name); div.appendChild(role);
    div.addEventListener('click', () => {
      const input = document.createElement('input');
      input.setAttribute('type', 'file');
      input.setAttribute('accept', '.json');
      input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        let text = '';
        if (typeof file.text === 'function') text = await file.text();
        else if (typeof FileReader !== 'undefined') {
          text = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => resolve('');
            reader.readAsText(file);
          });
        }
        importLibraryText(text);
        renderLibrary();
      });
      if (typeof input.click === 'function') input.click();
    });
    return div;
  }
  function renderLibrary() {
    const container = document.getElementById('moduleLibrary');
    if (!container) return;
    clearEl(container);
    library().forEach(item => container.appendChild(buildLibraryBlock(item)));
    container.appendChild(buildImportBlock());
  }

  function findHostPanel() {
    for (const id of ['lenEditor', 'gearEditor', 'roleEditor']) {
      const el = document.getElementById(id);
      if (el && el.style.display !== 'none') return el;
    }
    return null;
  }
  function addTextSpan(parent, cls, text) {
    const span = document.createElement('span');
    if (cls) span.setAttribute('class', cls);
    span.textContent = text;
    parent.appendChild(span);
    return span;
  }
  function addButton(parent, text, onClick) {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    parent.appendChild(btn);
    return btn;
  }
  function renderEditor() {
    const el = document.getElementById('moduleEditor');
    if (!el) return;
    clearEl(el);
    const ps = panelState();
    if (!ps.visible) { el.style.display = 'none'; return; }
    if (ps.kind === 'root') {
      addButton(el, '🧩 存成模組', () => saveAsModule());
    } else if (ps.kind === 'module') {
      addTextSpan(el, null, '🧩');
      const nameInput = document.createElement('input');
      nameInput.value = ps.name;
      nameInput.addEventListener('change', () => rename(nameInput.value));
      el.appendChild(nameInput);
      addTextSpan(el, 'module-status', ps.mounted ? ps.mountLabel : '未安裝');
      if (ps.candidates.length) {
        const sel = document.createElement('select');
        const optDefault = document.createElement('option');
        optDefault.textContent = '安裝到…';
        optDefault.setAttribute('value', '');
        sel.appendChild(optDefault);
        ps.candidates.forEach(c => {
          const opt = document.createElement('option');
          opt.textContent = c.label;
          opt.setAttribute('value', `${c.module}::${c.output}`);
          sel.appendChild(opt);
        });
        sel.addEventListener('change', () => {
          const v = sel.value;
          if (!v) return;
          const idx = v.indexOf('::');
          mountTo(v.slice(0, idx), v.slice(idx + 2));
        });
        el.appendChild(sel);
      }
      if (ps.canUnmount) addButton(el, '拆下', () => unmount());
      if (ps.canSetOutput) addButton(el, '設為輸出端', () => setOutput());
      addButton(el, '💾 存到我的模組庫', () => { saveToLibrary(); renderLibrary(); });
      addButton(el, '⬇ 匯出模組', () => exportTemplate());
      if (ps.canDissolve) addButton(el, '解散模組', () => dissolve());
    }
    el.style.display = 'flex';
    const host = findHostPanel();
    if (host) host.appendChild(el);
    else el.style.display = 'none';
  }
  function sync() {
    renderLibrary();
    renderEditor();
  }

  return {
    library, panelState, sync,
    insertBuiltin, insertLocal,
    saveAsModule, rename,
    mountTo, unmount, setOutput, dissolve,
    saveToLibrary, exportTemplate, importLibraryText, removeFromLibrary
  };
}
