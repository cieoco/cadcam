// G5：直角組立落在同一個 8 mm 立體格（SDD-GRID-BLOCKS R4／R6）。13／3 與 18／4 兩種宿主棍都要成立。跑法：node test/grid-corner.mjs
import { check, report } from './_harness.mjs';
import { S, B, Asm, fresh, motor, near, solveAt } from './_bench-setup.mjs';
const OJ = await import('../js/blocks/orthogonal-joint.js');
const { gridIssues } = await import('../js/blocks/grid-rule.js');
const P8 = 8;
const mod8 = v => Math.abs(v / P8 - Math.round(v / P8)) < 1e-6;

for (const [width, thick] of [[13, 3], [18, 4]]) {
  const tag = `${width}/${thick}`;
  const [L, G] = fresh('fourbar-lift', 'gear-gripper');
  const P = S.topo.params;
  const brace = S.comps.find(c => c.moduleId === L.id && c.id.startsWith('ToolBrace'));
  brace.stock = { widthMm: width, thicknessMm: thick, material: 'unspecified' };
  const hang = B.connect(S.comps, S.modules, G.id, { module: L.id, port: `edge:${brace.id}:R` }, P, motor);
  const st = B.benchAdjust(hang.comps, hang.modules, G.id, 'stand', P);
  check(`${tag}：宿主寬 ${width} 站得住（列印轉接座只要 2m_h＝${16 - thick}）`, st.ok);
  const mh = P8 - thick / 2, mc = P8 - 3 / 2;   // 夾爪底板厚 3
  const pts = solveAt(st.comps, st.modules, P).points;
  const f = Asm.orthogonalFrame(st.comps, st.modules, G.id, pts, P);
  const a = OJ.adapterLayout(st.comps, st.modules, G.id, P, { stockMm: 3 });
  const p1 = pts[brace.p1.id], p2 = pts[brace.p2.id], len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const dir = { x: (p2.x - p1.x) / len, y: (p2.y - p1.y) / len };
  const hostAt = h => ({ x: p1.x + h.u * dir.x - h.v * dir.y, y: p1.y + h.u * dir.y + h.v * dir.x, z: 0 });   // z 以宿主中面為 0
  const childAt = (h, w) => { const q = Asm.toWorld3D(f, h, w); return { x: q.x, y: q.y, z: q.z - thick / 2 }; };
  const sub = (p, q) => ({ x: p.x - q.x, y: p.y - q.y, z: p.z - q.z });
  const dot = (p, v) => p.x * v.x + p.y * v.y + p.z * v.z;

  check(`${tag}：兩孔、孔距 8、長度 (n−1)·8＋2m_h`, a.hostHoles.length === 2 && near(a.hostHoles[1].u - a.hostHoles[0].u, P8) && near(a.lengthMm, P8 + 2 * mh));
  check(`${tag}：翼長各為 2m（宿主翼 2m_c、子模組翼 2m_h），孔在翼正中央`, near(a.flangeMm, 2 * mc) && near(a.flangeBMm, 2 * mh));
  check(`${tag}：翼厚 W ≤ m − 2.75（螺絲頭不頂到另一翼）`, a.wallMm <= Math.min(mh, mc) - 2.75 + 1e-9);
  check(`${tag}：宿主孔在桿中線`, a.hostHoles.every(h => near(h.v, 0)));
  const hostO = hostAt(a.hostHoles[0]);
  let ok = true;
  a.hostHoles.forEach((h, k) => {
    const mid = sub(childAt(a.childHoles[k], 3 / 2), hostAt(h));   // 立板中面（板厚 3）離宿主孔
    const first = sub(childAt(a.childHoles[k], 3 / 2), hostO);
    const m = { x: f.m.x, y: f.m.y, z: 0 }, dd = { x: f.d.x, y: f.d.y, z: 0 }, zz = { x: 0, y: 0, z: 1 };
    if (!near(Math.abs(dot(mid, m)), P8, 1e-6)) ok = false;                 // 中面離宿主孔列 P
    if (!near(dot(mid, dd), 0, 1e-6)) ok = false;                           // 沿接合線同一格位
    if (!mod8(dot(first, m)) || !mod8(dot(first, dd)) || !mod8(dot(first, zz))) ok = false;   // 三軸皆 8 的倍數
    if (!near(dot(first, zz), P8, 1e-6)) ok = false;                        // 孔高：宿主中面上方 P
    if (!near(Math.abs(dot(sub(childAt(a.childHoles[k], 0), hostAt(h)), m)), mc, 1e-6)) ok = false;   // 宿主翼孔離立板面 m_c
  });
  check(`${tag}：翼孔心、宿主孔、立板第一列孔同在 8 mm 立體格（三軸為 8 的倍數、中面距 P、孔高 P）`, ok);

  // 沿接合線的相位：宿主桿 p1 不在世界原點，孔格自 p1 起 8 的倍數（沿桿軸 u）
  const onGrid = layout => layout.hostHoles.every(h => mod8(h.u));
  const r6 = (comps, modules) => gridIssues(comps, P, { modules }).filter(i => i.rule === 'R6' && i.moduleId === G.id).map(i => i.subject);
  const withOrient = (patch, jointPatch) => st.modules.map(m => m.id === G.id ? { ...m, mount: { ...m.mount, orient: { ...m.mount.orient, ...patch, ...(jointPatch ? { joint: { ...m.mount.orient.joint, ...jointPatch } } : {}) } } } : m);
  check(`${tag}：宿主桿 p1 不在原點（${brace.p1.x}, ${brace.p1.y}），初裝位置（offset ${st.modules.find(m => m.id === G.id).mount.orient.offsetMm}）孔落在宿主孔格、沒有宿主孔 R6`, (brace.p1.x !== 0 || brace.p1.y !== 0) && onGrid(a) && !r6(st.comps, st.modules).includes('轉接座宿主孔'));
  // 一格滑動（按鈕＝吸附）：孔仍在宿主孔格，每次移 8 mm
  let cur = st, slideOk = true;
  for (const act of ['slide+', 'slide+', 'slide-']) {
    const before = OJ.adapterLayout(cur.comps, cur.modules, G.id, P, { stockMm: 3 });
    cur = B.benchAdjust(cur.comps, cur.modules, G.id, act, P);
    const after = OJ.adapterLayout(cur.comps, cur.modules, G.id, P, { stockMm: 3 });
    if (!cur.ok || !onGrid(after) || !near(Math.abs(after.hostHoles[0].u - before.hostHoles[0].u), P8) || r6(cur.comps, cur.modules).includes('轉接座宿主孔')) slideOk = false;
  }
  check(`${tag}：按鈕滑動每次一格 8 mm，孔仍在宿主孔格、沒有宿主孔 R6`, slideOk);
  check(`${tag}：夾爪底板本身對格，接合相位不一致明確報子板R6`, !gridIssues(st.comps,P,{modules:st.modules}).some(i=>i.rule==='R3'&&i.moduleId===G.id) && r6(st.comps,st.modules).includes('轉接座子模組孔'));
  // 數字輸入可離格：offset 差 0.5 mm → 孔離格，R6 回報宿主孔離格；回到格上就消失
  const offOff = withOrient({ offsetMm: st.modules.find(m => m.id === G.id).mount.orient.offsetMm + 0.5 });
  const aOff = OJ.adapterLayout(st.comps, offOff, G.id, P, { stockMm: 3 });
  check(`${tag}：數字輸入離格 0.5 mm → 孔離宿主孔格，R6 回報「轉接座宿主孔」`, !onGrid(aOff) && r6(st.comps, offOff).includes('轉接座宿主孔'));
  // 舊作品的翼厚：W > m − 2.75 時回報，不自動改值
  const heavy = withOrient({}, { wallMm: 4.5 });
  check(`${tag}：wallMm 4.5 → R6 回報翼厚過厚，值不被改動`, r6(st.comps, heavy).includes('轉接座翼厚') && heavy.find(m => m.id === G.id).mount.orient.joint.wallMm === 4.5);
}
// 不同宿主板厚：STL沿線孔與子板孔同源，初裝偏移保存重開不被截成0.1mm。
{
 const [L,G]=fresh('fourbar-lift','gear-gripper'),P=S.topo.params;
 for(const c of S.comps.filter(c=>c.moduleId===L.id))for(const k of ['p1','p2','p3'])if(c[k]?.type==='fixed'||c[k]?.physicalMotor)c[k].frameStock={thicknessMm:4};
 const port=B.autoPorts(S.comps,S.modules,L.id,P,{childId:G.id}).filter(p=>p.body?.kind==='frame').sort((a,b)=>b.lengthMm-a.lengthMm)[0];
 const r=B.connect(S.comps,S.modules,G.id,{module:L.id,port:port.id},P,motor),a=OJ.adapterLayout(r.comps,r.modules,G.id,P),f=Asm.orthogonalFrame(r.comps,r.modules,G.id,solveAt(r.comps,r.modules,P).points,P);
 check('4mm機架宿主的子板孔與STL孔沿接合線同軸',r.ok&&a.childHoles.every((h,k)=>near((h.x-f.base.x)*f.e.x+(h.y-f.base.y)*f.e.y,a.lengthMm/2+(k-.5)*8)));
}
{
 const [L,G]=fresh('fourbar-lift','gear-gripper'),P=S.topo.params,bar=S.comps.find(c=>c.moduleId===L.id&&c.id.startsWith('ToolBrace'));bar.stock={widthMm:13,thicknessMm:3.1};
 const r=B.connect(S.comps,S.modules,G.id,{module:L.id,port:`edge:${bar.id}:R`},P,motor),n=(await import('../js/blocks/schema.js')).normalizeSnapshot({kind:'blocks',v:1,comps:r.comps,modules:r.modules,params:P});
 check('3.1mm宿主初裝及保存重開孔仍對格',[r,n].every(w=>OJ.adapterLayout(w.comps,w.modules,G.id,P).hostHoles.every(h=>mod8(h.u))));
 check('必要偏移1.55未截成1.5',near(n.modules.find(m=>m.id===G.id).mount.orient.offsetMm,1.55));
}
{
 const [host,child]=fresh('fourbar-lift','gear-gripper');S.comps.push({id:'ShortHost',type:'bar',moduleId:host.id,stock:{widthMm:18,thicknessMm:4},p1:{id:'SH1',type:'fixed',x:500,y:0},p2:{id:'SH2',type:'fixed',x:520,y:0},lenParam:'sh_len'});const p={...S.topo.params,sh_len:20},target={module:host.id,port:'edge:ShortHost:R'};
 check('20mm邊可接4mm宿主列印座與金屬角碼',['printed','bracket-m3'].every(joint=>B.connect(S.comps,S.modules,child.id,target,p,motor,{joint}).ok));
 S.comps.find(c=>c.id==='ShortHost').stock.thicknessMm=3;
 check('20mm邊依選用角件判斷：3mm列印座不足、金屬角碼可接',!B.canConnect(S.comps,S.modules,child.id,target,p).ok&&B.connect(S.comps,S.modules,child.id,target,p,motor,{joint:'bracket-m3'}).ok);
 const points=Object.fromEntries(S.comps.flatMap(c=>['p1','p2','p3'].filter(k=>c[k]).map(k=>[c[k].id,c[k]])));
 check('接口標記沿用選用的金屬角碼，不被預設21mm門檻藏掉',B.portMarkers(S.comps,S.modules,child.id,points,p,{joint:'bracket-m3'}).some(m=>m.portId===target.port&&m.compatible));
}
report('grid-corner');
