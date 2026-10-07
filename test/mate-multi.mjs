// M5a（SDD-MATE-FACES §6）：多構件。
//   底座＝清單裡第一個「沒裝在別人身上」的機構；它和裝在它身上的整串＝這台機器（machine）。
//   其他沒接上的機構（連同已經接在它們身上的）＝未安裝（spare）：不併進機架板、不進製作包、不參加干涉檢查。
//   同一個承接構件上接好幾個：自動排到空位、不能滑到重疊；對鎖的輸出端一次只能鎖一個。
import { check, report } from './_harness.mjs';
import { S, B, Asm, fresh, motor, solveAt, cnc, ex, ed } from './_bench-setup.mjs';
import { audit, fails } from './_bracket-audit.mjs';
let R = null;
try { R = await import('../js/blocks/assembly-roles.js'); } catch (e) { console.log(String(e).slice(0, 160)); }
const C = await import('../js/blocks/mate-connect.js');
const need = ['mateOccupancy', 'mateAdjust', 'mateDetach'];
check('assembly-roles.js 匯出 assemblyRoles／setAssemblyRoot／machineComps', !!R && ['assemblyRoles', 'setAssemblyRoot', 'machineComps'].every(f => typeof R[f] === 'function'));
check('mate-connect.js 多了 ' + need.join('／'), need.every(f => typeof C[f] === 'function'));
if (!R || !need.every(f => typeof C[f] === 'function')) { report('mate-multi'); process.exit(1); }
const M = await import('../js/blocks/mates.js');
const BP = await import('../js/blocks/build-plan.js');
const OJ = await import('../js/blocks/orthogonal-joint.js');
const IF = await import('../js/blocks/interference.js');
const modOf = (st, id) => st.modules.find(m => m.id === id);
const planOf = st => BP.buildPlan({ comps: st.comps, modules: st.modules, params: S.topo.params, exportSettings: ex, cnc });
const tgt = (st, childId, hostId, re) => C.mateTargets(st.comps, st.modules, childId, S.topo.params).find(x => x.module === hostId && re.test(x.name));
const join = (st, childId, hostId, re) => { const t = tgt(st, childId, hostId, re); return t ? C.mateConnect(st.comps, st.modules, childId, { module: hostId, mate: t.mateId }, S.topo.params, motor) : { ok: false, reason: 'no target', comps: st.comps, modules: st.modules }; };
const offsetOf = (st, id) => modOf(st, id).mount.orient.offsetMm || 0;

