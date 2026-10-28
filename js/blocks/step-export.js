/**
 * blocks / step-export
 *
 * 專案 → 匯出 STEP：把板件（2D 外形＋孔＋挖空＋板厚）寫成 ISO 10303-21（AP214 AUTOMOTIVE_DESIGN）B-rep 實體，
 * 給 Solid Edge、Fusion 360 這類 CAD 開啟。自己寫的小寫入器，不用 WASM／CAD 核心；用到才動態載入，不在啟動載入圖內。
 *
 * 一片板 ＝ 一個 PRODUCT ＝ 一個以上的 MANIFOLD_SOLID_BREP（外形有多個分離島時每島一個實體）：
 *   上下平面（外迴圈＋孔與挖空的內迴圈）、直線外形邊的平面側面、圓孔的真圓柱面（CIRCLE 邊，接縫＝一條直線邊）。
 *   曲線外形（凸輪、圓角機架）在上游已是折線，這裡就是一段一段的平面。單位 mm。
 * 板在自己的零件座標：外形在 XY 平面、厚度沿 +Z（z 0…厚度）。擺放姿態寫成組立裡的零件位置（AXIS2_PLACEMENT_3D）。
 * 輸出可重現：沒有時間戳、沒有亂數，同樣輸入產生同一個檔案。
 *
 * 姿態矩陣（matrix）＝ 16 個數字、欄主序（column-major）：與 3D 場景的 part.pose.matrix、applyMatrix4 相同。
 *   [ux,uy,uz,0, vx,vy,vz,0, wx,wy,wz,0, tx,ty,tz,1]：零件的 +X、+Y、+Z 軸在世界裡的方向，平移在 [12]、[13]、[14]。
 *   只取旋轉＋平移（[3]、[7]、[11]、[15] 不看）；不接受鏡像（行列式為負）。
 */
import {materialCircleContour,normalizeMaterialVoids} from './material-voids.js';
import {FABRICATION_DEFAULTS} from './fabrication-profile.js';
import {assemblyWork} from './assembly-membership.js';
import {machineComps,machineModules} from './assembly-roles.js';
import {compsInFocus,designTabs,ROOT_TAB} from './design-focus.js';
import {normalizeProjectName} from './project-name.js';
import {compileAssembly,solveAssembly} from './assembly.js';
import {prepareConnectionWork} from './connection-work.js';
import {buildPartGeometryCatalog} from './part-geometry.js';
import {buildPreviewModelInputs} from './preview-model-inputs.js';
import {buildMaterialScene} from '../blocks3d/material-scene.js';
import {planeInputs} from '../blocks3d/orthogonal-3d.js';
import {computeBodyLayers} from '../blocks3d/scene-model.js';
import {motorPointIds,pointCoords} from './model.js';
import {motorTypeAt} from './motor-tools.js';
import {buildMotorMounts,buildMotorExportMounts} from './motor-mounts.js';
import {materialSolveValidity} from './material-pose-status.js';
import {DEFAULT_PLATE_RADIUS_WORLD} from './plate-geometry.js';
import {resolveSpacers} from './interference.js';
import {collectSceneIds,prepareRenderScene,markAllPlaneZlift} from './render-scene.js';
import {partLabel} from './part-labels.js';

// ---------- STEP 字串 ----------
/** 任意字串 → STEP 字串內容（不含外面的單引號）：' → ''、\ → \\，非 ASCII 用 \X2\…\X0\（UTF-16BE）／\X4\…\X0\。 */
export function encodeStepString(text) {
  let out='',run=null;
  const flush=()=>{if(!run)return;out+=`\\${run.kind}\\${run.hex}\\X0\\`;run=null;};
  for(const ch of String(text??'')) {
    const cp=ch.codePointAt(0);
    if(cp>=0x20&&cp<=0x7e) {flush();out+=ch==="'"?"''":ch==='\\'?'\\\\':ch;continue;}
    const kind=cp>0xffff?'X4':'X2',hex=cp.toString(16).toUpperCase().padStart(kind==='X4'?8:4,'0');
    if(run&&run.kind===kind)run.hex+=hex;else {flush();run={kind,hex};}
  }
  flush();return out;
}
/** STEP 字串內容 → 原字串（\X2\、\X4\、\X\、\S\ 與 '' 、\\）。 */
export function decodeStepString(text) {
  const s=String(text??'');let out='';
  for(let i=0;i<s.length;) {
    const rest=s.slice(i);let m;
    if((m=/^\\X2\\((?:[0-9A-Fa-f]{4})*)\\X0\\/.exec(rest))) {for(let k=0;k<m[1].length;k+=4)out+=String.fromCharCode(parseInt(m[1].slice(k,k+4),16));i+=m[0].length;}
    else if((m=/^\\X4\\((?:[0-9A-Fa-f]{8})*)\\X0\\/.exec(rest))) {for(let k=0;k<m[1].length;k+=8)out+=String.fromCodePoint(parseInt(m[1].slice(k,k+8),16));i+=m[0].length;}
    else if((m=/^\\X\\([0-9A-Fa-f]{2})/.exec(rest))) {out+=String.fromCharCode(parseInt(m[1],16));i+=m[0].length;}
    else if((m=/^\\S\\([\s\S])/.exec(rest))) {out+=String.fromCharCode(m[1].charCodeAt(0)+128);i+=m[0].length;}
    else if(rest.startsWith('\\\\')) {out+='\\';i+=2;}
    else if(rest.startsWith("''")) {out+="'";i+=2;}
    else {out+=s[i];i++;}
  }
  return out;
}
const str=t=>`'${encodeStepString(t)}'`;
/** STEP 實數：一定有小數點、不用科學記號，到 1e-6 mm。 */
function real(n) {
  const v=Math.round(Number(n)*1e6)/1e6;if(v===0)return '0.';
  let t=String(v);if(/e/i.test(t))t=v.toFixed(6).replace(/0+$/,'');
  return t.includes('.')?t:t+'.';
}
const tuple=a=>`(${a.map(real).join(',')})`;

