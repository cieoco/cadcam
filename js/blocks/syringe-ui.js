import {APP_VERSION} from '../version.js';
import {syringeShape} from './syringe-shape.js';
import {SYRINGE_DEMO,attachmentFrame,attachmentPoint} from '../core/syringe.js';
import {solveSyringe,planSyringeStroke,scanSyringe,syringeReading,syringeGain,advanceSyringe} from './syringe-operations.js';
import {syringeSeatGeometry,syringeManufacturing,syringeFiles,syringeBuildPack} from './syringe-manufacturing.js';
import {placeFixedSyringe,isFixedFrame} from './syringe-placement.js';
import {assemblySyringeControls,planAssemblySyringe} from './assembly-syringe.js';
import {assemblyWork} from './assembly-membership.js';
import {normalizeFabricationProfile} from './fabrication-profile.js';
import {S,motorAnglesNow} from './state.js';
import * as View from './view.js';
import {createPlateGeometry} from './plate-geometry.js';
const ns='http://www.w3.org/2000/svg';
const el=(tag,text,parent)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(parent)parent.append(n);return n;};
const clone=structuredClone;
function inside(q,polygon){let hit=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[i],b=polygon[j];if((a.y>q.y)!==(b.y>q.y)&&q.x<(b.x-a.x)*(q.y-a.y)/(b.y-a.y)+a.x)hit=!hit;
}return hit;}