// ---------- 1. 角色：底座／機器／未安裝 ----------
{
  const [A, L, G] = fresh('rack-lift', 'fourbar-lift', 'gear-gripper'); const P = S.topo.params;
  const st0 = { comps: S.comps, modules: S.modules };
  const r0 = R.assemblyRoles(S.modules);
  check('三個都沒接：第一個（齒條升降）是底座，另外兩個是未安裝', r0.root === A.id && JSON.stringify(r0.machine) === JSON.stringify([A.id]) && JSON.stringify(r0.spare) === JSON.stringify([L.id, G.id]));
  check('roles 帶 parent／depth／order（底座那串在前、未安裝在後）', r0.parent[A.id] === null && r0.depth[A.id] === 0 && JSON.stringify(r0.order) === JSON.stringify([A.id, L.id, G.id]));
  check('machineComps：只留底座那串的零件', R.machineComps(S.comps, S.modules).every(c => c.moduleId === A.id) && R.machineComps(S.comps, S.modules).length === S.comps.filter(c => c.moduleId === A.id).length);
  check('沒有模組的作品：machineComps 原樣回傳、root null', R.machineComps(S.comps.map(c => ({ ...c, moduleId: undefined })), []).length === S.comps.length && R.assemblyRoles([]).root === null);
  // 製作計畫只含機器
  const p0 = planOf(st0);
  const frame0 = p0.parts.find(p => p.name === 'frame');
  console.log('3 unmounted: parts modules =', [...new Set(p0.parts.map(p => p.moduleId))].join(','), ' frame', Math.round(frame0.widthMm), '×', Math.round(frame0.heightMm), ' spare:', JSON.stringify(p0.spare));
  check('製作計畫：只有底座的零件；未安裝的列在 plan.spare（id、name）', p0.parts.every(p => p.moduleId === A.id || p.moduleId === null) && Array.isArray(p0.spare) && p0.spare.length === 2 && p0.spare.every(s => s.id && s.name));
  const alone = (() => { const [A1] = fresh('rack-lift'); const f = planOf({ comps: S.comps, modules: S.modules }).parts.find(p => p.name === 'frame'); return [Math.round(f.widthMm), Math.round(f.heightMm)]; })();
  fresh('rack-lift', 'fourbar-lift', 'gear-gripper');
  check('機架板不再被未安裝的機構撐大：尺寸＝齒條升降單獨存在時', JSON.stringify([Math.round(frame0.widthMm), Math.round(frame0.heightMm)]) === JSON.stringify(alone));
}
{
  const [A, L, G] = fresh('rack-lift', 'fourbar-lift', 'gear-gripper'); const P = S.topo.params;
  const st0 = { comps: S.comps, modules: S.modules };
  const html0 = BP.buildPackHtml(planOf(st0), { title: 'T', cnc, modules: S.modules });
  check('製作包提醒哪些機構還沒接上、不在製作包內', /還沒接上/.test(html0) && html0.includes(L.name) && html0.includes(G.name));
  check('干涉檢查不把未安裝的機構算進去（三個並排、沒接：0 處）', IF.findInterference({ comps: S.comps, modules: S.modules, params: P, plan: planOf(st0), pose: {}, exportSettings: ex }).every(h => !JSON.stringify(h).includes(L.id) && !JSON.stringify(h).includes(G.id)));
  // 先把夾爪接到「還沒接上的」四連桿（組一個子組件）：整串仍是未安裝
  const s1 = join(st0, G.id, L.id, /下緣/);
  const r1 = R.assemblyRoles(s1.modules);
  check('夾爪接到未安裝的四連桿：底座仍是齒條升降；四連桿＋夾爪整串算未安裝，夾爪縮排在四連桿下', s1.ok && r1.root === A.id && JSON.stringify(r1.spare) === JSON.stringify([L.id, G.id]) && r1.parent[G.id] === L.id && r1.depth[G.id] === 1 && r1.depth[L.id] === 0);
  check('這時製作計畫還是只有底座', planOf(s1).parts.every(p => p.moduleId === A.id || p.moduleId === null));
  // 再把四連桿接到底座的滑台：三個都進機器
  const s2 = join(s1, L.id, A.id, /滑台/);
  const r2 = R.assemblyRoles(s2.modules);
  check('四連桿（帶著夾爪）接到滑台：三個都在機器裡，深度 0／1／2，沒有未安裝', s2.ok && JSON.stringify(r2.machine) === JSON.stringify([A.id, L.id, G.id]) && r2.spare.length === 0 && r2.depth[G.id] === 2);
  const p2 = planOf(s2);
  check('製作計畫含三個機構的零件、plan.spare 為空、有角碼與對鎖關節', [A.id, L.id, G.id].every(id => p2.parts.some(p => p.moduleId === id)) && p2.spare.length === 0 && p2.joints.some(j => j.kind === 'adapter') && p2.joints.some(j => j.kind === 'mount-bolt'));
  audit(s2, G.id, '三構件・夾爪');
  // 拆中間：四連桿帶著夾爪一起回到未安裝，兩者之間的接法保留
  const d = C.mateDetach(s2.comps, s2.modules, L.id, P, motor);
  const r3 = d.ok ? R.assemblyRoles(d.modules) : null;
  check('拆下中間的四連桿：ok、moved 1；夾爪仍接在四連桿上；整串變未安裝、底座不變', d.ok && d.moved === 1 && modOf(d, L.id).mount === null && modOf(d, G.id).mount && modOf(d, G.id).mount.to.module === L.id && r3.root === A.id && JSON.stringify(r3.spare) === JSON.stringify([L.id, G.id]));
  check('拆下沒安裝的：拒絕（白話）', (() => { const x = C.mateDetach(d.comps, d.modules, L.id, P, motor); return x.ok === false && x.reason.length > 0 && x.modules === d.modules; })());
  // 設為底座
  const sr = R.setAssemblyRoot(d.modules, L.id);
  const r4 = R.assemblyRoles(sr);
  check('把四連桿設為底座：四連桿＋夾爪變成機器、齒條升降變未安裝；不改輸入', r4.root === L.id && JSON.stringify(r4.machine) === JSON.stringify([L.id, G.id]) && JSON.stringify(r4.spare) === JSON.stringify([A.id]) && R.assemblyRoles(d.modules).root === A.id);
  check('已安裝的不能設為底座（原樣回傳同一個陣列）', R.setAssemblyRoot(s2.modules, G.id) === s2.modules && R.setAssemblyRoot(s2.modules, 'nope') === s2.modules);
}
// 底座自己被接到別人身上 → 底座自動換成那一串的頭
{
  const [G, L] = fresh('gear-gripper', 'fourbar-lift');
  const st0 = { comps: S.comps, modules: S.modules };
  check('夾爪先放進來：它是底座', R.assemblyRoles(S.modules).root === G.id);
  const s1 = join(st0, G.id, L.id, /下緣/);
  const r = R.assemblyRoles(s1.modules);
  check('把底座（夾爪）接到四連桿：底座自動變成四連桿，兩個都在機器裡', s1.ok && r.root === L.id && JSON.stringify(r.machine) === JSON.stringify([L.id, G.id]) && r.spare.length === 0);
}

