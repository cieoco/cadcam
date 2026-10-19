import {DEFAULT_HYDRAULIC_SEQUENCE,prepareHydraulicSequence,sequenceExtensionsAt,sequenceSyringeOptions,MAX_HYDRAULIC_STEPS} from './hydraulic-sequence.js';

// 液壓動作序列編輯器：一步推一支針筒。播放與匯出都只改針筒伸出量，結束或停止後回到原姿勢。
let open=false;
const el=(tag,text,parent,css)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(css)n.style.cssText=css;if(parent)parent.append(n);return n;};
const width=s=>[...s].reduce((w,ch)=>w+(ch.charCodeAt(0)>255?2:1),0);
// 影片下方的證據行：每步都點名，盡量塞滿一行再換行。
export function hydraulicEvidenceLines(plan,labels,version){
  const lines=['液壓動作序列（升降＋夾爪）',`${plan.steps.length} 步／${plan.duration} 秒；每 0.5 mm 取樣求解通過（${plan.samples} 點）`];
  let row='';
  plan.steps.forEach((s,i)=>{
    const part=`${i+1} ${s.name} ${labels[s.syringe]||s.syringe} ${s.extension} mm`,next=row?`${row}  →  ${part}`:part;
    if(row&&width(next)>96){lines.push(row);row=part;}else row=next;
  });
  if(row)lines.push(row);
  lines.push(`${version}；幾何結果，不代表抓取、碰撞或承載驗證`);
  return lines;
}
export function openHydraulicSequence({readSource,applyExtensions,restore,initialSequence,saveSequence,svg,version}){
  if(open)return;open=true;
  const source=readSource(),options=sequenceSyringeOptions(source);
  if(!options.length){open=false;return;}
  const labels=Object.fromEntries(options.map(o=>[o.id,o.label]));
  const strokeOf=id=>options.find(o=>o.id===id)?.stroke??20;
  const startNow=()=>Object.fromEntries(readSource().comps.filter(c=>c.type==='syringe').map(c=>[c.id,c.extension]));
  let steps=(initialSequence?.steps?.length?initialSequence.steps:DEFAULT_HYDRAULIC_SEQUENCE(source)).map(s=>({...s}));
  if(!steps.length)steps=[{name:'步驟 1',syringe:options[0].id,extension:options[0].stroke,seconds:2}];
  const dialog=el('dialog',null,null,'box-sizing:border-box;width:min(94vw,520px);margin:auto auto 8px;border:1px solid #b8cbd2;border-radius:12px;padding:0;color:#18324b;overflow:hidden');
  const shell=el('div',null,dialog,'display:flex;flex-direction:column;max-height:min(62dvh,560px)');
  dialog.setAttribute('aria-label','液壓動作序列');
  const body=el('div',null,shell,'padding:12px 12px 4px;overflow:auto;flex:1 1 auto;min-height:0');
  el('h2','液壓動作序列',body,'font-size:18px;margin:0 0 4px');
  const note=el('p','一步推一支針筒，從目前位置等速移到目標。推出量 0 mm 為縮回；夾爪推出為夾緊。這是幾何動作，不驗證抓取或碰撞。',body,'margin:0 0 6px;font-size:13px');
  const status=el('p','改好步驟後按「驗證」，再按「播放」。結束或停止都會回到原姿勢。',body,'margin:0 0 6px;font-weight:600;font-size:14px');
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const list=el('div',null,body);
  const footer=el('div',null,shell,'display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px 12px;border-top:1px solid #d5e1e6;background:#fff;flex:0 0 auto');
  const btn=(text,fn)=>{const b=el('button',text,footer,'min-height:44px;min-width:44px;padding:0 12px');b.type='button';b.onclick=fn;return b;};
  const small=(text,label,parent,fn)=>{const b=el('button',text,parent,'min-width:44px;min-height:44px;padding:0');b.type='button';b.setAttribute('aria-label',label);b.onclick=fn;return b;};
  const rows=[];
  function render(focus){
    list.textContent='';rows.length=0;
    steps.forEach((s,i)=>{
      const card=el('div',null,list,'border:1px solid #c9d8de;border-radius:8px;padding:6px;margin:6px 0;display:grid;grid-template-columns:minmax(0,1fr);gap:6px');
      const top=el('div',null,card,'display:flex;gap:4px;align-items:center');
      el('span',`${i+1}`,top,'min-width:20px;font-weight:700');
      const name=el('input',null,top,'flex:1 1 0;width:0;min-width:0;min-height:44px;box-sizing:border-box');name.type='text';name.maxLength=40;name.value=s.name;name.setAttribute('aria-label',`第${i+1}步名稱`);
      name.oninput=()=>{s.name=name.value;};
      const up=small('▲',`第${i+1}步上移`,top,()=>{if(i>0){[steps[i-1],steps[i]]=[steps[i],steps[i-1]];render(`up${i-1}`);}});
      const down=small('▼',`第${i+1}步下移`,top,()=>{if(i<steps.length-1){[steps[i+1],steps[i]]=[steps[i],steps[i+1]];render(`down${i+1}`);}});
      up.disabled=i===0;down.disabled=i===steps.length-1;
      small('✕',`刪除第${i+1}步`,top,()=>{steps.splice(i,1);render();status.textContent=steps.length?`已刪除第 ${i+1} 步。`:'目前沒有步驟，請按「加一步」。';});
      const bottom=el('div',null,card,'display:flex;gap:4px;align-items:center;flex-wrap:wrap');
      const select=el('select',null,bottom,'flex:1 1 90px;width:0;min-width:0;min-height:44px');select.setAttribute('aria-label',`第${i+1}步針筒`);
      for(const o of options){const opt=el('option',o.label,select);opt.value=o.id;}
      select.value=s.syringe;
      const ext=el('input',null,bottom,'width:64px;min-height:44px;box-sizing:border-box'),sec=document.createElement('input');sec.style.cssText='width:56px;min-height:44px;box-sizing:border-box';
      el('span','mm',bottom);bottom.append(sec);el('span','秒',bottom);
      ext.type=sec.type='number';ext.step='0.5';ext.min='0';ext.max=String(strokeOf(s.syringe));ext.value=Number.isFinite(s.extension)?s.extension:'';ext.setAttribute('aria-label',`第${i+1}步目標 mm`);
      sec.step='0.5';sec.min='0.5';sec.max='5';sec.value=Number.isFinite(s.seconds)?s.seconds:'';sec.setAttribute('aria-label',`第${i+1}步秒數`);
      select.onchange=()=>{s.syringe=select.value;ext.max=String(strokeOf(s.syringe));};
      ext.oninput=()=>{s.extension=ext.value.trim()?Number(ext.value):NaN;};
      sec.oninput=()=>{s.seconds=sec.value.trim()?Number(sec.value):NaN;};
      rows.push({card,name,up,down});
    });
    if(focus){const m=/^(up|down)(\d+)$/.exec(focus),r=m&&rows[Number(m[2])];(m&&(m[1]==='up'?r?.up:r?.down)?.disabled?r?.name:m&&(m[1]==='up'?r?.up:r?.down))?.focus();}
  }
  const mark=message=>{rows.forEach(r=>{r.card.style.borderColor='#c9d8de';});const n=/^第 (\d+) 步/.exec(message||'');if(n&&rows[Number(n[1])-1]){const r=rows[Number(n[1])-1];r.card.style.borderColor='#b3261e';r.card.scrollIntoView?.({block:'nearest'});}};
  const plan=()=>{const p=prepareHydraulicSequence(readSource(),steps.map(s=>({...s})),startNow());mark(p.ok?null:p.message);return p;};
  let busy=false,raf=0,running=false,play,stopBtn,validate,add,save,exportBtn;
  const lock=on=>{for(const b of [validate,add,save,exportBtn,play])b.disabled=on;list.querySelectorAll('input,select,button').forEach(n=>{n.disabled=on;});};
  function finish(message){
    cancelAnimationFrame(raf);const was=running;running=false;
    if(was)restore();
    list.hidden=false;note.hidden=false;lock(false);render();
    if(message)status.textContent=message;
  }
  add=btn('加一步',()=>{
    if(steps.length>=MAX_HYDRAULIC_STEPS){status.textContent=`最多 ${MAX_HYDRAULIC_STEPS} 步。`;return;}
    const o=options[0],prev=steps[steps.length-1];
    steps.push({name:`步驟 ${steps.length+1}`,syringe:prev?.syringe||o.id,extension:prev?strokeOf(prev.syringe)-prev.extension:o.stroke,seconds:2});
    render();status.textContent=`已加第 ${steps.length} 步，請改名稱、針筒與目標。`;
    rows[rows.length-1]?.name.focus();
  });
  validate=btn('驗證',()=>{const p=plan();status.textContent=p.ok?`通過：${p.steps.length} 步／${p.duration} 秒；每 0.5 mm 取樣 ${p.samples} 點都可解。`:p.message;});
  play=btn('播放',()=>{
    const p=plan();if(!p.ok){status.textContent=p.message;return;}
    running=true;lock(true);list.hidden=true;note.hidden=true;stopBtn.disabled=false;
    const began=performance.now();
    const frame=now=>{
      const elapsed=Math.min((now-began)/1000,p.duration),pose=sequenceExtensionsAt(p,elapsed),s=p.steps[pose.index];
      try{applyExtensions(pose.extensions,s.syringe);}catch(e){finish(`已停止：${e.message}`);return;}
      status.textContent=`第 ${pose.index+1} 步：${s.name}（${elapsed.toFixed(1)}／${p.duration} 秒）`;
      if(elapsed>=p.duration){finish('播放完成，已回到原姿勢；只通過取樣求解檢查。');return;}
      raf=requestAnimationFrame(frame);
    };
    raf=requestAnimationFrame(frame);
  });
  stopBtn=btn('停止',()=>{if(running)finish('已停止，回到原姿勢。');});
  save=btn('儲存序列',()=>{const p=plan();if(!p.ok){status.textContent=p.message;return;}saveSequence({start:p.start,steps:p.steps});status.textContent='序列已儲存在作品裡，可復原；下載作品 JSON 可備份。';});
  exportBtn=btn('匯出 MP4',async()=>{
    const p=plan();if(!p.ok){status.textContent=p.message;return;}
    if(busy)return;busy=true;lock(true);
    try{
      const {exportAnimation}=await import('./video-export.js');
      let elapsed=0;
      await exportAnimation({svg,begin:()=>({
        duration:p.duration+1/24,
        evidence:{lines:hydraulicEvidenceLines(p,labels,version)},
        frame:dt=>{elapsed+=dt;const pose=sequenceExtensionsAt(p,elapsed/1000);applyExtensions(pose.extensions,p.steps[pose.index].syringe);},
        restore
      })});
      status.textContent='匯出視窗已關閉；組立回到原姿勢。';
    }catch(e){status.textContent=e.message;}finally{busy=false;lock(false);stopBtn.disabled=false;}
  });
  btn('關閉',()=>dialog.close());
  stopBtn.disabled=false;
  dialog.addEventListener('close',()=>{finish();dialog.remove();open=false;});
  dialog.addEventListener('cancel',e=>{if(running){e.preventDefault();finish('已停止，回到原姿勢。');}});
  render();document.body.append(dialog);dialog.showModal();
}
