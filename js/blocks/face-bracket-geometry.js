/** Pure right-angle bracket and paired drilling geometry in host/child XY frames. */
import { bracketLayout } from './bracket-layout.js';

export const FACE_BRACKET_SPEC = Object.freeze({ width: 7, hostLeg: 13, childLeg: 9.5, hostHole: 9.5, childHole: 6, diameter: 3.2, web: 2 });
export function normalizeBracketSelection(raw) {
  if (!raw || raw.enabled !== true || !raw.offsets || typeof raw.offsets !== 'object') return null;
  const offsets = {};
  for (const key of ['L1', 'R1', 'L2']) {
    const v = raw.offsets[key] ?? 0;
    if (!Number.isFinite(v) || Math.abs(v) > 10000) return null;
    offsets[key] = v;
  }
  const childPart = raw.childPart ?? 'frame';
  if (typeof childPart !== 'string' || !/^[\w.-]+$/.test(childPart)) return null;
  return { enabled: true, offsets, childPart };
}
const add = (a,b) => ({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const mul = (a,k) => ({x:a.x*k,y:a.y*k,z:a.z*k});
const dot = (a,b) => a.x*b.x+a.y*b.y+a.z*b.z;
const inside = (p, ring) => {
  let hit = false;
  for (let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a=ring[i],b=ring[j];
    if ((a.y>p.y)!==(b.y>p.y) && p.x < (b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) hit=!hit;
  }
  return hit;
};
const edgeDistance = (p,ring) => Math.min(...ring.map((a,i) => {
  const b=ring[(i+1)%ring.length],dx=b.x-a.x,dy=b.y-a.y;
  const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy || 1)));
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}));
function holeReason(surface,p,others=[]) {
  const K=FACE_BRACKET_SPEC, margin=K.diameter/2+K.web;
  if (!(surface.outlines || []).some(r => inside(p,r) && edgeDistance(p,r)>=margin-1e-7)) return '孔位超出材料或離邊太近';
  if ((surface.cutouts || []).some(c => inside(p,c.points) || edgeDistance(p,c.points)<margin)) return '孔位碰到槽口';
  if ([...(surface.holes || []),...others].some(h => Math.hypot(p.x-h.x,p.y-h.y)<(h.r || K.diameter/2)+margin)) return '孔位太靠近既有孔';
  return '';
}
// Check the whole footprint, including concave edges, instead of only its corners.
function footprintFits(surface, corner, along, across, length, toLocal) {
  const K=FACE_BRACKET_SPEC;
  for (let u=-K.width/2;u<=K.width/2+.01;u+=.5) for (let v=0;v<=length;v+=.5) {
    const p=toLocal(add(corner,add(mul(along,u),mul(across,v))));
    if (!(surface.outlines || []).some(r => inside(p,r) || edgeDistance(p,r)<1e-7) ||
        (surface.cutouts || []).some(c => inside(p,c.points))) return false;
  }
  return true;
}