// ---------- 2D 幾何 ----------
const TOL=1e-6;
const toXY=p=>Array.isArray(p)?{x:Number(p[0]),y:Number(p[1])}:{x:Number(p?.x),y:Number(p?.y)};
const signedArea=r=>r.reduce((a,p,i)=>{const q=r[(i+1)%r.length];return a+p.x*q.y-q.x*p.y;},0)/2;
/** 去掉連續重複點、閉合重複點與共線點；少於 3 點或面積近 0 → null。 */
function cleanRing(raw) {
  let pts=(raw||[]).map(toXY);
  if(pts.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null;
  const dedupe=l=>l.filter((p,i)=>{const q=l[(i+l.length-1)%l.length];return !(l.length>1&&Math.hypot(p.x-q.x,p.y-q.y)<TOL);});
  pts=dedupe(pts);
  for(let guard=0;guard<4&&pts.length>=3;guard++) {
    const keep=pts.filter((p,i)=>{
      const a=pts[(i+pts.length-1)%pts.length],b=pts[(i+1)%pts.length];
      const cross=(p.x-a.x)*(b.y-p.y)-(p.y-a.y)*(b.x-p.x),la=Math.hypot(p.x-a.x,p.y-a.y),lb=Math.hypot(b.x-p.x,b.y-p.y);
      const dot=(p.x-a.x)*(b.x-p.x)+(p.y-a.y)*(b.y-p.y);
      return !(Math.abs(cross)<=1e-9*Math.max(1,la*lb)&&dot>0);   // 直線上的點不另成一面
    });
    if(keep.length===pts.length)break;pts=keep;
  }
  if(pts.length<3||Math.abs(signedArea(pts))<1e-9)return null;
  return pts;
}
const inRing=(p,ring)=>{let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)hit=!hit;}return hit;};
const segDist=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy,t=l<1e-18?0:Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);};
const ringDist=(p,ring)=>Math.min(...ring.map((a,i)=>segDist(p,a,ring[(i+1)%ring.length])));
const side=(a,b,p)=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
const properCross=(a,b,c,d)=>side(a,b,c)*side(a,b,d)<-1e-12&&side(c,d,a)*side(c,d,b)<-1e-12;
const ringsCross=(r1,r2)=>r1.some((a,i)=>r2.some((c,j)=>properCross(a,r1[(i+1)%r1.length],c,r2[(j+1)%r2.length])));
const bbox=pts=>pts.reduce((b,p)=>({x0:Math.min(b.x0,p.x),x1:Math.max(b.x1,p.x),y0:Math.min(b.y0,p.y),y1:Math.max(b.y1,p.y)}),{x0:Infinity,x1:-Infinity,y0:Infinity,y1:-Infinity});

/**
 * 板件 → 島（每個外形一島）：{outer:ring(逆時針), voids:[{circle:{x,y,r}}|{ring(順時針)}]}。
 * 孔與挖空依所在的島分配；彼此重疊的孔／挖空先用 normalizeMaterialVoids 併成一個挖空。
 * 無法照實寫成實體的孔／挖空（碰到外形邊、超出外形）不寫，原因放進 warnings。
 */
