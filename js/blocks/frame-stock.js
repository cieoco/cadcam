/** Frame stock travels with its ground points, including module copies and exports. */
export function normalizeFrameStock(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  const out = {};
  for (const key of ['lengthMm', 'widthMm', 'thicknessMm']) {
    const value = raw[key];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0)
      out[key] = Math.round(Math.max(key === 'thicknessMm' ? .5 : 2, Math.min(key === 'thicknessMm' ? 30 : 2000, value)) * 10) / 10;
  }
  return Object.keys(out).length ? out : undefined;
}
export const frameStockOf = nodes => normalizeFrameStock((nodes || []).find(p => p.frameStock)?.frameStock) || {};

/** Length follows the fixed-point axis; width is perpendicular. Holes never move. */
export function sizeFrameOutline(outlines, nodes) {
  const stock = frameStockOf(nodes), points = outlines.flat();
  let a = nodes[0], b = a, distance = 0;
  for (const p of nodes) for (const q of nodes) {
    const d = Math.hypot(q.x-p.x,q.y-p.y);
    if (d > distance) { a=p; b=q; distance=d; }
  }
  const u = distance > 0 ? {x:(b.x-a.x)/distance,y:(b.y-a.y)/distance} : {x:0,y:1};
  const v = {x:-u.y,y:u.x}, dot=(p,d)=>p.x*d.x+p.y*d.y;
  const xs=points.map(p=>dot(p,u)),ys=points.map(p=>dot(p,v));
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  const minLength=x1-x0,minWidth=y1-y0;
  const lengthMm=Math.max(minLength,stock.lengthMm || 0),widthMm=Math.max(minWidth,stock.widthMm || 0);
  const dimensions={lengthMm,widthMm,minLength,minWidth};
  const cx=(x0+x1)/2,cy=(y0+y1)/2;
  // Both automatic and explicit sizes use the same regular outline. The natural
  // envelope already includes stock around the holes and motor features.
  const r=Math.min(2,lengthMm/4,widthMm/4);
  const ring=[], straightEdges=[];
  for (let corner=0;corner<4;corner++) {
    const angle=corner*Math.PI/2, sx=corner===0 || corner===3 ? 1 : -1, sy=corner<2 ? 1 : -1;
    for(let i=0;i<=6;i++) {const t=angle+i*Math.PI/12;
      const x=cx+sx*(lengthMm/2-r)+r*Math.cos(t),y=cy+sy*(widthMm/2-r)+r*Math.sin(t);
      ring.push({x:x*u.x+y*v.x,y:x*u.y+y*v.y});
    }
  }
  // Only the tangent-to-tangent spans are material straight edges. Arc samples
  // remain in the export outline, but are not individual mounting interfaces.
  for (let corner=0;corner<4;corner++) {
    const a=ring[corner*7+6],b=ring[((corner+1)*7)%ring.length];
    const lengthMm=Math.hypot(b.x-a.x,b.y-a.y);
    if (lengthMm<=1e-6) continue;
    const d={x:(b.x-a.x)/lengthMm,y:(b.y-a.y)/lengthMm};
    // Keep the original outline-segment index: existing v1 mounts store 6/13/20/27.
    // Empty arc slots are intentionally unavailable, never retargeted to a side.
    straightEdges[corner*7+6]={a,b,d,m:{x:d.y,y:-d.x},lengthMm};
  }
  return {outlines:[ring],straightEdges,dimensions,...(stock.thicknessMm ? {thicknessMm:stock.thicknessMm} : {})};
}
