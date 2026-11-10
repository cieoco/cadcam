/** Three standard blanks, authored using existing bar/triangle components. */
import {holeSide,localHoles,holeWorld} from '../core/local-holes.js';
import {isHoleUsed} from './used-holes.js';
export const BLANK_HOLE_LIMIT=4096;
export const BLANK_SPAN_LIMIT=10000;
export const isStandardBar=c=>c?.type==='bar'&&c.standardBlank?.kind==='bar'&&c.shape!=='disk';
export const isOutputBlank=c=>c?.type==='bar'&&c.standardBlank?.kind==='bar'&&Number.isFinite(c.standardBlank.rearMm);
const span=n=>(n-1)*8,range=L=>{const a=Array.from({length:Math.floor(L/8)+1},(_,i)=>i*8);if(L-a.at(-1)>.00001){if(L-a.at(-1)<4)a.pop();a.push(L);}return a;};
// Fillet the existing right-angle perimeter without changing its bounding box or hole grid.
// Concave L corners add a small inside radius; thin edges cap adjacent tangencies.
export const BLANK_CORNER_RADIUS=3;
function roundedBlankRing(ring){
 const out=[];
 for(let i=0;i<ring.length;i++){
  const p=ring[i],prev=ring[(i+ring.length-1)%ring.length],next=ring[(i+1)%ring.length];
  const a=Math.hypot(prev[0]-p[0],prev[1]-p[1]),b=Math.hypot(next[0]-p[0],next[1]-p[1]);
  if(a<1e-8||b<1e-8)continue;
  const u=[(prev[0]-p[0])/a,(prev[1]-p[1])/a],v=[(next[0]-p[0])/b,(next[1]-p[1])/b],r=Math.min(BLANK_CORNER_RADIUS,a/2,b/2);
  const center=[p[0]+r*(u[0]+v[0]),p[1]+r*(u[1]+v[1])],start=Math.atan2(-v[1],-v[0]),turn=Math.atan2(-u[0]*v[1]+u[1]*v[0],0);
  for(let j=0;j<=8;j++){const t=start+turn*j/8;out.push([center[0]+r*Math.cos(t),center[1]+r*Math.sin(t)]);}
 }
 return out;
}
export function blankGeometry(c,points){
 if(isStandardBar(c)){const[a,b]=points,L=Math.hypot(b.x-a.x,b.y-a.y),ux=(b.x-a.x)/L,uy=(b.y-a.y)/L,w=(c.stock?.widthMm || 13)/2,m=isOutputBlank(c)?8-(c.stock?.thicknessMm || 3)/2:w,rear=c.standardBlank.rearMm || 0;return roundedBlankRing([[-rear-m,-w],[L+m,-w],[L+m,w],[-rear-m,w]]).map(([u,v])=>({x:a.x+u*ux-v*uy,y:a.y+u*uy+v*ux}));}
 if(!c.standardBlank||c.type!=='triangle')return null;
 const[a,b,d]=points,L=Math.hypot(b.x-a.x,b.y-a.y),H=Math.hypot(d.x-a.x,d.y-a.y),m=8-(c.stock?.thicknessMm || 3)/2,w=c.standardBlank.armWidthMm || 2*m,sign=(b.x-a.x)*(d.y-a.y)-(b.y-a.y)*(d.x-a.x)<0?-1:1;
 const ring=c.standardBlank.kind==='l'?[[-m,-m],[L+m,-m],[L+m,w-m],[w-m,w-m],[w-m,H+m],[-m,H+m]]:[[-m,-m],[L+m,-m],[L+m,H+m],[-m,H+m]];
 const ux=(b.x-a.x)/L,uy=(b.y-a.y)/L;
 return roundedBlankRing(ring).map(([u,v])=>({x:a.x+u*ux-v*uy*sign,y:a.y+u*uy+v*ux*sign}));
}
export function makeStandardBlank({kind='bar',columns=kind==='bar'?8:6,rows=4,armRows=1,lengthMm=span(columns),heightMm=span(rows),armWidthMm=span(armRows)+13,rearMm=null,widthMm=13,n=1,origin={x:0,y:0}}={}){
 if(!origin||![origin.x,origin.y].every(Number.isFinite))return {ok:false,message:'位置請填有效的 X、Y 座標。'};
 const fail=message=>({ok:false,message});
 if(!['bar','plate','l'].includes(kind)||!Number.isFinite(lengthMm)||lengthMm<8||lengthMm>BLANK_SPAN_LIMIT||kind!=='bar'&&(!Number.isFinite(heightMm)||heightMm<8||heightMm>BLANK_SPAN_LIMIT))return fail('桿件至少2孔；板材至少2×2孔，尺寸需在8–10000 mm。');
 if(kind==='l'&&(!Number.isFinite(armWidthMm)||armWidthMm<13||armWidthMm>=Math.min(lengthMm,heightMm)+13))return fail('L型兩臂孔數必須大於臂寬孔列數。');
 const output=kind==='bar'&&rearMm!==null;if(output&&(!Number.isFinite(rearMm)||rearMm<0||rearMm>1000||!Number.isFinite(widthMm)||widthMm<13||widthMm>120))return fail('輸出板寬需13–120 mm，軸後材料需0–1000 mm。');
 const xs=range(lengthMm),rowsOut=output?Math.floor((widthMm-13)/16):0,ys=kind==='bar'?Array.from({length:2*rowsOut+1},(_,i)=>(i-rowsOut)*8):range(heightMm),cells=[];if(output)for(let u=-8;u>=-rearMm-.00001;u-=8)xs.unshift(u);
 for(const v of ys)for(const u of xs)if(kind!=='l'||u<=armWidthMm-13+.001||v<=armWidthMm-13+.001){cells.push({u,v});if(cells.length>BLANK_HOLE_LIMIT)return fail(`格孔超過${BLANK_HOLE_LIMIT}個，請分成數片板材，避免瀏覽器負擔過大。`);}
 if(cells.length>BLANK_HOLE_LIMIT)return fail(`每片最多${BLANK_HOLE_LIMIT}孔，請減少孔數。`);
 const id='Blank'+n,p=(key,u,v)=>({id:`${id}.${key}`,type:'floating',x:origin.x+u,y:origin.y+v}),a=p('A',0,0),b=p('B',lengthMm,0),d=p('C',0,heightMm),g=id+'.G',r1=id+'.H',r2=id+'.D';
 const c={id,type:kind==='bar'?'bar':'triangle',name:kind==='bar'?'孔格桿件':kind==='plate'?'矩形板材':'同平面L型件',p1:a,p2:b,stock:{widthMm:output?widthMm:13,thicknessMm:3,material:'unspecified'},standardBlank:{kind,...(output?{rearMm}:{}),...(kind==='l'?{armWidthMm}:{})},color:kind==='bar'?'#3498db':'#27ae60',snapLength:false};
 const params={[g]:lengthMm};
 if(kind==='bar'){c.lenParam=g;c.fixedLen=true;c.isInput=false;}else{Object.assign(c,{p3:d,gParam:g,r1Param:r1,r2Param:r2,sign:1,shapeMode:kind==='l'?'polyline':'hull',...(kind==='l'?{vertices:[{solve:true,ref:'p2'},{solve:true,ref:'p1'},{solve:true,ref:'p3'}]}:{})});params[r1]=heightMm;params[r2]=Math.hypot(lengthMm,heightMm);if(kind==='plate')c.vertices=[{solve:true,ref:'p1'},{solve:true,ref:'p2'},{solve:true,ref:'p3'}];}
 const primary=[a,b,...(kind==='bar'?[]:[d])];
 c.holes=cells.filter(h=>!primary.some(p=>Math.hypot(p.x-origin.x-h.u,p.y-origin.y-h.v)<1e-6)).map(h=>({id:`${id}.H${h.u}_${h.v}`.replaceAll('.','_'),...h,type:'floating',diameter:3.2}));
 return {ok:true,comp:c,params,holeCount:cells.length};
}
export function resizeStandardBlank(c,params,axis,value,{comps=[],modules=[]}={}){
 const g=c.type==='bar'?c.lenParam:c.gParam,L=Number(params[g]),H=Number(params[c.r1Param]),a=c.p1,b=c.p2,angle=Math.atan2(b.y-a.y,b.x-a.x);
 const next=makeStandardBlank({kind:c.standardBlank.kind,lengthMm:axis==='g'?value:L,heightMm:axis==='r1'?value:H,armWidthMm:axis==='arm'?value:c.standardBlank.armWidthMm,...(isOutputBlank(c)?{rearMm:c.standardBlank.rearMm,widthMm:axis==='width'?value:c.stock.widthMm}:{}),n:1,origin:{x:0,y:0}});if(!next.ok)return next;
 const out=structuredClone(c),raw=next.comp,keys=['p1','p2',...(c.type==='triangle'?['p3']:[])];
 for(const key of keys){const p=raw[key];out[key]={...c[key],x:a.x+p.x*Math.cos(angle)-p.y*Math.sin(angle)*holeSide(c),y:a.y+p.x*Math.sin(angle)+p.y*Math.cos(angle)*holeSide(c)};}
 // Keep a grounded end in place.
 if(c.type==='bar'&&c.p2.type==='fixed'&&c.p1.type!=='fixed'){const dx=b.x-out.p2.x,dy=b.y-out.p2.y;for(const key of keys)Object.assign(out[key],{x:out[key].x+dx,y:out[key].y+dy});}
 // A fixed end that another body shares cannot be moved by a resize: that body would silently lose its own length.
 const dragged=keys.find(k=>c[k].type==='fixed'&&Math.hypot(out[k].x-c[k].x,out[k].y-c[k].y)>1e-6&&comps.some(o=>o.id!==c.id&&['bar','triangle'].includes(o.type)&&['p1','p2','p3'].some(j=>o[j]?.id===c[k].id)));
 if(dragged)return {ok:false,message:`改這個尺寸會移動固定孔，而它同時連著其他零件；請先移動機架固定孔或解除連接，再改「${c.name||c.id}」的尺寸。`};
 // An end joined at another part's hole stays on that hole; a resize never drags the hole's copy away from it.
 for(const key of keys)for(const o of comps)if(o.id!==c.id){const h=[...localHoles(o),...(o.standardBlank?.mountHoles||[])].find(h=>h.id===out[key].id);if(h)Object.assign(out[key],holeWorld(o,h));}
 const originalHoles=[...(c.holes || []),...(c.standardBlank.mountHoles || [])],old=new Map(originalHoles.map(h=>[`${h.u},${h.v}`,h]));
 out.holes=raw.holes.map(h=>({...h,...old.get(`${h.u},${h.v}`),id:old.get(`${h.u},${h.v}`)?.id||`${c.id}.H${h.u}_${h.v}`.replaceAll('.','_')}));out.standardBlank={...raw.standardBlank,...(c.standardBlank.drill==='all'?{drill:'all'}:{})};if(isOutputBlank(c)&&axis==='width')out.stock.widthMm=value;
 const patch={[g]:axis==='g'?value:L};if(c.type==='triangle'){patch[c.r1Param]=axis==='r1'?value:H;patch[c.r2Param]=Math.hypot(patch[g],patch[c.r1Param]);}
 const retained=new Set(out.holes.map(h=>h.id)),removed=originalHoles.filter(h=>!retained.has(h.id));
 const lost=removed.find(h=>isHoleUsed(c,h,comps,{params,modules}));
 if(lost)return {ok:false,message:`縮小會移除「${c.name||c.id}」${c.type==='bar'?'':`長向第${lost.u/8+1}、直向`}第${(c.type==='bar'?lost.u:lost.v)/8+1}孔，但這孔已固定或有零件連接；請先解除該孔的連接，或改用較多孔數。`};
 // Parts joined at this body's holes follow the holes that moved; a fixed one cannot follow, so the resize is refused.
 const follow=[];
 for(const h of [...out.holes,...(out.standardBlank.mountHoles||[])]){
  const was=originalHoles.find(x=>x.id===h.id);if(!was)continue;
  const w=holeWorld(out,h),w0=holeWorld(c,was);if(Math.hypot(w.x-w0.x,w.y-w0.y)<0.01)continue;
  const joined=comps.flatMap(o=>o.id===c.id?[]:['p1','p2','p3'].map(k=>o[k]).filter(p=>p?.id===h.id));
  if(h.type==='fixed'||joined.some(p=>p.type==='fixed'||p.type==='motor'))return {ok:false,message:`改這個尺寸會移動固定在「${c.name||c.id}」孔上的零件；請先解除固定，或改用不會移動該孔的尺寸。`};
  if(joined.length)follow.push({id:h.id,...w});
 }
 return {ok:true,comp:out,params:patch,follow};
}