export function plateIslands(part,warnings=[]) {
  const label=part?.name||'板件';
  const rawOutlines=Array.isArray(part?.outlines)&&part.outlines.length?part.outlines:part?.outline?[part.outline]:[];
  const rings=rawOutlines.map(cleanRing).filter(Boolean);
  if(!rings.length)throw Error(`「${label}」的外形不合理：至少要有 3 個不同的點且圍出面積。`);
  const islands=rings.map(r=>({outer:signedArea(r)<0?[...r].reverse():r,raw:[]}));
  const place=(p,entry,what)=>{
    const i=islands.findIndex(s=>inRing(p,s.outer));
    if(i<0){warnings.push(`「${label}」的${what}不在外形內，未寫入。`);return;}
    islands[i].raw.push(entry);
  };
  for(const h of part.holes||[]) {
    const r=Number(h.r??(h.diameter!=null?h.diameter/2:NaN)),c=toXY(h);
    if(!(r>0)||!Number.isFinite(c.x)||!Number.isFinite(c.y))continue;
    place(c,{circle:{x:c.x,y:c.y,r}},'孔');
  }
  for(const cut of part.cutouts||[]) {
    const ring=cleanRing(Array.isArray(cut)?cut:cut?.points);
    if(ring)place(ring[0],{points:ring},'挖空');
  }
  for(const s of islands) {
    const checked=[];
    for(const v of s.raw) {
      const ok=v.circle?inRing(v.circle,s.outer)&&ringDist(v.circle,s.outer)>=v.circle.r-1e-6&&ringDist(v.circle,s.outer)>1e-6
        :v.points.every(p=>inRing(p,s.outer))&&!ringsCross(v.points,s.outer);
      if(ok)checked.push(v);else warnings.push(`「${label}」有${v.circle?'孔':'挖空'}碰到外形邊或超出外形，未寫入。`);
    }
    s.voids=resolveVoids(checked,label);
    delete s.raw;
  }
  return islands;
}
function resolveVoids(voids,label) {
  const rows=voids.map(v=>v.circle?{circle:v.circle,points:materialCircleContour(v.circle,true)}:{points:v.points});
  const n=rows.length,group=rows.map((_,i)=>i),find=i=>{while(group[i]!==i){group[i]=group[group[i]];i=group[i];}return i;};
  const boxes=rows.map(r=>bbox(r.points));
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++) {
    const a=boxes[i],b=boxes[j];
    if(a.x1<b.x0-TOL||b.x1<a.x0-TOL||a.y1<b.y0-TOL||b.y1<a.y0-TOL)continue;
    let apart;try {const out=normalizeMaterialVoids([rows[i],rows[j]]);apart=out.length===2&&out[0]===rows[i]&&out[1]===rows[j];}catch(_) {apart=false;}
    if(!apart)group[find(i)]=find(j);
  }
  const result=[];
  for(const key of new Set(rows.map((_,i)=>find(i)))) {
    const members=rows.filter((_,i)=>find(i)===key);
    let out=members;
    if(members.length>1) {
      try {out=normalizeMaterialVoids(members);}
      catch(e) {throw Error(`「${label}」的孔與挖空互相重疊且無法合併（${e.message}）。`);}
    }
    for(const v of out) {
      if(v.circle){result.push({circle:v.circle});continue;}
      const ring=cleanRing(v.points);if(!ring)continue;
      result.push({ring:signedArea(ring)>0?[...ring].reverse():ring});
    }
  }
  return result;
}

