/** Shape lifetime protocol. Pose/camera/appearance never enter the retained key. */
export function createAsyncResource(load){let pending=null;return {get(){return pending ||= Promise.resolve().then(load).catch(e=>{pending=null;throw e;});}};}
export function retainedSceneKey(model){
 if(!model?.geometryKey||!model.materialParts?.length)return null;
 const scopes=[['',model],...(model.orthogonal || []).map(c=>[c.id,c.model])];
 const records=[];
 for(const [id,m] of scopes){
  if(!m)return null;
  if(['rails','carriages','racks','cams','pulleys','belts'].some(k=>m[k]?.length))return null;
  if(['sticks','plates','modulePlates','gears'].some(k=>m[k]?.some(p=>!p.materialPartId))||m.frame&&!m.frame.materialPartId)return null;
  records.push([id,(m.motors || []).map(p=>[p.id,p.type,p.mountZ,p.baseZ,p.shaftTopZ]),
   (m.pins || []).map(p=>[p.id,p.r,p.z0,p.z1,p.ground]),(m.gears || []).map(g=>[g.id,g.thickness,g.pinHoleDiameter,g.z])]);
 }
 if((model.brackets || []).some(p=>!p.materialPartId)||(model.screws || []).some(p=>!p.materialPartId))return null;
 return JSON.stringify([model.geometryKey,model.materialParts.map(p=>[p.partId,p.pickKey,p.color]),records]);
}
export function createSceneLifetime(){
 let key=null,alive=false,builds=0,reuses=0,retirements=0;
 return {begin(next){const reuse=alive&&next!==null&&key===next;if(reuse)reuses++;else {if(alive)retirements++;builds++;}key=next;alive=true;return reuse;},retire(){if(alive)retirements++;alive=false;key=null;},stats:()=>({builds,reuses,retirements,alive,key})};
}
