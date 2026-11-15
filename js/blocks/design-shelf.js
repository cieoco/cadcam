/** Design sources stay editable; each drop adds one assembly occurrence. */
export function createDesignShelf({items,add,active,busy}) {
  let root, list, signature='';
  function render(){
    if(!root){
      root=document.createElement('section');root.id='assemblyDesignShelf';root.setAttribute('aria-label','從設計加入組立');
      root.style.cssText='flex:0 0 auto;padding:6px 10px;background:#f2f7fb;border-bottom:1px solid #cfdae3;z-index:5;';
      const note=document.createElement('div');note.textContent='拖入設計，或點 ＋ 加入；再次加入會共用尺寸';note.style.cssText='font-size:12px;color:#4b6578;margin-bottom:4px';
      list=document.createElement('div');list.style.cssText='display:flex;gap:8px;overflow-x:auto;padding-bottom:3px';root.append(note,list);
      document.querySelector('.stage.workspace').before(root);
    }
    root.hidden=!active();if(root.hidden)return;
    const rows=items(),next=JSON.stringify([rows,busy()]);if(next===signature)return;signature=next;list.replaceChildren();
    if(!rows.length){const empty=document.createElement('span');empty.textContent='先到「設計」畫一個零件';list.append(empty);}
    for(const row of rows){
      const b=document.createElement('button');b.type='button';b.textContent=`＋ ${row.label}${row.count?` · 已放 ${row.count} 個`:''}`;
      b.setAttribute('aria-label',`加入 ${row.label}`);b.dataset.designSource=row.id;b.disabled=busy();
      b.style.cssText='flex:0 0 auto;min-height:44px;padding:8px 12px;border:1px solid #9fbccc;border-radius:8px;background:#fff;color:#254d70;touch-action:none;cursor:grab';
      let drag=null,ignoreUntil=0;
      b.onclick=()=>{if(performance.now()>ignoreUntil)add(row.id);};
      b.onpointerdown=e=>{if(e.button!==0||b.disabled)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};b.setPointerCapture(e.pointerId);};
      b.onpointermove=e=>{if(!drag)return;if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>8){drag.moved=true;b.style.background='#d8eee9';b.textContent=`放到組立畫面：${row.label}`;}};
      const finish=(e,cancel)=>{if(!drag)return;const moved=drag.moved;drag=null;if(b.hasPointerCapture(e.pointerId))b.releasePointerCapture(e.pointerId);b.style.background='#fff';b.textContent=`＋ ${row.label}${row.count?` · 已放 ${row.count} 個`:''}`;
        if(!moved)return;ignoreUntil=performance.now()+500;if(cancel)return;
        const area=document.getElementById('view3d')?.getBoundingClientRect();
        const hit=document.elementFromPoint(e.clientX,e.clientY);
        if(area&&e.clientX>=area.left&&e.clientX<=area.right&&e.clientY>=area.top&&e.clientY<=area.bottom&&!hit?.closest('#benchPanel,#assemblyDesignShelf'))add(row.id);
      };
      b.onpointerup=e=>finish(e,false);b.onpointercancel=e=>finish(e,true);b.ondragstart=e=>e.preventDefault();list.append(b);
    }
  }
  return {render};
}