// ---------- 實體寫入 ----------
class Entities {
  constructor(){this.lines=[];this.n=0;this.cache=new Map();}
  add(text){this.lines.push(`#${++this.n}=${text};`);return this.n;}
  once(text){let id=this.cache.get(text);if(!id){id=this.add(text);this.cache.set(text,id);}return id;}
  point(x,y,z){return this.once(`CARTESIAN_POINT('',${tuple([x,y,z])})`);}
  dir(x,y,z){return this.once(`DIRECTION('',${tuple([x,y,z])})`);}
  axis(loc,z,x){return this.once(`AXIS2_PLACEMENT_3D('',#${this.point(...loc)},#${this.dir(...z)},#${this.dir(...x)})`);}
  vertex(x,y,z){return this.add(`VERTEX_POINT('',#${this.point(x,y,z)})`);}
  line(loc,d,len){return this.add(`LINE('',#${this.point(...loc)},#${this.add(`VECTOR('',#${this.dir(...d)},${real(len)})`)})`);}
  edge(a,b,curve){return this.add(`EDGE_CURVE('',#${a},#${b},#${curve},.T.)`);}
  oriented(edge,forward){return this.add(`ORIENTED_EDGE('',*,*,#${edge},${forward?'.T.':'.F.'})`);}
}

/** 一個島 → MANIFOLD_SOLID_BREP（回 id）。島的座標是零件座標，z 0…t。 */
function addSolid(E,island,t,name) {
  const faces=[];
  // 迴圈清單：外形（逆時針）＋各孔（圓）／挖空（順時針）。
  const defs=[{poly:island.outer},...island.voids.map(v=>v.circle?{circle:v.circle}:{poly:v.ring})];
  const built=defs.map(def=>{
    if(def.circle) {
      const {x,y,r}=def.circle,vb=E.vertex(x+r,y,0),vt=E.vertex(x+r,y,t);
      const cb=E.edge(vb,vb,E.add(`CIRCLE('',#${E.axis([x,y,0],[0,0,1],[1,0,0])},${real(r)})`));
      const ct=E.edge(vt,vt,E.add(`CIRCLE('',#${E.axis([x,y,t],[0,0,1],[1,0,0])},${real(r)})`));
      const seam=E.edge(vb,vt,E.line([x+r,y,0],[0,0,1],t));
      return {circle:def.circle,cb,ct,seam};
    }
    const p=def.poly,n=p.length;
    const vb=p.map(q=>E.vertex(q.x,q.y,0)),vt=p.map(q=>E.vertex(q.x,q.y,t));
    const eb=[],et=[],ev=[],dirs=[];
    for(let k=0;k<n;k++) {
      const a=p[k],b=p[(k+1)%n],len=Math.hypot(b.x-a.x,b.y-a.y),d=[(b.x-a.x)/len,(b.y-a.y)/len,0];
      dirs.push(d);
      eb.push(E.edge(vb[k],vb[(k+1)%n],E.line([a.x,a.y,0],d,len)));
      et.push(E.edge(vt[k],vt[(k+1)%n],E.line([a.x,a.y,t],d,len)));
      ev.push(E.edge(vb[k],vt[k],E.line([a.x,a.y,0],[0,0,1],t)));
    }
    return {poly:p,eb,et,ev,dirs};
  });
  const bound=(loopEdges,index)=>E.add(`${index===0?'FACE_OUTER_BOUND':'FACE_BOUND'}('',#${E.add(`EDGE_LOOP('',(${loopEdges.map(id=>'#'+id).join(',')}))`)},.T.)`);
  // 上面（+Z）：外形逆時針、孔順時針，邊照原方向；下面（−Z）：迴圈整個反向。
  const planeTop=E.add(`PLANE('',#${E.axis([0,0,t],[0,0,1],[1,0,0])})`),planeBottom=E.add(`PLANE('',#${E.axis([0,0,0],[0,0,-1],[1,0,0])})`);
  const top=built.map((b,i)=>bound(b.circle?[E.oriented(b.ct,false)]:b.et.map(id=>E.oriented(id,true)),i));
  const bottom=built.map((b,i)=>bound(b.circle?[E.oriented(b.cb,true)]:[...b.eb].reverse().map(id=>E.oriented(id,false)),i));
  faces.push(E.add(`ADVANCED_FACE('',(${top.map(id=>'#'+id).join(',')}),#${planeTop},.T.)`));
  faces.push(E.add(`ADVANCED_FACE('',(${bottom.map(id=>'#'+id).join(',')}),#${planeBottom},.T.)`));
  for(const b of built) {
    if(b.circle) {
      const {x,y,r}=b.circle,cyl=E.add(`CYLINDRICAL_SURFACE('',#${E.axis([x,y,0],[0,0,1],[1,0,0])},${real(r)})`);
      const loop=[E.oriented(b.cb,false),E.oriented(b.seam,true),E.oriented(b.ct,true),E.oriented(b.seam,false)];
      faces.push(E.add(`ADVANCED_FACE('',(#${bound(loop,0)}),#${cyl},.F.)`));   // 材料外法線朝向軸心，與圓柱面自然法線相反
      continue;
    }
    const n=b.poly.length;
    for(let k=0;k<n;k++) {
      const a=b.poly[k],d=b.dirs[k],normal=[d[1],-d[0],0];   // 沿行進方向的右側＝離開材料
      const plane=E.add(`PLANE('',#${E.axis([a.x,a.y,0],normal,d)})`);
      const k1=(k+1)%n;
      const loop=[E.oriented(b.eb[k],true),E.oriented(b.ev[k1],true),E.oriented(b.et[k],false),E.oriented(b.ev[k],false)];
      faces.push(E.add(`ADVANCED_FACE('',(#${bound(loop,0)}),#${plane},.T.)`));
    }
  }
  const shell=E.add(`CLOSED_SHELL('',(${faces.map(id=>'#'+id).join(',')}))`);
  return E.add(`MANIFOLD_SOLID_BREP(${str(name)},#${shell})`);
}

const IDENTITY=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function readMatrix(m,label) {
  if(m==null)return IDENTITY;
  const a=Array.from(m);
  if(a.length!==16||a.some(v=>!Number.isFinite(Number(v))))throw Error(`「${label}」的姿態矩陣不合法（要 16 個數字）。`);
  return a.map(Number);
}
function placement(m,label) {
  const x=m.slice(0,3),y=m.slice(4,7),z=m.slice(8,11);
  const det=x[0]*(y[1]*z[2]-y[2]*z[1])-x[1]*(y[0]*z[2]-y[2]*z[0])+x[2]*(y[0]*z[1]-y[1]*z[0]);
  if(!(det>1e-9))throw Error(`「${label}」的姿態矩陣不是旋轉＋平移（行列式 ${real(det)}）。`);
  const unit=v=>{const l=Math.hypot(...v);return v.map(c=>c/l);};
  return {loc:[m[12],m[13],m[14]],z:unit(z),x:unit(x)};
}
const isIdentity=m=>m.every((v,i)=>Math.abs(v-IDENTITY[i])<1e-9);

/**
 * 板件清單 → STEP 檔案文字。
 * parts：[{name, outline:[{x,y}…] 或 outlines:[[…],…], holes:[{x,y,r}], cutouts:[[{x,y}…]|{points}], thicknessMm, matrix?}]
 *   matrix 欄主序 16 數字（見檔頭）。opts.name＝作品名；opts.warnings＝陣列，會收到「沒寫入的孔」等提醒。
 */
export function stepFromParts(parts,opts={}) {
  if(!Array.isArray(parts)||!parts.length)throw Error('沒有可匯出的板件。');
  const warnings=Array.isArray(opts.warnings)?opts.warnings:[];
  const projectName=String(opts.name||'機構積木');
  const E=new Entities();
  const ctxApp=E.add(`APPLICATION_CONTEXT('core data for automotive mechanical design processes')`);
  E.add(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#${ctxApp})`);
  const mech=E.add(`MECHANICAL_CONTEXT('none',#${ctxApp},'mechanical')`);
  const pdc=E.add(`PRODUCT_DEFINITION_CONTEXT('part definition',#${ctxApp},'design')`);
  const mm=E.add(`( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )`);
  const rad=E.add(`( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) )`);
  const sr=E.add(`( NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT() )`);
  const unc=E.add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-05),#${mm},'distance_accuracy_value','confusion accuracy')`);
  const ctx=E.add(`( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${unc})) GLOBAL_UNIT_ASSIGNED_CONTEXT((#${mm},#${rad},#${sr})) REPRESENTATION_CONTEXT('Context #1','3D Context with UNIT and UNCERTAINTY') )`);
  const product=(name,category)=>{
    const p=E.add(`PRODUCT(${str(name)},${str(name)},'',(#${mech}))`);
    E.add(`PRODUCT_RELATED_PRODUCT_CATEGORY('${category}','',(#${p}))`);
    const f=E.add(`PRODUCT_DEFINITION_FORMATION('','',#${p})`);
    const d=E.add(`PRODUCT_DEFINITION('design','',#${f},#${pdc})`);
    return {pd:d,pds:E.add(`PRODUCT_DEFINITION_SHAPE('','',#${d})`)};
  };
  const items=[];
  for(const [index,part] of parts.entries()) {
    const name=String(part?.name||`板件 ${index+1}`),t=Number(part?.thicknessMm);
    if(!(t>0))throw Error(`「${name}」的板厚不合理。`);
    const matrix=readMatrix(part.matrix,name),place=placement(matrix,name);
    const islands=plateIslands({...part,name},warnings);
    const {pd,pds}=product(name,'part');
    const origin=E.axis([0,0,0],[0,0,1],[1,0,0]);
    const solids=islands.map((island,i)=>addSolid(E,island,t,islands.length>1?`${name} (${i+1})`:name));
    const rep=E.add(`ADVANCED_BREP_SHAPE_REPRESENTATION(${str(name)},(#${origin},${solids.map(id=>'#'+id).join(',')}),#${ctx})`);
    E.add(`SHAPE_DEFINITION_REPRESENTATION(#${pds},#${rep})`);
    items.push({name,pd,rep,origin,place,matrix});
  }
  // 組立：單片且在原點就直接是零件；否則包一個以作品名為名的組立，零件各自帶姿態（零件定義放前面，檔案第一個 PRODUCT 一定是板）。
  if(!(items.length===1&&isIdentity(items[0].matrix))) {
    const {pd,pds}=product(projectName,'assembly');
    const asmOrigin=E.axis([0,0,0],[0,0,1],[1,0,0]);
    const placements=items.map(it=>E.axis(it.place.loc,it.place.z,it.place.x));
    const asmRep=E.add(`SHAPE_REPRESENTATION(${str(projectName)},(#${asmOrigin},${placements.map(id=>'#'+id).join(',')}),#${ctx})`);
    E.add(`SHAPE_DEFINITION_REPRESENTATION(#${pds},#${asmRep})`);
    items.forEach((it,i)=>{
      const nauo=E.add(`NEXT_ASSEMBLY_USAGE_OCCURRENCE(${str(String(i+1))},${str(it.name)},'',#${pd},#${it.pd},$)`);
      const link=E.add(`PRODUCT_DEFINITION_SHAPE('','',#${nauo})`);
      const idt=E.add(`ITEM_DEFINED_TRANSFORMATION('','',#${it.origin},#${placements[i]})`);
      const rel=E.add(`( REPRESENTATION_RELATIONSHIP('','',#${it.rep},#${asmRep}) REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION(#${idt}) SHAPE_REPRESENTATION_RELATIONSHIP() )`);
      E.add(`CONTEXT_DEPENDENT_SHAPE_REPRESENTATION(#${rel},#${link})`);
    });
  }
  const file=`${projectName.replace(/[\\/:*?"<>|]+/g,'_')}.step`;
  return ['ISO-10303-21;','HEADER;',
    `FILE_DESCRIPTION(('Blocks mechanism plates: B-rep solids, mm'),'2;1');`,
    `FILE_NAME(${str(file)},'1970-01-01T00:00:00',(''),(''),'blocks step-export','blocks.html','');`,
    `FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 3 1 1 1 }'));`,
    'ENDSEC;','DATA;',...E.lines,'ENDSEC;','END-ISO-10303-21;',''].join('\n');
}

// ---------- 整個作品 → 板件（用 app 畫 3D 的同一套材料場景） ----------
// 板件類才寫成實體；其餘（螺絲、螺母、墊片、角碼）是買的五金，只列在「未匯出」。
const PLATE_KINDS=new Set(['bar','triangle','gear','fusion','rack','frame','mounted-frame']);
const HARDWARE={screw:'螺絲',nut:'螺母',washer:'墊片','bracket-wing':'角碼翼片'};
const TYPE_WORD={syringe:'針筒',pulley:'皮帶輪／鏈輪',belt:'皮帶／鏈條',slider:'滑軌',cam:'凸輪',motor:'馬達',gear:'齒輪',rack:'齒條',workpiece:'工件',bar:'連桿',triangle:'板件'};
function motorWord(comps,id){const t=motorTypeAt(comps,id);return t==='mg995'?'MG995 伺服馬達':t==='n20'?'N20 減速馬達':'TT 馬達';}

/** 材料場景（照 push3DNow／面板的順序），回 {model,comps,modules,catalog,points,ids} 或 {invalid:原因}。 */
function sceneFromWork(work,{theta=0,motorAngles={}}) {
  const comps=structuredClone(work.comps||[]),modules=structuredClone(work.modules||[]);
  const params={...(work.topo?.params||work.params||{}),theta};
  const fabrication=structuredClone(work.fabrication||FABRICATION_DEFAULTS);
  const stockMm=Number(fabrication.cnc?.stockThicknessMm)||FABRICATION_DEFAULTS.cnc.stockThicknessMm;
  const exportSettings=fabrication.export||{},joint=fabrication.joint||FABRICATION_DEFAULTS.joint;
  const topo={...(work.topo||{}),params};
  const prepared=prepareConnectionWork(comps,modules,topo,{stockMm,exportSettings});
  const wmodules=prepared.modules,wparams=topo.params;
  const asm=compileAssembly(comps,wmodules,topo),sol=solveAssembly(asm,{thetaDeg:theta,motorAngles});
  const validity=materialSolveValidity(comps,sol);
  if(!validity.valid)return {invalid:validity.reason||'unsolved_pose'};
  const ids=motorPointIds(comps),groundIds=new Set(comps.flatMap(c=>[c.p1,c.p2,c.p3].filter(p=>p&&['fixed','motor'].includes(p.type)).map(p=>p.id)));
  const mounts=buildMotorMounts({motorIds:ids,groundIds,staticPoints:pointCoords(comps),comps,compiledSteps:prepared.compiled.steps,sliderMountInfo:()=>null,isHiddenSliderRailPoint:()=>false,motorTypeForCenter:id=>motorTypeAt(comps,id)});
  const exportMounts=buildMotorExportMounts({comps,pts:pointCoords(comps),motorCenterIds:ids,motorMounts:mounts,typeForCenter:id=>motorTypeAt(comps,id),ttSettings:fabrication.ttMount||FABRICATION_DEFAULTS.ttMount,mg995Settings:fabrication.mg995Mount||FABRICATION_DEFAULTS.mg995Mount});
  const catalog=buildPartGeometryCatalog({comps,modules:wmodules,params:wparams,fabrication,exportSettings,mounts:exportMounts});
  const sceneIds=collectSceneIds({compiled:prepared.compiled,comps,motorPointIds:ids});
  prepareRenderScene({compiled:prepared.compiled,comps,points:sol.points,frameGeometry:catalog.parts.frame||null,sceneIds,computeBodyLayers,motorAssemblyLayerForBody:()=>null,motorMounts:mounts});
  markAllPlaneZlift(prepared.compiled.visualization.links,prepared.compiled.visualization.polygons||[],comps);
  const inputs=buildPreviewModelInputs({comps,params:wparams,theta,links:prepared.compiled.visualization.links,polygons:prepared.compiled.visualization.polygons||[],points:sol.points,groundIds,motorCenterIds:ids,motorTypes:new Map([...ids].map(id=>[id,motorTypeAt(comps,id)])),motorMounts:mounts,
    sliderTravelStart:c=>c.travelStart||0,sliderTravelEnd:c=>c.travelEnd||100,sliderBodyLength:c=>c.bodyLen||60,rackBodyHeight:c=>c.bodyHeight||20,rackPhaseShift:()=>0,pulleyRadius:()=>32,pulleyPinRadius:()=>20});
  const args={comps,modules:wmodules,params:wparams,exportSettings:{...exportSettings,drive:fabrication.drive||FABRICATION_DEFAULTS.drive},cnc:fabrication.cnc,mounts:exportMounts,joint};
  const {plan}=resolveSpacers(args);
  const model=buildMaterialScene({comps,modules:wmodules,params:wparams,stockMm,exportSettings,joint,catalog,inputs:planeInputs(inputs,comps,wmodules,null),allPlanes:inputs,points:sol.points,asm,plan,hullR:DEFAULT_PLATE_RADIUS_WORLD,solveValidity:validity});
  return {model,comps,modules:wmodules,catalog,points:sol.points,ids};
}

function familyOf(modules,focus) {
  if(focus===ROOT_TAB)return [ROOT_TAB];
  const ids=new Set([focus]);
  for(let n=0;n<modules.length;n++)for(const m of modules) {
    const parent=m.mount?.to?.module;
    if(parent&&modules.some(x=>x.id===parent)&&(ids.has(m.id)||ids.has(parent))){ids.add(m.id);ids.add(parent);}
  }
  return [...ids];
}

/**
 * 作品 → STEP：{ok,text,parts:[{name,partId}],skipped:[名稱],warnings,message}。
 * work：{comps,modules,topo?|params,fabrication}（schema 正規化後的作品）；opts.theta 目前驅動角（度）、
 * opts.motorAngles 其他馬達角、opts.scope 'assembly'（預設，整個組立）或 'design'（只有 opts.focus 那個設計）、opts.name 作品名。
 */
export async function stepFromWork(work,opts={}) {
  const {theta=0,motorAngles={},scope='assembly',focus=ROOT_TAB,name}=opts;
  const fail=message=>({ok:false,text:'',parts:[],skipped:[],warnings:[],message});
  let ctxWork;
  try {
    const topo=work.topo||{params:work.params||{},assemblyMembers:work.assemblyMembers};
    const all={comps:work.comps||[],modules:work.modules||[]};
    if(scope==='design') {
      const family=new Set(familyOf(all.modules,focus));
      const tab=c=>all.modules.some(m=>m.id===c.moduleId)?c.moduleId:ROOT_TAB;
      ctxWork={comps:all.comps.filter(c=>family.has(tab(c))),modules:all.modules.filter(m=>family.has(m.id))};
    } else {
      const active=assemblyWork(all.comps,all.modules,topo);
      ctxWork={comps:machineComps(active.comps,active.modules),modules:machineModules(active.modules)};
    }
  } catch(e) {return fail(`整理作品失敗：${e.message}`);}
  if(!ctxWork.comps.length)return fail(scope==='design'?'這個設計沒有零件可匯出。':'沒有零件可匯出。');
  let scene;
  try {scene=sceneFromWork({...work,...ctxWork},{theta,motorAngles});}
  catch(e) {return fail(`建立 3D 材料場景失敗：${e.message}`);}
  if(scene.invalid)return fail('目前姿態無法求解，請先調整到機構可動的位置再匯出。');
  const {model,comps,modules}=scene;
  // 設計模式、裝在別的機構上的設計：形狀（含接合的榫槽、孔）取自組立場景，位置改放在它自己的平面上（拆掉安裝後的同一份設計）。
  const flatPoses=new Map();let flatFrame=null;
  const focusModule=scope==='design'?modules.find(m=>m.id===focus):null;
  if(focusModule?.mount) {
    try {
      const alone=sceneFromWork({...work,comps:comps.filter(c=>c.moduleId===focus),modules:[{...focusModule,mount:null}]},{theta,motorAngles});
      for(const part of alone.model?.materialParts||[]) {
        flatPoses.set(part.partId,part.pose.matrix);
        if(part.geometry.kind==='frame')flatFrame=part.pose.matrix;
      }
    } catch(_) {/* 退回組立位置 */}
  }
  const tabOf=moduleId=>moduleId&&modules.some(m=>m.id===moduleId)?moduleId:ROOT_TAB;
  const inScope=geometry=>scope!=='design'||tabOf(geometry.moduleId)===focus;
  const tabComps=scope==='design'?compsInFocus(comps,modules,focus):comps;
  const used=new Set(),skipped=[],stepParts=[],warnings=[];
  const nameFor=partId=>{
    const label=partLabel(partId,comps,modules),cut=label.lastIndexOf('的');
    const [owner,what]=cut>0?[label.slice(0,cut),label.slice(cut+1)]:[label,''];
    const frame=partId==='frame'||/-frame$/.test(partId);
    const base=frame||label===partId?label:what&&!owner.endsWith(what)?`${owner} ${what} ${partId}`:`${owner} ${partId}`;
    let candidate=base;for(let n=2;used.has(candidate);n++)candidate=`${base} (${n})`;
    used.add(candidate);return candidate;
  };
  const hardware={};
  for(const part of model.materialParts||[]) {
    const g=part.geometry;
    if(!inScope(g))continue;
    if(!PLATE_KINDS.has(g.kind)){if(g.kind!=='screw-head')hardware[g.kind]=(hardware[g.kind]||0)+1;continue;}
    if(!g.outlines?.length||!(g.thicknessMm>0)){skipped.push(`${nameFor(part.partId)}（沒有外形）`);continue;}
    const flat=flatPoses.get(part.partId)||(g.kind==='mounted-frame'?flatFrame:null);
    if(focusModule?.mount&&!flat)warnings.push(`「${part.partId}」找不到單獨擺放的位置，沿用組立位置。`);
    stepParts.push({name:nameFor(part.partId),partId:part.partId,outlines:g.outlines,holes:g.holes||[],cutouts:g.cutouts||[],thicknessMm:g.thicknessMm,matrix:flat||part.pose.matrix});
  }
  for(const [kind,count] of Object.entries(hardware))skipped.push(`${HARDWARE[kind]||kind} ×${count}`);
  const catalogIds=new Set(Object.values(scene.catalog.parts).flatMap(g=>g.sourceIds||[]));
  for(const c of tabComps) {
    if(c.type==='anchor'||catalogIds.has(c.id)||(c.type==='bar'&&c.barFusionRoot))continue;
    skipped.push(`${TYPE_WORD[c.type]||c.type} ${c.id}`);
  }
  for(const id of scene.ids||[]) {
    if(tabComps.some(c=>[c.p1,c.p2,c.p3].some(p=>p?.id===id)))skipped.push(`${motorWord(comps,id)} ${id}`);
  }
  for(const d of scene.catalog.diagnostics||[]) {
    if(d.code==='material_geometry_unavailable'&&d.sourceIds?.some(id=>tabComps.some(c=>c.id===id)))skipped.push(`${d.sourceIds.join('、')}（${d.reason||'幾何不可用'}）`);
  }
  const uniqueSkipped=[...new Set(skipped)];
  if(!stepParts.length)return {...fail('目前範圍沒有可匯出的板件。'),skipped:uniqueSkipped};
  let text;
  try {text=stepFromParts(stepParts,{name:name||'機構積木',warnings});}
  catch(e) {return fail(`寫入 STEP 失敗：${e.message}`);}
  const parts=stepParts.map(p=>({name:p.name,partId:p.partId}));
  const counted=[...warnings.reduce((m,w)=>m.set(w,(m.get(w)||0)+1),new Map())].map(([w,n])=>n>1?`${w.replace(/。$/,'')}（${n} 處）`:w);
  const brief=(list,max)=>list.length>max?`${list.slice(0,max).join('、')} …等 ${list.length} 項`:list.join('、');
  const message=`已匯出 ${parts.length} 片板`+(uniqueSkipped.length?`；未匯出：${brief(uniqueSkipped,5)}`:'')+(counted.length?`；注意：${brief(counted,2)}`:'');
  return {ok:true,text,parts,skipped:uniqueSkipped,warnings:counted,message};
}

/**
 * 專案 → 匯出 STEP 的按鈕動作（app.js 用到才載入）：S＝共享狀態、design＝是否設計模式、motorAngles＝各馬達目前角、notify＝畫面提示。
 * 設計＝目前焦點的設計；組立＝整個組立的目前姿態。下載「<作品名>.step」並提示片數與未匯出的東西。
 */
export async function exportStepFile({S,design,motorAngles,notify}) {
  if(!S.comps.length){notify('先放一個零件，再匯出 STEP');return;}
  const tabs=designTabs(S.comps,S.modules,{keepRoot:S.designFocus===ROOT_TAB,rootName:S.topo.rootDesignName});
  const title=normalizeProjectName(S.topo.projectName||(design?tabs.find(t=>t.id===S.designFocus)?.label:'')||'機構作品')||'機構作品';
  let result;
  try {result=await stepFromWork({comps:S.comps,modules:S.modules,topo:S.topo,fabrication:S.fabrication},{theta:S.theta,motorAngles,scope:design?'design':'assembly',focus:S.designFocus,name:title});}
  catch(e) {notify(`STEP 匯出失敗：${e.message}`,6000);return;}
  if(!result.ok){notify(`尚未匯出 STEP：${result.message}`,6000);return;}
  const file=`${title.replace(/[\\/:*?"<>|]+/g,'_')}.step`,a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([result.text],{type:'model/step;charset=utf-8'}));a.download=file;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  const more=design&&S.modules.length>1?'（只含目前設計；整個作品請切到組立）':'';
  notify(`${result.message}（已下載 ${file}）${more}`,Math.max(5000,Math.min(10000,result.message.length*90)));
}
