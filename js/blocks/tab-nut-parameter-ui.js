/** Read-only dimensions from the validated shared plan, never a second cutting model. */
export function renderTabNutDimensions(svg,summary,plan,{pending=false}={}) {
  svg.replaceChildren();
  svg.toggleAttribute('hidden',pending||!plan?.ok);
  if(pending||!plan?.ok){summary.textContent=pending?'尺寸檢查中…':'尺寸通過檢查後顯示配對槽與板厚。';return;}
  const p=plan.settings,number=n=>String(Number(n.toFixed(3)));
  summary.textContent=`承接板厚 ${number(plan.tHost)} · 立板厚 ${number(plan.tChild)} · 榫長 ${number(plan.tHost)}（隨承接板厚） · 插槽 ${number(p.tabWidthMm+p.slotClearanceMm)} × ${number(plan.tChild+p.slotClearanceMm)} mm`;
  const half=p.tabPitchMm/2+p.tabWidthMm/2+6,top=Math.max(plan.local.tip+p.endClearanceMm,plan.local.nutHi)+4;
  svg.setAttribute('viewBox',`${-half} ${-top} ${half*2} ${top+plan.tHost+14}`);
  svg.setAttribute('aria-label',`接頭局部輪廓：A 榫寬 ${number(p.tabWidthMm)} mm；B 榫中心距 ${number(p.tabPitchMm)} mm`);
  const add=(tag,attrs,text)=>{const e=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value] of Object.entries(attrs))e.setAttribute(key,String(value));if(text)e.textContent=text;svg.append(e);return e;};
  const origin=plan.local.origin,u=plan.local.u,v=plan.local.v;
  const local=q=>({x:(q.x-origin.x)*u.x+(q.y-origin.y)*u.y,y:-((q.x-origin.x)*v.x+(q.y-origin.y)*v.y)});
  const path=ring=>ring.map(local).map((q,i)=>`${i?'L':'M'}${q.x},${q.y}`).join(' ')+'Z';
  const g=plan.childGeometry;
  const holes=(g.holes||[]).map(h=>{const q=local(h);return `M${q.x-h.r},${q.y}a${h.r},${h.r} 0 1,0 ${h.r*2},0a${h.r},${h.r} 0 1,0 ${-h.r*2},0Z`;});
  add('path',{d:[...g.outlines.map(path),...(g.cutouts||[]).map(c=>path(c.points)),...holes].join(' '),fill:'#f2c184',stroke:'#9b632b','stroke-width':.3,'fill-rule':'evenodd'});
  const dimension=(x1,x2,y,label)=>{
    add('path',{d:`M${x1},${y-1}v2M${x1},${y}H${x2}M${x2},${y-1}v2`,stroke:'#215e77','stroke-width':.3,fill:'none'});
    add('text',{x:(x1+x2)/2,y:y+3.7,'font-size':3.2,'text-anchor':'middle',fill:'#215e77'},label);
  };
  dimension(-p.tabPitchMm/2-p.tabWidthMm/2,-p.tabPitchMm/2+p.tabWidthMm/2,plan.tHost+2,`A ${number(p.tabWidthMm)}`);
  dimension(-p.tabPitchMm/2,p.tabPitchMm/2,plan.tHost+8,`B ${number(p.tabPitchMm)}`);
}
