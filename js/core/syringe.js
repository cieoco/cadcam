import {localHoles,holeWorld,holeSide} from './local-holes.js';
// Hinged telescopic actuator. All lengths and attachment coordinates are mm.
// These demonstration dimensions are not a manufacturer specification.
export const SYRINGE_DEMO = Object.freeze({name:'10mL 教學示範（未校正）',capacityMl:10,outerDiameter:16,bodyLength:70,rodDiameter:6,lmin:95,stroke:40,calibrated:false});
export const SYRINGE_TOLERANCE_MM = 0.001;
export const hasSyringeClamp=c=>c?.mountMode==='fixed-axis'||c?.mountMode==='pivot';
// 可轉安裝＝同一個雙耳固定環，只鎖其中一顆耳螺絲當轉軸；螺絲離筒身軸線一個耳距（24 mm 孔距的一半）。
export const SYRINGE_EAR_MM=12;
export const syringePivotEar=c=>c?.pivotEar===-1?-1:1;
// 針筒作用長度（推桿端點到固定環中心的軸向距離）→ 實際 A–B 拘束距離。
export const syringeLinkLength=c=>{const L=c.spec.lmin+c.extension;return c.mountMode==='pivot'?Math.hypot(L,SYRINGE_EAR_MM):L;};
// 由已鎖耳螺絲 a 與推桿端點 b 還原筒身軸線：b 在軸線上，a 偏離軸線一個耳距。
export function syringePivotFrame(a,b,ear){
  const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),L=Math.sqrt(Math.max(0,d*d-SYRINGE_EAR_MM*SYRINGE_EAR_MM));
  const angle=Math.atan2(dy,dx)+ear*Math.atan2(SYRINGE_EAR_MM,L),nx=-Math.sin(angle),ny=Math.cos(angle);
  return {angle,length:L,center:{x:a.x-SYRINGE_EAR_MM*ear*nx,y:a.y-SYRINGE_EAR_MM*ear*ny}};
}
export const syringeBarrelOffset=c=>c.installation?.barrelOffsetMm ?? c.spec.bodyLength*.7;
// A shared node can be declared fixed by another member. Drawing a new bar
// reuses its ID with a floating local copy; match compileTopology's node roles.
export function fixedSyringePointIds(comps){
  const nodes=o=>[o.p1,o.p2,o.p3,...localHoles(o).map(h=>({...h,...holeWorld(o,h)}))].filter(Boolean);
  const ids=new Set(comps.flatMap(o=>nodes(o).filter(p=>p.type==='fixed').map(p=>p.id)));
  // Two distinct fixed holes lock a rigid plate, including its other primary holes.
  let changed=true;while(changed){changed=false;for(const o of comps.filter(c=>['bar','triangle'].includes(c.type))){
    const ns=nodes(o),fixed=ns.filter(p=>ids.has(p.id));
    if(!fixed.some((a,i)=>fixed.slice(i+1).some(b=>a.id!==b.id&&Math.hypot(a.x-b.x,a.y-b.y)>1e-6)))continue;
    for(const p of ns)if(!ids.has(p.id)){ids.add(p.id);changed=true;}
  }}return ids;
}
export function normalizeSyringe(c) {
  const spec={...SYRINGE_DEMO};
  const finite=(n,f)=>Number.isFinite(Number(n))?Number(n):f;
  let restored=false;
  for(const k of ['capacityMl','outerDiameter','bodyLength','rodDiameter','lmin','stroke']){spec[k]=finite(c.spec?.[k],SYRINGE_DEMO[k]);if(!Number.isFinite(c.spec?.[k]))restored=true;}
  // 舊存檔的可轉安裝沒有 pivotEar：當時 lmin 是 A–B 距離，改成軸向長度，讓 √((lmin+ext)²+耳距²) 仍等於舊距離。
  if(c.mountMode==='pivot'&&c.pivotEar!==1&&c.pivotEar!==-1){const total=spec.lmin+finite(c.extension,0);spec.lmin=Math.sqrt(Math.max(0,total*total-SYRINGE_EAR_MM*SYRINGE_EAR_MM))-finite(c.extension,0);}
  spec.name=String(c.spec?.name || spec.name).slice(0,80);spec.calibrated=c.spec?.calibrated===true&&!restored;
  const endpoint=r=>({componentId:String(r?.componentId || ''),u:finite(r?.u,0),v:finite(r?.v,0),...(!r?.componentId&&Number.isFinite(r?.position?.x)&&Number.isFinite(r?.position?.y)?{position:{x:r.position.x,y:r.position.y}}:{})});
  return {type:'syringe',id:String(c.id),color:'#0891b2',...(c.mountMode==='fixed-axis'?{mountMode:'fixed-axis',axisDeg:finite(c.axisDeg,NaN),appearance:'flat-rod',outputId:String(c.outputId||''),...(Array.isArray(c.jawIds)?{jawIds:c.jawIds.slice(0,2).map(String)}:{}),...(Array.isArray(c.passiveTips)?{passiveTips:c.passiveTips.slice(0,2).map(t=>({hostId:String(t.hostId||''),length:finite(t.length,NaN),angleDeg:finite(t.angleDeg,NaN)}))}:{})}:c.mountMode==='pivot'?{mountMode:'pivot',appearance:'flat-rod',pivotEar:syringePivotEar(c)}:{}),...(hasSyringeClamp(c)&&c.installation?{installation:{face:c.installation.face==='back'?'back':'front',spacerMm:c.installation.spacerMm===null||c.installation.spacerMm===undefined?null:Math.max(0,Math.min(100,finite(c.installation.spacerMm,0))),...(c.installation.barrelOffsetMm!==undefined?{barrelOffsetMm:finite(c.installation.barrelOffsetMm,NaN)}:{})}}:{}),a:endpoint(c.a),b:endpoint(c.b),spec,extension:finite(c.extension,0),branch:c.branch===-1?-1:1};
}
// Length edits preserve attachments at the second end hole. Interior mounts keep
// their measured offset; never stretch a clamp position or infer a broken joint.
export function planSyringeAttachmentResize(comps,owner,before,after) {
  if(owner?.type!=='bar'||!(before>0)||!(after>0)||!Number.isFinite(after))return [];
  return comps.filter(c=>c.type==='syringe').flatMap(c=>{
    const patch={};
    for(const key of ['a','b']){
      const ref=c[key];
      if(ref?.componentId===owner.id&&Math.abs(ref.u-before)<1e-6&&ref.v===0)
        patch[key]={...ref,u:after};
    }
    return Object.keys(patch).length?[{id:c.id,...patch}]:[];
  });
}

