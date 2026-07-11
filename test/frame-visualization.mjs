// 範例驗收：隱性機架視覺資料規則。
// 驗收條件（自動，本檔）：① grounded 點都屬於同一隱性機架 ② 滑軌 rail 端點不拿來畫機架連接
// ③ 滑軌 mount 孔保留為機架連接孔 ④ frame lock 座標吸附到 8mm LEGO pitch。
// 還需人工一眼：固定桿/固定板外觀、孔陣列密度、機架拖曳手感。
// 跑法：node test/frame-visualization.mjs
import { check, report } from './_harness.mjs';
import { BLOCK_EXAMPLES } from '../js/blocks/examples.js';
import { normalizeSnapshot } from '../js/blocks/schema.js';
import {
  frameNodeIds,
  frameConnectorNodes,
  isHiddenSliderRailPoint,
  isSliderMountPoint,
  snapFrameCoord
} from '../js/blocks/model.js';

const example = BLOCK_EXAMPLES.find(e => e.id === 'quick-return');
const norm = normalizeSnapshot(example.snapshot);
const ids = frameNodeIds(norm.comps);
const connectors = frameConnectorNodes(norm.comps).map(p => p.id).sort();

check('急回範例 grounded 點都進隱性機架集合',
  ['O', 'M1', 'M2', 'Sa', 'Sb'].every(id => ids.has(id)),
  `frame ids = ${[...ids].sort().join(', ')}`);

check('滑軌內部 rail 端點不做機架視覺連接孔',
  isHiddenSliderRailPoint(norm.comps, 'Sa') &&
  isHiddenSliderRailPoint(norm.comps, 'Sb') &&
  !connectors.includes('Sa') &&
  !connectors.includes('Sb'),
  `connectors = ${connectors.join(', ')}`);

check('滑軌 mount 孔保留為機架視覺連接孔',
  isSliderMountPoint(norm.comps, 'M1') &&
  isSliderMountPoint(norm.comps, 'M2') &&
  connectors.includes('M1') &&
  connectors.includes('M2'),
  `connectors = ${connectors.join(', ')}`);

check('機架吸附使用 8mm LEGO pitch',
  snapFrameCoord(18.1) === 16 && snapFrameCoord(20.9) === 24 && snapFrameCoord(-3.9) === 0);

const intake=normalizeSnapshot(BLOCK_EXAMPLES.find(e=>e.id==='competition-roller-intake').snapshot);
const intakeConnectors=frameConnectorNodes(intake.comps).map(p=>p.id);
check('Intake 獨立擺臂與導引板不併入 TT 馬達座凸包',
  !['IMC','IFC','IGR','IGF','IFT'].some(id=>intakeConnectors.includes(id)),
  `connectors=${intakeConnectors.join(',')}`);

report('frame-visualization');
