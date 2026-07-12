import assert from 'node:assert/strict';
import { BLOCK_EXAMPLES } from '../js/blocks/examples.js';
import { analyzeDof } from '../js/blocks/dof.js';
import { compileTopology } from '../js/core/topology.js';
import { solveTopology } from '../js/multilink/solver.js';
import { buildMotorMounts } from '../js/blocks/motor-mounts.js';
import { splitMountsByHost } from '../js/blocks/exporters.js';

const example = BLOCK_EXAMPLES.find(item => item.id === 'competition-fourbar-lift');

// 雙馬達版：2 個自由度、2 組獨立動力（M1 升降、M2 手腕）→ 完整受控，不需 assemblyMobility 覆寫。
const mobility = analyzeDof(example.snapshot.comps);
assert.equal(mobility.dof, 2, '雙馬達升降臂的理論自由度應為 2');
assert.equal(mobility.inputs, 2, '應有兩組獨立動力輸入');
assert.equal(mobility.mobilityOverride, false, '不應再用 assemblyMobility 覆寫');
assert.equal(mobility.classification, 'multi-driven', '每個自由度都有馬達管');

// 騎乘馬達：手腕軸 B 必須保持 floating，馬達殼固定在綠色立桿上——綠桿就是這顆馬達的機架。
const toolPlate = example.snapshot.comps.find(comp => comp.id === 'ToolPlate');
assert.equal(toolPlate.motorMount?.frameBody, 'LiftUpright', 'M2 應明確記錄實體機架桿');
assert.equal(toolPlate.motorMount?.orientation, 'follow-frame', 'M2 應明確記錄跟隨機架的朝向');
assert.equal(toolPlate.physicalMotor, '2', '工具架應由 2 號馬達驅動');
assert.equal(toolPlate.p1.type, 'floating', '手腕軸 B 不應被釘到世界機架');
assert.equal(toolPlate.motorCarrier, 'LiftUpright', 'M2 的機架桿應是綠色立桿');
assert.equal(toolPlate.phaseOffset, -90, '相位是相對機架桿的夾角（B→C 0° − 綠桿 90°）');

// 兩軸獨立：M1 抬升時 B 跟著升、B→C 保持 M2 凍結的水平姿態；M2 轉時升降不動。
const topo = { params: { ...example.snapshot.params } };
const compiled = compileTopology(example.snapshot.comps, topo, new Set());
const solveAt = (m1, m2) => solveTopology(compiled, { thetaDeg: 0, motorAngles: { '1': m1, '2': m2 } });
{
  const { points } = solveAt(60, 0);
  assert.ok(Math.abs(points.B.y - 113.6) < 0.5 && Math.abs(points.B.x + 72) < 0.5, 'M1=60 時 B 應跟著抬升');
  assert.ok(Math.abs(points.C.y - points.B.y) < 1e-6, 'M2 凍結時 B→C 應維持水平');
}
{
  const { points } = solveAt(0, 45);
  assert.ok(Math.abs(points.B.x + 48) < 1e-6 && Math.abs(points.B.y - 72) < 1e-6, 'M2 單獨轉時升降臂不應動');
  const ang = Math.atan2(points.C.y - points.B.y, points.C.x - points.B.x) * 180 / Math.PI;
  assert.ok(Math.abs(ang - 45) < 1e-6, 'M2=45 時工具架應繞 B 轉 45°');
}

assert.equal(example.snapshot.comps.some(comp => comp.id === 'ToolDiagonal'), false, '升降臂不應使用斜撐');
assert.equal(Boolean(example.snapshot.tracePoint), false, '手機範例不應預先開啟工作點量測');
assert.equal(Array.isArray(example.snapshot.tracePoints), false, '升降臂不應預先顯示雙點量測');
const staticPoints = Object.fromEntries(example.snapshot.comps.flatMap(comp =>
  ['p1', 'p2', 'p3'].map(key => comp[key]).filter(Boolean)
    .map(point => [point.id, { x: point.x, y: point.y }])));
const motorMounts = buildMotorMounts({
  motorIds: new Set(['O1', 'B']), groundIds: new Set(['O1', 'O2']), staticPoints,
  comps: example.snapshot.comps, compiledSteps: compiled.steps, sliderMountInfo: () => null,
  isHiddenSliderRailPoint: () => false, motorTypeForCenter: () => 'tt'
});
assert.equal(motorMounts.get('B').frameBody, 'LiftUpright', 'M2 mount 應隸屬綠色機架桿');
const mountSplit = splitMountsByHost(example.snapshot.comps, [{ pointId: 'B', frameBody: motorMounts.get('B').frameBody }]);
assert.equal(mountSplit.hosted.get('LiftUpright')?.length, 1, 'M2 不可被歸入世界機架');
assert.equal(mountSplit.free.length, 0, 'M2 不可令世界機架跟著 B 重建');
console.log('competition lift example: ok');
