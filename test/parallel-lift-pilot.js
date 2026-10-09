const el=id=>document.getElementById(id),api=()=>el('workspace').contentWindow.blocks?.gripperPilot;
let saved=null;
function show(r){el('result').textContent=JSON.stringify({ok:r.ok,issues:r.issues,changes:r.changes,applied:r.applied,message:r.message,plan:r.plan?{armLength:r.plan.armLengthMm,height:[r.plan.startHeightMm,r.plan.endHeightMm],angles:[r.plan.start.theta,r.plan.end.theta]}:undefined,validation:r.validation?{samples:r.validation.sampleCount,step:r.validation.actualStepDeg,sampleChecks:r.validation.scope.sampleChecks,unchecked:r.validation.scope.unchecked}:undefined},null,2);el('fullResult').textContent=JSON.stringify(r,null,2);el('confirm').disabled=!r.ok;}
el('workspace').addEventListener('load',()=>{el('result').textContent=api()?'工具已載入，請預覽候選。':'工具載入失敗';});
el('prepare').onclick=()=>{try{show(api().parallelPrepare(JSON.parse(el('request').value)));}catch(e){api()?.parallelCancel();show({ok:false,message:e.message});}};
el('confirm').onclick=()=>{show(api().parallelConfirm());el('confirm').disabled=true;};
el('cancel').onclick=()=>{api().parallelCancel();show({ok:false,message:'取消候選，作品不變。'});};
el('save').onclick=()=>{saved=JSON.stringify(api().snapshot());api().parallelCancel();show({ok:false,message:'保存於本頁記憶，未寫localStorage。'});};
el('reopen').onclick=()=>{if(saved){api().parallelCancel();api().reopen(JSON.parse(saved));show({ok:false,message:'已重開記憶作品。'});}};
