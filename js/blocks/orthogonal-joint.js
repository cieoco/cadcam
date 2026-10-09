import { appendFaceBracketHoles } from './face-bracket-extras.js';
/**
 * blocks / orthogonal-joint
 *
 * 直角安裝的 3D 列印 L 形轉接座（SDD-ORTHOGONAL-MOUNT O-D5）：純函式，不碰 DOM、不改輸入。
 * 轉接座一翼貼在宿主桿（mount.to.body，或輸出端 output.body，kind 'bar'）的面上、另一翼貼在子模組底板上；
 * 這裡只算兩邊木板要鑽的孔位（3.2 mm），STL 另由 adapter-stl.js 產生。
 */
import { memberStock } from './member-stock.js';
import { pointCoords, frameConnectorNodes } from './model.js';
import { frameStockOf } from './frame-stock.js';
import { orthogonalHostEdge, orthogonalFrame, hostPlateThickness, standChildHoles } from './assembly.js';
import { worldToLocal } from './plate-geometry.js';
import { FABRICATION_DEFAULTS } from './fabrication-profile.js';
import { metalBracketSpec } from './bracket-spec.js';
import { buildBracketInstance, transformBracketInstance } from './bracket-physical.js';

const D2R = Math.PI / 180;

// 轉接座預設尺寸（mm）：長度＝沿接合線；翼高＝每翼貼板的高度；孔徑＝M3 穿孔。
export const ADAPTER_LENGTH_MM = 20;
export const ADAPTER_FLANGE_MM = 14;
export const ADAPTER_HOLE_MM = 3.2;
export const ADAPTER_LAYER = 'ADAPTER_HOLE';
const DEFAULT_WALL_MM = 4;
const DEFAULT_HOLES_PER_FLANGE = 2;

// E1：直角接合件的種類。printed＝3D 列印 L 形轉接座（孔距轉角＝壁厚＋(翼高−壁厚)/2＝9，用螺帽）；
// bracket-m3＝現成不鏽鋼 M3 帶牙 L 角碼 13×9.5×7（厚 1.2、一腳一孔、孔心離腳端 3.5）：長腳貼宿主（孔離轉角 9.5）、
// 短腳貼子模組底板（孔離轉角 6），M3×6 穿過 3 mm 木板直接鎖進角碼螺牙，不用螺帽。每處兩片並排，各在 s＝5、15 mm。
export const JOINT_KINDS = {
  printed: { label: '3D 列印轉接座', hostHoleMm: 9, childHoleMm: 9, count: 1, threaded: false, tiltable: true },
  'bracket-m3': {
    label: 'M3 帶牙金屬角碼 13×9.5×7', widthMm: 7, thicknessMm: 1.2, longLegMm: 13, shortLegMm: 9.5,
    hostHoleMm: 9.5, childHoleMm: 6, count: 2, threaded: true, tiltable: false, screw: 'M3×6'
  }
};
export const DEFAULT_JOINT_KIND = 'printed';   // 舊存檔沒有 joint.kind 時視為 printed；新接的預設見 FABRICATION_DEFAULTS.joint.defaultKind
// 讀出 joint 的種類 id（不認得的一律視為 printed，與舊存檔相容）。
export const jointKindOf = joint => (joint && JOINT_KINDS[joint.kind] ? joint.kind : DEFAULT_JOINT_KIND);

const finitePos = v => Number.isFinite(Number(v)) && Number(v) > 0;
const r3 = v => Math.round(v * 1000) / 1000;

// F1：接合件規格。printed 與 JOINT_KINDS 相同；bracket-m3 的尺寸取作品加工設定的 joint.bracket
// （孔距轉角：宿主＝長腳−孔心離末端、子模組＝短腳−孔心離末端），沒給設定時用內建預設（13×9.5×7）。
export function jointSpec(kind, jointSettings = FABRICATION_DEFAULTS.joint) {
  const k = JOINT_KINDS[kind] ? kind : DEFAULT_JOINT_KIND;
  if (k === 'printed') return JOINT_KINDS.printed;
  return { ...JOINT_KINDS[k], ...metalBracketSpec(jointSettings) };
}

