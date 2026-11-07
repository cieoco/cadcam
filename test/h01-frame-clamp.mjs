import assert from 'node:assert/strict';
import {getExample} from '../js/blocks/examples.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {frameConnectorNodes} from '../js/blocks/model.js';
import {inspectFrameExport,svgForFrameGeometry,dxfForFrameGeometry} from '../js/blocks/exporters.js';
import {scanSyringe,planSyringeStroke} from '../js/blocks/syringe-operations.js';
import {buildSyringeInstallPreview} from '../js/blocks/syringe-install-preview.js';
import {checkMaterialInterference} from '../js/blocks/material-interference.js';

const source=normalizeSnapshot(getExample('hydraulic-h01').snapshot),initial=structuredClone(source);
const nodes=frameConnectorNodes(source.comps),g=inspectFrameExport(nodes,{}),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
near(g.dimensions.lengthMm,117);near(g.dimensions.widthMm,101);
assert.equal(g.outlines.length,1);assert.equal(g.collisionOutlines,undefined,'contained clamp pads do not split standard rectangular stock');
assert.deepEqual(Object.keys(g.straightEdges).map(Number),[6,13,20,27]);
const ears=g.holes.filter(h=>h.layer==='SYRINGE_CLAMP');assert.equal(ears.length,2);
near(Math.hypot(ears[1].x-ears[0].x,ears[1].y-ears[0].y),24);
assert.deepEqual(ears.map(h=>({x:h.x,y:h.y})),[{x:-96,y:-84},{x:-96,y:-60}]);
// Pair pitch is 3 cells, but both ears retain their hardware phase (4 mm).
for(const h of ears)near(((h.y+72)%8+8)%8,4);
for(const dir of Object.values(g.dimensions.axis)){
 const low=Math.min(...g.outlines[0].map(p=>p.x*dir.x+p.y*dir.y));
 for(const p of nodes.filter(p=>!p.holeLayer))near((p.x*dir.x+p.y*dir.y-low-6.5)/8,Math.round((p.x*dir.x+p.y*dir.y-low-6.5)/8));
}
for(const text of [svgForFrameGeometry(g,'frame'),dxfForFrameGeometry(g,'frame')])assert.ok(text.includes('SYRINGE_CLAMP')&&!/NaN|Infinity/.test(text));
const scan=scanSyringe(source.comps,source.params,'H1Syringe',.5);assert.ok(scan.ok);assert.equal(scan.samples.length,41);
const legacy=structuredClone(source);legacy.comps.forEach(c=>['p1','p2','p3'].forEach(k=>{if(c[k])delete c[k].frameStock;}));
let previous=null;
for(const sample of scan.samples){
 const pose=planSyringeStroke(source.comps,source.params,'H1Syringe',sample.extension,previous),old=planSyringeStroke(legacy.comps,legacy.params,'H1Syringe',sample.extension,previous);assert.ok(pose.ok);assert.deepEqual(pose.points,old.points);previous=pose.points;
 const {model}=buildSyringeInstallPreview({...source,comps:pose.comps});
 assert.ok(model,`material model at ${sample.extension}`);
 const report=checkMaterialInterference(model);assert.equal(report.findings.length,0,JSON.stringify({extension:sample.extension,findings:report.findings}));
 const clamp=model.syringes[0].mount;assert.equal(clamp.reason,'clamp_fastener_clearance');near(clamp.clearance.holeMm,-.5);near(clamp.clearance.washerMm,-2);
}
const reopened=normalizeSnapshot({kind:'blocks',v:1,comps:source.comps,params:source.params});assert.deepEqual(reopened.comps,source.comps);
assert.deepEqual(source,initial,'derived geometry, material scan and serialization do not edit the work');
console.log('H01: 117×101 grid stock, 24 mm hardware holes with explicit 4 mm phase, shared exports, 41 unchanged poses, actual-layer material scan and separate clamp interference diagnostic passed');
