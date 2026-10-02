// D4：任意角度（以 15° 為一格傾斜，±60°）＋跨平面干涉改成「底板／疊層」兩塊立體檢查（站立時不再誤報）。
import { check, report } from './_harness.mjs';
import { S, B, Asm, fresh, motor, near, solveAt, cnc, ex } from './_bench-setup.mjs';
const BP = await import('../js/blocks/build-plan.js');
const IF = await import('../js/blocks/interference.js');
const OJ = await import('../js/blocks/orthogonal-joint.js');
const Sch = await import('../js/blocks/schema.js');
const STL = await import('../js/blocks/adapter-stl.js');

const [L, G] = fresh('fourbar-lift', 'gear-gripper');
const P = S.topo.params;
const hang = B.connect(S.comps, S.modules, G.id, { module: L.id, port: 'edge:ToolBrace_1:R' }, P, motor);
const orient = st => st.modules.find(m => m.id === G.id).mount.orient;
const frameOf = st => Asm.orthogonalFrame(st.comps, st.modules, G.id, solveAt(st.comps, st.modules, P).points, P);
const adj = (st, ...acts) => acts.reduce((s, a) => { const r = B.benchAdjust(s.comps, s.modules, G.id, a, P); if (!r.ok) throw new Error(a + ': ' + r.reason); return r; }, st);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

// ---------- 1. 傾斜 ----------
const f0 = frameOf(hang);
const t1 = adj(hang, 'tilt+');
check("'tilt+'：tiltDeg 15", orient(t1).tiltDeg === 15);
check('連按到底夾在 60°、反向夾在 −60°', orient(adj(hang, 'tilt+', 'tilt+', 'tilt+', 'tilt+')).tiltDeg === 60 && B.benchAdjust(adj(hang, 'tilt+', 'tilt+', 'tilt+', 'tilt+').comps, adj(hang, 'tilt+', 'tilt+', 'tilt+', 'tilt+').modules, G.id, 'tilt+', P).ok === false && orient(adj(hang, 'tilt-', 'tilt-', 'tilt-', 'tilt-')).tiltDeg === -60);
check('回到 0° 時不留 tiltDeg 欄位', !('tiltDeg' in orient(adj(t1, 'tilt-'))));
const t30 = adj(hang, 'tilt+', 'tilt+'), f30 = frameOf(t30);
const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
console.log('tilt30 frame:', JSON.stringify({ d: f30.d, m: f30.m, n: f30.n }));
check('傾斜 30°：繞接合線轉——n′＝cos·n＋sin·m、m′＝cos·m−sin·n、d 與 origin 不變',
  near(f30.n.x, c * f0.n.x + s * f0.m.x) && near(f30.n.y, c * f0.n.y + s * f0.m.y) && near(f30.n.z, c * f0.n.z + s * f0.m.z) &&
  near(f30.m.y, c * f0.m.y - s * f0.n.y) && near(f30.m.z, c * f0.m.z - s * f0.n.z) && near(f30.d.x, f0.d.x) && near(f30.origin.x, f0.origin.x) && near(f30.origin.y, f0.origin.y));
check('仍是單位正交右手系（d×n＝m）', near(dot(f30.d, f30.n), 0) && near(dot(f30.n, f30.m), 0) && near(dot(f30.n, f30.n), 1) && (() => { const x = cross(f30.d, f30.n); return near(x.x, f30.m.x) && near(x.y, f30.m.y) && near(x.z, f30.m.z); })());
const st30 = adj(hang, 'stand', 'tilt+', 'tilt+'), fs = frameOf(st30);
check('站立時也能傾斜（正交右手系）', near(dot(fs.d, fs.n), 0) && near(dot(fs.n, fs.m), 0) && (() => { const x = cross(fs.d, fs.n); return near(x.x, fs.m.x) && near(x.y, fs.m.y) && near(x.z, fs.m.z); })() && Math.abs(fs.n.z) < 0.99);
const n = Sch.normalizeSnapshot(JSON.parse(JSON.stringify({ kind: 'blocks', v: 1, comps: t30.comps, modules: t30.modules, params: P })));
check('存檔往返保留 tiltDeg', JSON.stringify(n.modules.find(m => m.id === G.id).mount.orient) === JSON.stringify(orient(t30)));
const band0 = Asm.orthogonalBand(hang.comps, hang.modules, G.id, solveAt(hang.comps, hang.modules, P).points, 15, P);
const band30 = Asm.orthogonalBand(t30.comps, t30.modules, G.id, solveAt(t30.comps, t30.modules, P).points, 15, P);
const yr = b => [Math.min(...b.map(p => p.y)), Math.max(...b.map(p => p.y))];
check('宿主視圖的側影：傾斜後往外法線方向變寬（投影）', band30.length >= 4 && (yr(band30)[1] - yr(band30)[0]) > (yr(band0)[1] - yr(band0)[0]) + 5);

