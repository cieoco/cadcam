/** 剛性桿件共用尺寸語意；不持有 UI 或修改輸入資料。 */
import {isDisk,validateDisk} from './disk-plate.js';
import { polylineTriangleParams, preservedDiagonalLength } from './plate-geometry.js';
import { memberStock, planMemberStock, DEFAULT_HOLE_MM } from './member-stock.js';

const stockDimensions = () => [
  { id: 'width', label: '板寬', stockKey: 'widthMm', min: 2, max: 120, step: 1 },
  { id: 'thickness', label: '板厚', stockKey: 'thicknessMm', min: 0.5, max: 30, step: 0.5 }
];

export function memberDimensions(comp) {
  if(comp?.standardBlank)return [{id:'g',label:'長向孔距 A–B',refs:['p1','p2'],param:comp.type==='bar'?comp.lenParam:comp.gParam},...(comp.type==='triangle'?[{id:'r1',label:'直向孔距 A–C',refs:['p1','p3'],param:comp.r1Param}]:[]),...(comp.standardBlank.kind==='l'?[{id:'arm',label:'L型臂寬',property:'standardArmWidth'}]:[]),...stockDimensions().filter(d=>comp.type==='bar'||d.stockKey!=='widthMm')];
  if(isDisk(comp))return [{id:'g',label:'工作孔距中心 A–B',refs:['p1','p2'],param:comp.lenParam,step:1}];
  if (comp?.type === 'bar') return [{ id: 'g', label: comp.boxPanel?'板件長度':'孔距 A–B', refs: ['p1', 'p2'], param: comp.lenParam }, ...stockDimensions()];
  if (comp?.type !== 'triangle') return [];
  const dimensions = [
    { id: 'g', label: '孔距 A–B', refs: ['p1', 'p2'], param: comp.gParam },
    { id: 'r1', label: '孔距 A–C', refs: ['p1', 'p3'], param: comp.r1Param },
    { id: 'r2', label: '孔距 B–C', refs: ['p2', 'p3'], param: comp.r2Param }
  ];
  const poly = polylineTriangleParams(comp);
  if (poly) dimensions.find(d => d.param === poly.diagParam).label += '（跨距）';
  if (comp.shape === 'jaw') dimensions.push({ id: 'tip', label: '爪端長度 C–T', refs: ['p3', 'tip'], property: 'jawTipLength' });
  return [...dimensions, ...stockDimensions()];
}

export function memberDimensionValue(comp, params, id = 'g') {
  const dimension = memberDimensions(comp).find(d => d.id === id);
  if (!dimension) return NaN;
  if (dimension.stockKey) return memberStock(comp)[dimension.stockKey];
  if(id==='arm')return comp.standardBlank.armWidthMm;
  if (dimension.property) return Number(comp.jawTipLength ?? Math.max(38, Math.min(84, Number(params[comp.r1Param]) * 0.58)));
  return Number(params[dimension.param]);
}

