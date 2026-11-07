/** Three standard blanks, authored using existing bar/triangle components. */
import {holeSide} from '../core/local-holes.js';
export const BLANK_HOLE_LIMIT=128;
const span=n=>(n-1)*8,range=L=>{const a=Array.from({length:Math.floor(L/8)+1},(_,i)=>i*8);if(L-a.at(-1)>.00001){if(L-a.at(-1)<4)a.pop();a.push(L);}return a;};
export function blankGeometry(c,points){
 if(!c.standardBlank||c.type!=='triangle')return null;
 const[a,b,d]=points,L=Math.hypot(b.x-a.x,b.y-a.y),H=Math.hypot(d.x-a.x,d.y-a.y),m=8-(c.stock?.thicknessMm || 3)/2,w=c.standardBlank.armWidthMm || 2*m,sign=(b.x-a.x)*(d.y-a.y)-(b.y-a.y)*(d.x-a.x)<0?-1:1;
 const ring=c.standardBlank.kind==='l'?[[-m,-m],[L+m,-m],[L+m,w-m],[w-m,w-m],[w-m,H+m],[-m,H+m]]:[[-m,-m],[L+m,-m],[L+m,H+m],[-m,H+m]];
 const ux=(b.x-a.x)/L,uy=(b.y-a.y)/L;
 return ring.map(([u,v])=>({x:a.x+u*ux-v*uy*sign,y:a.y+u*uy+v*ux*sign}));
}
export function makeStandardBlank({kind='bar',columns=kind==='bar'?8:6,rows=4,armRows=1,lengthMm=span(columns),heightMm=span(rows),armWidthMm=span(armRows)+13,n=1,origin={x:0,y:0}}={}){
 const fail=message=>({ok:false,message});
 if(!['bar','plate','l'].includes(kind)||!Number.isFinite(lengthMm)||lengthMm<8||lengthMm>1000||kind!=='bar'&&(!Number.isFinite(heightMm)||heightMm<8||heightMm>1000))return fail('桿件至少2孔；板材至少2×2孔，尺寸需在8–1000 mm。');
 if(kind==='l'&&(!Number.isFinite(armWidthMm)||armWidthMm<13||armWidthMm>=Math.min(lengthMm,heightMm)+13))return fail('L型兩臂孔數必須大於臂寬孔列數。');
 const xs=range(lengthMm),ys=kind==='bar'?[0]:range(heightMm),cells=[];
 for(const v of ys)for(const u of xs)if(kind!=='l'||u<=armWidthMm-13+.001||v<=armWidthMm-13+.001)cells.push({u,v});
 if(cells.length>BLANK_HOLE_LIMIT)return fail(`每片最多${BLANK_HOLE_LIMIT}孔，請減少孔數。`);
 const id='Blank'+n,p=(key,u,v)=>({id:`${id}.${key}`,type:'floating',x:origin.x+u,y:origin.y+v}),a=p('A',0,0),b=p('B',lengthMm,0),d=p('C',0,heightMm),g=id+'.G',r1=id+'.H',r2=id+'.D';
 const c={id,type:kind==='bar'?'bar':'triangle',name:kind==='bar'?'孔格桿件':kind==='plate'?'矩形板材':'同平面L型件',p1:a,p2:b,stock:{widthMm:13,thicknessMm:3,material:'unspecified'},standardBlank:{kind,...(kind==='l'?{armWidthMm}:{})},color:kind==='bar'?'#3498db':'#27ae60',snapLength:false};
 const params={[g]:lengthMm};
 if(kind==='bar'){c.lenParam=g;c.fixedLen=true;c.isInput=false;}else{Object.assign(c,{p3:d,gParam:g,r1Param:r1,r2Param:r2,sign:1,shapeMode:kind==='l'?'polyline':'hull',...(kind==='l'?{vertices:[{solve:true,ref:'p2'},{solve:true,ref:'p1'},{solve:true,ref:'p3'}]}:{})});params[r1]=heightMm;params[r2]=Math.hypot(lengthMm,heightMm);if(kind==='plate')c.vertices=[{solve:true,ref:'p1'},{solve:true,ref:'p2'},{solve:true,ref:'p3'}];}
 const primary=[a,b,...(kind==='bar'?[]:[d])];
 c.holes=cells.filter(h=>!primary.some(p=>Math.hypot(p.x-origin.x-h.u,p.y-origin.y-h.v)<1e-6)).map(h=>({id:`${id}.H${h.u}_${h.v}`.replaceAll('.','_'),...h,type:'floating',diameter:3.2}));
 return {ok:true,comp:c,params,holeCount:cells.length};
}
export function resizeStandardBlank(c,params,axis,value,{comps=[]}={}){
 const g=c.type==='bar'?c.lenParam:c.gParam,L=Number(params[g]),H=Number(params[c.r1Param]),a=c.p1,b=c.p2,angle=Math.atan2(b.y-a.y,b.x-a.x);
 const next=makeStandardBlank({kind:c.standardBlank.kind,lengthMm:axis==='g'?value:L,heightMm:axis==='r1'?value:H,armWidthMm:axis==='arm'?value:c.standardBlank.armWidthMm,n:1,origin:{x:0,y:0}});if(!next.ok)return next;
 const out=structuredClone(c),raw=next.comp,keys=['p1','p2',...(c.type==='triangle'?['p3']:[])];
 for(const key of keys){const p=raw[key];out[key]={...c[key],x:a.x+p.x*Math.cos(angle)-p.y*Math.sin(angle)*holeSide(c),y:a.y+p.x*Math.sin(angle)+p.y*Math.cos(angle)*holeSide(c)};}
 const old=new Map((c.holes || []).map(h=>[`${h.u},${h.v}`,h]));
 out.holes=raw.holes.map(h=>({...h,...old.get(`${h.u},${h.v}`),id:old.get(`${h.u},${h.v}`)?.id||`${c.id}.H${h.u}_${h.v}`.replaceAll('.','_')}));out.standardBlank=raw.standardBlank;
 const patch={[g]:axis==='g'?value:L};if(c.type==='triangle'){patch[c.r1Param]=axis==='r1'?value:H;patch[c.r2Param]=Math.hypot(patch[g],patch[c.r1Param]);}
 const retained=new Set(out.holes.map(h=>h.id)),removed=(c.holes || []).filter(h=>!retained.has(h.id));
 if(removed.some(h=>h.type==='fixed'||comps.some(other=>other.id!==c.id&&(['p1','p2','p3','m1','m2'].some(k=>other[k]?.id===h.id)||other.holes?.some(q=>q.id===h.id)))))return {ok:false,message:'縮小會刪除已固定或已連接的孔，請先解除連接。'};
 return {ok:true,comp:out,params:patch};
}
