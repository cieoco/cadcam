/**
 * blocks schema / examples smoke test.
 * Run: node test_blocks_schema.mjs
 */
import { BLOCK_EXAMPLES } from './js/blocks/examples.js';
import { normalizeSnapshot, toSnapshot } from './js/blocks/schema.js';
import { splitMountsByHost, hostedBarGeometry, inspectFrameExport, isStaticPlate, inspectPlateExport } from './js/blocks/exporters.js';
import { frameConnectorNodes } from './js/blocks/model.js';
import { compileTopology } from './js/core/topology.js';
import { solveTopology } from './js/multilink/solver.js';

let pass = 0;
let fail = 0;

const ok = (name, cond) => {
  if (cond) {
    pass += 1;
    console.log('  PASS', name);
  } else {
    fail += 1;
    console.log('  FAIL', name);
  }
};

for (const example of BLOCK_EXAMPLES) {
  const norm = normalizeSnapshot(example.snapshot);
  ok(`${example.id} normalizes`, !!norm);
  if (example.id === 'chebyshev-linkage') ok('chebyshev keeps trace point', norm && norm.tracePoint === 'P');
  if (!norm || norm.comps.length === 0) continue;

  const compiled = compileTopology(norm.comps, { params: norm.params, tracePoint: norm.tracePoint || '' }, new Set());
  const solved = solveTopology(compiled, { thetaDeg: 0 });
  ok(`${example.id} compiles to steps`, compiled.steps.length > 0);
  ok(`${example.id} solves at 0deg`, solved && solved.isValid !== false);
}

const messy = normalizeSnapshot({
  kind: 'blocks',
  v: 1,
  counter: 0,
  comps: [{
    type: 'bar',
    id: 'LinkX',
    color: 'bad',
    p1: { id: 'P1', x: 0, y: 0 },
    p2: { id: 'P2', x: 29, y: 0 },
    lenParam: 'LLX',
    fixedLen: true
  }],
  params: { LLX: 29 }
});
ok('schema accepts UI bar shape', messy && messy.comps.length === 1);
ok('schema snaps fixed link length to LEGO pitch', messy && messy.params.LLX === 32);
ok('schema repairs invalid color', messy && messy.comps[0].color === '#3498db');

const withHole = normalizeSnapshot({
  kind: 'blocks',
  v: 1,
  counter: 0,
  tracePoints: ['P', 'I'], referencePoint: 'A',
  comps: [{
    type: 'bar',
    id: 'ScaleLink',
    p1: { id: 'O', type: 'fixed', x: 0, y: 0 },
    p2: { id: 'P', type: 'floating', x: 80, y: 0 },
    lenParam: 'LP',
    holes: [{ id: 'I', distParam: 'DI' }]
  }],
  params: { LP: 80, DI: 40 }
});
ok('schema preserves bar holes', withHole && withHole.comps[0].holes && withHole.comps[0].holes[0].id === 'I');
ok('schema preserves multiple trace points', withHole && withHole.tracePoints.length === 2);
ok('schema preserves measurement reference', withHole && withHole.referencePoint === 'A');
const referenceSnap = toSnapshot(withHole.comps, { params: withHole.params, tracePoints: withHole.tracePoints, referencePoint: withHole.referencePoint }, withHole.counter);
ok('toSnapshot writes measurement reference', referenceSnap.referencePoint === 'A');

const snap = toSnapshot(messy.comps, { params: messy.params }, messy.counter);
ok('toSnapshot writes blocks kind', snap.kind === 'blocks' && snap.v === 1);

// 宿主機架桿（bar.motorMountPoint）：schema 保留欄位、mount 分派到宿主桿、
// 桿局部座標幾何與世界座標 frameGeometry 一致（含 MG995 槽與耳孔的旋轉約定）。
const hostSnap = normalizeSnapshot({
  kind: 'blocks', v: 1, counter: 0,
  comps: [{
    type: 'bar', id: 'TopBeam',
    p1: { id: 'M', type: 'fixed', x: 10, y: 20 },
    p2: { id: 'TR', type: 'fixed', x: 110, y: 95 },
    lenParam: 'TB', frameSeparate: true, motorMountPoint: 'M'
  }],
  params: { TB: 125 }
});
ok('schema preserves motorMountPoint', hostSnap && hostSnap.comps[0].motorMountPoint === 'M');

const hostMount = { kind: 'mg995', pointId: 'M', center: { x: 10, y: 20 }, rotDeg: 25, settings: {} };
const orphanMount = { kind: 'tt', pointId: 'X', center: { x: 0, y: 0 }, rotDeg: 0, settings: {} };
const split = splitMountsByHost(hostSnap.comps, [hostMount, orphanMount]);
ok('splitMountsByHost hosts declared mount', split.hosted.get('TopBeam')?.length === 1 && split.free.length === 1 && split.free[0] === orphanMount);

