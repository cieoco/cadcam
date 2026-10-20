import assert from 'node:assert/strict';
import {decimalNumber,formatNumber,showNumber,readNumber} from '../js/blocks/numeric-input.js';
for(const [raw,value] of [['-26',-26],['+26',26],['−26',-26],['＋12.5',12.5],['-.5',-.5],['+0.25',.25],['120',120]])
 assert.equal(decimalNumber(raw),value);
for(const raw of ['', '-', '+', '-.', '1-2', '0x10', 'Infinity', '3mm'])assert.ok(Number.isNaN(decimalNumber(raw)));
assert.equal(formatNumber(100),'100');assert.equal(formatNumber(172.422),'172.42');assert.equal(formatNumber(-26.1234),'-26.12');
const input={value:'',dataset:{},addEventListener(event,fn){this.edit=fn;}};
showNumber(input,253.36805);assert.equal(input.value,'253.37');assert.equal(readNumber(input),253.36805);
input.edit();assert.equal(readNumber(input),253.37,'retyping the displayed number commits the typed precision');
input.value='-';assert.ok(Number.isNaN(readNumber(input)),'partial sign never becomes zero');
console.log('PASS signed decimals, incomplete edits, rounded display and untouched precision');