// D2：子模組底板上的轉接座孔（子模組平面座標）；角碼孔位依宿主外側面，printed 保留原有孔位算法。
// bar＝宿主桿／三角板零件（機架板宿主傳 null）；回傳 [{ x, y }]。
export function adapterChildHoles({ base, orient, bar = null, hostSide, hostThicknessMm,stockMm = 3, joint: jointSettings }) {
  if (!base || !orient) return [];
  const joint = orient.joint || {};
  const kind = jointKindOf(joint);
  const bracket = kind !== 'printed';
  const wallMm = finitePos(joint.wallMm) ? Number(joint.wallMm) : DEFAULT_WALL_MM;
  const K = jointSpec(kind, jointSettings);
  const n = bracket ? K.count : (Number.isInteger(joint.holesPerFlange) && joint.holesPerFlange > 0 ? joint.holesPerFlange : DEFAULT_HOLES_PER_FLANGE);
  // 子模組端的孔離轉角：列印版＝翼孔距；角碼＝短腳孔距（預設 6，由規格算出）。
  const flangeHole = bracket ? K.childHoleMm : wallMm + (ADAPTER_FLANGE_MM - wallMm) / 2;
  const hostThickness = finitePos(hostThicknessMm)?Number(hostThicknessMm):bar && finitePos(bar.stock && bar.stock.thicknessMm) ? Number(bar.stock.thicknessMm) : stockMm;
  const e = { x: Math.cos(orient.childAxisDeg * D2R), y: Math.sin(orient.childAxisDeg * D2R) };
  const f = { x: -e.y, y: e.x };
  // 子模組基準面在宿主板底面（side＝1）或頂面（side＝-1）；只有頂面側要跨過板厚。
  const side = hostSide === undefined ? orient.side : hostSide;
  const hostFace = kind === 'bracket-m3' ? (Number(side) < 0 ? hostThickness : 0) : hostThickness;
  if(bracket) {
    // Low-level configuration must not call layout/frame: moduleFrameEdges uses
    // these own holes while constructing that very frame (standing is separate).
    const E={...e,z:0},F={...f,z:0},Z={x:0,y:0,z:1};
    return Array.from({length:n},(_,k)=>buildBracketInstance({connectionId:'configuration',slotId:String(k),
      corner:{x:base.x+ADAPTER_LENGTH_MM*(k+.5)/n*e.x+hostFace*f.x,y:base.y+ADAPTER_LENGTH_MM*(k+.5)/n*e.y+hostFace*f.y,z:0},seamAxis:E,spec:K,
      wings:[{role:'host',runAxis:Z,contactNormal:F,lengthMm:K.longLegMm,holeOffsetMm:K.hostHoleMm,plateThicknessMm:hostThickness},
        {role:'child',runAxis:F,contactNormal:{x:0,y:0,z:-1},lengthMm:K.shortLegMm,holeOffsetMm:K.childHoleMm,plateThicknessMm:stockMm}]
    }).wings[1].plateHole.local).map(p=>({x:r3(p.x),y:r3(p.y)}));
  }
  const t = hostFace + flangeHole;
  return Array.from({ length: n }, (_, k) => {
    const s = ADAPTER_LENGTH_MM * (k + 0.5) / n;
    return { x: r3(base.x + s * e.x + t * f.x), y: r3(base.y + s * e.y + t * f.y) };
  });
}

