import {fusionRoot} from '../core/bar-fusion.js';
import {planBarFusion,dissolveBarFusion} from './bar-fusion-plan.js';
import { S } from './state.js';
import { inspectFusion } from './exporters.js';
import { fusionCandidates } from './part-fusion.js';
import { openFusionPreview, planFusionPair } from './fusion-preview.js';

/** Reuses the original editors; only the manufacturing relationship is changed. */
export function createFusionEditor({settings,pause,pushUndo,rebuild,draw,save,selectGear,selectTriangle,positions=()=>({}),notify=()=>{}}) {
  const hosts=['lenEditor','gearEditor'];
  const mobile=window.matchMedia('(max-width:700px), (max-width:1099px) and (max-height:500px)');
  const place=box=>{
    const host=document.getElementById('lenEditor');
    if(mobile.matches)host.querySelector('#memberMore').append(box);
    else host.querySelector('.le-row').after(box);
  };
  mobile.addEventListener('change',()=>{
    const box=document.querySelector('#lenEditor [data-fusion-controls]');
    if(box)place(box);
  });
  let preview=null,context='';
  const fingerprint=()=>JSON.stringify([S.mode,S.designFocus,S.comps,S.topo.params,settings()]);
  const start=selected=>{
    pause();preview?.close();context=fingerprint();
    preview=openFusionPreview({first:selected,comps:S.comps,params:S.topo.params,settings:settings(),
      onClose:()=>{preview=null;},onConfirm:(firstId,secondId)=>{
        if(context!==fingerprint())return '作品已變更，請取消後重新選取。';
        const plan=planFusionPair(S.comps,firstId,secondId,S.topo.params,settings());
        if(!plan.ok)return plan.reason;
        change(S.comps.find(c=>c.id===plan.plate.id),plan.gear);return '';
      }});
  };
  const change=(plate,gear)=>{
    pause();pushUndo();
    if(gear)plate.fusedWith=gear.id;else delete plate.fusedWith;
    rebuild();draw();save();
  };
  let lastKey='',lastSelected=null;
  function sync() {
    if(preview && context!==fingerprint())preview.close();
    const selected=S.comps.find(c=>c.id===(S.selectedTriangleId || S.selectedGearId || S.selectedLinkId));
    const key=JSON.stringify([selected?.id,selected?.barFusionRoot,S.comps.filter(c=>c.type==='triangle').map(p=>[p.id,p.fusedWith,p.fusedWith?inspectFusion(S.comps,p,S.topo.params,settings()).reason:fusionCandidates(S.comps,p).map(g=>[g.id,inspectFusion(S.comps,{...p,fusedWith:g.id},S.topo.params,settings()).reason])])]);
    if(key===lastKey && selected===lastSelected)return;
    lastKey=key;lastSelected=selected;
    hosts.forEach(id=>document.getElementById(id)?.querySelector('[data-fusion-controls]')?.remove());
    if(!selected)return;
    const plates=selected.type==='triangle'?[selected]:S.comps.filter(p=>p.type==='triangle' && (p.fusedWith===selected.id || fusionCandidates(S.comps,p).includes(selected)));
    const host=document.getElementById(selected.type==='gear'?'gearEditor':'lenEditor');
    if(!host)return;
    const box=document.createElement('div');box.dataset.fusionControls='';
    box.style.cssText='flex-basis:100%;display:flex;flex-wrap:wrap;gap:8px;padding:8px 0;border-top:1px solid #dae4ea;order:-1';
    const button=(label,action)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.style.cssText='min-height:44px;padding:8px 12px;border:1px solid #c8d9df;border-radius:10px;background:#f1f8f7;color:#205b55;font:inherit;cursor:pointer';b.onclick=action;box.append(b);return b;};
    if(selected.type==='bar'){
      const root=fusionRoot(S.comps,selected.id);
      if(root){
        const label=document.createElement('div');label.textContent='已合成 '+root.barFusion.members.length+' 支 · 角度固定';box.append(label);
        button('解除合成',()=>{pause();pushUndo();S.comps=dissolveBarFusion(S.comps,selected.id);rebuild();draw();save();});
      }else button('合成一片…',async event=>{
        event.currentTarget.disabled=true;
        pause();const revision=fingerprint(),first=selected;const pts=positions();
        const trigger=event.currentTarget;
        let openBarFusion;
        try { ({openBarFusion}=await import('./bar-fusion-ui.js')); }
        catch { notify('合成視窗載入失敗，請重試。'); return; }
        finally { trigger.disabled=false; }
        if(fingerprint()!==revision){notify('作品已變更，請重新開啟合成。');return;}
        openBarFusion({first,comps:S.comps,params:S.topo.params,settings:settings(),positions:pts,onConfirm:ids=>{
          if(fingerprint()!==revision)return '作品已變更，請取消後重新選取。';
          const plan=planBarFusion(S.comps,ids,S.topo.params,settings(),pts);if(!plan.ok)return plan.reason;
          pushUndo();S.comps=plan.comps;rebuild();draw();save();return '';
        }});
      });
      place(box);return;
    }
    for(const plate of plates) {
      if(plate.fusedWith) {
        const f=inspectFusion(S.comps,plate,S.topo.params,settings());
        const title=document.createElement('div');title.style.cssText='width:100%;font-size:13px';
        title.textContent=f.ok?'已合成一片 · 參數可繼續修改':`合成需調整：${f.reason}`;box.append(title);
        if(selected.type!=='gear')button('齒輪設定',()=>selectGear(plate.fusedWith));
        if(selected.type==='gear')button('夾爪／板件設定',()=>selectTriangle(plate.id));
        button('解除合成',()=>change(plate,null));
        if(f.ok && f.warnings.length){const note=document.createElement('small');note.className='fusion-warning';note.textContent=f.warnings[0];box.append(note);}
      }
    }
    if(!plates.some(p=>p.fusedWith))button('聯集／合成一片…',()=>start(selected));
    if(box.childNodes.length) {
      if(host.id==='lenEditor')place(box);
      else host.prepend(box);
    }
  }
  return {sync};
}
