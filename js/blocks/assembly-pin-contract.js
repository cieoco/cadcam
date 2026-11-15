/** Optional v1 assembly pin; identities refer to existing drilled holes. */
import {identifiedHoles} from './part-hole-trace.js';
export function normalizeAssemblyPin(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||!['hostHole','childHole'].every(k=>typeof raw[k]==='string'&&raw[k].length>0&&raw[k].length<240&&!/[\x00-\x1f]/.test(raw[k]))||typeof raw.locked!=='boolean'||!Number.isFinite(raw.diameterMm)||raw.diameterMm<=0||raw.diameterMm>20)return null;
 return {hostHole:raw.hostHole,childHole:raw.childHole,locked:raw.locked,diameterMm:raw.diameterMm};
}
export function alignAssemblyPin(mate,host,child,pin){
 const h=identifiedHoles(host.surface.compId,host.surface.holes || []).find(h=>h.id===pin.hostHole),c=identifiedHoles(child.surface.compId,child.surface.holes || []).find(h=>h.id===pin.childHole);
 if(!h||!c)return {ok:false,reason:'原插銷孔已不存在，請重新點孔。'};
 if(pin.diameterMm>Math.min(h.r,c.r)*2+1e-6)return {ok:false,reason:'插銷直徑大於所選孔徑。'};
 if(Math.abs(Math.abs(mate.rotation[2][2])-1)>1e-6)return {ok:false,reason:'平行插銷需要兩片板的軸向一致。'};
 const center=s=>({x:(s.box.min.x+s.box.max.x)/2,y:(s.box.min.y+s.box.max.y)/2});
 const hc=center(host.surface),cc=center(child.surface),local=[c.x-cc.x,c.y-cc.y,0];
 return {...mate,translation:{...mate.translation,x:h.x-hc.x-mate.rotation[0].reduce((n,v,i)=>n+v*local[i],0),y:h.y-hc.y-mate.rotation[1].reduce((n,v,i)=>n+v*local[i],0)}};
}
