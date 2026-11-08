// 合併排版 DXF（雷射／CNC 共用邊）。
// 幾何只從「每個零件一份」的 DXF 文字讀回，與逐件檔同源；本模組由匯出對話框懶載入，不增加啟動大小。
import {FABRICATION_DEFAULTS} from './fabrication-profile.js';

export const OUTLINE_LAYERS=Object.freeze(['CUT','GEAR_CUT','RACK_CUT','FRAME_CUT']);
export const NEST_DEFAULTS=Object.freeze({sheetW:600,sheetH:400,marginMm:5,sheetGapMm:30});
export const NEST_METHODS=Object.freeze({laser:'合併一份（雷射切割）',cnc:'合併一份（CNC 銑削）'});
const TOL=1e-3,EPS=1e-9;
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const fmt=v=>String(Math.round(v*10)/10);

/* ---------- 讀取：只支援本專案匯出器寫出的圖元 ---------- */
export function readDxf(text) {
  const lines=String(text).split(/\r?\n/),entities=[],comments=[];
  let section=null,wantName=false,cur=null;
  const finish=()=>{if(cur)entities.push(cur);cur=null;};
  for(let i=0;i+1<lines.length;i+=2) {
    const code=Number(lines[i].trim()),value=lines[i+1];
    if(!Number.isInteger(code))throw Error(`DXF 第 ${i+1} 行不是群組碼，無法合併排版。`);
    if(code===999){(cur?(cur.comments||=[]):comments).push(value);continue;}
    if(code===0) {
      finish();
      if(value==='SECTION')wantName=true;
      else if(value==='ENDSEC')section=null;
      else if(value==='EOF')break;
      else if(section==='ENTITIES') {
        if(!['LWPOLYLINE','CIRCLE','LINE','ARC','TEXT'].includes(value))throw Error(`合併排版不支援 DXF 圖元 ${value}。`);
        cur={type:value,layer:'0'};
        if(value==='LWPOLYLINE')Object.assign(cur,{points:[],closed:false});
      }
      continue;
    }
    if(wantName&&code===2){section=value;wantName=false;continue;}
    if(!cur)continue;
    if(code===8){cur.layer=value;continue;}
    const n=Number(value);
    if(cur.type==='LWPOLYLINE') {
      if(code===70)cur.closed=(n&1)===1;
      else if(code===90)cur.count=n;
      else if(code===10)cur.points.push({x:n,y:0});
      else if(code===20)cur.points[cur.points.length-1].y=n;
      else if(code===42)cur.points[cur.points.length-1].b=n;
    } else if(cur.type==='TEXT') {
      if(code===1)cur.text=value;else{const key={10:'x',20:'y',40:'h',50:'angle'}[code];if(key)cur[key]=n;}
    } else {const key={10:'x',20:'y',11:'x2',21:'y2',40:'r',50:'a1',51:'a2'}[code];if(key)cur[key]=n;}
  }
  finish();
  for(const e of entities)if(e.type==='LWPOLYLINE'&&e.count!==undefined&&e.count!==e.points.length)throw Error('DXF 折線頂點數不符，無法合併排版。');
  return {entities,comments};
}

/* ---------- 幾何小工具 ---------- */
export function signedArea(p){let s=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];s+=a.x*b.y-b.x*a.y;}return s/2;}
export function pathLength(points,closed){let s=0;for(let i=0;i+1<points.length;i++)s+=dist(points[i],points[i+1]);if(closed&&points.length>1)s+=dist(points[points.length-1],points[0]);return s;}
function pointInRing(pt,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a.y>pt.y)!==(b.y>pt.y)&&pt.x<(b.x-a.x)*(pt.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;}
function bboxOf(points){let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const p of points){x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y);}return {x0,y0,x1,y1};}
function cleanRing(points){const out=[];for(const p of points)if(!out.length||dist(out[out.length-1],p)>1e-7)out.push({x:p.x,y:p.y});while(out.length>1&&dist(out[0],out[out.length-1])<=1e-7)out.pop();return out;}
// LWPOLYLINE 凸度（42）展開成折線點；本專案匯出器目前不寫凸度，仍支援以防外來檔。
function expandBulges(points,closed){
  const out=[],n=points.length;
  for(let i=0;i<n;i++) {
    const p=points[i];out.push({x:p.x,y:p.y});
    if(!p.b||(!closed&&i===n-1))continue;
    const q=points[(i+1)%n],theta=4*Math.atan(p.b),d=dist(p,q);if(d<EPS)continue;
    const ux=(q.x-p.x)/d,uy=(q.y-p.y)/d,h=d/2/Math.tan(theta/2),cx=(p.x+q.x)/2-uy*h,cy=(p.y+q.y)/2+ux*h;
    const a0=Math.atan2(p.y-cy,p.x-cx),R=Math.hypot(p.x-cx,p.y-cy),steps=Math.max(2,Math.ceil(Math.abs(theta)/(Math.PI/18)));
    for(let k=1;k<steps;k++){const a=a0+theta*k/steps;out.push({x:cx+R*Math.cos(a),y:cy+R*Math.sin(a)});}
  }
  return out;
}
function arcToPoints(e){let a1=(e.a1||0)*Math.PI/180,a2=(e.a2||0)*Math.PI/180;while(a2<=a1)a2+=2*Math.PI;const steps=Math.max(2,Math.ceil((a2-a1)/(Math.PI/18))),out=[];for(let k=0;k<=steps;k++){const a=a1+(a2-a1)*k/steps;out.push({x:e.x+e.r*Math.cos(a),y:e.y+e.r*Math.sin(a)});}return out;}

