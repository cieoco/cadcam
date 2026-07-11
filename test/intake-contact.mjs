import assert from 'node:assert/strict';
import { circleRectCompression } from '../js/blocks/intake-contact.js';
let r=circleRectCompression({x:0,y:0,radius:20},{x:30,y:0,width:24,height:24});
assert.equal(r.contact,true); assert.equal(r.compression,2);
r=circleRectCompression({x:0,y:0,radius:10},{x:30,y:0,width:10,height:10});
assert.equal(r.contact,false); assert.equal(r.compression,0);
console.log('intake contact: ok');
