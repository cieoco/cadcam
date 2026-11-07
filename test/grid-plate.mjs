// G4b 三點板頂點對格（docs/SDD-GRID-BLOCKS.md R2）：邊長拖曳候選、無合法候選時保留原值、額外孔吸附、格向量提示。跑法：node test/grid-plate.mjs
import { check, report } from './_harness.mjs';
import { latticeEdgeCandidates, nearestEdgeLength, edgeSnap, snapPlateHole, plateGridHint, gridVectorText } from '../js/blocks/grid-plate.js';
import { latticeEmbedding, gridIssues } from '../js/blocks/grid-rule.js';
import { memberDimensions, planMemberDimension } from '../js/blocks/member-dimensions.js';
import { projectedDimension } from '../js/blocks/dimension-handle.js';
import { readFileSync } from 'node:fs';

const S2 = 8 * Math.SQRT2;
const tri = (a, b, c) => {   // 以 c 為底邊的三角形三頂點
  const x = (c * c + a * a - b * b) / (2 * c);
  return [{ x: 0, y: 0 }, { x: c, y: 0 }, { x, y: Math.sqrt(Math.max(0, a * a - x * x)) }];
};
const comp = { type: 'triangle', id: 'T', p1: { id: 'A', x: 0, y: 0 }, p2: { id: 'B', x: 16, y: 0 }, p3: { id: 'C', x: 8, y: 8 }, gParam: 'G', r1Param: 'R1', r2Param: 'R2' };
const dim = (c, id) => memberDimensions(c).find(d => d.id === id);

// 1. 候選搜尋
const c16 = latticeEdgeCandidates(16, S2, { min: 8, max: 2000 });
check('16 與 8√2：候選含 8√2 且皆使三角形在格上', c16.some(L => Math.abs(L - S2) < 1e-9) && c16.every(L => latticeEmbedding(tri(16, S2, L)).ok));
check('拖到 12 → 8√2≈11.31', Math.abs(nearestEdgeLength(12, c16, 12) - S2) < 1e-9);
const c345 = latticeEdgeCandidates(24, 32, { min: 8, max: 2000 });
check('3-4-5 三角形拖斜邊 41 → 40', c345.length === 1 && nearestEdgeLength(41, c345, 40) === 40);
check('範圍外或超過 ±24 mm 時維持原值', nearestEdgeLength(100, c345, 77) === 77 && nearestEdgeLength(60, c345, 40) === 40 && nearestEdgeLength(64.1, c345, 40) === 40);
check('min／max 與三角不等式過濾（退化邊不入選）', latticeEdgeCandidates(24, 32, { min: 8, max: 30 }).length === 0 && !latticeEdgeCandidates(24, 32).some(L => Math.abs(L - 8) < 0.1 || Math.abs(L - 56) < 0.1));
check('候選互相印證 latticeEmbedding（隨機兩邊）', [[8, 8], [16, 24], [40, S2 * 3], [5 * 8, 5 * 8]].every(([a, b]) => latticeEdgeCandidates(a, b).every(L => latticeEmbedding(tri(a, b, L)).ok)));