/* ---------- 零件：外形（外輪廓）與內部特徵 ---------- */
export function partFromDxf(file) {
  const name=String(file.name||'part').replace(/\.dxf$/i,'');
  const {entities,comments}=readDxf(file.text);
  const outlineEntities=entities.filter(e=>OUTLINE_LAYERS.includes(e.layer));
  if(!outlineEntities.length)throw Error(`「${name}」找不到外形輪廓（CUT 圖層），無法合併排版。`);
  const rings=outlineEntities.map(e=>{
    if(e.type!=='LWPOLYLINE'||!e.closed)throw Error(`「${name}」的外形不是封閉折線，無法合併排版。`);
    const ring=cleanRing(expandBulges(e.points,true));
    if(ring.length<3)throw Error(`「${name}」的外形頂點不足，無法合併排版。`);
    return ring;
  });
  const outer=[],inner=[];
  rings.forEach((ring,i)=>{
    const area=Math.abs(signedArea(ring));
    // 被另一條外形包住的輪廓（例如環形聯集件的內圈）改當內部切割。
    if(rings.some((other,j)=>j!==i&&Math.abs(signedArea(other))>area&&pointInRing(ring[0],other)))inner.push({type:'LWPOLYLINE',layer:'INNER_CUT',closed:true,points:ring});
    else outer.push(signedArea(ring)<0?ring.slice().reverse():ring);
  });
  for(const e of entities)if(!OUTLINE_LAYERS.includes(e.layer)) {
    const {comments:_,...plain}=e;
    inner.push(e.type==='LWPOLYLINE'?{...plain,points:expandBulges(e.points,e.closed).map(p=>({x:p.x,y:p.y}))}:plain);
  }
  const note=comments.join('\n'),thickness=/thicknessMm=([\d.]+)/.exec(note)||/thickness ([\d.]+) mm/.exec(note),qty=/qty (\d+)/.exec(note);
  return {name,file:file.name,sourceIds:file.sourceIds||[],outer,inner,entityCount:entities.length,
    thicknessMm:thickness?Number(thickness[1]):null,quantity:qty?Math.max(1,Number(qty[1])):1,stock:comments.find(c=>/^(STOCK|DISK)/.test(c))||null};
}

/* ---------- 排版：軸向外框的貨架法，只轉 0°／90° ---------- */
// 同高度零件先疊成一欄（左對齊），讓長直邊重合；再把各欄與其他零件放上貨架。
export function packRects(items,{sheetW,sheetH,marginMm=NEST_DEFAULTS.marginMm,gapMm=0}) {
  const W=sheetW-2*marginMm,H=sheetH-2*marginMm,e=1e-6;
  if(!(W>0&&H>0))throw Error('板材尺寸小於邊距，請加大板材。');
  const oriented=items.map((it,index)=>{
    const pad=it.pad||0,w=it.w+2*pad,h=it.h+2*pad,fit0=w<=W+e&&h<=H+e,fit90=h<=W+e&&w<=H+e;
    if(!fit0&&!fit90)throw Error(`零件「${it.name}」約 ${fmt(it.w)}×${fmt(it.h)} mm，超過板材可用範圍 ${fmt(W)}×${fmt(H)} mm（已扣每邊 ${fmt(marginMm)} mm 邊距），請加大板材。`);
    const rot=!fit0||(h>w+e&&fit90)?90:0;
    return {index,rot,w:rot?h:w,h:rot?w:h};
  }).sort((a,b)=>b.h-a.h||b.w-a.w||a.index-b.index);
  const blocks=[];
  for(let i=0;i<oriented.length;) {
    let j=i;while(j<oriented.length&&oriented[i].h-oriented[j].h<=0.01)j++;
    const group=oriented.slice(i,j).sort((a,b)=>b.w-a.w||a.index-b.index),h=group[0].h;
    const per=Math.max(1,Math.floor((H+gapMm+e)/(h+gapMm)));
    for(let k=0;k<group.length;k+=per) {
      const members=group.slice(k,k+per);
      blocks.push({w:Math.max(...members.map(m=>m.w)),h:members.length*h+(members.length-1)*gapMm,members:members.map((m,r)=>({...m,ox:0,oy:r*(h+gapMm)}))});
    }
    i=j;
  }
  blocks.sort((a,b)=>b.h-a.h||b.w-a.w);
  const sheets=[],placements=[];
  for(const b of blocks) {
    let spot=null;
    for(let s=0;s<sheets.length&&!spot;s++)for(const shelf of sheets[s].shelves) {
      const x=shelf.used?shelf.x+gapMm:0;
      if(b.h<=shelf.h+e&&x+b.w<=W+e){shelf.x=x+b.w;shelf.used=true;spot={sheet:s,x,y:shelf.y};break;}
    }
    for(let s=0;s<sheets.length&&!spot;s++) {
      const sheet=sheets[s],y=sheet.shelves.length?sheet.top+gapMm:0;
      if(y+b.h<=H+e){sheet.shelves.push({y,h:b.h,x:b.w,used:true});sheet.top=y+b.h;spot={sheet:s,x:0,y};}
    }
    if(!spot){sheets.push({shelves:[{y:0,h:b.h,x:b.w,used:true}],top:b.h});spot={sheet:sheets.length-1,x:0,y:0};}
    for(const m of b.members)placements[m.index]={sheet:spot.sheet,x:marginMm+spot.x+m.ox,y:marginMm+spot.y+m.oy,w:m.w,h:m.h,rot:m.rot};
  }
  return {placements,sheetCount:sheets.length,usable:{W,H}};
}

