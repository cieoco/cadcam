/** Temporary representation only. Originals are restored before rebuild or leaving face picking. */
export function createSurfacePickFocus(root){
 let key=null;const originals=new Map(),clones=new Map(),sources=new Map();
 const release=()=>{for(const [object,material]of originals)object.material=material;originals.clear();for(const material of clones.values())material.dispose();clones.clear();sources.clear();};
 const ownerKey=object=>{for(let o=object;o&&o!==root;o=o.parent)if(o.userData?.pickKey!==undefined)return o.userData.pickKey;return null;};
 const apply=()=>{if(!key)return;root.traverse(object=>{if(!object.material||ownerKey(object)===key)return;
  const current=object.material,previous=originals.get(object),base=m=>sources.get(m) || m;
  const original=Array.isArray(current)&&current.some(m=>sources.has(m))?(Array.isArray(previous)?previous:current.map(base)):Array.isArray(current)?current:base(current);
  originals.set(object,original);
  const dim=material=>{if(!clones.has(material)){const clone=material.clone();clone.transparent=true;clone.opacity=Math.min(material.opacity ?? 1,.07);clone.depthWrite=false;clones.set(material,clone);sources.set(clone,material);}return clones.get(material);};
  object.material=Array.isArray(original)?original.map(dim):dim(original);
 });};
 return {get key(){return key;},allows(value){return !key||value===key;},set(value){value=typeof value==='string'&&value?value:null;if(value===key)return;release();key=value;apply();},beforeRebuild:release,afterRebuild:apply,refresh:apply,dispose(){release();key=null;}};
}
