import {planActuatorPlateHoles} from './actuator-plate-holes.js';
import {frameHoleAxis} from './frame-holes.js';
import {fusionRoot} from '../core/bar-fusion.js';
import {ownedParamKeys,pointKeysFor} from './part-types.js';
import {detachDeletedAttachments} from './detached-attachments.js';
import {onParts,settlePlateHoles} from './plan-shape.js';
import {isMotorPart} from './motor-part.js';
import {freeMotor} from './motor-release.js';
import {localHoles} from '../core/local-holes.js';
import {runEdit} from './edit-pipeline.js';
import {planDeleteGear} from './gear-plan.js';
import {targetOf,deletableByHole,distinctLabels,partName} from './selection-target.js';
// 刪除零件（SDD-OPERATION-PIPELINE O1）：planDelete 是純規劃；提交、復原、回饋都交給 edit-pipeline 的 runEdit。
// 座板檢查改成「宣告的檢查」：修改前就有的問題不擋這次刪除，只擋這次新造成的。
export const deleteChecks=[{id:'actuator-plate',run:work=>{const r=planActuatorPlateHoles(work);return r.ok?'':r.message;}}];
const quote=c=>`「${partName(c)}」`;
const list=names=>names.length<3?names.join('和'):`${names.slice(0,-1).join('、')}和${names.at(-1)}`;
const NOTHING='沒有選到零件。請先點選要刪除的零件（針筒請按面板裡的「刪除針筒」）。';

/** work={comps,params,modules,fabrication,points}（馬達零件形狀，docs/SDD-MOTOR-PART.md M1）；target 見 selection-target.js（今日形狀的零件，用 id 對回 work）。
 *  回傳 {ok,comps,params,message}｜{ok:false,message,flash?}。馬達在這裡是獨立零件，刪除輸出件＝刪零件＋清掉馬達的 drives，沒有馬達特例。 */
export function planDeleteParts(work,target){
  const part=target?.part&&(work.comps.find(c=>c.id===target.part.id)||target.part);
  if(!part){
    if(target?.shared?.length>1){
      // 同名零件用座標分不出來（學生看不懂）：改說幾個、並在圖上標出。
      const plain=[...new Set(target.shared.map(c=>c.name||''))],same=plain.length===1&&plain[0];
      const names=same?`${target.shared.length} 個「${same}」`:list(distinctLabels(target.shared,work.params).map(n=>`「${n}」`));
      return {ok:false,message:`這個接點由${names}共用（圖上已標出）；請點桿身選取要刪除的零件。`,flash:target.shared.map(c=>c.id)};
    }
    return {ok:false,message:NOTHING};
  }
  if(part.type==='bar'&&fusionRoot(work.comps,part.id))return {ok:false,message:'請先解除合成，再刪除其中的連桿。'};
  if(part.type==='triangle'&&part.fusedWith)return {ok:false,message:'請先解除合成，再刪除板件'};
  if(part.boxPanel)return {ok:false,message:'這是盒體的配對板件，請整組管理；尺寸從「卡榫盒子」修改。'};
  if(!deletableByHole(part)&&target.hole)return {ok:false,message:`${quote(part)}請在它自己的設定面板刪除。`};
  if(part.frameHole){
    if(target.shared?.length)return {ok:false,message:'此孔已接連桿，請先分離或刪除相接的連桿。',flash:target.shared.map(c=>c.id)};
    return {ok:true,comps:work.comps.filter(c=>c.id!==part.id),params:{...work.params},message:'已刪除機架孔。'};
  }
  if(part.type==='gear')return planDeleteGear(work,part);          // 齒輪：只刪這一個（SDD-OPERATION-PIPELINE O4）
  const id=part.id,name=quote(part),notes=[];
  let comps=work.comps,params={...work.params};
  // 輸出桿被刪：接著它的馬達留下，變成沒有輸出的獨立馬達（清掉 drives、軸心留在目前位置；與「解除輸出」同一個 freeMotor）。
  const kept=comps.filter(c=>isMotorPart(c)&&c.drives?.body===id);
  for(const m of kept){const r=freeMotor(comps,m.id,work.points||{});if(!r.ok)return {ok:false,message:r.message};comps=r.comps;}
  const own=new Set([...pointKeysFor(part).map(k=>part[k]?.id),...localHoles(part).map(h=>h.id)].filter(Boolean));
  const candidate=detachDeletedAttachments(structuredClone(comps),new Set([id]),params,work.points).filter(c=>c.id!==id);
  if(isMotorPart(part))for(const c of candidate)if(c.motorMountPoint===part.p1.id)delete c.motorMountPoint;
  ownedParamKeys(part).forEach(k=>delete params[k]);
  // 刪掉的零件連帶放開了什麼，要說出來（不能無聲無息）。
  if(comps.some(c=>isMotorPart(c)&&!c.drives&&c.mount?.frameBody===id)){notes.push('馬達改成獨立固定點，留在原位。');}
  else if(comps.some(c=>isMotorPart(c)&&c.drives&&c.mount?.frameBody===id))notes.push('馬達軸心改成獨立固定點，留在原位。');
  if(comps.some(c=>c.type==='syringe'&&['a','b'].some(k=>c[k]?.componentId===id)))notes.push('針筒的接頭已放開，請重新選孔接回。');
  const joined=candidate.filter(c=>c.type!=='anchor'&&c.type!=='syringe'&&c.type!=='motor'&&pointKeysFor(c).some(k=>own.has(c[k]?.id)));
  if(joined.length)notes.push(`原本相接的 ${joined.length} 個零件保留，接孔已放開。`);
  const plate=settlePlateHoles({comps:candidate,params,modules:work.modules,fabrication:work.fabrication});
  const next=plate.ok?plate.comps:candidate;                        // 座板有舊問題時照樣刪（deleteChecks 只擋「新造成」的）
  for(const c of next)if(c.frameHole&&!frameHoleAxis(next,c)){delete c.frameHole;notes.push('機架孔的基準已移除，孔保留在原位置成為獨立固定點。');}
  const head=kept.length?`已刪除${name}；馬達留在${kept[0].mount?.frameBody?'座板上':'原位'}，尚未接輸出。`:`已刪除${name}。`;
  return {ok:true,comps:next,params,message:head+notes.join('')};
}
/** 今日形狀進、今日形狀出的版本（直接呼叫規劃函式的測試用）；動作本身走 runEdit 的 shape:'parts'。 */
export const planDelete=onParts(planDeleteParts);

const hide=id=>{const el=document.getElementById(id);if(el)el.style.display='none';};
export function deleteSelectedPart({S,transient,pushUndo,pause,closeMobileEditPanel,setSliderDetailRows,rebuild,draw,points,flash}) {
  const target=targetOf(S,S.comps,S.modules||[]);
  return runEdit({name:'刪除零件',shape:'parts',plan:work=>planDeleteParts(work,target),checks:deleteChecks,host:{S,transient,pushUndo,pause,rebuild,draw,points,
    flash:flash||(ids=>import('./integrity-hints.js').then(m=>m.run('flash',{far:ids,canon:[]})).catch(()=>{})),
    afterCommit(){
      closeMobileEditPanel();
      for(const id of ['lenEditor','roleEditor','gearEditor','servoEditor','strokeEditor','sliderBaseBtn','linkToRailBtn'])hide(id);
      setSliderDetailRows(false);
    }}});
}
