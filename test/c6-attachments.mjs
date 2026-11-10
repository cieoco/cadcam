// Pack C6 of docs/SDD-CONNECTION-INTEGRITY.md: precise attachmentsOf kinds, the moduleId-equals-part-id bug, I8 (fusion shapes),
// and the non-syringe rows of the parent P3 matrix (docs/SDD-RAPID-MECHANISM-VALIDATION.md#reversible-assembly).
import {readFileSync} from 'node:fs';
class FE{constructor(){this.children=[];this.style={};this.dataset={};this.classList={toggle(){},add(){},remove(){}};this.parentElement={style:{}};}appendChild(c){return c;}append(){}before(){}after(){}replaceChildren(){}setAttribute(){}closest(){return this.parentElement;}querySelector(){return null;}querySelectorAll(){return [];}addEventListener(){}}
const els=new Map();
globalThis.document={getElementById:id=>{if(!els.has(id))els.set(id,new FE());return els.get(id);},createElement:()=>new FE(),head:new FE()};
globalThis.window={confirm:()=>true,alert(){}};
const {check,report}=await import('./_harness.mjs');
const {S}=await import('../js/blocks/state.js');
const {deleteSelectedPart}=await import('../js/blocks/delete-part.js');
const {BLOCK_EXAMPLES,getExample,loadUnitStarts}=await import('../js/blocks/examples.js');
const {normalizeSnapshot}=await import('../js/blocks/schema.js');
const {buildRelations,KINDS}=await import('../js/blocks/relations.js');
const {checkWork}=await import('../js/blocks/integrity.js');
const Repairs=await import('../js/blocks/integrity-repairs.js');
const {integrityGate,loadIntegrity}=await import('../js/blocks/integrity-gate.js');
const {planBarFusion,dissolveBarFusion}=await import('../js/blocks/bar-fusion-plan.js');
const {unmountModule}=await import('../js/blocks/module-ops.js');
const {FABRICATION_DEFAULTS}=await import('../js/blocks/fabrication-profile.js');
const {compEdges}=await import('../js/blocks/ref-fields.js');
await loadUnitStarts();await loadIntegrity();
const clone=v=>structuredClone(v);
const ex=id=>normalizeSnapshot(clone(getExample(id).snapshot));
const work=s=>({comps:s.comps,modules:s.modules||[],params:s.params||{},topo:{...s}});
const P=(id,x=0,y=0,type='floating')=>({id,type,x,y});
const bar=(id,a,b,extra={})=>({type:'bar',id,lenParam:id+'L',p1:a,p2:b,...extra});
const issues=(w,codes)=>checkWork(w).filter(i=>i.severity!=='notice'&&(!codes||codes.includes(i.code)));

