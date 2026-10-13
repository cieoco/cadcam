import {APP_VERSION} from '../version.js';
import {syringeShape} from './syringe-shape.js';
import {SYRINGE_DEMO,attachmentFrame,attachmentPoint} from '../core/syringe.js';
import {solveSyringe,planSyringeStroke,scanSyringe,syringeReading,advanceSyringe} from './syringe-operations.js';
import {syringeSeatGeometry,syringeManufacturing,syringeFiles,syringeBuildPack} from './syringe-manufacturing.js';
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
  const row=el('div',null,bar),label=el('label','伸出量 ',row),range=el('input',null,label);range.type='range';range.min=0;range.step='0.1';range.setAttribute('aria-label','針筒伸出量 mm');
  const value=el('output',null,row),settings=el('button','針筒設定',row),readout=el('div',null,bar),note=el('div',null,bar);
  readout.id='syringeReadout';note.id='syringeNotice';note.setAttribute('aria-live','polite');
  h.svg.before(bar);
  const warning3d=el('div','針筒／管夾為外形參考；完整裝配、干涉與承重未驗證。',document.getElementById('view3d'));
  warning3d.style.cssText='position:absolute;bottom:72px;left:8px;right:8px;padding:8px;background:#fff3cd;color:#664d03;z-index:6;font-size:13px;pointer-events:none';warning3d.hidden=true;
  let id=null,raf=null,last=null,direction=1,dragUndo=false,picking=null,scopeKey=null,message='';
  const list=()=>h.comps().filter(c=>c.type==='syringe');
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
  function stroke(extension,undo=true){
    const c=active();if(!c)return false;
    const result=planSyringeStroke(h.comps(),params(),c.id,extension,h.points(),motion());
    if(!result.ok){stop();range.value=c.extension;notify(result.message);return false;}
    message='';commit(result.comps,params(),result,{undo});return true;
  }
  range.onpointerdown=()=>{h.pause();dragUndo=false;};
  range.oninput=()=>{if(stroke(Number(range.value),!dragUndo))dragUndo=true;};
  range.onchange=()=>{dragUndo=false;h.save();};
  settings.onclick=()=>open();
  function sync(points,valid=true){
    const key=`${S.mode}:${S.designFocus}`;
    if(key!==scopeKey){stop();picking=null;message='';scopeKey=key;}
    const c=active(),visible=!!c&&S.mode==='design';
    warning3d.hidden=!c;
    bar.hidden=!visible&&!picking;wrap.classList.toggle('hydraulic-active',visible||!!picking);
    if(!visible){if(raf)stop();return;}
    id=c.id;range.max=c.spec.stroke;range.value=c.extension;value.textContent=`${c.extension.toFixed(1)} / ${c.spec.stroke} mm`;
    const r=syringeReading(c,h.comps(),params(),points);
    readout.textContent=`${valid?(c.passiveTips?.length?'主傳動可解／夾片角度手動':'幾何可行'):'姿勢無解'}${r.mountGap!==null?` · 夾片安裝軸距 ${r.mountGap.toFixed(1)} mm`:''} · AB ${r.length.toFixed(2)} mm · 臂角 ${r.angle.toFixed(1)}°${r.end?` · C (${r.end.x.toFixed(1)}, ${r.end.y.toFixed(1)}) mm`:''}`;
    note.textContent=message||(c.spec.calibrated?'規格已實測；':'示範尺寸，未依實物校正；')+'干涉未檢查、承重未驗證。';
    const theta=document.getElementById('thetaVal');if(theta)theta.textContent=`${c.extension.toFixed(1)} mm`;
  }
  function render(points,valid){
    sync(points,valid);
    for(const c of list()){
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
        line(at(-3,-shape.clampSpacing/2),at(-3,shape.clampSpacing/2),7,'#6b7b7a');
        for(const v of [-shape.clampSpacing/2,shape.clampSpacing/2]){const q=at(-3,v);node('circle',{cx:View.TX(q.x),cy:View.TY(q.y),r:1.75*View.getScale(),fill:'white',stroke:'#475569'});}
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
      const owner=h.comps().find(o=>o.id===(c.outputId||c.b.componentId));
      for(const [key,label] of [['p1','O'],[c.id==='H2Syringe'?'p3':'p2','C']]){const p=points?.[owner?.[key]?.id];if(p)node('text',{x:View.TX(p.x)+9,y:View.TY(p.y)-9,fill:'#92400e','font-size':14,'pointer-events':'none'}).textContent=label;}
      g.addEventListener('pointerdown',e=>{if(picking)return;e.stopPropagation();id=c.id;open();});
    }
  }
  function play(){
    const c=active();if(!c)return;
    if(S.mode!=='design'){h.notify('液壓播放目前在設計的 2D 畫布操作；組立 3D 尚未支援針筒。');return;}
    h.pause();const scan=scanSyringe(h.comps(),params(),c.id,0.5,motion());
    if(!scan.ok){notify(`行程 ${scan.atMm??c.extension} mm：${scan.message}`);return;}
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
    const tasks=el('details',null,form);el('summary',c.mountMode==='fixed-axis'?'固定筒身教學任務':'H01 教學任務',tasks);
    el('p',c.mountMode==='fixed-axis'?'只改伸出量 0–20 mm。H02 比較驅動孔位；H03 觀察兩個夾片安裝軸間距。末端夾片角度手動示意，不含接觸求解。':'① 推動滑桿、掃描並記錄可用行程。② 其他條件不變，只改 B 孔位，先預測再比較臂角與 C 位置。③ 修改前後分別存檔，寫下「改了什麼／預測／觀察」，最後與實物比較。',tasks);
    for(const key of ['a','b']){
      const label=el('label',`${key.toUpperCase()} 所屬零件`,form),select=el('select',null,label);select.name=`${key}Owner`;fields[select.name]=select;
      for(const owner of h.comps().filter(o=>attachmentFrame(o,params()))){const option=el('option',owner.id,select);option.value=owner.id;}
      select.value=c[key].componentId;input(`${key}U`,`${key.toUpperCase()} 沿桿位置 u (mm)`,c[key].u);input(`${key}V`,`${key.toUpperCase()} 偏置 v (板件用，mm)`,c[key].v);
    }
    if(c.mountMode==='fixed-axis')input('axisDeg','固定筒身軸向 (°)',c.axisDeg);
    const arm=h.comps().find(o=>o.id===(c.outputId||c.b.componentId)&&['bar','triangle'].includes(o.type));if(arm&&!c.passiveTips?.length)input('armLength',c.id==='H2Syringe'?'驅動孔距主軸 (mm)':'活動臂長度 (mm)',params()[arm.lenParam||arm.gParam]);
    if(c.id==='HSyringe'){
      const presets=el('div',null,form);for(const u of [60,80,100]){const btn=el('button',`B = ${u} mm`,presets);btn.type='button';btn.onclick=()=>{fields.bU.value=u;};}
      el('small','比較只改 B：示範三組均以 0–40 mm、0.5 mm 間隔通過幾何採樣。修改其他條件後請重新掃描。',form);
    }
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
  const cancelPick=el('button','取消選點',row);cancelPick.hidden=true;
  const cancelPicking=()=>{picking=null;cancelPick.hidden=true;message='';h.draw();};cancelPick.onclick=cancelPicking;
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&picking)cancelPicking();});
  h.svg.addEventListener('pointerdown',e=>{
    if(!picking)return;e.preventDefault();e.stopImmediatePropagation();
    const q=View.worldFromEvent(h.svg,e);if(!q)return;
    let best=null;
    for(const owner of h.comps()){
      const f=attachmentFrame(owner,params(),h.points());if(!f)continue;
      if(owner.type==='triangle'){
        const points=[owner.p1,owner.p2,owner.p3].map(p=>h.points()?.[p.id]||p);
        if(!createPlateGeometry(owner,points).outlines.some(poly=>inside(q,poly)))continue;
      }
      const dx=q.x-f.p.x,dy=q.y-f.p.y,u=owner.type==='anchor'?0:Math.max(0,Math.min(f.length,dx*f.x+dy*f.y));
      const v=owner.type==='triangle'?-dx*f.y+dy*f.x:0,ref={componentId:owner.id,u,v},p=attachmentPoint(ref,h.comps(),params(),h.points());
      const ctm=h.svg.getScreenCTM(),pt=new DOMPoint(View.TX(p.x),View.TY(p.y)).matrixTransform(ctm),distance=Math.hypot(pt.x-e.clientX,pt.y-e.clientY);
      if(distance<24&&(!best||distance<best.distance))best={ref,distance};
    }
    if(!best){notify('請點在機架、桿件或板件上。');return;}
    if(!picking.a){picking.a=best.ref;notify('已選 A；接著點選 B 推桿端的活動桿件位置。');return;}
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
        return {duration:10+1/24,evidence:{lines:[`${c.id} 針筒行程比較`, `伸出量 0–${c.spec.stroke} mm；${scan.samples.length} 點${c.passiveTips?.length?'主傳動':'幾何'}採樣通過`,c.id==='H2Syringe'?`驅動孔距 ${sourceParams.H2Arm.toFixed(3)} mm；臂角 ${scan.samples[0].angle.toFixed(1)}° → ${scan.samples.at(-1).angle.toFixed(1)}°`:c.passiveTips?.length?`夾片安裝軸距 ${scan.samples[0].mountGap.toFixed(1)} → ${scan.samples.at(-1).mountGap.toFixed(1)} mm；夾片角度手動`:'臂角／行程為幾何結果；未模擬抓取接觸',`${APP_VERSION}；干涉、承載、水路未驗證`]},
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
    return {active,add,open,render,sync,stop,play,stroke,exportWork,exportVideo,isPlaying:()=>!!raf};
}
