import {ShapeUtils as small} from '../js/vendor/shape-utils.js';
import {ShapeUtils as original,Vector2} from '../js/vendor/three.module.js';
import {check,report} from './_harness.mjs';
const ring=(n,r,x=0,y=0)=>Array.from({length:n},(_,i)=>({x:x+r*Math.cos(i*2*Math.PI/n),y:y+r*Math.sin(i*2*Math.PI/n)}));
const cases=[[[{x:0,y:0},{x:4,y:0},{x:4,y:1},{x:1,y:1},{x:1,y:4},{x:0,y:4}],[]]];
for(const n of [4,7,16,64])for(const reverse of [false,true])for(const closed of [false,true]){
  const contour=ring(n,30);if(reverse)contour.reverse();if(closed)contour.push({...contour[0]});
  cases.push([contour,[ring(12,2,-8),ring(16,3,8)]]);
}
check('凹形、孔洞、方向與重複終點與原版完全一致',cases.every(([c,h])=>{
  const convert=r=>r.map(p=>new Vector2(p.x,p.y));
  return small.area(c)===original.area(c)&&JSON.stringify(small.triangulateShape(structuredClone(c),structuredClone(h)))===JSON.stringify(original.triangulateShape(convert(c),h.map(convert)));
}));
report('shape-utils');