// 單一模組的轉接座排版；不是「直角安裝」的模組回 null。
// 宿主可以是桿（hostHoles＝桿局部 u/v）、三角板的邊或機架板外框的邊（hostHoles＝世界平面 { x, y }，
// 在邊線中點往 d 方向 (offset + s) 處、往板內 flangeHole mm；板上的孔另附板局部 u/v，板會動時孔跟著板走）。
export function adapterLayout(comps, modules, moduleId, params, { stockMm = 3, joint: jointSettings } = {}) {
  const list = Array.isArray(comps) ? comps : [];
  const modList = Array.isArray(modules) ? modules : [];
  const mod = modList.find(m => m && m.id === moduleId);
  const orient = mod && mod.mount && mod.mount.orient;
  if (!orient || orient.type !== 'orthogonal') return null;
  const pts = pointCoords(list);
  // D2：宿主是已安裝模組的底板時，孔位要用底板的匯出（home）座標，所以用 home 姿態（不套目前位姿的剛體變換）。
  const edge = orthogonalHostEdge(list, modList, mod.mount, pts, params, { home: true, stockMm, joint: jointSettings });
  if (!edge) return null;
  const base = mod.base ? pts[mod.base] : null;
  if (!base && orient.edge !== 'child') return null;
  const barLength = edge.lengthMm;
  if (!(barLength > 0)) return null;
  const bar = edge.compId ? list.find(c => c && c.id === edge.compId) : null;

  const joint = orient.joint || {};
  const kind = jointKindOf(joint);
  const bracket = kind !== 'printed';
  const K = jointSpec(kind, jointSettings);
  const wallMm = finitePos(joint.wallMm) ? Number(joint.wallMm) : DEFAULT_WALL_MM;
  const n = bracket ? K.count : (Number.isInteger(joint.holesPerFlange) && joint.holesPerFlange > 0 ? joint.holesPerFlange : DEFAULT_HOLES_PER_FLANGE);
  const lengthMm = ADAPTER_LENGTH_MM, flangeMm = ADAPTER_FLANGE_MM;
  const side = Number(orient.side) < 0 ? -1 : 1;
  const offsetMm = Number.isFinite(Number(orient.offsetMm)) ? Number(orient.offsetMm) : 0;   // 沿桿滑動（從桿中點起算）
  // 列印版：翼孔距接合角＝壁厚＋(翼高−壁厚)/2（翼的外露段正中央）＝9；角碼：長腳孔（預設 9.5，宿主）、短腳孔（預設 6，子模組）。
  const flangeHole = bracket ? K.hostHoleMm : wallMm + (flangeMm - wallMm) / 2;
  const childHole = bracket ? K.childHoleMm : flangeHole;
  const barWidth = bar ? memberStock(bar).widthMm : 0;
  const ss = Array.from({ length: n }, (_, k) => lengthMm * (k + 0.5) / n);

  // D3：子模組立在宿主板面上（edge 'child'）：宿主孔在板面上、離邊 板厚＋flangeHole；壓在邊上則離邊 flangeHole（在板面的邊上）。
  const standing = orient.edge === 'child';
  const T = standing ? hostPlateThickness(list, edge, stockMm) : 0;
  const inset = standing ? T + flangeHole : flangeHole;
  let hostHoles;
  if(bracket)hostHoles=[];
  else if (edge.kind === 'bar') {
    hostHoles = ss.map(k => ({ u: r3(barLength / 2 + offsetMm + k), v: r3(side * (barWidth / 2 - inset)) }));
  } else {
    // 板／機架：邊線已是實際外緣；孔在中點 + (offset + s)·d、往板內 inset mm（−m）。
    const mid = { x: (edge.a.x + edge.b.x) / 2, y: (edge.a.y + edge.b.y) / 2 };
    const plateRef = edge.kind === 'triangle' && bar ? [bar.p1, bar.p2].map(p => pts[p.id]) : null;
    hostHoles = ss.map(k => {
      const x = mid.x + (offsetMm + k) * edge.d.x - edge.m.x * inset;
      const y = mid.y + (offsetMm + k) * edge.d.y - edge.m.y * inset;
      const h = { x: r3(x), y: r3(y) };
      const uv = plateRef ? worldToLocal(plateRef, { x, y }) : null;
      if (uv) { h.u = r3(uv.u); h.v = r3(uv.v); }
      return h;
    });
  }

  const layout = {
    moduleId,
    hostKind: edge.kind,
    hostCompId: edge.compId,
    hostPartName: edge.partName,
    stand: orient.edge === 'child' ? { face: orient.face === -1 ? -1 : 1 } : null,   // D3：立在板面上（1＝上面、-1＝下面）
    hostModuleId: edge.frameModule || null,   // D2：宿主是已安裝模組的底板時為該模組 id，世界機架為 null
    childPart: `${moduleId}-frame`,
    kind,
    lengthMm, wallMm, flangeMm,
    holeDiameterMm: ADAPTER_HOLE_MM,
    holesPerFlange: n,
    tiltDeg: Number(orient.tiltDeg) || 0,   // D4：兩翼夾角＝90°＋tiltDeg
    hostHoles,
    childHoles: bracket ? [] : standing ? standHoles(list, modList, mod, params, edge, ss, childHole, stockMm, jointSettings) : adapterChildHoles({ base, orient, bar, hostSide: edge.side, stockMm, joint: jointSettings }),
    // F1：角碼外形（寬、厚、兩腳長），給 3D 與說明用；列印版沒有
    bracket: bracket ? { widthMm: K.widthMm, thicknessMm: K.thicknessMm, longLegMm: K.longLegMm, shortLegMm: K.shortLegMm } : undefined
  };
  if(bracket) {
    if(Number(orient.tiltDeg))return {...layout,physical:[],diagnostics:[{status:'fail',code:'metal_bracket_tilt_unsupported',moduleId,reason:'金屬角碼只支援直角；傾斜接合請使用列印轉接座。'}]};
    const frame=orthogonalFrame(list,modList,moduleId,pts,params,{home:true,stockMm,joint:jointSettings});
    if(!frame)return null;
    const childT=frameStockOf(frameConnectorNodes(list.filter(c=>c.moduleId===moduleId))).thicknessMm || stockMm;
    layout.connectionId=`connection:${moduleId}`;layout.spec=K;layout.coordinateFrame=frame;
    try {
      const a=bar&&pts[bar.p1.id],b=bar&&pts[bar.p2.id],len=a&&b?Math.hypot(b.x-a.x,b.y-a.y):0;
      const dx=len?(b.x-a.x)/len:0,dy=len?(b.y-a.y)/len:0;
      const hostToLocal=len?{rotation:[[dx,dy,0],[-dy,dx,0],[0,0,1]],translation:{x:-a.x*dx-a.y*dy,y:a.x*dy-a.y*dx,z:0}}:null;
      layout.physical=buildOrientInstances(layout,frame,edge,hostPlateThickness(list,edge,stockMm),childT,hostToLocal);
      // Both drilling projections consume the shared contact-hole result once.
      layout.hostHoles=layout.physical.map(b=>{
        const h=b.wings[0].plateHole,p=h.center;
        const uv=bar?{u:h.local.x,v:h.local.y}:null;
        return {...h,axis:{x:0,y:0,z:1},x:r3(p.x),y:r3(p.y),...(uv?{u:r3(uv.u),v:r3(uv.v)}:{})};
      });
      layout.childHoles=layout.physical.map(b=>{const h=b.wings[1].plateHole;return {...h,axis:{x:0,y:0,z:1},x:r3(h.local.x),y:r3(h.local.y)};});
    }catch(error){layout.physical=[];layout.hostHoles=[];layout.childHoles=[];layout.diagnostics=[{status:'fail',code:'orient_fastener_invalid',moduleId,reason:error.message}];}
  }
  return layout;
}

