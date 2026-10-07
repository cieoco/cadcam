// M1（SDD-MATE-FACES §3）：接合面資料模型。每個模組在設計時記下
//   attach ＝「我從哪一側裝到別人身上」（一個方向，模組自己的座標，朝向宿主那一側的外法線）
//   receive＝「別人可以裝在我哪裡」（多個，對現有接口的穩定參照，不存座標）
// 參照（ref）不能用 edge:frame:<k>：k 會隨安裝狀態與其他模組改變。
import { check, report } from './_harness.mjs';
import { S, B, fresh, motor, ed } from './_bench-setup.mjs';
let M = null;
try { M = await import('../js/blocks/mates.js'); } catch (e) { console.log(String(e).slice(0, 200)); }
const fns = ['ownPorts', 'portRef', 'resolveRef', 'suggestMates', 'effectiveMates', 'setAttach', 'addReceive', 'removeReceive', 'renameReceive', 'normalizeMates'];
check('mates.js 匯出 ' + fns.join('／'), !!M && fns.every(f => typeof M[f] === 'function'));
if (!M || !fns.every(f => typeof M[f] === 'function')) { report('mates'); process.exit(1); }
const Sch = await import('../js/blocks/schema.js');
const Ops = await import('../js/blocks/module-ops.js');
const snap = () => JSON.parse(JSON.stringify({ kind: 'blocks', v: 1, comps: S.comps, modules: S.modules, params: S.topo.params }));
const norm = x => ((x % 360) + 360) % 360;
const sameDeg = (a, b) => Math.abs(((a - b + 540) % 360) - 180) < 1;

// ---------- 1. ownPorts：模組「自己」的接口，不受其他未安裝模組影響 ----------
const [A, L, G] = fresh('rack-lift', 'fourbar-lift', 'gear-gripper');
const P = S.topo.params;
{
  const alone = (() => { const [L1] = fresh('fourbar-lift'); const r = M.ownPorts(S.comps, S.modules, L1.id, S.topo.params).map(p => `${p.id}|${Math.round(p.lengthMm || 0)}`).sort(); return r; })();
  fresh('rack-lift', 'fourbar-lift', 'gear-gripper');
  const L2 = S.modules[1];
  const withOthers = M.ownPorts(S.comps, S.modules, L2.id, S.topo.params).map(p => `${p.id.replace(/_\d+/g, '')}|${Math.round(p.lengthMm || 0)}`).sort();
  check('四連桿單獨存在與旁邊有兩個未安裝模組時，自己的接口（種類、數量、邊長）相同', JSON.stringify(alone.map(s => s.replace(/_\d+/g, ''))) === JSON.stringify(withOthers));
  const raw = B.autoPorts(S.comps, S.modules, L2.id, S.topo.params).filter(p => /frame/.test(p.id));
  const own = M.ownPorts(S.comps, S.modules, L2.id, S.topo.params).filter(p => p.body && p.body.kind === 'frame');
  console.log('raw frame edges:', raw.map(p => Math.round(p.lengthMm)).join(','), ' own:', own.map(p => Math.round(p.lengthMm)).join(','));
  // M5a：autoPorts 的機架邊也改成宿主自己的（不再是所有未安裝模組合併的那一塊），和 ownPorts 的邊編號一致
  check('自己的機架邊不含別的模組撐出來的長邊（autoPorts 與 ownPorts 的機架邊一致）', own.length > 0 && JSON.stringify(own.map(p => Math.round(p.lengthMm))) === JSON.stringify(raw.map(p => Math.round(p.lengthMm))));
  check('ownPorts 每個接口都帶 module＝自己、kind 是 edge 或 bolt', M.ownPorts(S.comps, S.modules, L2.id, S.topo.params).every(p => p.module === L2.id && ['edge', 'bolt'].includes(p.kind)));
}

