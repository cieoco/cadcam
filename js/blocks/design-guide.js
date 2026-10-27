import { pointKeysFor } from './part-types.js';

const powered = c => !!c.isInput || pointKeysFor(c).some(k => c[k]?.type === 'motor' || c[k]?.physicalMotor || c[k]?.physical_motor);

// Advisory only: these stages never claim that motion or fabrication is verified.
export function designGuideStep(comps) {
  if (!comps.some(c=>c.type!=='anchor')) return {stage:'draw',title:'1 · 畫運動骨架',text:'先想末端要去哪裡、姿態要不要保持；再畫桿件與接孔。',action:'新增桿件'};
  const fixed=new Set(comps.flatMap(c=>pointKeysFor(c).filter(k=>['fixed','motor'].includes(c[k]?.type)).map(k=>c[k].id)));
  if(comps.every(c=>pointKeysFor(c).every(k=>!c[k]||fixed.has(c[k].id)))) return {stage:'draw',title:'2 · 接上活動桿件',text:'目前只有固定結構。從機架孔接出活動桿，或在接點編輯中解除不需要的固定，再指定驅動。',action:'新增桿件'};
  if (!comps.some(c=>pointKeysFor(c).some(k=>['fixed','motor'].includes(c[k]?.type)))) return {stage:'frame',title:'2 · 決定固定基準',text:'選底座桿設為機架，或選孔設為固定點。固定一個孔只限制孔的位置，桿仍可能旋轉。',action:'設定所選機架'};
  if (!comps.some(powered)) return {stage:'drive',title:'3 · 指定輸入動作',text:'選馬達或舵機，再點旋轉軸並選被帶動的桿；確認外殼固定在哪裡。',action:'選擇動力來源'};
  return {stage:'try',title:'4 · 試播並檢查行程',text:'先確認固定基準與驅動範圍，再試播看末端動作。已有動力不代表能轉一整圈；承載與干涉仍需另驗證。',action:'試播／暫停'};
}

export function guideFrameCandidate(comps, {componentId,nodeId,positions={}}={}) {
  const comp=comps.find(c=>c.id===componentId);
  const ids=new Set(nodeId?[nodeId]:comp&&['bar','triangle'].includes(comp.type)?pointKeysFor(comp).map(k=>comp[k]?.id).filter(Boolean):[]);
  if(!ids.size || !comps.some(c=>pointKeysFor(c).some(k=>ids.has(c[k]?.id)))) return {ok:false,message:'先點選底座桿件，或要固定的接點'};
  if(comps.some(c=>powered(c)&&pointKeysFor(c).some(k=>ids.has(c[k]?.id)))) return {ok:false,message:'所選孔連接動力來源；請先在原編輯介面調整動力，避免誤鎖驅動桿'};
  const candidate=structuredClone(comps);
  for(const c of candidate)for(const k of pointKeysFor(c))if(ids.has(c[k]?.id)){
    const p=c[k],pos=positions[p.id];p.type='fixed';
    if(pos&&Number.isFinite(pos.x)&&Number.isFinite(pos.y)){p.x=pos.x;p.y=pos.y;}
  }
  return {ok:true,comps:candidate};
}

export function createDesignGuide({next,frame}) {
  const root=document.getElementById('designGuide');
  const title=document.getElementById('guideTitle'),text=document.getElementById('guideText');
  const action=document.getElementById('guideNext'),fix=document.getElementById('guideFrame');
  let step;
  action.addEventListener('click',()=>{
    root.close();
    next(step.stage);
  });
  fix.addEventListener('click',()=>{frame();});
  return {sync(comps,selection,mode){
    root.hidden=mode==='bench';step=designGuideStep(comps);
    title.textContent=step.title;text.textContent=step.text;action.textContent=step.action;
    fix.hidden=step.stage==='frame'||!selection;
    document.getElementById('guideSelection').textContent=selection?`目前選取：${selection}`:'先在畫布點選桿件或接點，再回到引導設定機架。';
  }};
}