/* ---------- 共用邊：軸向直線依共線分組，取區間聯集只切一次 ---------- */
export function mergeCommonLines(rings,{tol=TOL}={}) {
  const lines=[],pieces=[];let before=0;
  for(const ring of rings) {
    const n=ring.length,edges=[];
    for(let i=0;i<n;i++) {
      const a=ring[i],b=ring[(i+1)%n],dx=Math.abs(a.x-b.x),dy=Math.abs(a.y-b.y);before+=dist(a,b);
      edges.push({a,b,axis:dy<=tol&&dx>tol?'h':dx<=tol&&dy>tol?'v':null});
    }
    const first=edges.findIndex(e=>e.axis);
    if(first<0){pieces.push({closed:true,points:ring.slice()});continue;}
    let chain=null;
    for(let k=0;k<n;k++) {
      const e=edges[(first+k)%n];
      if(e.axis) {
        if(chain){pieces.push({closed:false,points:chain});chain=null;}
        lines.push(e.axis==='h'?{axis:'h',c:(e.a.y+e.b.y)/2,lo:Math.min(e.a.x,e.b.x),hi:Math.max(e.a.x,e.b.x)}:{axis:'v',c:(e.a.x+e.b.x)/2,lo:Math.min(e.a.y,e.b.y),hi:Math.max(e.a.y,e.b.y)});
      } else {if(!chain)chain=[e.a];chain.push(e.b);}
    }
    if(chain)pieces.push({closed:false,points:chain});
  }
  const merged=[],seg=(axis,c,lo,hi)=>({closed:false,points:axis==='h'?[{x:lo,y:c},{x:hi,y:c}]:[{x:c,y:lo},{x:c,y:hi}]});
  for(const axis of ['h','v']) {
    const ls=lines.filter(l=>l.axis===axis).sort((p,q)=>p.c-q.c||p.lo-q.lo);
    for(let i=0;i<ls.length;) {
      let j=i;while(j<ls.length&&ls[j].c-ls[i].c<=tol)j++;
      const c=ls[i].c,iv=ls.slice(i,j).sort((p,q)=>p.lo-q.lo);let lo=iv[0].lo,hi=iv[0].hi;
      for(const v of iv.slice(1)){if(v.lo<=hi+tol)hi=Math.max(hi,v.hi);else{merged.push(seg(axis,c,lo,hi));lo=v.lo;hi=v.hi;}}
      merged.push(seg(axis,c,lo,hi));i=j;
    }
  }
  const open=[...merged,...pieces.filter(p=>!p.closed)],paths=[...joinPaths(open,tol*2),...pieces.filter(p=>p.closed)];
  return {paths,before,after:paths.reduce((s,p)=>s+pathLength(p.points,p.closed),0),sharedLines:merged.length};
}
// 端點相接的片段串成較長折線（不改變總長），減少雷射／CNC 下刀次數。
function joinPaths(pieces,tol) {
  const cell=0.01,grid=new Map(),used=pieces.map(()=>false),key=(x,y)=>`${x},${y}`;
  pieces.forEach((s,i)=>[[s.points[0],0],[s.points[s.points.length-1],1]].forEach(([p,end])=>{const k=key(Math.round(p.x/cell),Math.round(p.y/cell));if(!grid.has(k))grid.set(k,[]);grid.get(k).push({i,end});}));
  const find=p=>{
    const gx=Math.round(p.x/cell),gy=Math.round(p.y/cell);let best=null;
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const c of grid.get(key(gx+dx,gy+dy))||[]) {
      if(used[c.i])continue;const pts=pieces[c.i].points,q=c.end?pts[pts.length-1]:pts[0];
      if(dist(p,q)<=tol&&(!best||c.i<best.i||(c.i===best.i&&c.end<best.end)))best=c;
    }
    return best;
  };
  const out=[];
  for(let i=0;i<pieces.length;i++) {
    if(used[i])continue;used[i]=true;let pts=pieces[i].points.slice();
    for(let pass=0;pass<2;pass++) {
      for(;;){const c=find(pts[pts.length-1]);if(!c)break;used[c.i]=true;const next=c.end?pieces[c.i].points.slice().reverse():pieces[c.i].points;pts.push(...next.slice(1));}
      pts.reverse();
    }
    const closed=pts.length>2&&dist(pts[0],pts[pts.length-1])<=tol;if(closed)pts.pop();
    out.push({closed,points:pts});
  }
  return out;
}