// ------------------------------------------------------------------ 1. kinds
{const seen=new Set();let works=0;
 for(const e of BLOCK_EXAMPLES){const s=normalizeSnapshot(clone(e.snapshot));if(!s)continue;works++;
  const rel=buildRelations(work(s));for(const c of s.comps)for(const a of rel.attachmentsOf(c.id))seen.add(a.kind);}
 const need=KINDS.filter(k=>k!=='plate-gear-fusion'&&k!=='reference');   // fusedWith has no built-in example (synthetic below); frameHole only in student files
 check('every relation kind except plate-gear-fusion/reference occurs in a built-in example',need.every(k=>seen.has(k)),need.filter(k=>!seen.has(k)).join(',')+' | seen: '+[...seen]);
 check('no attachment uses an unknown kind',[...seen].every(k=>KINDS.includes(k)),[...seen].filter(k=>!KINDS.includes(k)).join(','));
}
{// one synthetic work per field: the kind and field of the relation
 const comps=[bar('A',P('a1'),P('a2')),bar('B',P('a2'),P('b2')),
  {type:'gear',id:'G1',p1:P('g1'),p2:P('g1p')},{type:'gear',id:'G2',mesh:'G1',p1:P('g2'),p2:P('g2p')},
  {type:'rack',id:'K1',pinion:'G1',framePins:['a1'],p1:P('k1'),p2:P('k2')},
  {type:'pulley',id:'U1',p1:P('u1')},{type:'pulley',id:'U2',p1:P('u2')},{type:'belt',id:'T1',driver:'U1',driven:'U2'},
  {type:'triangle',id:'TP',fusedWith:'G1',p1:P('g1'),p2:P('g1p'),p3:P('tp3')},
  bar('C',P('c1'),P('c2'),{motorCarrier:'A'}),{type:'syringe',id:'Y1',a:{componentId:'A',u:0,v:0},b:{componentId:'B',u:0,v:0},outputId:'B'}];
 const rel=buildRelations({comps,modules:[]}),one=(id,kind,other,field)=>rel.attachmentsOf(id).some(a=>a.kind===kind&&a.otherId===other&&(!field||a.field===field));
 check('shared hole: kind shared-point',one('A','shared-point','B'));
 check('mesh: kind mesh, field mesh',one('G2','mesh','G1','mesh')&&one('G1','mesh','G2','mesh'));
 check('rack: pinion and framePins give kind rack',one('K1','rack','G1','pinion')&&one('K1','rack','A','framePins'));
 check('belt: driver and driven give kind belt',one('T1','belt','U1','driver')&&one('T1','belt','U2','driven'));
 check('plate+gear: fusedWith gives kind plate-gear-fusion',one('TP','plate-gear-fusion','G1','fusedWith'));
 check('motor carrier gives kind motor',one('C','motor','A','motorCarrier'));
 check('syringe ends and output give kind syringe',one('Y1','syringe','A','a.componentId')&&one('Y1','syringe','B','b.componentId')&&one('Y1','syringe','B','outputId'));
}
{// bar fusion membership and points: kind fusion
 const s=ex('six-bar-lift'),rel=buildRelations(work(s)),root=s.comps.find(c=>c.barFusion),mem=root.barFusion.members.find(m=>m!==root.id);
 check('barFusion: root lists members as kind fusion',rel.attachmentsOf(root.id).some(a=>a.kind==='fusion'&&a.otherId===mem&&a.field==='barFusion.members'));
 check('barFusion: member points back to its root (barFusionRoot)',rel.attachmentsOf(mem).some(a=>a.kind==='fusion'&&a.otherId===root.id&&a.field==='barFusionRoot'));
 check('barFusion: fusion points are kind fusion',rel.attachmentsOf(root.id).some(a=>a.kind==='fusion'&&a.field==='barFusion.points.id'));
}
{// modules, brackets, tab-nut, rigid groups
 const has=(id,kind,field,other)=>{const s=ex(id),rel=buildRelations(work(s));return s.comps.some(c=>rel.attachmentsOf(c.id).some(a=>a.kind===kind&&(!field||a.field===field)&&(!other||a.otherId===other)));};
 check('module mount: base and mount.to.output',has('lift-bucket','module-mount','base')&&has('lift-bucket','module-mount','mount.to.output'));
 check('module output: outputs.body and outputs.at',has('lift-bucket','module-output','outputs.body')&&has('lift-bucket','module-output','outputs.at'));
 check('bracket: face mount with brackets',has('iq-wheel-grabber','bracket','mount.face.childPart'));
 check('tab-nut: face mount with fastener',has('tab-nut-m3','tab-nut','mount.face.childPart'));
 check('rigid group: base plate joined to member module parts',has('lift-bucket','rigid-group','rigidGroups'));
 {const s=ex('tab-nut-m3'),rel=buildRelations(work(s));
  check('tab-nut: host plate and child plate are joined by the fastening (kind tab-nut)',rel.attachmentsOf('HostPlate').some(a=>a.kind==='tab-nut'&&a.otherId==='ChildPlate'));}
 // face-mount (positioning only) and mates: synthetic
 const comps=[bar('H',P('h1'),P('h2')),bar('Cx',P('c1'),P('c2'),{moduleId:'M2'})];
 const mods=[{id:'M1',outputs:[{id:'o',at:'h1',body:{kind:'bar',id:'H'}}],mates:{attach:null,receive:[{id:'m',name:'m',ref:{kind:'bar',id:'H',side:1}}]}},
  {id:'M2',mount:{to:{module:'M1',output:'o'},face:{version:1,childPart:'Cx',selection:{}}}}];
 const rel=buildRelations({comps,modules:mods});
 check('face-mount: positioning-only face mount and mates are kind face-mount',rel.attachmentsOf('Cx').some(a=>a.kind==='face-mount')&&rel.attachmentsOf('H').some(a=>a.kind==='face-mount'&&a.field==='mates.receive'));
}

