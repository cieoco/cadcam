/** Shared two-hole gears are one rigid body, as in the existing Blocks DOF rule.
 * A shared center alone is NOT a shaft lock. No example IDs or stored solver steps.
 */
export const sameGearBody=(a,b)=>!!(a?.p1?.id&&a?.p2?.id&&a.p1.id===b?.p1?.id&&a.p2.id===b?.p2?.id);

export function gearTrain(comps=[],parameters=null){
 const params=parameters||{};
 const gears=comps.filter(c=>c.type==='gear'),byId=new Map(gears.map(g=>[g.id,g]));
 const groups=new Map(),groupOf=new Map(),states=new Map();let reason='';
 const radius=g=>Number(params[g.radiusParam])||Number(g.radius)||Number(g.teeth)*Number(g.module)/2||40;
 const pin=g=>g.pinRadiusParam?Number(params[g.pinRadiusParam]):Number(g.pinRadius)||radius(g)*.6;
 for(const g of gears){const key=JSON.stringify([g.p1?.id,g.p2?.id]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(g);groupOf.set(g.id,key);}
 for(const list of groups.values())if(list.length>1){
  const first=list[0];
  if(list.some(g=>(parameters!==null&&(!Number.isFinite(pin(g))||Math.abs(pin(g)-pin(first))>1e-6))||Math.abs(((Number(g.phase)||0)-(Number(first.phase)||0))%360)>1e-6))reason='共軸齒輪的共用定位孔距或起始角度不一致';
 }
 const resolve=(key,seen=new Set())=>{
  if(states.has(key))return states.get(key);
  if(seen.has(key)){reason='齒輪傳動形成循環，請檢查嚙合與共用定位孔';return null;}
  const list=groups.get(key)||[],incoming=list.filter(g=>g.mesh);
  if(incoming.length>1){reason='同一共軸剛體有多個嚙合輸入，尚不支援此閉環';return null;}
  let state;
  if(!incoming.length){
   const motors=list.filter(g=>g.p1?.physicalMotor||g.p1?.physical_motor);
   if(new Set(motors.map(g=>String(g.p1.physicalMotor||g.p1.physical_motor))).size>1){reason='同一共軸剛體不能有不同馬達輸入';return null;}
   state={root:motors[0]||list[0],factor:1,depth:0};
  }else{
   const g=incoming[0],driver=byId.get(g.mesh);
   if(!driver){reason='找不到齒輪的嚙合輸入';return null;}
   if(list.length>1&&list.some(x=>x.p1?.physicalMotor||x.p1?.physical_motor)){reason='共軸從動輪不能另外安裝輸入馬達';return null;}
   const next=new Set(seen);next.add(key);const parent=resolve(groupOf.get(driver.id),next);
   if(!parent)return null;
   state={root:parent.root,factor:parent.factor*-radius(driver)/radius(g),depth:parent.depth+1};
  }
  states.set(key,state);return state;
 };
 gears.forEach(g=>resolve(groupOf.get(g.id)));
 return {reason,state:g=>reason?null:states.get(groupOf.get(typeof g==='string'?g:g?.id)),groups:[...groups.values()]};
}

// Actual meshes occupy one plane. Compound stages occupy distinct planes;
// independent ordinary trains retain their existing -1 layer. Layer -2 is the
// existing frame plate; keep it clear instead of drawing a gear through it.
export function gearLayers(comps=[]){
 const gears=comps.filter(c=>c.type==='gear'),byId=new Map(gears.map(g=>[g.id,g])),plane=new Map(),members=[];
 const drive=gearTrain(comps);
 for(const g of [...gears].sort((a,b)=>(drive.state(a)?.depth||0)-(drive.state(b)?.depth||0)||a.id.localeCompare(b.id)))if(!plane.has(g.id)){
  const list=[],pending=[g];while(pending.length){const p=pending.pop();if(!p||plane.has(p.id))continue;plane.set(p.id,members.length);list.push(p);
   pending.push(byId.get(p.mesh),...gears.filter(x=>x.mesh===p.id));
  }members.push(list);
 }
 const connected=members.map(()=>new Set());
 for(const a of gears)for(const b of gears)if(a!==b&&sameGearBody(a,b)&&plane.get(a.id)!==plane.get(b.id))connected[plane.get(a.id)].add(plane.get(b.id));
 const layers=new Map(),visited=new Set();
 for(let i=0;i<members.length;i++)if(!visited.has(i)){
  const pending=[i];let depth=1;
  while(pending.length){const p=pending.shift();if(visited.has(p))continue;visited.add(p);members[p].forEach(g=>layers.set(g.id,depth===1?-1:-depth-1));depth++;
   pending.push(...[...connected[p]].sort((a,b)=>a-b));
  }
 }
 return layers;
}
