import {traceSweeps,traceSweepRange,tracesFromResults} from './motion.js';
import {sweepAssembly} from './assembly.js';
import {planSyringeStroke} from './syringe-operations.js';
import {planAssemblySyringe} from './assembly-syringe.js';

// Sample outwards from the current valid pose. Never jump across an unreachable
// interval or substitute the previous pose for a failed sample. Work is read-only.
export function sampleStroke({stroke,current,solve,segments=48}){
  if(!(stroke>0)||!Number.isFinite(stroke)||!Number.isFinite(current)||current<0||current>stroke)return [];
  const first=solve(current,null),frame=(value,r)=>({inputValue:value,inputUnit:'mm',isValid:!!r.ok,points:r.ok?r.points:null});
  if(!first.ok)return [frame(current,first)];
  const walk=end=>{
    const count=Math.ceil(Math.abs(end-current)/stroke*segments),out=[];let previous=first.points;
    for(let i=1;i<=count;i++){
      const value=current+(end-current)*i/count,r=solve(value,previous);out.push(frame(value,r));
      if(!r.ok)break;
      previous=r.points;
    }
    return out;
  };
  return [...walk(0).reverse(),frame(current,first),...walk(stroke)];
}

export function scopeTrajectories({scope,params,ids,syringeId,motion,range,sweepMotor}){
  if(!ids.length)return [];
  const syringe=scope.comps.find(c=>c.type==='syringe'&&c.id===syringeId);
  if(syringe){
    const results=sampleStroke({stroke:syringe.spec.stroke,current:syringe.extension,
      solve:(extension,previous)=>scope.assembly
        ?planAssemblySyringe(scope.comps,scope.modules,params,syringe.id,extension,previous,motion)
        :planSyringeStroke(scope.comps,params,syringe.id,extension,previous,motion)});
    return tracesFromResults(results,ids);
  }
  // 伺服與線性致動器只在自己的有限行程內運動；量測不應誤把不存在的整圈算進去。
  // S2：軌跡點共用同一份 compiled，只 sweep 一次，再取出每個追蹤點。
  // S2b：範圍太窄時 5° 取不到足夠取樣點，沿用 traceSweepRange 算出的步長。
  const {start,end,step}=traceSweepRange(range?.lo??0,range?.hi??360);
  return traceSweeps(scope.compiled,{...(scope.compiled.params||params),motorAngles:motion.motorAngles,sweepMotor},ids,start,end,step,
    scope.assembly?(c,p,s,e,st)=>sweepAssembly(scope.assembly,p,s,e,st):undefined);
}
