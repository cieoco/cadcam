/** Pure guidance for the syringe installation panel: one form, three questions.
 *  Steps are derived from the same installation request; there is no separate
 *  unlock state. Nothing here plans geometry or changes the work. */
export const INSTALL_STEPS=['① 針筒固定在哪裡？','② 推桿要推哪個孔？','③ 調整位置，試推看看'];
export const MODE_TEXT={'fixed-axis':'針筒固定不動（兩顆螺絲）',pivot:'針筒可以擺動（只鎖一顆螺絲當轉軸）'};
const mm=n=>String(Number(Number(n).toFixed(1)));

/** Which question is shown and what confirm still needs. `requested` only
 *  revisits an earlier, already answered step. */
export function installProgress({frameId='',frameFixed=false,output=false,onFrame=true,planOk=false,requested=null}={}){
 const first=!!frameId&&!!frameFixed,second=!!output,auto=!first?1:!second?2:3;
 const step=Number.isInteger(requested)&&requested>=1&&requested<auto?requested:auto,missing=[];
 if(!frameId)missing.push('① 選針筒固定的零件');else if(!frameFixed)missing.push('① 把所選零件設為不動的底座');
 if(!second)missing.push('② 選推桿的孔');else if(first&&!onFrame)missing.push('③ 把固定環移回所選零件上');
 return {step,auto,missing,ready:first&&second&&!!onFrame&&!!planOk};
}

/** Distinct, student-facing part names; repeated names get a running number. */
export function partLabels(comps){
 const parts=comps.filter(c=>['bar','triangle'].includes(c.type)),count={},seen={},out=new Map();
 for(const c of parts){const n=c.name||c.id;count[n]=(count[n]||0)+1;}
 for(const c of comps){const n=c.name||c.id;if(count[n]>1){seen[n]=(seen[n]||0)+1;out.set(c.id,`${n}（${seen[n]}）`);}else out.set(c.id,n);}
 return out;
}

/** Plain hole names counted along the part, never coordinates:
 *  one row → 「第 3 孔」; several rows → 「第 2 排第 5 孔」. */
export function holeNames(holes){
 const key=v=>Math.round(v*100)/100,rows=[...new Set(holes.map(h=>key(h.v)))].sort((a,b)=>a-b),out=new Map();
 for(const [r,v] of rows.entries()){
  const row=holes.filter(h=>key(h.v)===v).sort((a,b)=>a.u-b.u);
  row.forEach((h,i)=>out.set(h.key,rows.length>1?`第 ${r+1} 排第 ${i+1} 孔`:`第 ${i+1} 孔`));
 }
 return out;
}
export const holeName=(part,holes,hole)=>hole?`${part}・${holeNames(holes).get(hole.key)||'孔'}`:'';

/** Suggest a mounting mode from the planner's own answers for the chosen hole. */
export function suggestMountMode(works){
 const fixed=!!works?.['fixed-axis'],pivot=!!works?.pivot;
 if(fixed&&!pivot)return {mode:'fixed-axis',text:`建議：${MODE_TEXT['fixed-axis']}，因為推這個孔時筒身不必轉，兩顆螺絲鎖住就推得動。`};
 if(pivot&&!fixed)return {mode:'pivot',text:`建議：${MODE_TEXT.pivot}，因為這個孔會沿圓弧移動，筒身要跟著擺；固定不動的針筒推不動它。`};
 if(fixed&&pivot)return {mode:null,text:'兩種方式都推得動；不需要擺動就用「針筒固定不動」。'};
 return null;
}

/** One live line from the existing full-stroke scan. */
export function strokeCheck(scan,stroke){
 if(!scan)return '';
 if(scan.ok)return `✓ 可以從 0 推到 ${mm(stroke)} mm`;
 return Number.isFinite(scan.atMm)?`✗ 推到 ${mm(scan.atMm)} mm 會卡住：${scan.message}`:`✗ 目前推不動：${scan.message}`;
}

export function installSummary({frame,hole,mode,face}){
 return `針筒固定在「${frame}」，推桿接「${hole}」，${MODE_TEXT[mode]||MODE_TEXT['fixed-axis']}，裝在板子${face==='back'?'後面':'前面'}。`;
}
/** Text beside 確認安裝: what is missing, why it cannot be built, or what will be built. */
export function confirmLine({ready,missing=[],message='',summary=''}){
 if(ready)return '將建立：'+summary;
 if(missing.length)return '還差：'+missing[0];
 return '還不能安裝：'+(message||'請調整位置或方向。');
}
