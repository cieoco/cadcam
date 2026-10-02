// H1：設計模式一次只顯示一個設計（分頁）；組立模式才全部顯示。純函式部分。
import { check, report } from './_harness.mjs';
let F = null;
try { F = await import('../js/blocks/design-focus.js'); } catch (e) { console.log(String(e).slice(0, 200)); }
const fns = ['designTabs', 'resolveFocus', 'compsInFocus', 'assignNewComps'];
check(`design-focus.js 匯出 ${fns.join('／')}`, fns.every(f => typeof F?.[f] === 'function'));
if (!fns.every(f => typeof F?.[f] === 'function')) { report('design-focus'); process.exit(1); }

const mods = [{ id: 'A', name: '四連桿升降臂' }, { id: 'B', name: '齒輪夾爪', mount: { to: { module: 'A', output: 'tool' }, ref: { x: 0, y: 0, a: 0 }, home: {} } }, { id: 'C', name: '齒輪夾爪' }];
const comps = [{ id: 'r1', type: 'bar' }, { id: 'a1', type: 'bar', moduleId: 'A' }, { id: 'a2', type: 'bar', moduleId: 'A' }, { id: 'b1', type: 'gear', moduleId: 'B' }, { id: 'c1', type: 'gear', moduleId: 'C' }, { id: 'x1', type: 'bar', moduleId: 'Gone' }];

const tabs = F.designTabs(comps, mods);
console.log('tabs:', tabs.map(t => `${t.id}:${t.label}(${t.count})`).join(' | '));
check('分頁：每個模組一頁（同名自動編號），根零件一頁「未命名設計」排最後', tabs.map(t => t.id).join(',') === 'A,B,C,#root' && tabs[1].label === '齒輪夾爪 1' && tabs[2].label === '齒輪夾爪 2' && /未命名設計/.test(tabs[3].label));
check('每頁有零件數；找不到模組的零件算在根', tabs[0].count === 2 && tabs[3].count === 2);
check('已安裝的模組分頁帶 mounted 標記', tabs[1].mounted === true && !tabs[0].mounted);
check('沒有根零件時不出現「未命名設計」分頁', F.designTabs(comps.filter(c => c.moduleId && c.moduleId !== 'Gone'), mods).every(t => t.id !== '#root'));
check('完全空白：只有一頁空的「未命名設計」', (() => { const t = F.designTabs([], []); return t.length === 1 && t[0].id === '#root' && t[0].count === 0; })());

check('resolveFocus：有效的焦點不變', F.resolveFocus(comps, mods, 'B') === 'B' && F.resolveFocus(comps, mods, '#root') === '#root');
check('resolveFocus：模組被刪掉 → 退到第一頁', F.resolveFocus(comps, mods, 'Zzz') === 'A' && F.resolveFocus(comps, mods, null) === 'A');
check('resolveFocus：空白作品 → #root', F.resolveFocus([], [], 'A') === '#root');

check('compsInFocus：只留那個模組的零件（順序不變）', F.compsInFocus(comps, mods, 'A').map(c => c.id).join(',') === 'a1,a2');
check('compsInFocus(#root)：根零件與找不到模組的零件', F.compsInFocus(comps, mods, '#root').map(c => c.id).join(',') === 'r1,x1');
check('compsInFocus(null)：全部（組立模式用）', F.compsInFocus(comps, mods, null).length === comps.length);

// 在某個模組分頁裡新畫的零件要歸到那個模組
const before = new Set(comps.map(c => c.id));
const after = [...comps, { id: 'n1', type: 'bar' }, { id: 'n2', type: 'bar', moduleId: 'C' }];
const out = F.assignNewComps(after, before, 'A');
check('assignNewComps：新零件（原本沒有的 id、沒有 moduleId）歸到焦點模組', out.find(c => c.id === 'n1').moduleId === 'A');
check('已有 moduleId 的新零件、舊零件都不動；不改輸入', out.find(c => c.id === 'n2').moduleId === 'C' && !out.find(c => c.id === 'r1').moduleId && !after.find(c => c.id === 'n1').moduleId);
check('焦點是 #root 或 null 時不指派', F.assignNewComps(after, before, '#root') === after && F.assignNewComps(after, before, null) === after);
report('design-focus');