/* ---------- CNC：外形向外偏移 D/2 的刀心路徑 ---------- */
function orient(a,b,c){return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);}
function segmentsTouch(p1,p2,q1,q2) {
  const e=1e-12,d1=orient(q1,q2,p1),d2=orient(q1,q2,p2),d3=orient(p1,p2,q1),d4=orient(p1,p2,q2);
  if(((d1>e&&d2<-e)||(d1<-e&&d2>e))&&((d3>e&&d4<-e)||(d3<-e&&d4>e)))return true;
  const on=(a,b,c,d)=>Math.abs(d)<=e&&Math.min(a.x,b.x)-EPS<=c.x&&c.x<=Math.max(a.x,b.x)+EPS&&Math.min(a.y,b.y)-EPS<=c.y&&c.y<=Math.max(a.y,b.y)+EPS;
  return on(q1,q2,p1,d1)||on(q1,q2,p2,d2)||on(p1,p2,q1,d3)||on(p1,p2,q2,d4);
}
export function ringSelfIntersects(pts) {
  const n=pts.length,segs=[];
  for(let i=0;i<n;i++){const a=pts[i],b=pts[(i+1)%n];segs.push({i,a,b,x0:Math.min(a.x,b.x),x1:Math.max(a.x,b.x),y0:Math.min(a.y,b.y),y1:Math.max(a.y,b.y)});}
  segs.sort((s,t)=>s.x0-t.x0);
  for(let k=0;k<segs.length;k++)for(let m=k+1;m<segs.length&&segs[m].x0<=segs[k].x1+EPS;m++) {
    const s=segs[k],t=segs[m];if(t.y0>s.y1+EPS||t.y1<s.y0-EPS)continue;
    const di=Math.abs(s.i-t.i);if(di===1||di===n-1)continue;
    if(segmentsTouch(s.a,s.b,t.a,t.b))return true;
  }
  return false;
}
function pointSegmentDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l)):0;return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
// 凸角補圓弧、凹角取兩條偏移線交點；任何折返、自交或離原輪廓不足 d 都視為無法安全偏移。
export function offsetRing(ring,d,{stepDeg=10}={}) {
  let p=cleanRing(ring);if(p.length<3)return {ok:false,reason:'頂點不足'};
  if(signedArea(p)<0)p=p.slice().reverse();
  const n=p.length,U=[],N=[];
  for(let i=0;i<n;i++){const a=p[i],b=p[(i+1)%n],l=dist(a,b),u={x:(b.x-a.x)/l,y:(b.y-a.y)/l};U.push(u);N.push({x:u.y,y:-u.x});}
  const raw=[],first=[],last=[];
  for(let i=0;i<n;i++) {
    const v=p[i],u0=U[(i+n-1)%n],u1=U[i],n0=N[(i+n-1)%n],n1=N[i],cross=u0.x*u1.y-u0.y*u1.x,dot=u0.x*u1.x+u0.y*u1.y;
    first[i]=raw.length;
    if(cross>1e-12) {
      const sweep=Math.atan2(cross,dot),a0=Math.atan2(n0.y,n0.x),steps=Math.max(1,Math.ceil(sweep/(stepDeg*Math.PI/180)));
      for(let k=0;k<=steps;k++){const a=a0+sweep*k/steps;raw.push({x:v.x+d*Math.cos(a),y:v.y+d*Math.sin(a)});}
    } else if(cross<-1e-12||dot>0) {
      const den=1+n0.x*n1.x+n0.y*n1.y;if(den<1e-6)return {ok:false,reason:'凹角過尖'};
      raw.push({x:v.x+d*(n0.x+n1.x)/den,y:v.y+d*(n0.y+n1.y)/den});
    } else return {ok:false,reason:'輪廓折返'};
    last[i]=raw.length-1;
  }
  for(let i=0;i<n;i++){const a=raw[last[i]],b=raw[first[(i+1)%n]];if((b.x-a.x)*U[i].x+(b.y-a.y)*U[i].y<-1e-9)return {ok:false,reason:'細部窄於刀具直徑'};}
  const out=cleanRing(raw);
  if(ringSelfIntersects(out))return {ok:false,reason:'偏移路徑自交（細部窄於刀具直徑）'};
  for(const q of out){let m=Infinity;for(let i=0;i<n&&m>=d-1e-6;i++)m=Math.min(m,pointSegmentDistance(q,p[i],p[(i+1)%n]));if(m<d-1e-6)return {ok:false,reason:'刀具會切入零件'};}
  return {ok:true,points:out};
}

