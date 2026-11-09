/** Mobile ambiguity picker: use rendered geometry, never change the work until chosen. */
export function collectPickCandidates(svg, x, y, comps) {
  const result = [], seen = new Set();
  const add = item => { const key = `${item.kind}:${item.id}`; if (!seen.has(key)) { seen.add(key); result.push(item); } };
  const bounds = svg.getBoundingClientRect();
  if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return result;
  // Screen-space tolerance stays usable when the whole gripper is fitted on a phone.
  for (const el of svg.querySelectorAll('[data-id], [data-motor-hit]')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const motor = el.getAttribute('data-motor-hit');
    if (Math.hypot(x - cx, y - cy) > (motor ? 28 : 24)) continue;
    const id = motor || el.getAttribute('data-id');
    const servo = comps.some(c => c.motorType === 'mg995' && [c.p1, c.p2].some(p => p?.id === id));
    const hole=comps.find(c=>c.frameHole&&c.p1.id===id);
    add({ kind:'node', id, motor:!!motor, label:motor ? `${servo ? '舵機' : '馬達'}軸心 · ${id}（動力／角度）` : hole?`機架孔 · 距基準孔 ${Number(hole.frameHole.u.toFixed(2))} mm${hole.frameHole.centered===false?` · 偏移 ${Number((hole.frameHole.v||0).toFixed(2))} mm`:""}`:`接點 · ${id}` });
  }
  // 未用格孔比接點更近時保留；同位置的孔仍交由選單辨識，不替使用者猜。
  const idle=r=>r.kind==='node'&&svg.querySelector?.(`circle[data-unused][data-id="${r.id}"]`),near=r=>{const e=svg.querySelector?.(`[data-id="${r.id}"]`)?.getBoundingClientRect();return e?Math.hypot(x-e.left-e.width/2,y-e.top-e.height/2):1e9;};
  const closest=Math.min(...result.map(near));
  for(let i=result.length;i--;)if(idle(result[i])&&near(result[i])>closest+2)result.splice(i,1);
  for (const el of svg.ownerDocument.elementsFromPoint(x, y)) {
    if (!svg.contains(el)) continue;
    const id = el.getAttribute('data-pick-component');
    const c = id && comps.find(c => c.id === id);
    if (!c) continue;
    if (result.length===1 && !result[0].motor && result[0].kind==='node' && c.type==='bar' && [c.p1,c.p2].some(p=>p?.id===result[0].id)) continue;
    const name = c.fusedWith ? '合成夾指' : (c.type === 'pulley' && c.kind === 'sprocket' ? '鏈輪' : ({gear:'齒輪',triangle:'夾指／板件',bar:'連桿',slider:'滑軌'})[c.type]);
    if (name) add({kind:'component', id, label:`${name} · ${id}（尺寸／外形）`});
  }
  return result.sort((a,b) => Number(b.motor || false) - Number(a.motor || false));
}

export function openOverlapPicker(items, choose) {
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-label', '選取重疊物件');
  dialog.style.cssText = 'width:min(360px,calc(100vw - 32px));max-height:70vh;overflow:auto;border:1px solid #b8cbd2;border-radius:16px;padding:18px;color:#18324b;background:white;box-shadow:0 12px 40px #0004';
  const heading = document.createElement('h3'); heading.textContent = '這裡有多個物件，要選哪一個？'; heading.style.margin = '0 0 12px'; dialog.appendChild(heading);
  const button = (label, action) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
    b.style.cssText = 'display:block;width:100%;min-height:48px;margin:8px 0;padding:10px;text-align:left;white-space:normal;font:inherit;color:#18324b;background:#edf6fa;border:1px solid #b8cbd2;border-radius:8px';
    // 手機放開畫布才開選單；同一手勢的合成 click 不可誤選剛出現的按鈕。
    let pressed=false;
    b.addEventListener('pointerdown',()=>{pressed=true;});
    b.addEventListener('pointercancel',()=>{pressed=false;});
    b.addEventListener('click',e=>{if(e.detail&&!pressed)return;pressed=false;action();});dialog.appendChild(b);
  };
  for (const item of items) button(item.label, () => { dialog.close(); choose(item); });
  button('取消選取', () => dialog.close());
  dialog.addEventListener('close', () => dialog.remove(), {once:true});
  dialog.addEventListener('click', e => { if (e.target === dialog) { const r=dialog.getBoundingClientRect(); if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom) dialog.close(); } });
  document.body.appendChild(dialog); dialog.showModal();
}
