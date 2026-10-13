import {normalizeFabricationProfile} from './fabrication-profile.js';
import {inspectLinkExport,inspectPlateExport,svgForFrameGeometry,dxfForFrameGeometry} from './exporters.js';
import {solveSyringe} from './syringe-operations.js';
import {attachmentFrame} from '../core/syringe.js';
import {memberStock} from './member-stock.js';
const rectangle=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Concept side plates. The barrel/rod are externally strapped, never drilled.
// The same mm geometry is used by canvas overlays and SVG/DXF.
export function syringeSeatGeometry(spec,fabrication,end='a') {
  const f=normalizeFabricationProfile(fabrication);
  if(!f.ok)throw Error(f.message);
  const {syringeMount:m,export:e}=f.profile;
  const diameter=end==='a'?spec.outerDiameter:spec.rodDiameter;
  const half=diameter/2+m.clearanceMm+m.marginMm;
  const length=m.strapSpacingMm+2*m.marginMm;
  const r=e.frameHoleDiameterMm/2,pin=e.holeDiameterMm/2;
  return {outlines:[rectangle(-m.marginMm,-half,length,half)],cutouts:[],holes:[{x:0,y:0,r:pin,layer:'PIVOT'},
    ...[m.marginMm,m.marginMm+m.strapSpacingMm].flatMap(x=>[-1,1].map(sign=>({x,y:sign*(diameter/2+m.clearanceMm+m.marginMm/2),r,layer:'STRAP_BOLT'})))]};
}
export function syringeManufacturing(comps,params,fabrication) {
  if(comps.some(c=>c.type==='syringe'&&c.mountMode==='fixed-axis'))throw Error('管夾固定案例的板件、隔圈與固定孔尚待核對，本輪不輸出加工檔。');
  const checked=normalizeFabricationProfile(fabrication);if(!checked.ok)throw Error(checked.message);
  const f=checked.profile,result=solveSyringe(comps,params);
  if(!result.ok)throw Error(result.message);
  if(comps.some(c=>!['syringe','bar','triangle','anchor'].includes(c.type)||c.moduleId||c.fusedWith))throw Error('液壓製作包目前支援同一平面的桿件／三角板；請單獨開啟液壓設計再輸出。');
  const syringes=comps.filter(c=>c.type==='syringe'),parts=[];
  for(const c of comps.filter(c=>['bar','triangle'].includes(c.type))){
    const refs=syringes.flatMap(s=>[s.a,s.b]).filter(r=>r.componentId===c.id);
    const length=params[c.lenParam||c.gParam];
    const extra=refs.filter(r=>Math.hypot(r.u,r.v)>1e-6&&Math.hypot(r.u-length,r.v)>1e-6)
      .map(r=>({u:r.u,v:r.v,diameterMm:f.export.holeDiameterMm}));
    let geometry;
    if(c.type==='bar')geometry=inspectLinkExport(c,length,f.export,extra);
    else {
      const frame=attachmentFrame(c,params,result.points);
      const points=[c.p1,c.p2,c.p3].map(p=>{const q=result.points[p.id],dx=q.x-frame.p.x,dy=q.y-frame.p.y;return {x:dx*frame.x+dy*frame.y,y:-dx*frame.y+dy*frame.x};});
      geometry=inspectPlateExport(c,points,f.export,[],extra);
    }
    parts.push({id:c.id,quantity:c.id==='HFrame'?2:1,thicknessMm:memberStock(c).thicknessMm,geometry});
  }
  for(const s of syringes)for(const end of ['a','b'])parts.push({id:`${s.id}-${end==='a'?'筒身托架':'推桿轉接座'}-示範`,quantity:2,thicknessMm:f.cnc.stockThicknessMm,geometry:syringeSeatGeometry(s.spec,f,end)});
  for(const p of parts){
    // Reject unsafe dimensions rather than emitting holes outside the rectangular seat.
    if(p.id.endsWith('示範'))for(const h of p.geometry.holes){const v=p.geometry.outlines[0];if(h.x-h.r<v[0].x||h.x+h.r>v[1].x||h.y-h.r<v[0].y||h.y+h.r>v[2].y)throw Error('固定座孔徑與留邊不相容，請加大留邊。');}
    p.geometry.holes=p.geometry.holes.filter((h,i,hs)=>hs.findIndex(k=>Math.hypot(k.x-h.x,k.y-h.y)<1e-6&&Math.abs(k.r-h.r)<1e-6)===i);
  }
  const warnings=['座板為外夾式概念孔位圖，尚未核對夾持件、間隔與底座角碼孔；不得直接視為加工完成。','全行程實體干涉未檢查；壓力、摩擦、承重與水路未驗證。'];
  if(syringes.some(s=>!s.spec.calibrated))warnings.unshift('示範尺寸，未依實物校正。10mL 不是統一的外形尺寸。');
  const purchased=['工作端針筒（依保存規格）','控制端針筒、水管與水（未模擬水量耦合）','角碼、底座與雙側支架間隔件（依實物決定）','轉軸／螺絲、防鬆螺帽與墊片','外夾筒身托架、推桿尾端夾具／束帶（不可鑽穿盛水筒身）'];
  return {parts,warnings,purchased,fabrication:f,syringes};
}
export function syringeFiles(plan,format) {
  return plan.parts.map(p=>({name:`${p.id}.${format}`,text:format==='svg'
    ?svgForFrameGeometry(p.geometry,p.id).replace('</title>',`</title><desc>${escape(plan.warnings.join(' '))} 厚度 ${p.thicknessMm} mm；數量 ${p.quantity}</desc>`)
    :`999\nCONCEPT ONLY - CALIBRATION AND HARDWARE CHECK REQUIRED; thickness ${p.thicknessMm} mm; qty ${p.quantity}\n${dxfForFrameGeometry(p.geometry,p.id)}`}));
}
export function syringeBuildPack(plan) {
  const svg=syringeFiles(plan,'svg'),dxf=syringeFiles(plan,'dxf');
  return `<!doctype html><meta charset="utf-8"><title>H01 液壓製作資料</title><style>body{font:16px sans-serif;max-width:960px;margin:24px auto;padding:16px}svg{max-width:100%;height:180px}article{border-top:1px solid #ccc;padding:12px}a{margin-right:20px}</style><h1>液壓機構製作資料（mm）</h1>${plan.warnings.map(w=>`<p>${escape(w)}</p>`).join('')}<h2>購買件（不列入板材切割）</h2><ul>${plan.purchased.map(p=>`<li>${escape(p)}</li>`).join('')}</ul><h2>板件與局部孔位</h2>${plan.parts.map((p,i)=>`<article><h3>${escape(p.id)} × ${p.quantity}；板厚 ${p.thicknessMm} mm</h3>${svg[i].text.replace(/<\?xml[^>]*>/,'')}<p><a download="${escape(svg[i].name)}" href="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg[i].text)}">SVG（1:1 mm）</a><a download="${escape(dxf[i].name)}" href="data:application/dxf;charset=utf-8,${encodeURIComponent(dxf[i].text)}">DXF（mm）</a></p><p>孔心 (x,y) / 孔徑 mm：${p.geometry.holes.map(h=>`(${h.x.toFixed(3)}, ${h.y.toFixed(3)}) / ${(h.r*2).toFixed(3)}`).join('；')}</p></article>`).join('')}<h2>保存規格與接點</h2><pre>${escape(JSON.stringify(plan.syringes,null,2))}</pre><h2>組裝與校正</h2><ol><li>量測筒身外徑、長度、推桿尾端外形、夾持位置、最短 A–B 孔距及可用行程；不要用容量推算。</li><li>量測外夾托架與推桿夾具、角碼孔距、轉軸孔徑、板厚及配合間隙，再修改加工設定與座板。</li><li>兩側支架以角碼固定到自備底座，活動臂繞 O 轉動；托架繞 A、推桿夾具繞 B，均保留自由轉動與墊片間隔。</li><li>先空載手推全行程，檢查碰撞、軸向間隔、拔出／觸底，再接水路排氣。不可鑽穿筒身。</li></ol><h2>比較記錄</h2><p>B 孔位／臂長／A 孔位／s 範圍：________</p><p>我的預測：________　模擬觀察：________　實物差異與修正：________</p>`;
}