export function createSyringeUI(h){
  const wrap=h.svg.parentElement,bar=el('section');bar.id='syringeControls';bar.hidden=true;
  const chips=el('nav',null,bar),row=el('div',null,bar),label=el('label','伸出量 ',row),range=el('input',null,label);range.type='range';range.min=0;range.step='0.1';range.setAttribute('aria-label','針筒伸出量 mm');
  const value=el('output',null,row),settings=el('button','針筒設定',row),readout=el('div',null,bar),gainLine=el('div',null,bar),note=el('div',null,bar);
  row.style.cssText='display:flex;align-items:center;gap:8px';
  chips.id='syringeChips';chips.className='motor-switch';chips.style.cssText='display:none;gap:6px;margin-bottom:4px;flex-wrap:wrap';
  readout.id='syringeReadout';gainLine.id='syringeGain';note.id='syringeNotice';note.setAttribute('aria-live','polite');
  // Give feedback its own row before the stroke control instead of overlaying it.
  h.svg.before(document.getElementById('modeBanner'),document.getElementById('solveBanner'),bar);
  // 桌機尺寸面板以畫布頂端定位，須避開分頁與可換行的針筒控制列。
  // 讀取實際高度，讓窄螢幕、組立多針筒及狀態訊息換行都能更新。
  const positionInspectors=()=>wrap.style.setProperty('--hydraulic-header-height',`${Math.max(0,h.svg.getBoundingClientRect().top-wrap.getBoundingClientRect().top)}px`);
  const headerObserver=new ResizeObserver(positionInspectors);
  headerObserver.observe(bar);headerObserver.observe(h.svg);
  const warning3d=el('div','針筒／管夾為外形參考；完整裝配、干涉與承重未驗證。',document.getElementById('view3d'));
  warning3d.style.cssText='position:absolute;bottom:72px;left:8px;right:8px;padding:8px;background:#fff3cd;color:#664d03;z-index:6;font-size:13px;pointer-events:none';warning3d.hidden=true;
  let id=null,raf=null,last=null,direction=1,dragUndo=false,picking=null,scopeKey=null,message='';
  const inAssembly=()=>S.mode!=='design';
  // 組立：針筒清單含直角平面上的針筒（切換鈕與伸出量不受目前視圖平面限制）；設計模式仍只看目前視圖。
  const list=()=>(inAssembly()?assemblyWork(S.comps,S.modules,S.topo).comps:h.comps()).filter(c=>c.type==='syringe');
  const active=()=>list().find(c=>c.id===id)||list()[0];
  const params=()=>S.topo.params;
  const motion=()=>({thetaDeg:S.theta,motorAngles:motorAnglesNow()});
  const stop=()=>{if(raf)cancelAnimationFrame(raf);raf=null;last=null;h.playing(false);};
  const notify=t=>{message=t;note.textContent=t;};
  const download=(name,text,type)=>{const a=el('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
  function commit(comps,newParams,result,{undo=true,fabrication}={}){
    if(undo)h.pushUndo();
    const ids=new Set(h.comps().map(c=>c.id));
    S.comps=[...S.comps.filter(c=>!ids.has(c.id)),...comps];S.topo.params={...params(),...newParams};
    // Preserve the accepted assembly branch in normal point seeds for save/reopen.
    for(const c of comps)for(const key of ['p1','p2','p3']){const p=c[key],q=result.points?.[p?.id];if(p&&q&&p.type!=='fixed'){p.x=q.x;p.y=q.y;}}
    for(const c of comps.filter(c=>c.type==='syringe'))c.branch=syringeReading(c,comps,newParams,result.points).branch||c.branch;
    if(fabrication)h.applyFabrication(fabrication);
    h.rebuild();h.seed(result.points);h.draw();h.save();
  }
  // 組立：只推選取的那支針筒（模組各自的伸出量），整份組立重新求解；其他針筒維持原位。座標留在各模組自己的圖面，不寫回世界座標。
  function assemblyStroke(c,extension,undo){
    const work=assemblyWork(S.comps,S.modules,S.topo),result=planAssemblySyringe(work.comps,work.modules,params(),c.id,extension,h.points());
    if(!result.ok){stop();range.value=c.extension;notify(result.message);return false;}
    if(undo)h.pushUndo();
    const next=result.comps.find(o=>o.id===c.id);S.comps=S.comps.map(o=>o.id===c.id?next:o);
    message='';h.rebuild();h.seed(result.points);h.draw();h.save();return true;
  }
  function stroke(extension,undo=true){
    const c=active();if(!c)return false;
    if(inAssembly())return assemblyStroke(c,extension,undo);
    const result=planSyringeStroke(h.comps(),params(),c.id,extension,h.points(),motion());
    if(!result.ok){stop();range.value=c.extension;notify(result.message);return false;}
    message='';commit(result.comps,params(),result,{undo});return true;
  }
  range.onpointerdown=()=>{h.pause();dragUndo=false;};
  range.oninput=()=>{if(stroke(Number(range.value),!dragUndo))dragUndo=true;};
  range.onchange=()=>{dragUndo=false;h.save();};
  settings.onclick=()=>open();
  // 組立台：控制列貼在 3D 視圖上緣，3D 視圖往下讓出這一列；離開組立或沒有針筒就還原。
  let layoutTimer=null,layoutTries=0;
  function layoutBar(on){
    const v=document.getElementById('view3d');
    for(const k of ['position','left','top','width','boxSizing','zIndex','marginTop'])bar.style[k]='';
    if(v)v.style.top='';
    clearTimeout(layoutTimer);
    if(!on)return;
    if(v&&v.offsetParent!==null){
      layoutTries=0;
      const wr=wrap.getBoundingClientRect(),vr=v.getBoundingClientRect();
      Object.assign(bar.style,{position:'absolute',left:`${vr.left-wr.left}px`,top:`${vr.top-wr.top}px`,width:`${vr.width}px`,boxSizing:'border-box',zIndex:'5'});
      v.style.top=`${vr.top-wr.top+bar.offsetHeight}px`;return;
    }
    // 2D 組立（或 3D 視圖還沒顯示）：留在畫布流程中，推到浮動的模組清單下面並蓋過它。
    const list=document.getElementById('benchList');
    if(list&&list.offsetParent!==null){bar.style.position='relative';bar.style.zIndex='5';bar.style.marginTop=`${Math.max(0,Math.ceil(list.getBoundingClientRect().bottom-bar.getBoundingClientRect().top)+4)}px`;}
    if(layoutTries++<20)layoutTimer=setTimeout(()=>layoutBar(inAssembly()&&!bar.hidden),100);   // 進組立台後 3D 視圖才顯示
  }
  // Other workspace observers update the list/sheet CSS variables after resize.
  // Reposition after their measurements, including portrait/landscape changes.
  let layoutFrame=null;
  const scheduleLayout=()=>{if(layoutFrame!==null)cancelAnimationFrame(layoutFrame);layoutFrame=requestAnimationFrame(()=>{layoutFrame=null;layoutTries=0;layoutBar(inAssembly()&&!bar.hidden);});};
  window.addEventListener('resize',scheduleLayout);
  if('ResizeObserver' in window){const observer=new ResizeObserver(scheduleLayout);observer.observe(wrap);const list=document.getElementById('benchList');if(list)observer.observe(list);}
  function sync(points,valid=true){
    const key=`${S.mode}:${S.designFocus}`;
    if(key!==scopeKey){stop();picking=null;message='';scopeKey=key;}
    const c=active(),visible=!!c;
    warning3d.hidden=!c||inAssembly();warning3d.textContent='針筒／管夾為外形參考；固定座、完整干涉、承重與水路未驗證。';
    bar.hidden=!visible&&!picking;wrap.classList.toggle('hydraulic-active',visible||!!picking);
    if(!(visible&&inAssembly()))layoutBar(false);
    if(!visible){if(raf)stop();return;}
    id=c.id;
    settings.hidden=inAssembly();if(!inAssembly())chips.style.display='none';
    if(inAssembly()){
      // 組立：每支針筒一顆切換鈕；每推 1 mm 的比例與針筒設定只在設計模式提供（組立裡改尺寸請回設計）。
      const work=assemblyWork(S.comps,S.modules,S.topo),controls=assemblySyringeControls(work.comps,work.modules);
      chips.style.display=controls.length<2?'none':'flex';chips.textContent='';
      for(const control of controls){const b=el('button',control.label,chips);b.type='button';b.className='motor-chip'+(control.id===c.id?' active':'');b.setAttribute('aria-pressed',String(control.id===c.id));b.onclick=()=>{stop();id=control.id;message='';sync(h.points(),valid);};}
      const label=controls.find(x=>x.id===c.id)?.label||'針筒',r=syringeReading(c,work.comps,params(),points);
      range.max=c.spec.stroke;range.value=c.extension;value.textContent=`${c.extension.toFixed(1)} / ${c.spec.stroke} mm`;
      readout.textContent=`${valid?'幾何可行':'姿勢無解'}${r.tipGap!==null?` · 夾臂端孔距 ${r.tipGap.toFixed(1)} mm`:Number.isFinite(r.angle)?` · 臂角 ${r.angle.toFixed(1)}°`:''} · AB ${r.length.toFixed(1)} mm`;
      gainLine.hidden=true;gainLine.textContent='';
      note.textContent=message||'一次推一支；外形參考，固定座／干涉／承重／水路待驗證。';
      layoutBar(true);return;
    }
    settings.hidden=false;range.max=c.spec.stroke;range.value=c.extension;value.textContent=`${c.extension.toFixed(1)} / ${c.spec.stroke} mm`;
    const r=syringeReading(c,h.comps(),params(),points);
    readout.textContent=`${valid?(c.passiveTips?.length?'主傳動可解／夾片角度手動':'幾何可行'):'姿勢無解'}${r.tipGap!==null?` · 夾臂端孔距 ${r.tipGap.toFixed(1)} mm`:''}${r.mountGap!==null?` · 夾片安裝軸距 ${r.mountGap.toFixed(1)} mm`:''} · AB ${r.length.toFixed(2)} mm · 臂角 ${r.angle.toFixed(1)}°${r.end?` · C (${r.end.x.toFixed(1)}, ${r.end.y.toFixed(1)}) mm`:''}`;
    const gain=valid?syringeGain(h.comps(),params(),c.id,points):null;
    gainLine.hidden=!gain;gainLine.textContent=gain?(gain.tipGapMmPerMm!==null?`每推 1 mm：夾臂端孔距${gain.tipGapMmPerMm>=0?'縮小':'增加'} ${Math.abs(gain.tipGapMmPerMm).toFixed(1)} mm`:`每推 1 mm：臂轉 ${gain.degPerMm.toFixed(2)}°、臂端移 ${gain.endMmPerMm.toFixed(1)} mm`):'';
    note.textContent=message||(c.spec.calibrated?'規格已實測；':'示範尺寸，未依實物校正；')+'干涉未檢查、承重未驗證。';
    const theta=document.getElementById('thetaVal');if(theta)theta.textContent=`${c.extension.toFixed(1)} mm`;
  }
  function render(points,valid){
    sync(points,valid);
    const inView=new Set(h.comps().map(c=>c.id));
    for(const c of list()){
      if(!inView.has(c.id))continue;   // 組立：其他平面的針筒只出現在控制列，不畫在這一頁的 2D
      const a=attachmentPoint(c.a,h.comps(),params(),points),b=attachmentPoint(c.b,h.comps(),params(),points);if(!a||!b)continue;
      const g=document.createElementNS(ns,'g');g.setAttribute('data-syringe',c.id);h.svg.append(g);
      const node=(tag,attrs)=>{const n=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));g.append(n);return n;};
      const length=Math.hypot(b.x-a.x,b.y-a.y),dx=(b.x-a.x)/length,dy=(b.y-a.y)/length;
      const at=(x,y=0)=>({x:a.x+dx*x-dy*y,y:a.y+dy*x+dx*y});
      const line=(from,to,width,color)=>node('line',{x1:View.TX(from.x),y1:View.TY(from.y),x2:View.TX(to.x),y2:View.TY(to.y),'stroke-width':width*View.getScale(),stroke:color,'stroke-linecap':'round'});
      const shape=syringeShape(c,h.comps(),params(),points);
      line(at(shape.start-8),at(shape.start),3,'#e5ded0');
      line(at(shape.end),b,c.spec.rodDiameter,'#a89f92');
      line(at(shape.start),at(shape.end),c.spec.outerDiameter,'#d6e9e5');
      line(at(shape.end,-shape.r-5),at(shape.end,shape.r+5),2,'#a3a69b');
      line(at(length-12),b,10,'#b3ab9f');
      if(shape.fixed){
        const clamp=shape.clamp;
        const polygon=(pts,fill)=>node('polygon',{points:pts.map(p=>{const q=at(p.x,p.y);return `${View.TX(q.x)},${View.TY(q.y)}`;}).join(' '),fill,stroke:'#475569','stroke-width':.5*View.getScale()});
        for(const foot of clamp.feet){
          polygon(foot.outline,'#859391');
          const q=at(foot.hole.x,foot.hole.y);node('circle',{cx:View.TX(q.x),cy:View.TY(q.y),r:foot.hole.r*View.getScale(),fill:'white',stroke:'#475569'});
        }
        const half=clamp.width/2,outer=clamp.innerRadius+clamp.thickness;
        polygon([{x:-half,y:-outer},{x:half,y:-outer},{x:half,y:outer},{x:-half,y:outer}],'#6b7b7a');
        for(const v of [-clamp.innerRadius,clamp.innerRadius])node('line',{x1:View.TX(at(-half,v).x),y1:View.TY(at(-half,v).y),x2:View.TX(at(half,v).x),y2:View.TY(at(half,v).y),stroke:'#c5cfcb','stroke-width':.5*View.getScale()});
        node('circle',{cx:View.TX(b.x),cy:View.TY(b.y),r:1.7*View.getScale(),fill:'white',stroke:'#475569'});
      }
      for(const [key,p] of [['a',a],['b',b]]){
        if(c.mountMode==='fixed-axis')continue;
        const geometry=syringeSeatGeometry(c.spec,S.fabrication,key),dir=key==='a'?1:-1;
        const convert=q=>({x:p.x+dir*(dx*q.x-dy*q.y),y:p.y+dir*(dy*q.x+dx*q.y)});
        for(const outline of geometry.outlines)node('polygon',{points:outline.map(q=>{const w=convert(q);return `${View.TX(w.x)},${View.TY(w.y)}`;}).join(' '),fill:'none',stroke:'#0e7490','stroke-width':1,'stroke-dasharray':'4 3','pointer-events':'none'});
        for(const q of geometry.holes){const w=convert(q);node('circle',{cx:View.TX(w.x),cy:View.TY(w.y),r:q.r*View.getScale(),fill:'white',stroke:'#0e7490','pointer-events':'none'});}
        node('circle',{cx:View.TX(p.x),cy:View.TY(p.y),r:5,fill:'white',stroke:'#0e7490','stroke-width':2});
        node('text',{x:View.TX(p.x)+9,y:View.TY(p.y)-9,fill:'#075985','font-size':14}).textContent=key.toUpperCase();
      }
      for(const tip of shape.tips){line(tip.a,tip.b,9,'#dd9b39');for(const q of [tip.a,tip.b])node('circle',{cx:View.TX(q.x),cy:View.TY(q.y),r:1.5*View.getScale(),fill:'white',stroke:'#92400e'});}
      const reading=syringeReading(c,h.comps(),params(),points);
      for(const [p,label] of [[reading.origin,'O'],[reading.end,'C']]){if(p)node('text',{x:View.TX(p.x)+9,y:View.TY(p.y)-9,fill:'#92400e','font-size':14,'pointer-events':'none'}).textContent=label;}
      g.addEventListener('pointerdown',e=>{if(picking)return;e.stopPropagation();id=c.id;open();});
    }
  }
  function play(){
    const c=active();if(!c)return;
    h.pause();
    if(!inAssembly()){const scan=scanSyringe(h.comps(),params(),c.id,0.5,motion());
    if(!scan.ok){notify(`行程 ${scan.atMm??c.extension} mm：${scan.message}`);return;}}
    h.pushUndo();h.playing(true);last=null;
    const step=ts=>{
      const current=active();if(!current){stop();return;}
      const next=advanceSyringe(current.extension,direction,last===null?0:(ts-last)/1000,current.spec.stroke);last=ts;direction=next.direction;
      if(!stroke(next.extension,false))return;
      h.playing(true);raf=requestAnimationFrame(step);
    };raf=requestAnimationFrame(step);
  }
  function open(candidate=null){
    h.pause();const c=clone(candidate||active());if(!c)return;
    const dialog=el('dialog');dialog.id='syringeDialog';dialog.className='syringe-dialog';const form=el('form',null,dialog);
    el('h3',candidate?'新增 10cc 液壓針筒':'針筒與安裝設定',form);
    el('p',c.mountMode==='fixed-axis'?'管夾固定筒身；A 為固定參考點，B 為片狀推桿孔。軸向固定，接孔保留轉動。':'mm；A 為筒身托架轉軸，B 為推桿轉接座。孔位沿所屬零件第 1 孔→第 2 孔量測。',form);
    let section=form;
    const fields={},input=(key,text,value,type='number')=>{const label=el('label',text,section),n=el('input',null,label);n.type=type;n.name=key;if(type==='number')n.step='any';n.value=value;fields[key]=n;return n;};
    const tasks=el('details',null,form);el('summary',c.mountMode==='fixed-axis'?'固定筒身教學任務':'兩端鉸接教學任務',tasks);
    el('p',c.id==='H1Syringe'?'管夾固定筒身，推桿經短連桿帶動單臂。先觀察 0–20 mm 往返，再只改活動臂長 60、80、100 mm，掃描後比較擺角。':c.mountMode==='fixed-axis'?'只改伸出量 0–20 mm。H02 比較驅動孔位；H03 推出即夾緊，觀察一體式夾臂的端孔距；末端與夾臂同片、一起轉動，不含接觸求解；H04 讀轉盤每推 1 mm 轉幾度。':'① 推動滑桿、掃描並記錄可用行程。② 其他條件不變，只改 B 孔位，先預測再比較臂角與 C 位置。③ 修改前後分別存檔，寫下「改了什麼／預測／觀察」，最後與實物比較。',tasks);
    for(const key of ['a','b']){
      const label=el('label',`${key.toUpperCase()} 所屬零件`,form),select=el('select',null,label);select.name=`${key}Owner`;fields[select.name]=select;
      for(const owner of h.comps().filter(o=>attachmentFrame(o,params()))){const option=el('option',owner.id,select);option.value=owner.id;}
      select.value=c[key].componentId;input(`${key}U`,`${key.toUpperCase()} 沿桿位置 u (mm)`,c[key].u);input(`${key}V`,`${key.toUpperCase()} 偏置 v (板件用，mm)`,c[key].v);
    }
    if(c.mountMode==='fixed-axis')input('axisDeg','固定筒身軸向 (°)',c.axisDeg);
    const arm=h.comps().find(o=>o.id===(c.outputId||c.b.componentId)&&['bar','triangle'].includes(o.type));if(arm&&!c.passiveTips?.length&&!c.jawIds?.length)input('armLength',c.id==='H2Syringe'?'驅動孔距主軸 (mm)':'活動臂長度 (mm)',params()[arm.lenParam||arm.gParam]);
    if(c.id==='HSyringe'){
      const presets=el('div',null,form);for(const u of [60,80,100]){const btn=el('button',`B = ${u} mm`,presets);btn.type='button';btn.onclick=()=>{fields.bU.value=u;};}
      el('small','比較只改 B：示範三組均以 0–40 mm、0.5 mm 間隔通過幾何採樣。修改其他條件後請重新掃描。',form);
    }
    if(c.id==='H1Syringe'){const presets=el('div',null,form);for(const length of [60,80,100]){const btn=el('button',`臂長 ${length} mm`,presets);btn.type='button';btn.onclick=()=>{fields.armLength.value=length;};}}
    if(c.id==='H2Syringe'){const presets=el('div',null,form);for(const length of [145.892,172.422,198.958]){const b=el('button',`孔位 ${length} mm`,presets);b.type='button';b.onclick=()=>{fields.armLength.value=length;};}}
    (c.passiveTips||[]).forEach((t,i)=>input(`tip${i}`,`夾片 ${i+1} 手動相對角度 (°，不含接觸求解)`,t.angleDeg));
    input('extension','目前伸出量 s (mm)',c.extension);
    const specs=el('details',null,form);el('summary','針筒規格與實測校正',specs);section=specs;
    input('name','規格名稱',c.spec.name,'text');
    for(const [key,text] of [['capacityMl','標稱容量 (mL)'],['outerDiameter','筒身外徑 (mm)'],['bodyLength','筒身外形長度 (mm)'],['rodDiameter','推桿外形寬度 (mm)'],['lmin','最短 A–B 安裝孔距 Lmin (mm)'],['stroke','有效行程 S (mm)']])input(key,text,c.spec[key]);
    const maximum=el('p',`最大孔距 Lmax = ${c.spec.lmin+c.spec.stroke} mm（由 Lmin + S 計算）`,specs);
    const calibration=input('calibrated','以上尺寸已依實物量測確認','', 'checkbox');calibration.checked=c.spec.calibrated;
    for(const key of ['outerDiameter','bodyLength','rodDiameter','lmin','stroke'])fields[key].oninput=()=>{calibration.checked=false;maximum.textContent=`最大孔距 Lmax = ${Number(fields.lmin.value)+Number(fields.stroke.value)} mm（由 Lmin + S 計算）`;};
    const f=normalizeFabricationProfile(S.fabrication).profile;
    const fabricationDetails=el('details',null,form);el('summary','加工設定（與其他輸出共用）',fabricationDetails);section=fabricationDetails;
    for(const [key,text,v] of [['thickness','板厚',f.cnc.stockThicknessMm],['pin','轉軸孔徑',f.export.holeDiameterMm],['bolt','固定螺絲孔徑',f.export.frameHoleDiameterMm],['clearance','夾持間隙',f.syringeMount.clearanceMm],['margin','座板留邊',f.syringeMount.marginMm],['spacing','外夾螺絲縱向孔距',f.syringeMount.strapSpacingMm]])input(key,`${text} (mm)`,v);
    el('p','固定座為待實測的外夾式示範。不可鑽穿盛水筒身；標示已校正也不等於干涉與承重通過。',fabricationDetails);
    const error=el('p',null,form);error.setAttribute('role','status');
    function plan(){
      if(Object.values(fields).some(n=>n.type==='number'&&n.value.trim()===''))return {ok:false,message:'尺寸不可留空。'};
      const next=clone(c),comps=clone(h.comps()),p={...params()};
      for(const key of ['a','b'])next[key]={componentId:fields[`${key}Owner`].value,u:Number(fields[`${key}U`].value),v:Number(fields[`${key}V`].value)};
      for(const key of ['capacityMl','outerDiameter','bodyLength','rodDiameter','lmin','stroke'])next.spec[key]=Number(fields[key].value);
      (next.passiveTips||[]).forEach((t,i)=>{t.angleDeg=Number(fields[`tip${i}`].value);});
      if(fields.axisDeg)next.axisDeg=Number(fields.axisDeg.value);
      next.spec.name=fields.name.value;next.spec.calibrated=calibration.checked;next.extension=Number(fields.extension.value);
      if(fields.armLength){if(!(Number(fields.armLength.value)>0))return {ok:false,message:'臂長必須大於零。'};p[arm.lenParam||arm.gParam]=Number(fields.armLength.value);if(c.id==='H2Syringe'){p.H2Tail=p.H2Reach-p.H2Arm;if(p.H2Tail<=0)return {ok:false,message:'驅動孔必須位於臂端內側。'};}}
      const index=comps.findIndex(o=>o.id===next.id);if(index<0)comps.push(next);else comps[index]=next;
      const fabrication=clone(f);Object.assign(fabrication.cnc,{stockThicknessMm:Number(fields.thickness.value)});Object.assign(fabrication.export,{holeDiameterMm:Number(fields.pin.value),frameHoleDiameterMm:Number(fields.bolt.value)});Object.assign(fabrication.syringeMount,{clearanceMm:Number(fields.clearance.value),marginMm:Number(fields.margin.value),strapSpacingMm:Number(fields.spacing.value)});
      const norm=normalizeFabricationProfile(fabrication);if(!norm.ok)return norm;
      const r=solveSyringe(comps,p,h.points(),motion());return {...r,comps,params:p,fabrication:norm.profile};
    }
    const scan=el('button','掃描候選全行程',form);scan.type='button';scan.onclick=()=>{const r=plan();if(!r.ok){error.textContent=r.message;return;}const result=scanSyringe(r.comps,r.params,c.id,0.5,motion());error.textContent=result.ok?`${result.message} 最大誤差 ${result.maxResidualMm.toExponential(2)} mm`:`${result.atMm??''} mm：${result.message}`;};
    const save=el('button','確認套用',form);save.type='submit';
    form.onsubmit=e=>{e.preventDefault();const r=plan();if(!r.ok){error.textContent=r.message;return;}message='';commit(r.comps,r.params,r,{fabrication:r.fabrication});dialog.close();};
    const cancel=el('button','取消',form);cancel.type='button';cancel.onclick=()=>dialog.close();
    if(!candidate){const remove=el('button','刪除針筒',form);remove.type='button';remove.onclick=()=>{h.pushUndo();S.comps=S.comps.filter(o=>o.id!==c.id);h.rebuild();h.draw();dialog.close();};}
    dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();
  }
  function add(){
    h.pause();if(S.mode!=='design'){h.notify('請先到設計模式選擇兩端安裝點。');return;}
    if(!h.comps().some(o=>attachmentFrame(o,params()))){h.notify('請先畫機架與活動桿件，再加入針筒。');return;}
    document.getElementById('powerMenu').style.display='none';picking={a:null};bar.hidden=false;wrap.classList.add('hydraulic-active');notify('點選 A 筒身端安裝位置；Esc 或「取消選點」取消。');
    cancelPick.hidden=false;
  }
  // 管夾固定針筒：先點機架上的管夾位置，再點短連桿的端孔；不合理的放法留在選點並說明原因。
  function addFixed(){
    h.pause();if(S.mode!=='design'){h.notify('請先到設計模式，再選管夾位置。');return;}
    if(!h.comps().some(o=>isFixedFrame(o,h.comps()))){h.notify('請先畫出固定的機架、擺臂與短連桿，再放管夾固定針筒。');return;}
    document.getElementById('powerMenu').style.display='none';
    chooseFixedParts();
  }
  // 清單選件與畫布選點共用同一候選；手機不必精準命中重疊的小孔。
  function chooseFixedParts(seedA=null,rodChoices=null){
    const dialog=el('dialog');dialog.id='syringePartPicker';dialog.className='syringe-dialog';
    const form=el('form',null,dialog);el('h3','針筒接在哪裡？',form);
    el('p','先選固定筒身的機架，再選短連桿的推桿孔。桿件可自由命名、反向繪製。',form);
    const field=(text,name,type='select')=>{const label=el('label',text,form),n=el(type,null,label);n.name=name;return n;};
    const a=field('① 筒身固定零件','frame'),u=field('管夾距第一孔 (mm)','u','input'),v=field('板件橫向偏移 (mm)','v','input'),b=field('② 推桿接短連桿的孔','rod');
    for(const n of [u,v]){n.type='number';n.step='any';n.required=true;n.value='0';}
    const labelOf=o=>`${o.name || o.id}（${o.type==='anchor'?'固定點':o.type==='triangle'?'板件':'桿件'}）`;
    for(const owner of h.comps().filter(o=>isFixedFrame(o,h.comps())&&attachmentFrame(o,params(),h.points()))){const option=el('option',labelOf(owner),a);option.value=owner.id;}
    if(seedA){a.value=seedA.componentId;u.value=seedA.u;v.value=seedA.v;}
    const choices=rodChoices || h.comps().filter(o=>o.type==='bar'&&!isFixedFrame(o,h.comps())).flatMap(o=>[0,Number(params()[o.lenParam])].map((u,index)=>({ref:{componentId:o.id,u,v:0},end:index+1})));
    const empty=el('option','請選擇短連桿與端孔',b);empty.value='';b.required=true;
    choices.forEach((choice,i)=>{const owner=h.comps().find(o=>o.id===choice.ref.componentId),end=choice.ref.u===0?1:2;const option=el('option',`${labelOf(owner)} · 第 ${end} 孔 (${owner[end===1?'p1':'p2'].id})`,b);option.value=String(i);});
    const syncFrame=()=>{const owner=h.comps().find(o=>o.id===a.value),f=attachmentFrame(owner,params(),h.points());u.min=0;u.max=f?.length||0;u.disabled=owner?.type==='anchor';v.disabled=owner?.type!=='triangle';if(u.disabled)u.value=0;if(v.disabled)v.value=0;};
    a.onchange=()=>{u.value=0;v.value=0;syncFrame();};syncFrame();
    const status=el('p','依目前桿件位置建立幾何示範；下一步可核對規格與掃描行程，尚未加入作品。',form);status.setAttribute('role','status');
    const next=el('button','預覽針筒設定',form);next.type='submit';next.disabled=!choices.length;
    form.onsubmit=e=>{e.preventDefault();if(b.value==='')return;const r=placeFixedSyringe(h.comps(),params(),h.points(),{componentId:a.value,u:Number(u.value),v:Number(v.value)},choices[Number(b.value)].ref);if(!r.ok){status.textContent=r.message;return;}dialog.close();cancelPicking();open(r.syringe);};
    const canvas=el('button','改用畫布點選',form);canvas.type='button';canvas.onclick=()=>{dialog.close();beginFixedPick();};
    const cancel=el('button','取消',form);cancel.type='button';cancel.onclick=()=>dialog.close();
    dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();
  }
  function beginFixedPick(){
    picking={a:null,fixed:true};bar.hidden=false;wrap.classList.add('hydraulic-active');
    notify('點選管夾位置：點在固定的機架上；Esc 或「取消選點」取消。');cancelPick.hidden=false;
  }
  const cancelPick=el('button','取消選點',row);cancelPick.hidden=true;
  const cancelPicking=()=>{picking=null;cancelPick.hidden=true;message='';h.draw();};cancelPick.onclick=cancelPicking;
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&picking)cancelPicking();});
  h.svg.addEventListener('pointerdown',e=>{
    if(!picking)return;e.preventDefault();e.stopImmediatePropagation();
    const q=View.worldFromEvent(h.svg,e);if(!q)return;
    if(picking.fixed&&picking.a){
      // B：吸附到最近的短連桿端孔；多個可用端孔重疊時，開啟清單讓使用者明確選擇。
      const ctm=h.svg.getScreenCTM(),found=[];
      for(const owner of h.comps()){
        if(owner.type!=='bar'||isFixedFrame(owner,h.comps()))continue;
        for(const u of [0,Number(params()[owner.lenParam])]){
          const ref={componentId:owner.id,u,v:0},p=attachmentPoint(ref,h.comps(),params(),h.points());if(!p)continue;
          const pt=new DOMPoint(View.TX(p.x),View.TY(p.y)).matrixTransform(ctm),distance=Math.hypot(pt.x-e.clientX,pt.y-e.clientY);
          if(distance<32)found.push({ref,distance});
        }
      }
      found.sort((x,y)=>x.distance-y.distance);
      if(!found.length){notify('請點在短連桿的端孔附近。');return;}
      let first=null;const valid=[];
      for(const f of found.filter(f=>f.distance<found[0].distance+4)){
        const r=placeFixedSyringe(h.comps(),params(),h.points(),picking.a,f.ref);
        if(r.ok)valid.push({ref:f.ref,syringe:r.syringe});
        first=first||r;
      }
      if(valid.length>1){const a=picking.a;cancelPicking();chooseFixedParts(a,valid);return;}
      if(valid.length===1){cancelPicking();open(valid[0].syringe);return;}
      notify(first.message);return;
    }
    let best=null;
    for(const owner of h.comps()){
      const f=attachmentFrame(owner,params(),h.points());if(!f)continue;
      if(picking.fixed&&!isFixedFrame(owner,h.comps()))continue;
      if(owner.type==='triangle'){
        const points=[owner.p1,owner.p2,owner.p3].map(p=>h.points()?.[p.id]||p);
        if(!createPlateGeometry(owner,points).outlines.some(poly=>inside(q,poly)))continue;
      }
      const dx=q.x-f.p.x,dy=q.y-f.p.y,u=owner.type==='anchor'?0:Math.max(0,Math.min(f.length,dx*f.x+dy*f.y));
      const v=owner.type==='triangle'?-dx*f.y+dy*f.x:0,ref={componentId:owner.id,u,v},p=attachmentPoint(ref,h.comps(),params(),h.points());
      const ctm=h.svg.getScreenCTM(),pt=new DOMPoint(View.TX(p.x),View.TY(p.y)).matrixTransform(ctm),distance=Math.hypot(pt.x-e.clientX,pt.y-e.clientY);
      if(distance<24&&(!best||distance<best.distance))best={ref,distance};
    }
    if(!best){notify(picking.fixed?'請點在固定的機架上（管夾位置）。':'請點在機架、桿件或板件上。');return;}
    if(!picking.a){picking.a=best.ref;notify(picking.fixed?'已選管夾位置；接著點短連桿的端孔（推桿接點）。':'已選 A；接著點選 B 推桿端的活動桿件位置。');return;}
    if(picking.a.componentId===best.ref.componentId){notify('A、B 不能在同一剛性零件上。');return;}
    const a=picking.a,b=best.ref,pa=attachmentPoint(a,h.comps(),params(),h.points()),pb=attachmentPoint(b,h.comps(),params(),h.points());
    const length=Math.hypot(pa.x-pb.x,pa.y-pb.y);let counter=S.counter+1;while(S.comps.some(c=>c.id===`Syringe${counter}`))counter++;
    const c={type:'syringe',id:`Syringe${counter}`,a,b,spec:{...SYRINGE_DEMO,lmin:Math.max(1,length-20)},extension:Math.min(20,length-1),branch:1};
    cancelPicking();open(c);
  },true);
  let exporting=false;
  async function exportVideo(){
    if(S.mode!=='design'){h.notify('針筒動畫請在設計模式匯出；組立針筒尚未支援。');return;}
    if(exporting)return;h.pause();const c=active();if(!c)return;
    const source=clone(h.comps()),sourceParams={...params()},scan=scanSyringe(source,sourceParams,c.id,0.5,motion());
    if(!scan.ok){notify(scan.message);return;}
    exporting=true;
    try{
      const {exportAnimation}=await import('./video-export.js');
      await exportAnimation({svg:h.svg,begin:()=>{
        const saved=S.comps,points={...h.points()},ids=new Set(source.map(o=>o.id));let elapsed=0,previous=points;
        clearTimeout(S.autosaveTimer);
        return {duration:10+1/24,evidence:{lines:[`${c.id} 針筒行程比較`, `伸出量 0–${c.spec.stroke} mm；${scan.samples.length} 點${c.passiveTips?.length?'主傳動':'幾何'}採樣通過`,c.id==='H1Syringe'?`活動臂長 ${sourceParams.H1Arm.toFixed(1)} mm；臂角 ${scan.samples[0].angle.toFixed(1)}° → ${scan.samples.at(-1).angle.toFixed(1)}°`:c.id==='H2Syringe'?`驅動孔距 ${sourceParams.H2Arm.toFixed(3)} mm；臂角 ${scan.samples[0].angle.toFixed(1)}° → ${scan.samples.at(-1).angle.toFixed(1)}°`:c.jawIds?.length?`一體式夾臂端孔距 ${scan.samples[0].tipGap.toFixed(1)} → ${scan.samples.at(-1).tipGap.toFixed(1)} mm`:c.passiveTips?.length?`夾片安裝軸距 ${scan.samples[0].mountGap.toFixed(1)} → ${scan.samples.at(-1).mountGap.toFixed(1)} mm；夾片角度手動`:'臂角／行程為幾何結果；未模擬抓取接觸',`${APP_VERSION}；干涉、承載、水路未驗證`]},
          frame:dt=>{elapsed+=dt;const fraction=Math.min(1,elapsed/10000),extension=c.spec.stroke*(fraction<=.5?fraction*2:(1-fraction)*2),r=planSyringeStroke(source,sourceParams,c.id,extension,previous,motion());if(!r.ok)throw Error(r.message);previous=r.points;S.comps=[...saved.filter(o=>!ids.has(o.id)),...r.comps];h.rebuild();h.seed(r.points);h.draw();},
          ...(h.is3D?.()?{capture:h.capture}:{}),
          restore:()=>{S.comps=saved;h.rebuild();h.seed(points);h.draw();h.save();}
        };
      }});
    }catch(e){notify(e.message);}finally{exporting=false;}
  }
  function exportWork(format){
    h.pause();try{const plan=syringeManufacturing(h.comps(),params(),S.fabrication);
      if(format==='pack')download('液壓機構-製作包.html',syringeBuildPack(plan),'text/html;charset=utf-8');
      else for(const file of syringeFiles(plan,format))download(file.name,file.text,format==='svg'?'image/svg+xml':'application/dxf');
      h.notify(`僅匯出目前液壓設計。${plan.warnings[0]}`);
    }catch(e){h.notify(`尚未輸出：${e.message}`);}
  }
    const select=sid=>{if(list().some(c=>c.id===sid))id=sid;};   // 動作序列播放時，讓控制列跟著正在動的針筒
    return {active,select,add,addFixed:addFixed,open,render,sync,stop,play,stroke,exportWork,exportVideo,isPlaying:()=>!!raf};
}
