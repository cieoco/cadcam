// 3D 模型驗收：齒輪列會輸出 gears 給 blocks3d viewer。
// 跑法：node test/gear-3d-model.mjs
import { BLOCK_EXAMPLES } from '../js/blocks/examples.js';
import { compileTopology } from '../js/core/topology.js';
import { solveTopology } from '../js/multilink/solver.js';
import { buildSceneModel } from '../js/blocks3d/scene-model.js';
import { gearMeshPhaseDeg } from '../js/blocks/transmission-geometry.js';
import { angle, check, report } from './_harness.mjs';

const example = BLOCK_EXAMPLES.find(e => e.id === 'reduction-gear-train');
const comps = example.snapshot.comps;
const params = example.snapshot.params;
const compiled = compileTopology(comps, { params: { ...params } }, new Set());
const sol = solveTopology(compiled, { thetaDeg: 90 });
const pts = sol.points;
const groundIds = new Set(compiled.steps.filter(s => s.type === 'ground').map(s => s.id));
const gears = comps
  .filter(c => c.type === 'gear')
  .map(c => ({
    id: c.id,
    center: c.p1.id,
    pin: c.p2.id,
    radius: params[c.radiusParam],
    teeth: c.teeth,
    module: c.module,
    mesh: c.mesh,
    color: c.color,
  }));

const model = buildSceneModel(compiled.visualization.links, pts, { groundIds, gears });
check('3D model 產出三顆齒輪', model.gears.length === 3,
  `gears=${model.gears.length}`);

const byId = new Map(model.gears.map(g => [g.id, g]));
check('齒輪中心與輪緣銷都進入 3D 銷柱集合', model.pins.some(p => p.id === 'GPA') && model.pins.some(p => p.id === 'GPC'),
  `pins=${model.pins.map(p => p.id).join(',')}`);

const gearA = byId.get('GearA');
const gearB = byId.get('GearB');
const gearC = byId.get('GearC');
const gearDefsById = new Map(comps.filter(c => c.type === 'gear').map(c => [c.id, c]));
check('2D 齒輪嚙合相位由獨立傳動幾何模組計算',
  Number.isFinite(gearMeshPhaseDeg(gearDefsById.get('GearB'), pts, gearDefsById)) &&
  Number.isFinite(gearMeshPhaseDeg(gearDefsById.get('GearC'), pts, gearDefsById)) &&
  Number.isFinite(gearMeshPhaseDeg(gearDefsById.get('GearB'), pts, id => gearDefsById.get(id))));
check('3D 齒輪角度跟 solver p2 方向一致',
  Math.abs(gearA.angle - angle(pts.GPA, pts.GCA)) < 1e-12 &&
  Math.abs(gearB.angle - angle(pts.GPB, pts.GCB)) < 1e-12 &&
  Math.abs(gearC.angle - angle(pts.GPC, pts.GCC)) < 1e-12);
check('從動齒輪計算嚙合相位，輸出銷仍由 solver 位置決定',
  Number.isFinite(gearB.meshPhase) && Number.isFinite(gearC.meshPhase) &&
  Math.abs(gearB.meshPhase) > 1e-6 &&
  gearC.pin.x === pts.GPC.x && gearC.pin.y === pts.GPC.y,
  `GearB=${gearB.meshPhase}, GearC=${gearC.meshPhase}`);
check('3D 輸出銷落在節圓內側，不打在齒上',
  Math.hypot(gearA.pin.x - gearA.center.x, gearA.pin.y - gearA.center.y) < gearA.radius &&
  Math.hypot(gearB.pin.x - gearB.center.x, gearB.pin.y - gearB.center.y) < gearB.radius &&
  Math.hypot(gearC.pin.x - gearC.center.x, gearC.pin.y - gearC.center.y) < gearC.radius);

report('gear-3d-model');
