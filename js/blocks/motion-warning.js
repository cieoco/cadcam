import {sheetMode,setSheet} from './mobile-workspace.js';
/** Highlight actual unresolved owners; selection reuses the normal editor and fusion action. */
import {pointKeysFor} from './part-types.js';
export function showMotionWarning({message,svg,banner,issue,comps,points,project,select}){
 banner.textContent=`暫停模擬：${message}`;banner.style.display='block';banner.setAttribute('role','status');
 if(!issue.componentIds?.length)return;
 const ns='http://www.w3.org/2000/svg';
 svg.querySelector('[data-motion-warning]')?.remove();
 const layer=document.createElementNS(ns,'g');layer.dataset.motionWarning='';layer.style.pointerEvents='none';svg.append(layer);
 const actions=document.createElement('span');actions.style.cssText='display:flex;flex-wrap:wrap;gap:6px';banner.append(actions);
 for(const id of issue.componentIds){
  const c=comps.find(c=>c.id===id);if(!c)continue;
  const pts=pointKeysFor(c).map(k=>points[c[k]?.id]||c[k]).filter(Boolean).map(project);
  const line=document.createElementNS(ns,'polyline');line.dataset.unresolvedPart=id;
  for(const [k,v]of Object.entries({points:pts.map(p=>`${p.x},${p.y}`).join(' '),fill:'none',stroke:'#dc2626','stroke-width':8,'stroke-dasharray':'8 5','vector-effect':'non-scaling-stroke'}))line.setAttribute(k,v);layer.append(line);
  if(!['bar','triangle','gear'].includes(c.type))continue;
  const b=document.createElement('button');b.type='button';b.textContent=`選取${c.name||({bar:'連桿',triangle:'板件',gear:'齒輪'}[c.type])}${issue.componentIds.length>1?' '+(actions.children.length+1):''}`;
  b.style.cssText='pointer-events:auto;min-height:44px;padding:4px 10px;background:white;color:#7f1d1d;border:1px solid #fca5a5;border-radius:8px';
  b.onpointerenter=()=>{line.setAttribute('stroke-width',12);};b.onpointerleave=()=>line.setAttribute('stroke-width',8);
  b.onclick=()=>{select(c);if(sheetMode())setSheet('half');if(c.type==='bar'){document.getElementById('memberOperations').hidden=false;document.getElementById('memberOperationsToggle').setAttribute('aria-expanded','true');}};actions.append(b);
 }
}

export function mountNotice(shapes){
    const failed=shapes.find(s=>s.mount?.status==='unverified'),misaligned=shapes.find(s=>Number.isFinite(s.alignmentMm)&&Math.abs(s.alignmentMm)>.1);
    const reasons={missing_frame_holes:'機架缺少管夾配對孔',frame_alignment:'管夾與機架孔未對齊',barrel_clearance:'筒身與機架高度不足，請調整疊放層',clamp_diameter:'筒身大於參考管夾內徑，需更換管夾',mount_hole_diameter:'固定孔小於參考 M3 軸／螺絲直徑'};
    const mountNotice=failed?`固定座待調整：${reasons[failed.mount.reason] || '尚未核對'}。`:misaligned?`推桿與短連桿不同層，相差 ${Math.abs(misaligned.alignmentMm).toFixed(1)} mm。`:'';
    return mountNotice;
}
