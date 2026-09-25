import assert from 'node:assert/strict';
import {
  MATERIALS,
  normalizeMemberStock,
  memberStock,
  memberStockLabel,
  planMemberStock,
} from '../js/blocks/member-stock.js';

assert.deepEqual(MATERIALS.map(({ id, label }) => ({ id, label })), [
  { id: 'unspecified', label: '未指定' },
  { id: 'plywood', label: '夾板' },
  { id: 'acrylic', label: '壓克力' },
  { id: 'aluminum', label: '鋁板' },
  { id: 'pla', label: 'PLA' },
]);
assert.equal(Object.isFrozen(MATERIALS), true);
assert.equal(Object.isFrozen(MATERIALS[0]), true);

assert.equal(normalizeMemberStock(null), undefined);
assert.equal(normalizeMemberStock(undefined), undefined);
assert.equal(normalizeMemberStock([]), undefined);
assert.equal(normalizeMemberStock('stock'), undefined);
assert.deepEqual(normalizeMemberStock({}), { widthMm: 18, thicknessMm: 4, material: 'unspecified' });
assert.deepEqual(normalizeMemberStock({
  widthMm: 121.76,
  thicknessMm: 0.46,
  material: 'unknown',
}), { widthMm: 120, thicknessMm: 0.5, material: 'unspecified' });
assert.deepEqual(normalizeMemberStock({
  widthMm: 2.04,
  thicknessMm: 29.96,
  material: 'aluminum',
}), { widthMm: 2, thicknessMm: 30, material: 'aluminum' });
assert.deepEqual(normalizeMemberStock({
  widthMm: '', thicknessMm: null, material: 'pla',
}), { widthMm: 18, thicknessMm: 4, material: 'pla' });
assert.deepEqual(normalizeMemberStock({
  widthMm: true, thicknessMm: false, material: 'acrylic',
}), { widthMm: 18, thicknessMm: 4, material: 'acrylic' });
assert.deepEqual(normalizeMemberStock({
  widthMm: Infinity, thicknessMm: NaN, material: 'plywood',
}), { widthMm: 18, thicknessMm: 4, material: 'plywood' });

const malformedComp = { stock: [] };
assert.deepEqual(memberStock(malformedComp), { widthMm: 18, thicknessMm: 4, material: 'unspecified' });
assert.deepEqual(malformedComp, { stock: [] }, 'reading defaults must not mutate the component');
const legacyComp = {};
assert.deepEqual(memberStock(legacyComp), { widthMm: 18, thicknessMm: 4, material: 'unspecified' });
assert.deepEqual(legacyComp, {}, 'reading legacy defaults must not write stock back');
assert.equal(memberStockLabel({ stock: { widthMm: 24, thicknessMm: 6, material: 'plywood' } }), '夾板・板寬 24 mm・厚度 6 mm');
assert.equal(memberStockLabel({}), '未指定・板寬 18 mm・厚度 4 mm');

const original = { id: 'bar-1', stock: { widthMm: 24, thicknessMm: 6, material: 'plywood' } };
const widthPlan = planMemberStock(original, 'widthMm', 26.26);
assert.deepEqual(widthPlan, { ok: true, stock: { widthMm: 26.3, thicknessMm: 6, material: 'plywood' } });
assert.deepEqual(original.stock, { widthMm: 24, thicknessMm: 6, material: 'plywood' }, 'planning must not mutate the source');
assert.deepEqual(planMemberStock(original, 'thicknessMm', 7.25), {
  ok: true, stock: { widthMm: 24, thicknessMm: 7.3, material: 'plywood' },
});
assert.deepEqual(planMemberStock(original, 'material', 'pla'), {
  ok: true, stock: { widthMm: 24, thicknessMm: 6, material: 'pla' },
});
assert.equal(planMemberStock(original, 'widthMm', 13.4).ok, false, 'default hole clearance rejects narrow width');
assert.equal(planMemberStock(original, 'widthMm', 14.2, { holeDiameterMm: 13.7 }).ok, true);
for (const value of ['', null, true, false, NaN, Infinity, -Infinity, 1.9, 120.1]) {
  assert.equal(planMemberStock(original, 'widthMm', value).ok, false, `width edit should reject ${String(value)}`);
}
for (const value of ['', null, true, false, NaN, Infinity, 0.4, 30.1]) {
  assert.equal(planMemberStock(original, 'thicknessMm', value).ok, false, `thickness edit should reject ${String(value)}`);
}
for (const value of ['wood', 'PLA', '', null, true]) {
  assert.equal(planMemberStock(original, 'material', value).ok, false, `material edit should reject ${String(value)}`);
}
assert.equal(planMemberStock(original, 'color', '#fff').ok, false);

const roundTrip = normalizeMemberStock(widthPlan.stock);
assert.deepEqual(roundTrip, widthPlan.stock, 'valid stock should survive normalization unchanged');

console.log('member stock checks passed');
