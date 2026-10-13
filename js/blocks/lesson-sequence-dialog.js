import { DEFAULT_SEQUENCE, prepareLessonSequence, sequenceAnglesAt } from './lesson-sequence.js';
import { motionPoseIssue } from './solve-health.js';
let open=false;
export function openLessonSequence({readSource,readAngles,applyAngles,restore}) {
  if(open)return; open=true;
  const dialog=document.createElement('dialog');
  dialog.setAttribute('aria-label','第七課模擬動作序列');
  dialog.style.cssText='box-sizing:border-box;width:min(94vw,460px);max-height:55vh;overflow:auto;margin:auto auto 12px;border:1px solid #b8cbd2;border-radius:12px;padding:14px;color:#18324b';
  const title=document.createElement('h2');title.textContent='第七課：模擬動作序列';
  const note=document.createElement('p');note.textContent='M1 −40～60°，M2 0～30°。TT 馬達不具實體角度定位；此處只模擬順序，不驗證抓取或碰撞。';
  const status=document.createElement('p');status.setAttribute('role','status');status.textContent='改角度與秒數後播放；結束或停止都回到原姿態。此輪設定不存入作品。';
  const rows=DEFAULT_SEQUENCE.map((step,index)=>{
    const row=document.createElement('label');row.style.cssText='display:flex;align-items:center;gap:6px;margin:6px 0;flex-wrap:wrap';
    const label=document.createElement('span');label.textContent=`${index+1}. ${step.name} M${step.motor}`;label.style.flex='1';
    const angle=document.createElement('input'),seconds=document.createElement('input');
    for(const input of [angle,seconds]){input.type='number';input.style.cssText='width:65px;min-height:44px;box-sizing:border-box';}
    angle.value=step.angle;angle.step='1';angle.min=step.motor==='1'?'-40':'0';angle.max=step.motor==='1'?'60':'30';angle.setAttribute('aria-label',`第${index+1}步角度`);
    seconds.value=step.seconds;seconds.min='0.5';seconds.max='5';seconds.step='0.5';seconds.setAttribute('aria-label',`第${index+1}步秒數`);
    row.append(label,angle,document.createTextNode('°'),seconds,document.createTextNode('秒'));
    return {row,angle,seconds,step};
  });
  const play=document.createElement('button'),stop=document.createElement('button'),close=document.createElement('button');
  play.textContent='驗證並播放';stop.textContent='停止並回位';close.textContent='關閉';
  for(const b of [play,stop,close])b.style.cssText='min-height:44px;margin:4px';
  let raf=0,running=false;
  function finish(message){cancelAnimationFrame(raf);if(running)restore();running=false;play.disabled=false;rows.forEach(r=>{r.angle.disabled=false;r.seconds.disabled=false;});if(message)status.textContent=message;}
  play.onclick=()=>{
    const source=readSource(),signature=JSON.stringify(source),start=readAngles();
    const steps=rows.map(r=>({...r.step,angle:r.angle.value.trim()?Number(r.angle.value):NaN,seconds:r.seconds.value.trim()?Number(r.seconds.value):NaN}));
    const plan=prepareLessonSequence(source,steps,start);
    if(!plan.ok){status.textContent=plan.message;return;}
    running=true;play.disabled=true;rows.forEach(r=>{r.angle.disabled=true;r.seconds.disabled=true;});
    const began=performance.now();
    function frame(now){
      if(JSON.stringify(readSource())!==signature){finish('作品已變更，已停止並回位。');return;}
      const elapsed=Math.min((now-began)/1000,plan.duration),pose=sequenceAnglesAt(plan,elapsed);
      try {const issue=motionPoseIssue(source.comps,plan.solve(pose.angles));if(issue)throw Error(issue.message);applyAngles(pose.angles);}catch(e){finish(`已停止：${e.message}`);return;}
      status.textContent=`第 ${pose.index+1} 步：${steps[pose.index].name}（${elapsed.toFixed(1)}／${plan.duration} 秒）`;
      if(elapsed>=plan.duration){finish('播放完成，已回到原姿態；僅通過取樣求解檢查。');return;}
      raf=requestAnimationFrame(frame);
    }
    raf=requestAnimationFrame(frame);
  };
  stop.onclick=()=>finish('已停止，回到原姿態。');close.onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{finish();dialog.remove();open=false;});
  dialog.append(title,note,...rows.map(r=>r.row),status,play,stop,close);document.body.append(dialog);dialog.showModal();
}