// ---------- 2. 參照：穩定、可還原 ----------
{
  const [L1, G1] = fresh('fourbar-lift', 'gear-gripper');
  const Pp = S.topo.params;
  const ports = M.ownPorts(S.comps, S.modules, L1.id, Pp);
  const brace = S.comps.find(c => c.moduleId === L1.id && c.id.startsWith('ToolBrace'));
  const pr = ports.find(p => p.id === `edge:${brace.id}:R`);
  const ref = M.portRef(pr, ports);
  check('桿邊的參照：{ kind:bar, id, side }', ref && ref.kind === 'bar' && ref.id === brace.id && ref.side === pr.side && Object.keys(ref).length === 3);
  const fr = ports.filter(p => p.body && p.body.kind === 'frame');
  const refs = fr.map(p => M.portRef(p, ports));
  check('機架邊的參照：{ kind:frame, normalDeg, order }，不含邊編號 k 與座標', refs.length > 0 && refs.every(r => r && r.kind === 'frame' && Number.isFinite(r.normalDeg) && Number.isInteger(r.order) && r.order >= 0 && Object.keys(r).length === 3));
  check('同一模組的機架邊參照互不相同', new Set(refs.map(r => JSON.stringify(r))).size === refs.length);
  check('每個接口 resolveRef(portRef(p)) 都回到同一個接口', ports.every(p => { const r = M.portRef(p, ports); const q = r && M.resolveRef(ports, r); return q && q.id === p.id; }));
  check('輸出端對鎖的參照：{ kind:bolt, output }', (() => { const b = ports.find(p => p.kind === 'bolt'); const r = M.portRef(b, ports); return r && r.kind === 'bolt' && r.output === b.output; })());
  check('找不到的參照回 null（不丟例外、不亂配）', M.resolveRef(ports, { kind: 'bar', id: 'nope', side: 1 }) === null && M.resolveRef(ports, { kind: 'frame', normalDeg: 45, order: 9 }) === null && M.resolveRef(ports, null) === null);
  // 整個模組平移後，機架邊的參照仍指到同一條邊（方向與邊長相同）
  const before = fr.map(p => ({ ref: M.portRef(p, ports), len: Math.round(p.lengthMm) }));
  const moved = Ops.translateModule(S.comps, L1.id, 137, -42);
  const ports2 = M.ownPorts(moved, S.modules, L1.id, Pp);
  check('模組平移後，機架邊參照指到的邊長不變', before.every(b => { const q = M.resolveRef(ports2, b.ref); return q && Math.round(q.lengthMm) === b.len; }));
  // 裝上去之後（宿主當別人的子模組以外的情況：這裡把夾爪裝上四連桿），四連桿自己的參照不受影響
  const c = B.connect(S.comps, S.modules, G1.id, { module: L1.id, port: pr.id }, Pp, motor, { joint: 'bracket-m3' });
  const ports3 = M.ownPorts(c.comps, c.modules, L1.id, Pp);
  check('接上子模組後，宿主原本的參照仍可還原', c.ok && before.every(b => M.resolveRef(ports3, b.ref)) && M.resolveRef(ports3, ref).id === pr.id);
}

