// M1c 刀 2：模組面板與模組庫控制器（SDD-ASSEMBLY-MODULES §4.3、D8）。DOM 以極簡假件替身。
import { check, report } from './_harness.mjs';

class FakeElement {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.style = {}; this.dataset = {}; this.textContent = ''; this.value = ''; this.listeners = {}; this.attrs = {}; }
  get firstChild() { return this.children[0] || null; }
  appendChild(child) { this.children.push(child); return child; }
  removeChild(child) { this.children = this.children.filter(c => c !== child); return child; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
}
const els = new Map();
globalThis.document = {
  getElementById: id => { if (!els.has(id)) els.set(id, new FakeElement()); return els.get(id); },
  createElement: tag => new FakeElement(tag)
};

const { S } = await import('../js/blocks/state.js');
const { createModuleEditor } = await import('../js/blocks/module-editor.js');
const { compileAssembly, solveAssembly } = await import('../js/blocks/assembly.js');

const log = { undo: 0, rebuild: 0, draw: 0, toasts: [], downloads: [], saved: [] };
let libraryText = null;
const editor = createModuleEditor({
  pushUndo: () => { log.undo++; },
  rebuild: () => { log.rebuild++; },
  draw: () => { log.draw++; },
  transient: msg => log.toasts.push(msg),
  downloadJson: (obj, name) => log.downloads.push({ obj, name }),
  viewCenter: () => ({ x: 0, y: 0 }),
  loadLibraryText: () => libraryText,
  saveLibraryText: text => { libraryText = text; log.saved.push(text); }
});

const reset = () => { S.comps = []; S.modules = []; S.topo = { params: { theta: 0 }, tracePoint: '', tracePoints: [], referencePoint: '' }; S.counter = 0; S.theta = 0; S.activeMotor = '1'; S.motorAngles = {};
  S.selectedLinkId = S.selectedTriangleId = S.selectedSliderId = S.selectedGearId = S.selectedNodeId = null; };
const select = sel => { S.selectedLinkId = S.selectedTriangleId = S.selectedSliderId = S.selectedGearId = S.selectedNodeId = null; Object.assign(S, sel); };
const motorsOf = comps => { const s = new Set(); JSON.stringify(comps, (k, v) => { if (k === 'physicalMotor') s.add(String(v)); return v; }); return [...s].sort(); };
const ptOf = id => { for (const c of S.comps) for (const k of ['p1', 'p2', 'p3', 'm1', 'm2']) if (c[k]?.id === id) return c[k]; return null; };

reset();

// ---------- 模組庫清單與插入 ----------
{
  const lib = editor.library();
  check('模組庫：兩個內建模組在前', lib.length === 2 && lib.every(x => x.kind === 'builtin') && lib[0].name === '齒條升降' && lib[1].name === '齒輪夾爪');
  const u0 = log.undo;
  editor.insertBuiltin('rack-lift');
  check('插入齒條升降：5 件、1 個模組、一次 undo、重建與重畫', S.comps.length === 5 && S.modules.length === 1 && log.undo === u0 + 1 && log.rebuild >= 1 && log.draw >= 1);
  check('插入的零件都標上模組 id、參數併入作品', S.comps.every(c => c.moduleId === S.modules[0].id) && Object.values(S.topo.params).includes(176));
  editor.insertBuiltin('gear-gripper');
  check('插入齒輪夾爪：馬達自動改成 2 號', S.modules.length === 2 && motorsOf(S.comps.filter(c => c.moduleId === S.modules[1].id)).join(',') === '2');
  check('插入後選取新模組的第一個零件（方便接著安裝）', S.comps.some(c => c.moduleId === S.modules[1].id && [S.selectedLinkId, S.selectedTriangleId, S.selectedGearId, S.selectedSliderId].includes(c.id)));
  check('counter 前進', S.counter > 0);
  check('不存在的內建 id 不改作品', (() => { const n = S.comps.length; editor.insertBuiltin('nope'); return S.comps.length === n; })());
}
const liftId = S.modules[0].id, gripId = S.modules[1].id;
const gripGear = S.comps.find(c => c.moduleId === gripId && c.type === 'gear');
const liftOut = S.modules[0].outputs[0];

// ---------- 面板狀態與安裝 ----------
{
  select({});
  check('沒選取 → 面板不顯示', editor.panelState().visible === false);
  select({ selectedGearId: gripGear.id });
  const st = editor.panelState();
  check('選夾爪齒輪 → 模組面板、未安裝', st.visible && st.kind === 'module' && st.moduleId === gripId && st.mounted === false);
  check('安裝候選：齒條升降的滑台（標籤含模組名與輸出名）', st.candidates.length === 1 && st.candidates[0].module === liftId && st.candidates[0].output === liftOut.id && /齒條升降/.test(st.candidates[0].label) && /滑台/.test(st.candidates[0].label));
  const u0 = log.undo;
  editor.mountTo(liftId, liftOut.id);
  const g = S.modules.find(m => m.id === gripId);
  check('mountTo：寫入 mount、一次 undo', g.mount && g.mount.to.module === liftId && log.undo === u0 + 1);
  const s = solveAssembly(compileAssembly(S.comps, S.modules, { params: S.topo.params }), { thetaDeg: 0, motorAngles: { '1': 0, '2': 0 } });
  check('安裝後夾爪 base 貼在滑台孔', Math.hypot(s.points[g.base].x - s.points[liftOut.at].x, s.points[g.base].y - s.points[liftOut.at].y) < 1e-6);
  const st2 = editor.panelState();
  check('面板顯示已安裝與安裝位置', st2.mounted === true && /齒條升降/.test(st2.mountLabel) && /滑台/.test(st2.mountLabel));
  select({ selectedNodeId: S.modules[0].base });
  check('選升降底座點 → 升降面板；沒有可裝的目標（夾爪是子模組、不能反裝）', editor.panelState().moduleId === liftId && editor.panelState().candidates.length === 0);
}