export function planMemberDimension(comp, params, id, raw, {holeDiameterMm=DEFAULT_HOLE_MM,exact=false}={}) {
  if(comp?.boxPanel)return {ok:false,message:'盒體板件尺寸請從「卡榫盒子」統一修改。'};
  const dimension = memberDimensions(comp).find(d => d.id === id);
  if (dimension?.stockKey) {
    const plan = planMemberStock(comp, dimension.stockKey, raw);
    return plan.ok ? { ok: true, params: {}, properties: { stock: plan.stock }, value: plan.stock[dimension.stockKey] } : plan;
  }
  const numeric = Number(raw);
  const value = exact ? Math.round(numeric * 1e4) / 1e4 : Math.round(numeric * 10) / 10;
  const max = id === 'tip' ? 160 : 2000;
  if (!dimension || !Number.isFinite(numeric) || numeric < 8 || numeric > max)
    return { ok: false, message: `尺寸請填 8–${max} mm，最多一位小數。` };
  if (dimension.property) return { ok: true, params: {}, properties: { [dimension.property]: value }, value };
  if(isDisk(comp)){const error=validateDisk(comp,value,comp.diameterMm,holeDiameterMm);if(error)return {ok:false,message:error};}
  const patch = { [dimension.param]: value };
  const poly = polylineTriangleParams(comp);
  const straight=poly&&Math.abs(Number(params[poly.segParams[0]])+Number(params[poly.segParams[1]])-Number(params[poly.diagParam]))<.001;
  if (poly && dimension.param !== poly.diagParam) {
    const [a, b] = poly.segParams;
    if(straight){const other=dimension.param===a?b:a;patch[other]=Number(params[poly.diagParam])-value;if(patch[other]<8)return {ok:false,message:'中間孔需距兩端至少 8 mm。'};}
    else {const diagonal = preservedDiagonalLength(Number(params[a]), Number(params[b]), Number(params[poly.diagParam]),
      Number(patch[a] ?? params[a]), Number(patch[b] ?? params[b]));
    if (diagonal !== null) patch[poly.diagParam] = exact ? diagonal : Math.round(diagonal * 10) / 10;
    }
  }
  if (comp.type === 'triangle') {
    const lengths = [comp.gParam, comp.r1Param, comp.r2Param].map(key => Number(patch[key] ?? params[key]));
    const [a, b, c] = lengths.slice().sort((x, y) => x - y);
    if (!lengths.every(n => Number.isFinite(n) && n > 0) || (straight? a+b<c-1e-8 : a + b <= c + 0.01))
      return { ok: false, message: '這個孔距無法形成剛性三點桿，請縮小變化或改另一段。' };
  }
  return { ok: true, params: patch, properties: { snapLength: false }, value };
}

// Only an unambiguous, meshed two-gear pair with matching mirrored jaws may link edits.
// The actual shared holes define ownership; names and lesson flags do not.
export function mirroredJaw(comp, comps, params) {
  if(comp?.shape!=='jaw'||!comps.some(c=>c.id===comp.id))return null;
  const owner=c=>comps.filter(g=>g.type==='gear'&&g.p1?.id===c.p1?.id&&g.p2?.id===c.p2?.id);
  const gears=owner(comp);if(gears.length!==1)return null;const gear=gears[0];
  const matches=comps.filter(other=>{
    if(other.id===comp.id||other.moduleId!==comp.moduleId||other.type!=='triangle'||other.shape!=='jaw'||other.jawTurnSign!==-comp.jawTurnSign)return false;
    const pair=owner(other);if(pair.length!==1)return false;const mate=pair[0];
    if(!(mate.mesh===gear.id||gear.mesh===mate.id)||mate.teeth!==gear.teeth)return false;
    if(!['g','r1','r2','tip'].every(id=>Math.abs(memberDimensionValue(comp,params,id)-memberDimensionValue(other,params,id))<.1))return false;
    const dx=other.p1.x-comp.p1.x,dy=other.p1.y-comp.p1.y,L=Math.hypot(dx,dy);if(L<.1)return false;
    const u={x:dx/L,y:dy/L},m={x:(comp.p1.x+other.p1.x)/2,y:(comp.p1.y+other.p1.y)/2};
    return ['p1','p2','p3'].every(ref=>{const p=comp[ref],q=other[ref],d=(p.x-m.x)*u.x+(p.y-m.y)*u.y;return Math.hypot(p.x-2*d*u.x-q.x,p.y-2*d*u.y-q.y)<.1;});
  });
  return matches.length===1?matches[0]:null;
}

export function dimensionLock(comp, comps, id) {
  if(comp?.boxPanel)return '盒體板件尺寸請從「卡榫盒子」統一修改。';
  if(comp?.barFusionRoot&&id!=='g')return '請先解除合成再調整板寬或板厚。';
  const dimension = memberDimensions(comp).find(d => d.id === id);
  if (!dimension || dimension.property || dimension.stockKey) return '';
  const ids = dimension.refs.map(ref => comp[ref]?.id);
  const gear = comps.find(c => c.type === 'gear' && ids.includes(c.p1?.id) && ids.includes(c.p2?.id));
  return gear ? '這段孔距由齒輪輸出孔決定，請選齒輪調整輸出孔半徑。' : '';
}
