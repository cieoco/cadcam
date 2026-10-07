/**
 * blocks / part-labels
 *
 * 製作計畫的零件名（frame、Mod2-frame、LiftPinion_1…）→ 學生看得懂的說法（「齒條升降的機架板」「四連桿升降臂的連桿」）。
 * 純函式，不碰 DOM。製作包本身仍用檔名，只有畫面上的干涉訊息用這裡的名字。
 */
import { assemblyRoles } from './assembly-roles.js';
import { safeName } from './exporters.js?v=20261007_7';

const asList = v => Array.isArray(v) ? v : [];
const TYPE_WHAT = { gear: '齒輪', rack: '齒條', bar: '連桿', slider: '滑塊' };

// opts.displayName(moduleId)：回字串時取代機構名稱（重複機構的編號名稱）。
export function partLabel(name, comps, modules, opts) {
  const mods = asList(modules), dn = opts && opts.displayName;
  const nameOf = m => { const r = dn && m ? dn(m.id) : null; return typeof r === 'string' && r ? r : (m && m.name) || '機構'; };
  const n = String(name == null ? '' : name);
  if (n === 'frame') { const root = mods.find(m => m && m.id === assemblyRoles(mods).root); return root ? `${nameOf(root)}的機架板` : '機架板'; }
  const fm = /^(.+)-frame$/.exec(n), fmod = fm && mods.find(m => m && safeName(m.id) === fm[1]);
  if (fmod) return `${nameOf(fmod)}的底板`;
  const c = asList(comps).find(x => x && (x.id === n || safeName(x.id) === n));
  if (!c) return n;
  const m = mods.find(x => x && x.id === c.moduleId);
  const out = m && asList(m.outputs).find(o => o && o.body && o.body.id === c.id);
  const what = out && out.name ? out.name : c.type === 'triangle' ? (c.shape === 'jaw' ? '夾爪臂' : '連接板') : TYPE_WHAT[c.type] || '零件';
  return m ? `${nameOf(m)}的${what}` : what;
}

// 一串零件名 → 看得懂的名字，去掉重複、保持順序。
export function hitLabels(names, comps, modules, opts) {
  const out = [];
  asList(names).forEach(n => { const t = partLabel(n, comps, modules, opts); if (!out.includes(t)) out.push(t); });
  return out;
}

// 訊息文字裡出現的零件名（names）換成看得懂的名字；長的先換，避免 frame 吃掉 Mod2-frame。
export function relabelText(text, names, comps, modules, opts) {
  let t = String(text == null ? '' : text);
  [...new Set(asList(names))].sort((a, b) => String(b).length - String(a).length).forEach(n => { t = t.split(n).join(partLabel(n, comps, modules, opts)); });
  return t;
}
