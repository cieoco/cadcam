// M3（SDD-MATE-FACES §4）：選一個承接面 → 直接得到做得出來的接合。
//   mateTargets ＝這個機構現在可以接到哪些承接面（含不能接的原因）
//   mateConnect ＝接上去（板邊→角碼直角；有 2 個以上對鎖孔的輸出端→平貼對鎖）
//   mateStyles／setMateStyle＝壓在邊上／立在上面／立在下面
//   mateOfMount＝已接好的機構接在誰的哪個承接面（給結構清單顯示）
import { check, report } from './_harness.mjs';
import { S, B, Asm, fresh, motor, solveAt, cnc, ex } from './_bench-setup.mjs';
import { audit, fails } from './_bracket-audit.mjs';
let C = null;
try { C = await import('../js/blocks/mate-connect.js'); } catch (e) { console.log(String(e).slice(0, 200)); }
const fns = ['mateTargets', 'mateConnect', 'mateOfMount', 'mateStyle', 'mateStyles', 'setMateStyle'];
check('mate-connect.js 匯出 ' + fns.join('／'), !!C && fns.every(f => typeof C[f] === 'function'));
if (!C || !fns.every(f => typeof C[f] === 'function')) { report('mate-connect'); process.exit(1); }
const M = await import('../js/blocks/mates.js');
const BP = await import('../js/blocks/build-plan.js');
const Sch = await import('../js/blocks/schema.js');
const sameDeg = (a, b) => Math.abs(((a - b + 540) % 360) - 180) < 0.2;
const modOf = (st, id) => st.modules.find(m => m.id === id);
const plan = st => BP.buildPlan({ comps: st.comps, modules: st.modules, params: S.topo.params, exportSettings: ex, cnc });
const hw = st => BP.hardwareList(plan(st), { modules: st.modules });

