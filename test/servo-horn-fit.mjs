// G5-P3：MG995 搖臂孔由外購零件決定；棍太窄時只保留整個孔落在桿身內的孔（至少 2 個含中心），其餘照舊。
import assert from 'node:assert/strict';
import {inspectLinkExport} from '../js/blocks/exporters.js';
const horn=w=>{
  const c={type:'bar',id:'b',p1:{id:'a',physicalMotor:'1'},p2:{id:'b'},lenParam:'x',isInput:true,motorType:'mg995',stock:{widthMm:w}};
  return inspectLinkExport(c,140,{}).holes.filter(h=>/HORN/.test(h.layer)).map(h=>`${h.layer}:${Math.round(h.x)},${Math.round(h.y)}`).sort();
};
assert.deepEqual(horn(13),['MG995_HORN_CENTER:0,0','MG995_HORN_SCREW:7,0'],'13 mm：保留中心與沿桿方向的一臂，捨棄橫向孔與桿端外的孔');
assert.equal(horn(18).length,5,'18 mm：中心＋4 螺絲孔維持不變');
assert.equal(horn(16).length,2);
// 窄到只剩中心：不裁切，交給加工檢查回報
assert.equal(horn(4).length,5,'少於 2 個可保留時維持原孔，由既有加工檢查回報');
console.log('servo horn fit passed');