/* ---------- 零件名稱標示（不碰切割線） ---------- */
function textWidth(s,h){let w=0;for(const ch of String(s))w+=ch.codePointAt(0)>0x2e7f?h:0.72*h;return w;}
function rectHitsSegment(r,a,b) {
  const inR=p=>p.x>=r.x0&&p.x<=r.x1&&p.y>=r.y0&&p.y<=r.y1;
  if(inR(a)||inR(b))return true;
  const c=[{x:r.x0,y:r.y0},{x:r.x1,y:r.y0},{x:r.x1,y:r.y1},{x:r.x0,y:r.y1}];
  return c.some((q,i)=>segmentsTouch(a,b,q,c[(i+1)%4]));
}
function labelSpot(label,rings,inner) {
  const bb=bboxOf(rings.flat()),cx=(bb.x0+bb.x1)/2,cy=(bb.y0+bb.y1)/2,gap=0.4,segs=[],circles=[],holes=[];
  for(const r of rings)r.forEach((q,i)=>segs.push([q,r[(i+1)%r.length]]));
  for(const e of inner) {
    if(e.type==='CIRCLE')circles.push(e);
    else if(e.type==='TEXT')continue;
    else {
      const pts=e.type==='LWPOLYLINE'?e.points:e.type==='LINE'?[{x:e.x,y:e.y},{x:e.x2,y:e.y2}]:arcToPoints(e),closed=e.type==='LWPOLYLINE'&&e.closed;
      for(let i=0;i+1<pts.length;i++)segs.push([pts[i],pts[i+1]]);
      if(closed){segs.push([pts[pts.length-1],pts[0]]);holes.push(pts);}
    }
  }
  const sb=segs.map(([a,b])=>({a,b,x0:Math.min(a.x,b.x),x1:Math.max(a.x,b.x),y0:Math.min(a.y,b.y),y1:Math.max(a.y,b.y)}));
  for(const h of [3,2.5,2,1.5]) {
    const w=textWidth(label,h)+2*gap,ht=h*1.3+2*gap;
    if(w>bb.x1-bb.x0||ht>bb.y1-bb.y0)continue;
    const step=Math.max(0.25,Math.min(bb.x1-bb.x0,bb.y1-bb.y0)/24),cand=[];
    for(let x=bb.x0;x+w<=bb.x1+EPS;x+=step)for(let y=bb.y0;y+ht<=bb.y1+EPS;y+=step)cand.push({x,y,dd:(x+w/2-cx)**2+(y+ht/2-cy)**2});
    cand.sort((a,b)=>a.dd-b.dd||a.x-b.x||a.y-b.y);
    for(const q of cand) {
      const r={x0:q.x,y0:q.y,x1:q.x+w,y1:q.y+ht},corners=[{x:r.x0,y:r.y0},{x:r.x1,y:r.y0},{x:r.x1,y:r.y1},{x:r.x0,y:r.y1}];
      if(!corners.every(c=>rings.some(ring=>pointInRing(c,ring)))||corners.some(c=>holes.some(hole=>pointInRing(c,hole))))continue;
      if(circles.some(c=>Math.hypot(c.x-Math.max(r.x0,Math.min(c.x,r.x1)),c.y-Math.max(r.y0,Math.min(c.y,r.y1)))<c.r))continue;
      if(sb.some(s=>!(s.x1<r.x0||s.x0>r.x1||s.y1<r.y0||s.y0>r.y1)&&rectHitsSegment(r,s.a,s.b)))continue;
      return {x:q.x+gap,y:q.y+gap+h*0.3,h};
    }
  }
  return null;
}

