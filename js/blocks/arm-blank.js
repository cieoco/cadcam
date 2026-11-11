/** 彎桿／多臂件（standardBlank.kind 'arms'）：建立、改孔數與夾角、聯集外形。按需載入；載入時填入 standard-blank.js 的 ARMS。 */
import {ARMS,armsValid} from './standard-blank.js';
import {holeSide,holeWorld} from '../core/local-holes.js';
import {isHoleUsed} from './used-holes.js';
export const ARM_PITCH=8,ARM_MIN_GAP_DEG=15,ARM_HOLE_MAX=64;
// 3-4-5 角：臂長為 5 孔的倍數時，端孔落在 8 mm 方格上。存精確值，面板顯示「約 127°」。
export const ARM_345_DEG=180-Math.atan2(4,3)*180/Math.PI;
// 鏡射狀態（+1 一般、-1 翻面）：孔側（holeSide）會隨第2臂跨過 180° 而變，鏡射狀態不會，臂的世界方向＝第1臂方向＋鏡射×夾角。
const mirror=(c,holeSide)=>holeSide*(Math.sin(c.standardBlank.arms[1].angleDeg*Math.PI/180)<0?-1:1);
const unit=d=>{const r=d%360;return r===0?[1,0]:r===90?[0,1]:r===180?[-1,0]:r===270?[0,-1]:[Math.cos(d*Math.PI/180),Math.sin(d*Math.PI/180)];};
const keyId=(c,k,i)=>`${c.id}_A${k}_${i}`.replaceAll('.','_');
/** 說明哪一項不合規則（armsValid 為 false 時用）。 */
export function armsProblem(arms){
 if(!Array.isArray(arms)||arms.length<2||arms.length>3)return '彎桿／多臂件要有2到3支臂。';
 if(arms.some(a=>!Number.isInteger(a?.holes)||a.holes<1||a.holes>ARM_HOLE_MAX))return `每支臂的孔數要是1到${ARM_HOLE_MAX}的整數（不含中心孔）。`;
 if(arms[0].angleDeg!==0||arms.slice(1).some(a=>!(Number.isFinite(a.angleDeg)&&a.angleDeg>0&&a.angleDeg<360)))return '第2、3支臂的夾角要在1°到359°之間（以第1支臂為0°）。';
 if(arms[1].angleDeg===180)return arms.length===2?'兩支臂剛好180°就是一根直桿，請改用桿件。':'第2支臂不能剛好180°（會和第1支臂成一直線），請把它排在第3支臂。';
 return armsValid(arms)?'':`兩支臂的方向至少要相隔${ARM_MIN_GAP_DEG}°，否則外形會疊在一起。`;
}
/** 以中心孔為原點、第1臂沿 +x 的標準座標；每個孔 {k臂,i第幾孔,x,y}。 */
function layout(arms){
 const holes=[];
 arms.forEach((a,k)=>{const[cx,cy]=unit(a.angleDeg);for(let i=1;i<=a.holes;i++)holes.push({k,i,x:8*i*cx,y:8*i*cy});});
 const end=k=>holes.find(h=>h.k===k&&h.i===arms[k].holes);
 return {holes,p2:end(0),p3:end(1),locals:holes.filter(h=>h!==end(0)&&h!==end(1))};
}
function make({arms,n=1,origin={x:0,y:0}}={}){
 const fail=message=>({ok:false,message});
 if(!origin||![origin.x,origin.y].every(Number.isFinite))return fail('位置請填有效的 X、Y 座標。');
 const bad=armsProblem(arms);if(bad)return fail(bad);
 const id='Blank'+n,L=layout(arms),side=L.p3.y<0?-1:1,g=id+'.G',r1=id+'.H',r2=id+'.D';
 const pt=(key,h)=>({id:`${id}.${key}`,type:'floating',x:origin.x+h.x,y:origin.y+h.y}),zero={x:0,y:0};
 const c={id,type:'triangle',name:arms.length>2?'三臂件':'彎桿',p1:pt('A',zero),p2:pt('B',L.p2),p3:pt('C',L.p3),stock:{widthMm:13,thicknessMm:3,material:'unspecified'},standardBlank:{kind:'arms',arms:arms.map(({holes,angleDeg})=>({holes,angleDeg}))},color:'#27ae60',snapLength:false,gParam:g,r1Param:r1,r2Param:r2,sign:side,shapeMode:'hull',vertices:[{solve:true,ref:'p1'},{solve:true,ref:'p2'},{solve:true,ref:'p3'}]};
 c.holes=L.locals.map(h=>({id:keyId(c,h.k,h.i),u:h.x,v:h.y*side,type:'floating',diameter:3.2}));
 return {ok:true,comp:c,params:{[g]:8*arms[0].holes,[r1]:8*arms[1].holes,[r2]:Math.hypot(L.p3.x-L.p2.x,L.p3.y-L.p2.y)},holeCount:L.holes.length+1};
}
/** 各臂冰棒棍的聯集外形：聯集對中心孔呈星形，所以繞中心孔每 2° 取一點，再在轉折或弧線處細分到偏差 ≤ 0.02 mm。 */
function ring(c,points){
 const[a,b,d]=points,arms=c.standardBlank.arms,r=(c.stock?.widthMm||13)/2,side=mirror(c,((b.x-a.x)*(d.y-a.y)-(b.y-a.y)*(d.x-a.x))<0?-1:1),base=Math.atan2(b.y-a.y,b.x-a.x);
 const caps=arms.map(m=>({th:base+side*m.angleDeg*Math.PI/180,len:8*m.holes}));
 // 沿 phi 方向離中心孔最遠的外形點：每支臂 = 中心圓 ∪ 長方形 ∪ 端圓，取三者最遠的出口。
 const at=phi=>{
  let t=r;
  for(const m of caps){
   const dx=Math.cos(phi-m.th),dy=Math.sin(phi-m.th);
   if(dx>1e-9)t=Math.max(t,Math.min(m.len/dx,Math.abs(dy)>1e-9?r/Math.abs(dy):Infinity));
   const bq=m.len*dx,disc=bq*bq-(m.len*m.len-r*r);if(disc>=0)t=Math.max(t,bq+Math.sqrt(disc));
  }
  return {x:a.x+t*Math.cos(phi),y:a.y+t*Math.sin(phi)};
 };
 const out=[],step=Math.PI/90;
 const refine=(p0,f0,p1,f1,depth)=>{
  if(depth>10)return;
  const fm=(f0+f1)/2,pm=at(fm),dx=p1.x-p0.x,dy=p1.y-p0.y,len=Math.hypot(dx,dy)||1;
  if(len>0.05&&Math.abs((pm.x-p0.x)*dy-(pm.y-p0.y)*dx)/len>0.02){refine(p0,f0,pm,fm,depth+1);out.push(pm);refine(pm,fm,p1,f1,depth+1);}
 };
 const n=Math.round(2*Math.PI/step),first=at(0);let prev=first,pf=0;
 for(let i=1;i<=n;i++){const f=i*step,p=i===n?first:at(f);refine(prev,pf,p,f,0);if(i<n)out.push(p);prev=p;pf=f;}
 return [first,...out];
}
/** 改孔數（axis arm0/arm1/arm2，value＝該臂孔數）或夾角（angle1/angle2，value＝度）；g／r1（mm）沿用桿長欄位，須為 8 的倍數。 */
function resize(c,params,axis,value,{comps=[],modules=[]}={}){
 const fail=message=>({ok:false,message}),name=c.name||c.id,arms=c.standardBlank.arms.map(a=>({...a})),holeSide0=holeSide(c),side0=mirror(c,holeSide0);
 const map={arm0:['holes',0],arm1:['holes',1],arm2:['holes',2],angle1:['angleDeg',1],angle2:['angleDeg',2],g:['holes',0],r1:['holes',1]};
 const[field,k]=map[axis]||[];if(!field)return fail('這個零件只能改各臂的孔數和夾角。');
 if(!arms[k])return fail('這個零件沒有第3支臂。');
 if(axis==='g'||axis==='r1'){if(!Number.isFinite(value)||value%8)return fail('彎桿／多臂件的臂長要是 8 mm 的整數倍，請改臂的孔數。');value/=8;}
 arms[k][field]=value;const bad=armsProblem(arms);if(bad)return fail(bad);
 const prev=layout(c.standardBlank.arms),next=layout(arms),a=c.p1,b=c.p2,ang=Math.atan2(b.y-a.y,b.x-a.x),cos=Math.cos(ang),sin=Math.sin(ang);
 const world=h=>({x:a.x+h.x*cos-h.y*side0*sin,y:a.y+h.x*sin+h.y*side0*cos});
 const out=structuredClone(c);out.standardBlank.arms=arms;Object.assign(out.p2,world(next.p2));Object.assign(out.p3,world(next.p3));
 const side=holeSide(out);out.sign=side;
 // 舊孔依「第幾臂第幾孔」對回原本的孔（保留 id、固定／直徑），孔位換算成新的局部座標。
 const was=(c.holes||[]),byOrder=was.length===prev.locals.length,oldOf=h=>byOrder?was[prev.locals.findIndex(p=>p.k===h.k&&p.i===h.i)]:was.find(x=>x.id===keyId(c,h.k,h.i));
 out.holes=next.locals.map(h=>({...oldOf(h),id:oldOf(h)?.id||keyId(c,h.k,h.i),u:h.x,v:h.y*side0*side,...(oldOf(h)?{}:{type:'floating',diameter:3.2})}));
 if(c.standardBlank.mountHoles)out.standardBlank.mountHoles=c.standardBlank.mountHoles.map(h=>({...h,v:h.v*holeSide0*side}));
 const patch={[c.gParam]:8*arms[0].holes,[c.r1Param]:8*arms[1].holes,[c.r2Param]:Math.hypot(next.p3.x-next.p2.x,next.p3.y-next.p2.y)};
 const originalHoles=[...was,...(c.standardBlank.mountHoles||[])],kept=new Set(out.holes.map(h=>h.id)),removed=originalHoles.filter(h=>!kept.has(h.id));
 const lost=removed.find(h=>isHoleUsed(c,h,comps,{params,modules}));
 if(lost){const o=prev.locals[was.indexOf(lost)];return fail(`縮小會移除「${name}」${o?`第${o.k+1}臂`:''}${o?`第${o.i}孔`:'的孔'}，但這孔已固定或有零件連接；請先解除該孔的連接，或改用較多孔數。`);}
 // 孔位移動時，接在上面的零件跟著走；固定或馬達的孔不能被拉走，改為拒絕。
 const follow=[];
 for(const[was0,now,isFixed]of[[c.p2,out.p2,c.p2.type==='fixed'],[c.p3,out.p3,c.p3.type==='fixed'],...out.holes.map(h=>{const o=was.find(x=>x.id===h.id);return o?[holeWorld(c,o),{id:h.id,...holeWorld(out,h)},o.type==='fixed']:null;}).filter(Boolean),...(out.standardBlank.mountHoles||[]).map(h=>[holeWorld(c,c.standardBlank.mountHoles.find(x=>x.id===h.id)),{id:h.id,...holeWorld(out,h)},h.type==='fixed'])]){
  const id2=now.id,w={x:now.x,y:now.y};
  if(Math.hypot(w.x-was0.x,w.y-was0.y)<0.01)continue;
  const joined=comps.flatMap(o=>o.id===c.id?[]:['p1','p2','p3'].map(k=>o[k]).filter(p=>p?.id===id2));
  if(isFixed||joined.some(p=>p.type==='fixed'||p.type==='motor'))return fail(`改這個尺寸會移動固定在「${name}」孔上的零件；請先解除固定，或改用不會移動該孔的尺寸。`);
  if(joined.length)follow.push({id:id2,...w});
 }
 return {ok:true,comp:out,params:patch,follow};
}
/** 編輯面板的欄位：[軸, 名稱, 目前值, 上限, 空欄提示]；孔數是整數個、夾角是整數度（3-4-5 角顯示為提示文字）。 */
function rows(c){
 const arms=c.standardBlank.arms;
 return [...arms.map((a,k)=>['arm'+k,`第${k+1}臂孔數`,a.holes,ARM_HOLE_MAX]),...arms.slice(1).map((a,k)=>['angle'+(k+1),`第${k+2}臂夾角（度）`,a.angleDeg,359,Math.abs(a.angleDeg-ARM_345_DEG)<1e-9?'約127（3-4-5）':'特殊角度'])];
}
Object.assign(ARMS,{make,ring,resize,rows});
import('./arm-edit-panel.js');
export {make as makeArmBlank,ring as armOutline,resize as resizeArms,rows as armRows};