// 2. 邊長拖曳：edgeSnap 與 projectedDimension 串接
const params = { G: 16, R1: S2, R2: S2 };   // 16 / 8√2 / 8√2：直角等腰
const snap = edgeSnap(comp, dim(comp, 'g'), { G: 16, R1: 24, R2: 32 }, {});
check('另外兩邊 24、32：拖曳 g 吸附到 40', (() => {
  const q = snap.quantize(40), r = projectedDimension(40, { x: 1.4, y: 0 }, { x: 1, y: 0 }, { min: 8, max: 2000, quantize: q });
  return r === 40 && projectedDimension(40, { x: -6, y: 0 }, { x: 1, y: 0 }, { min: 8, max: 2000, quantize: q }) === 40;
})());
check('另外兩邊 16、8√2：拖曳停在 8√2', (() => {
  const s = edgeSnap(comp, dim(comp, 'r2'), { G: 16, R1: S2, R2: 12 }, {});
  return Math.abs(projectedDimension(12, { x: 0, y: 0 }, { x: 1, y: 0 }, { min: 8, max: 2000, quantize: s.quantize(12) }) - S2) < 1e-9
    || Math.abs(projectedDimension(12, { x: 0.1, y: 0 }, { x: 1, y: 0 }, { min: 8, max: 2000, quantize: s.quantize(12) }) - S2) < 1e-9;
})());
check('板已是例外（另外兩邊 10、10）：無候選時拖曳保留原值', (() => {
  const s = edgeSnap(comp, dim(comp, 'g'), { G: 15, R1: 10, R2: 10 }, {});
  return s.candidates.length === 0 &&
    projectedDimension(15, { x: 3.4, y: 0 }, { x: 1, y: 0 }, { min: 8, max: 2000, quantize: s.quantize(15) }) === 15;
})());
check('另外一邊 11.3（0.1 精度、離格 0.014）亦視為例外', edgeSnap(comp, dim(comp, 'g'), { G: 16, R1: 11.3, R2: 11.3 }, {}).candidates.length === 0);
check('板寬、盒體、非三點板不適用；折線桿段也核對孔格', (() => {
  const poly = { ...comp, shapeMode: 'polyline', vertices: [{ solve: true, ref: 'p1' }, { solve: true, ref: 'p2' }, { solve: true, ref: 'p3' }] };
  const p = { G: 24, R1: 40, R2: 32 }, ds = memberDimensions(poly);   // 折線 p1→p2→p3：桿段 g、r2，跨距 r1
  const segs = ds.filter(d => d.param && edgeSnap(poly, d, p, {}) === null).length, diag = edgeSnap(poly, dim(poly, 'r1'), p, {});
  return segs === 0 && diag && diag.candidates.length > 0 && edgeSnap(comp, dim(comp, 'width'), p, {}) === null &&
    edgeSnap({ ...comp, boxPanel: true }, dim(comp, 'g'), p, {}) === null && edgeSnap({ type: 'bar' }, { id: 'g', refs: ['p1', 'p2'] }, p, {}) === null;
})());
check('折線跨距吸附後彎角落在格點', (() => {
  const poly = { ...comp, shapeMode: 'polyline', vertices: [{ solve: true, ref: 'p1' }, { solve: true, ref: 'p2' }, { solve: true, ref: 'p3' }] };
  const s = edgeSnap(poly, dim(poly, 'r1'), { G: 24, R1: 41, R2: 32 }, {});
  const L = projectedDimension(41, { x: 0.3, y: 0 }, { x: 1, y: 0 }, { min: 8, max: 2000, quantize: s.quantize(41) });
  const t = tri(24, 32, L);
  return L === 40 && latticeEmbedding(t).ok && latticeEmbedding([t[0], t[1], t[2]]).coords.length === 3;
})());

// 3. exact：格上拖曳不先取到 0.1 mm；數字輸入仍最多一位小數
const plan = (raw, exact, id = 'g') => planMemberDimension(comp, { G: 16, R1: S2, R2: S2 }, id, raw, exact ? { exact } : {});
check('exact 保留 8√2 的完整精度，一般輸入取到 0.1', plan(S2, true).params.G === Number(S2.toFixed(4)) && plan(S2, false).params.G === 11.3 && plan(12.5, false).params.G === 12.5);
check('exact 結果在格上、一般輸入 11.3 離格', latticeEmbedding(tri(16, S2, plan(S2, true, 'r2').params.R2)).ok && !latticeEmbedding(tri(16, S2, plan(S2, false, 'r2').params.R2)).ok);

// 4. 格向量提示
check('格向量文字', gridVectorText(1, 1) === '斜 1×1 格' && gridVectorText(-4, 3) === '4×3 格' && gridVectorText(0, -5) === '5 格' && gridVectorText(0, 0) === '');
check('提示：8√2 邊顯示斜 1×1 格、12.5 顯示離格', (() => {
  const p = { G: 16, R1: S2, R2: S2 };
  return plateGridHint(comp, p, dim(comp, 'r1'), S2) === '斜 1×1 格' && plateGridHint(comp, p, dim(comp, 'g'), 16) === '2 格' && plateGridHint(comp, p, dim(comp, 'g'), 12.5) === '離格' && plateGridHint(comp, p, dim(comp, 'g'), NaN) === '';
})());
check('提示：3-4-5 斜邊顯示 4×3 格', plateGridHint(comp, { G: 40, R1: 24, R2: 32 }, dim(comp, 'g'), 40) === '4×3 格');
check('提示：額外孔離格時整板顯示離格', (() => {
  const c = { ...comp, vertices: [{ solve: true, ref: 'p1' }, { solve: true, ref: 'p2' }, { solve: true, ref: 'p3' }, { u: 5, v: 5, hole: true }] };
  return plateGridHint(c, { G: 16, R1: S2, R2: S2 }, dim(c, 'g'), 16) === '離格';
})());