/* ---------- 轉置 ---------- */
const rotPt=(p,rot)=>rot?{x:-p.y,y:p.x}:{x:p.x,y:p.y};
const placePt=(p,pl)=>{const q=rotPt(p,pl.rot);return {x:q.x+pl.dx,y:q.y+pl.dy};};
function placeEntity(e,pl) {
  const turn=pl.rot?90:0;
  if(e.type==='LWPOLYLINE')return {...e,points:e.points.map(p=>placePt(p,pl))};
  if(e.type==='LINE'){const a=placePt(e,pl),b=placePt({x:e.x2,y:e.y2},pl);return {...e,x:a.x,y:a.y,x2:b.x,y2:b.y};}
  const c=placePt(e,pl);
  if(e.type==='ARC')return {...e,...c,a1:(e.a1||0)+turn,a2:(e.a2||0)+turn};
  if(e.type==='TEXT')return {...e,...c,angle:(e.angle||0)+turn};
  return {...e,...c};
}

/* ---------- DXF 輸出 ---------- */
const num=v=>{const r=Math.round(v*1e4)/1e4;return String(Object.is(r,-0)?0:r);};
const clean=s=>String(s).replace(/[\r\n]+/g,' ');
function writeEntity(rows,e,layer=e.layer) {
  if(e.type==='LWPOLYLINE'){rows.push('0','LWPOLYLINE','8',layer,'90',String(e.points.length),'70',e.closed?'1':'0');for(const p of e.points)rows.push('10',num(p.x),'20',num(p.y));}
  else if(e.type==='CIRCLE')rows.push('0','CIRCLE','8',layer,'10',num(e.x),'20',num(e.y),'30','0','40',num(e.r));
  else if(e.type==='LINE')rows.push('0','LINE','8',layer,'10',num(e.x),'20',num(e.y),'30','0','11',num(e.x2),'21',num(e.y2),'31','0');
  else if(e.type==='ARC')rows.push('0','ARC','8',layer,'10',num(e.x),'20',num(e.y),'30','0','40',num(e.r),'50',num(e.a1||0),'51',num(e.a2||0));
  else if(e.type==='TEXT')rows.push('0','TEXT','8',layer,'10',num(e.x),'20',num(e.y),'30','0','40',num(e.h||2.5),'1',clean(e.text??''),...(e.angle?['50',num(e.angle)]:[]));
}
export const NEST_LAYER_NOTES=Object.freeze({
  laser:[['內部圖層（HOLE、MG995_*、TT_* 等）','孔與內部開口，先切'],['INNER_CUT','零件內圈外形（環形件），先切'],['CUT','外形；共用邊只畫一次，最後切'],['LABEL','零件名稱，不切（可雕刻）'],['SHEET','板材外框，不切']],
  cnc:[['內部圖層（HOLE、MG995_*、TT_* 等）','孔與內部開口，CAM 照逐件檔一樣向內偏移'],['INNER_CUT','零件內圈外形，CAM 向內偏移'],['CNC_ONLINE','刀心路徑：沿線切（On line），CAM 不要再偏移'],['CNC_OUTSIDE','無法安全預先偏移的真實外形：CAM 向外偏移'],['PART_REF','真實零件外形，只供參考，不切'],['LABEL','零件名稱，不切'],['SHEET','板材外框，不切']]
});
const ASCII_LAYER_NOTES={
  laser:['inner layers (HOLE, MG995_*, TT_* ...): holes and cutouts, cut FIRST','INNER_CUT: inner contour of ring parts, cut first','CUT: outer contours, common lines drawn ONCE, cut LAST','LABEL: part names, do not cut','SHEET: sheet border, do not cut','KERF: not compensated - set kerf offset in the laser software'],
  cnc:['inner layers (HOLE, MG995_*, TT_* ...): CAM inside offset as in per-part files','INNER_CUT: inner contour of ring parts, CAM inside offset','CNC_ONLINE: tool-centre path, cut ON the line, NO CAM offset','CNC_OUTSIDE: true outline that could not be pre-offset, CAM OUTSIDE offset','PART_REF: true part outlines, reference only, do not cut','LABEL: part names, do not cut','SHEET: sheet border, do not cut','NO HOLDING TABS - fix the stock with screws, tape or vacuum']
};

