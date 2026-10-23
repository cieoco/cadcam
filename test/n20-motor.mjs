import assert from 'node:assert/strict';
import {actuatorSource} from './fixtures/actuator-installation.mjs';
import {planMotorInstallation} from '../js/blocks/actuator-installation.js';
import {motorInstallationScene} from '../js/blocks/actuator-install-scene.js';
import {motorTypeAt,servoRange,createMotorTools} from '../js/blocks/motor-tools.js';
import {normalizeSnapshot,toSnapshot} from '../js/blocks/schema.js';
import {encodeSnapshot,decodeShareString} from '../js/share-codec.js';
import {S} from '../js/blocks/state.js';
import {BLOCK_EXAMPLES} from '../js/blocks/examples.js';
import {buildPlan,buildPackHtml,deriveMotorMounts,hardwareList} from '../js/blocks/build-plan.js';
import {prepareScopedExport} from '../js/blocks/export-scope.js';
import {motorMountFeatures} from '../js/blocks/exporters.js';
import {FABRICATION_DEFAULTS as fab} from '../js/blocks/fabrication-profile.js';
import {sweep} from './_harness.mjs';

const request={hostId:'Frame',hostEnd:'p1',outputId:'Arm',outputEnd:'p1',face:'back',orientation:'follow-frame',type:'n20',angle:0};
const installed=planMotorInstallation(actuatorSource,request);
assert.ok(installed.ok,installed.message);
assert.equal(motorTypeAt(installed.comps,installed.center),'n20');
assert.equal(servoRange(installed.comps,'1'),null);
assert.equal(motorInstallationScene(installed).motors[0].type,'n20');
assert.ok(sweep(installed.comps,installed.params,['D']).allValid);

// All three supported outputs retain type through save/share; exports never borrow TT holes.
const chain=normalizeSnapshot(BLOCK_EXAMPLES.find(e=>e.id==='sprocket-chain').snapshot);
const gear=normalizeSnapshot(BLOCK_EXAMPLES.find(e=>e.id==='gear-pair').snapshot);
for(const source of [installed,chain,gear]){
  const comps=structuredClone(source.comps),params={...source.params};
  const output=comps.find(c=>c.isInput||c.p1?.physicalMotor);
  output.motorType='n20';
  const snapshot=toSnapshot(comps,{params},100);
  const saved=normalizeSnapshot(decodeShareString(encodeSnapshot(snapshot)));
  const restored=saved.comps.find(c=>c.id===output.id);
  assert.equal(restored.motorType,'n20');
  const center=[restored.p1,restored.p2].find(p=>p?.physicalMotor).id;
  assert.equal(motorTypeAt(saved.comps,center),'n20');
  const mounts=deriveMotorMounts(saved.comps);
  assert.equal(mounts.find(m=>m.pointId===center).kind,'n20');
  assert.equal(motorMountFeatures(mounts.find(m=>m.pointId===center)),null);
  const plan=buildPlan({comps:saved.comps,modules:[],params:saved.params,exportSettings:fab.export,cnc:fab.cnc,mounts});
  assert.ok(hardwareList(plan).some(r=>r.spec==='N20 減速馬達'));
  assert.ok(!hardwareList(plan).some(r=>r.spec==='TT 減速馬達'));
  const html=buildPackHtml(plan,{cnc:fab.cnc,comps:saved.comps});
  assert.match(html,/N20 僅通用模擬/);
  assert.doesNotMatch(html,/安裝 TT 馬達/);
  for(const format of ['svg','dxf']){
    const result=prepareScopedExport({...saved,topo:saved,fabrication:structuredClone(fab),exportSettings:fab.export},{scope:'assembly'},format);
    assert.ok(result.warnings.some(w=>w.includes('N20')));
    assert.ok(result.notices.some(w=>w.includes('N20')));
    assert.ok(result.files.length>0);
    assert.ok(!result.files.some(f=>/TT_HUB|TT_SCREW|TT_LOCATOR|MG995_HORN/.test(f.text)));
  }
}

// Existing chain motor switches in place with one undo, original connections untouched.
S.comps=structuredClone(chain.comps);S.topo={params:{...chain.params}};
const driver=S.comps.find(c=>c.kind==='sprocket'&&c.p1.physicalMotor),before=structuredClone(driver);
let undos=0;const noop=()=>{};
const motor=createMotorTools({svg:{style:{}},pushUndo:()=>undos++,pause:noop,rebuild:noop,draw:noop,clearBanner:noop});
assert.equal(motor.changeMotorTypeAt(driver.p1.id,'n20'),driver.p1.id);
assert.equal(undos,1);assert.equal(driver.motorType,'n20');
assert.deepEqual(driver.p1,before.p1);assert.deepEqual(driver.p2,before.p2);
assert.equal(motor.changeMotorTypeAt(driver.p1.id,'mg995'),null,'chain servo stays unsupported');
motor.changeMotorTypeAt(driver.p1.id,'tt');assert.equal(driver.motorType,'tt');assert.equal(undos,2);
console.log('n20-motor: installation, continuous motion, save/share, 3D model, safe fabrication and chain switching passed');