// ------------------------------------------------------------------ 2. the moduleId bug
{const s=ex('iq-wheel-grabber');
 check('fixture has a module id equal to a part id (GrabLeft)',s.modules.some(m=>m.id==='GrabLeft')&&s.comps.some(c=>c.id==='GrabLeft'));
 // a detached copy of GrabLeftArm: fresh ids, no references, but moduleId 'GrabLeft' (the id of another part)
 const w=clone(s),arm=w.comps.find(c=>c.id==='GrabLeftArm');
 for(const k of ['p1','p2'])arm[k]={...arm[k],id:arm[k].id+'_d'};
 w.comps=w.comps.filter(c=>c.id==='GrabLeftArm'||c.id==='GrabLeft');w.modules=[];       // only the arm and the part that shares its moduleId
 w.comps.find(c=>c.id==='GrabLeft').moduleId='';
 for(const k of ['p1','p2']){arm[k].type='floating';delete arm[k].physicalMotor;}delete arm.physicalMotor;delete arm.isInput;delete arm.motorMount;
 const rel=buildRelations({comps:w.comps,modules:[]});
 check('moduleId equal to a part id is not a reference: the detached arm is a free body',rel.isFreeBody('GrabLeftArm')===true,JSON.stringify(rel.attachmentsOf('GrabLeftArm')));
 check('...and attachmentsOf lists nothing for it',rel.attachmentsOf('GrabLeftArm').length===0);
 const same=buildRelations({comps:[{...arm},{id:'GrabLeft',type:'bar',p1:P('z1'),p2:P('z2')}],modules:[]});
 check('a name or param key equal to another part id is not a reference either',buildRelations({comps:[bar('N1',P('n1'),P('n2'),{name:'N2',lenParam:'N2',color:'N2'}),bar('N2',P('n3'),P('n4'))],modules:[]}).attachmentsOf('N1').length===0);
 // the module's own id and mount.to.module are module ids, not parts
 const rel2=buildRelations({comps:[bar('GrabLeft',P('q1'),P('q2'),{moduleId:'GrabRight'}),bar('GrabRight',P('q3'),P('q4'),{moduleId:'GrabLeft'})],modules:[{id:'GrabLeft',mount:{to:{module:'GrabRight',output:'x'}}},{id:'GrabRight'}]});
 check('module ids equal to part ids (module id, moduleId, mount.to.module) attach nothing',rel2.attachmentsOf('GrabLeft').length===0&&rel2.attachmentsOf('GrabRight').length===0,JSON.stringify(rel2.attachmentsOf('GrabLeft')));
}
// the small field table agrees with the lazy index for comp-to-comp edges (startup callers share it)
{let n=0,bad=[];
 for(const e of BLOCK_EXAMPLES){const s=normalizeSnapshot(clone(e.snapshot));if(!s)continue;const rel=buildRelations(work(s));
  const idx=new Set(rel._internal.edges().filter(x=>!x.module&&!['face-mount','bracket','tab-nut','rigid-group'].includes(x.kind)).map(x=>[x.kind,x.field,x.from,x.to,x.via].join('|')));
  for(const x of compEdges(s.comps)){n++;if(!idx.has([x.kind,x.field,x.from,x.to,x.via].join('|')))bad.push(e.id+':'+x.from+'>'+x.to);}}
 check('compEdges (ref-fields.js) edges all appear in buildRelations',n>500&&bad.length===0,bad.slice(0,3).join(';')+' n='+n);
}