/** Uses actual stock planes. Returns invalid candidates for red UI markers; never exports partial drilling. */
export function planFaceBrackets(host, child, transform, offsets={}, allowReverse=true) {
  const fail=reason=>({ok:false,reason,brackets:[],hostHoles:[],childHoles:[]});
  if (!host?.box || !child?.box || !transform?.rotation || !transform?.translation) return fail('缺少接合板資料');
  const R=transform.rotation,T=transform.translation,K=FACE_BRACKET_SPEC;
  if (![...R.flat(),...Object.values(T)].every(Number.isFinite)) return fail('接合座標無效');
  const normal={x:R[0][2],y:R[1][2],z:R[2][2]};
  if (Math.abs(normal.z)>1e-6) return fail('兩塊板不是直角，不能使用此角碼');
  const world=p=>add({x:dot({x:R[0][0],y:R[0][1],z:R[0][2]},p),y:dot({x:R[1][0],y:R[1][1],z:R[1][2]},p),z:dot({x:R[2][0],y:R[2][1],z:R[2][2]},p)},T);
  const local=p=>{const q=add(p,mul(T,-1));return {x:R[0][0]*q.x+R[1][0]*q.y+R[2][0]*q.z,y:R[0][1]*q.x+R[1][1]*q.y+R[2][1]*q.z,z:R[0][2]*q.x+R[1][2]*q.y+R[2][2]*q.z};};
  const along={x:-normal.y,y:normal.x,z:0};
  const hostPts=host.outlines.flat().map(p=>({...p,z:0}));
  const childPts=child.outlines.flat().map(p=>world({...p,z:0}));
  const lo=Math.max(Math.min(...hostPts.map(p=>dot(p,along))),Math.min(...childPts.map(p=>dot(p,along))));
  const hi=Math.min(Math.max(...hostPts.map(p=>dot(p,along))),Math.max(...childPts.map(p=>dot(p,along))));
  const slots=bracketLayout(hi-lo,offsets);
  if (!slots.length) return {...fail('接合區太小，或角碼偏移超出可用範圍'),span:hi-lo};
  const minZ=Math.min(...childPts.map(p=>p.z)),maxZ=Math.max(...childPts.map(p=>p.z));
  const sign=Math.abs(minZ-host.box.max.z)<=.05 ? 1 : Math.abs(maxZ-host.box.min.z)<=.05 ? -1 : 0;
  if (!sign) {
    if (allowReverse) {
      const rotation=R[0].map((_,i)=>R.map(row=>row[i]));
      const translation=local({x:0,y:0,z:0});
      const reverse=planFaceBrackets(child,host,{rotation,translation},offsets,false);
      if(reverse.brackets.length)return {...reverse,
        hostHoles:reverse.childHoles,childHoles:reverse.hostHoles,
        brackets:reverse.brackets.map(b=>({...b,corner:world(b.corner),
          hostHole:b.childHole,childHole:b.hostHole,childHoleWorld:world(b.hostHole),
          wings:[...b.wings].reverse().map(r=>r.map(world))}))};
    }
    return fail('兩板未貼齊或互相穿入；請調整接合位置與間距');
  }
  const z=sign>0?host.box.max.z:host.box.min.z, up={x:0,y:0,z:sign};
  const hostHoles=[],childHoles=[],brackets=[];
  for(const slot of slots) {
    const side=slot.side, cz=side>0?child.box.max.z:child.box.min.z;
    const plane=world({x:0,y:0,z:cz}), outward=mul(normal,side);
    const corner=add(add(mul(normal,dot(normal,plane)),mul(along,(lo+hi)/2+slot.at)),{x:0,y:0,z});
    const hp=add(corner,mul(outward,K.hostHole)), cw=add(corner,mul(up,K.childHole)), cp=local(cw);
    let reason=holeReason(host,hp,hostHoles) || holeReason(child,cp,childHoles);
    if (!reason && (!footprintFits(host,corner,along,outward,K.hostLeg,p=>p) || !footprintFits(child,corner,along,up,K.childLeg,local))) reason='角碼底面超出材料或碰到槽口';
    const wing=(axis,length)=>[-1,1].map(s=>add(corner,mul(along,s*K.width/2))).flatMap((p,i)=>i?[p,add(p,mul(axis,length))]:[add(p,mul(axis,length)),p]);
    brackets.push({id:slot.id,side,corner,hostHole:hp,childHole:cp,childHoleWorld:cw,wings:[wing(outward,K.hostLeg),wing(up,K.childLeg)],reason});
    hostHoles.push({...hp,r:K.diameter/2}); childHoles.push({...cp,r:K.diameter/2});
  }
  const invalid=brackets.find(b=>b.reason);
  return {span:hi-lo,ok:!invalid,reason:invalid?`${invalid.id}：${invalid.reason}`:'',brackets,hostHoles:invalid?[]:hostHoles,childHoles:invalid?[]:childHoles};
}
