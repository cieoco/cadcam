import assert from 'node:assert/strict';
import {jointAxialLayout} from '../js/blocks3d/joint-axial-layout.js';
import {buildSceneModel} from '../js/blocks3d/scene-model.js';
const part=(id,layer,thicknessMm,joints)=>({id,layer,thicknessMm,joints});
const carrier=part('carrier',-2,3,['axis']),gear=part('gear',-1,3,['axis','pin']),jaw=part('jaw',0,3,['pin']);
const wheel=part('wheel',1,15,['wheel-axis']),side=part('side',0,3,['wheel-axis']);
const options={motorMounts:new Map([['servo',{frameBody:'carrier',outputBody:'gear',face:'back'}]]),motorTypes:new Map([['servo','mg995']])};
const input=[carrier,gear,jaw,side,wheel],before=JSON.stringify(input),z=jointAxialLayout(input,options);
assert.equal(z.get('gear')-z.get('carrier'),7,'servo horn gets local 4 mm clearance');
assert.equal(z.get('jaw')-z.get('gear'),6,'ordinary jaw joint does not inherit the horn or wheel pitch');
assert.equal(z.get('wheel')-z.get('side'),17,'15 mm wheel determines only its own stack');
const wide=jointAxialLayout([...input.slice(0,-1),{...wheel,thicknessMm:40}],options);
for(const p of [carrier,gear,jaw])assert.equal(wide.get(p.id),z.get(p.id),'wheel width must never change gripper heights');
assert.equal(wide.get('wheel'),42);
const extra=jointAxialLayout([...input,part('unrelated',-2,100,['other-axis'])],options);
assert.equal(extra.get('carrier'),z.get('carrier'),'same numeric layer is not a shared joint');
const manual=jointAxialLayout(input,{...options,minimumPitch:12});assert.equal(manual.get('jaw')-manual.get('gear'),12);
assert.equal(JSON.stringify(input),before,'height calculation does not change stored geometry or layers');
console.log('local axial stacks: own stock, servo seating, independent wheel, unrelated body, explicit pitch, immutable source');
const pts={a:{x:0,y:0},b:{x:80,y:0},c:{x:0,y:40},axis:{x:20,y:20},direction:{x:30,y:20},pin0:{x:20,y:10},pin1:{x:20,y:30},tip:{x:100,y:20},w:{x:200,y:0},wd:{x:210,y:0}};
const makeScene=width=>buildSceneModel([{id:'wheel',p1:'w',p2:'wd',style:'crank'}],pts,{plateThickness:3,polygons:[{id:'carrier',points:['a','b','c']},{id:'jaw',points:['pin0','tip','direction']}],
 groundIds:new Set(['a','b','c','axis']),motorCenters:new Set(['axis']),motorTypes:new Map([['axis','mg995']]),motorMounts:new Map([['axis',{frameBody:'carrier',outputBody:'gear',face:'back',outputType:'gear'}]]),
 gears:[{id:'gear',center:'axis',pin:'direction',teeth:18,radius:36,holes:[{id:'pin0'},{id:'pin1'}]}],gearGeometries:{gear:{thicknessMm:3}},
 memberStocks:{'a,b,c':{thicknessMm:3,widthMm:13},'pin0,tip,direction':{thicknessMm:3,widthMm:13},wheel:{thicknessMm:width,widthMm:65}},
 partJoints:{carrier:['a','b','c','axis'],jaw:['pin0','tip','direction','pin1'],gear:['axis','direction','pin0','pin1'],wheel:['w','wd']}});
const thin=makeScene(15),thick=makeScene(40);
assert.deepEqual(thin.plates,thick.plates);assert.deepEqual(thin.gears,thick.gears);assert.deepEqual(thin.motors,thick.motors);
for(const id of ['pin0','pin1']){const pin=thin.pins.find(p=>p.id===id);assert.ok(pin);assert.equal(pin.z0,thin.gears[0].z-1.5);assert.equal(pin.z1,thin.plates.find(p=>p.id==='jaw').z+3+1.5);}
const motor=thin.motors[0],seat=thin.plates.find(p=>p.id==='carrier');assert.equal(motor.mountZ,seat.z);assert.equal(motor.hornBaseZ,seat.z+3.5);
console.log('scene integration: plates, gears, motor and both shared-hole pins use the same local heights');
