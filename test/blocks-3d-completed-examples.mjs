// 3D 模型驗收：完成的傳動範例都會輸出對應 3D 零件，且實體馬達固定在底層。
// 跑法：node test/blocks-3d-completed-examples.mjs
import { BLOCK_EXAMPLES } from '../js/blocks/examples.js';
import { compileTopology } from '../js/core/topology.js';
import { solveTopology } from '../js/multilink/solver.js';
import { buildSceneModel } from '../js/blocks3d/scene-model.js';
import { check, report } from './_harness.mjs';

function physicalMotorIds(comps) {
  const ids = new Set();
  comps.forEach(c => ['p1', 'p2', 'p3', 'm1', 'm2'].forEach(k => {
    const p = c[k];
    if (p && p.id && (p.physicalMotor || p.physical_motor)) ids.add(p.id);
  }));
  return ids;
}

function pulleyRadius(c, params, fallback = 32) {
  return Number(params[c.radiusParam]) || fallback;
}

function pulleyPinRadius(c, params, pitchR) {
  return c.pinRadiusParam
    ? (Number(params[c.pinRadiusParam]) || Math.round(pitchR * 0.65))
    : (Number.isFinite(Number(c.pinRadius)) ? Number(c.pinRadius) : pitchR * 0.65);
}

function sceneFor(id, thetaDeg = 45, extraOpts = {}) {
  const example = BLOCK_EXAMPLES.find(e => e.id === id);
  const comps = example.snapshot.comps;
  const params = example.snapshot.params || {};
  const compiled = compileTopology(comps, { params: { ...params } }, new Set());
  const sol = solveTopology(compiled, { thetaDeg });
  const pts = sol.points;
  const groundIds = new Set(compiled.steps.filter(s => s.type === 'ground').map(s => s.id));
  const motorCenters = physicalMotorIds(comps);
  const gears = comps.filter(c => c.type === 'gear' && c.p1 && c.p2).map(c => ({
    id: c.id,
    center: c.p1.id,
    pin: c.p2.id,
    radius: Number(compiled.params[c.radiusParam]) || 40,
    teeth: c.teeth,
    module: c.module,
    mesh: c.mesh,
    color: c.color,
  }));
  const racks = comps.filter(c => c.type === 'rack' && c.p1).map(c => ({
    id: c.id,
    ref: c.p1.id,
    pinion: c.pinion,
    length: Number(compiled.params[c.lenParam]) || 160,
    axisDeg: c.axisDeg,
    color: c.color,
  }));
  const cams = comps.filter(c => c.type === 'cam' && c.p1 && c.p2).map(c => ({
    id: c.id,
    center: c.p1.id,
    follower: c.p2.id,
    baseRadius: Number(compiled.params[c.baseRadiusParam]) || 24,
    lift: Number(compiled.params[c.liftParam]) || 24,
    axisDeg: c.axisDeg,
    profile: c.profile,
    phase: c.phase,
    rollerRadius: c.rollerRadius,
    thetaDeg,
    color: c.color,
  }));
  const pulleys = comps.filter(c => c.type === 'pulley' && c.p1 && c.p2).map(c => {
    const radius = pulleyRadius(c, compiled.params);
    return {
      id: c.id,
      center: c.p1.id,
      pin: c.p2.id,
      radius,
      pinRadius: pulleyPinRadius(c, compiled.params, radius),
      color: c.color,
    };
  });
  const belts = comps.filter(c => c.type === 'belt')
    .map(c => ({ id: c.id, driver: c.driver, driven: c.driven, color: c.color }));
  return buildSceneModel(compiled.visualization.links, pts, {
    groundIds,
    motorCenters,
    polygons: compiled.visualization.polygons || [],
    gears,
    racks,
    cams,
    pulleys,
    belts,
    ...extraOpts,
  });
}

function dotFromToWithDir(from, to, dir) {
  return (to.x - from.x) * dir.x + (to.y - from.y) * dir.y;
}

const gearPair = sceneFor('gear-pair');
const gearMotor = gearPair.motors.find(m => m.id === 'GCA');
const drivenGear = gearPair.gears.find(g => g.id === 'GearB');
check('齒輪對馬達本體背向嚙合區', gearMotor && drivenGear && dotFromToWithDir(gearMotor, drivenGear.center, gearMotor.dir) < 0,
  `dir=${gearMotor ? `${gearMotor.dir.x.toFixed(2)},${gearMotor.dir.y.toFixed(2)}` : 'missing'}`);

const rack = sceneFor('rack-pinion');
check('齒條齒輪 3D 有齒輪與齒條', rack.gears.length === 1 && rack.racks.length === 1,
  `gears=${rack.gears.length}, racks=${rack.racks.length}`);
