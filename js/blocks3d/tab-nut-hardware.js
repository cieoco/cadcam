/** The same plan that cuts both boards places the screw, washer and protruding nut. */
import {applyMatrix4} from './orthogonal-3d.js';
const circle=r=>Array.from({length:64},(_,i)=>({x:r*Math.cos(i*Math.PI/32),y:r*Math.sin(i*Math.PI/32)}));
export function attachTabNutHardware(materialParts,plans,comps){
  for(const plan of plans||[]){
    if(!plan.ok)continue;
    const part=materialParts.find(p=>p.partId===plan.child.compId),comp=comps.find(c=>c.id===plan.child.compId);
    if(!part||!comp)continue;
    const a=comp.p1,b=comp.p2,t=Math.atan2(b.y-a.y,b.x-a.x),c=Math.cos(t),s=Math.sin(t);
    for(const set of plan.sets){const p=set.settings;
    const local=q=>({x:(q.x-a.x)*c+(q.y-a.y)*s,y:-(q.x-a.x)*s+(q.y-a.y)*c,z:q.z+plan.tChild/2});
    const origin=set.local.origin,u=set.local.u,v=set.local.v;
    const world=(x,y,z)=>applyMatrix4(part.pose.matrix,local({x:origin.x+u.x*x+v.x*z,y:origin.y+u.y*x+v.y*z,z:-y}));
    const zero=world(0,0,0),axis=(x,y,z)=>{const q=world(x,y,z);return {x:q.x-zero.x,y:q.y-zero.y,z:q.z-zero.z};};
    const U=axis(1,0,0),V=axis(0,1,0),N=axis(0,0,1);
    const add=(suffix,kind,ring,depth,z,hole=0)=>{
      const id=`${set.connectionId}/${suffix}`,o=world(0,0,z),geometry={id,partId:id,kind,geometryVersion:1,thicknessMm:depth,outlines:[ring],holes:hole?[{x:0,y:0,r:hole/2}]:[],cutouts:[]};
      materialParts.push({partId:id,moduleId:plan.moduleId,pickKey:`${set.connectionId.replace('connection:','')}/tab-nut:${suffix}`,connectionId:set.connectionId,geometry,
        pose:{partId:id,matrix:[U.x,U.y,U.z,0,V.x,V.y,V.z,0,N.x,N.y,N.z,0,o.x,o.y,o.z,1]},color:suffix==='nut'?'#8a9198':'#4b5660'});
    };
    const start=-plan.tHost-p.washerThicknessMm;
    add('screw','screw',circle(1.5),p.screwLengthMm,start);
    add('head','screw-head',circle(p.headDiameterMm/2),p.headHeightMm,start-p.headHeightMm);
    add('washer','washer',circle(p.washerDiameterMm/2),p.washerThicknessMm,start,p.clearanceDiameterMm);
    // A small bore clearance represents the declared threaded fit, not thread strength.
    const radius=p.nutAcrossMm/Math.sqrt(3),hex=Array.from({length:6},(_,i)=>({x:radius*Math.cos(Math.PI/6+i*Math.PI/3),y:radius*Math.sin(Math.PI/6+i*Math.PI/3)}));
    add('nut','nut',hex,p.nutHeightMm,set.local.nutLo,3.1);
    }
  }
}
