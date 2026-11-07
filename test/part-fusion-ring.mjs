// 回歸：方環（四根棍首尾相接）的外形聯集不可因棍寬／邊長的浮點巧合而「未閉合」。
import assert from 'node:assert/strict';
import {unionOutlines,area} from '../js/blocks/part-fusion.js';
import {inspectLinkExport} from '../js/blocks/exporters.js';

function ringSource(L,w){
  const P=[[0,0],[L,0],[L,L],[0,L]],src=[];
  for(let i=0;i<4;i++){
    const a={x:P[i][0],y:P[i][1]},b={x:P[(i+1)%4][0],y:P[(i+1)%4][1]};
    const c={type:'bar',id:'b'+i,p1:{id:'p'+i},p2:{id:'q'+i},lenParam:'x',stock:{widthMm:w}};
    const g=inspectLinkExport(c,L,{}),ux=(b.x-a.x)/L,uy=(b.y-a.y)/L;
    src.push(...g.outlines.map(r=>r.map(p=>({x:a.x+p.x*ux-p.y*uy,y:a.y+p.x*uy+p.y*ux}))));
  }
  return src;
}
const sizes=[40,64,70,80,90,96];let n=0;
for(const L of sizes)for(let w=12;w<=18;w+=.5){
  const loops=unionOutlines(ringSource(L,w));
  assert.equal(loops.length,2,`ring L=${L} w=${w}: outer + hole`);
  assert.equal(loops.filter(r=>area(r)>0).length,1,`ring L=${L} w=${w}: one outer loop`);
  n++;
}
// 已知曾失敗的組合
for(const [L,w] of [[80,13],[70,12],[90,15],[70,13],[80,14]])assert.equal(unionOutlines(ringSource(L,w)).length,2);
console.log(`part-fusion ring regression passed (${n} cases)`);
