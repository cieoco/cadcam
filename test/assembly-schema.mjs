// M1a 模組資料契約（SDD-ASSEMBLY-MODULES §3、E-M4）。
import { readFileSync } from 'node:fs';
import { BLOCK_EXAMPLES } from '../js/blocks/examples.js';
import { normalizeSnapshot, toSnapshot } from '../js/blocks/schema.js';
import { normalizeModules } from '../js/blocks/module-schema.js';
import { encodeSnapshot, decodeShareString } from '../js/share-codec.js';
import { check, report } from './_harness.mjs';

const clone = v => JSON.parse(JSON.stringify(v));
const fixture = JSON.parse(readFileSync(new URL('./fixtures/assembly/lift-gripper.json', import.meta.url), 'utf8'));
const norm = raw => normalizeSnapshot(clone(raw));
const snapOf = n => toSnapshot(n.comps, { params: n.params, tracePoints: n.tracePoints }, n.counter,
  { activeMotor: n.activeMotor, motorAngles: n.motorAngles, modules: n.modules });
const acyclic = modules => modules.every(m => {
  const seen = new Set([m.id]);
  let cur = m;
  while (cur?.mount) {
    const next = modules.find(x => x.id === cur.mount.to.module);
    if (!next || seen.has(next.id)) return !next;
    seen.add(next.id); cur = next;
  }
  return true;
});

// ---------- 往返 ----------
{
  const n = norm(fixture);
  check('fixture 正規化成功', !!n);
  check('modules 完整保留', JSON.stringify(n.modules) === JSON.stringify(fixture.modules), JSON.stringify(n.modules).slice(0, 200));
  check('每個零件保留 moduleId', n.comps.length === fixture.comps.length && n.comps.every((c, i) => c.moduleId === fixture.comps[i].moduleId));
  check('齒輪模數 module 不受影響', n.comps.filter(c => c.type === 'gear').every(c => c.module === 4));
  const s = snapOf(n);
  check('toSnapshot 輸出 modules 與零件 moduleId', JSON.stringify(s.modules) === JSON.stringify(fixture.modules) && s.comps.every(c => typeof c.moduleId === 'string'));
  const n2 = normalizeSnapshot(s);
  check('二次往返不變', JSON.stringify(n2.modules) === JSON.stringify(n.modules) && JSON.stringify(n2.comps) === JSON.stringify(n.comps));
  let shareOk = false;
  try { const back = decodeShareString(encodeSnapshot(s)); shareOk = JSON.stringify(normalizeSnapshot(back).modules) === JSON.stringify(n.modules); } catch (_) {}
  check('分享編解碼往返（中文名稱）', shareOk);
}

// ---------- 沒有模組：舊檔輸出不變 ----------
{
  let bad = '';
  for (const ex of BLOCK_EXAMPLES) {
    // 組立範例另走上面的模組往返契約；此段只驗證沒有模組的舊檔。
    if (ex.snapshot.modules?.length) continue;
    const n = norm(ex.snapshot);
    if (!n) { bad ||= `${ex.id} 正規化失敗`; continue; }
    if (!Array.isArray(n.modules) || n.modules.length) bad ||= `${ex.id} modules 應為 []`;
    if (n.comps.some(c => 'moduleId' in c)) bad ||= `${ex.id} 多出 moduleId`;
    const withEmpty = toSnapshot(n.comps, { params: n.params }, n.counter, { activeMotor: n.activeMotor, motorAngles: n.motorAngles, modules: [] });
    const without = toSnapshot(n.comps, { params: n.params }, n.counter, { activeMotor: n.activeMotor, motorAngles: n.motorAngles });
    if ('modules' in withEmpty || JSON.stringify(withEmpty) !== JSON.stringify(without)) bad ||= `${ex.id} 空 modules 改變了輸出`;
  }
  check('無模組範例：modules 為 []、無 moduleId、空 modules 不輸出且逐位元組相同', !bad, bad);
  for (const ex of BLOCK_EXAMPLES.filter(e => e.snapshot.modules?.length)) {
    const n = norm(ex.snapshot), back = n && norm(snapOf(n));
    check(`${ex.id}：模組範例保存往返不變`, !!back && JSON.stringify(back.modules) === JSON.stringify(n.modules)
      && JSON.stringify(back.comps) === JSON.stringify(n.comps));
  }
  check('modules 不是陣列時當作 []', (() => { const n = norm({ ...fixture, modules: 'x', comps: fixture.comps.map(c => ({ ...c, moduleId: undefined })) }); return n && n.modules.length === 0; })());
}

