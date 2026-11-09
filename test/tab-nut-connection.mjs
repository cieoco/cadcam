import assert from 'node:assert/strict';
import {tabNutFixture,tabNutRequest} from './fixtures/tab-nut-fixture.mjs';
import {buildFaceCandidate,faceCandidateModel} from '../js/blocks/face-candidate.js';
import {normalizeFaceMountContract} from '../js/blocks/face-mount-contract.js';
import {refreshFaceMounts} from '../js/blocks/face-mount-refresh.js';
import {tabNutPlans} from '../js/blocks/tab-nut-plan.js';
import {faceFastenerKind,faceFastenerSelection} from '../js/blocks/fastener-choice.js';
const source=tabNutFixture(),before=JSON.stringify(source),candidate=buildFaceCandidate(source,tabNutRequest());
assert.equal(candidate.ok,true,candidate.reason);assert.equal(JSON.stringify(source),before);
const mount=candidate.work.modules.find(m=>m.id==='Child').mount;
assert.equal(mount.face.version,2);assert.equal(mount.face.selection.fastener.kind,'tab-nut-m3');
assert.deepEqual(normalizeFaceMountContract(mount.face).value,mount.face);
assert.equal(normalizeFaceMountContract({...mount.face,version:1}).ok,false);
assert.equal(normalizeFaceMountContract({...mount.face,selection:{...mount.face.selection,brackets:{enabled:true,offsets:{}}}}).ok,false);
const fresh=refreshFaceMounts(candidate.work.comps,candidate.work.modules,candidate.work.params,{exportSettings:source.exportSettings,stockMm:3});
assert.equal(fresh.modules.find(m=>m.id==='Child').mount.face.version,2);
const scene=faceCandidateModel(candidate);assert.equal(scene.solveValidity.valid,true);
assert.equal(scene.catalog.extras.tabNutPlans[0].ok,true);
assert.equal(scene.catalog.parts.HostPlate.cutouts.length,2);
assert.equal(scene.catalog.parts.ChildPlate.outlines.length,1);
assert.ok(scene.catalog.parts.ChildPlate.outlines[0].some(p=>p.y<-20));
// Two separately owned child boards must not stamp overlapping features into one host.
const pair=structuredClone(candidate.work),second=JSON.parse(JSON.stringify(pair.comps[1]).replaceAll('Child','Second').replaceAll('C0','D0').replaceAll('C1','D1'));
pair.comps.push(second);pair.modules.push(JSON.parse(JSON.stringify(pair.modules[1]).replaceAll('Child','Second').replaceAll('C0','D0')));
const conflict=tabNutPlans(pair.comps,pair.modules,pair.params);assert.equal(conflict.length,2);assert.ok(conflict.every(p=>!p.ok&&p.reason.includes('另一筆')));
// Switching to the legacy placement clears generated slots; an oversized bracket still fails its own checks.
const bracketRequest=tabNutRequest();delete bracketRequest.selection.fastener;
bracketRequest.selection.brackets={enabled:true,offsets:{}};bracketRequest.reselect=true;
const tooLarge=buildFaceCandidate(candidate.work,bracketRequest);assert.equal(tooLarge.ok,false);assert.match(tooLarge.reason,/角碼/);
delete bracketRequest.selection.brackets;
const bracket=buildFaceCandidate(candidate.work,bracketRequest);assert.equal(bracket.ok,true,bracket.reason);
assert.equal(bracket.work.modules.find(m=>m.mount).mount.face.version,1);
assert.equal(tabNutPlans(bracket.work.comps,bracket.work.modules,bracket.work.params).length,0);
assert.equal(candidate.work.modules.find(m=>m.mount).mount.face.version,2);
console.log('PASS tab-nut connection: isolated candidate, v2 contract, refresh and material catalog');

// The unified selector must remove the previous fastener, not leave hidden drilling behind.
const draft=mount.face.selection,settings={offsets:{L1:2.5},childPart:'ChildPlate',tabNut:draft.fastener};
const draftBefore=JSON.stringify(draft);
for(const kind of ['none','bracket','tab-nut']){
  const selected=faceFastenerSelection(draft,kind,settings);
  assert.equal(faceFastenerKind(selected),kind);
  assert.equal(!!selected.fastener,kind==='tab-nut');
  assert.equal(!!selected.brackets,kind==='bracket');
  const request={...tabNutRequest(),reselect:true,selection:selected};
  const result=buildFaceCandidate(candidate.work,request);
  if(kind==='none'){
    assert.equal(result.ok,true,result.reason);
    const model=faceCandidateModel(result);
    assert.equal(model.catalog.extras.tabNutPlans.length,0);
    assert.equal(model.catalog.parts.HostPlate.cutouts.length,0);
  }else if(kind==='tab-nut')assert.equal(result.ok,true,result.reason);
  else assert.equal(result.ok,false,'Existing bracket hole validation must still reject the undersized plate');
}
assert.equal(JSON.stringify(draft),draftBefore,'Selection preview must not modify the saved connection');
assert.equal(faceFastenerKind({},false),'bracket');
assert.equal(faceFastenerKind({},true),'none');
assert.throws(()=>faceFastenerSelection(draft,'printed',settings));
console.log('PASS unified fastener selection: switch, preview isolation and drilling validation');