/** Fixed preset: solver endpoints remain the shaft and working hole. */
export function convertStandardOutput(c,params,comps=[]){
 if(c?.type!=='bar'||!c.isInput||!['mg995','tt','n20'].includes(c.motorType || 'tt')||c.barFusionRoot||c.shape||c.boxPanel||(c.holes || []).some(h=>!Number.isFinite(h.u)||!Number.isFinite(h.v)))return {ok:false,message:'請選一般馬達輸出桿；特殊孔或合成件需先保留原接法。'};
 if(isOutputBlank(c))return {ok:true,comp:structuredClone(c),params:{}};
 const center=c.motorMount?.center || [c.p1,c.p2].find(p=>p.physicalMotor)?.id || c.p1.id;if(center!==c.p1.id)return {ok:false,message:'這個預設目前支援第一端作軸心；第二端驅動請保留原接法。'};
 const draft=structuredClone(c);draft.standardBlank={kind:'bar',rearMm:8};draft.stock={...draft.stock,widthMm:29,thicknessMm:c.stock?.thicknessMm || 3,material:c.stock?.material || 'unspecified'};draft.name='格孔輸出板';return resizeStandardBlank(draft,params,'g',params[c.lenParam],{comps});
}
/** Examples: an on-lattice plain bar becomes standard; only faded lattice holes are added. */
export function blockifyBars(s){const C=s.comps,o={modules:s.modules,params:s.params};for(const c of C){const L=s.params[c.lenParam],h=c.holes||[],q=[c.p1,c.p2,...h];if(c.type!='bar'||c.isInput||c.standardBlank||c.shape||c.barFusion||c.barFusionRoot||c.boxPanel||c.motorMountPoint||(c.stock?.widthMm??13)!=13||!(L>0)||L%8||C.some(d=>[d.motorCarrier,d.motorMount?.frameBody,d.a?.componentId,d.b?.componentId].includes(c.id))||h.some(h=>h.v||h.u%8||h.u<=0||h.u>=L)||q.filter(p=>/^(fixed|motor|linear)$/.test(p.type)).length>1||q.some(p=>!isHoleUsed(c,p,C,o)||!isHoleUsed(c,p,C)))continue;c.standardBlank={kind:'bar'};c.holes=range(L).slice(1,-1).map(u=>h.find(h=>h.u==u)||{id:c.id+'_H'+u+'_0',u,v:0,type:'floating',diameter:3.2});}}