const hostSettings = { barWidthMm: 18, holeDiameterMm: 5 };
const worldGeo = inspectFrameExport([{ x: 10, y: 20 }, { x: 110, y: 95 }], hostSettings, [hostMount]);
const localGeo = hostedBarGeometry(hostSnap.comps[0], null, hostSettings, [hostMount]);
const hostUx = (110 - 10) / 125, hostUy = (95 - 20) / 125;
const toWorld = p => ({ x: 10 + p.x * hostUx - p.y * hostUy, y: 20 + p.x * hostUy + p.y * hostUx });
const near = (p, q) => Math.hypot(p.x - q.x, p.y - q.y) < 0.02;
const holesMatch = !!(worldGeo && localGeo) && worldGeo.holes.length === localGeo.holes.length &&
  localGeo.holes.every(h => worldGeo.holes.some(w =>
    w.layer === h.layer && Math.abs(w.r - h.r) < 0.02 && near(w, toWorld(h))));
ok('hostedBarGeometry matches world frame geometry', holesMatch);
const cutoutsMatch = !!(worldGeo && localGeo) && (worldGeo.cutouts || []).length === (localGeo.cutouts || []).length &&
  localGeo.cutouts.every((c, i) => c.points.length === worldGeo.cutouts[i].points.length &&
    c.points.every((p, j) => near(worldGeo.cutouts[i].points[j], toWorld(p))));
ok('hostedBarGeometry slot cutout matches', cutoutsMatch);

// 靜態結構板（使用者畫的機架板，≥2 個固定頂點＋馬達頂點）：
// 固定點不進自動地基（不再生成第二塊機架）、mount 自動由板承載、穿板槽切進板身。
const plateFrame = normalizeSnapshot({
  kind: 'blocks', v: 1, counter: 0,
  comps: [
    {
      type: 'triangle', id: 'FramePlate',
      p1: { id: 'FP_PIVOT', type: 'fixed', x: 170, y: 147 },
      p2: { id: 'FP_MOTOR', type: 'floating', x: 204, y: 190 },
      p3: { id: 'FP_END', type: 'fixed', x: 336, y: 144 },
      gParam: 'FPG', r1Param: 'FPR1', r2Param: 'FPR2', sign: 1
    },
    {
      type: 'bar', id: 'PlateCrank',
      p1: { id: 'FP_MOTOR', type: 'fixed', x: 204, y: 190, physicalMotor: '1' },
      p2: { id: 'FP_TIP', type: 'floating', x: 144, y: 242 },
      lenParam: 'FPL', isInput: true, physicalMotor: '1', motorType: 'mg995'
    }
  ],
  params: { FPG: 54, FPR1: 166, FPR2: 141, FPL: 80, theta: 0 }
});
const plateComp = plateFrame.comps.find(c => c.id === 'FramePlate');
ok('isStaticPlate detects user frame plate', isStaticPlate(plateComp));
const plateNodes = frameConnectorNodes(plateFrame.comps).map(n => n.id);
ok('static plate points excluded from auto frame', !plateNodes.includes('FP_PIVOT') && !plateNodes.includes('FP_END'));
const plateMount = { kind: 'mg995', pointId: 'FP_MOTOR', center: { x: 204, y: 190 }, rotDeg: 25, settings: {} };
const plateSplit = splitMountsByHost(plateFrame.comps, [plateMount]);
ok('mount auto-hosted by static plate', plateSplit.hosted.get('FramePlate')?.length === 1 && plateSplit.free.length === 0);
const plateWorld = [{ x: 170, y: 147 }, { x: 204, y: 190 }, { x: 336, y: 144 }];
const plateGeo = inspectPlateExport(plateComp, plateWorld, hostSettings, plateSplit.hosted.get('FramePlate'));
const plateHoleLayers = plateGeo.holes.map(h => h.layer || 'HOLE');
ok('plate geometry carries MG995 slot + ear holes',
  (plateGeo.cutouts || []).some(c => c.layer === 'MG995_SLOT') &&
  plateHoleLayers.filter(l => l === 'MG995_SCREW').length === 4);
// 馬達軸心頂點孔落在穿板槽內，應被剔除（材料已切掉）
const motorHoleKept = plateGeo.holes.some(h => (h.layer || 'HOLE') === 'HOLE' && Math.hypot(h.x - 204, h.y - 190) < 0.5);
ok('vertex hole inside slot removed', !motorHoleKept);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
