/** Design UI: choose one part and one face. No assembly roles in this form. */
import { connectionSelection } from './connection-selection.js';
import { frameConnectorNodes } from './model.js';
import { inspectFrameExport, inspectLinkExport, inspectPlateExport, inspectRackExport } from './exporters.js?v=20261007_9';

const NS = 'http://www.w3.org/2000/svg';
const faces = [['top', '上面'], ['bottom', '下面'], ['front', '前面'], ['back', '後面'], ['left', '左面'], ['right', '右面']];

export function openConnectionEditor({ mod, comps, params, settings, commit }) {
  const own = comps.filter(c => c.moduleId === mod.id), candidates = [];
  const frame = inspectFrameExport(frameConnectorNodes(own), settings);
  if (frame.outlines.length) candidates.push({ id: 'frame', name: '固定桿／底板', rings: frame.outlines, holes: frame.holes, color: '#a5b3c0' });
  for (const c of own) {
    if (!['bar', 'triangle', 'rack'].includes(c.type)) continue;
    let geometry, transform = p => p;
    if (c.type === 'bar') {
      const a = c.p1, b = c.p2, len = Math.hypot(b.x - a.x, b.y - a.y);
      if (!len) continue;
      geometry = inspectLinkExport(c, len, settings);
      transform = p => ({ ...p, x: a.x + (p.x * (b.x - a.x) - p.y * (b.y - a.y)) / len, y: a.y + (p.x * (b.y - a.y) + p.y * (b.x - a.x)) / len });
    } else if (c.type === 'triangle') geometry = inspectPlateExport(c, [c.p1, c.p2, c.p3], settings);
    else {
      const rack = inspectRackExport(c, params, own.find(p => p.id === c.pinion));
      geometry = { outlines: [rack.outline], holes: rack.holes };
      const angle = (Number(c.axisDeg) || 0) * Math.PI / 180;
      transform = p => ({ ...p, x: c.p1.x + p.x * Math.cos(angle) - p.y * Math.sin(angle), y: c.p1.y + p.x * Math.sin(angle) + p.y * Math.cos(angle) });
    }
    const name = mod.outputs?.find(o => o.body?.id === c.id)?.name || c.name || `${c.type === 'bar' ? '桿件' : '板件'} ${candidates.length}`;
    candidates.push({ id: c.id, comp: c, name, rings: geometry.outlines.map(r => r.map(transform)), holes: (geometry.holes || []).map(transform), color: c.color || '#8fa9ba' });
  }
  const previous = connectionSelection(mod, mod.faceParts?.receive ? 'host' : 'child');
  let selected = candidates.find(c => c.id === previous?.part)?.id || null, face = previous?.face || 'top';
  const dialog = document.createElement('dialog'); dialog.setAttribute('aria-label', '選接合面');
  dialog.style.cssText = 'box-sizing:border-box;width:min(400px,94vw);max-height:94dvh;overflow:auto;border:0;border-radius:16px;padding:18px;color:#18364b;';
  const title = document.createElement('h3'); title.textContent = '點桿件，再選一面'; title.style.margin = '0 0 12px';
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 340 230'); svg.setAttribute('aria-label', '選接合桿件'); svg.style.cssText = 'width:100%;height:230px;background:#f3f7fa;border-radius:12px;touch-action:manipulation;';
  const status = document.createElement('p'); status.setAttribute('aria-live', 'polite');
  const group = document.createElement('div'); group.setAttribute('role', 'group'); group.setAttribute('aria-label', '接合面'); group.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:8px;';
  const done = document.createElement('button'); done.textContent = '完成';
  const cancel = document.createElement('button'); cancel.textContent = '取消';
  const footer = document.createElement('div'); footer.style.cssText = 'display:flex;gap:8px;margin-top:18px;'; footer.append(cancel, done);
  for (const b of [done, cancel]) b.style.cssText = 'min-height:46px;flex:1;font:inherit;border:1px solid #c8d6df;border-radius:10px;';
  done.style.background = '#206f63'; done.style.color = 'white';
  const all = candidates.flatMap(c => c.rings.flat());
  const minX = Math.min(...all.map(p => p.x)), maxX = Math.max(...all.map(p => p.x)), minY = Math.min(...all.map(p => p.y)), maxY = Math.max(...all.map(p => p.y));
  const scale = Math.min(290 / Math.max(1, maxX - minX), 180 / Math.max(1, maxY - minY));
  const xy = p => ({ x: 170 + (p.x - (minX + maxX) / 2) * scale, y: 115 - (p.y - (minY + maxY) / 2) * scale });
  const element = (tag, attrs) => { const e = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); svg.append(e); return e; };
  const paint = () => {
    svg.replaceChildren();
    for (const item of candidates) {
      for (const ring of item.rings) {
        const p = element('polygon', { points: ring.map(xy).map(q => `${q.x},${q.y}`).join(' '), fill: selected === item.id ? '#238bd0' : item.color, 'fill-opacity': selected === item.id ? .9 : .5, stroke: selected === item.id ? '#075689' : item.color, 'stroke-width': selected === item.id ? 3 : 1, role: 'button', tabindex: 0, 'aria-label': `選桿件 ${item.name}`, 'aria-pressed': selected === item.id });
        p.style.cursor = 'pointer';
        const choose = () => { selected = item.id; paint(); };
        p.addEventListener('click', choose); p.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); } });
      }
      for (const h of item.holes) { const p = xy(h); element('circle', { cx: p.x, cy: p.y, r: Math.max(1.5, h.r * scale), fill: '#fff', 'pointer-events': 'none' }); }
    }
    status.textContent = selected ? `${candidates.find(c => c.id === selected).name} · ${faces.find(f => f[0] === face)[1]}` : '點選要接合的桿件';
    done.disabled = !selected;
    group.querySelectorAll('button').forEach(b => { const active = b.dataset.face === face; b.disabled = !selected; b.setAttribute('aria-pressed', active); b.style.background = active ? '#d5eee7' : '#fff'; b.style.borderColor = active ? '#207966' : '#c8d6df'; });
  };
  for (const [value, name] of faces) { const b = document.createElement('button'); b.textContent = name; b.dataset.face = value; b.style.cssText = 'min-height:46px;font:inherit;border:1px solid;border-radius:10px;'; b.onclick = () => { face = value; paint(); }; group.append(b); }
  done.onclick = () => {
    const item = candidates.find(c => c.id === selected); if (!item) return;
    const existing = mod.outputs?.find(o => o.body?.id === selected && o.body?.kind === item.comp?.type);
    const output = item.comp && !existing ? { id: `face-${item.comp.id}`, name: item.name, at: item.comp.p1.id, body: { kind: item.comp.type, id: item.comp.id } } : null;
    commit({ ...mod, outputs: output ? [...(mod.outputs || []), output] : mod.outputs, faceParts: { part: selected, face } }); dialog.close();
  };
  cancel.onclick = () => dialog.close(); dialog.addEventListener('close', () => dialog.remove());
  dialog.append(title, svg, status, group, footer); document.body.append(dialog); paint(); dialog.showModal();
}