// ---------- 2. 轉接座 ----------
const lay = OJ.adapterLayout(t30.comps, t30.modules, G.id, P, { stockMm: 3 });
check('adapterLayout 帶 tiltDeg 30', lay && lay.tiltDeg === 30);
const spec = { lengthMm: 20, wallMm: 4, flangeMm: 14, holeDiameterMm: 3.2, holesPerFlange: 2, segments: 16 };
const closed = mesh => { const und = new Map(), dir = new Set(); let dup = 0, deg = 0; mesh.triangles.forEach(([a, b, c2]) => { if (a === b || b === c2 || a === c2) deg++; [[a, b], [b, c2], [c2, a]].forEach(([u, v]) => { const k = u < v ? `${u},${v}` : `${v},${u}`; und.set(k, (und.get(k) || 0) + 1); const d = `${u},${v}`; if (dir.has(d)) dup++; dir.add(d); }); }); return deg === 0 && dup === 0 && [...und.values()].every(x => x === 2); };
const vol = mesh => mesh.triangles.reduce((sum, [a, b, c2]) => { const p = mesh.vertices[a], q = mesh.vertices[b], r = mesh.vertices[c2]; return sum + (p[0] * (q[1] * r[2] - q[2] * r[1]) - p[1] * (q[0] * r[2] - q[2] * r[0]) + p[2] * (q[0] * r[1] - q[1] * r[0])) / 6; }, 0);
const m0 = STL.adapterMesh(spec), m30 = STL.adapterMesh({ ...spec, tiltDeg: 30 }), mN = STL.adapterMesh({ ...spec, tiltDeg: -45 });
check('tiltDeg 0 與沒給一樣', JSON.stringify(STL.adapterMesh({ ...spec, tiltDeg: 0 })) === JSON.stringify(m0));
check('傾斜 30° 的轉接座：網格封閉、方向一致（可由多個封閉殼組成，殼之間不共用頂點）', closed(m30));
check('傾斜 −45° 也封閉', closed(mN));
console.log('adapter volume', vol(m0).toFixed(0), vol(m30).toFixed(0), vol(mN).toFixed(0));
check('體積為正、與直角版同一個量級（0.7～1.6 倍）', vol(m30) > 0.7 * vol(m0) && vol(m30) < 1.6 * vol(m0) && vol(mN) > 0.7 * vol(m0) && vol(mN) < 1.6 * vol(m0));
check('形狀確實不同（頂點外框改變）', (() => { const mx = m => Math.max(...m.vertices.map(v => v[1])); const mz = m => Math.max(...m.vertices.map(v => v[2])); return Math.abs(mx(m30) - mx(m0)) + Math.abs(mz(m30) - mz(m0)) > 1; })());
const plan = BP.buildPlan({ comps: t30.comps, modules: t30.modules, params: P, exportSettings: ex, cnc });
check('製作包寫出轉接座夾角（30° 傾斜 → 兩翼夾角 120° 或 60°）', /(120|60)°/.test(BP.buildPackHtml(plan, { title: 'T', cnc, modules: t30.modules })));

// ---------- 3. 跨平面干涉：底板與疊層分開檢查 ----------
const rangesHit = (st, pose) => IF.findInterference({ comps: st.comps, modules: st.modules, params: P, plan: BP.buildPlan({ comps: st.comps, modules: st.modules, params: P, exportSettings: ex, cnc }), pose, exportSettings: ex });
const names = w => w.filter(x => x.kind === 'cross-plane').flatMap(x => x.parts);
const stand = adj(hang, 'stand');
console.log('stand hits:', names(rangesHit(stand, { '1': 0, '2': 0 })).join(' '));
check('站在工具架上面：不會誤報撞到下面幾層的曲柄、立桿、前桿', !names(rangesHit(stand, { '1': 0, '2': 0 })).some(x => /^(LiftCrank|LiftUpright|LiftFollower|ToolFront|frame$)/.test(x)));
check('壓在下緣（原本的接法）仍然沒有干涉', rangesHit(hang, { '1': 0, '2': 0 }).length === 0);
check('換到上緣仍會撞到前桿與斜撐（真的干涉不能漏）', (() => { const w = names(rangesHit(adj(hang, 'side'), { '1': 0, '2': 0 })); return w.some(x => x.startsWith('ToolFront')) && w.some(x => x.startsWith('ToolDiag')); })());
check('掉頭後升降 30° 仍會撞到曲柄', names(rangesHit(adj(hang, 'reverse'), { '1': 30, '2': 0 })).some(x => x.startsWith('LiftCrank')));
check('傾斜時干涉檢查跑得動', Array.isArray(rangesHit(t30, { '1': 0, '2': 0 })));
report('bench-tilt');
