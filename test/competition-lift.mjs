import assert from 'node:assert/strict';
import { BLOCK_EXAMPLES } from '../js/blocks/examples.js';
import { analyzeDof } from '../js/blocks/dof.js';
const example = BLOCK_EXAMPLES.find(item => item.id === 'competition-fourbar-lift');
assert.equal(analyzeDof(example.snapshot.comps).dof, 1, '升降臂應只有一個自由度');
assert.equal(example.snapshot.comps.some(comp => comp.id === 'ToolDiagonal'), false, '升降臂不應使用斜撐');
assert.equal(Boolean(example.snapshot.tracePoint), false, '手機範例不應預先開啟工作點量測');
assert.equal(Array.isArray(example.snapshot.tracePoints), false, '升降臂不應預先顯示雙點量測');
console.log('competition lift example: ok');
