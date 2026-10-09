import { compileTopology } from '../js/core/topology.js';
import { solveTopology } from '../js/multilink/solver.js';
import { createPlateGeometry } from '../js/blocks/plate-geometry.js';
const el=id=>document.getElementById(id), api=()=>el('workspace').contentWindow.blocks?.gripperPilot;
let saved=null;
function show(result){
  const summary={ok:result.ok,operationVersion:result.operationVersion,issues:result.issues,changes:result.changes,applied:result.applied,message:result.message,validation:result.validation?{ok:result.validation.ok,range:result.validation.range,samples:result.validation.sampleCount,stepDeg:result.validation.actualStepDeg,unchecked:result.validation.scope.unchecked,limit:'採樣通過不代表樣本間連續可解、干涉或承載通過。'}:undefined,plan:result.plan?{width:result.plan.width,clearance:result.plan.clearance,openAngle:result.plan.open.theta,closedAngle:result.plan.closed.theta,message:result.plan.message}:undefined};
  el('result').textContent=JSON.stringify(summary,null,2);el('fullResult').textContent=JSON.stringify(result,null,2);el('confirm').disabled=!result.ok;
}
function poses(result){
  el('poses').replaceChildren(); if(!result.ok)return;
  const {candidateSnapshot:s,plan}=result,topo=compileTopology(s.comps,{params:{...s.params}},new Set());
  for(const [title,pose] of [['張開',plan.open],['閉合',plan.closed]]){
    const pts=solveTopology(topo,{thetaDeg:pose.theta,motorAngles:{[plan.motor]:pose.theta}}).points;
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','-130 -80 260 270');
    const add=(tag,attrs,text)=>{const n=document.createElementNS(svg.namespaceURI,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text)n.textContent=text;svg.append(n);};
    add('text',{x:-120,y:-65,'font-size':12},`${title} ${pose.theta.toFixed(2)}°／淨距 ${pose.gap.toFixed(1)} mm`);
    for(const c of s.comps){
      if(c.type==='triangle'){
        const geometry=createPlateGeometry(c,['p1','p2','p3'].map(k=>pts[c[k].id]),{holeRadius:1.6});
        for(const outline of geometry.outlines)add('polygon',{points:outline.map(p=>`${p.x},${-p.y}`).join(' '),fill:c.color,opacity:.7});
        for(const h of geometry.holes)add('circle',{cx:h.x,cy:-h.y,r:h.r,fill:'white',stroke:'#17263d'});
        add('text',{x:pts[c.p3.id].x-25,y:-pts[c.p3.id].y-12,'font-size':11},c.id);
      }else{const p=pts[c.p1.id];add('circle',{cx:p.x,cy:-p.y,r:s.params[c.radiusParam],fill:'none',stroke:c.color});add('circle',{cx:p.x,cy:-p.y,r:3,fill:'#17263d'});add('text',{x:p.x-18,y:-p.y+14,'font-size':10},c.id);add('text',{x:p.x-12,y:-p.y+25,'font-size':8},'固定軸');}
    }el('poses').append(svg);
  }
}
el('workspace').addEventListener('load',()=>{el('result').textContent=api()?'已載入隔離工具。請預覽候選。':'工具載入失敗。';});
el('prepare').onclick=()=>{try{const r=api().prepare(JSON.parse(el('request').value));show(r);poses(r);}catch(e){api()?.cancel();show({ok:false,message:e.message});poses({ok:false});}};
el('confirm').onclick=()=>{show(api().confirm());el('confirm').disabled=true;};
el('cancel').onclick=()=>{api().cancel();show({ok:false,message:'已取消，作品不變。'});poses({ok:false});};
el('save').onclick=()=>{saved=JSON.stringify(api().snapshot());show({ok:false,message:'已保存於本頁記憶；未使用 localStorage。'});api().cancel();};
el('reopen').onclick=()=>{if(saved){api().cancel();api().reopen(JSON.parse(saved));show({ok:false,message:'已重開本頁記憶作品。'});}};