// ---------- 設為輸出端 ----------
{
  const holeA = S.comps.find(c => c.moduleId === liftId && c.type === 'rack').holes.find(h => h.id !== liftOut.at).id;
  select({ selectedNodeId: holeA });
  check('選升降的活動孔 → 可設為輸出端', editor.panelState().canSetOutput === true);
  editor.setOutput();
  check('setOutput：升降多一個輸出端', S.modules.find(m => m.id === liftId).outputs.length === 2);
  select({ selectedNodeId: S.comps.find(c => c.moduleId === liftId && c.type === 'anchor').p1.id });
  check('選固定點 → 不可設為輸出端', editor.panelState().canSetOutput === false);
}

// ---------- 拆下、解散 ----------
{
  select({ selectedGearId: gripGear.id });
  S.theta = 60;                                   // 升降升起時拆下
  const before = solveAssembly(compileAssembly(S.comps, S.modules, { params: S.topo.params }), { thetaDeg: 60, motorAngles: { '1': 60, '2': 0 } }).points[S.modules.find(m => m.id === gripId).base];
  editor.unmount();
  const g = S.modules.find(m => m.id === gripId);
  check('unmount：mount 變 null、夾爪停在拆下當時的位置', g.mount === null && Math.hypot(ptOf(g.base).x - before.x, ptOf(g.base).y - before.y) < 1e-6);
  S.theta = 0;
  editor.mountTo(liftId, liftOut.id);
  select({ selectedNodeId: S.modules[0].base });
  const toasts = log.toasts.length;
  editor.dissolve();
  check('宿主上還裝著模組 → 拒絕解散並提示', S.modules.some(m => m.id === liftId) && log.toasts.length === toasts + 1);
  select({ selectedGearId: gripGear.id });
  editor.unmount();
  editor.dissolve();
  check('夾爪拆下後可解散：模組條目刪除、零件回到根', !S.modules.some(m => m.id === gripId) && S.comps.filter(c => c.type === 'triangle').every(c => !c.moduleId));
}

// ---------- 存成模組、改名 ----------
{
  select({ selectedTriangleId: S.comps.find(c => c.type === 'triangle' && !c.moduleId).id });
  const st = editor.panelState();
  check('選根零件 → 面板提供「存成模組」', st.visible && st.kind === 'root');
  editor.saveAsModule();
  const m = S.modules[S.modules.length - 1];
  check('saveAsModule：相連 4 件成為新模組、預設名稱「模組 N」', S.comps.filter(c => c.moduleId === m.id).length === 4 && /^模組 \d+$/.test(m.name));
  editor.rename('新"夾<爪>');
  check('rename：過濾引號與角括號', S.modules.find(x => x.id === m.id).name === '新夾爪');
}

// ---------- 我的模組庫、匯入匯出 ----------
{
  select({ selectedGearId: gripGear.id });
  editor.saveToLibrary();
  check('saveToLibrary：寫入本機模組庫', log.saved.length === 1 && JSON.parse(libraryText).length === 1);
  const lib = editor.library();
  check('模組庫清單：內建 2 ＋ 我的 1', lib.length === 3 && lib[2].kind === 'local' && lib[2].name === '新夾爪');
  const n = S.comps.length;
  editor.insertLocal(0);
  check('從我的模組庫插入：多 4 件與新模組', S.comps.length === n + 4 && S.modules.length === 3);
  editor.exportTemplate();
  check('exportTemplate：下載 .blocks-module.json', log.downloads.length === 1 && log.downloads[0].obj.kind === 'blocks-module' && /\.blocks-module\.json$/.test(log.downloads[0].name));
  const toasts = log.toasts.length;
  editor.importLibraryText('not json');
  check('匯入壞檔：提示、模組庫不變', log.toasts.length === toasts + 1 && JSON.parse(libraryText).length === 1);
  editor.importLibraryText(JSON.stringify(log.downloads[0].obj));
  check('匯入單一模板檔：加入模組庫', JSON.parse(libraryText).length === 2);
  editor.removeFromLibrary(0);
  check('從模組庫移除', JSON.parse(libraryText).length === 1);
  libraryText = '{壞掉';
  check('本機模組庫損壞時清單只剩內建', editor.library().length === 2);
}

// ---------- 繪製不出錯 ----------
{
  select({});
  editor.sync();
  check('sync：沒選取時隱藏面板', document.getElementById('moduleEditor').style.display === 'none');
  select({ selectedGearId: gripGear.id });
  editor.sync();
  check('sync：選取模組零件時顯示面板並列出內容', document.getElementById('moduleEditor').style.display !== 'none' && document.getElementById('moduleEditor').children.length > 0);
  check('sync：模組庫區塊列出項目', document.getElementById('moduleLibrary').children.length >= 2);
}

report('module-editor');
