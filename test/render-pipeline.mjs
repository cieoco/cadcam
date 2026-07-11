// draw() 流水線的資料準備驗收：場景 id、疊放層與 3D 預覽輸入。
import { collectSceneIds, prepareRenderScene } from '../js/blocks/render-scene.js';
import { buildPreviewModelInputs } from '../js/blocks/preview-model-inputs.js';
import { computeBodyLayers } from '../js/blocks3d/scene-model.js';
import { motorAssemblyLayerForBody } from '../js/blocks/motor-mounts.js';
import { check, report } from './_harness.mjs';

const comps = [
  { type: 'bar', id: 'Crank', isInput: true, p1: { id: 'O', type: 'motor' }, p2: { id: 'A' }, zlift: 1 },
  { type: 'triangle', id: 'Plate', p1: { id: 'A' }, p2: { id: 'B' }, p3: { id: 'C' }, zlift: 2 },
  { type: 'gear', id: 'GearA', p1: { id: 'O' }, p2: { id: 'G' }, radiusParam: 'GR', teeth: 12 }
];
const compiled = {
  steps: [{ type: 'ground', id: 'O' }, { type: 'input_crank', center: 'O', id: 'A' }],
  visualization: {
    links: [{ id: 'Crank', p1: 'O', p2: 'A', style: 'crank' }, { id: 'Plate:p1-p2', p1: 'A', p2: 'B' }],
    polygons: [{ points: ['A', 'B', 'C'] }]
  }
};
const points = { O: { x: 0, y: 0 }, A: { x: 30, y: 0 }, B: { x: 70, y: 0 }, C: { x: 50, y: 30 }, G: { x: 18, y: 0 } };
const ids = collectSceneIds({ compiled, comps, motorPointIds: new Set(['O']) });
check('場景準備收集固定點、馬達與 3D 馬達中心', ids.groundIds.has('O') && ids.motorCenterIds.has('O') && ids.modelMotorCenterIds.has('O'));

const mounts = new Map([['O', { outputBody: 'Crank', order: ['motor', 'outputBody'] }]]);
const scene = prepareRenderScene({ compiled, comps, points, frameGeometry: { outlines: [[points.O, points.A]] }, sceneIds: ids,
  computeBodyLayers, motorAssemblyLayerForBody, motorMounts: mounts });
check('三角板邊不重複進入可見連桿層', scene.layerLinks.length === 1 && scene.triangleEdgeKeys.has('A|B'));
check('連桿與三角板取得共用疊放層', scene.bodyLayers.length === 2 && scene.linkLayer.has(compiled.visualization.links[0]) && scene.triangleLayerByKey.has('A|B|C'));

const preview = buildPreviewModelInputs({ comps, params: { GR: 18 }, theta: 45, links: compiled.visualization.links, points,
  groundIds: ids.groundIds, motorCenterIds: ids.modelMotorCenterIds, motorTypes: new Map([['O', 'tt']]), motorMounts: mounts,
  polygons: compiled.visualization.polygons, sliderTravelStart: () => 0, sliderTravelEnd: () => 0, sliderBodyLength: () => 0,
  rackBodyHeight: () => 0, rackPhaseShift: () => 0, pulleyRadius: () => 0, pulleyPinRadius: () => 0 });
check('3D 預覽輸入集中產生齒輪與馬達資料', preview.gears.length === 1 && preview.gears[0].radius === 18 && preview.motorTypes.get('O') === 'tt');

report('render-pipeline');