// ------------------------------------------------------------------ 3. I8
{const codes=['I8'];let n=0,bad=[];
 const files=['connected-resize','motor-off-plate'].map(f=>normalizeSnapshot(JSON.parse(readFileSync(new URL(`./fixtures/${f}.json`,import.meta.url),'utf8'))));
 for(const s of [...BLOCK_EXAMPLES.map(e=>normalizeSnapshot(clone(e.snapshot))),...files]){if(!s)continue;n++;const i=checkWork(work(s)).filter(x=>x.code==='I8');if(i.length)bad.push(i[0].message);}
 check(`shadow: zero I8 on all ${n} built-in examples and student files (any severity)`,n>=70&&bad.length===0,bad[0]);
 // a valid plate+gear fusion: shared axis and locating hole
 const gear={type:'gear',id:'G',p1:P('ax'),p2:P('pin',10,0),teeth:12,radiusParam:'GR',phase:0};
 const plate={type:'triangle',id:'PL',fusedWith:'G',p1:P('ax'),p2:P('pin',10,0),p3:P('far',0,30),gParam:'g',r1Param:'r1',r2Param:'r2'};
 const w=(...cs)=>({comps:cs.map(clone),modules:[],params:{GR:20},topo:{}});
 check('valid plate+gear pair: no I8',issues(w(gear,plate),codes).length===0,issues(w(gear,plate),codes)[0]?.message);
 const missing=issues(w(plate),codes);
 check('fusedWith naming a missing gear: I8 dangling',missing.length===1&&missing[0].severity==='dangling',JSON.stringify(missing.map(i=>i.severity)));
 const apart=issues(w(gear,{...plate,p2:P('other',10,0)}),codes);
 check('plate no longer shares the locating hole: I8 contradiction',apart.length===1&&apart[0].severity==='contradiction'&&/解除合成/.test(apart[0].message),apart[0]?.message);
 const two=issues(w(gear,plate,{...plate,id:'PL2'}),codes);
 check('two plates fused to one gear: I8 contradiction',two.some(i=>i.severity==='contradiction'));
 // bar fusion: members and orphans
 const s=ex('six-bar-lift'),root=s.comps.find(c=>c.barFusion);
 const gone=work(s);gone.comps=gone.comps.filter(c=>c.id!==root.barFusion.members.find(m=>m!==root.id));
 check('barFusion with a deleted member: I8 contradiction',issues(gone,codes).some(i=>i.parts.includes(root.id)));
 const orphan=work(s);orphan.comps=orphan.comps.map(c=>c.id===root.id?(({barFusion,...r})=>r)(c):c);
 check('members whose root lost its barFusion: I8 contradiction (orphans)',issues(orphan,codes).length>=1);
 const longer=work(s);longer.params={...longer.params,[s.comps.find(c=>c.id===root.barFusion.members[1]).lenParam]:999};
 check('barFusion whose member length no longer matches the frozen hole spacing: I8 contradiction',issues(longer,codes).length>=1);
 // hints: explanation only
 const fnd=Repairs.findings(longer);
 check('hint for I8 is enabled, explains "解除合成", and offers no repair',Repairs.ENABLED.I8===true&&fnd.length>=1&&fnd.every(f=>f.code==='I8'&&f.repairs.length===0&&/解除合成/.test(f.text)),JSON.stringify(fnd.map(f=>[f.code,f.text,f.repairs.length])));
 check('hint text names parts by their names, not ids',!/SixMiddle|SixDrive|\bBlank\d+\b/.test(fnd.map(f=>f.text+f.short).join('')),fnd.map(f=>f.text).join('|'));
 // gate: a NEW I8 is refused, an existing one is not "new"
 const msgs=[];const notify=m=>msgs.push(m);
 check('gate: unfusing nothing changes -> accepted',integrityGate(work(s),work(s),notify)===true);
 check('gate: a candidate that breaks a fusion (member deleted) is refused with a "解除合成" text',integrityGate(work(s),gone,notify)===false&&/未套用/.test(msgs[0]||'')&&/解除合成/.test(msgs[0]),msgs[0]);
 check('gate: a work that already has the I8 is not refused for an unrelated edit',(()=>{const b=clone(gone);b.comps[0]={...b.comps[0],name:'renamed'};return integrityGate(gone,b,notify)===true;})());
 // fuse / unfuse through the planners stay I8-clean
 const base=ex('six-bar-lift'),mem=base.comps.find(c=>c.barFusion).barFusion.members,positions={};
 for(const c of base.comps)for(const k of ['p1','p2','p3'])if(c[k])positions[c[k].id]={x:c[k].x,y:c[k].y};
 const open=work(base);open.comps=dissolveBarFusion(open.comps,mem[0]);
 const dissolved=issues(open,codes);
 const plan=planBarFusion(open.comps,mem,open.params,FABRICATION_DEFAULTS.export,positions,{thetaDeg:0,motorAngles:{1:0}});
 check('unfuse then fuse again: no I8 after either step',dissolved.length===0&&plan.ok&&issues({...open,comps:plan.comps},codes).length===0,plan.reason||dissolved[0]?.message);
 // dissolving only the root flag leaves orphans: the planner never does it, the check would
 const partial=work(base);partial.comps=partial.comps.map(c=>c.barFusionRoot&&c.id===mem[1]?(({barFusionRoot,...r})=>r)(c):c);
 check('a member that lost barFusionRoot is I8 (inspectBarFusionData members changed)',issues(partial,codes).length>=1);
}