// ---------- 2. 同一個承接構件接好幾個 ----------
{
  const [L, G1] = fresh('fourbar-lift', 'gear-gripper'); ed.insertBuiltin('gear-gripper'); ed.insertBuiltin('gear-gripper'); ed.insertBuiltin('gear-gripper');
  const [, , G2, G3, G4] = S.modules; const P = S.topo.params;
  const brace = S.comps.find(c => c.moduleId === L.id && c.id.startsWith('ToolBrace'));
  let st = { comps: S.comps, modules: S.modules };
  const a = join(st, G1.id, L.id, /下緣/);
  const bq = join(a, G2.id, L.id, /下緣/);
  check('第二個夾爪接同一條邊：成功，自動排到空位（兩段各 20 mm、中間至少留 4 mm）', a.ok && bq.ok && Math.abs(offsetOf(bq, G2.id) - offsetOf(bq, G1.id)) >= 24);
  check('第一個的位置沒被動到', offsetOf(bq, G1.id) === offsetOf(a, G1.id));
  const occ = C.mateOccupancy(bq.comps, bq.modules, L.id, `edge:${brace.id}:R`, P);
  console.log('occupancy:', JSON.stringify(occ));
  check('mateOccupancy：兩段 { child, from, to }，長 20、不重疊', occ.length === 2 && occ.every(o => o.child && Math.abs((o.to - o.from) - 20) < 1e-6) && (occ[0].to + 4 <= occ[1].from + 1e-6 || occ[1].to + 4 <= occ[0].from + 1e-6));
  check('同一根桿的另一側（上緣）共用同一份佔用（孔都打在同一根桿上）', C.mateOccupancy(bq.comps, bq.modules, L.id, `edge:${brace.id}:L`, P).length === 2);
  // 第三個接上緣（同一根桿的另一側）：也要避開
  const cq = join(bq, G3.id, L.id, /上緣/);
  const spans = st2 => [G1, G2, G3, G4].filter(g => modOf(st2, g.id).mount).map(g => offsetOf(st2, g.id)).sort((x, y) => x - y);
  check('第三個接上緣：成功就要避開前兩個；放不下就白話拒絕', cq.ok ? spans(cq).every((v, i, arr) => i === 0 || v - arr[i - 1] >= 24) : /排滿|放不下|沒有空位/.test(cq.reason));
  const last = cq.ok ? cq : bq;
  // 桿上的孔：任兩個不同接合的孔心至少相距 6 mm
  const holes = (OJ.orthogonalExportExtras(last.comps, last.modules, P, { stockMm: 3 }).linkHoles[brace.id] || []);
  const minD = Math.min(...holes.flatMap((h, i) => holes.slice(i + 1).map(k => Math.hypot(h.u - k.u, h.v - k.v))));
  console.log('holes on brace:', holes.length, 'min distance', minD.toFixed(2));
  check('工具架上所有角碼孔兩兩相距 ≥ 6 mm', holes.length >= 4 && minD >= 6 - 1e-6);
  // 一直加，總會排滿
  const dq = join(last, cq.ok ? G4.id : G3.id, L.id, /下緣/);
  const eq = dq.ok ? join(dq, G4.id, L.id, /上緣/) : dq;
  check('80 mm 的工具架最多排 3 個；再多就拒絕並說排滿', (dq.ok === false || eq.ok === false) && /排滿|放不下|沒有空位/.test((dq.ok ? eq : dq).reason) && (dq.ok ? eq : dq).modules === (dq.ok ? dq : last).modules);
  // 滑動不能撞到鄰居
  const o2 = offsetOf(bq, G2.id), o1 = offsetOf(bq, G1.id), toward = o1 > o2 ? 'slide+' : 'slide-';
  const m1 = C.mateAdjust(bq.comps, bq.modules, G2.id, toward, P);
  check('往鄰居滑一格（會重疊）：拒絕，原因講到另一個機構的名字', Math.abs(o1 - o2) < 29 ? (m1.ok === false && m1.reason.includes(G1.name) && m1.modules === bq.modules) : m1.ok === true);
  const away = C.mateAdjust(bq.comps, bq.modules, G2.id, toward === 'slide+' ? 'slide-' : 'slide+', P);
  check('往另一邊滑：照常（成功，或到邊界時用原本的原因拒絕）', away.ok === true ? Math.abs(offsetOf(away, G2.id) - o2) === 5 : typeof away.reason === 'string');
  check('mateAdjust 的其他動作照常通過（掉頭）', (() => { const x = C.mateAdjust(bq.comps, bq.modules, G2.id, 'reverse', P); return x.ok && modOf(x, G2.id).mount.orient.childAxisDeg !== modOf(bq, G2.id).mount.orient.childAxisDeg; })());
  audit(bq, G1.id, '兩個夾爪・第一個'); audit(bq, G2.id, '兩個夾爪・第二個');
  const pl = planOf(bq), hw = BP.hardwareList(pl, { modules: bq.modules });
  check('製作包：角碼 ×4、角碼螺絲 M3×6 ×8', hw.filter(x => /角碼/.test(x.spec)).reduce((s, x) => s + x.qty, 0) === 4 && hw.find(x => x.spec === 'M3×6').qty === 8);
}
// ---------- 3. 對鎖的輸出端一次只能鎖一個 ----------
{
  const [A, G1] = fresh('rack-lift', 'gear-gripper'); ed.insertBuiltin('gear-gripper');
  const G2 = S.modules[2]; const P = S.topo.params;
  const a = join({ comps: S.comps, modules: S.modules }, G1.id, A.id, /滑台/);
  const t = C.mateTargets(a.comps, a.modules, G2.id, P).find(x => /滑台/.test(x.name));
  check('滑台已經鎖了一個：第二個看到它但不能接，原因講到已經有誰鎖在這裡', a.ok && t && t.ok === false && t.reason.includes(G1.name) && C.mateConnect(a.comps, a.modules, G2.id, { module: A.id, mate: t.mateId }, P, motor).ok === false);
}
console.log(fails.length ? `\n一致性檢查失敗 (${fails.length}):\n` + fails.join('\n') : '\n角碼一致性：全部通過');
report('mate-multi');
