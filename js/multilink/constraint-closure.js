/** Closed linkages with a moving rail cannot always be ordered as dyads.
 * Complete the same bar/joint constraints with a bounded numerical solve.
 * Saved coordinates select a branch; they are never extra constraints.
 * Rigid collinear members use local vector equations, not degenerate circles.
 */
export function solveConstraintClosure(topology, params) {
  const comps=topology._wizard_data, values={...topology.params,...params};
  const seeds={},fixed={},equations=[],checks=[];
  const fail=errorReason=>({isValid:false,isUnderconstrained:false,points:{...seeds},errorReason});
  if(comps.some(c=>!['bar','triangle','slider','anchor','workpiece'].includes(c.type)||c.holes?.length))return fail('移動軌道目前支援連桿、板件與針筒的閉環約束。');
  if(comps.some(c=>c.isInput||c.physicalMotor||['p1','p2','p3'].some(k=>c[k]?.physicalMotor||c[k]?.type==='motor'||c[k]?.type==='linear')))return fail('移動軌道閉環目前使用針筒長度輸入；尚未支援此馬達約束。');
  if(comps.some(c=>['bar','triangle','slider'].includes(c.type)&&(!c.p1?.id||!c.p2?.id||(['triangle','slider'].includes(c.type)&&!c.p3?.id))))return fail('閉環零件缺少必要接點。');
  for(const rail of comps.filter(c=>c.type==='slider'&&c.movingRail)){
    const ids=[rail.p1?.id,rail.p2?.id];
    if(!comps.some(c=>['bar','triangle'].includes(c.type)&&ids.every(id=>c.barFusion?.points.some(p=>p.id===id)||[c.p1,c.p2,c.p3].some(p=>p?.id===id))))return fail('移動軌道兩端須連接同一剛性零件，不能只保留未支承的滑槽。');
  }
  const value=n=>Number(values[n] ?? n);
  for(const c of comps)for(const k of ['p1','p2','p3','m1','m2']){
    const p=c[k];if(!p?.id||c.type==='workpiece')continue;
    seeds[p.id]={x:Number(p.x),y:Number(p.y)};
    if(p.type==='fixed')fixed[p.id]={...seeds[p.id]};
  }
  if(Object.values(seeds).some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return fail('閉環接點需要有限座標。');
  // Ground steps can express an adjustable baseline. Resolve their dependency
  // exactly as the constructive solver does, before fixing coordinates.
  for(const s of topology.steps||[])if(s.type==='ground'&&s.x!==undefined)fixed[s.id]={x:Number(s.x),y:Number(s.y)};
  for(let i=0;i<3;i++)for(const s of topology.steps||[])if(s.type==='ground'&&s.ref_id&&fixed[s.ref_id]){
    const p=fixed[s.ref_id],d=value(s.dist_param);fixed[s.id]={x:p.x+(s.ux||0)*d,y:p.y+(s.uy||0)*d};
  }
  const distance=(a,b,len)=>equations.push(p=>Math.hypot(p[a].x-p[b].x,p[a].y-p[b].y)-len);
  const local=(id,a,b,u,v,L)=>{
    equations.push(p=>p[id].x-p[a].x-((p[b].x-p[a].x)*u-(p[b].y-p[a].y)*v)/L);
    equations.push(p=>p[id].y-p[a].y-((p[b].y-p[a].y)*u+(p[b].x-p[a].x)*v)/L);
  };
  const fused=new Set(comps.flatMap(c=>c.barFusion?.members||[]));
  const attachmentBars=new Set();
  for(const s of topology._syringes?.comps.filter(c=>c.type==='syringe')||[])for(const key of ['a','b']){
    const ref=s[key],host=comps.find(c=>c.id===ref.componentId),id=`${s.id}_${key}`;
    if(!seeds[id]||!host?.p2)continue;
    attachmentBars.add(`${id}1`);attachmentBars.add(`${id}2`);
    local(id,host.p1.id,host.p2.id,ref.u,ref.v,value(host.lenParam||host.gParam));
  }
  for(const c of comps){
    if(c.barFusion){
      const L=c.barFusion.points.find(p=>p.id===c.p2.id).x;
      distance(c.p1.id,c.p2.id,L);
      for(const p of c.barFusion.points)if(![c.p1.id,c.p2.id].includes(p.id))local(p.id,c.p1.id,c.p2.id,p.x,p.y,L);
    }
    if(c.type==='bar'&&!fused.has(c.id)&&!attachmentBars.has(c.id)){
      const L=value(c.lenParam);if(!(L>0))return fail('連桿孔距必須是有限正數。');
      distance(c.p1.id,c.p2.id,L);
    }
    if(c.type==='triangle'){
      distance(c.p1.id,c.p2.id,value(c.gParam));distance(c.p1.id,c.p3.id,value(c.r1Param));distance(c.p2.id,c.p3.id,value(c.r2Param));
    }
    if(c.type==='slider'){
      const a=c.p1.id,b=c.p2.id,t=c.p3.id,L=value(c.lenParam);
      if(!(L>0&&Number.isFinite(L)))return fail('滑軌長度必須是有限正數。');
      distance(a,b,L);
      if(c.m1)local(c.m1.id,a,b,-Number(c.railOffset||0),0,L);
      if(c.m2)local(c.m2.id,a,b,Number(c.carrierLen||L)-Number(c.railOffset||0),0,L);
      equations.push(p=>((p[b].x-p[a].x)*(p[t].y-p[a].y)-(p[b].y-p[a].y)*(p[t].x-p[a].x))/L);
      const projection=p=>((p[t].x-p[a].x)*(p[b].x-p[a].x)+(p[t].y-p[a].y)*(p[b].y-p[a].y))/L;
      checks.push(p=>{
        const d=c.baseEnd==='p2'?L-projection(p):projection(p);
        return d>=Number(c.travelStart||0)-.001&&d<=Number(c.travelEnd??L)+.001;
      });
    }
  }
  const ids=Object.keys(seeds).filter(id=>!fixed[id]),n=ids.length*2;
  if(n>120||equations.length>512)return fail('閉環接點過多，請先拆成較小的機構核對。');
  const previous=params._prevPoints||{};
  let x=ids.flatMap(id=>{const p=previous[id]||seeds[id];return [p.x,p.y];});
  const pose=x=>({...fixed,...Object.fromEntries(ids.map((id,i)=>[id,{x:x[i*2],y:x[i*2+1]}]))});
  const residual=x=>{const p=pose(x);return equations.map(f=>f(p));};
  const norm=r=>r.reduce((s,v)=>s+v*v,0);
  const jacobian=(x,r)=>{
    const j=r.map(()=>Array(n).fill(0)),h=.00001;
    for(let k=0;k<n;k++){const v=x[k];x[k]=v+h;const q=residual(x);x[k]=v;for(let i=0;i<r.length;i++)j[i][k]=(q[i]-r[i])/h;}
    return j;
  };
  const eliminate=(a,b)=>{
    a=a.map((row,i)=>[...row,b[i]]);
    for(let k=0;k<n;k++){
      let pivot=k;for(let i=k+1;i<n;i++)if(Math.abs(a[i][k])>Math.abs(a[pivot][k]))pivot=i;
      if(Math.abs(a[pivot][k])<1e-14)return null;
      [a[k],a[pivot]]=[a[pivot],a[k]];
      for(let i=k+1;i<n;i++){const f=a[i][k]/a[k][k];for(let t=k;t<=n;t++)a[i][t]-=f*a[k][t];}
    }
    const d=Array(n).fill(0);for(let i=n-1;i>=0;i--){let v=a[i][n];for(let k=i+1;k<n;k++)v-=a[i][k]*d[k];d[i]=v/a[i][i];}return d;
  };
  let r=residual(x),cost=norm(r),lambda=.001;
  for(let iter=0;iter<120&&Math.max(...r.map(Math.abs))>1e-7;iter++){
    const j=jacobian(x,r),a=Array.from({length:n},()=>Array(n).fill(0)),b=Array(n).fill(0);
    for(let i=0;i<j.length;i++)for(let k=0;k<n;k++){
      b[k]-=j[i][k]*r[i];for(let t=0;t<n;t++)a[k][t]+=j[i][k]*j[i][t];
    }
    for(let k=0;k<n;k++)a[k][k]+=lambda;
    const step=eliminate(a,b);if(!step)break;
    const next=x.map((v,k)=>v+step[k]),nr=residual(next),nc=norm(nr);
    if(Number.isFinite(nc)&&nc<cost){x=next;r=nr;cost=nc;lambda=Math.max(1e-10,lambda*.25);}else lambda=Math.min(1e12,lambda*10);
  }
  const points=pose(x),maxResidual=Math.max(...r.map(Math.abs));
  if(!Number.isFinite(maxResidual)||maxResidual>.0001)return {...fail('閉環無法同時保持孔距、滑軌與針筒長度。'),points};
  if(checks.some(check=>!check(points)))return {...fail('活動孔超出滑軌允許行程。'),points};
  // A small residual alone also fits a free mechanism. Reject rank deficiency
  // instead of silently using the seed as an extra fixed point.
  const matrix=jacobian(x,r);let rank=0;
  for(let col=0;col<n&&rank<matrix.length;col++){
    let pivot=rank;for(let row=rank+1;row<matrix.length;row++)if(Math.abs(matrix[row][col])>Math.abs(matrix[pivot][col]))pivot=row;
    if(Math.abs(matrix[pivot][col])<1e-6)continue;
    [matrix[rank],matrix[pivot]]=[matrix[pivot],matrix[rank]];
    const divisor=matrix[rank][col];for(let k=col;k<n;k++)matrix[rank][k]/=divisor;
    for(let row=rank+1;row<matrix.length;row++){const f=matrix[row][col];for(let k=col;k<n;k++)matrix[row][k]-=f*matrix[rank][k];}rank++;
  }
  return {isValid:rank===n,isUnderconstrained:rank<n,unresolvedPointIds:rank<n?ids:[],points,B:points[topology.tracePoint],
    errorReason:rank<n?'仍有未受約束的活動接點，請檢查機架與連接。':null,closureResidualMm:maxResidual};
}
