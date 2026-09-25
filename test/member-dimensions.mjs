import assert from 'node:assert/strict';
import { check, report } from './_harness.mjs';
import { getExample } from '../js/blocks/examples.js';
import {
  dimensionLock, memberDimensionValue, memberDimensions, mirroredJaw, planMemberDimension
} from '../js/blocks/member-dimensions.js';
import { createPlateGeometry, polylineTriangleParams } from '../js/blocks/plate-geometry.js';
import { inspectPlateExport } from '../js/blocks/exporters.js';
import { gripperTips } from '../js/blocks/gripper-workflow.js';
import { normalizeSnapshot, toSnapshot } from '../js/blocks/schema.js';
import { decodeShareString, encodeSnapshot } from '../js/share-codec.js';

const fixture = () => normalizeSnapshot(getExample('gear-gripper').snapshot);
const near = (actual, expected, epsilon = 1e-8) => Math.abs(actual - expected) < epsilon;
const leftJaw = snapshot => snapshot.comps.find(comp => comp.id === 'LeftJaw');
const rightJaw = snapshot => snapshot.comps.find(comp => comp.id === 'RightJaw');

const bar = { type: 'bar', id: 'Bar1', p1: { id: 'A' }, p2: { id: 'B' }, lenParam: 'L' };
const triangle = {
  type: 'triangle', id: 'Triangle1', p1: { id: 'A' }, p2: { id: 'B' }, p3: { id: 'C' },
  gParam: 'G', r1Param: 'R1', r2Param: 'R2'
};

check('bar, triangle, and jaw dimensions use named hole distances', (() => {
  const s = fixture(), jaw = leftJaw(s);
  const barDims = memberDimensions(bar);
  const triDims = memberDimensions(triangle);
  const jawDims = memberDimensions(jaw);
  return barDims.length === 3 && barDims[0].label === '孔距 A–B' && barDims[0].param === 'L'
    && triDims.filter(d => d.refs).map(d => d.label).join('|') === '孔距 A–B|孔距 A–C|孔距 B–C'
    && jawDims.map(d => d.id).join(',') === 'g,r1,r2,tip,width,thickness'
    && jawDims[3].label === '爪端長度 C–T';
})());

check('18 mm plus an 8 mm edit remains exactly 26 mm', (() => {
  const plan = planMemberDimension(bar, { L: 18 }, 'g', 18 + 8);
  return plan.ok && plan.value === 26 && plan.params.L === 26;
})());

check('precise dimensions round only to one decimal place', (() => {
  const plan = planMemberDimension(bar, { L: 18 }, 'g', '26.34');
  return plan.ok && plan.value === 26.3 && plan.params.L === 26.3;
})());

check('jaw segment mapping uses g and r1 for legs and r2 for the diagonal', (() => {
  const s = fixture(), jaw = leftJaw(s), dims = memberDimensions(jaw);
  const params = { ...s.params };
  const r1 = planMemberDimension(jaw, params, 'r1', 108);
  const r2 = planMemberDimension(jaw, params, 'r2', 122);
  const mapping = polylineTriangleParams(jaw);
  return dims.find(d => d.id === 'g').param === 'GPRA'
    && dims.find(d => d.id === 'r1').param === 'LJ_tip'
    && dims.find(d => d.id === 'r2').param === 'LJ_edge'
    && mapping.segParams.join(',') === 'GPRA,LJ_tip' && mapping.diagParam === 'LJ_edge'
    && r1.ok && r1.params.LJ_tip === 108 && r1.params.LJ_edge !== params.LJ_edge
    && r2.ok && r2.params.LJ_edge === 122;
})());

check('invalid triangle edit is rejected without mutating its inputs', (() => {
  const params = { G: 10, R1: 10, R2: 15 };
  const before = JSON.stringify({ triangle, params });
  const plan = planMemberDimension(triangle, params, 'r2', 20.1);
  return !plan.ok && JSON.stringify({ triangle, params }) === before;
})());

check('jaw tip length edits leave parameters, holes, and component data unchanged', (() => {
  const s = fixture(), jaw = leftJaw(s);
  jaw.holes = [{ id: 'H1', distParam: 'Hole1' }];
  const paramsBefore = JSON.stringify(s.params), jawBefore = JSON.stringify(jaw);
  const plan = planMemberDimension(jaw, s.params, 'tip', '55.55');
  return plan.ok && plan.value === 55.6 && Object.keys(plan.params).length === 0
    && plan.properties.jawTipLength === 55.6
    && JSON.stringify(s.params) === paramsBefore && JSON.stringify(jaw) === jawBefore;
})());

check('mirroredJaw accepts only the matching default workflow pair', (() => {
  const s = fixture(), left = leftJaw(s), right = rightJaw(s);
  const defaultMatch = mirroredJaw(left, s.comps, s.params) === right
    && mirroredJaw(right, s.comps, s.params) === left;
  const disabled = mirroredJaw(left, s.comps, { ...s.params, gripperWorkflow: 0 }) === null;
  const changed = structuredClone(s);
  rightJaw(changed).p3.x += 1;
  const asymmetric = mirroredJaw(leftJaw(changed), changed.comps, changed.params) === null;
  const unrelated = mirroredJaw({ ...left, id: 'OtherJaw' }, s.comps, s.params) === null;
  return defaultMatch && disabled && asymmetric && unrelated;
})());

check('gear output pin locks the shared jaw dimension', (() => {
  const s = fixture(), jaw = leftJaw(s);
  return dimensionLock(jaw, s.comps, 'g').includes('齒輪') && dimensionLock(jaw, s.comps, 'r1') === '';
})());

check('jawTipLength survives normalize/share and drives geometry, tips, and export', (() => {
  const s = fixture(), left = leftJaw(s), right = rightJaw(s);
  left.jawTipLength = 55.5;
  right.jawTipLength = 55.5;
  const snapshot = toSnapshot(s.comps, { params: s.params }, s.counter);
  const restored = normalizeSnapshot(decodeShareString(encodeSnapshot(snapshot)));
  const restoredLeft = leftJaw(restored);
  if (restoredLeft.jawTipLength !== 55.5) return false;

  const solvedPoints = {
    GCA: { x: -30, y: 0 }, GPA: { x: -30, y: 18 }, LT: { x: -95, y: -85 },
    GCB: { x: 30, y: 0 }, GPB: { x: 30, y: 18 }, RT: { x: 95, y: -85 }
  };
  const pointsFor = jaw => ['p1', 'p2', 'p3'].map(ref => solvedPoints[jaw[ref].id]);
  const leftPoints = pointsFor(restoredLeft);
  const geometry = createPlateGeometry(restoredLeft, leftPoints, { radius: 9, holeRadius: 3.6 });
  const end = geometry.sourcePoints.at(-1);
  const tip = leftPoints[2];
  const tips = gripperTips(restored.comps, solvedPoints);
  const inspected = inspectPlateExport(restoredLeft, leftPoints, { holeDiameterMm: 7.2 });
  return near(Math.hypot(end.x - tip.x, end.y - tip.y), 55.5)
    && tips && near(Math.hypot(tips.left.x - solvedPoints.LT.x, tips.left.y - solvedPoints.LT.y), 55.5)
    && JSON.stringify(inspected) === JSON.stringify(geometry);
})());

check('jaw dimension values retain the exact saved tip length', (() => {
  const s = fixture(), jaw = leftJaw(s);
  jaw.jawTipLength = 55.5;
  return memberDimensionValue(jaw, s.params, 'tip') === 55.5;
})());

report('member-dimensions');
