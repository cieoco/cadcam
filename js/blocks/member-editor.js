import {inspectLinkExport,normalizeExportSettings} from './exporters.js';
import {convertStandardOutput,isOutputBlank,resizeStandardBlank} from './standard-blank.js';
import {pointRefs} from './model.js';
import {editableNumber} from './numeric-input.js';
import {setPointPosition,setPointAngle} from './input.js';
import {pointRotation,freeLinkForPoint,freeTriangleForPoint,updatePointCoordsById as movePoint} from './model.js';
import {commitMountingEdit} from './mounting-review-ui.js';
/** 共用剛性桿件尺寸列：選取 → 預檢整筆修改 → 一次復原 → 重算。 */
import {isDisk,validateDisk} from './disk-plate.js';
import { S } from './state.js';
import { planSyringeAttachmentResize } from '../core/syringe.js';
import { memberDimensions, memberDimensionValue, planMemberDimension, mirroredJaw, dimensionLock } from './member-dimensions.js';
import { MATERIALS, memberStock, planMemberStock, DEFAULT_HOLE_MM } from './member-stock.js';

export function createMemberEditor({ pause, pushUndo, rebuild, draw, reshapeTriangle, updatePointCoordsById, notify, resizeFusion, validateCandidate = () => '', openMobileEditPanel = () => {}, holeDiameter = () => DEFAULT_HOLE_MM }) {
  let mirror = true;   // 孔距使用圖上把手與原數字欄，不再另建面板滑桿。
  let tipDraft = null;
  let lastSelectedId = null;
  const el = id => document.getElementById(id);
  const selected = () => S.comps.find(c => c.id === (S.selectedTriangleId || S.selectedLinkId));
  const displayComp = comp => comp && tipDraft?.ids.includes(comp.id) ? { ...comp, jawTipLength: tipDraft.value } : comp;
  const dimensionId = () => S.triSide || 'g';
  function sync() {
    const comp = selected();
    let outputPreset=el('servoOutputPreset'),outputStatus=el('servoOutputStatus');if(!outputPreset&&el('memberMore')){outputPreset=document.createElement('button');outputPreset.id='servoOutputPreset';outputPreset.textContent='三列輸出板（軸後留一格）';outputPreset.type='button';el('memberMore').before(outputPreset);outputStatus=document.createElement('p');outputStatus.id='servoOutputStatus';outputPreset.after(outputStatus);}
    if(outputPreset){outputPreset.hidden=!(comp?.type==='bar'&&comp.isInput&&['mg995','tt','n20'].includes(comp.motorType || 'tt'))||isOutputBlank(comp);outputPreset.onclick=()=>{const plan=convertStandardOutput(comp,S.topo.params,S.comps);if(!plan.ok){notify(plan.message);return;}if((comp.motorType || 'tt')==='tt')plan.comp.ttOutput='shaft';pause();if(!commitMountingEdit(S,d=>{d.comps[d.comps.findIndex(c=>c.id===comp.id)]=plan.comp;Object.assign(d.params,plan.params);},{pushUndo,notify}))return;rebuild();draw();};outputStatus.hidden=!isOutputBlank(comp);if(isOutputBlank(comp)){const g=inspectLinkExport(comp,S.topo.params[comp.lenParam],{...S.fabrication?.export,drive:S.fabrication?.drive}),flat=normalizeExportSettings(S.fabrication?.export);outputStatus.textContent=!comp.isInput?'格孔輸出板：尚未安裝軸接頭。':(comp.motorType || 'tt')==='tt'&&comp.ttOutput==='shaft'?`TT扁軸直連：${flat.ttShaftFlatDiameterMm} × ${flat.ttShaftFlatThicknessMm} mm（直徑 × 對邊）；軸向固定待實量。`:`輸出板：軸後留${comp.standardBlank.rearMm} mm；有效${g.holes.filter(h=>/^(MG995_HORN|TT_HUB|N20_HUB)_SCREW$/.test(h.layer)).length}顆軸接頭固定螺絲（試作待實量）。`;}}
    let ttRow=el('ttOutputConnectionRow'),ttSelect=el('ttOutputConnection');
    if(!ttRow&&outputStatus){ttRow=document.createElement('label');ttRow.id='ttOutputConnectionRow';ttRow.textContent='TT 輸出接法';ttSelect=document.createElement('select');ttSelect.id='ttOutputConnection';ttSelect.setAttribute('aria-label','TT 輸出接法');for(const[value,text]of[['shaft','直接接 TT 扁軸'],['hub','聯軸器／輪轂（雙螺絲）']]){const option=document.createElement('option');option.value=value;option.textContent=text;ttSelect.append(option);}ttRow.append(ttSelect);outputStatus.before(ttRow);}
    if(ttRow){ttRow.hidden=!(isOutputBlank(comp)&&comp.isInput&&(comp.motorType || 'tt')==='tt');if(!ttRow.hidden){ttSelect.value=comp.ttOutput || 'hub';ttSelect.onchange=()=>{const value=ttSelect.value;if(!['shaft','hub'].includes(value)||value===(comp.ttOutput || 'hub'))return;pause();if(!commitMountingEdit(S,d=>{d.comps.find(c=>c.id===comp.id).ttOutput=value;},{pushUndo,notify})){sync();return;}rebuild();draw();};}}
    if(el('lenEditor'))el('lenEditor').dataset.selectionSummary=comp?.standardBlank?`${comp.name}：實際 ${(comp.holes || []).length+(comp.type==='bar'?2:3)} 孔・孔距基準 ${S.topo.params[comp.type==='bar'?comp.lenParam:comp.gParam]}${comp.type==='triangle'?' × '+S.topo.params[comp.r1Param]:''} mm`:'';
    let blankFields=el('standardBlankEdit');if(!blankFields&&el('memberDimensionLabel')){blankFields=document.createElement('div');blankFields.id='standardBlankEdit';el('memberDimensionLabel').before(blankFields);}
    if(blankFields){blankFields.hidden=!comp?.standardBlank;blankFields.replaceChildren();if(comp?.standardBlank)for(const[axis,label,value]of[['g',isOutputBlank(comp)?'軸至工作孔數':'長向孔數',Number(S.topo.params[comp.type==='bar'?comp.lenParam:comp.gParam])/8+1],...(comp.type==='triangle'?[['r1','直向孔數',Number(S.topo.params[comp.r1Param])/8+1]]:[]),...(comp.standardBlank.kind==='l'?[['arm','臂寬孔列數',(comp.standardBlank.armWidthMm-13)/8+1]]:[])]){const row=document.createElement('label'),input=document.createElement('input');row.textContent=label;input.type='number';input.min=axis==='arm'?1:2;input.max=128;input.step=1;input.value=Number.isInteger(value)?value:'';input.placeholder='特殊尺寸';input.dataset.blankEdit=axis;input.setAttribute('aria-label',label);input.onchange=()=>{const n=Number(input.value);if(!Number.isInteger(n)||n<Number(input.min)){notify('孔數請填有效整數；精確尺寸可用原毫米欄。');sync();return;}S.triSide=axis;setDimensionValue(comp.id,axis,axis==='arm'?(n-1)*8+13:(n-1)*8,{exact:true});};row.append(input);blankFields.append(row);}}

    const segments=el('fusionSegment');
    if(segments){
      segments.hidden=!comp?.barFusionRoot;
      if(comp?.barFusionRoot){
        segments.replaceChildren(...S.comps.filter(c=>c.barFusionRoot===comp.barFusionRoot).map((c,i)=>{
          const option=document.createElement('option');option.value=c.id;option.textContent=`${c.name||`第 ${i+1} 段`} · ${S.topo.params[c.lenParam]} mm`;return option;
        }));segments.value=comp.id;
        segments.onchange=()=>{pause();S.selectedLinkId=segments.value;S.triSide='g';draw();};
      }
    }
    if(lastSelectedId!==comp?.id){const more=el('memberMore');if(more)more.open=false;const operations=el('memberOperations');if(operations)operations.hidden=true;el('memberOperationsToggle')?.setAttribute('aria-expanded','false');lastSelectedId=comp?.id;}
    if (tipDraft && tipDraft.selectedId !== comp?.id) tipDraft = null;
    const diskFields=el('diskDimensions');if(diskFields)diskFields.hidden=!isDisk(comp);
    const diskInput=el('diskDiameterInput');
    if(diskInput){
      diskInput.value=isDisk(comp)?comp.diameterMm:'';
      diskInput.onchange=()=>{
        const c=selected();if(!isDisk(c))return;
        const value=Math.round(Number(diskInput.value)*10)/10;
        const error=validateDisk(c,Number(S.topo.params[c.lenParam]),value,holeDiameter(c));
        if(error){notify(error);sync();return;}
        if(value===c.diameterMm)return;
        pause();if(!commitMountingEdit(S,d=>{d.comps.find(o=>o.id===c.id).diameterMm=value;},{pushUndo,notify})){sync();return;}rebuild();draw();
      };
    }
    const more=el('memberMore');if(more?.nodeType===1&&!more.dataset.resizeListener){more.dataset.resizeListener='1';more.addEventListener('toggle',draw);}
    let position=el('memberPosition');
    if(more?.nodeType===1){
      if(!position){position=document.createElement('div');position.id='memberPosition';position.innerHTML='<label>位置 X <span data-x></span></label><label>Y <span data-y></span></label>';more.append(position);}
      position.hidden=!comp||!!comp.moduleId||!!comp.barFusionRoot||!(freeLinkForPoint(S.comps,comp.p1?.id)||freeTriangleForPoint(S.comps,comp.p1?.id));
      if(!position.hidden)for(const key of ['x','y'])editableNumber(position.querySelector(`[data-${key}]`),comp.p1[key],v=>{const old=S.selectedNodeId;S.selectedNodeId=comp.p1.id;setPointPosition(key,v);S.selectedNodeId=old;draw();},{label:`零件第一孔 ${key.toUpperCase()}（mm）`});
    }
    const dimensions = memberDimensions(comp);
    let direction=el('memberDirection');
    if(!direction){direction=document.createElement('label');direction.id='memberDirection';direction.innerHTML='方向（°，水平為 0） <span></span>';el('memberCopyActions')?.before(direction);}
    const rotation=comp&&['bar','triangle'].includes(comp.type)&&[comp.p2,comp.p3,comp.p1].filter(Boolean).map(p=>pointRotation(S.comps,S.topo.params,p.id)).find(Boolean);
    direction.hidden=!rotation;
    if(rotation&&direction.nodeType===1)editableNumber(direction.querySelector('span'),rotation.angle,v=>setPointAngle(rotation.end.id,v),{label:'連桿方向角度',min:-360,max:360});
    const active = dimensions.length > 0;
    const copyActions=el('memberCopyActions');if(copyActions)copyActions.hidden=!active||!!comp?.boxPanel;
    const boxEdit=el('boxEditButton');if(boxEdit)boxEdit.hidden=!comp?.boxPanel;
    const actions=el('memberActions');if(actions)actions.style.display=comp?.boxPanel?'none':'';
    if(comp?.boxPanel&&el('memberOperations'))el('memberOperations').hidden=true;
    const memberMore=el('memberMore');if(memberMore)memberMore.hidden=!!comp?.boxPanel;
    const input = el('memberDimensionInput'), hint = el('memberDimensionHint');
    if (!input) return;
    const dimensionLabel=el('memberDimensionLabel');if(dimensionLabel)dimensionLabel.hidden=!active;
    const lockNotice=el('memberDimensionLock');if(lockNotice&&!active)lockNotice.hidden=true;
    input.style.display = active ? '' : 'none';
    el('lenValue').style.display = active ? 'none' : '';
    hint.style.display = 'none';
    el('memberMirrorLabel').style.display = 'none';
    const stockFields=el('memberStockDimensions');if(stockFields)stockFields.hidden=!active||isDisk(comp);
    for(const [field,key] of [['memberWidthInput','widthMm'],['memberThicknessInput','thicknessMm']]){
      const node=el(field);if(node){if(key==='widthMm')node.closest('label').hidden=!!comp?.standardBlank&&comp.type==='triangle';node.value=active?memberStock(comp)[key]:'';node.disabled=!active||Boolean(comp?.barFusionRoot);}
    }
    const target=el('memberMaterialTarget');if(target)target.textContent=active?`選取零件：${comp.label || comp.id}${comp.barFusionRoot?'（請先解除合成再修改材料）':''}`:'請先選取連桿或板件，再開啟製作設定。';
    const material = el('memberMaterial');
    if (material) {
      material.parentElement.style.display = active ? '' : 'none';
      material.replaceChildren(...MATERIALS.map(item => {
        const option = document.createElement('option'); option.value = item.id; option.textContent = item.label; return option;
      }));
      material.value = memberStock(comp).material;
      material.disabled=!active||Boolean(comp?.barFusionRoot);
    }
    ['lenMinusBtn', 'lenPlusBtn'].forEach(key => { el(key).disabled = false; });
    if (!active) return;
    if (!dimensions.some(d => d.id === dimensionId())) S.triSide = 'g';
    const id = dimensionId();
    const dimension = dimensions.find(d => d.id === id);
    if(dimensionLabel)dimensionLabel.textContent=dimension.label;
    const selector = el('triSideSelect');
    selector.replaceChildren(...dimensions.filter(d=>!d.stockKey).map(d => {
      const option = document.createElement('option'); option.value = d.id; option.textContent = d.label;
      return option;
    }));
    selector.value = id;
    selector.style.display = comp.type==='triangle' ? '' : 'none';
    selector.title = '選擇要調整的孔距；也可點畫布尺寸';
    input.value = Number(memberDimensionValue(displayComp(comp), S.topo.params, id).toFixed(1));
    input.min = String(dimension.min ?? 8);
    input.max = String(dimension.max ?? (id === 'tip' ? 160 : 2000));
    input.setAttribute('aria-label', dimension.label);
    const lock = dimensionLock(comp, S.comps, id);
    if(lockNotice){lockNotice.textContent=lock || '';lockNotice.hidden=!lock;}
    input.disabled = Boolean(lock);
    input.setAttribute('aria-description',`範圍 ${input.min}–${input.max} mm`);
    ['lenMinusBtn', 'lenPlusBtn'].forEach(key => { el(key).disabled = Boolean(lock); });
    el('lenMinusBtn').title = `${dimension.label} 減少 ${dimension.step ?? 8} mm`;
    el('lenPlusBtn').title = `${dimension.label} 增加 ${dimension.step ?? 8} mm`;
    hint.textContent = ''; // 一般說明留在教學；限制由主要尺寸列顯示。
    if (mirroredJaw(comp, S.comps, S.topo.params)) {
      el('memberMirrorLabel').style.display = '';
      el('memberMirror').checked = mirror;
    }
    el('lenTitle').textContent = comp.barFusionRoot ? '合成一片' : comp.boxPanel ? '盒體板件' : isDisk(comp) ? '圓盤' : comp.type === 'bar' ? '連桿' : comp.shape === 'jaw' ? '夾爪板' : '桿件／板件';
  }
  function selectDimension(id) {
    if (!memberDimensions(selected()).some(d => d.id === id)) return;
    S.triSide = id;
    pause(); openMobileEditPanel(); draw();
    const input=el('memberDimensionInput');input?.focus?.();input?.select?.();
  }
  function setValue(raw, exact = false) {
    const comp = selected();
    if (!comp) return;
    return setDimensionValue(comp.id,dimensionId(),raw,{mirrorPair:mirror,exact});
  }
  function setDimensionValue(componentId,id,raw,{mirrorPair=false,exact=false}={}) {
    const comp=S.comps.find(c=>c.id===componentId);
    if(!comp)return;
    if(comp.standardBlank&&(['g','r1','arm'].includes(id)||isOutputBlank(comp)&&id==='width')){
      const value=Number(raw),plan=resizeStandardBlank(comp,S.topo.params,id,value,{comps:S.comps});if(!plan.ok){notify(plan.message);sync();return;}
      const retained=new Set((plan.comp.holes || []).map(h=>h.id)),lost=(comp.holes || []).filter(h=>!retained.has(h.id)&&(h.type==='fixed'||pointRefs(S.comps,h.id).length>1));
      if(lost.length){notify('縮小會刪除已固定或已連接的孔，請先解除連接。');sync();return;}
      if(JSON.stringify(comp)===JSON.stringify(plan.comp)&&Object.entries(plan.params).every(([k,v])=>S.topo.params[k]===v))return;
      pause();let invalid='';const accepted=commitMountingEdit(S,draft=>{const index=draft.comps.findIndex(c=>c.id===comp.id);if(comp.type==='bar'&&id==='g')planSyringeAttachmentResize(draft.comps,comp,Number(draft.params[comp.lenParam]),value).forEach(({id,...patch})=>Object.assign(draft.comps.find(c=>c.id===id),patch));draft.comps[index]=plan.comp;Object.assign(draft.params,plan.params);for(const key of ['p1','p2',...(comp.type==='triangle'?['p3']:[])]){const p=plan.comp[key];movePoint(draft.comps,p.id,p.x,p.y);}invalid=validateCandidate(draft);return !invalid;},{pushUndo,notify});
      if(!accepted){if(invalid)notify(invalid);sync();draw();return;}rebuild();draw();return;
    }

    if(isDisk(comp)){const error=validateDisk(comp,Number(raw),comp.diameterMm,holeDiameter(comp));if(error){notify(error);sync();return;}}
    const dimension = memberDimensions(comp).find(d => d.id === id);
    if (dimension?.stockKey) { setStock(dimension.stockKey, raw); return; }
    const lock = dimensionLock(comp, S.comps, id);
    if (lock) { notify(lock); sync(); return; }
    const partner = mirrorPair && mirroredJaw(comp, S.comps, S.topo.params);
    const targets = partner ? [comp, partner] : [comp];
    const plans = targets.map(c => planMemberDimension(c, S.topo.params, id, raw,{holeDiameterMm:holeDiameter(c),exact}));
    const failure = plans.find(plan => !plan.ok);
    if (failure) { notify(failure.message); sync(); return; }
    if (targets.every(c => Math.abs(memberDimensionValue(c, S.topo.params, id) - plans[0].value) < 0.001)) { sync(); return; }
    if(comp.barFusionRoot)return resizeFusion?.(comp.id,plans[0].value);
    pause();
    let invalid='';
    const committed=commitMountingEdit(S,draft=>{targets.forEach((target, index) => {
      const c=draft.comps.find(o=>o.id===target.id);
      if (c.type === 'bar' && id === 'g') {
        const patches = planSyringeAttachmentResize(draft.comps, c, Number(draft.params[c.lenParam]), plans[index].value);
        patches.forEach(({ id, ...patch }) => Object.assign(draft.comps.find(c => c.id === id), patch));
      }
      Object.assign(draft.params, plans[index].params);
      Object.assign(c, plans[index].properties);
      if (id === 'tip') return;
      if (c.type === 'triangle') reshapeTriangle(c,draft.params,(id,x,y)=>movePoint(draft.comps,id,x,y));
      else {
        const dx = c.p2.x - c.p1.x, dy = c.p2.y - c.p1.y, length = Math.hypot(dx, dy) || 1;
        movePoint(draft.comps,c.p2.id, c.p1.x + (dx || (dy ? 0 : 1)) / length * plans[index].value, c.p1.y + dy / length * plans[index].value);
      }
    });invalid=dimension?.param?validateCandidate(draft):'';return !invalid;},{pushUndo,notify});
    if(!committed){if(invalid)notify(invalid);sync();draw();return;}
    rebuild(); draw();
  }
  function change(delta) {
    const comp = selected();
    const dimension = memberDimensions(comp).find(d => d.id === dimensionId());
    if (comp) setValue(memberDimensionValue(comp, S.topo.params, dimensionId()) + (dimension?.step ? Math.sign(delta) * dimension.step : delta));
  }
  function setStock(key, raw) {
    if(key==='widthMm'&&selected()?.standardBlank&&selected().type==='triangle'){notify('板材寬度請調整寬向孔數；L型件請調整臂寬。');return;}
    if(selected()?.barFusionRoot){notify('請先解除合成再修改尺寸或材料。');sync();return;}
    const comp = selected();
    if(isOutputBlank(comp)&&key==='widthMm'){setDimensionValue(comp.id,'width',raw,{exact:true});return;}
    if (!comp || !['bar', 'triangle'].includes(comp.type)) return;
    const partner = mirror && mirroredJaw(comp, S.comps, S.topo.params);
    const targets = partner ? [comp, partner] : [comp];
    const plans = targets.map(c => planMemberStock(c, key, raw, { holeDiameterMm: holeDiameter(c) }));
    const failure = plans.find(plan => !plan.ok);
    if (failure) { notify(failure.message); sync(); return; }
    if (targets.every((c, i) => JSON.stringify(memberStock(c)) === JSON.stringify(plans[i].stock))) { sync(); return; }
    pause();if(!commitMountingEdit(S,draft=>targets.forEach((c,i)=>{draft.comps.find(o=>o.id===c.id).stock=plans[i].stock;}),{pushUndo,notify})){sync();return;}
    rebuild(); draw();
  }
  function beginTipPreview() {
    const comp = selected();
    if (comp?.shape !== 'jaw') return false;
    pause(); S.triSide = 'tip';
    const partner = mirror && mirroredJaw(comp, S.comps, S.topo.params);
    tipDraft = { selectedId: comp.id, ids: [comp.id, ...(partner ? [partner.id] : [])], value: memberDimensionValue(comp, S.topo.params, 'tip') };
    draw(); return true;
  }
  function previewTip(value) {
    if (!tipDraft || selected()?.id !== tipDraft.selectedId) return;
    const plan = planMemberDimension(selected(), S.topo.params, 'tip', value);
    if (!plan.ok) return;
    tipDraft.value = plan.value; draw();
  }
  function finishTipPreview(cancel = false) {
    const draft = tipDraft; tipDraft = null;
    if (!cancel && draft && selected()?.id === draft.selectedId) { S.triSide = 'tip'; setValue(draft.value); }
    else draw();
  }
  return { sync, setStock, selected, displayComp, selectDimension, setValue, setDimensionValue, change, beginTipPreview, previewTip, finishTipPreview,
    setMaterial: raw => setStock('material', raw), setMirror(value) { mirror = Boolean(value); sync(); } };
}
