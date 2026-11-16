import assert from 'node:assert/strict';
import {buildPreviewModelInputs} from '../js/blocks/preview-model-inputs.js';
const comps=[{id:'bar',type:'link',zlift:-3},{id:'plate',type:'triangle',p1:{id:'A'},p2:{id:'B'},p3:{id:'C'},zlift:2}];
const links=[{id:'bar',_zlift:99}],polygons=[{points:['C','A','B'],_zlift:99}];
const build=()=>buildPreviewModelInputs({comps,params:{},theta:0,links,polygons});
let result=build();assert.equal(result.links[0]._zlift,-3);assert.equal(result.polygons[0]._zlift,2);assert.equal(result.polygons[0].id,'plate');
delete comps[0].zlift;delete comps[1].zlift;result=build();assert.equal(result.links[0]._zlift,0);assert.equal(result.polygons[0]._zlift,0,'removed offsets must not survive a rebuilt preview');
console.log('preview zlift: links, polygons and reset passed');
