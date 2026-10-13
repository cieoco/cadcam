import { fusionPairReason } from './part-fusion.js';
import { inspectFusion } from './exporters.js';

export function planFusionPair(comps, firstId, secondId, params, settings) {
  const first=comps.find(c=>c.id===firstId),second=comps.find(c=>c.id===secondId);
  if(!first||!second||first===second)return {ok:false,reason:'請選另一個零件。'};
  const plate=first.type==='triangle'?first:second,gear=first.type==='gear'?first:second;
  const reason=fusionPairReason(comps,plate,gear);
  if(reason)return {ok:false,reason};
  if(plate.fusedWith)return {ok:false,reason:'這兩件已合成。'};
  return inspectFusion(comps,{...plate,fusedWith:gear.id},params,settings);
}

const name=c=>`${c.type==='gear'?'齒輪':c.type==='triangle'?'板件':'零件'} ${c.name||c.id}`;
const NS='http://www.w3.org/2000/svg';
// Modal keeps touch selection away from tiny holes and never edits the live snapshot.
export function openFusionPreview({first,comps,params,settings,onConfirm,onClose}) {
  const dialog=document.createElement('dialog');
  dialog.className='fusion-dialog';
  dialog.setAttribute('aria-label','聯集合成預覽');
  const style=document.createElement('style');
  style.textContent=`.fusion-dialog{box-sizing:border-box;width:min(620px,calc(100vw - 20px));max-height:85dvh;padding:16px;border:1px solid #9ab2c5;border-radius:16px;color:#23415a;background:white;overflow:auto}.fusion-dialog::backdrop{background:#142d4666}.fusion-dialog h2{font-size:19px;margin:0 0 8px}.fusion-dialog p{font-size:14px;margin:8px 0}.fusion-dialog button{font:inherit;min-height:44px;border:1px solid #9ab2c5;border-radius:8px;background:#f4f9fc;color:#23415a;padding:8px 12px}.fusion-dialog button:disabled{opacity:.7}.fusion-choices{display:grid;gap:8px;max-height:24dvh;overflow:auto;margin:12px 0}.fusion-choices button{text-align:left}.fusion-choices small{display:block;font-size:12px}.fusion-choices [aria-pressed=true]{background:#dff3e6;border:2px solid #27834f}.fusion-pictures{display:flex;gap:8px}.fusion-pictures figure{margin:0;min-width:0;flex:1}.fusion-pictures figcaption{font-size:13px;text-align:center}.fusion-pictures svg{width:100%;height:150px;background:#f4f7fa;border-radius:8px}.fusion-actions{position:sticky;bottom:-16px;background:white;display:flex;gap:10px;padding:12px 0;margin-top:8px}.fusion-actions button{flex:1}.fusion-actions button:last-child{background:#285b85;color:white}`;
  dialog.append(style);
  const heading=document.createElement('h2');heading.textContent='聯集：選第二件';dialog.append(heading);
  const firstLabel=document.createElement('p');firstLabel.textContent=`第一件：${name(first)}。選擇要一起製成一片的零件。`;dialog.append(firstLabel);
  const choices=document.createElement('div');choices.className='fusion-choices';dialog.append(choices);
  const result=document.createElement('div');result.setAttribute('aria-live','polite');dialog.append(result);
  const actions=document.createElement('div');actions.className='fusion-actions';dialog.append(actions);
  const cancel=document.createElement('button');cancel.textContent='取消';actions.append(cancel);
  const confirm=document.createElement('button');confirm.textContent='確認合成';confirm.disabled=true;actions.append(confirm);
  let secondId=null,closed=false;
  const close=()=>{if(closed)return;closed=true;dialog.close();dialog.remove();onClose?.();};
  cancel.onclick=close;
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  const text=value=>{const p=document.createElement('p');p.textContent=value;result.append(p);};
  const preview=plan=>{
    result.replaceChildren();
    if(!plan.ok){text(plan.reason);return;}
    text(`${name(first)} ＋ ${name(comps.find(c=>c.id===secondId))}`);
    const pictures=document.createElement('div');pictures.className='fusion-pictures';result.append(pictures);
    const bounds=plan.geometry.outline;
    const xs=bounds.map(p=>p.x),ys=bounds.map(p=>p.y),x=Math.min(...xs)-4,y=Math.min(...ys)-4,w=Math.max(...xs)-x+4,h=Math.max(...ys)-y+4;
    const ring=points=>points.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ')+'Z';
    for(const merged of [false,true]) {
      const figure=document.createElement('figure'),caption=document.createElement('figcaption');
      caption.textContent=merged?'聯集後：一片':'選取：藍色齒輪＋橘色板件';
      const svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox',`${x} ${y} ${w} ${h}`);svg.setAttribute('role','img');svg.setAttribute('aria-label',caption.textContent);
      const add=(d,color)=>{const path=document.createElementNS(NS,'path');path.setAttribute('d',d);path.setAttribute('fill',color);path.setAttribute('fill-opacity','.65');path.setAttribute('stroke',color);path.setAttribute('stroke-width','.5');path.setAttribute('fill-rule','evenodd');svg.append(path);};
      if(merged) {
        const holes=plan.geometry.holes.map(h=>ring(Array.from({length:40},(_,i)=>({x:h.x+h.r*Math.cos(i*Math.PI/20),y:h.y+h.r*Math.sin(i*Math.PI/20)}))));
        add([ring(bounds),...holes,...plan.geometry.cutouts.map(c=>ring(c.points))].join(' '),'#27834f');
      } else {
        add(ring(plan.sourceOutlines.gear),'#287dbc');
        plan.sourceOutlines.plate.forEach(r=>add(ring(r),'#c97518'));
      }
      figure.append(svg,caption);pictures.append(figure);
    }
    text(`共用兩孔、外形連續；合成厚度沿用板件 ${plan.thicknessMm} mm。保留原運動關係與參數。`);
    text('這是平面輪廓聯集預覽；未驗證實體干涉、承載或加工就緒。');
    plan.warnings.forEach(text);
  };
  const candidates=comps.filter(c=>c.id!==first.id&&c.moduleId===first.moduleId&&['gear','triangle'].includes(c.type));
  for(const candidate of candidates) {
    const plan=planFusionPair(comps,first.id,candidate.id,params,settings);
    const button=document.createElement('button');button.textContent=name(candidate);button.setAttribute('aria-pressed','false');
    if(!plan.ok){const why=document.createElement('small');why.textContent=plan.reason;button.append(why);button.disabled=true;}
    button.onclick=()=>{secondId=candidate.id;heading.textContent='聯集：預覽後確認';for(const b of choices.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b===button));preview(plan);confirm.disabled=!plan.ok;};
    choices.append(button);
  }
  if(!candidates.length)text('此設計沒有可選的齒輪或三點板件。');
  else text('目前支援同一設計內的齒輪＋三點板件；共用軸心及定位孔才可配對。');
  confirm.onclick=()=>{if(secondId){const error=onConfirm(first.id,secondId);if(error){result.replaceChildren();text(error);confirm.disabled=true;}else close();}};
  document.body.append(dialog);dialog.showModal();cancel.focus();
  return {close};
}