const dot3=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const minus3=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const neg3=v=>({x:-v.x,y:-v.y,z:-v.z});
/** Configuration only: seam slots/contact frames delegate all solids to core. */
function buildOrientInstances(layout,frame,edge,hostT,childT,hostToLocal) {
  const {d,m,n,origin,base,e,f}=frame,K=layout.spec;
  const tFace=layout.stand?0:(n.z>0?hostT:0),sgn=edge?.d&&(d.x*edge.d.x+d.y*edge.d.y)<0?-1:1;
  const toChild={};
  toChild.rotation=['x','y'].map(k=>({x:e[k]*d.x+f[k]*n.x,y:e[k]*d.y+f[k]*n.y,z:e[k]*d.z+f[k]*n.z}));
  const rows=toChild.rotation;
  toChild.rotation=rows.map(r=>[r.x,r.y,r.z]);toChild.rotation.push([m.x,m.y,m.z]);
  toChild.translation={x:base.x-dot3(rows[0],origin),y:base.y-dot3(rows[1],origin),z:-dot3(m,origin)};
  return Array.from({length:layout.holesPerFlange},(_,k)=>{
    const s=sgn*layout.lengthMm*(k+.5)/layout.holesPerFlange;
    return buildBracketInstance({connectionId:layout.connectionId,slotId:String(k),seamAxis:d,spec:K,
      corner:{x:origin.x+s*d.x+tFace*n.x,y:origin.y+s*d.y+tFace*n.y,z:origin.z+s*d.z+tFace*n.z},
      wings:[{role:'host',partId:layout.hostCompId || layout.hostPartName,runAxis:neg3(m),contactNormal:n,lengthMm:K.longLegMm,holeOffsetMm:K.hostHoleMm,plateThicknessMm:hostT,plateToLocal:hostToLocal},
        {role:'child',partId:layout.childPart,runAxis:n,contactNormal:neg3(m),lengthMm:K.shortLegMm,holeOffsetMm:K.childHoleMm,plateThicknessMm:childT,plateToLocal:toChild}]});
  });
}

