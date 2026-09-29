// M1b 刀 2：世界機架排除已安裝模組、安裝孔外觀、每個模組另出機架檔（SDD-ASSEMBLY-MODULES §4.2）。
import { readFileSync } from 'node:fs';
import { check, report } from './_harness.mjs';

// 必須在下面替換 globalThis.URL 之前讀 fixture（new URL 需要真的 URL）。
const fixture = JSON.parse(readFileSync(new URL('./fixtures/assembly/lift-gripper.json', import.meta.url), 'utf8'));

class FakeElement {
  constructor(tag) { this.tag = tag; this.attributes = new Map(); this.children = []; this.style = {}; this.listeners = new Map(); this.textContent = ''; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener(name, handler) { this.listeners.set(name, handler); }
}
const downloads = [];
class FakeAnchor { click() { downloads.push(this.download); } remove() {} }
globalThis.document = {
  createElementNS: (_ns, tag) => new FakeElement(tag),
  createElement: () => new FakeAnchor(),
  body: { appendChild() {} }
};
globalThis.URL = class { static createObjectURL() { return 'blob:x'; } static revokeObjectURL() {} };
globalThis.setTimeout = () => 0;

const { renderNodes } = await import('../js/blocks/mechanism-layer-render.js');
const Exporters = await import('../js/blocks/exporters.js');
const Model = await import('../js/blocks/model.js');
const { worldFrameComps, splitFrameMounts, moduleFrameExports } = await import('../js/blocks/assembly.js');

const clone = v => JSON.parse(JSON.stringify(v));

// ---------- 安裝孔外觀 ----------
{
  const base = {
    points: { O: { x: 0, y: 0 }, B: { x: 20, y: 0 }, M: { x: 40, y: 0 } }, groundIds: new Set(['O', 'B', 'M']), motorCenterIds: new Set(['M']),
    camCenterIds: new Set(), hiddenPointIds: new Set(), gearPinIds: new Set(), pulleyPinIds: new Set(), camFollowerIds: new Set(),
    workpieceIds: new Set(), dragId: '', sliderMountInfo: () => null, project: p => ({ x: p.x, y: -p.y }), onPointerDown: () => {}, registerUpdate: () => {}
  };
  const svgA = new FakeElement('svg');
  renderNodes({ ...base, svg: svgA });
  check('未傳 mountedBaseIds：地錨照舊畫方塊', svgA.children[0].tag === 'rect' && svgA.children[1].tag === 'rect');
  const svgB = new FakeElement('svg');
  renderNodes({ ...base, svg: svgB, mountedBaseIds: new Set(['B', 'M']) });
  const [o, b, m] = svgB.children;
  check('一般地錨 O 仍是方塊', o.tag === 'rect');
  check('已安裝模組的固定點 B 畫成虛線圓環（不是地錨方塊）', b.tag === 'circle' && b.getAttribute('stroke-dasharray') && b.getAttribute('fill') !== '#34495e');
  check('B 附說明：鎖在宿主上', b.children.some(c => c.tag === 'title' && /宿主/.test(c.textContent)));
  check('已安裝模組的馬達軸心 M 仍用馬達樣式', m.tag === 'circle' && m.getAttribute('fill') === '#e74c3c');
  check('B 仍可拖曳與帶 data-id', b.getAttribute('data-id') === 'B' && b.listeners.has('pointerdown'));
}

// ---------- 世界機架節點 ----------
{
  const f = clone(fixture);
  const worldNodes = Model.frameConnectorNodes(worldFrameComps(f.comps, f.modules)).map(n => n.id);
  const allNodes = Model.frameConnectorNodes(f.comps).map(n => n.id);
  check('對照：不過濾時夾爪 GCA、GCB 會混進世界機架', allNodes.includes('GCA') && allNodes.includes('GCB'));
  check('過濾後世界機架只剩升降的固定點', !worldNodes.includes('GCA') && !worldNodes.includes('GCB') && worldNodes.includes('LGA') && worldNodes.includes('LPC'));
  check('世界機架拖曳點（frameNodeIds）同樣排除', !Model.frameNodeIds(worldFrameComps(f.comps, f.modules)).has('GCA'));
}

// ---------- 馬達安裝座分流 ----------
{
  const f = clone(fixture);
  const free = [{ pointId: 'LPC', kind: 'tt' }, { pointId: 'GCA', kind: 'tt' }, { pointId: 'Nope', kind: 'tt' }];
  const split = splitFrameMounts(free, f.comps, f.modules);
  check('splitFrameMounts：升降馬達與找不到的點歸世界', split.world.map(m => m.pointId).join(',') === 'LPC,Nope');
  check('splitFrameMounts：夾爪馬達歸 Grip1', (split.byModule.Grip1 || []).map(m => m.pointId).join(',') === 'GCA');
  check('splitFrameMounts：未安裝模組（Lift1）不另列', !('Lift1' in split.byModule));
  check('splitFrameMounts：沒有模組時全部歸世界', splitFrameMounts(free, f.comps, []).world.length === 3);
  const unmounted = clone(f.modules); unmounted[1].mount = null;
  check('splitFrameMounts：模組拆下後其馬達回到世界機架', splitFrameMounts(free, f.comps, unmounted).world.length === 3);
}

// ---------- 模組機架匯出清單 ----------
{
  const f = clone(fixture);
  const list = moduleFrameExports(f.comps, f.modules);
  check('moduleFrameExports：只列已安裝模組', list.length === 1 && list[0].moduleId === 'Grip1');
  check('moduleFrameExports：檔名用模組 id（檔案系統安全）', list[0].fileBase === 'Grip1-frame');
  check('moduleFrameExports：帶該模組的零件', list[0].comps.length === 4 && list[0].comps.every(c => c.moduleId === 'Grip1'));
  check('moduleFrameExports：沒有模組回傳 []', moduleFrameExports(f.comps, []).length === 0);
}

// ---------- 匯出檔名參數 ----------
{
  const f = clone(fixture);
  const settings = Exporters.normalizeExportSettings({});
  const nodes = Model.frameConnectorNodes(moduleFrameExports(f.comps, f.modules)[0].comps);
  downloads.length = 0;
  const n1 = Exporters.exportFrameAsSvg(nodes, settings, []);
  const n2 = Exporters.exportFrameAsSvg(nodes, settings, [], 'Grip1-frame');
  const n3 = Exporters.exportFrameAsDxf(nodes, settings, [], 'Grip1-frame');
  check('夾爪底座（GCA、GCB 兩孔）可產生機架', n1 === 1 && n2 === 1 && n3 === 1, `${n1}${n2}${n3}`);
  check('預設檔名 frame.svg；指定名稱時為 <名稱>.svg／.dxf', downloads.join(',') === 'frame.svg,Grip1-frame.svg,Grip1-frame.dxf', downloads.join(','));
}

report('assembly-frame');