// ---------- 3. 建議與內建預標 ----------
{
  const [A1, L1, G1] = fresh('rack-lift', 'fourbar-lift', 'gear-gripper');
  const Pp = S.topo.params;
  check('內建模組插入後就帶 mates（不必靠建議）', [A1, L1, G1].every(m => m.mates && Array.isArray(m.mates.receive)));
  const eg = M.effectiveMates(S.comps, S.modules, G1.id, Pp), el = M.effectiveMates(S.comps, S.modules, L1.id, Pp), ea = M.effectiveMates(S.comps, S.modules, A1.id, Pp);
  console.log('gripper:', JSON.stringify(eg.attach), eg.receive.map(r => r.name).join(','), '| lift:', JSON.stringify(el.attach), el.receive.map(r => r.name).join(','), '| rack:', JSON.stringify(ea.attach), ea.receive.map(r => r.name).join(','));
  check('內建的 effectiveMates：suggested 為 false', eg.suggested === false && el.suggested === false && ea.suggested === false);
  // 夾爪：爪往 −y 伸（base→重心 −90°），所以朝宿主的那一側是 +90°
  check('夾爪：安裝方向 90°（爪的反方向），沒有承接面', eg.attach && sameDeg(eg.attach.normalDeg, 90) && eg.receive.length === 0);
  const brace = S.comps.find(c => c.moduleId === L1.id && c.id.startsWith('ToolBrace'));
  check('四連桿升降臂：承接面有工具架的兩條長邊，名稱不含內部零件 id', el.receive.length >= 2 && ['L', 'R'].every(s => el.receive.some(r => r.valid && r.port && r.port.id === `edge:${brace.id}:${s}`)) && el.receive.every(r => r.name && !/[A-Za-z]+_\d+|ToolBrace|LiftCrank/.test(r.name)));
  check('齒條升降：承接面有滑台對鎖', ea.receive.some(r => r.valid && r.port && r.port.kind === 'bolt' && /滑台/.test(r.name)));
  check('每個內建模組都有安裝方向（是 90° 的倍數）', [eg, el, ea].every(e => e.attach && Number.isFinite(e.attach.normalDeg) && Math.abs(norm(e.attach.normalDeg) % 90) < 1e-6));
  check('receive 每筆有唯一 id、valid、已還原的 port', [eg, el, ea].every(e => new Set(e.receive.map(r => r.id)).size === e.receive.length && e.receive.every(r => r.valid === true && r.port)));
  // 同一個內建插第二次（零件 id 會加不同尾碼）仍然還原得出來
  ed.insertBuiltin('fourbar-lift');
  const Lb = S.modules[S.modules.length - 1];
  const eb = M.effectiveMates(S.comps, S.modules, Lb.id, S.topo.params);
  check('同一個內建插第二次：參照跟著新的零件 id，全部有效', Lb.id !== L1.id && eb.receive.length === el.receive.length && eb.receive.every(r => r.valid && r.port.module === Lb.id));
  // 沒有 mates 的模組（舊檔／自己畫的）：即時建議，不寫回
  const stripped = S.modules.map(m => { const { mates, ...rest } = m; return rest; });
  const sg = M.effectiveMates(S.comps, stripped, G1.id, S.topo.params), sl = M.effectiveMates(S.comps, stripped, L1.id, S.topo.params);
  check('沒有 mates：effectiveMates 給建議（suggested true）且不改輸入', sg.suggested === true && sl.suggested === true && stripped.every(m => !('mates' in m)));
  check('建議的安裝方向＝base→重心的反方向，取最近的 90°（夾爪 90°）', sg.attach && sameDeg(sg.attach.normalDeg, 90));
  check('建議的承接面：每個輸出端桿的兩條長邊（四連桿＝工具架上下緣）', ['L', 'R'].every(s => sl.receive.some(r => r.port && r.port.id === `edge:${brace.id}:${s}`)));
  const sa = M.effectiveMates(S.comps, stripped, A1.id, S.topo.params);
  check('建議的承接面：有 2 個以上對鎖孔的輸出端（齒條滑台）→ 對鎖', sa.receive.some(r => r.port && r.port.kind === 'bolt'));
  check('建議：只有 1 個孔的輸出端不建議對鎖（做不出來）', !sl.receive.some(r => r.port && r.port.kind === 'bolt'));
  check('suggestMates 與 effectiveMates 的建議一致', JSON.stringify(M.suggestMates(S.comps, stripped, G1.id, S.topo.params).attach) === JSON.stringify(sg.attach));
}

// ---------- 4. 編輯（不改輸入） ----------
{
  const [L1, G1] = fresh('fourbar-lift', 'gear-gripper');
  const Pp = S.topo.params, m0 = JSON.stringify(S.modules);
  const a = M.setAttach(S.modules, G1.id, -92);
  check('setAttach：角度取最近的 90°、只改那個模組、不改輸入', a.find(m => m.id === G1.id).mates.attach.normalDeg === 270 && JSON.stringify(S.modules) === m0 && a.find(m => m.id === L1.id) === S.modules.find(m => m.id === L1.id));
  check('setAttach(null)：清掉安裝方向', M.setAttach(a, G1.id, null).find(m => m.id === G1.id).mates.attach === null);
  const ports = M.ownPorts(S.comps, S.modules, L1.id, Pp);
  const crank = ports.find(p => /LiftCrank/.test(p.id) && p.kind === 'edge');
  const r = M.addReceive(S.comps, S.modules, L1.id, crank.id, Pp, '搖臂上緣');
  const added = r.ok && r.modules.find(m => m.id === L1.id).mates.receive.find(x => x.name === '搖臂上緣');
  check('addReceive：加一個承接面（存參照不存接口 id 字串）', !!added && added.ref.kind === 'bar' && typeof added.id === 'string' && !('port' in added) && JSON.stringify(S.modules) === m0);
  check('addReceive：同一個接口加第二次被拒絕（白話原因）', (() => { const r2 = M.addReceive(S.comps, r.modules, L1.id, crank.id, Pp); return r2.ok === false && typeof r2.reason === 'string' && r2.reason.length > 0; })());
  check('addReceive：不存在的接口被拒絕', M.addReceive(S.comps, S.modules, L1.id, 'edge:nope:L', Pp).ok === false);
  check('addReceive：沒給名字時用接口名稱產生，不含內部零件 id', (() => { const r3 = M.addReceive(S.comps, S.modules, L1.id, crank.id, Pp); const x = r3.modules.find(m => m.id === L1.id).mates.receive.slice(-1)[0]; return r3.ok && x.name && !/LiftCrank|_\d+/.test(x.name); })());
  check('上限 8 個承接面', (() => { let mods = S.modules.map(m => m.id === L1.id ? { ...m, mates: { attach: null, receive: [] } } : m), ok = 0; for (const p of ports.filter(p => p.kind === 'edge')) { const x = M.addReceive(S.comps, mods, L1.id, p.id, Pp); if (x.ok) { ok++; mods = x.modules; } } return ports.filter(p => p.kind === 'edge').length > 8 && ok === 8; })());
  const rn = M.renameReceive(r.modules, L1.id, added.id, '  新名字  ');
  check('renameReceive：改名（去頭尾空白、最長 24 字）', rn.find(m => m.id === L1.id).mates.receive.find(x => x.id === added.id).name === '新名字');
  const rm = M.removeReceive(r.modules, L1.id, added.id);
  check('removeReceive：移除', !rm.find(m => m.id === L1.id).mates.receive.some(x => x.id === added.id));
  // 參照的零件被刪掉 → 失效但保留
  const gone = S.comps.filter(c => c.id !== crank.body.id);
  const eff = M.effectiveMates(gone, r.modules, L1.id, Pp);
  check('零件被刪：那筆承接面 valid false、port null，仍留在清單（不靜默丟棄）', eff.receive.some(x => x.id === added.id && x.valid === false && x.port === null));
}