// ---------- 1. 四連桿升降臂 ← 夾爪 ----------
{
  const [L, G] = fresh('fourbar-lift', 'gear-gripper'); const P = S.topo.params;
  const before = JSON.stringify([S.comps, S.modules]);
  const t = C.mateTargets(S.comps, S.modules, G.id, P);
  console.log('targets:', t.map(x => `${x.moduleName}・${x.name}[${x.kind}${x.ok ? '' : ' ✗' + x.reason}]`).join(' | '));
  check('夾爪可接的承接面：四連桿的工具架上緣、下緣（都 ok），每筆有 module／mateId／name／kind／portId', t.length === 2 && t.every(x => x.ok && x.module === L.id && x.mateId && x.kind === 'edge' && x.portId && x.moduleName === L.name) && t.some(x => /下緣/.test(x.name)) && t.some(x => /上緣/.test(x.name)));
  check('四連桿自己沒有別人的承接面可接（夾爪沒有承接面）', C.mateTargets(S.comps, S.modules, L.id, P).length === 0);
  const low = t.find(x => /下緣/.test(x.name));
  const r = C.mateConnect(S.comps, S.modules, G.id, { module: L.id, mate: low.mateId }, P, motor);
  check('mateConnect 成功、不改輸入', r.ok === true && JSON.stringify([S.comps, S.modules]) === before);
  const o = r.ok && modOf(r, G.id).mount.orient;
  check('結果是直角・壓在邊上、預設用金屬角碼', o && o.type === 'orthogonal' && o.edge === 'host' && o.joint.kind === 'bracket-m3' && r.style === 'hang' && C.mateStyle(r.modules, G.id) === 'hang');
  check('接合線方向由夾爪的安裝方向決定：childAxisDeg＝安裝方向＋180°（爪沿宿主邊伸出去）', o && sameDeg(o.childAxisDeg, 90 + 180));
  check('可指定列印轉接座（opts.jointKind printed）', (() => { const x = C.mateConnect(S.comps, S.modules, G.id, { module: L.id, mate: low.mateId }, P, motor, { jointKind: 'printed' }); return x.ok && modOf(x, G.id).mount.orient.joint.kind === 'printed'; })());
  const mo = C.mateOfMount(r.comps, r.modules, G.id, P);
  check('mateOfMount：夾爪接在四連桿的「工具架下緣」', mo && mo.module === L.id && mo.mateId === low.mateId && mo.name === low.name);
  check('沒安裝的模組 mateOfMount 回 null', C.mateOfMount(r.comps, r.modules, L.id, P) === null);
  check('已安裝的模組沒有可接的目標；再接一次被拒絕（白話）', C.mateTargets(r.comps, r.modules, G.id, P).length === 0 && (() => { const x = C.mateConnect(r.comps, r.modules, G.id, { module: L.id, mate: low.mateId }, P, motor); return x.ok === false && /已經|先拆/.test(x.reason); })());
  check('不存在的承接面／模組：拒絕且有原因', [{ module: L.id, mate: 'nope' }, { module: 'nope', mate: low.mateId }, null].every(tg => { const x = C.mateConnect(S.comps, S.modules, G.id, tg, P, motor); return x.ok === false && typeof x.reason === 'string' && x.reason.length > 0 && x.modules === S.modules; }));
  audit(r, G.id, '下緣・壓在邊上');
  const up = t.find(x => /上緣/.test(x.name));
  const ru = C.mateConnect(S.comps, S.modules, G.id, { module: L.id, mate: up.mateId }, P, motor);
  audit(ru, G.id, '上緣・壓在邊上');
  // 接法
  const styles = C.mateStyles(r.comps, r.modules, G.id, P);
  console.log('styles:', styles.map(s => `${s.style}:${s.label}${s.current ? '*' : ''}${s.ok ? '' : ' ✗' + s.reason}`).join(' | '));
  check('mateStyles：壓在邊上（目前）、立在上面、立在下面，各有中文標籤', styles.length === 3 && ['hang', 'stand-top', 'stand-bottom'].every(s => styles.some(x => x.style === s && x.label && x.ok)) && styles.find(x => x.current).style === 'hang');
  const st = C.setMateStyle(r.comps, r.modules, G.id, 'stand-top', P);
  const so = st.ok && modOf(st, G.id).mount.orient;
  check('立在上面：edge child、face 1；站立邊＝外法線最接近安裝方向（90°）的那條底板邊', so && so.edge === 'child' && so.face === 1 && C.mateStyle(st.modules, G.id) === 'stand-top' && (() => { const e = Asm.moduleFrameEdges(st.comps, st.modules, G.id, P, { noOwnHoles: true })[so.childEdge]; return e && e.m.y > 0.9; })());
  audit(st, G.id, '下緣・立在上面', { face: 1 });
  const sb = C.setMateStyle(st.comps, st.modules, G.id, 'stand-bottom', P);
  check('立在下面：face -1', sb.ok && modOf(sb, G.id).mount.orient.face === -1 && C.mateStyle(sb.modules, G.id) === 'stand-bottom');
  audit(sb, G.id, '下緣・立在下面', { face: -1 });
  const back = C.setMateStyle(sb.comps, sb.modules, G.id, 'hang', P);
  check('切回壓在邊上：與一開始的安裝紀錄相同', back.ok && JSON.stringify(modOf(back, G.id).mount) === JSON.stringify(modOf(r, G.id).mount));
  check('同一個接法再設一次：ok、內容不變', (() => { const x = C.setMateStyle(r.comps, r.modules, G.id, 'hang', P); return x.ok && JSON.stringify(x.modules) === JSON.stringify(r.modules); })());
  // 安裝方向改成另一側 → 站立邊換另一條、壓在邊上方向反過來
  const flipped = M.setAttach(S.modules, G.id, 270);
  const rf = C.mateConnect(S.comps, flipped, G.id, { module: L.id, mate: low.mateId }, P, motor);
  check('安裝方向 270°：childAxisDeg＝90°', rf.ok && sameDeg(modOf(rf, G.id).mount.orient.childAxisDeg, 90));
  const sf = C.setMateStyle(rf.comps, rf.modules, G.id, 'stand-top', P);
  check('安裝方向 270°：站立邊是外法線朝 −y 的那條', sf.ok && (() => { const e = Asm.moduleFrameEdges(sf.comps, sf.modules, G.id, P, { noOwnHoles: true })[modOf(sf, G.id).mount.orient.childEdge]; return e && e.m.y < -0.9; })());
  audit(rf, G.id, '安裝方向 270°・壓在邊上'); audit(sf, G.id, '安裝方向 270°・立在上面', { face: 1 });
  // 沒有安裝方向（attach null）：照現有預設，不出錯
  const noAttach = M.setAttach(S.modules, G.id, null);
  const rn = C.mateConnect(S.comps, noAttach, G.id, { module: L.id, mate: low.mateId }, P, motor);
  check('沒有安裝方向：仍可接（用原本的自動方向）', rn.ok && Number.isFinite(modOf(rn, G.id).mount.orient.childAxisDeg));
  // 製作包與存檔
  const h = hw(r);
  check('製作包：角碼 ×2、M3×6 ×4', h.some(x => /角碼/.test(x.spec) && x.qty === 2) && h.some(x => x.spec === 'M3×6' && x.qty === 4));
  const n = Sch.normalizeSnapshot(JSON.parse(JSON.stringify({ kind: 'blocks', v: 1, comps: r.comps, modules: r.modules, params: P })));
  check('存檔往返：安裝紀錄與 mates 都在，mateOfMount 仍找得到', JSON.stringify(n.modules.map(m => [m.mount, m.mates])) === JSON.stringify(r.modules.map(m => [m.mount, m.mates])) && C.mateOfMount(n.comps, n.modules, G.id, n.params).mateId === low.mateId);
}

