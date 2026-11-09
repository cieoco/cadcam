import {faceFastenerKind,faceFastenerSelection,fillFastenerChoices} from './fastener-choice.js';
import {dimensionHandle} from './dimension-handle.js';
import {renderTabNutDimensions} from './tab-nut-parameter-ui.js';
import {TAB_NUT_DEFAULTS} from './tab-nut-geometry.js';
import {candidateMaterialFaces,candidateHostFace,candidateHostPoint,candidateCoverageText,candidateConfirmLabel} from './face-candidate-view.js';
import {hitLabels} from './part-labels.js';
import { LOAD_GRAPH_TOKEN } from '../module-url.js';
import { createLoadSession, LOAD_MISMATCH_MESSAGE } from './load-session.js';
import { autoFitFaces, fitParallelFaces } from './face-auto-fit.js?v=20261008_bracket3d';
import { planFaceBrackets, FACE_BRACKET_SPEC } from './face-bracket-geometry.js?v=20261008_bracket3d';
import { bracketLayout } from './bracket-layout.js';
/** 六面體組立操作原型；獨立記憶體草稿，不讀寫 blocks 作品。 */
import { boxFaces, solveFaceMate, transformMatePoint } from './face-mate.js';
import { realMountExamples } from './face-mate-examples.js';
import { buildFacePlacement } from './face-placement.js';
import {signedNumberInput,showNumber,readNumber} from './numeric-input.js';