export function nestFileName(baseName,method,sheetW,sheetH) {
  const base=String(baseName||'機構作品').replace(/[\\/:*?"<>|\r\n]+/g,'_').trim()||'機構作品';
  return `${base}-${method==='cnc'?'CNC':'雷切'}-${num(sheetW)}x${num(sheetH)}.dxf`;
}

// files：prepareScopedExport 的逐件 DXF（{text,name,sourceIds}）。回傳一份合併檔與統計。
export function buildNestedDxf(files,{method='laser',sheetW=NEST_DEFAULTS.sheetW,sheetH=NEST_DEFAULTS.sheetH,toolDiameterMm=FABRICATION_DEFAULTS.cnc.toolDiameterMm,defaultThicknessMm=FABRICATION_DEFAULTS.cnc.stockThicknessMm,baseName='機構作品'}={}) {
  if(!(method in NEST_METHODS))throw Error('未知的合併方式。');
  sheetW=Number(sheetW);sheetH=Number(sheetH);
  if(!(sheetW>=20&&sheetH>=20&&sheetW<=5000&&sheetH<=5000))throw Error('板材長、寬請輸入 20–5000 mm。');
  const cnc=method==='cnc',D=Number(toolDiameterMm);
  if(cnc&&!(D>0))throw Error('刀具直徑無效，請到加工設定修正。');
  const dxfFiles=files.filter(f=>/\.dxf$/i.test(f.name));
  if(!dxfFiles.length)throw Error('沒有可合併的 DXF 零件。');
  const gap=cnc?D:0,margin=Math.max(NEST_DEFAULTS.marginMm,cnc?D:0);
  const parts=[];
  for(const f of dxfFiles) {
    const part=partFromDxf(f);
    if(cnc){const paths=part.outer.map(r=>offsetRing(r,D/2));part.fallbackReason=paths.find(r=>!r.ok)?.reason||null;part.toolPaths=part.fallbackReason?null:paths.map(r=>r.points);}
    const bb=bboxOf(part.outer.flat());
    for(let k=1;k<=part.quantity;k++)parts.push({...part,label:part.quantity>1?`${part.name} (${k}/${part.quantity})`:part.name,bb,pad:cnc&&part.fallbackReason?D/2:0,thicknessMm:part.thicknessMm??defaultThicknessMm});
  }
  const thicknesses=[...new Set(parts.map(p=>p.thicknessMm))].sort((a,b)=>a-b),sheets=[];
  for(const t of thicknesses) {
    const group=parts.filter(p=>p.thicknessMm===t);
    const packed=packRects(group.map(p=>({name:p.label,w:p.bb.x1-p.bb.x0,h:p.bb.y1-p.bb.y0,pad:p.pad})),{sheetW,sheetH,marginMm:margin,gapMm:gap});
    const base=sheets.length;
    for(let s=0;s<packed.sheetCount;s++)sheets.push({index:sheets.length,x0:sheets.length*(sheetW+NEST_DEFAULTS.sheetGapMm),thicknessMm:t});
    group.forEach((p,i)=>{
      const pl=packed.placements[i],sheet=sheets[base+pl.sheet],rb=bboxOf(p.outer.flat().map(q=>rotPt(q,pl.rot)));
      p.sheet=sheet;p.place={rot:pl.rot,dx:sheet.x0+pl.x+p.pad-rb.x0,dy:pl.y+p.pad-rb.y0};
      p.placedOuter=p.outer.map(r=>r.map(q=>placePt(q,p.place)));
      p.placedInner=p.inner.map(e=>placeEntity(e,p.place));
      p.placedPaths=p.toolPaths?.map(r=>r.map(q=>placePt(q,p.place)))||null;
    });
  }
  const cutRings=cnc?parts.filter(p=>p.placedPaths).flatMap(p=>p.placedPaths):parts.flatMap(p=>p.placedOuter);
  const merged=mergeCommonLines(cutRings);
  const fallback=parts.filter(p=>cnc&&p.fallbackReason),unlabeled=[];
  const rows=[],note=s=>rows.push('999',clean(s));
  note(`CADCAM NESTED DXF method=${method} units=mm sheets=${sheets.length} sheet=${num(sheetW)}x${num(sheetH)} margin=${num(margin)} gap=${num(gap)}${cnc?` toolDiameter=${num(D)}`:''}`);
  for(const line of ASCII_LAYER_NOTES[method])note('LAYER '+line);
  note(`OUTER CUT LENGTH before=${num(merged.before)} after=${num(merged.after)} saved=${num(merged.before-merged.after)}`);
  for(const p of parts)note(`PART ${p.label} sheet=${p.sheet.index+1} rot=${p.place.rot} dx=${num(p.place.dx)} dy=${num(p.place.dy)} thickness=${num(p.thicknessMm)} source=${p.file}${p.stock?` ${p.stock}`:''}${p.fallbackReason?' CNC_OUTSIDE':''}`);
  rows.push('0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC','0','SECTION','2','ENTITIES');
  for(const s of sheets) {
    writeEntity(rows,{type:'LWPOLYLINE',closed:true,points:[{x:s.x0,y:0},{x:s.x0+sheetW,y:0},{x:s.x0+sheetW,y:sheetH},{x:s.x0,y:sheetH}]},'SHEET');
    writeEntity(rows,{type:'TEXT',x:s.x0,y:sheetH+4,h:5,text:`板材 ${s.index+1}/${sheets.length}  ${num(sheetW)}x${num(sheetH)} mm  板厚 ${num(s.thicknessMm)} mm  ${cnc?`CNC D=${num(D)} mm`:'雷射切割'}`},'LABEL');
  }
  for(const p of parts) {
    const spot=labelSpot(p.label,p.placedOuter,p.placedInner);
    if(spot)writeEntity(rows,{type:'TEXT',x:spot.x,y:spot.y,h:spot.h,text:p.label},'LABEL');else unlabeled.push(p);
  }
  for(const s of sheets) {
    const list=unlabeled.filter(p=>p.sheet===s);if(!list.length)continue;
    writeEntity(rows,{type:'TEXT',x:s.x0,y:-8,h:3.5,text:'未標名零件（中心座標，以板材左下角為原點）：'},'LABEL');
    list.forEach((p,i)=>{const bb=bboxOf(p.placedOuter.flat());writeEntity(rows,{type:'TEXT',x:s.x0,y:-14-i*5,h:3,text:`${p.label} @ (${num((bb.x0+bb.x1)/2-s.x0)}, ${num((bb.y0+bb.y1)/2)})`},'LABEL');});
  }
  for(const p of parts)for(const e of p.placedInner)writeEntity(rows,e);
  if(cnc)for(const p of parts)for(const r of p.placedOuter)writeEntity(rows,{type:'LWPOLYLINE',closed:true,points:r},p.fallbackReason?'CNC_OUTSIDE':'PART_REF');
  for(const path of merged.paths)writeEntity(rows,{type:'LWPOLYLINE',...path},cnc?'CNC_ONLINE':'CUT');
  rows.push('0','ENDSEC','0','EOF');
  const fallbackLength=fallback.reduce((s,p)=>s+p.placedOuter.reduce((t,r)=>t+pathLength(r,true),0),0);
  return {text:rows.join('\n'),name:nestFileName(baseName,method,sheetW,sheetH),mime:'application/dxf',method,
    sourceIds:[...new Set(parts.flatMap(p=>p.sourceIds))],sourceFiles:dxfFiles.map(f=>f.name),parts:parts.map(p=>p.label),
    sheets:sheets.length,thicknesses,cutBeforeMm:merged.before,cutAfterMm:merged.after,savedMm:merged.before-merged.after,
    fallback:fallback.map(p=>({name:p.label,reason:p.fallbackReason})),fallbackLengthMm:fallbackLength,unlabeled:unlabeled.map(p=>p.label),
    toolDiameterMm:cnc?D:null,gapMm:gap,marginMm:margin,
    placements:parts.map(p=>({name:p.label,sheet:p.sheet.index,rot:p.place.rot,bbox:bboxOf(p.placedOuter.flat()),pad:p.pad}))};
}

// 對話框用：逐件匯出結果 → 合併檔與要顯示的說明。
export function nestedExportSummary(nested) {
  const lines=[`共 ${nested.sheets} 張板材`,`共用邊省下 ${fmt(nested.savedMm)} mm 切割路徑（${nested.method==='cnc'?'刀心路徑':'外形切割'} ${fmt(nested.cutBeforeMm)} → ${fmt(nested.cutAfterMm)} mm${nested.fallback.length?'，不含 CNC_OUTSIDE 零件':''}）`];
  if(nested.method==='laser')lines.push('零件緊貼排列（間距 0），共用直邊只畫一次。雷射切縫（kerf）補償沒有計入，請在雷射軟體設定。');
  else lines.push(`刀具直徑 D = ${Math.round(nested.toolDiameterMm*1000)/1000} mm（加工設定）；零件間距 D，CNC_ONLINE 是已偏移 D/2 的刀心路徑，CAM 請設「沿線切割」不要再偏移；孔與內部開口照原圖層由 CAM 向內加工。沒有加固定橋（tabs），請用螺絲、雙面膠或真空吸附固定料件。`);
  if(nested.thicknesses.length>1)lines.push(`零件板厚不同（${nested.thicknesses.map(t=>`${t} mm`).join('、')}），已分開排在不同板材。`);
  if(nested.fallback.length)lines.push(`以下零件外形無法安全預先偏移，改放 CNC_OUTSIDE 圖層（由 CAM 向外偏移）並多留間距：${nested.fallback.map(f=>`${f.name}（${f.reason}）`).join('、')}`);
  if(nested.unlabeled.length)lines.push(`零件內放不下名稱：${nested.unlabeled.join('、')}；名稱改列在板材下方的圖例。`);
  lines.push('圖層：'+NEST_LAYER_NOTES[nested.method].map(([k,v])=>`${k}＝${v}`).join('；'));
  return lines;
}

export function nestBaseName(source,{scope,focus}={}) {
  const modules=source?.modules||[];
  if(scope==='design'){const m=modules.find(x=>x.id===focus);if(m?.name)return m.name;}
  return modules.map(m=>m&&m.name).filter(Boolean).join('＋')||'機構作品';
}
