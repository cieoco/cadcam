// 互動驗收：手抓 pantograph 右側洞。驗證 pinned constraint solver 能讓欠定機構被游標決定。
// 跑法：node test/pinned-pantograph.mjs
import { normalizeSnapshot } from '../js/blocks/schema.js';
import { solvePinnedConstraints, rotateLooseBarEnd } from '../js/blocks/model.js';
import {readFileSync} from 'node:fs';
import { check, report } from './_harness.mjs';

const snapshot = {
  kind: 'blocks',
  v: 1,
  counter: 8,
  comps: [
    { type: 'anchor', id: 'Anchor2', p1: { id: 'T1b', type: 'fixed', x: -285.01774639019493, y: -0.1166248064386912 } },
    {
      type: 'triangle', id: 'Tri3', color: '#27ae60',
      p1: { id: 'T1b', type: 'floating', x: -285.01774639019493, y: -0.1166248064386912 },
      p2: { id: 'T3b', type: 'floating', x: -276.97569094405804, y: 79.27809290211329 },
      p3: { id: 'T3c', type: 'floating', x: -267.55679628627627, y: 158.72168561685436 },
      gParam: 'TG3', r1Param: 'TR1_3', r2Param: 'TR2_3', sign: 1
    },
    {
      type: 'bar', id: 'Link6', color: '#3498db',
      p1: { id: 'T3b', type: 'floating', x: -276.97569094405804, y: 79.27809290211329 },
      p2: { id: 'P6b', type: 'floating', x: -197.4255181879725, y: 70.80637439422223 },
      lenParam: 'LL6', isInput: false, fixedLen: true
    },
    {
      type: 'bar', id: 'Link7', color: '#3498db',
      p1: { id: 'P6b', type: 'floating', x: -197.4255181879725, y: 70.80637439422223 },
      p2: { id: 'P7b', type: 'floating', x: -168.87204676842356, y: 136.9025109673458 },
      lenParam: 'LL7', isInput: false, fixedLen: true
    },
    {
      type: 'triangle', id: 'Tri8', color: '#27ae60',
      p1: { id: 'T3c', type: 'floating', x: -267.55679628627627, y: 158.72168561685436 },
      p2: { id: 'P7b', type: 'floating', x: -168.87204676842356, y: 136.9025109673458 },
      p3: { id: 'T8c', type: 'floating', x: -55.31609989148354, y: 112.72224775098158 },
      gParam: 'TG8', r1Param: 'TR1_8', r2Param: 'TR2_8', sign: 1
    }
  ],
  params: { theta: 0, TG3: 80, TR1_3: 160, TR2_3: 80, LL6: 80, LL7: 72, TG8: 104, TR1_8: 216, TR2_8: 112 }
};

const norm = normalizeSnapshot(snapshot);
const comps = norm.comps;
const params = norm.params;
const target = { x: -25, y: 96 };
const before = {};
comps.forEach(c => ['p1', 'p2', 'p3'].forEach(k => { if (c[k]) before[c[k].id] = { x: c[k].x, y: c[k].y }; }));

const ok = solvePinnedConstraints(comps, { params }, 'T8c', target, { tolerance: 3, iterations: 120 });
check('右側洞 T8c 可被游標 pin 住並收斂', ok);

