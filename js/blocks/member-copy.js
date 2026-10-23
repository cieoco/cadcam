import {fusionRoot, inspectBarFusionData} from '../core/bar-fusion.js';
import {instantiateTemplate} from './module-ops.js';
import {pointKeysFor, ownedParamKeys} from './part-types.js';
import {createPlateGeometry, roundedHullOutline} from './plate-geometry.js';
import {memberStock, memberHoleDiameter} from './member-stock.js';

// 本體幾何預覽；附件、馬達與固定狀態不屬於複製的零件。
export function copyMemberGeometry(comp, params, settings = {}) {
  const points = pointKeysFor(comp).map(k => comp[k]);
  const radius = memberStock(comp).widthMm / 2, holeRadius = memberHoleDiameter(comp, settings) / 2;
  if (comp.type === 'triangle') return createPlateGeometry(comp, points, {radius, holeRadius});
  const [a,b] = points, length = Math.hypot(b.x-a.x,b.y-a.y);
  const holes = points.map(p => ({...p,r:holeRadius}));
  for (const hole of comp.holes || []) {
    const ratio = params[hole.distParam] / length;
    holes.push({x:a.x+(b.x-a.x)*ratio,y:a.y+(b.y-a.y)*ratio,r:holeRadius});
  }
  return {outlines:[roundedHullOutline(points,radius)],holes,cutouts:[]};
}

export function planMemberCopy({comps, params, modules = [], counter = 0, id, positions = {}, mode = 'copy', settings = {}}) {
  const fail = reason => ({ok:false,reason});
  const selected = comps.find(c => c.id === id);
  if (!selected || !['bar','triangle'].includes(selected.type)) return fail('請先選取連桿或板件。');
  if (!['copy','mirror-x','mirror-y'].includes(mode)) return fail('請選擇複製或鏡像方向。');
  const root = fusionRoot(comps,id);
  const fused = root && inspectBarFusionData(comps,root,params);
  if (fused && !fused.ok) return fail(fused.reason);
  const members = fused ? fused.members : [selected];
  if (members.some(c => c.fusedWith)) return fail('這片板已與齒輪合成，請先解除合成再複製。');
  if (members.some(c => c.type === 'bar' && (c.fixedLen === false || c.style === 'piston'))) return fail('伸縮桿目前不支援本體複製。');
  const source = JSON.parse(JSON.stringify(members));
  const sourceParams = {};
  for (const c of source) {
    for (const key of [...ownedParamKeys(c), ...(c.holes || []).map(h => h.distParam)]) {
      if (!Number.isFinite(params[key]) || params[key] < 0) return fail('零件尺寸無效，請先修正尺寸。');
      sourceParams[key] = params[key];
    }
    for (const key of pointKeysFor(c)) {
      const p = c[key], pos = positions[p.id] || p;
      if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return fail('零件目前沒有有效位置。');
      c[key] = {id:p.id,type:'floating',x:pos.x,y:pos.y};
    }
    for (const key of ['physicalMotor','physical_motor','motorType','motorMount','motorCarrier','motorMountPoint','mountLocatorPoint','phaseOffset','servoStart','servoEnd','assemblyMobility','assemblyType','frameSeparate']) delete c[key];
    if (c.type === 'bar') c.isInput = false;
    if (c.type === 'triangle') {
      const cross = (c.p2.x-c.p1.x)*(c.p3.y-c.p1.y)-(c.p2.y-c.p1.y)*(c.p3.x-c.p1.x);
      c.sign = cross < 0 ? -1 : 1;
      if (c.shape === 'jaw') c.jawTurnSign = c.jawTurnSign || -Math.sign(cross) || 1;
    }
  }
  const outlines = source.flatMap(c => copyMemberGeometry(c,sourceParams,settings).outlines.flat());
  const xs = outlines.map(p=>p.x), ys = outlines.map(p=>p.y);
  const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
  if (![minX,maxX,minY,maxY].every(Number.isFinite)) return fail('無法取得零件外形。');
  const move = p => mode === 'mirror-x' ? {x:2*maxX+16-p.x,y:p.y}
    : mode === 'mirror-y' ? {x:p.x,y:2*minY-16-p.y} : {x:p.x+maxX-minX+16,y:p.y};
  const existingTokens = new Set([...Object.keys(params), ...modules.map(m=>m.id)]);
  for (const c of comps) {
    existingTokens.add(c.id);
    pointKeysFor(c).forEach(k => { if(c[k])existingTokens.add(c[k].id); });
    (c.holes || []).forEach(h=>existingTokens.add(h.id));
  }
  // 沿用模組插入的唯一 ID／孔／參數重編；不建立新的設計或安裝關係。
  const result = instantiateTemplate({comps:source,params:sourceParams}, {counter,existingTokens,place:source[0].p1});
  result.comps.forEach((c,i) => {
    if (members[i].moduleId) c.moduleId = members[i].moduleId;
    else delete c.moduleId;
    pointKeysFor(c).forEach(k => Object.assign(c[k],move(c[k])));
    if (mode !== 'copy') {
      if (c.type === 'triangle') c.sign *= -1;
      if (c.jawTurnSign) c.jawTurnSign *= -1;
      for (const v of [...(c.vertices || []), ...(c.outlinePoints || [])]) if (!v.solve && Number.isFinite(v.v)) v.v *= -1;
      if (c.barFusion) c.barFusion.points.forEach(p=>{p.y *= -1;});
    }
  });
  if (root) {
    const check = inspectBarFusionData(result.comps,result.comps.find(c=>c.barFusion),result.params);
    if (!check.ok) return fail(check.reason);
  }
  return {ok:true,source,sourceParams,comps:result.comps,params:result.params,counter:result.counter,
    selectedId:result.comps[members.findIndex(c=>c.id===id)].id,mode};
}