const $ = id => document.getElementById(id);
const names = { top: '上面（板面）', bottom: '下面（板面）', front: '前面（外框邊）', back: '後面（外框邊）', left: '左面（外框邊）', right: '右面（外框邊）' };
const symbols = { top: '↑', bottom: '↓', front: '●', back: '○', left: '←', right: '→' };
const faceOrder = ['top', 'bottom', 'front', 'back', 'left', 'right'];
const integrated = new URLSearchParams(location.search).get('integrated') === '1';
document.body.dataset.integrated = String(integrated);
const compactLayout = matchMedia('(max-width:760px), (max-height:540px) and (orientation:landscape)');
const syncSelectionDetails = () => { $('selectedPartsDetails').open = !compactLayout.matches; };
syncSelectionDetails();
compactLayout.addEventListener('change', syncSelectionDetails);
$('selectedPartsDetails').hidden = !integrated;
const loadSession = createLoadSession(LOAD_GRAPH_TOKEN);
let { hosts, children } = realMountExamples();
const initial = { host: 0, child: 0, hostFace: 'top', childFace: 'bottom', alignU: 0, alignV: 0, offsetU: 0, offsetV: 0, gap: 0, quarterTurns: 0 };
let draft = { ...initial }, saved = { ...initial }, step = 0;
let mode = 'wizard', choosingChild = false;
$('previewToggle').addEventListener('click', () => {
  const collapsed = document.body.classList.toggle('panel-collapsed');
  $('previewToggle').textContent = collapsed ? '顯示選項' : '放大預覽';
  $('previewToggle').setAttribute('aria-expanded', String(!collapsed));
  requestAnimationFrame(preview);
});
let hasConfirmed = false, roughPlaced = false, configured = false, childConfirmed = false;
let bracketPlan = null, jointSettings, fastenerKind='bracket', tabNutSettings={...TAB_NUT_DEFAULTS};
$('fastenerKind').addEventListener('change',()=>{fastenerKind=$('fastenerKind').value;render();});
for(const format of ['svg','dxf']){
 const button=document.createElement('button');button.type='button';button.textContent=`下載 3 mm 試片 ${format.toUpperCase()}`;button.style.minHeight='44px';
 button.onclick=async()=>{const {tabNutCouponFile}=await import('./tab-nut-coupons.js');const blob=new Blob([tabNutCouponFile(format)],{type:format==='svg'?'image/svg+xml':'application/dxf'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`tab-nut-3mm-M3-trial.${format}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};$('tabNutCoupons').append(button);
}
const couponNote=document.createElement('p');couponNote.textContent='試片固定為 3 mm 名義尺寸，與目前作品設定分開。左底板／右立板，依圖面 y=25、80、135 mm 三列：總間隙 0.05／0.15／0.25 mm。先量測板厚與五金，再試切。';$('tabNutCoupons').append(couponNote);

const tabNutFields=[
 ['tabWidthMm','A 榫寬',false],['tabPitchMm','B 榫中心距',false],['slotClearanceMm','插槽總間隙',false],['screwLengthMm','螺絲長度',false],
 ['alongMm','沿板邊位置',true],['nutCenterMm','螺母中心離板邊',true],['nutAcrossMm','螺母對邊',true],['nutHeightMm','螺母厚度',true],['nutClearanceMm','螺母槽總間隙',true],['washerThicknessMm','墊片厚度',true],['washerDiameterMm','墊片外徑',true]
];
for(const [key,label,advanced] of tabNutFields){
 const l=document.createElement('label'),input=document.createElement('input');input.id=`tabNut-${key}`;input.type='number';input.step='any';input.inputMode='decimal';input.value=tabNutSettings[key];l.htmlFor=input.id;l.textContent=label;input.setAttribute('aria-label',`${label}（mm）`);
 // Refresh the isolated candidate while typing; clearing a field must also invalidate confirmation.
 input.addEventListener('input',()=>{tabNutSettings[key]=readNumber(input);render();});
 $(advanced?'tabNutAdvanced':'tabNutFields').append(l,input);
 if(key==='alongMm')signedNumberInput(input);
}
let parentCandidate=null,previewRequest=0,previewResultRequest=0,previewSignature='',previewTimer=null,candidateClosed=false;
function integratedSelection(mate){return faceFastenerSelection(draft,fastenerKind,{offsets:bracketOffsets,childPart:children[draft.child].surface?.compId || 'frame',tabNut:tabNutSettings});}
function requestCandidate(mate){
 if(!integrated||step!==3||!loadSession.ready)return;
 const selection=integratedSelection(mate),signature=JSON.stringify(selection);
 if(signature===previewSignature)return;
 previewSignature=signature;const requestId=++previewRequest;clearTimeout(previewTimer);
 $('next').disabled=true;
 const report=document.getElementById('faceValidation');if(report)report.textContent='目前候選：檢查中…';
 previewTimer=setTimeout(()=>parent.postMessage({type:'face-wizard-preview',loadGraph:LOAD_GRAPH_TOKEN,requestId,selection},location.origin),150);
}
function candidateLabel(id,candidate){if(id.includes('/screw'))return '固定螺絲頭';return hitLabels([id],candidate.work?.comps || [],candidate.work?.modules || [])[0] || '板件';}
function showCandidate(candidate){
 const error=$('tabNutFeedback');error.hidden=fastenerKind!=='tab-nut'||!!candidate.saveable;error.textContent=error.hidden?'':candidate.reason || '接頭有干涉或資料無法驗證，請調整。';
 let box=document.getElementById('faceValidation');
 if(!box){box=document.createElement('div');box.id='faceValidation';box.style.cssText='padding:8px;overflow-wrap:anywhere;';box.setAttribute('aria-live','polite');$('message').after(box);}
 box.replaceChildren();const v=candidate.validation;
 box.dataset.status=v?.status || 'not_checked';box.dataset.candidateId=candidate.candidateId || '';box.dataset.poseRevision=v?.poseRevision || '';
 const coverageText=candidateCoverageText(candidate);
 const line=document.createElement('div');line.textContent=!candidate.saveable?(candidate.reason || '目前姿態無法驗證，不能確認。'):v.status==='fail'?`此姿態有干涉；可保存接合後調整作品。`:v.status==='not_supported'?coverageText.summary:'此姿態：已檢查範圍無干涉。';
 line.style.color=v?.status==='fail'?'#b34436':'#425e60';box.append(line);
 const collisions=v?.material?.findings || [],coverage=v?.coverage?.notSupported || [];
 if(collisions.length){const details=document.createElement('details'),title=document.createElement('summary');title.textContent=`干涉 ${collisions.length} 處`;details.append(title);for(const f of collisions){const row=document.createElement('div');row.textContent=f.partIds.map(id=>candidateLabel(id,candidate)).join(' ↔ ');details.append(row);}box.append(details);}
 if(coverage.length){const details=document.createElement('details'),title=document.createElement('summary');title.textContent=coverageText.title;details.append(title);const labels={motors:'馬達機身',pins:'關節銷',grounds:'固定接點'};for(const row of coverage){const item=document.createElement('div');item.textContent=labels[row.kind] || '部分材料輪廓尚無法驗證';details.append(item);}box.append(details);}
}
window.addEventListener('pagehide',()=>{candidateClosed=true;clearTimeout(previewTimer);});
let bracketOffsets = {}, selectedBracket = null, bracketSpan = 0;
let dimensionField = null;
const titles = ['選擇兩個機構', '選承接端的面', '選安裝端的面', '預覽對齊與偏置'];
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const mul = (p, n) => ({ x: p.x * n, y: p.y * n, z: p.z * n });
let viewYaw = 45, viewElevation = 30, viewDrag = null, draggedView = false;
const viewCoords = p => {
  const yaw = viewYaw * Math.PI / 180, elevation = viewElevation * Math.PI / 180;
  return {
    x: p.x * Math.cos(yaw) - p.y * Math.sin(yaw),
    y: (p.x * Math.sin(yaw) + p.y * Math.cos(yaw)) * Math.sin(elevation) - p.z * Math.cos(elevation),
    depth: (p.x * Math.sin(yaw) + p.y * Math.cos(yaw)) * Math.cos(elevation) + p.z * Math.sin(elevation)
  };
};
const project = p => viewCoords(p);
const fitButton = button('直角貼齊', () => {
  const result = autoFitFaces(hosts[draft.host], children[draft.child], draft);
  if (!result.ok) { $('message').textContent = result.reason; return; }
  draft = result.selection; bracketOffsets = {}; selectedBracket = null; render();
  $('message').textContent = '兩板已直角貼齊；角碼孔位另行檢查，確認預覽後再接上。';
});
const parallelButton = button('板面平貼並置中', () => {
  const result = fitParallelFaces(hosts[draft.host], children[draft.child], draft);
  if (!result.ok) { $('message').textContent = result.reason; return; }
  draft = result.selection; bracketOffsets = {}; selectedBracket = null; render();
  $('message').textContent = '已改成兩個板面相向平貼、間距 0；可再調整面內位置與角度。';
});
const fitControls = document.createElement('div'); fitControls.style.cssText='display:flex;gap:8px;flex-wrap:wrap';
const faceRelation = document.createElement('div'); faceRelation.style.width='100%'; faceRelation.setAttribute('aria-live','polite');
fitControls.append(faceRelation, parallelButton, fitButton);
$('bracketNote').after(fitControls);
const solve = () => solveFaceMate({ ...draft, hostBox: hosts[draft.host].box, childBox: children[draft.child].box });

function button(label, action) {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = label; b.addEventListener('click', action); return b;
}
function update(field, value) { if(field==='child')childConfirmed=true; bracketOffsets = {}; selectedBracket = null; draft[field] = value; if (field === 'childFace') roughPlaced = true; if (field === 'host' || field === 'child') { roughPlaced = configured; if (field === 'host' && hosts[value].defaultFace) draft.hostFace = hosts[value].defaultFace; } $('message').textContent = ''; render(); }
function buildCards(root, items, field) {
  items.forEach((item, i) => {
    const b = button((item.partName || item.name)+(item.blockedReason ? '（尚不支援）' : item.recommended ? '（建議）' : ''), () => update(field, i)); b.dataset.value = i;
    const small = document.createElement('small'); small.textContent = item.detail; b.appendChild(small); root.appendChild(b);
  });
}
function buildDesignChoice() {
  if(integrated && hosts.some(h=>h.designId)) {
    $('hostDesignLabel').hidden=false;
    $('hostDesign').replaceChildren();
    for(const id of new Set(hosts.map(h=>h.designId))) {
      const option=document.createElement('option');option.value=id;option.textContent=hosts.find(h=>h.designId===id).designName;
      $('hostDesign').appendChild(option);
    }
    $('hostDesign').onchange=()=>update('host',hosts.findIndex(h=>h.designId===$('hostDesign').value));
    $('childDesignLabel').textContent=`設計：${children[0].designName}（在組立清單選擇）`;
    $('childDesignLabel').style.display='block';
  }
}
buildCards($('hosts'), hosts, 'host'); buildCards($('children'), children, 'child');
buildDesignChoice();

for (const [root, field] of [['hostFaces', 'hostFace'], ['childFaces', 'childFace']]) {
  const note = document.createElement('p');
  note.textContent = '板面平貼：兩端都選「上面／下面（板面）」。外框邊是方向參考；板邊配板面會成直角。';
  $(root).before(note);
  faceOrder.forEach(id => {
    const b = button(names[id], () => update(field, id)); b.dataset.value = id;
    const icon = document.createElement('span'); icon.className = 'face-symbol'; icon.textContent = symbols[id]; icon.setAttribute('aria-hidden', 'true'); b.prepend(icon); $(root).appendChild(b);
  });
}
const grid = [
  [-1, 1, '↖ 左上'], [0, 1, '↑ 上邊'], [1, 1, '↗ 右上'],
  [-1, 0, '← 左邊'], [0, 0, '◎ 置中'], [1, 0, '→ 右邊'],
  [-1, -1, '↙ 左下'], [0, -1, '↓ 下邊'], [1, -1, '↘ 右下']
];
grid.forEach(([u, v, label]) => {
  const b = button(label, () => { draft.alignU = u; draft.alignV = v; render(); }); b.dataset.u = u; b.dataset.v = v; $('align').appendChild(b);
});
for (const [field, label] of [['offsetU', '左右偏置'], ['offsetV', '上下偏置'], ['gap', '面間距離']]) {
  const row = document.createElement('div'); row.className = 'adjust-row';
  const lab = document.createElement('label'); lab.textContent = `${label} mm`; lab.htmlFor = field;
  const input = document.createElement('input'); input.id = field; input.type = 'number'; input.step = '0.1'; input.setAttribute('aria-label', `${label}（mm）`);
  if (field === 'gap') input.min = '0';
  input.addEventListener('input', () => {
    const value = readNumber(input);
    if (!Number.isFinite(value) || (field === 'gap' && value < 0)) {
      input.setAttribute('aria-invalid', 'true'); $('next').disabled = true;
      $('message').textContent = '請輸入有效距離；面間距離不能小於 0。'; return;
    }
    input.removeAttribute('aria-invalid'); draft[field] = value; $('message').textContent = ''; preview();
  });
  input.addEventListener('blur', () => {
    if (input.getAttribute('aria-invalid') === 'true') { input.value = draft[field]; input.removeAttribute('aria-invalid'); preview(); }
  });
  const shift = amount => update(field, field === 'gap' ? Math.max(0, draft[field] + amount) : draft[field] + amount);
  const minus = button('−', () => shift(-5)), plus = button('+', () => shift(5));
  minus.setAttribute('aria-label', `${label}減少 5 mm`); plus.setAttribute('aria-label', `${label}增加 5 mm`);
  row.append(lab, minus, input, plus); $('adjustments').appendChild(row);
  if(field !== 'gap')signedNumberInput(input);
}
const dimensionSign = signedNumberInput($('dimensionValue'));
const angle = () => draft.rotationDeg ?? draft.quarterTurns * 90;
$('turn').addEventListener('click', () => update('rotationDeg', (angle() + 90) % 360));
$('turnMinus').addEventListener('click', () => update('rotationDeg', (angle() + 270) % 360));
$('angleChip').addEventListener('click', () => openDimension('rotationDeg', angle()));
$('mateCenter').addEventListener('click', () => {
  draft.alignU = 0; draft.alignV = 0; draft.offsetU = 0; draft.offsetV = 0; render();
});
const dimensionButtons = {
  offsetU: $('mateUChip'), offsetV: $('mateVChip'), gap: $('mateGapChip')
};
const dimensionText = {
  offsetU: value => `左右 ${value}`,
  offsetV: value => `上下 ${value}`,
  gap: value => `間距 ${value}`
};
function openDimension(field, value) {
  dimensionField = field;
  $('dimensionTitle').textContent = field === 'bracket' ? '角碼位置偏移' : field === 'rotationDeg' ? '設定接合角度' : field === 'offsetU' ? '設定左右偏移' : field === 'offsetV' ? '設定上下偏移' : field === 'gap' ? '設定面間距' : '設定移動步距';
  $('dimensionLabel').textContent = `${$('dimensionTitle').textContent}（${field === 'rotationDeg' ? '°' : 'mm'}）`;
  const input = $('dimensionValue');
  showNumber(input, value);
  input.min = field === 'gap' ? '0' : '';
  dimensionSign.hidden = field === 'gap';
  input.removeAttribute('aria-invalid');
  $('dimensionError').textContent = field === 'bracket' ? '位置超出接合區，或與另一顆角碼太接近。' : '請輸入有效數字；間距不可小於 0。';
  $('dimensionError').hidden = true;
  $('dimensionDialog').showModal(); input.focus();
}
Object.entries(dimensionButtons).forEach(([field, b]) => b.addEventListener('click', () => {
  openDimension(field, draft[field]);
}));
$('dimensionCancel').addEventListener('click', () => $('dimensionDialog').close('cancel'));
$('dimensionDialog').addEventListener('close', () => {
  $('dimensionValue').removeAttribute('aria-invalid'); $('dimensionError').hidden = true;
});
$('dimensionForm').addEventListener('submit', e => {
  e.preventDefault();
  const input = $('dimensionValue'), value = readNumber(input);
  if ((dimensionField === 'bracket' && !bracketLayout(bracketSpan, { ...bracketOffsets, [selectedBracket]: value }).length) || !Number.isFinite(value) || (dimensionField === 'gap' && value < 0)) {
    input.setAttribute('aria-invalid', 'true'); $('dimensionError').hidden = false; input.focus(); return;
  }
  if (dimensionField === 'bracket') bracketOffsets[selectedBracket] = value;
  else draft[dimensionField] = dimensionField === 'rotationDeg' ? ((value % 360) + 360) % 360 : value;
  input.removeAttribute('aria-invalid');
  $('dimensionDialog').close('confirm'); render();
});
$('wizardMode').addEventListener('click', () => { mode = 'wizard'; render(); });
$('workMode').addEventListener('click', () => { mode = 'work'; render(); });
$('back').addEventListener('click', () => { if (step === 0) choosingChild = false; else { step--; if(step === 0) choosingChild = true; } render(); $('panelScroll').scrollTop=0; });
$('next').addEventListener('click', () => {
  if (mode === 'wizard' && step < 3) { if(step === 0 && !choosingChild) choosingChild = true; else step++; render(); $('panelScroll').scrollTop=0; return; }
  if (!solve().ok) return;
  if (!integrated && bracketPlan?.ok) draft.brackets = { enabled: true, offsets: { ...bracketOffsets }, childPart: children[draft.child].surface?.compId || 'frame' };
  else if(!integrated)delete draft.brackets;
  if (integrated) {
    if (!loadSession.allowConfirm(LOAD_GRAPH_TOKEN)) { $('message').textContent = LOAD_MISMATCH_MESSAGE; return; }
    if(!parentCandidate?.saveable)return;
    $('next').disabled=true;parent.postMessage({type:'face-wizard-confirm',loadGraph:LOAD_GRAPH_TOKEN,candidateId:parentCandidate.candidateId,selectionRevision:parentCandidate.selectionRevision},location.origin);return;
  }
  saved = { ...draft }; hasConfirmed = true; render();
  const placement = buildFacePlacement({ host: hosts[saved.host], child: children[saved.child], selection: saved });
  $('placementRecord').hidden = !placement.ok;
  $('message').textContent = placement.ok ? (bracketPlan?.ok ? '已確認角碼孔位配置。' : '已確認擺放；此接法仍需轉接設計。') : placement.reason;
});
$('placementRecord').addEventListener('click', () => {
  const result = buildFacePlacement({ host: hosts[saved.host], child: children[saved.child], selection: saved });
  if (!result.ok) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(result.record, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'face-placement-preview.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('cancel').addEventListener('click', () => {
  if (integrated) { parent.postMessage({ type: 'face-wizard-cancel' }, location.origin); return; }
  draft = { ...saved }; render(); $('message').textContent = hasConfirmed ? '已回到上次確認的擺放。' : '已回到初始示例。';
});
$('viewLeft').addEventListener('click', () => { viewYaw -= 90; preview(); });
$('viewRight').addEventListener('click', () => { viewYaw += 90; preview(); });
$('viewFlip').addEventListener('click', () => { viewElevation = -viewElevation; preview(); });
$('viewReset').addEventListener('click', () => { viewYaw = 45; viewElevation = 30; preview(); });
$('scene').addEventListener('pointerdown', e => {
  if(e.target.closest?.('[data-dimension-handle]'))return;
  if (e.button !== 0) return;
  draggedView = false;
  viewDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, yaw: viewYaw, elevation: viewElevation };
});
$('scene').addEventListener('pointermove', e => {
  if (!viewDrag || viewDrag.id !== e.pointerId) return;
  const dx = e.clientX - viewDrag.x, dy = e.clientY - viewDrag.y;
  if (!draggedView && Math.hypot(dx, dy) < 6) return;
  draggedView = true;
  $('scene').setPointerCapture(e.pointerId);
  viewYaw = viewDrag.yaw + dx * .5;
  viewElevation = Math.max(-75, Math.min(75, viewDrag.elevation + dy * .4));
  preview();
});
const endViewDrag = () => { viewDrag = null; };
$('scene').addEventListener('pointerup', endViewDrag);
$('scene').addEventListener('pointercancel', endViewDrag);
$('scene').addEventListener('lostpointercapture', endViewDrag);

function drawCandidateScene(mate){
 const svg=$('scene');svg.replaceChildren();$('bracketNote').hidden=false;fitControls.hidden=false;
 bracketPlan=parentCandidate?.bracket || null;bracketSpan=bracketPlan?.span || 0;
 const pending=parentCandidate?.selectionRevision!==previewSignature;
 if(fastenerKind==='tab-nut')renderTabNutDimensions($('tabNutDimensions'),$('tabNutComputed'),parentCandidate?.tabNut,{pending:previewResultRequest!==previewRequest,onPreview:(key,v)=>showNumber($(`tabNut-${key}`),v),onChange:(key,v)=>{tabNutSettings[key]=v;showNumber($(`tabNut-${key}`),v);render();}});
 $('bracketNote').textContent=pending?'此圖為上次候選；目前設定待檢查。':parentCandidate?.tabNut?.ok?'3 mm 板雙榫＋M3 · 試作，實物待核對':bracketPlan?.ok?`角碼 ${bracketPlan.brackets.length} 顆 · 固定孔 Ø3.2`:parentCandidate?.reason || '僅幾何定位，尚未配置固定五金。';
 if(!parentCandidate?.model){$('mateOverlay').hidden=true;return;}
 const faces=candidateMaterialFaces(parentCandidate.model),points=faces.flatMap(f=>f.rings.flat()),projected=points.map(viewCoords);
 const minX=Math.min(...projected.map(p=>p.x)),maxX=Math.max(...projected.map(p=>p.x)),minY=Math.min(...projected.map(p=>p.y)),maxY=Math.max(...projected.map(p=>p.y));
 const scale=Math.min(500/Math.max(1,maxX-minX),300/Math.max(1,maxY-minY));
 const screen=p=>{const q=viewCoords(p);return {x:300+(q.x-(minX+maxX)/2)*scale,y:180+(q.y-(minY+maxY)/2)*scale};};
 const make=(name,attrs)=>{const e=document.createElementNS('http://www.w3.org/2000/svg',name);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));svg.appendChild(e);return e;};
 const red=new Set((pending?[]:parentCandidate.validation.material?.findings || []).flatMap(f=>f.pickKeys));
 faces.map(f=>({...f,depth:f.rings.flat().reduce((n,p)=>n+viewCoords(p).depth,0)/f.rings.flat().length})).sort((a,b)=>a.depth-b.depth).forEach(f=>{
  const d=f.rings.map(r=>r.map(screen).map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ')+'Z').join(' ');
  make('path',{d,'fill-rule':'evenodd',fill:f.unsupported?'none':red.has(f.pickKey)?'#cf5046':f.color,stroke:f.unsupported?'#ca8b31':red.has(f.pickKey)?'#932b26':'#47636a','stroke-width':red.has(f.pickKey)?2:1,'fill-opacity':.8,'data-part-id':f.partId,'data-pick-key':f.pickKey});
 });
 const face=candidateHostFace(parentCandidate,parentCandidate.placement.selection.hostFace);
 if(face)positionMateOverlay(face,screen);else $('mateOverlay').hidden=true;
 for(const slot of bracketPlan?.brackets || []){const physical=bracketPlan.physical?.find(p=>p.slotId===slot.id);if(!physical)continue;const center=candidateHostPoint(parentCandidate,slot.corner);if(!center)continue;const q=screen(center);
  const choose=()=>{selectedBracket=slot.id;openDimension('bracket',bracketOffsets[slot.id] || 0);};
  const end=screen(candidateHostPoint(parentCandidate,add(slot.corner,physical.seamAxis))),value=bracketOffsets[slot.id]||0;
  dimensionHandle(svg,{key:'bracket-'+slot.id,label:'角碼 '+slot.id,point:q,direction:{x:end.x-q.x,y:end.y-q.y},value,min:-bracketSpan/2,max:bracketSpan/2,activate:choose,color:slot.reason?'#b34436':'#087f8c',
    preview:v=>{selectedBracket=slot.id;bracketOffsets[slot.id]=v;render();},cancel:()=>{bracketOffsets[slot.id]=value;render();},commit:v=>{if(!bracketLayout(bracketSpan,{...bracketOffsets,[slot.id]:v}).length){$('message').textContent='角碼位置超出接合區，請縮小位移。';return;}bracketOffsets[slot.id]=v;render();}});

 }
}
function scene(mate) {
  if(integrated&&step===3){drawCandidateScene(mate);return;}
  const svg = $('scene'); svg.replaceChildren();
  const polygons = [], objects = [], separate = !!children[draft.child].blockedReason || (mode === 'wizard' && step <= 2 && !roughPlaced);
  for (const [which, bounds, selected] of [['host', hosts[draft.host].box, draft.hostFace], ['child', children[draft.child].box, draft.childFace]]) {
    // 兩個實際機構同時保留，方向框貼在接合板上；選好兩面先預覽粗組位。
    const picking = mode === 'wizard' && (step === 1 || step === 2);
    const halfZ = Math.max((bounds.max.z - bounds.min.z) / 2, 35, Math.min(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y) / 3);
    const faceBounds = picking ? { min: { x: bounds.min.x - 12, y: bounds.min.y - 12, z: -halfZ }, max: { x: bounds.max.x + 12, y: bounds.max.y + 12, z: halfZ } } : bounds;
    const extent = (source, side) => Math[side === 'max' ? 'max' : 'min'](...[source.box[side].x, ...(source.parts || []).flatMap(p => p.points.map(q => q.x))]);
    const spacing = extent(hosts[draft.host], 'max') - extent(children[draft.child], 'min') + 60;
    const transform = p => which === 'host' ? p : separate ? add(p, { x: spacing, y: 0, z: 10 }) : transformMatePoint(mate, p);
    const source = which === 'host' ? hosts[draft.host] : children[draft.child];
    for (const part of source.parts || []) objects.push({ ...part, which, points: part.points.map(p => transform({ ...p, z: 0 })) });
    if(which==='child' && children[draft.child].blockedReason)continue;
    for (const face of boxFaces(faceBounds)) {
      const points = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => transform(add(face.center, add(mul(face.u, u * face.width / 2), mul(face.v, v * face.height / 2)))));
      const center = transform(face.center);
      const normalPoint = transform(add(face.center, face.n));
      const normal = { x: normalPoint.x - center.x, y: normalPoint.y - center.y, z: normalPoint.z - center.z };
      const visible = viewCoords(normal).depth > .01;
      polygons.push({ which, id: face.id, points, center, u: face.u, v: face.v, n: normal, visible, selected: selected === face.id, depth: viewCoords(center).depth, transform, bounds });
    }
  }
  const all = [...polygons, ...objects].flatMap(p => p.points.map(project));
  const minX = Math.min(...all.map(p => p.x)), maxX = Math.max(...all.map(p => p.x));
  const minY = Math.min(...all.map(p => p.y)), maxY = Math.max(...all.map(p => p.y));
  const scale = Math.min(470 / Math.max(1, maxX - minX), 260 / Math.max(1, maxY - minY));
  const screen = p => { const q = project(p); return { x: 300 + (q.x - (minX + maxX) / 2) * scale, y: 180 + (q.y - (minY + maxY) / 2) * scale }; };
  const make = (name, attrs) => { const e = document.createElementNS('http://www.w3.org/2000/svg', name); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); svg.appendChild(e); return e; };
  polygons.filter(p => p.visible).sort((a, b) => a.depth - b.depth).forEach(p => {
    const face = make('polygon', { points: p.points.map(screen).map(q => `${q.x},${q.y}`).join(' '), fill: p.selected ? (p.which === 'host' ? '#349ee8' : '#6cd9b0') : p.which === 'host' ? '#a9c4d3' : '#a9d0bc', stroke: p.which === 'host' ? '#44758c' : '#448876', 'stroke-width': p.selected ? 3 : 1.5, 'fill-opacity': .18 });
    const selectable = mode === 'work' || (p.which === 'host' ? step === 1 : step === 2);
    if (selectable) {
      face.dataset[p.which === 'host' ? 'hostFace' : 'childFace'] = p.id;
      face.setAttribute('role', 'button'); face.setAttribute('tabindex', '0');
      face.setAttribute('aria-label', `選${p.which === 'host' ? '承接端' : '安裝端'}${names[p.id]}`);
      face.setAttribute('aria-pressed', String(p.selected));
      face.style.cursor = 'pointer';
      const field = p.which === 'host' ? 'hostFace' : 'childFace';
      face.addEventListener('click', () => { if (!draggedView) update(field, p.id); });
      face.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); update(field, p.id); }
      });
    }
    if (p.id === 'top' || p.id === 'bottom') {
      const source = p.which === 'host' ? hosts[draft.host] : children[draft.child];
      const z = p.id === 'top' ? p.bounds.max.z : p.bounds.min.z;
      for (const ring of source.outlines) {
        make('polygon', { points: ring.map(q => screen(p.transform({ ...q, z }))).map(q => `${q.x},${q.y}`).join(' '), fill: 'none', stroke: p.which === 'host' ? '#1c557e' : '#206c4b', 'stroke-width': 2, 'pointer-events': 'none' });
      }
      for (const hole of source.holes) {
        if (!(hole.r > 0)) continue;
        const ring = Array.from({ length: 16 }, (_, i) => ({ x: hole.x + Math.cos(i * Math.PI / 8) * hole.r, y: hole.y + Math.sin(i * Math.PI / 8) * hole.r, z }));
        make('polygon', { points: ring.map(q => screen(p.transform(q))).map(q => `${q.x},${q.y}`).join(' '), fill: '#f5f4ef', stroke: '#427066', 'stroke-width': 1, 'pointer-events': 'none' });
      }
      for (const cutout of source.cutouts) {
        make('polygon', { points: cutout.points.map(q => screen(p.transform({ ...q, z }))).map(q => `${q.x},${q.y}`).join(' '), fill: '#f5f4ef', stroke: '#427066', 'stroke-width': 1, 'pointer-events': 'none' });
      }
    }
  });
  for (const part of objects) make('polygon', { 'data-mechanism': part.which, points: part.points.map(screen).map(q => `${q.x},${q.y}`).join(' '), fill: part.color, 'fill-opacity': part.which==='child' && childConfirmed && part.partId===children[draft.child].partId ? 1 : .45, stroke: part.which==='child' && childConfirmed && part.partId===children[draft.child].partId ? '#e99b00' : part.color, 'stroke-width': part.which==='child' && childConfirmed && part.partId===children[draft.child].partId ? 5 : 2, 'pointer-events': 'none' });
  polygons.filter(p => p.selected).forEach(p => {
    if (!p.visible) make('polygon', { points: p.points.map(screen).map(q => `${q.x},${q.y}`).join(' '), fill: 'none', stroke: p.which === 'host' ? '#245c8a' : '#167553', 'stroke-width': 2.5, 'stroke-dasharray': '6 4', 'pointer-events': 'none' });
    const q = screen(p.center);
    const labelX = p.which === 'host' ? 100 : 500, labelY = p.which === 'host' ? 40 : 330;
    make('line', { x1: q.x, y1: q.y, x2: labelX, y2: labelY, stroke: '#385e60', 'stroke-width': 1.5, 'pointer-events': 'none' });
    const text = make('text', { x: labelX, y: labelY, 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 700, fill: '#173e40', stroke: '#fff', 'stroke-width': 4, 'paint-order': 'stroke', 'pointer-events': 'none' });
    text.textContent = `${p.which === 'host' ? '承接' : '安裝'} ${names[p.id]}`;
  });
  const bracketNote = $('bracketNote'); bracketNote.hidden = separate || step !== 3;
  fitControls.hidden = bracketNote.hidden;
  bracketPlan = null;
  if (!bracketNote.hidden) {
    const perpendicular = Math.abs(mate.rotation[2][2]) < 1e-6;
    bracketPlan = integrated?parentCandidate?.bracket || null:perpendicular?planFaceBrackets(hosts[draft.host],children[draft.child],mate,bracketOffsets,true,{joint:jointSettings}):null;
    if(integrated&&bracketPlan){const box=hosts[draft.host].surface.box,center=Object.fromEntries(['x','y','z'].map(k=>[k,(box.min[k]+box.max[k])/2]));const move=p=>Object.fromEntries(['x','y','z'].map(k=>[k,p[k]-center[k]]));bracketPlan={...bracketPlan,brackets:bracketPlan.brackets.map(b=>({...b,corner:move(b.corner),wings:b.wings.map(r=>r.map(move)),hostHole:move(b.hostHole),childHoleWorld:move(b.childHoleWorld)}))};}
    bracketSpan = bracketPlan?.span || 0;
    bracketNote.style.color = bracketPlan && !bracketPlan.ok ? '#b34436' : '#206f63';
    bracketNote.textContent = !perpendicular ? '非直角接合，未配置角碼孔。' : !bracketPlan?.ok ? `角碼孔待調整（${bracketPlan?.reason || '正在驗證候選'}）` : `角碼 ${bracketPlan.brackets.length} 顆 · 確認後生成兩板固定孔 Ø3.2`;
    for (const slot of bracketPlan?.brackets || []) {
      const active = selectedBracket === slot.id;
      const color = slot.reason ? '#c84436' : active ? '#d99821' : '#607d83';
      for (const wing of slot.wings) make('polygon', { points: wing.map(screen).map(q => `${q.x},${q.y}`).join(' '), fill:color,'fill-opacity':active?.55:.2,stroke:color,'stroke-width':2,'pointer-events':'none' });
      for (const point of [slot.hostHole,slot.childHoleWorld]) {
        const q=screen(point);
        make('circle',{cx:q.x,cy:q.y,r:FACE_BRACKET_SPEC.diameter/2*scale,fill:'none',stroke:slot.reason?'#c84436':'#167553','stroke-width':2,'pointer-events':'none'});
      }
      const q = screen(slot.corner);
      const choose=()=>{if(draggedView)return;selectedBracket=slot.id;preview();openDimension('bracket',bracketOffsets[slot.id]||0);};
      const physical=bracketPlan.physical?.find(p=>p.slotId===slot.id),value=bracketOffsets[slot.id]||0;
      if(physical){const end=screen(add(slot.corner,physical.seamAxis));dimensionHandle(svg,{key:'bracket-'+slot.id,label:'角碼 '+slot.id,point:q,direction:{x:end.x-q.x,y:end.y-q.y},value,min:-bracketSpan/2,max:bracketSpan/2,activate:choose,color,
        preview:v=>{bracketOffsets[slot.id]=v;render();},cancel:()=>{bracketOffsets[slot.id]=value;render();},commit:v=>{if(!bracketLayout(bracketSpan,{...bracketOffsets,[slot.id]:v}).length){$('message').textContent='角碼位置超出接合區，請縮小位移。';return;}bracketOffsets[slot.id]=v;render();}});}
    }
  }
  const axis = make('text', { x: 300, y: 370, 'text-anchor': 'middle', 'font-size': 13, fill: '#516d69' });
  axis.textContent = step === 1 || step === 2 ? '方向外框 · 點面選取' : separate ? '接合板 · 真實輪廓與固定孔' : '接合板擺放預覽';
  const hostFace = polygons.find(p => p.which === 'host' && p.id === draft.hostFace);
  if (hostFace && !separate) positionMateOverlay(hostFace, screen);
  else $('mateOverlay').hidden = true;
}
function positionMateOverlay(face,screen){
  const overlay=$('mateOverlay'),svg=$('scene');overlay.hidden=!(mode==='work'||step===3);if(overlay.hidden)return;
  const center=screen(face.center),matrix=svg.getScreenCTM();if(!matrix)return;
  const css=1/Math.hypot(matrix.a,matrix.b),offset=50*css;
  const axis=basis=>{const end=screen(add(face.center,basis));return {x:end.x-center.x,y:end.y-center.y};};
  for(const [field,label,basis] of [['offsetU','左右',face.u],['offsetV','上下',face.v],['gap','間距',face.n]]){
    const direction=axis(basis),L=Math.hypot(direction.x,direction.y);if(L<.01)continue;
    const point={x:center.x+direction.x/L*offset,y:center.y+direction.y/L*offset},value=draft[field];
    dimensionHandle(svg,{key:'mate-'+field,label,point,direction,value,min:field==='gap'?0:-2000,max:2000,
      preview:v=>{draft[field]=v;render();},cancel:()=>{draft[field]=value;render();},commit:v=>update(field,v)});
  }
  const rotation=angle(),axes={u:axis(face.u),v:axis(face.v)},r=rotation*Math.PI/180,radius=110*css/Math.max(Math.hypot(axes.u.x,axes.u.y),Math.hypot(axes.v.x,axes.v.y),.01);
  if(Math.abs(axes.u.x*axes.v.y-axes.u.y*axes.v.x)>.01)dimensionHandle(svg,{key:'mate-angle',label:'角度',point:{x:center.x+radius*(axes.u.x*Math.cos(r)+axes.v.x*Math.sin(r)),y:center.y+radius*(axes.u.y*Math.cos(r)+axes.v.y*Math.sin(r))},direction:{x:1,y:0},angleCenter:center,angleAxes:axes,value:rotation,min:-360,max:360,step:1,
    preview:v=>{draft.rotationDeg=v;render();},cancel:()=>{draft.rotationDeg=rotation;render();},commit:v=>update('rotationDeg',((v%360)+360)%360)});
  const wrap=$('sceneWrap').getBoundingClientRect(),pt=new DOMPoint(center.x,center.y).matrixTransform(matrix);$('mateCenter').style.left=`${Math.max(0,pt.x-wrap.left-22)}px`;$('mateCenter').style.top=`${Math.max(0,pt.y-wrap.top-22)}px`;
}

function render() {
  document.body.dataset.ui = mode;
  document.body.dataset.step = step;
  $('hostFaceMore').open = mode === 'work' || step === 1;
  $('wizardMode').setAttribute('aria-pressed', mode === 'wizard'); $('workMode').setAttribute('aria-pressed', mode === 'work');
  document.querySelectorAll('[data-step]').forEach(s => { s.hidden = mode === 'wizard' && Number(s.dataset.step) !== step; });
  $('progress').hidden = mode === 'work'; $('progress').replaceChildren();
  const progressStep = step === 0 ? Number(choosingChild) : step + 1;
  $('hostChoice').hidden = mode === 'wizard' && choosingChild;
  $('childChoice').hidden = mode === 'wizard' && !choosingChild;
  document.querySelector('section[data-step="0"] h2').textContent = choosingChild ? '2 · 選安裝零件' : '1 · 選承接設計與零件';
  for (let i = 0; i < 5; i++) { const dot = document.createElement('span'); if (i <= progressStep) dot.className = 'current'; $('progress').appendChild(dot); }
  document.querySelector('section[data-step="3"] h2').textContent = configured ? '調整接合位置' : '5 · 調整接合位置';
  for (const [root, field] of [['hosts', 'host'], ['children', 'child'], ['hostFaces', 'hostFace'], ['childFaces', 'childFace']]) {
    $(root).querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value) === String(draft[field]) && (field!=='child' || !integrated || childConfirmed)));
  }
  $('align').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', Number(b.dataset.u) === draft.alignU && Number(b.dataset.v) === draft.alignV));
  ['offsetU', 'offsetV', 'gap'].forEach(field => { if(document.activeElement!==$(field))showNumber($(field), draft[field]); });
  $('angleChip').textContent = `接合角度 ${Number(angle().toFixed(2))}°`;
  $('rotationActions').hidden = mode === 'wizard' && step !== 3;
  $('back').hidden = mode === 'work'; $('back').disabled = step === 0 && !choosingChild;
  $('back').textContent = '上一步';
  $('next').textContent = mode === 'work' || step === 3 ? (integrated ? '接上' : '確認擺放') : '下一步';
  if (integrated) $('cancel').textContent = '取消';
  if (integrated && configured) { $('wizardMode').parentElement.hidden = true; document.querySelector('header .tag').hidden = true; }
  if(integrated && hosts[draft.host]?.designId) {
    $('hostDesign').value=hosts[draft.host].designId;
    $('hosts').querySelectorAll('button').forEach(b=>{b.style.display=hosts[Number(b.dataset.value)].designId===hosts[draft.host].designId?'':'none';});
  }
  $('installationStatus').textContent=integrated ? (!childConfirmed?'請選擇安裝零件；底板只是建議預覽，尚未確認。':children[draft.child].blockedReason || `已選：${children[draft.child].partName}。確認接合後，此設計整組跟隨承接零件。`) : '';
  $('selectedParts').textContent=integrated ? `承接：${hosts[draft.host].name} → 安裝：${childConfirmed ? children[draft.child].name : '尚未選擇（底板為建議預覽）'}` : '';
  $('selectedPartsSummary').textContent=childConfirmed ? '已選零件' : '已選零件 · 安裝端待選';
  $('stageTitle').textContent = mode === 'work' ? '工作模式 · 外框擺放預覽' : step === 0 ? (choosingChild ? '選安裝零件' : '選承接零件') : titles[step];
  preview();
}
function preview() {
  const align = grid.find(([u, v]) => u === draft.alignU && v === draft.alignV)[2];
  $('mateUChip').textContent = dimensionText.offsetU(Number(draft.offsetU.toFixed(2)));
  $('mateVChip').textContent = dimensionText.offsetV(Number(draft.offsetV.toFixed(2)));
  $('mateGapChip').textContent = dimensionText.gap(Number(draft.gap.toFixed(2)));
  const broad = f => f === 'top' || f === 'bottom';
  const relation = broad(draft.hostFace) && broad(draft.childFace) ? '板面平行' : broad(draft.hostFace) !== broad(draft.childFace) ? '板面垂直' : '外框邊對齊';
  faceRelation.textContent = `${relation} · 間距 ${draft.gap} mm`;
  $('summary').textContent = `${relation}：${children[draft.child].name}・${names[draft.childFace]} → ${hosts[draft.host].name}・${names[draft.hostFace]}。${align}；偏置 ${draft.offsetU} / ${draft.offsetV} mm；間距 ${draft.gap} mm。`;
  const blocked=integrated && (step > 0 || choosingChild) && (!childConfirmed || !!children[draft.child].blockedReason);
  const mate = solve();$('fastenerChoice').hidden=!integrated||step!==3;fillFastenerChoices($('fastenerKind'),fastenerKind,{printed:'僅支援直角接口'});$('fastenerHelp').textContent=fastenerKind==='none'?'只記錄組立位置，不新增固定孔或五金。':fastenerKind==='tab-nut'?'榫頭插入槽口，再用 M3 螺絲與螺母鎖固；尺寸與板厚需核對。':'在圖上拖曳角碼調位置，或點角碼輸入偏移；確認後加入兩板固定孔。';$('tabNutSettings').hidden=fastenerKind!=='tab-nut';if(fastenerKind!=='tab-nut')$('tabNutFeedback').hidden=true;if(mate.ok && !blocked)requestCandidate(mate);$('next').disabled = blocked || !mate.ok || (integrated&&step===3&&(!parentCandidate?.saveable || parentCandidate.selectionRevision!==JSON.stringify(integratedSelection(mate)))) || (integrated && !loadSession.ready) || [...document.querySelectorAll('input[aria-invalid="true"]')].some(input=>input.getClientRects().length);
  if(integrated&&step===3)$('next').textContent=candidateConfirmLabel(parentCandidate,parentCandidate?.selectionRevision!==previewSignature);
  if (mate.ok) scene(mate);
  else { $('mateOverlay').hidden = true; $('message').textContent = mate.reason; $('message').classList.add('error'); }
}
if (integrated) {
  document.querySelector('header .tag').textContent = '選接合面，設定尺寸，再確認組立';
  window.addEventListener('message', e => {
    if (e.source !== parent || e.origin !== location.origin) return;
    if(e.data?.type==='face-wizard-preview-result'){
      if(e.data.requestId!==previewRequest || e.data.loadGraph!==LOAD_GRAPH_TOKEN)return;
      parentCandidate=e.data.candidate;previewResultRequest=e.data.requestId;preview();showCandidate(parentCandidate);return;
    }
    if (e.data?.type === 'face-wizard-error') {
      if (e.data.loadMismatch) { loadSession.receiveReady(null); $('next').disabled = true; }
      $('message').textContent=e.data.reason;parentCandidate=null;previewSignature='';$('next').disabled=true;return;
    }
    if (e.data?.type !== 'face-wizard-init') return;
    if (!loadSession.receiveReady(e.data.loadGraph)) { $('message').textContent = LOAD_MISMATCH_MESSAGE; $('next').disabled = true; return; }
    if (!Array.isArray(e.data.hosts) || !e.data.hosts.length || !Array.isArray(e.data.children) || !e.data.children.length) return;
    mode = 'wizard';
    jointSettings = e.data.joint; hosts = e.data.hosts; children = e.data.children; draft = { ...initial, ...(e.data.selection || {}), host: e.data.host >= 0 ? e.data.host : 0 }; saved = { ...draft }; step = 0; choosingChild = false; configured = !!e.data.configured; childConfirmed=!!e.data.childConfirmed; roughPlaced = configured;
    bracketOffsets = { ...(draft.brackets?.offsets || {}) };
    fastenerKind=faceFastenerKind(draft,configured);tabNutSettings={...TAB_NUT_DEFAULTS,...draft.fastener};for(const input of $('tabNutSettings').querySelectorAll('input'))input.value=tabNutSettings[input.id.replace('tabNut-','')];
    // 預設面僅作預選；只有明確重新調整位置才略過選面。
    if (e.data.startAtPlacement) step = 3;
    if (configured && !document.getElementById('optionalView')) {
      const view = document.querySelector('.view-actions'), more = document.createElement('details'), label = document.createElement('summary');
      more.id = 'optionalView'; label.textContent = '觀看角度'; label.style.cssText = 'min-height:44px;display:flex;align-items:center;cursor:pointer;';
      view.before(more); more.append(label, view);
    }
    document.querySelector('h1').textContent = '接合預覽';
    $('hosts').replaceChildren(); $('children').replaceChildren();
    buildCards($('hosts'), hosts, 'host'); buildCards($('children'), children, 'child');
buildDesignChoice();
 render();
  });
  parent.postMessage({ type: 'face-wizard-ready', loadGraph: LOAD_GRAPH_TOKEN }, location.origin);
}
window.addEventListener('resize', () => { if (!$('mateOverlay').hidden) preview(); });
render();
