/** Reviewed built-in recipes; opened works are never migrated.
 * Acceptance rechecks these authored holes with planActuatorPlateHoles; keep
 * startup recipes independent from the assembly/schema validation cycle. */
import {makeStandardBlank,convertStandardOutput} from './standard-blank.js';
import {FABRICATION_DEFAULTS} from './fabrication-profile.js';
export const EXAMPLE_ACTUATOR_LAYOUTS={"wiper-single":{"columns":19,"rows":5,"dx":-32,"dy":-16,"ground":["B","A"]},"wiper-missing-coupler":{"columns":19,"rows":5,"dx":-32,"dy":-16,"ground":["B","A"]},"fourbar-crank-rocker":{"columns":19,"rows":5,"dx":-32,"dy":-16,"ground":["B","A"]},"fourbar-missing-coupler":{"columns":19,"rows":5,"dx":-32,"dy":-16,"ground":["B","A"]},"fourbar-double-crank":{"extraLift":{"Link3":1},"columns":16,"rows":5,"dx":-32,"dy":-16,"ground":["B","A"]},"fourbar-double-rocker":{"columns":19,"rows":5,"dx":-32,"dy":-16,"ground":["B","A"]},"parallel-fourbar":{"columns":6,"rows":13,"dx":-32,"dy":-16,"ground":["B","A"]},"chebyshev-linkage":{"columns":14,"rows":5,"dx":-32,"dy":-16,"ground":["D","A"]},"slider-crank":{"columns":25,"rows":5,"dx":-32,"dy":-16,"ground":["M1","M2","O"]},"slider-crank-practice":{"columns":25,"rows":5,"dx":-32,"dy":-16,"ground":["M1","M2","O"]},"single-axis-wrist":{"columns":11,"rows":5,"dx":-56,"dy":-16,"ground":["WristMount","WristAxis"]},"single-servo-claw":{"columns":12,"rows":5,"dx":-40,"dy":-16,"ground":["ClawMount","ClawAxis"]}};
const parked={tt:[[-24,-8],[-8,0],[0,0],[-24,8]],mg995:[[-32,-8],[-24,-8],[-16,-8],[-8,-8],[0,-8],[8,-8],[16,-8],[-32,0],[-24,0],[-16,0],[-8,0],[0,0],[8,0],[-32,8],[-24,8],[-16,8],[-8,8],[0,8],[8,8],[16,8]]};
const keys=['p1','p2','p3','m1','m2'];
export function authorExampleActuatorPlates(source,{id,replaceId}={}){
 const s=structuredClone(source),out=s.comps.find(c=>c.type==='bar'&&c.isInput),layout=EXAMPLE_ACTUATOR_LAYOUTS[id];
 if(!out||!layout)return {ok:false,message:'未核對的範例座板'};
 if(out.standardBlank?.rearMm===8&&s.comps.some(c=>c.id===out.motorMount?.frameBody&&c.standardBlank?.kind==='plate'))return {ok:true,snapshot:s};
 const axis=out.p1,type=out.motorType||'tt',n=s.counter+1,origin={x:axis.x+layout.dx,y:axis.y+layout.dy},made=makeStandardBlank({kind:'plate',columns:layout.columns,rows:layout.rows,n,origin});
 if(!made.ok)return made;const plate=made.comp;plate.id=replaceId||`ActuatorSeat${n}`;plate.name='標準馬達座板';plate.p1.type=plate.p2.type='fixed';plate.frameSeparate=true;plate.motorMountPoint=axis.id;
 for(const id of layout.ground){const p=s.comps.flatMap(c=>keys.map(k=>c[k])).find(p=>p?.id===id),h=p&&plate.holes.find(h=>Math.abs(h.u+origin.x-p.x)<1e-6&&Math.abs(h.v+origin.y-p.y)<1e-6);if(!h)return {ok:false,message:'找不到原機架格位 '+id};h.id=id;h.type='fixed';}
 const park=(c,test)=>{const all=c.holes||[];c.standardBlank.mountHoles=all.filter(test);c.holes=all.filter(h=>!test(h));};
 park(plate,h=>parked[type].some(([u,v])=>Math.abs(h.u+origin.x-axis.x-u)<1e-6&&Math.abs(h.v+origin.y-axis.y-v)<1e-6));
 const old=s.comps.findIndex(c=>c.id===replaceId);if(old>=0)s.comps[old]=plate;else s.comps.unshift(plate);Object.assign(s.params,made.params);s.counter=n;
 s.fabrication=structuredClone(s.fabrication||FABRICATION_DEFAULTS);if(type==='mg995'){s.fabrication.mg995Mount.cableNotchWidthMm=6;s.fabrication.mg995Mount.cableNotchDepthMm=2;}
 out.motorMount={...(out.motorMount||{}),motor:String(out.physicalMotor||axis.physicalMotor||'1'),center:axis.id,frameBody:plate.id,outputBody:out.id,orientation:'horizontal',reversed:true,face:'back',order:['motor','frameBody','outputBody']};
 const p=convertStandardOutput(out,s.params,s.comps);if(!p.ok)return p;s.comps[s.comps.indexOf(out)]=p.comp;Object.assign(s.params,p.params);
 park(p.comp,h=>type==='tt'?h.u===0&&Math.abs(h.v)===8:(Math.abs(h.u)===8&&h.v===0||h.u===0&&Math.abs(h.v)===8));
 // Existing offsets separate new stock and protruding joint hardware. Shaft
 // reach, fastener length and real loading remain unverified.
 for(const c of s.comps){for(const k of keys)if(c[k])delete c[k].frameStock;if(c!==plate&&['bar','triangle','slider'].includes(c.type)&&keys.slice(0,3).filter(k=>c[k]?.type==='fixed').length<2)c.zlift=(c.zlift||0)+2+(layout.extraLift?.[c.id]||0);}
 return {ok:true,snapshot:s};
}
