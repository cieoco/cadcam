// 連桿與節點互動層的最小 DOM 驗收。
import { check, report } from './_harness.mjs';

class FakeElement {
  constructor(tag) { this.tag = tag; this.attributes = new Map(); this.children = []; this.style = {}; this.listeners = new Map(); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener(name, handler) { this.listeners.set(name, handler); }
}
globalThis.document = { createElementNS: (_ns, tag) => new FakeElement(tag) };
const { renderLinks, renderNodes } = await import('../js/blocks/mechanism-layer-render.js');

const svg = new FakeElement('svg'), layer = new FakeElement('g'), updates = [];
const points = { O: { x: 0, y: 0 }, A: { x: 40, y: 0 }, Hidden: { x: 10, y: 10 } };
const link = { id: 'Link1', p1: 'O', p2: 'A', style: 'crank', color: '#e74c3c' };
const linksResult = renderLinks({
  links: [link], comps: [{ type: 'bar', id: 'Link1', fixedLen: true }], points,
  triangleEdgeKeys: new Set(), isGroundBar: () => false, selectedLinkId: 'Link1', pickBars: null,
  interactionBlocked: () => false, onTryPick: () => {}, onFreeDrag: () => false, onSelect: () => {},
  groupForLayer: () => layer, linkLayer: new Map([[link, 0]]), groundIds: new Set(['O']), hullRadius: 9, scale: 1,
  barHullPath: () => 'M 0 0 L 40 0 Z', project: p => ({ x: p.x, y: -p.y }), hostedMounts: new Map(),
  inspectHostedFrame: () => null, registerUpdate: update => updates.push(update)
});
check('連桿層建立桿身與非固定端孔位', layer.children.map(child => child.tag).join(',') === 'path,circle');
check('連桿層回傳可見桿與缺漏計數', linksResult.linksToDraw.length === 1 && linksResult.countMissing(points) === 0 && linksResult.countMissing({ O: points.O }) === 1);

renderNodes({
  points, svg, groundIds: new Set(['O']), motorCenterIds: new Set(), camCenterIds: new Set(), hiddenPointIds: new Set(['Hidden']),
  gearPinIds: new Set(), pulleyPinIds: new Set(), camFollowerIds: new Set(), workpieceIds: new Set(), dragId: '',
  sliderMountInfo: () => null, project: p => ({ x: p.x, y: -p.y }), onPointerDown: () => {}, registerUpdate: update => updates.push(update)
});
check('節點層略過隱藏點並區分固定方塊與活動圓點', svg.children.map(child => child.tag).join(',') === 'rect,circle');
updates.forEach(update => update({ O: { x: 2, y: 3 }, A: { x: 42, y: 3 }, Hidden: points.Hidden }));
check('連桿與節點 updater 可更新座標', layer.children[0].style.display === '' && svg.children[0].getAttribute('x') === '-5');

// 手機軸心點擊範圍固定 48 CSS px，變換縮放不縮小手指目標。
const touchSvg = new FakeElement('svg'), touchUpdates = [];
touchSvg.getScreenCTM = () => ({ a: 0.5, b: 0 });
let picked = null;
renderNodes({ points: { O: points.O }, svg: touchSvg, groundIds: new Set(['O']), motorCenterIds: new Set(['O']),
  camCenterIds: new Set(), hiddenPointIds: new Set(), gearPinIds: new Set(), pulleyPinIds: new Set(),
  camFollowerIds: new Set(), workpieceIds: new Set(), sliderMountInfo: () => null, project: p => p,
  onPointerDown: (_e, id) => picked = id, registerUpdate: fn => touchUpdates.push(fn), touchTargets: true });
const [hit, red] = touchSvg.children;
check('手機紅點保留精確位置，外圈為 48 CSS px', red.getAttribute('r') === '6' && Number(hit.getAttribute('r')) * 0.5 * 2 === 48);
hit.listeners.get('pointerdown')({});
check('點圓環仍選同一軸心', picked === 'O' && hit.getAttribute('data-motor-hit') === 'O');
touchUpdates[0]({ O: { x: 20, y: 30 } });
check('活動馬達圓環隨軸心更新', hit.getAttribute('cx') === red.getAttribute('cx') && hit.getAttribute('cy') === '30');
touchUpdates[0]({});
check('軸心無座標時一併移除命中區', hit.style.display === 'none' && red.style.display === 'none');

const plainSvg = new FakeElement('svg'), plainUpdates=[];
plainSvg.getScreenCTM=()=>({a:0.25,b:0});
renderNodes({points:{B:{x:32,y:0}},svg:plainSvg,groundIds:new Set(),motorCenterIds:new Set(),
  camCenterIds:new Set(),hiddenPointIds:new Set(),gearPinIds:new Set(),pulleyPinIds:new Set(),
  camFollowerIds:new Set(),workpieceIds:new Set(),sliderMountInfo:()=>null,project:p=>p,
  onPointerDown:(_e,id)=>picked=id,registerUpdate:fn=>plainUpdates.push(fn),touchTargets:true});
const [plainHit,plainDot]=plainSvg.children;
check('一般 B 孔也有 48 CSS px 觸控區，保留原孔外觀',Number(plainHit.getAttribute('r'))*0.25*2===48 && plainHit.getAttribute('fill')==='transparent' && plainDot.getAttribute('r')==='7');
check('一般孔不誤標為馬達',plainHit.getAttribute('data-id')==='B' && plainDot.getAttribute('data-motor-hit')===null);
plainHit.listeners.get('pointerdown')({});
check('擴大的普通孔觸控區選到 B',picked==='B');
plainUpdates[0]({B:{x:70,y:15}});
check('普通孔觸控區隨動態位置更新',plainHit.getAttribute('cx')===plainDot.getAttribute('cx') && plainHit.getAttribute('cy')==='15');
plainUpdates[0]({});
check('不存在的普通孔不留透明攔截區',plainHit.style.display==='none');
report('mechanism-layer-render');
