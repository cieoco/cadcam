// 鏈輪＋#25 鏈條 S3：匯出的機架板有從動輪張緊長孔（沒有圓孔）、製作包有鏈條段落、3D 有鏈輪與鏈條。
// 走與 app 匯出相同的函式：prepareScopedExport（SVG／DXF 匯出）、buildPlan＋buildPackHtml＋addChainToBuildPack（製作包）。
import assert from 'node:assert/strict';
import {register} from 'node:module';
register('data:text/javascript,'+encodeURIComponent(`export function resolve(s,c,next){return next(s==='three'?${JSON.stringify(new URL('../js/vendor/three.module.js',import.meta.url).href)}:s,c);}`),import.meta.url);
const {normalizeSnapshot}=await import('../js/blocks/schema.js');
const {BLOCK_EXAMPLES}=await import('../js/blocks/examples.js');
const {prepareScopedExport}=await import('../js/blocks/export-scope.js');
const {FABRICATION_DEFAULTS}=await import('../js/blocks/fabrication-profile.js');
const {buildPlan,buildPackHtml,deriveMotorMounts}=await import('../js/blocks/build-plan.js');
const {chainAxleSlot,addChainToBuildPack}=await import('../js/blocks/chain-manufacturing.js');
const {buildSceneModel}=await import('../js/blocks3d/scene-model.js');
let pass=0;const ok=(c,m)=>{assert.ok(c,m);pass++;console.log('PASS',m);};
const near=(a,b,t)=>Math.abs(a-b)<=t;

const example=BLOCK_EXAMPLES.find(e=>e.id==='sprocket-chain');
const s=normalizeSnapshot(example.snapshot);
const chain=s.comps.find(c=>c.kind==='chain');
const slot=chainAxleSlot(s.comps,s.params,chain.id,{holeDiameterMm:FABRICATION_DEFAULTS.export.frameHoleDiameterMm});
const source={...s,topo:s,fabrication:structuredClone(FABRICATION_DEFAULTS),exportSettings:FABRICATION_DEFAULTS.export};

// ---------- SVG／DXF 機架板 ----------
const svgOut=prepareScopedExport(source,{scope:'assembly'},'svg');
const frameSvg=svgOut.files.find(f=>f.name==='frame.svg');
ok(frameSvg,'匯出有機架板 frame.svg');
const pathsOf=text=>[...text.matchAll(/<path d="([^"]+)"([^>]*)\/>/g)].map(m=>({pts:[...m[1].matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map(x=>({x:+x[1],y:+x[2]})),attrs:m[2]}));
const slotPath=pathsOf(frameSvg.text).find(p=>/AXLE_SLOT/.test(p.attrs));
ok(slotPath&&slotPath.pts.length>=20,'機架板 SVG 有 AXLE_SLOT 長孔外形');
function describe(pts){
  let best=[0,0,0];
  for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++){const d=Math.hypot(pts[i].x-pts[j].x,pts[i].y-pts[j].y);if(d>best[0])best=[d,i,j];}
  const [len,i,j]=best;
  return {length:len,dir:{x:(pts[j].x-pts[i].x)/len,y:(pts[j].y-pts[i].y)/len},center:{x:(pts[i].x+pts[j].x)/2,y:(pts[i].y+pts[j].y)/2}};
}
const d=describe(slotPath.pts);
ok(near(d.length,slot.lengthMm,0.1),`長孔長度 ${d.length.toFixed(2)} mm ＝ 2×½節＋孔寬 ${slot.lengthMm.toFixed(2)} mm`);
ok(near(d.center.x,slot.center.x,0.05)&&near(d.center.y,slot.center.y,0.05),'長孔中心在從動鏈輪軸心');
ok(Math.abs(d.dir.x*slot.dir.x+d.dir.y*slot.dir.y)>0.9999,'長孔方向沿兩輪中心連線');
const circles=[...frameSvg.text.matchAll(/<circle[^>]*cx="(-?[\d.]+)"[^>]*cy="(-?[\d.]+)"/g)].map(m=>({x:+m[1],y:+m[2]}));
ok(circles.length>0&&!circles.some(c=>Math.hypot(c.x-slot.center.x,c.y-slot.center.y)<slot.lengthMm/2),'長孔範圍內沒有圓孔（其他孔照舊）');
// 長孔寬度＝機架固定孔徑
const across=slotPath.pts.map(p=>Math.abs((p.x-d.center.x)*-d.dir.y+(p.y-d.center.y)*d.dir.x));
ok(near(Math.max(...across)*2,FABRICATION_DEFAULTS.export.frameHoleDiameterMm,0.01),'長孔寬度＝機架固定孔徑');

const dxfOut=prepareScopedExport(source,{scope:'assembly'},'dxf');
const frameDxf=dxfOut.files.find(f=>f.name==='frame.dxf').text;
ok(/AXLE_SLOT/.test(frameDxf),'機架板 DXF 有 AXLE_SLOT 圖層');
const ents=frameDxf.split('\n');const circleAt=[];
for(let i=0;i<ents.length;i++)if(ents[i]==='CIRCLE'){let x,y;for(let k=i;k<i+14;k++){if(ents[k]==='10')x=+ents[k+1];if(ents[k]==='20')y=+ents[k+1];}circleAt.push({x,y});}
ok(circleAt.length>0&&!circleAt.some(c=>Math.hypot(c.x-slot.center.x,c.y-slot.center.y)<slot.lengthMm/2),'DXF 長孔位置沒有圓孔');
ok(![...svgOut.notices,...svgOut.warnings].some(w=>/未提供獨立板材檔|Sprocket|Chain/.test(w)),'鏈輪、鏈條是買現成的：不出「未提供板材檔」提醒');
ok(!svgOut.files.some(f=>/Sprocket|Chain/.test(f.name)),'不輸出鏈輪齒形加工檔');