export function attachmentFrame(owner,params,points=null) {
  if(!owner?.p1)return null;
  const p=points?.[owner.p1.id] || owner.p1;
  if(owner.type==='anchor')return {p,x:1,y:0,length:0};
  if(!['bar','triangle'].includes(owner.type)||!owner.p2)return null;
  const q=points?.[owner.p2.id] || owner.p2,d=Math.hypot(q.x-p.x,q.y-p.y);
  const length=Number(params[owner.lenParam || owner.gParam]);
  if(!(d>0&&length>0))return null;
  return {p,x:(q.x-p.x)/d,y:(q.y-p.y)/d,length};
}
// Select existing primary/grid holes; coordinates share the attachment frame.
export function syringeAttachmentHoles(owner,params){
 const f=attachmentFrame(owner,params);if(!f)return [];
 return [owner.p1,owner.p2,owner.p3].filter(Boolean).map((p,i)=>({...p,key:['p1','p2','p3'][i],u:(p.x-f.p.x)*f.x+(p.y-f.p.y)*f.y,v:-(p.x-f.p.x)*f.y+(p.y-f.p.y)*f.x}))
 .concat(localHoles(owner).map(h=>({...h,...holeWorld(owner,h),key:h.id,v:h.v*holeSide(owner)})));
}
export const syringeAttachmentHole=(owner,params,ref)=>syringeAttachmentHoles(owner,params).find(h=>Math.hypot(h.u-ref?.u,h.v-ref?.v)<1e-6);
export function attachmentPoint(ref,comps,params,points=null) {
  const owner=comps.find(c=>c.id===ref.componentId),f=attachmentFrame(owner,params,points);
  return f?{x:f.p.x+f.x*ref.u-f.y*ref.v,y:f.p.y+f.y*ref.u+f.x*ref.v}:null;
}
export function syringeIssues(c,comps,params) {
  const s=c.spec,issues=[];
  if(!s||['capacityMl','outerDiameter','bodyLength','rodDiameter','lmin','stroke'].some(k=>!Number.isFinite(s[k])||s[k]<=0))issues.push('針筒尺寸與有效行程必須是正數。');
  if((!hasSyringeClamp(c)&&s?.bodyLength>s?.lmin)||s?.rodDiameter>=s?.outerDiameter)issues.push('外形示範需要筒身長度不超過最短孔距，且推桿寬度小於筒身外徑。');
  if(hasSyringeClamp(c)){
    const offset=syringeBarrelOffset(c);
    if(!Number.isFinite(offset)||offset<6||offset>s?.bodyLength-6)issues.push('固定環須完整夾在筒身上，距筒尾至少 6 mm，且不能超出筒身。');
    if(s?.bodyLength-offset>s?.lmin)issues.push('最短安裝距離不足以容納固定環前方的筒身。');
  }
  if(!Number.isFinite(c.extension)||c.extension<0||c.extension>s?.stroke)issues.push('目前伸出量超出針筒有效行程。');
  for(const [key,label] of [['a','A'],['b','B']]){
    const ref=c[key],owner=comps.find(o=>o.id===ref?.componentId);
    if(!ref||!Number.isFinite(ref.u)||!Number.isFinite(ref.v)||!attachmentFrame(owner,params))issues.push(`${label}端需要有效的機架、桿件或板件接點。`);
    if(owner?.type==='anchor'&&(ref.u!==0||ref.v!==0))issues.push(`${label}端固定支點不能有局部偏移，請選機架板。`);
    // 圓盤底板的固定環可放在板面內；輸出端仍須使用既有端孔。
    if(key==='a'&&owner?.type==='bar'&&owner.shape==='disk'){
      if(Math.hypot(ref?.u,ref?.v)>(Number(owner.diameterMm)||100)/2+0.000001)issues.push('固定環位置超出圓盤底板，請移回板內。');
    }else if(!(key==='a'&&hasSyringeClamp(c))&&owner?.type==='bar'&&(ref.u<0||ref.u>Number(params[owner.lenParam])||Math.abs(ref.v)>0.000001))issues.push(`${label}端須在桿件中心線與有效孔距內；偏置安裝請用板件。`);
  }
  if(c.a?.componentId===c.b?.componentId)issues.push('兩端不能安裝在同一剛性零件上。');
  if(c.mountMode==='pivot'){
    const fixed=fixedSyringePointIds(comps),owner=comps.find(o=>o.id===c.a?.componentId);
    if(!owner||![owner.p1,owner.p2,owner.p3].filter(Boolean).every(p=>fixed.has(p.id)))issues.push('可轉固定環的支點須安裝在固定機架上。');
    const arm=comps.find(o=>o.id===c.b?.componentId),at=syringeAttachmentHole(arm,params,c.b);
    if(!at||fixed.has(at.id)||!['bar','triangle'].includes(arm?.type)||!syringeAttachmentHoles(arm,params).some(p=>fixed.has(p.id)))issues.push('可轉安裝請直接接有固定軸的連桿／圓盤活動端孔；保留中間短連桿會多出自由度。');
  }
  for(const id of c.jawIds||[])if(!comps.some(o=>o.id===id&&o.type==='triangle'))issues.push('一體式夾臂缺失。');
  for(const t of c.passiveTips||[])if(!comps.some(o=>o.id===t.hostId&&o.p3)||!Number.isFinite(t.length)||t.length<=0||!Number.isFinite(t.angleDeg))issues.push('活動夾片的宿主、長度或手動角度無效。');
  if(c.mountMode==='fixed-axis'){
    const fixedIds=fixedSyringePointIds(comps);
    const owner=comps.find(o=>o.id===c.a?.componentId);
    if(!owner||![owner.p1,...(owner.type==='anchor'?[]:[owner.p2,owner.p3].filter(Boolean))].every(p=>fixedIds.has(p?.id)))issues.push('固定筒身必須安裝在固定機架，不能只鎖定一個轉軸點。');
    if(!Number.isFinite(c.axisDeg))issues.push('固定筒身缺少有效軸向。');
    // 推桿接活動連桿的任一端孔：第一孔（u=0）或桿件第二孔（u=桿長、v=0）。
    const rod=comps.find(o=>o.id===c.b?.componentId),rodLength=Number(params[rod?.lenParam]);
    const atEnd2=rod?.type==='bar'&&rodLength>0&&Math.abs(c.b?.u-rodLength)<1e-6&&c.b?.v===0;
    if(!(c.b?.u===0&&c.b?.v===0)&&!atEnd2)issues.push('固定筒身推桿須接活動連桿的端孔（第一孔或桿件第二孔）。');
    if(fixedIds.has((atEnd2?rod?.p2:rod?.p1)?.id))issues.push('推桿接孔不能同時設成固定點。');
    const other=atEnd2?rod?.p1:rod?.p2,output=comps.find(o=>o.id===c.outputId);
    if(rod?.type!=='bar'||!rod.p1||!rod.p2)issues.push('缺少推桿連接的短連桿，請補回並重新連接。');
    if(!output||!['bar','triangle'].includes(output.type)||output.id===rod?.id)issues.push('缺少輸出連桿／擺臂，不能只靠針筒端點運動。');
    else if(!other||fixedIds.has(other.id)||![output.p1,output.p2,output.p3].some(p=>p?.id===other.id)||![output.p1,output.p2,output.p3].some(p=>fixedIds.has(p?.id)))issues.push('短連桿須接到有固定支點的輸出連桿；目前接點未接妥。');
  }
  return issues;
}
// Compile into the existing fixed-distance constraint graph, never a prescribed arm-angle animation.
export function expandSyringes(comps,params) {
  const output=comps.filter(c=>c.type!=='syringe').map(c=>structuredClone(c)),values={...params},issues=[];
  for(const c of comps.filter(c=>c.type==='syringe')){
    issues.push(...syringeIssues(c,comps,params));
    const ends=[];
    for(const key of ['a','b']){
      const ref=c[key],owner=output.find(o=>o.id===ref?.componentId),f=attachmentFrame(owner,values);
      if(!f){ends.push(null);continue;}
      const q=attachmentPoint(ref,output,values);
      const hole=syringeAttachmentHole(owner,values,ref);if(hole){ends.push({id:hole.id,type:hole.type||'floating',...q});continue;}
      if(Math.hypot(ref.u,ref.v)<1e-9){ends.push(owner.p1);continue;}
      if(Math.hypot(ref.u-f.length,ref.v)<1e-9){ends.push(owner.p2);continue;}
      const p={id:`${c.id}_${key}`,type:'floating',...q,solveSign:c.branch};ends.push(p);
      for(const [n,base,len] of [['1',owner.p1,Math.hypot(ref.u,ref.v)],['2',owner.p2,Math.hypot(f.length-ref.u,ref.v)]]){
        const id=`${c.id}_${key}${n}`,lenParam=`${id}_len`;values[lenParam]=len;
        output.push({id,type:'bar',p1:base,p2:p,lenParam,hidden:true,fixedLen:true,...(c.moduleId?{moduleId:c.moduleId}:{})});
      }
    }
    if(c.mountMode==='fixed-axis'&&ends.every(Boolean)&&!syringeIssues(c,comps,params).length){
      const angle=c.axisDeg*Math.PI/180,length=c.spec.lmin+c.extension;
      const target={x:ends[0].x+Math.cos(angle)*length,y:ends[0].y+Math.sin(angle)*length};
      for(const part of output)for(const key of ['p1','p2','p3','m1','m2'])if(part[key]?.id===ends[1].id)part[key]={...part[key],...target,type:'fixed'};
      continue;
    }
    if(ends.every(Boolean)){
      const lenParam=`${c.id}_length`;values[lenParam]=syringeLinkLength(c);
      output.push({id:c.id,type:'bar',p1:ends[0],p2:ends[1],lenParam,hidden:true,fixedLen:true,...(c.moduleId?{moduleId:c.moduleId}:{})});
    }
  }
  return {comps:output,params:values,issues};
}
export function validateSyringePose(comps,params,points) {
  let residual=0;const issues=[];
  for(const c of comps.filter(c=>c.type==='syringe')){
    issues.push(...syringeIssues(c,comps,params));
    const a=attachmentPoint(c.a,comps,params,points),b=attachmentPoint(c.b,comps,params,points);
    if(!a||!b){issues.push('針筒安裝點缺失。');continue;}
    residual=Math.max(residual,Math.abs(Math.hypot(a.x-b.x,a.y-b.y)-syringeLinkLength(c)));
    if(c.mountMode==='fixed-axis'){
      const angle=c.axisDeg*Math.PI/180,L=c.spec.lmin+c.extension;
      residual=Math.max(residual,Math.hypot(b.x-a.x-Math.cos(angle)*L,b.y-a.y-Math.sin(angle)*L));
      const driven=[c.outputId,...(c.jawIds||[]),...(c.passiveTips||[]).map(t=>t.hostId)].filter((v,i,a)=>v&&a.indexOf(v)===i);
      for(const id of driven){const host=comps.find(o=>o.id===id),pivot=points?.[host?.p1?.id],end=points?.[host?.p2?.id];if(pivot&&end){const d=Math.hypot(b.x-end.x,b.y-end.y),lever=d?Math.abs((b.x-end.x)*(pivot.y-end.y)-(b.y-end.y)*(pivot.x-end.x))/d:0;if(lever<0.5)issues.push('短連桿作用線接近活動臂支點，請避開死點附近姿態。');}}
      continue;
    }
    const owner=comps.find(o=>o.id===c.b.componentId),fixed=fixedSyringePointIds(comps);
    const pivot=c.mountMode==='pivot'?syringeAttachmentHoles(owner,params).find(p=>fixed.has(p.id)):owner?.p1,o=points?.[pivot?.id];
    if(o){const axis=c.mountMode==='pivot'?syringePivotFrame(a,b,syringePivotEar(c)):null,ux=axis?Math.cos(axis.angle):b.x-a.x,uy=axis?Math.sin(axis.angle):b.y-a.y,ref=axis?b:a,length=axis?1:Math.hypot(ux,uy),lever=Math.abs(ux*(o.y-ref.y)-uy*(o.x-ref.x))/length;
      if(lever<0.5)issues.push('針筒推力作用線接近通過關節中心，請避開奇異姿勢。');}
  }
  if(residual>SYRINGE_TOLERANCE_MM)issues.push('目前輸入無法形成有效組裝姿勢，安裝孔距不符合針筒長度。');
  return {ok:!issues.length,residualMm:residual,toleranceMm:SYRINGE_TOLERANCE_MM,issues};
}