/** Saved home solids -> current host plane; no rebuilt geometry or hole math. */
export function poseAdapterPhysical(layout,frame,w0=0) {
  if(!layout?.physical?.length||!frame)return [];
  const home=layout.coordinateFrame;
  const vector=v=>{
    const s=dot3(v,home.d),w=dot3(v,home.m),t=dot3(v,home.n);
    return {x:s*frame.d.x+w*frame.m.x+t*frame.n.x,y:s*frame.d.y+w*frame.m.y+t*frame.n.y,z:s*frame.d.z+w*frame.m.z+t*frame.n.z};
  };
  const point=p=>{const v=vector(minus3(p,home.origin));return {x:frame.origin.x+v.x+w0*frame.m.x,y:frame.origin.y+v.y+w0*frame.m.y,z:frame.origin.z+v.z+w0*frame.m.z};};
  return layout.physical.map(b=>transformBracketInstance(b,point,vector));
}

// D3：立在板面時子模組底板上的孔：離站立邊 flangeHole mm、沿邊位置與宿主孔對齊（frame.d 與宿主邊 d 可能反向）。
function standHoles(list, modList, mod, params, edge, ss, childHole, stockMm, jointSettings) {
  // 用 home 姿態的宿主邊求 frame 即可：孔只和 base／e／f／d 的方向有關，不隨求解位姿變。
  const frame = orthogonalFrame(list, modList, mod.id, pointCoords(list), params, { home: true, stockMm, joint: jointSettings });
  return frame ? standChildHoles(frame, edge.d, ss, childHole) : [];
}

// 全部直角模組的匯出附加資料：桿件孔（linkHoles）、三角板孔（plateHoles，世界座標＋板局部 u/v）、
// 世界機架板孔（worldFrameNodes，不參與外框）、子模組底板的額外節點（frameNodes）、轉接座排版清單。
export function orthogonalExportExtras(comps, modules, params, opts = {}) {
  const linkHoles = {}, plateHoles = {}, frameNodes = {}, worldFrameNodes = [], adapters = [], extrasDiagnostics = [];
  (Array.isArray(modules) ? modules : []).forEach(m => {
    const a = m && m.mount && m.mount.orient ? adapterLayout(comps, modules, m.id, params, opts) : null;
    if (!a) {
      if(m?.mount?.orient&&jointKindOf(m.mount.orient.joint)==='bracket-m3')extrasDiagnostics.push({status:'fail',code:'orient_fastener_unavailable',moduleId:m.id,reason:'無法解析接合邊或固定板，角碼孔暫停輸出。'});
      return;
    }
    adapters.push(a);
    if(a.diagnostics)(extrasDiagnostics.push(...a.diagnostics));
    if(a.kind==='printed')extrasDiagnostics.push({status:'not_supported',code:'printed_adapter_material_bridge',kind:'printed-adapter',moduleId:m.id,sourceIds:[`connection:${m.id}`],reason:'列印轉接座的材料形狀尚未接入檢查。'});
    if (a.hostKind === 'bar') {
      (linkHoles[a.hostCompId] || (linkHoles[a.hostCompId] = []))
        .push(...a.hostHoles.map(h => ({ ...h, u: h.u, v: h.v, diameterMm: a.holeDiameterMm })));
    } else if (a.hostKind === 'triangle') {
      (plateHoles[a.hostCompId] || (plateHoles[a.hostCompId] = []))
        .push(...a.hostHoles.map(h => ({ ...h, x: h.x, y: h.y, u: h.u, v: h.v, diameterMm: a.holeDiameterMm })));
    } else {
      const hostNodes = a.hostHoles.map((h, k) => ({
        ...h, id: h.id || `ADP_${m.id}_h${k}`, x: h.x, y: h.y, holeDiameterMm: a.holeDiameterMm, holeLayer: ADAPTER_LAYER, outlineExempt: true
      }));
      // D2：宿主是已安裝模組的底板 → 孔進該模組的底板節點（匯出座標），否則進世界機架。
      if (a.hostModuleId) (frameNodes[a.hostModuleId] || (frameNodes[a.hostModuleId] = [])).push(...hostNodes);
      else worldFrameNodes.push(...hostNodes);
    }
    (frameNodes[m.id] || (frameNodes[m.id] = []))
      .push(...a.childHoles.map((h, k) => ({
        ...h, id: h.id || `ADP_${m.id}_${k}`, x: h.x, y: h.y, holeDiameterMm: a.holeDiameterMm, holeLayer: ADAPTER_LAYER,
        ...(a.stand ? { outlineExempt: true } : {})   // D3：站立邊就是外框的邊，孔不撐大外框
      })));
  });
  return appendFaceBracketHoles({ linkHoles, plateHoles, frameNodes, worldFrameNodes, adapters, diagnostics:extrasDiagnostics }, comps, modules, params, opts);
}