const pts = {};
comps.forEach(c => ['p1', 'p2', 'p3'].forEach(k => { if (c[k]) pts[c[k].id] = { x: c[k].x, y: c[k].y }; }));
const dist = (a, b) => Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y);
const maxErr = Math.max(
  Math.abs(dist('T1b', 'T3b') - params.TG3),
  Math.abs(dist('T1b', 'T3c') - params.TR1_3),
  Math.abs(dist('T3b', 'T3c') - params.TR2_3),
  Math.abs(dist('T3b', 'P6b') - params.LL6),
  Math.abs(dist('P6b', 'P7b') - params.LL7),
  Math.abs(dist('T3c', 'P7b') - params.TG8),
  Math.abs(dist('T3c', 'T8c') - params.TR1_8),
  Math.abs(dist('P7b', 'T8c') - params.TR2_8)
);
check('所有桿長/三角邊長維持', maxErr < 3, `最大誤差 ${maxErr.toFixed(2)} mm`);
check('左側固定點 T1b 不動', Math.hypot(pts.T1b.x - before.T1b.x, pts.T1b.y - before.T1b.y) < 1e-9);
check('右側 T8c 到達游標位置', Math.hypot(pts.T8c.x - target.x, pts.T8c.y - target.y) < 1e-9);
check('中間點 P7b 跟著機構移動', Math.hypot(pts.P7b.x - before.P7b.x, pts.P7b.y - before.P7b.y) > 1);
const lineError = (a, m, b) => {
  const ax = pts[a].x, ay = pts[a].y;
  const bx = pts[b].x, by = pts[b].y;
  const mx = pts[m].x, my = pts[m].y;
  const len = Math.hypot(bx - ax, by - ay);
  return len > 1e-9 ? Math.abs((bx - ax) * (ay - my) - (ax - mx) * (by - ay)) / len : Infinity;
};
check('共線三點桿的中間孔維持在線上', Math.max(
  lineError('T1b', 'T3b', 'T3c'),
  lineError('T3c', 'P7b', 'T8c')
) < 0.5);

const looseWork=JSON.parse(readFileSync(new URL('./fixtures/loose-bar-rotation.json',import.meta.url),'utf8'));
const original=structuredClone(looseWork),tail=looseWork.comps.find(c=>c.id==='Link11');
check('單端連接桿拖自由端可旋轉',rotateLooseBarEnd(looseWork.comps,looseWork.params,'P11b',{x:80,y:-30},true));
check('旋轉不拉動原機構',JSON.stringify(looseWork.comps.filter(c=>c!==tail))===JSON.stringify(original.comps.filter(c=>c.id!=='Link11')));
check('旋轉保留所有孔距',JSON.stringify(looseWork.params)===JSON.stringify(original.params)&&Math.abs(Math.hypot(tail.p2.x-tail.p1.x,tail.p2.y-tail.p1.y)-57)<1e-9);
const degrees=Math.atan2(tail.p2.y-tail.p1.y,tail.p2.x-tail.p1.x)*180/Math.PI;
check('直接旋轉為整數角度',Math.abs(degrees-Math.round(degrees))<1e-9);
rotateLooseBarEnd(looseWork.comps,looseWork.params,'P11b',{x:80,y:-30});
check('精確操作不取整角度',Math.abs(Math.atan2(tail.p2.y-tail.p1.y,tail.p2.x-tail.p1.x)-Math.atan2(-30-tail.p1.y,80-tail.p1.x))<1e-9);
for(const [name,edit]of [
 ['合成',w=>{w.comps.find(c=>c.id==='Link11').barFusionRoot='Link11';}],
 ['固定孔',w=>{w.comps.find(c=>c.id==='Link11').p2.type='fixed';}],
 ['驅動桿',w=>{w.comps.find(c=>c.id==='Link11').isInput=true;}],
 ['針筒連接',w=>{w.comps.find(c=>c.type==='syringe').b.componentId='Link11';}],
 ['共用孔',w=>{w.comps.push({type:'bar',id:'Extra',p1:{...tail.p2},p2:{id:'ExtraTip',x:90,y:0,type:'floating'},fixedLen:true});}]
]){const w=structuredClone(original);edit(w);const before=JSON.stringify(w);check(name+'不套用自由端旋轉',!rotateLooseBarEnd(w.comps,w.params,'P11b',{x:80,y:-30},true)&&JSON.stringify(w)===before);}
const renamed=structuredClone(original);for(const c of renamed.comps){c.id='other-'+c.id;for(const key of ['p1','p2'])if(c[key])c[key].id='other-'+c[key].id;}
check('改名稱仍適用同一規則',rotateLooseBarEnd(renamed.comps,renamed.params,'other-P11b',{x:80,y:-30},true));
report('pinned-pantograph');
