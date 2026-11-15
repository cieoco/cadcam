import {boxFaces,solveFaceMate} from './face-mate.js';
const xyz=['x','y','z'],ids=['right','left','front','back','top','bottom'];
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),arr=p=>xyz.map(k=>p[k]),rot=(r,p)=>r.map(row=>dot(row,p));
export function normalizeFaceRelations(raw){
 if(!Array.isArray(raw)||raw.length>6)return null;
 if(!raw.every(r=>r&&['mate','flush','center'].includes(r.kind)&&Number.isFinite(r.offsetMm)&&['hostFaces','childFaces'].every(k=>Array.isArray(r[k])&&r[k].length===(r.kind==='center'?2:1)&&r[k].every(id=>ids.includes(id))&&(r.kind!=='center'||r[k][0]!==r[k][1]))))return null;
 return raw.map(r=>({kind:r.kind,hostFaces:[...r.hostFaces],childFaces:[...r.childFaces],offsetMm:r.offsetMm}));
}
/** Simultaneous plane constraints. The ordering of relations never determines the result. */
export function solveFaceRelations(seed,{hostBox,childBox,relations}){
 const rules=normalizeFaceRelations(relations);if(!rules)return {ok:false,reason:'面關係格式無效。'};
 if(!rules.length)return seed;
 const hf=boxFaces(hostBox),cf=boxFaces(childBox),face=(list,id)=>list.find(f=>f.id===id);
 const conflict=(reason,indices=rules.map((_,i)=>i))=>({ok:false,reason,relationConflicts:indices});
 if(!hf.length||!cf.length)return conflict('找不到關係所選的板面。');
 for(const r of rules)if(r.kind==='center'&&['hostFaces','childFaces'].some((k,i)=>dot(arr(face(i?cf:hf,r[k][0]).n),arr(face(i?cf:hf,r[k][1]).n))>-.999999))return conflict('置中需要兩個物體各自相對的兩側面。');
 const ordered=rules.slice().sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 const fits=(R,subset=ordered)=>subset.every(r=>{const a=arr(face(hf,r.hostFaces[0]).n),b=rot(R,arr(face(cf,r.childFaces[0]).n)),d=dot(a,b);return r.kind==='center'?Math.abs(d)>.999999:Math.abs(d-(r.kind==='mate'?-1:1))<1e-6;});
 const candidates=[seed.rotation];
 for(const h of ids)for(const c of ids)for(let q=0;q<4;q++)candidates.push(solveFaceMate({hostBox,childBox,hostFace:h,childFace:c,quarterTurns:q}).rotation);
 const rotations=candidates.filter(r=>fits(r)).sort((a,b)=>{const score=r=>r.reduce((s,row,i)=>s+row.reduce((t,v,j)=>t+(v-seed.rotation[i][j])**2,0),0);return score(a)-score(b)||JSON.stringify(a).localeCompare(JSON.stringify(b));});
 if(!rotations.length){for(let i=0;i<rules.length;i++)for(let j=i+1;j<rules.length;j++)if(!candidates.some(R=>fits(R,[rules[i],rules[j]])))return conflict('面方向互相衝突，請檢查標示的關係。',[i,j]);return conflict('面方向互相衝突，請檢查標示的關係。');}
 const R=rotations[0],eq=[];
 for(const r of ordered){
  const h=face(hf,r.hostFaces[0]),c=face(cf,r.childFaces[0]),n=arr(h.n);
  const center=(list,keys)=>keys.length===1?arr(face(list,keys[0]).center):arr(face(list,keys[0]).center).map((v,i)=>(v+arr(face(list,keys[1]).center)[i])/2);
  const hp=center(hf,r.hostFaces),cp=rot(R,center(cf,r.childFaces));
  eq.push([...n,dot(n,hp)-dot(n,cp)+r.offsetMm]);
 }
 // Solve corrections from the seed; unconstrained directions keep their original position.
 const base=arr(seed.translation),rows=eq.map(e=>[...e.slice(0,3),e[3]-dot(e.slice(0,3),base)]),sources=ordered.map(r=>new Set([rules.indexOf(r)])),pivots=[];let row=0;
 for(let col=0;col<3;col++){
  let p=row;while(p<rows.length&&Math.abs(rows[p][col])<1e-8)p++;
  if(p===rows.length)continue;[rows[row],rows[p]]=[rows[p],rows[row]];[sources[row],sources[p]]=[sources[p],sources[row]];const v=rows[row][col];rows[row]=rows[row].map(x=>x/v);
  for(let j=0;j<rows.length;j++)if(j!==row){const factor=rows[j][col];if(Math.abs(factor)>1e-8)for(const i of sources[row])sources[j].add(i);rows[j]=rows[j].map((x,k)=>x-factor*rows[row][k]);}
  pivots.push(col);row++;
 }
 const bad=rows.findIndex(r=>Math.hypot(...r.slice(0,3))<1e-8&&Math.abs(r[3])>1e-5);if(bad>=0)return conflict('關係的偏差尺寸互相衝突，請修改或移除其中一組。',[...sources[bad]].sort((a,b)=>a-b));
 const delta=[0,0,0];pivots.forEach((col,i)=>delta[col]=rows[i][3]);
 const translation=Object.fromEntries(xyz.map((k,i)=>[k,base[i]+delta[i]]));
 if(!Object.values(translation).every(Number.isFinite))return conflict('組立偏差超出有效範圍。');
 return {...seed,rotation:R,translation,remainingTranslations:3-pivots.length};
}
export const FACE_RELATION_NAMES={mate:'面對面',flush:'貼齊',center:'置中對齊'};
