/** Plain-data solid construction. Callers choose slots and plate contact frames. */
import { bracketScrewLength, bracketSpecIssue } from './bracket-spec.js';
export const BRACKET_GEOMETRY_VERSION = 1;
const add = (a,b) => ({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const mul = (a,k) => ({x:a.x*k,y:a.y*k,z:a.z*k});

/** contactNormal points out of stock; plateToLocal maps the connection frame to that plate. */
export function buildBracketInstance({ connectionId, slotId, corner, seamAxis, wings, spec }) {
  const issue=bracketSpecIssue(spec);
  if(issue) throw new RangeError(issue);
  const id = `${connectionId}/slot:${slotId}`, th = spec.thicknessMm;
  const built = wings.map(({ role, partId, runAxis, contactNormal, lengthMm, holeOffsetMm, plateThicknessMm, plateToLocal = null }) => {
    const wingId = `${id}/wing:${role}`, holePairId = `${wingId}/pair:0`;
    const contactCenter = add(corner,mul(runAxis,lengthMm/2));
    const contactHole = add(corner,mul(runAxis,holeOffsetMm));
    const ring = [-1,1].map(s=>add(corner,mul(seamAxis,s*spec.widthMm/2))).flatMap((p,i)=>i?[p,add(p,mul(runAxis,lengthMm))]:[add(p,mul(runAxis,lengthMm)),p]);
    const hole = {id:`${holePairId}/thread`,holePairId,wingId,connectionId,center:add(contactHole,mul(contactNormal,th/2)),axis:{...contactNormal},diameterMm:spec.threadedHoleDiameterMm};
    const local=plateToLocal ? {
      x:plateToLocal.rotation[0].reduce((s,v,i)=>s+v*contactHole[['x','y','z'][i]],plateToLocal.translation.x),
      y:plateToLocal.rotation[1].reduce((s,v,i)=>s+v*contactHole[['x','y','z'][i]],plateToLocal.translation.y),
      z:plateToLocal.rotation[2].reduce((s,v,i)=>s+v*contactHole[['x','y','z'][i]],plateToLocal.translation.z)
    } : {...contactHole};
    const plateHole = {id:`${holePairId}/plate`,holePairId,wingId,connectionId,partId,role,center:{...contactHole},axis:{...contactNormal},local,diameterMm:spec.plateHoleDiameterMm};
    const length = bracketScrewLength(plateThicknessMm+th), head = add(contactHole,mul(contactNormal,-plateThicknessMm));
    const screw = {id:`${holePairId}/screw`,holePairId,wingId,connectionId,head,tip:add(head,mul(contactNormal,length)),lengthMm:length,spec:`M3×${length}`,diameterMm:3,headDiameterMm:5.5,headHeightMm:2};
    const box = {id:wingId,wingId,slotId,connectionId,holePairId,thicknessAxis:2,center:add(contactCenter,mul(contactNormal,th/2)),axes:[{...seamAxis},{...runAxis},{...contactNormal}],size:{x:spec.widthMm,y:lengthMm,z:th},hole};
    return {id:wingId,role,partId,contact:{center:contactCenter,normal:{...contactNormal},ring},plateThicknessMm,box,plateHole,screw};
  });
  return {id,slotId,connectionId,geometryVersion:BRACKET_GEOMETRY_VERSION,spec:{...spec},pose:{origin:{...corner},axes:[{...seamAxis},{...wings[0].runAxis},{...wings[0].contactNormal}]},corner:{...corner},seamAxis:{...seamAxis},wings:built,
    hardware:[{id,connectionId,spec:spec.label,kind:'bracket'},...built.map(w=>({...w.screw,kind:'screw'}))]};
}

/** Pose conversion changes spatial values only; stable identity and plate-local drilling survive. */
export function transformBracketInstance(instance, point, vector) {
  const wings = instance.wings.map(w=>({...w,contact:{center:point(w.contact.center),normal:vector(w.contact.normal),ring:w.contact.ring.map(point)},
    box:{...w.box,center:point(w.box.center),axes:w.box.axes.map(vector),hole:{...w.box.hole,center:point(w.box.hole.center),axis:vector(w.box.hole.axis)}},
    plateHole:{...w.plateHole,center:point(w.plateHole.center),axis:vector(w.plateHole.axis)},
    screw:{...w.screw,head:point(w.screw.head),tip:point(w.screw.tip)}}));
  return {...instance,pose:{origin:point(instance.pose.origin),axes:instance.pose.axes.map(vector)},corner:point(instance.corner),seamAxis:vector(instance.seamAxis),wings,
    hardware:[instance.hardware[0],...wings.map(w=>({...w.screw,kind:'screw'}))]};
}
