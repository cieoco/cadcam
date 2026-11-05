import {planGearHolePlacement,commitGearHolePlacement,outputPoint} from './gear-hole-placement.js';
import {confirmMountingChange} from './mounting-review-ui.js';

export function openGearHoleDialog({S,pause,snapshotStr,pushUndo,rebuild,draw,updateGearEditor}){
  if(S.mode!=='design'||!S.selectedGearId)return;
  pause();const revision=snapshotStr(),source=JSON.parse(revision),id=S.selectedGearId;
  const gear=source.comps.find(c=>c.id===id&&c.type==='gear');if(!gear)return;
  const dialog=document.createElement('dialog');dialog.className='gear-hole-dialog';dialog.setAttribute('aria-label','設定輸出孔位');
  dialog.innerHTML=`<style>
    .gear-hole-dialog{box-sizing:border-box;width:min(540px,calc(100vw - 16px));max-height:92dvh;overflow:auto;padding:12px;border:1px solid #abc;border-radius:12px;background:white;color:#23415a;font:14px system-ui}
    .gear-hole-dialog::backdrop{background:#1236}.gear-hole-dialog h2{font-size:18px;margin:0 0 8px}.gear-hole-dialog p{margin:8px 0;line-height:1.5;overflow-wrap:anywhere}
    .gear-hole-dialog label{display:grid;grid-template-columns:6em minmax(0,1fr);align-items:center;gap:6px;margin:6px 0}.gear-hole-dialog input,.gear-hole-dialog select,.gear-hole-dialog button{box-sizing:border-box;min-width:0;min-height:44px;font:16px system-ui;border:1px solid #abc;border-radius:8px;padding:6px;background:white;color:inherit}
    .gear-hole-dialog svg{display:block;width:100%;height:clamp(150px,27dvh,220px);background:#f3f7fa;border-radius:8px;touch-action:none}.gear-hole-dialog footer{position:sticky;bottom:-12px;display:flex;gap:8px;padding:6px 0 calc(4px + env(safe-area-inset-bottom,0px));background:white}.gear-hole-dialog footer button{flex:1}.gear-hole-dialog footer button:last-child{background:#236e5e;color:white}.gear-hole-dialog button:disabled{opacity:.5}.gear-hole-dialog [hidden]{display:none}
  </style><h2>與另一齒輪對稱</h2>
  <label data-ref>對稱來源<select aria-label="對稱來源齒輪"></select></label>
  <p>以馬達 0° 為起點：0°向右、90°向上、180°向左。預覽不改變目前播放角度。</p>
  <svg role="group" aria-label="馬達零度的輸出孔位預覽"></svg><p role="status" aria-live="polite"></p>
  <p data-note>綠色為新孔位，灰色為原孔位；確認後可一次復原。</p><footer><button type="button">取消</button><button type="button">確認孔位</button></footer>`;
  const reference=dialog.querySelector('select'),[cancel,confirm]=dialog.querySelectorAll('button');
  const status=dialog.querySelector('[role=status]'),svg=dialog.querySelector('svg');
  const opt=(value,label)=>{const o=document.createElement('option');o.value=value;o.textContent=label;reference.append(o);};opt('','請選齒輪');
  const others=source.comps.filter(c=>c.type==='gear'&&c.id!==id&&c.moduleId===gear.moduleId);
  others.forEach(c=>opt(c.id,`${c.name||c.id} · ${c.teeth} 齒`));
  const partners=others.filter(c=>c.mesh===id||gear.mesh===c.id);if(partners.length===1)reference.value=partners[0].id;
  let plan;
  function preview(){
    svg.replaceChildren();const ref=others.find(c=>c.id===reference.value),list=ref?[gear,ref]:[gear];
    const bounds=list.flatMap(g=>{const r=Number(source.params[g.radiusParam]);return [{x:g.p1.x-r,y:g.p1.y-r},{x:g.p1.x+r,y:g.p1.y+r}];});
    const left=Math.min(...bounds.map(p=>p.x))-12,bottom=Math.min(...bounds.map(p=>p.y))-12,width=Math.max(...bounds.map(p=>p.x))-left+12,height=Math.max(...bounds.map(p=>p.y))-bottom+12;
    svg.setAttribute('viewBox',`${left} ${-bottom-height} ${width} ${height}`);
    const add=(tag,attrs)=>{const e=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);svg.append(e);return e;};
    const label=(p,t,color)=>{const e=add('text',{x:p.x,y:-p.y-5,'text-anchor':'middle','font-size':Math.max(width/26,height/18),fill:color});e.textContent=t;};
    for(const g of list){
      add('circle',{cx:g.p1.x,cy:-g.p1.y,r:source.params[g.radiusParam],fill:'#dce9f4',stroke:'#7294ac','stroke-width':.8});
      add('circle',{cx:g.p1.x,cy:-g.p1.y,r:1.4,fill:'#23415a'});
      const old=outputPoint(g,source.params);add('circle',{cx:old.x,cy:-old.y,r:2.5,fill:'white',stroke:'#89949d','stroke-width':1});
      label({x:g.p1.x,y:g.p1.y+Number(source.params[g.radiusParam])+1},g.name||g.id,'#23415a');
      const next=plan?.ok&&g.id===id?outputPoint(plan.comps.find(c=>c.id===id),plan.params):old;
      add('line',{x1:g.p1.x,y1:-g.p1.y,x2:next.x,y2:-next.y,stroke:g.id===id?'#16816a':'#2575ae','stroke-width':1});
      add('circle',{cx:next.x,cy:-next.y,r:2,fill:g.id===id?'#16816a':'#2575ae'});
    }
    if(list.length===2){const a=gear.p1,b=ref.p1,m={x:(a.x+b.x)/2,y:(a.y+b.y)/2},d=Math.hypot(a.x-b.x,a.y-b.y),k=height*.5/(d||1),dx=-(a.y-b.y)*k,dy=(a.x-b.x)*k;add('line',{x1:m.x-dx,y1:-m.y+dy,x2:m.x+dx,y2:-m.y-dy,stroke:'#a55308','stroke-dasharray':'3 2','stroke-width':.7});}
  }
  function update(){
    plan=planGearHolePlacement(source,{gearId:id,mode:'mirror',referenceId:reference.value});
    confirm.disabled=!plan.ok;status.textContent=plan.ok?(plan.changed?'預覽完成，確認後才套用。':'孔位已符合設定。'):plan.reason;
    dialog.querySelector('[data-note]').textContent='橘線為對稱中線，藍孔為來源、綠孔為結果。這次只配對孔位；之後改來源須再次套用對稱。';preview();
  }
  const resize=new ResizeObserver(()=>preview());resize.observe(svg);
  reference.onchange=update;
  cancel.onclick=()=>dialog.close();confirm.onclick=()=>{if(snapshotStr()===revision&&plan?.ok&&plan.changed&&!confirmMountingChange(source,{...source,comps:plan.comps,params:plan.params},{notify:message=>{status.textContent=message;}}))return;const error=commitGearHolePlacement({plan,revision,fingerprint:snapshotStr,pushUndo,apply:p=>{S.comps=p.comps;S.topo.params=p.params;rebuild();draw();updateGearEditor();}});if(error){status.textContent=error;confirm.disabled=true;}else dialog.close();};
  dialog.addEventListener('close',()=>{resize.disconnect();dialog.remove();},{once:true});document.body.append(dialog);dialog.showModal();update();
}