// ---------- 2. 自己加的承接面（機架邊）、失效的承接面 ----------
{
  const [L, G] = fresh('fourbar-lift', 'gear-gripper'); const P = S.topo.params;
  const fr = M.ownPorts(S.comps, S.modules, L.id, P).find(p => p.body && p.body.kind === 'frame');
  const a = M.addReceive(S.comps, S.modules, L.id, fr.id, P, '底座側邊');
  const t = C.mateTargets(S.comps, a.modules, G.id, P).find(x => x.name === '底座側邊');
  const r = C.mateConnect(S.comps, a.modules, G.id, { module: L.id, mate: t.mateId }, P, motor);
  check('接到機架邊的承接面', a.ok && t && t.ok && r.ok && modOf(r, G.id).mount.to.frame !== undefined && C.mateOfMount(r.comps, r.modules, G.id, P).name === '底座側邊');
  audit(r, G.id, '機架邊・壓在邊上');
  const brace = S.comps.find(c => c.moduleId === L.id && c.id.startsWith('ToolBrace'));
  const gone = S.comps.filter(c => c.id !== brace.id);
  const tg = C.mateTargets(gone, S.modules, G.id, P);
  check('零件被刪的承接面：列出但 ok false，有白話原因；mateConnect 也拒絕', tg.length === 2 && tg.every(x => x.ok === false && x.reason) && C.mateConnect(gone, S.modules, G.id, { module: L.id, mate: tg[0].mateId }, P, motor).ok === false);
}