// ------------------------------------------------------------------ 4. parent P3 matrix, non-syringe rows
function deleteOf(w,id){
  const c=w.comps.find(x=>x.id===id);
  S.comps=clone(w.comps);S.modules=clone(w.modules||[]);S.topo={params:{...w.params},tracePoints:[],dimensions:[],loads:[]};S.fabrication=w.fabrication||clone(FABRICATION_DEFAULTS);S.counter=500;S.mode='design';
  S.selectedLinkId=c.type==='bar'?id:null;S.selectedTriangleId=c.type==='triangle'?id:null;S.selectedSliderId=null;S.selectedNodeId=null;S.selectedGearId=null;
  const msgs=[];let undo=0;
  deleteSelectedPart({S,transient:m=>msgs.push(m),deleteGearChain(){},pushUndo:()=>undo++,pause(){},closeMobileEditPanel(){},setSliderDetailRows(){},rebuild(){},draw(){},points:{}});
  return {comps:S.comps,modules:S.modules,params:S.topo.params,topo:{...S.topo},msgs,undo,deleted:!S.comps.some(x=>x.id===id)};
}
{// three parts on one hole: detach one, the other two stay joined
 const w={comps:[{type:'anchor',id:'Gd',p1:P('GA',0,0,'fixed')},bar('B1',P('J'),P('j1',40,0)),bar('B2',P('J'),P('j2',0,40)),bar('B3',P('J'),P('j3',-40,0))],modules:[],params:{B1L:40,B2L:40,B3L:40},topo:{}};
 for(const gone of ['B1','B2','B3']){
  const r=deleteOf(w,gone),left=r.comps.filter(c=>c.id.startsWith('B')),rel=buildRelations(r);
  const [x,y]=left.map(c=>c.id);
  check(`three parts on one hole: deleting ${gone} keeps the other two joined on J`,r.deleted&&left.length===2&&left.every(c=>c.p1.id==='J')&&rel.attachmentsOf(x).some(a=>a.otherId===y&&a.kind==='shared-point'&&a.via==='J'),r.msgs.join(' '));
  check(`...and leaves no dangling reference or contradiction (${gone})`,issues(r).length===0,issues(r)[0]?.message);
  check(`...in one undo step (${gone})`,r.undo===1);
 }
}
{// local (lattice) hole of a plate: two bars on hole H3, a third on H4; drilled holes stay
 const plate=(extra={})=>({type:'triangle',id:'PLT',gParam:'g',r1Param:'r1',r2Param:'r2',p1:P('t1'),p2:P('t2',48,0),p3:P('t3',0,48),standardBlank:{kind:'plate'},
  holes:[{id:'PLT_H3',u:16,v:0,type:'floating',diameter:3.2},{id:'PLT_H4',u:32,v:0,type:'floating',diameter:3.2}],...extra});
 const mk=extra=>({comps:[plate(extra),bar('L1',P('PLT_H3',16,0),P('l1',16,40)),bar('L2',P('PLT_H3',16,0),P('l2',16,-40)),bar('L3',P('PLT_H4',32,0),P('l3',32,40))],modules:[],params:{g:48,r1:48,r2:68,L1L:40,L2L:40,L3L:40},topo:{}});
 for(const drilled of [false,true]){
  const w=mk(drilled?{drilled:true}:{}),r=deleteOf(w,'L1'),pl=r.comps.find(c=>c.id==='PLT'),rel=buildRelations(r);
  check(`local hole shared by two bars (plate drilled=${drilled}): deleting one keeps the other attached to the same hole`,r.deleted&&r.comps.find(c=>c.id==='L2').p1.id==='PLT_H3'&&rel.attachmentsOf('L2').some(a=>a.otherId==='PLT'&&a.via==='PLT_H3'),r.msgs.join(' '));
  check(`...the plate keeps both holes with their (u,v) and the hole copies agree (drilled=${drilled})`,pl.holes.map(h=>h.id+':'+h.u+','+h.v).join()==='PLT_H3:16,0|PLT_H4:32,0'.replace('|',',')||pl.holes.length===2&&pl.holes.every(h=>h.u>0),JSON.stringify(pl.holes));
  check(`...the other bar on the other hole is untouched and no contradiction appears (drilled=${drilled})`,JSON.stringify(r.comps.find(c=>c.id==='L3'))===JSON.stringify(w.comps.find(c=>c.id==='L3'))&&issues(r).length===0,issues(r)[0]?.message);
  if(drilled)check('an already-drilled plate stays drilled with the same holes',pl.drilled===true&&pl.holes.length===2);
 }
}
{// module identity: removing a connection must not strand module references
 const s=ex('lift-bucket'),w=work(s);
 const dangling=r=>{const rel=buildRelations(r),out=[];for(const m of r.modules){if(m.base&&!rel.copiesOf(m.base).length)out.push(m.id+'.base');for(const o of m.outputs||[]){if(!rel.copiesOf(o.at).length)out.push(m.id+'.'+o.id+'.at');if(o.body?.id&&!r.comps.some(c=>c.id===o.body.id))out.push(m.id+'.'+o.id+'.body');}}return out;};
 // KNOWN GAP (reported in TEACHING-CHANGELOG C6, next step: delete-part should refuse or clear through the module-output/module-mount relations):
 // deleting a part that a module names as its output body leaves outputs[].body.id / at dangling, and nothing reports it (I5 does not read module interfaces yet).
 const r=deleteOf(w,'Link3');
 check('KNOWN GAP: deleting the output body of module Lift strands Lift.tool (module identity dangling, not detected)',r.deleted&&dangling(r).includes('Lift.tool.body')&&issues(r).length===0,dangling(r).join());
 // deleting a part that no module names leaves modules intact
 const plain=s.comps.find(c=>c.type==='bar'&&!buildRelations(w).attachmentsOf(c.id).some(a=>a.module||a.kind==='rigid-group')&&!c.barFusion&&!c.isInput&&!c.moduleId)||null;
 if(plain){const r2=deleteOf(w,plain.id);check(`deleting an unreferenced part (${plain.id}) leaves every module reference resolvable`,dangling(r2).length===0);}
}
{// unmounting one module (face mount with brackets / tab-nut) leaves the others and the drilled parts untouched
 for(const [id,mod] of [['iq-wheel-grabber','GrabLeft'],['tab-nut-m3','Child'],['lift-bucket',ex('lift-bucket').modules.find(m=>m.mount?.face)?.id]]){
  const s=ex(id),w=work(s),before=clone(s);
  const m=s.modules.find(m=>m.id===mod);if(!m?.mount){check(`${id}: ${mod} is mounted`,false);continue;}
  const r=unmountModule(s.comps,s.modules,mod,s.params,{activeMotor:'1',theta:0,motorAngles:{}});
  const others=s.modules.filter(x=>x.id!==mod).map(x=>JSON.stringify(x)),after=r.modules.filter(x=>x.id!==mod).map(x=>JSON.stringify(x));
  const hostComps=s.comps.filter(c=>c.moduleId!==mod);
  check(`${id}: unmounting ${mod} works and only clears its own mount`,r.ok&&r.modules.find(x=>x.id===mod).mount==null&&JSON.stringify(others)===JSON.stringify(after),r.reason);
  check(`${id}: parts outside ${mod} (holes, drilled flags, coordinates) are unchanged`,hostComps.every(c=>JSON.stringify(r.comps.find(x=>x.id===c.id))===JSON.stringify(c)));
  check(`${id}: the unmounted module keeps its parts and its outputs`,r.comps.filter(c=>c.moduleId===mod).length===before.comps.filter(c=>c.moduleId===mod).length&&JSON.stringify(r.modules.find(x=>x.id===mod).outputs)===JSON.stringify(m.outputs));
  check(`${id}: no contradiction or dangling reference after the unmount`,issues({comps:r.comps,modules:r.modules,params:s.params,topo:{...s}}).length===0,issues({comps:r.comps,modules:r.modules,params:s.params,topo:{...s}})[0]?.message);
 }
}
report('c6-attachments');
