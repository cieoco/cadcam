import {planMemberCopy, copyMemberGeometry} from './member-copy.js';
const NS='http://www.w3.org/2000/svg';

export function openMemberCopy({source,mode,onConfirm}) {
  const dialog=document.createElement('dialog');
  dialog.className='member-copy-dialog';dialog.setAttribute('aria-label','複製與鏡射');
  dialog.innerHTML='<h2>複製與鏡射</h2><label>方式 <select aria-label="複製方式"><option value="copy">複製</option><option value="mirror-x">左右鏡射副本</option><option value="mirror-y">上下鏡射副本</option></select></label><p>灰色原件 · 綠色副本。只複製桿件本體，不帶馬達、針筒及固定狀態；孔位不與原件相連。</p><svg aria-label="原件與副本預覽"></svg><p role="status"></p><footer><button type="button">取消</button><button type="button">確認新增</button></footer>';
  const select=dialog.querySelector('select'),svg=dialog.querySelector('svg'),status=dialog.querySelector('[role="status"]');
  const [cancel,confirm]=dialog.querySelectorAll('button');select.value=mode;
  let plan;
  const ring=points=>points.map((p,i)=>`${i?'L':'M'}${p.x},${-p.y}`).join(' ')+'Z';
  function update() {
    plan=planMemberCopy({...source,mode:select.value});
    confirm.disabled=!plan.ok;svg.replaceChildren();
    status.textContent=plan.ok?(plan.comps.length>1?'已合成的連桿會整片複製。確認後可拖到需要的位置。':'確認後可拖到需要的位置；可用復原取消。'):plan.reason;
    if(!plan.ok)return;
    const all=[];
    for(const [parts,params,color] of [[plan.source,plan.sourceParams,'#8c9aa5'],[plan.comps,plan.params,'#268878']]) {
      for(const c of parts) {
        const g=copyMemberGeometry(c,params,source.settings);
        all.push(...g.outlines.flat());
        const path=document.createElementNS(NS,'path');path.setAttribute('d',g.outlines.map(ring).join(' '));path.setAttribute('fill',color);path.setAttribute('fill-opacity','.35');path.setAttribute('stroke',color);svg.append(path);
        for(const h of g.holes){const hole=document.createElementNS(NS,'circle');for(const [k,v] of Object.entries({cx:h.x,cy:-h.y,r:h.r,fill:'white',stroke:color}))hole.setAttribute(k,v);svg.append(hole);}
      }
    }
    const xs=all.map(p=>p.x),ys=all.map(p=>p.y),x=Math.min(...xs)-12,y=Math.min(...ys)-12,w=Math.max(...xs)-x+12,h=Math.max(...ys)-y+12;
    svg.setAttribute('viewBox',[x,-y-h,w,h].join(' '));
  }
  select.onchange=update;cancel.onclick=()=>dialog.close();
  confirm.onclick=()=>{if(!plan.ok)return;const error=onConfirm(plan);if(error){status.textContent=error;confirm.disabled=true;}else dialog.close();};
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  document.body.append(dialog);update();dialog.showModal();
}