// ---------- §3.3 規則 ----------
const withModules = (mutate) => { const f = clone(fixture); mutate(f); return normalizeSnapshot(f); };
{
  const n = withModules(f => { f.modules[1].name = '夾"爪<b>`\'>'; f.modules[0].name = '升'.repeat(50); });
  check('名稱去除 < > " \' ` 字元', n.modules.find(m => m.id === 'Grip1').name === '夾爪b');
  check('名稱截到 40 字', n.modules.find(m => m.id === 'Lift1').name.length === 40);
  check('過濾後的名稱可通過分享字元閘', (() => { try { decodeShareString(encodeSnapshot(snapOf(n))); return true; } catch (_) { return false; } })());
}
{
  const n = withModules(f => { f.modules.push(clone(f.modules[1])); });
  check('重複 id：只留第一個並警告', n.modules.filter(m => m.id === 'Grip1').length === 1 && n.warnings.some(w => /Grip1/.test(w)));
}
{
  const n = withModules(f => { f.modules[1].id = 'bad id'; });
  check('不安全 id：丟棄模組、所屬零件回到根、警告', !n.modules.some(m => m.id === 'bad id')
    && n.comps.filter(c => ['GearA', 'GearB', 'LeftJaw', 'RightJaw'].includes(c.id)).every(c => !('moduleId' in c)) && n.warnings.length >= 2);
}
{
  const n = withModules(f => { f.comps[0].moduleId = 'Ghost'; });
  check('moduleId 指向不存在的模組：移除標記並警告', !('moduleId' in n.comps[0]) && n.warnings.some(w => /Ghost/.test(w)));
}
{
  const n = withModules(f => { f.modules[0].outputs[0].body.id = 'GearA'; });
  check('輸出端的構件不屬於本模組：丟棄該輸出', n.modules.find(m => m.id === 'Lift1').outputs.length === 0);
  check('連帶：安裝到被丟棄輸出的 mount 改為 null', n.modules.find(m => m.id === 'Grip1').mount === null);
}
{
  const n = withModules(f => { f.modules[0].outputs[0].at = 'LPP'; });
  check('at 不是 body 上的點：丟棄該輸出', n.modules.find(m => m.id === 'Lift1').outputs.length === 0);
}
{
  const n = withModules(f => { f.modules[0].outputs[0].at = 'LiftHoleA'; });
  check('at 可以是齒條 holes 裡的孔', n.modules.find(m => m.id === 'Lift1').outputs.length === 1);
}
{
  const n = withModules(f => { f.modules[1].mount.to.output = 'nope'; });
  check('mount 指向不存在的輸出：mount null 並警告', n.modules.find(m => m.id === 'Grip1').mount === null && n.warnings.length >= 1);
}
{
  const n = withModules(f => { f.modules[1].mount.to.module = 'Grip1'; });
  check('mount 指向自己：mount null', n.modules.find(m => m.id === 'Grip1').mount === null);
}
{
  const n = withModules(f => {
    f.modules[1].outputs = [{ id: 'g', name: 'g', at: 'GCA', body: { kind: 'points', a: 'GCA', b: 'GCB' } }];
    f.modules[0].mount = { to: { module: 'Grip1', output: 'g' }, ref: { x: 0, y: 0, a: 0 }, home: {} };
  });
  check('安裝迴圈：至少一個 mount 改為 null 且結果無迴圈', n.modules.some(m => m.mount === null) && acyclic(n.modules));
}
{
  // P 裝在 A 上，A、B 互裝成迴圈：只拆迴圈成員，P 的安裝保留
  const comps = ['P', 'A', 'B'].map(m => ({ type: 'bar', id: `L${m}`, moduleId: m,
    p1: { id: `${m}1`, type: 'fixed', x: 0, y: 0 }, p2: { id: `${m}2`, type: 'floating', x: 10, y: 0 }, lenParam: `LL${m}` }));
  const out = m => [{ id: 'o', name: 'o', at: `${m}2`, body: { kind: 'bar', id: `L${m}` } }];
  const mount = to => ({ to: { module: to, output: 'o' }, ref: { x: 0, y: 0, a: 0 }, home: {} });
  const n = normalizeSnapshot({ kind: 'blocks', v: 1, comps, params: {},
    modules: [
      { id: 'P', name: 'P', outputs: out('P'), mount: mount('A') },
      { id: 'A', name: 'A', outputs: out('A'), mount: mount('B') },
      { id: 'B', name: 'B', outputs: out('B'), mount: mount('A') }
    ] });
  const byId = id => n.modules.find(m => m.id === id);
  check('三模組迴圈：P 不在迴圈內，保留安裝', byId('P').mount?.to.module === 'A');
  check('三模組迴圈：A、B 恰好拆掉一個且結果無迴圈', [byId('A').mount, byId('B').mount].filter(m => m === null).length === 1 && acyclic(n.modules));
}
{
  const n = withModules(f => { f.modules[1].mount.ref = { x: 1, y: NaN, a: 0 }; });
  check('ref 非有限數：mount null', n.modules.find(m => m.id === 'Grip1').mount === null);
}
{
  const n = withModules(f => { f.modules[1].mount.home = { '1': 5, 'bad key': 3, '2': 'x' }; });
  check('home 只保留安全 key 的有限數', JSON.stringify(n.modules.find(m => m.id === 'Grip1').mount.home) === JSON.stringify({ '1': 5 }));
}
{
  const n = withModules(f => { f.modules[1].base = 'LT'; });
  check('base 不是本模組的 fixed／motor 點：移除 base 並警告', !('base' in n.modules.find(m => m.id === 'Grip1')) && n.warnings.length >= 1);
}
{
  const n = withModules(f => { f.modules.push({ id: 'Empty', name: '空', outputs: [], mount: null }); });
  check('沒有任何零件的模組：丟棄', !n.modules.some(m => m.id === 'Empty'));
}
{
  const n = withModules(f => { for (let i = 0; i < 20; i++) { f.modules.push({ id: `X${i}`, name: 'x', outputs: [], mount: null }); f.comps.push({ type: 'anchor', id: `AX${i}`, moduleId: `X${i}`, p1: { id: `PX${i}`, type: 'fixed', x: i, y: 0 } }); } });
  check('最多 16 個模組', n.modules.length === 16 && n.warnings.length >= 1);
}
{
  const n = withModules(f => { const g = f.comps.find(c => c.id === 'GearA'); g.p1.id = 'LiftOutput'; f.comps.filter(c => c.id === 'LeftJaw').forEach(c => { c.p1.id = 'LiftOutput'; }); });
  check('跨模組共用點 id（違反樹狀組裝）：整份載入失敗（回傳 null，保留目前作品）', n === null);
}
{
  const n = withModules(f => { f.comps.push({ type: 'bar', id: 'RootBar', p1: { id: 'GCB', type: 'floating', x: 0, y: 0 }, p2: { id: 'RB2', type: 'floating', x: 9, y: 0 }, lenParam: 'RBL' }); });
  check('根零件與模組共用點 id：同樣載入失敗', n === null);
}

// ---------- normalizeModules 直接呼叫 ----------
{
  const res = normalizeModules(clone(fixture.modules), clone(fixture.comps));
  check('normalizeModules 回傳 { modules, comps, warnings, ok }', res && Array.isArray(res.modules) && Array.isArray(res.comps) && Array.isArray(res.warnings) && res.ok === true);
  check('normalizeModules 不改動輸入', (() => { const m = clone(fixture.modules), c = clone(fixture.comps); normalizeModules(m, c); return JSON.stringify(m) === JSON.stringify(fixture.modules) && JSON.stringify(c) === JSON.stringify(fixture.comps); })());
}

report('assembly-schema');
