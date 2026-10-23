import {tabNutFixture,tabNutRequest} from './fixtures/tab-nut-fixture.mjs';
import {openFaceWizard} from '../js/blocks/face-wizard-ui.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {storedProject} from '../js/blocks/project-envelope.js';
import {faceCandidateModel,buildFaceCandidate} from '../js/blocks/face-candidate.js';
let work=tabNutFixture(),undo=[],viewer;
const $=id=>document.getElementById(id);
const report=message=>{$('result').textContent=JSON.stringify({message,undo:undo.length,mount:work.modules.find(m=>m.id==='Child').mount},null,2);};
const open=(quick=false)=>{const initialMount=work.modules.find(m=>m.id==='Child').mount || (quick?buildFaceCandidate(work,tabNutRequest()).work.modules.find(m=>m.id==='Child').mount:null);openFaceWizard({...work,modules:work.modules.map(m=>m.id==='Child'?{...m,mount:null}:m),childId:'Child',wizard:true,initialMount,startAtPlacement:quick,
  readSource:()=>work,readPose:()=>({theta:0}),commit:w=>{undo.push(structuredClone(work));work=structuredClone(w);report('已確認');},say:report});};
$('open').onclick=()=>open();$('edit').onclick=()=>open();$('quick').onclick=()=>open(true);
$('undo').onclick=()=>{if(undo.length)work=undo.pop();report('已復原');};
$('reload').onclick=()=>{const normalized=normalizeSnapshot(JSON.parse(JSON.stringify(storedProject({...work,kind:'blocks',v:1,params:work.topo?.params||work.params}))));if(!normalized){report('FAIL');return;}work={...work,comps:normalized.comps,modules:normalized.modules,params:normalized.params,topo:{params:normalized.params}};report('保存重開 PASS');};
$('reset').onclick=()=>{work=tabNutFixture();undo=[];report('已重設');};
$('three').onclick=async()=>{const {createViewer}=await import('../js/blocks3d/viewer.js');$('view').hidden=false;viewer||=createViewer($('view'));const scene=faceCandidateModel({work});viewer.update(scene.model);viewer.resize();viewer.tiltView();};
report('待接合');