// 5. 額外孔吸附
const rot = a => p => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a) + 50, y: p.x * Math.sin(a) + p.y * Math.cos(a) - 20 });
check('額外孔吸附到世界軸方格', (() => {
  const corners = [{ x: 0, y: 0 }, { x: 24, y: 0 }, { x: 0, y: 32 }], r = snapPlateHole(corners, corners.slice(0, 2), [], { x: 9.7, y: 21.2 });
  return Math.abs(r.u - 8) < 1e-3 && Math.abs(r.v - 24) < 1e-3;
})());
check('旋轉方格：吸附後與三頂點仍同在一個方格（含 20°、65°）', [20, 65, -140].every(deg => {
  const f = rot(deg * Math.PI / 180), corners = [{ x: 0, y: 0 }, { x: 24, y: 0 }, { x: 0, y: 32 }].map(f);
  const basis = corners.slice(0, 2), target = f({ x: 13.1, y: 6.4 });
  const r = snapPlateHole(corners, basis, [], target);
  const ux = (basis[1].x - basis[0].x) / 24, uy = (basis[1].y - basis[0].y) / 24;
  const w = { x: basis[0].x + ux * r.u - uy * r.v, y: basis[0].y + uy * r.u + ux * r.v };
  return latticeEmbedding([...corners, w]).ok && Math.hypot(w.x - target.x, w.y - target.y) < 8;
}));
check('已有的額外孔一併納入方格判定', (() => {
  const f = rot(0.5), corners = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 0, y: 0 }].slice(0, 2).concat([{ x: 24, y: 32 }]).map(f), basis = corners.slice(0, 2);
  const r = snapPlateHole(corners, basis, [{ u: 16, v: 8, hole: true }], f({ x: 31, y: 17 }));
  const ux = (basis[1].x - basis[0].x) / 40, uy = (basis[1].y - basis[0].y) / 40;
  const w = { x: basis[0].x + ux * r.u - uy * r.v, y: basis[0].y + uy * r.u + ux * r.v }, other = { x: basis[0].x + ux * 16 - uy * 8, y: basis[0].y + uy * 16 + ux * 8 };
  return latticeEmbedding([...corners, other, w]).ok;
})());
check('板本身離格：u、v 各取 8 的倍數', (() => {
  const corners = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 5, y: 17 }], r = snapPlateHole(corners, corners.slice(0, 2), [], { x: 13, y: 11 });
  return r.u === 16 && r.v === 8;
})());

// 6. 接線
const src = f => readFileSync(new URL(`../js/blocks/${f}`, import.meta.url), 'utf8');
check('尺寸把手與孔拖曳接上 grid-plate，plate-editor 只按需載入', /edgeSnap\(/.test(src('editing-handles.js')) && /import\('\.\/grid-plate\.js'\)/.test(src('plate-editor.js')) && !/from '\.\/grid-plate\.js'/.test(src('plate-editor.js')));
// 全部加工孔須與實際提交後的尺寸同格，不只檢查三個頂點。
{
  const c = { ...comp, p2:{id:'B',x:40,y:0}, p3:{id:'C',x:0,y:40}, outlinePoints:[{u:8,v:0,hole:true}] };
  const p = {G:40,R1:40,R2:40*Math.SQRT2}, d=dim(c,'g'), s=edgeSnap(c,d,p,{comps:[c]});
  const value=s.quantize(40)(51), plan=planMemberDimension(c,p,'g',value,{exact:true});
  check('額外孔原本對格，拖曳不採用使孔離格的51.225候選', !gridIssues([c],p).length && !gridIssues([c],{...p,...plan.params}).length && Math.abs(value-51.225)>.01);
  const owner={...c,outlinePoints:[]}, syringe={id:'S',type:'syringe',a:{componentId:'T',u:8,v:0}};
  const guarded=edgeSnap(owner,dim(owner,'g'),p,{comps:[owner,syringe]}), next=guarded.quantize(40)(51);
  check('針筒掛點也參與候選核對', guarded.hint(next)!=='離格' && Math.abs(next-51.225)>.01);
}
{
  const c={...comp,p2:{id:'B',x:56,y:0},p3:{id:'C',x:56,y:80},shapeMode:'polyline',vertices:['p1','p2','p3'].map(ref=>({solve:true,ref}))};
  const p={G:56,R1:Math.hypot(56,80),R2:80},s=edgeSnap(c,dim(c,'g'),p,{comps:[c]}),v=s.quantize(56)(64),next=planMemberDimension(c,p,'g',v,{exact:true});
  check('折線56→64保留精確衍生跨距，提交後不離格',v===64 && Math.abs(next.params.R1-Math.hypot(64,80))<1e-8 && !gridIssues([c],{...p,...next.params}).length);
  const slope={...c,p3:{id:'C',x:104,y:64}},sp={G:56,R1:Math.hypot(104,64),R2:80};
  const guarded=edgeSnap(slope,dim(slope,'r2'),sp,{comps:[slope]}),nv=guarded.quantize(80)(88),np=planMemberDimension(slope,sp,'r2',nv,{exact:true});
  check('斜向折線改段長若破壞方格則保留原值，不暗改彎角',nv===80 && !gridIssues([slope],{...sp,...np.params}).length);
}
report('grid-plate');