// ---------- 製作包 ----------
const cnc=FABRICATION_DEFAULTS.cnc;
const plan=buildPlan({comps:s.comps,modules:[],params:s.params,exportSettings:FABRICATION_DEFAULTS.export,cnc,mounts:deriveMotorMounts(s.comps)});
const base=buildPackHtml(plan,{title:'鏈輪測試',cnc,warnings:[],comps:s.comps});
const html=addChainToBuildPack(base,s.comps,s.params,{holeDiameterMm:FABRICATION_DEFAULTS.export.frameHoleDiameterMm});
ok(!/鏈輪與鏈條/.test(base)&&/鏈輪與鏈條/.test(html),'製作包加上鏈輪與鏈條段落');
ok(new RegExp(`${chain.links}\\s*節`).test(html)&&/12\s*齒/.test(html)&&/24\s*齒/.test(html)&&/張緊/.test(html),'段落列出節數、齒數與張緊說明');
ok(html.indexOf('鏈輪與鏈條')<html.indexOf('CNC 注意事項'),'段落放在 CNC 注意事項之前');
ok(addChainToBuildPack(base,s.comps.filter(c=>c.type!=='belt'),s.params)===base,'沒有鏈傳動時製作包不變');

// ---------- 3D ----------
const THREE=await import('../js/vendor/three.module.js');
const {createViewer}=await import('../js/blocks3d/viewer.js');
const spr=s.comps.filter(c=>c.kind==='sprocket'),pulleys=spr.map(c=>({id:c.id,center:c.p1.id,pin:c.p2.id,radius:s.params[c.radiusParam],pinRadius:c.pinRadius,color:c.color,kind:c.kind,teeth:c.teeth}));
const pts={};spr.forEach(c=>{pts[c.p1.id]={...c.p1};pts[c.p2.id]={...c.p2};});
const model=buildSceneModel([],pts,{pulleys,belts:[{id:chain.id,driver:chain.driver,driven:chain.driven,color:chain.color,kind:'chain',links:chain.links}]});
ok(model.pulleys.every(p=>p.kind==='sprocket'&&p.teeth>0)&&model.belts[0].kind==='chain'&&model.belts[0].links===chain.links,'3D 場景模型帶著鏈輪齒數與鏈節數');
const el=()=>({style:{},children:[],clientWidth:800,clientHeight:600,appendChild(o){this.children.push(o);o.parentNode=this;},removeChild(o){this.children=this.children.filter(v=>v!==o);},remove(){this.parentNode?.removeChild(this);},addEventListener(){},removeEventListener(){},getBoundingClientRect(){return {left:0,top:0,width:800,height:600};}});
globalThis.window={devicePixelRatio:1,innerWidth:800,innerHeight:600,addEventListener(){},removeEventListener(){}};globalThis.document={createElement:el};
globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
let scene;
const renderer={domElement:el(),setPixelRatio(){},setSize(){},render(sc){scene=sc;},dispose(){}};
const viewer=createViewer(el(),{rendererFactory:()=>renderer,controlsFactory:()=>({target:new THREE.Vector3(),update(){},dispose(){},addEventListener(){}})});
viewer.update(model);
const dynamic=scene.children.find(g=>g.isGroup);
const meshes=[];dynamic.traverse(o=>{if(o.isMesh)meshes.push(o);});
const instanced=meshes.filter(m=>m.isInstancedMesh);
ok(instanced.length===2&&instanced.some(m=>m.count===chain.links)&&instanced.some(m=>m.count===chain.links*2),`鏈條 3D：${chain.links} 個滾子＋${chain.links*2} 片鏈板`);
const discs=meshes.filter(m=>!m.isInstancedMesh&&m.geometry.type==='ExtrudeGeometry');
ok(discs.length===2&&discs.every(m=>{m.geometry.computeBoundingBox();const b=m.geometry.boundingBox;return near(b.max.z-b.min.z,2.8,1e-6);}),'鏈輪 3D：兩片厚 2.8 mm 的齒盤');
const OD=spr.map(c=>2*Math.max(...discs.find((m,i)=>i===spr.indexOf(c)).geometry.attributes.position.array.filter((_,i)=>i%3<2).map(Math.abs)));
ok(OD.every((v,i)=>v>pulleys[i].radius*2&&v<pulleys[i].radius*2+6.35),'鏈輪外徑略大於節圓（齒尖）');
// 一般皮帶輪不變：沒有 kind 的皮帶輪仍是原本的圓盤＋溝
const plain=buildSceneModel([],pts,{pulleys:pulleys.map(p=>({...p,kind:undefined,teeth:undefined})),belts:[{id:'B',driver:spr[0].id,driven:spr[1].id}]});
viewer.update(plain);
const plainMeshes=[];scene.children.find(g=>g.isGroup).traverse(o=>{if(o.isMesh)plainMeshes.push(o);});
ok(!plainMeshes.some(m=>m.isInstancedMesh)&&plainMeshes.some(m=>m.geometry.type==='TorusGeometry'),'一般皮帶輪與皮帶的 3D 維持原樣');
console.log(`chain-fab-export: ${pass} passed`);
process.exit(0);
