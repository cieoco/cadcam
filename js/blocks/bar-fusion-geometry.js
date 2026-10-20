import {inspectBarFusionData} from '../core/bar-fusion.js';
import {unionOutlines,area,inside} from './part-fusion.js';
import {memberStock} from './member-stock.js';
import {inspectLinkExport} from './exporters.js';

export function inspectBarFusion(comps,root,params={},settings={}) {
  const f=inspectBarFusionData(comps,root,params);
  if(!f.ok)return f;
  try {
    const source=[],holes=[],cutouts=[],stock=memberStock(root);
    for(const c of f.members){
      const s=memberStock(c);
      if(s.thicknessMm!==stock.thicknessMm || s.material!==stock.material || (c.zlift||0)!==(root.zlift||0))throw Error('請選相同板厚、材料及疊放位置的連桿。');
      if(c.motorMountPoint || c.holes?.length || c.style==='piston')throw Error('含馬達座、伸縮或中間孔的連桿尚不支援合成。');
      const a=f.points[c.p1.id],b=f.points[c.p2.id],length=Math.hypot(b.x-a.x,b.y-a.y),ux=(b.x-a.x)/length,uy=(b.y-a.y)/length;
      const move=p=>({x:a.x+p.x*ux-p.y*uy,y:a.y+p.x*uy+p.y*ux});
      const g=inspectLinkExport(c,length,settings);
      source.push(...g.outlines.map(r=>r.map(move)));
      holes.push(...g.holes.map(h=>({...h,...move(h)})));
      cutouts.push(...g.cutouts.map(h=>({...h,points:h.points.map(move)})));
    }
    const loops=unionOutlines(source),outer=loops.filter(r=>area(r)>0);
    if(outer.length!==1)throw Error('外形必須重疊並連成一片；請調整位置或板寬。');
    const unique=[];
    for(const h of holes){
      if(cutouts.some(c=>c.layer==='TT_SHAFT_FLAT'&&inside(h,c.points)))continue;
      const same=unique.find(q=>Math.hypot(q.x-h.x,q.y-h.y)<1e-5);
      if(same){if(Math.abs(same.r-h.r)>.001)throw Error('重合孔的孔徑不同，請先調整孔徑。');continue;}
      if(unique.some(q=>Math.hypot(q.x-h.x,q.y-h.y)<q.r+h.r-.001))throw Error('不同孔位互相重疊，請先調整孔位。');
      unique.push(h);
    }
    cutouts.push(...loops.filter(r=>area(r)<0).map(points=>({points,layer:'FUSION_CUTOUT'})));
    if(unique.some(h=>Array.from({length:32},(_,i)=>({x:h.x+h.r*Math.cos(i*Math.PI/16),y:h.y+h.r*Math.sin(i*Math.PI/16)})).some(p=>!inside(p,outer[0]) || loops.some(r=>area(r)<0&&inside(p,r)))))throw Error('孔位超出合成板材，請調整板寬或孔徑。');
    return {...f,root,source,geometry:{outlines:[outer[0]],holes:unique,cutouts},thicknessMm:stock.thicknessMm};
  }catch(e){return {ok:false,reason:e.message};}
}
export function worldFusionGeometry(f,positions) {
  const a=positions[f.root.p1.id]||f.root.p1,b=positions[f.root.p2.id]||f.root.p2,l=Math.hypot(b.x-a.x,b.y-a.y),ux=(b.x-a.x)/l,uy=(b.y-a.y)/l;
  const move=p=>({x:a.x+p.x*ux-p.y*uy,y:a.y+p.x*uy+p.y*ux});
  return {outlines:f.geometry.outlines.map(r=>r.map(move)),holes:f.geometry.holes.map(h=>({...h,...move(h)})),cutouts:f.geometry.cutouts.map(c=>({...c,points:c.points.map(move)}))};
}
