import assert from 'node:assert/strict';
import {planMemberFrame} from '../js/blocks/member-frame.js';
import {makeStandardBlank} from '../js/blocks/standard-blank.js';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
import {installationChoices} from '../js/blocks/syringe-installation.js';
for(const kind of ['bar','plate','l']){
 const b=makeStandardBlank({kind,n:1,origin:{x:12.25,y:-8.75}}),source={comps:[b.comp],params:b.params,id:b.comp.id},original=structuredClone(source),plan=planMemberFrame(source);
 assert.ok(plan.ok,plan.message);assert.deepEqual(source,original);assert.equal(plan.comps[0].p1.type,'fixed');assert.equal(plan.comps[0].p2.type,'fixed');
 for(const k of ['p1','p2','p3'])if(b.comp[k])for(const axis of ['x','y'])assert.equal(plan.comps[0][k][axis],b.comp[k][axis]);
 assert.ok(installationChoices(plan.comps,source.params).frames.some(c=>c.id===source.id));
 assert.ok(planMemberFrame({...source,comps:plan.comps}).unchanged);
 const reopened=normalizeSnapshot(toSnapshot(plan.comps,{params:source.params},2));assert.ok(planMemberFrame({...source,comps:reopened.comps,params:reopened.params}).unchanged);
 assert.equal(planMemberFrame({...source,comps:[{...b.comp,isInput:true}]}).ok,false);
 assert.equal(planMemberFrame({...source,points:{[b.comp.p2.id]:{x:b.comp.p2.x+1,y:b.comp.p2.y}}}).ok,false);
 assert.equal(planMemberFrame({...source,comps:[{...b.comp,barFusionRoot:'F'}]}).ok,false);
}
const b=makeStandardBlank({kind:'bar'}),c=b.comp,source={comps:[c],params:b.params,id:c.id};
const other={type:'bar',id:'Neighbor',p1:{...c.p2},p2:{id:'End',type:'floating',x:c.p2.x+20,y:c.p2.y},lenParam:'N',fixedLen:true};
const joined={...source,comps:[c,other],params:{...source.params,N:20}};
const candidate=planMemberFrame(joined);assert.ok(candidate.ok,candidate.message);assert.equal(candidate.comps[1].p1.type,'fixed');assert.equal(candidate.comps[1].p2.type,'floating');
assert.equal(planMemberFrame({...joined,comps:[c,{...other,isInput:true}]}).ok,false);
assert.equal(planMemberFrame({...source,params:{[c.lenParam]:5}}).ok,false,'never snap or distort inconsistent lengths');
const duplicate=structuredClone(c);duplicate.p2={...duplicate.p1};assert.equal(planMemberFrame({...source,comps:[duplicate]}).ok,false);
console.log('member frame: bar/plate/L, exact fractional coordinates, shared joints, idempotence, reload, motor/fusion/pose/geometry guards passed');

const motorNode=structuredClone(c);motorNode.p2.type='motor';assert.equal(planMemberFrame({...source,comps:[motorNode]}).ok,false);
const ordinary=structuredClone(c);delete ordinary.standardBlank;const ordinaryPlan=planMemberFrame({...source,comps:[ordinary]});assert.ok(ordinaryPlan.ok);assert.equal(ordinaryPlan.comps[0].frameSeparate,true);
