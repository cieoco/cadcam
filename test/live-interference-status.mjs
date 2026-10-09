import assert from 'node:assert/strict';
import { checkLiveInterference, liveInterferenceStatus as status } from '../js/blocks/live-interference-status.js';
const good = { ready: true, hasParts: true };
assert.equal(status(good).state, 'ok');
assert.equal(status({ ...good, n: 1, labels: ['升降臂底板'] }).state, 'hit');
assert.equal(status({ ...good, hasFace: true }).state, 'none');
assert.match(status({ ...good, hasFace: true }).message, /待檢查/);
const failure = checkLiveInterference(() => { throw new Error('solver'); });
assert.equal(failure.ready, false); assert.equal(failure.error, true);
assert.equal(status({ ...good, ...failure }).state, 'none');
assert.match(status({ ...good, ...failure }).message, /失敗/);
assert.equal(checkLiveInterference(() => null).ready, false);
assert.equal(status({ ...good, hasParts: false }).state, 'none');
assert.equal(checkLiveInterference(() => []).ready, true);
console.log('live-interference-status: PASS');

const partial={status:'not_supported',findings:[],coverage:{notSupported:[{code:'material_representation_not_supported',kind:'motors'}]}};
assert.equal(status({...good,hasFace:true,material:partial}).state,'none');
assert.match(status({...good,hasFace:true,material:partial}).message,/部分五金未檢查/);
assert.equal(status({...good,hasFace:true,material:{...partial,findings:[{status:'fail'}]}}).state,'hit');
assert.equal(status({...good,hasFace:true,material:partial,playing:true}).state,'none');
assert.match(status({...good,hasFace:true,material:partial,solveValidity:{valid:false}}).message,/無解.*保留/);

assert.equal(status({...good,hasFace:true,material:{status:'pass',findings:[],coverage:{notSupported:[]}},ready:false}).state,'none','material pass cannot mask pending in-plane checker');
assert.equal(status({...good,hasFace:true,material:{status:'pass',findings:[],coverage:{notSupported:[]}},hasParts:false}).state,'none');
