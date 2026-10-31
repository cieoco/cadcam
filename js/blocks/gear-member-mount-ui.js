import {gearMountMember,gearOutputRadius,planGearMemberMount} from './gear-member-mount.js';
import {copyMemberGeometry} from './member-copy.js';
export {commitGearMemberMount} from './gear-member-mount.js';
const NS='http://www.w3.org/2000/svg',mm=n=>Number(n.toFixed(2));

export function openGearMemberMount({source,id,positions={},motion={},settings={},onConfirm}) {
  const member=gearMountMember(source,id,positions),dialog=document.createElement('dialog');
  dialog.className='gear-member-mount';dialog.setAttribute('aria-label','安裝到齒輪');
  dialog.innerHTML=`<style>
    .gear-member-mount{box-sizing:border-box;width:min(600px,calc(100vw - 16px));max-height:92dvh;overflow:auto;padding:12px;border:1px solid #9ab2c5;border-radius:12px;color:#23415a;background:white;font:14px system-ui}
    .gear-member-mount::backdrop{background:#142d4666}.gear-member-mount h2{font-size:18px;margin:0 0 8px}
    .gear-member-mount p{margin:8px 0;line-height:1.5;overflow-wrap:anywhere}.gear-member-mount select,.gear-member-mount button{min-height:44px;font:16px system-ui;border:1px solid #a4b9b6;border-radius:8px;background:white;color:#25453f;padding:6px 8px;max-width:100%}
    .gear-member-mount .mount-fields{display:grid;grid-template-columns:1fr 1fr;gap:8px}.gear-member-mount label{min-width:0;display:flex;align-items:center;gap:6px;min-height:44px}.gear-member-mount .mount-fields label{display:block}.gear-member-mount select{display:block;width:100%;margin-top:4px}
    .gear-member-mount .mount-target{display:grid;grid-template-columns:5em minmax(0,1fr)}
    .gear-member-mount svg{width:100%;height:clamp(160px,30dvh,240px);background:#f5f8fa;border-radius:8px;display:block}.gear-member-mount svg [role=button]{cursor:pointer}.gear-member-mount svg text{pointer-events:none}
    .gear-member-mount footer{display:flex;gap:8px;position:sticky;bottom:-12px;background:white;padding:8px 0 calc(4px + env(safe-area-inset-bottom,0px))}.gear-member-mount footer button{flex:1}.gear-member-mount footer button:last-child{background:#236e5e;color:white}.gear-member-mount button:disabled{opacity:.5}.gear-member-mount [hidden]{display:none}
  </style><h2>安裝到齒輪</h2><label class="mount-target">目標齒輪<select aria-label="目標齒輪"></select></label>
  <p>先選齒輪，再選夾指的軸心孔、定位孔。也可直接點預覽圖；整片移動，不拉長。</p>
  <svg role="group" aria-label="齒輪與夾指兩孔安裝預覽"></svg>
  <div class="mount-fields"><label>夾指軸心孔<select aria-label="夾指軸心孔"></select></label><label>夾指定位孔<select aria-label="夾指定位孔"></select></label></div>
  <p data-distance></p><label data-match hidden><input type="checkbox" aria-label="將齒輪孔距配合夾指"><span></span></label>
  <label><input type="checkbox" aria-label="齒輪定位孔轉到另一側">齒輪定位孔轉到另一側（180°）</label>
  <p role="status" aria-live="polite"></p><p>綠色為安裝預覽，灰色為原位置。確認後一起轉；未合併加工外框，五金與層次仍須核對。</p>
  <footer><button type="button">取消</button><button type="button">確認安裝</button></footer>`;
  const [gearSelect,centerSelect,pinSelect]=dialog.querySelectorAll('select');
  const [match,flip]=dialog.querySelectorAll('input'),[cancel,confirm]=dialog.querySelectorAll('footer button');
  const status=dialog.querySelector('[role=status]'),svg=dialog.querySelector('svg'),distance=dialog.querySelector('[data-distance]'),matchRow=dialog.querySelector('[data-match]');
  const gears=source.comps.filter(c=>c.type==='gear'&&c.moduleId===member.selected?.moduleId);
  const option=(select,value,text)=>{const o=document.createElement('option');o.value=value;o.textContent=text;select.append(o);};
  option(gearSelect,'','請選齒輪');gears.forEach((g,i)=>option(gearSelect,g.id,`${g.name||g.id} · ${g.teeth} 齒`));
  for(const select of [centerSelect,pinSelect]){option(select,'','請選孔');(member.points||[]).forEach((p,i)=>option(select,p.id,`孔 ${String.fromCharCode(65+i)}`));}
  if(gears.length===1)gearSelect.value=gears[0].id;
  let plan;
  const request=()=>({memberId:id,gearId:gearSelect.value,centerId:centerSelect.value,pinId:pinSelect.value,matchRadius:match.checked,flipPin:flip.checked});
  function preview() {
    svg.replaceChildren();if(!member.ok)return;
    const all=[],layers=[];
    const partIds=member.ids,good=plan?.ok;
    const located=(c,pts)=>{const clone=structuredClone(c);for(const k of ['p1','p2','p3'])if(clone[k]&&pts[clone[k].id])Object.assign(clone[k],pts[clone[k].id]);return clone;};
    const original=Object.fromEntries(member.points.map(p=>[p.id,p]));
    for(const c of source.comps.filter(c=>c.moduleId===member.selected.moduleId&&['bar','triangle'].includes(c.type))){
      const geom=copyMemberGeometry(located(c,partIds.has(c.id)?original:positions),source.params,settings);
      for(const ring of geom.outlines){all.push(...ring);layers.push({ring,color:partIds.has(c.id)?'#8c9aa5':'#c4ad8c'});}
    }
    if(good)for(const c of plan.comps.filter(c=>partIds.has(c.id))){const geom=copyMemberGeometry(c,plan.params,settings);for(const ring of geom.outlines){all.push(...ring);layers.push({ring,color:'#268878'});}}
    for(const g of gears){const p=(good?plan.points[g.p1.id]:positions[g.p1.id])||g.p1,r=Number(source.params[g.radiusParam]);all.push({x:p.x-r,y:p.y-r},{x:p.x+r,y:p.y+r});}
    const xs=all.map(p=>p.x),ys=all.map(p=>p.y),x=Math.min(...xs)-14,y=Math.min(...ys)-14,w=Math.max(...xs)-x+14,h=Math.max(...ys)-y+14;
    if(![x,y,w,h].every(Number.isFinite))return;
    svg.setAttribute('viewBox',`${x} ${-y-h} ${w} ${h}`);
    const add=(tag,attrs,parent=svg)=>{const e=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);parent.append(e);return e;};
    const text=(p,label,color)=>{const e=add('text',{x:p.x,y:-p.y-5,fill:color,'font-size':Math.max(w/25,h/22,8),'text-anchor':'middle','paint-order':'stroke',stroke:'white','stroke-width':1});e.textContent=label;};
    const action=(e,fn)=>{e.setAttribute('role','button');e.setAttribute('tabindex','0');e.onclick=fn;e.onkeydown=ev=>{if(['Enter',' '].includes(ev.key)){ev.preventDefault();fn();}};};
    for(const g of gears){
      const actual=good?plan.comps.find(c=>c.id===g.id):g,p=(good?plan.points[g.p1.id]:positions[g.p1.id])||g.p1,r=Number(source.params[g.radiusParam]);
      const circle=add('circle',{cx:p.x,cy:-p.y,r,fill:'#bcd3f0','fill-opacity':'.45',stroke:g.id===gearSelect.value?'#176b87':'#7695b0','stroke-width':g.id===gearSelect.value?2:.7,'aria-label':`選齒輪 ${g.name||g.id}`});
      action(circle,()=>{gearSelect.value=g.id;match.checked=false;flip.checked=false;update();});
      const gp=(good?plan.points[g.p2.id]:positions[g.p2.id])||{x:p.x+gearOutputRadius(actual,source.params),y:p.y};
      for(const q of [p,gp])add('circle',{cx:q.x,cy:-q.y,r:1.8,fill:'white',stroke:'#176b87'});
      text({x:p.x,y:p.y+r+2},g.name||g.id,'#23415a');
    }
    for(const l of layers)add('path',{d:l.ring.map((p,i)=>`${i?'L':'M'}${p.x},${-p.y}`).join(' ')+'Z',fill:l.color,'fill-opacity':'.25',stroke:l.color,'stroke-width':.7});
    member.points.forEach((p,i)=>{
      const mapped=p.id===centerSelect.value?gears.find(g=>g.id===gearSelect.value)?.p1.id:p.id===pinSelect.value?gears.find(g=>g.id===gearSelect.value)?.p2.id:p.id;
      const q=good?plan.points[mapped]:p,color=p.id===centerSelect.value?'#176b87':p.id===pinSelect.value?'#a55308':'#268878';
      const hole=add('circle',{cx:q.x,cy:-q.y,r:3,fill:'white',stroke:color,'stroke-width':1,'aria-label':`選夾指孔 ${String.fromCharCode(65+i)}`});
      action(hole,()=>{if(!centerSelect.value||pinSelect.value){centerSelect.value=p.id;pinSelect.value='';}else pinSelect.value=p.id;match.checked=false;update();});
      text(q,String.fromCharCode(65+i),color);
    });
  }
  function update() {
    const a=member.points?.find(p=>p.id===centerSelect.value),b=member.points?.find(p=>p.id===pinSelect.value),gear=gears.find(g=>g.id===gearSelect.value);
    const length=a&&b?Math.hypot(b.x-a.x,b.y-a.y):null,radius=gear&&gearOutputRadius(gear,source.params);
    const mismatch=length>0&&gear&&Math.abs(length-radius)>.001;
    matchRow.hidden=!mismatch;
    if(!mismatch)match.checked=false;
    if(mismatch)matchRow.querySelector('span').textContent=`將齒輪輸出孔距改為 ${mm(length)} mm（目前 ${mm(radius)} mm）`;
    distance.textContent=length>0?`夾指兩孔距離 ${mm(length)} mm${gear?` · 齒輪 ${mm(radius)} mm`:''}`:'';
    plan=member.ok?planGearMemberMount(source,request(),{positions,motion}):member;
    confirm.disabled=!plan.ok;status.textContent=plan.ok?'兩孔已對準。確認安裝後可一次復原。':plan.reason;
    preview();
  }
  for(const select of [gearSelect,centerSelect,pinSelect])select.onchange=()=>{match.checked=false;if(select===gearSelect)flip.checked=false;update();};
  match.onchange=flip.onchange=update;
  cancel.onclick=()=>dialog.close();confirm.onclick=()=>{if(!plan?.ok)return;const error=onConfirm(plan);if(error){status.textContent=error;confirm.disabled=true;}else dialog.close();};
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  document.body.append(dialog);dialog.showModal();update();return dialog;
}
