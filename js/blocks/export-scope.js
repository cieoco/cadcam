import {compsInFocus,ROOT_TAB} from './design-focus.js';
import {assemblyWork,assemblyFamily} from './assembly-membership.js';
import {machineComps,machineModules} from './assembly-roles.js';
import {machineFrameComps,machineMounts,moduleFrameExports,moduleFrameNodes,splitFrameMounts} from './assembly.js';
import {frameConnectorNodes} from './model.js';
import {deriveMotorMounts} from './build-plan.js';
import {buildPartGeometryCatalog} from './part-geometry.js';
import {usesFaceExport,faceFileExportData} from './face-export.js';
import {withWorldAdapterNodes,withAdapterNodes} from './orthogonal-joint.js';
import {memberStockWarnings} from './member-stock.js';
import {FABRICATION_DEFAULTS} from './fabrication-profile.js';
import {syringeManufacturing,syringeFiles} from './syringe-manufacturing.js';
import {cncWarnings} from './cnc-check.js';
import * as Ex from './exporters.js';

// Selection changes file membership, never the source work or its connections.
export function resolveExportScope(source,{scope='design',focus=ROOT_TAB,selectedId=null}={}) {
  const {comps,modules,topo}=source;
  let targets,context;
  if(scope==='assembly') {
    const active=assemblyWork(comps,modules,topo);
    context={comps:machineComps(active.comps,active.modules),modules:machineModules(active.modules)};
    targets=context.comps;
  } else {
    let owner=focus;
    if(scope==='selected') {
      const selected=comps.find(c=>c.id===selectedId);
      if(!selected)throw Error('請先在畫布點選桿件、板件、齒輪或齒條。');
      owner=modules.some(m=>m.id===selected.moduleId)?selected.moduleId:ROOT_TAB;
      targets=[selected];
    } else if(scope==='design')targets=compsInFocus(comps,modules,owner);
    else throw Error('未知的匯出範圍。');
    const family=new Set(assemblyFamily(modules,owner));
    context={comps:comps.filter(c=>family.has(modules.some(m=>m.id===c.moduleId)?c.moduleId:ROOT_TAB)),modules:modules.filter(m=>family.has(m.id))};
  }
  if(!targets.length)throw Error('這個範圍沒有零件。');
  return {context,targets,scope};
}

export function prepareScopedExport(source,options,format) {
  if(!['svg','dxf'].includes(format))throw Error('不支援的格式');
  const work=structuredClone(source),{context,targets,scope}=resolveExportScope(work,options);
  const targetIds=new Set(targets.map(c=>c.id)),files=[],warnings=[],notices=[];
  const emit=(text,name,mime,ids=[])=>{if(scope!=='selected'||ids.some(id=>targetIds.has(id)))files.push({text,name,mime,sourceIds:ids});};
  if(context.comps.some(c=>c.motorType==='n20')){const note='N20 僅通用模擬：固定支架、軸接頭與配對孔尚未提供；中心孔為一般參考孔，製作前須核對。';warnings.push(note);notices.push(note);}
  if(context.comps.some(c=>c.type==='syringe')) {
    const plan=syringeManufacturing(context.comps,work.topo.params,work.fabrication);
    const selected=scope==='selected'?plan.parts.filter(p=>targetIds.has(p.id)||plan.syringes.some(s=>targetIds.has(s.id)&&p.id.startsWith(s.id+'-'))):plan.parts;
    files.push(...syringeFiles({...plan,parts:selected},format).map(f=>({...f,mime:format==='svg'?'image/svg+xml':'application/dxf'})));
    warnings.push(...plan.warnings);
  } else {
    const scoped={...work,...context},params=work.topo.params;
    let data;
    if(usesFaceExport(scoped))data=faceFileExportData(scoped,{theta:0});
    else {
      const settings={...work.exportSettings,drive:work.fabrication?.drive||FABRICATION_DEFAULTS.drive};
      const mounts=machineMounts(deriveMotorMounts(context.comps).map(m=>({...m,settings:m.kind==='mg995'?work.fabrication?.mg995Mount:work.fabrication?.ttMount})),context.comps,context.modules);
      const catalog=buildPartGeometryCatalog({...context,params,fabrication:work.fabrication,exportSettings:settings,mounts});
      const extras=catalog.extras,split=splitFrameMounts(Ex.splitMountsByHost(context.comps,mounts).free,context.comps,context.modules);
      data={...context,params,settings,mounts,extras,points:catalog.homePoints,frames:[
        {name:'frame',nodes:withWorldAdapterNodes(frameConnectorNodes(machineFrameComps(context.comps,context.modules)),extras),mounts:split.world},
        ...moduleFrameExports(context.comps,context.modules,params).map(e=>({name:e.fileBase,nodes:withAdapterNodes(e.moduleId,moduleFrameNodes(e,frameConnectorNodes(e.comps)),extras),mounts:split.byModule[e.moduleId]||[]}))]};
    }
    const stockWarnings=memberStockWarnings(targets,data.settings);
    if(stockWarnings.length)throw Error(stockWarnings[0]);
    Ex.assertAdapterFeatures(data.extras);
    // Keep dependencies for geometry (e.g. a rack's pinion), then filter actual files.
    const collect=(text,name,mime,ids)=>{if(ids.some(id=>targetIds.has(id)))emit(text,name,mime,ids);};
    (format==='svg'?Ex.exportLinksAsSvg:Ex.exportLinksAsDxf)(data.comps,data.points,data.params,data.settings,data.mounts,data.extras,collect);
    const fileParts=new Set(files.map(f=>f.name.slice(0,-4)));
    const cncParts=Ex.cncPartsForExport(data.comps,data.points,data.params,data.settings,data.mounts,data.extras).filter(p=>fileParts.has(p.name));
    if(scope!=='selected') {
      const frameOwners=new Map(moduleFrameExports(data.comps,data.modules,data.params).map(e=>[e.fileBase,new Set(e.comps.map(c=>c.id))]));
      frameOwners.set('frame',new Set(machineFrameComps(data.comps,data.modules).map(c=>c.id)));
      for(const frame of data.frames)if([...frameOwners.get(frame.name)||[]].some(id=>targetIds.has(id))) {
        (format==='svg'?Ex.exportFrameAsSvg:Ex.exportFrameAsDxf)(frame.nodes,data.settings,frame.mounts,frame.name,emit);
        warnings.push(...Ex.frameExportWarnings(frame.nodes,data.settings,frame.mounts));
        const geometry=Ex.inspectFrameExport(frame.nodes,data.settings,frame.mounts);
        if(geometry)cncParts.push({name:frame.name,holes:geometry.holes,cutouts:geometry.cutouts});
      }
    }
    warnings.push(...cncWarnings(cncParts,work.fabrication?.cnc||FABRICATION_DEFAULTS.cnc));
    const skipped=targets.filter(c=>!['anchor','bar','triangle','gear','rack'].includes(c.type)&&!['sprocket','chain'].includes(c.kind));   // 鏈輪與鏈條是買現成的，不出板材檔也不提醒
    if(skipped.length){const notice=`未提供獨立板材檔：${skipped.map(c=>c.id).join('、')}`;warnings.push(notice);notices.push(notice);}
  }
  if(!files.length)throw Error('這個範圍沒有可匯出的板材零件；請選板身，不是接點。');
  if(new Set(files.map(f=>f.name)).size!==files.length)throw Error('零件檔名重複，請調整零件名稱後再匯出。');
  return {files,warnings:[...new Set(warnings)],notices,scope};
}