check('齒條齒輪馬達固定在底層', rack.motors.some(m => m.id === 'PC') && rack.motors[0].shaftTopZ <= 0,
  `motors=${rack.motors.map(m => `${m.id}:${m.shaftTopZ}`).join(',')}`);
const rackMotor = rack.motors.find(m => m.id === 'PC');
check('齒條齒輪馬達本體背向齒條', rackMotor && rack.racks[0] && dotFromToWithDir(rackMotor, rack.racks[0].ref, rackMotor.dir) < 0,
  `dir=${rackMotor ? `${rackMotor.dir.x.toFixed(2)},${rackMotor.dir.y.toFixed(2)}` : 'missing'}`);
const rackFixedMount = sceneFor('rack-pinion', 180, { motorMounts: new Map([['PC', { dir: { x: -1, y: 0 }, reason: 'test-fixed' }]]) });
const rackFixedMotor = rackFixedMount.motors.find(m => m.id === 'PC');
check('3D 馬達方向優先使用固定 mount，不隨動畫點重算', rackFixedMotor && Math.abs(rackFixedMotor.dir.x + 1) < 1e-12 && Math.abs(rackFixedMotor.dir.y) < 1e-12,
  `dir=${rackFixedMotor ? `${rackFixedMotor.dir.x.toFixed(2)},${rackFixedMotor.dir.y.toFixed(2)}` : 'missing'}`);

const jansen = sceneFor('jansen-leg');
const jansenCrank = jansen.sticks.find(s => s.id === 'LinkM');
const jansenStack = jansen.sticks.filter(s => ['LinkJ', 'LinkK'].includes(s.id));
check('步行腿紅色馬達曲柄貼近輸出軸側', jansenCrank && jansenCrank.layer === 0 &&
  jansenStack.every(s => jansenCrank.layer < s.layer),
  `LinkM=${jansenCrank ? jansenCrank.layer : 'missing'}, stack=${jansenStack.map(s => `${s.id}:${s.layer}`).join(',')}`);

const chebyshevMounted = sceneFor('chebyshev-linkage', 45, {
  motorMounts: new Map([['A', {
    dir: { x: 1, y: 0 },
    frameBody: 'Link4',
    outputBody: 'Link1',
    order: ['motor', 'frameBody', 'outputBody'],
  }]]),
});
const chebFrame = chebyshevMounted.sticks.find(s => s.id === 'Link4');
const chebCrank = chebyshevMounted.sticks.find(s => s.id === 'Link1');
check('切比雪夫馬達裝配為馬達-固定桿-曲柄', chebFrame && chebCrank &&
  chebFrame.layer === 0 && chebCrank.layer === 1,
  `Link4=${chebFrame ? chebFrame.layer : 'missing'}, Link1=${chebCrank ? chebCrank.layer : 'missing'}`);

const cam = sceneFor('cam-follower');
check('凸輪從動件 3D 有凸輪', cam.cams.length === 1, `cams=${cam.cams.length}`);
check('凸輪馬達也進入 3D 底層', cam.motors.some(m => m.id === 'CC') && cam.cams[0].layer < 0,
  `motors=${cam.motors.map(m => m.id).join(',')}`);
const camMotor = cam.motors.find(m => m.id === 'CC');
check('凸輪馬達本體背向從動件', camMotor && cam.cams[0] && dotFromToWithDir(camMotor, cam.cams[0].follower, camMotor.dir) < 0,
  `dir=${camMotor ? `${camMotor.dir.x.toFixed(2)},${camMotor.dir.y.toFixed(2)}` : 'missing'}`);

const pulley = sceneFor('pulley-belt');
check('皮帶輪傳動 3D 有兩輪一皮帶', pulley.pulleys.length === 2 && pulley.belts.length === 1,
  `pulleys=${pulley.pulleys.length}, belts=${pulley.belts.length}`);
check('皮帶輪馬達固定在底層', pulley.motors.some(m => m.id === 'PLA') && pulley.pulleys.every(p => p.layer < 0),
  `motors=${pulley.motors.map(m => m.id).join(',')}`);
const pulleyMotor = pulley.motors.find(m => m.id === 'PLA');
const drivenPulley = pulley.pulleys.find(p => p.id === 'PulleyB');
check('皮帶輪馬達本體背向另一輪', pulleyMotor && drivenPulley && dotFromToWithDir(pulleyMotor, drivenPulley.center, pulleyMotor.dir) < 0,
  `dir=${pulleyMotor ? `${pulleyMotor.dir.x.toFixed(2)},${pulleyMotor.dir.y.toFixed(2)}` : 'missing'}`);

report('blocks-3d-completed-examples');
