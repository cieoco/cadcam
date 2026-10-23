/** Three labelled-in-order coupon pairs, intended for measurement before production. */
import {TAB_NUT_DEFAULTS,planTabNutGeometry} from './tab-nut-geometry.js';
import {solveFaceMate} from './face-mate.js';
import {svgForFrameGeometry,dxfForFrameGeometry} from './exporters.js';
const board=(w,h)=>({outlines:[[{x:-w/2,y:-h/2},{x:w/2,y:-h/2},{x:w/2,y:h/2},{x:-w/2,y:h/2}]],holes:[],cutouts:[],box:{min:{x:-w/2,y:-h/2,z:-1.5},max:{x:w/2,y:h/2,z:1.5}}});
export function tabNutCoupons(){
  const geometry={outlines:[],holes:[],cutouts:[]},rows=[];
  for(const [i,clearance] of [.05,.15,.25].entries()){
    const host=board(60,40),child=board(40,30),selection={hostFace:'top',childFace:'back',alignU:0,alignV:0,offsetU:0,offsetV:0,gap:0,quarterTurns:0,fastener:{...TAB_NUT_DEFAULTS,slotClearanceMm:clearance}};
    const plan=planTabNutGeometry({host,child,face:{...solveFaceMate({...selection,hostBox:host.box,childBox:child.box}),selection},connectionId:`coupon-${i+1}`});
    if(!plan.ok)throw Error(plan.reason);
    for(const [j,g] of [plan.hostGeometry,plan.childGeometry].entries()){
      const move=p=>({x:p.x+(j?100:35),y:p.y+25+i*55});
      geometry.outlines.push(...g.outlines.map(r=>r.map(move)));geometry.holes.push(...g.holes.map(h=>({...h,...move(h)})));geometry.cutouts.push(...g.cutouts.map(c=>({...c,points:c.points.map(move)})));
    }
    rows.push({row:i+1,clearanceMm:clearance,plan});
  }
  return {geometry,rows};
}
export function tabNutCouponFile(format='svg'){
  const {geometry}=tabNutCoupons(),title='3mm M3 TRIAL - rows y=25,80,135: clearance 0.05,0.15,0.25mm - NO KERF COMPENSATION';
  return format==='dxf'?dxfForFrameGeometry(geometry,title):svgForFrameGeometry(geometry,title);
}