// 把轉接座孔節點併進模組底板節點（不改輸入）；extras 缺省或沒有該模組時原樣回傳。
export function withAdapterNodes(moduleId, nodes, extras) {
  const add = extras && extras.frameNodes && extras.frameNodes[moduleId];
  return add && add.length ? [...(nodes || []), ...add] : nodes;
}

// 把機架板宿主孔併進世界機架節點（不改輸入）；extras 缺省或沒有時原樣回傳。
export function withWorldAdapterNodes(nodes, extras) {
  const add = extras && extras.worldFrameNodes;
  return add && add.length ? [...(nodes || []), ...add] : nodes;
}

// F1：角碼的實體方塊（給 3D 畫）。回傳 []：模組不是直角安裝、接合件不是角碼、或找不到座標系。
// 每處兩片（count＝2，沿接合線 d 各在 s＝5、15 mm），每片兩翼各一塊薄板：
//   長腳貼宿主板面（沿 −m 從轉角往宿主板內伸 longLegMm），短腳貼子模組底板朝宿主那一面（沿 n 離開宿主面 shortLegMm）。
// 座標：宿主平面 mm，與 orthogonalFrame 同一套（origin＋s·d＋w·m＋t·n）；板厚方向的 z 以宿主板底面為 0，
// 3D 端再加上宿主本體的 z。共用盒體 axes:[接合線, 翼伸展方向, 接觸面外法線]，size:{ x:寬, y:腳長, z:厚 }。
// 宿主面：站立（D3）時板面就是 t＝0；一般安裝時 n 朝上（+z）則板面在板厚 T 處、朝下則在 0（子模組長向宿主的那一側）。
// G1：plan（buildPlan 的結果）給了就取子模組底板（<id>-frame）在子疊層的 zMm，短腳改貼在板的「朝宿主那一面」（w＝zMm），
// 兩腳在這個內轉角相接、整片角碼沿 m 跟著挪；沒給 plan 時底板在第 0 層（zMm＝0）。
export function bracketBoxes(comps, modules, moduleId, points, params, opts = {}) {
  return bracketPhysical(comps,modules,moduleId,points,params,opts).flatMap(b=>b.wings.map(w=>w.box));
}

export const BRACKET_SCREW_DIAMETER_MM = 3;
export const BRACKET_SCREW_HEAD_DIAMETER_MM = 5.5;
export const BRACKET_SCREW_HEAD_HEIGHT_MM = 2;

// G2：每一翼的方塊／螺牙孔／板外螺頭由共用實體核心產生；這裡只適配目前宿主平面姿態。
export function bracketPhysical(comps,modules,moduleId,points,params,opts={}) {
  const layout=opts.adapter || adapterLayout(comps,modules,moduleId,params,opts);
  if(!layout?.physical?.length)return [];
  const frame=orthogonalFrame(comps,modules,moduleId,points,params,opts);
  const plate=opts.plan?.parts?.find(p=>p.name===`${moduleId}-frame`);
  return poseAdapterPhysical(layout,frame,Number(plate?.zMm)||0);
}

// G2：M3 螺絲（每個角碼翼一支，一處兩片＝4 支）。從木板外側面（背對角碼的那一面）穿過木板、鎖進角碼螺牙，尖端略穿出角碼。
// head＝螺絲頭座在木板外側面上的點；tip＝head ＋ lengthMm 沿孔軸朝角碼。長度＝各翼實際板厚＋角碼厚，交共用核心向上取市售長度（3 mm 板＋1.2 → 6）。
// 回傳 []：模組不是直角安裝、接合件不是角碼、或找不到座標系。
export function bracketScrews(comps, modules, moduleId, points, params, opts = {}) {
  return bracketPhysical(comps,modules,moduleId,points,params,opts).flatMap(b=>b.wings.map(w=>w.screw));
}