// ---------- 5. 存檔往返 ----------
{
  const [L1, G1] = fresh('fourbar-lift', 'gear-gripper');
  const s1 = snap();
  const n1 = Sch.normalizeSnapshot(JSON.parse(JSON.stringify(s1)));
  check('存檔往返：mates 完整保留', JSON.stringify(n1.modules.map(m => m.mates)) === JSON.stringify(S.modules.map(m => m.mates)));
  const old = snap(); old.modules.forEach(m => delete m.mates);
  const n2 = Sch.normalizeSnapshot(JSON.parse(JSON.stringify(old)));
  check('舊檔（沒有 mates）：讀進來不會憑空多出 mates 欄位', n2.modules.every(m => !('mates' in m)));
  const bad = snap();
  bad.modules[0].mates = { attach: { normalDeg: 'x' }, receive: [{ id: 'a', name: 'ok', ref: { kind: 'bar', id: 'q', side: 1 } }, { id: 'a', name: 'dup', ref: { kind: 'bar', id: 'q', side: -1 } }, { id: 'b', name: '', ref: { kind: 'wat' } }, 7, { id: 'c', name: 'f', ref: { kind: 'frame', normalDeg: 90, order: 0, extra: 1 } }] };
  const n3 = Sch.normalizeSnapshot(JSON.parse(JSON.stringify(bad)));
  const mm = n3.modules[0].mates;
  check('壞資料：attach 不合法→null；receive 去掉不合法與重複 id；多餘欄位清掉', mm && mm.attach === null && mm.receive.length === 2 && mm.receive[0].id === 'a' && mm.receive[0].name === 'ok' && JSON.stringify(mm.receive[1].ref) === JSON.stringify({ kind: 'frame', normalDeg: 90, order: 0 }));
  check('normalizeMates(undefined) 回 undefined（不新增欄位）', M.normalizeMates(undefined) === undefined);
  // 模組庫範本往返：存成範本再插入，mates 跟著新的零件 id
  const t = Ops.moduleToTemplate(S.comps, S.modules, S.topo.params, L1.id);
  const inst = Ops.instantiateTemplate(t, { counter: 50, usedMotorIds: ['1', '2'], existingTokens: new Set(S.comps.flatMap(c => [c.id, c.p1 && c.p1.id, c.p2 && c.p2.id].filter(Boolean))), place: { x: 300, y: 300 } });
  const im = inst.module;
  const eff = M.effectiveMates(inst.comps, [im], im.id, inst.params);
  check('存成範本再插入：mates 還在、參照改指新的零件 id、全部有效', !!im.mates && eff.suggested === false && eff.receive.length === M.effectiveMates(S.comps, S.modules, L1.id, S.topo.params).receive.length && eff.receive.every(r => r.valid));
  // 組合積木
  const c = B.connect(S.comps, S.modules, G1.id, { module: L1.id, port: M.effectiveMates(S.comps, S.modules, L1.id, S.topo.params).receive[0].port.id }, S.topo.params, motor, { joint: 'bracket-m3' });
  const ct = Ops.compositeToTemplate(c.comps, c.modules, S.topo.params, L1.id);
  check('組合積木範本保留每個模組的 mates', c.ok && ct && ct.modules.every(m => !!m.mates || !!(m.module && m.module.mates)));
}
report('mates');