// ---------- 3. 齒條升降 ← 夾爪（平貼對鎖） ----------
{
  const [A, G] = fresh('rack-lift', 'gear-gripper'); const P = S.topo.params;
  const t = C.mateTargets(S.comps, S.modules, G.id, P);
  const car = t.find(x => /滑台/.test(x.name));
  check('齒條滑台是可接的對鎖承接面', car && car.ok && car.kind === 'bolt');
  const r = C.mateConnect(S.comps, S.modules, G.id, { module: A.id, mate: car.mateId }, P, motor);
  check('接上：同平面對鎖（沒有 orient），style bolt', r.ok && !modOf(r, G.id).mount.orient && r.style === 'bolt' && C.mateStyle(r.modules, G.id) === 'bolt');
  const pl = r.ok ? plan(r) : { joints: [] };
  check('製作計畫有 2 個對鎖關節、五金表有對鎖用的 M3', pl.joints.filter(j => j.kind === 'mount-bolt').length === 2 && hw(r).some(x => /^M3×/.test(x.spec) && /對鎖/.test(x.note || '')));
  const ss = C.mateStyles(r.comps, r.modules, G.id, P);
  check('對鎖只有一種接法；不能切成立在面上（白話原因）', ss.length === 1 && ss[0].style === 'bolt' && ss[0].current && C.setMateStyle(r.comps, r.modules, G.id, 'stand-top', P).ok === false);
  check('mateOfMount：夾爪接在齒條升降的滑台', C.mateOfMount(r.comps, r.modules, G.id, P)?.mateId === car.mateId);
}

// ---------- 4. 只有 1 個孔的輸出端不能對鎖 ----------
{
  const [L, G] = fresh('fourbar-lift', 'gear-gripper'); const P = S.topo.params;
  const mods = S.modules.map(m => m.id === L.id ? { ...m, mates: { ...m.mates, receive: [...m.mates.receive, { id: 'rx', name: '工具架板面', ref: { kind: 'bolt', output: 'tool' } }] } } : m);
  const t = C.mateTargets(S.comps, mods, G.id, P).find(x => x.mateId === 'rx');
  check('只有 1 個孔的輸出端：列出但 ok false，原因講到孔不夠；mateConnect 拒絕', t && t.ok === false && /孔/.test(t.reason) && C.mateConnect(S.comps, mods, G.id, { module: L.id, mate: 'rx' }, P, motor).ok === false);
}

// ---------- 5. 三個構件：齒條升降 ← 四連桿 ← 夾爪 ----------
{
  const [A, L, G] = fresh('rack-lift', 'fourbar-lift', 'gear-gripper'); const P = S.topo.params;
  const tl = C.mateTargets(S.comps, S.modules, L.id, P);
  check('四連桿可接到齒條滑台（不列自己的承接面）', tl.length === 1 && tl[0].module === A.id && tl[0].ok);
  const r1 = C.mateConnect(S.comps, S.modules, L.id, { module: A.id, mate: tl[0].mateId }, P, motor);
  const tg = r1.ok ? C.mateTargets(r1.comps, r1.modules, G.id, P) : [];
  check('四連桿接上後，夾爪的目標：四連桿的工具架上下緣（齒條滑台已被佔用仍列出也可，但至少這兩個 ok）', r1.ok && tg.filter(x => x.module === L.id && x.ok).length === 2);
  const low = tg.find(x => x.module === L.id && /下緣/.test(x.name));
  const r2 = C.mateConnect(r1.comps, r1.modules, G.id, { module: L.id, mate: low.mateId }, P, motor);
  check('夾爪接到「已安裝的」四連桿的工具架下緣', r2.ok && C.mateOfMount(r2.comps, r2.modules, G.id, P).module === L.id && C.mateOfMount(r2.comps, r2.modules, L.id, P).module === A.id);
  audit(r2, G.id, '三構件・夾爪壓在工具架下緣');
  const sol = r2.ok ? solveAt(r2.comps, r2.modules, P, { '1': 10 }) : { isValid: false };
  check('三層都解得出來（齒條馬達轉 10°）', sol.isValid === true);
  check('環：齒條升降不能反過來接到夾爪或四連桿身上（沒有目標或 ok false）', C.mateTargets(r2.comps, r2.modules, A.id, P).every(x => x.ok === false));
  check('子孫的承接面要標成不能接（會形成環）', (() => { const t = C.mateTargets(r1.comps, r1.modules, A.id, P); return t.every(x => x.ok === false && /環|自己/.test(x.reason)); })());
}
console.log(fails.length ? `\n一致性檢查失敗 (${fails.length}):\n` + fails.join('\n') : '\n角碼一致性：全部通過');
report('mate-connect');
