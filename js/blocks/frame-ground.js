/** One stable pair for both the inspector readout and fixed-axis editing. */
export function frameGroundAxis(nodes) {
  const ordered=[...nodes].filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)).sort((a,b)=>a.id.localeCompare(b.id));
  const [base,target]=ordered;
  const length=target?Math.hypot(target.x-base.x,target.y-base.y):0;
  return {nodes:ordered,base,target,length,angle:target?Math.atan2(target.y-base.y,target.x-base.x)*180/Math.PI:0};
}

export function planFrameGroundChange(nodes,kind,delta) {
  const axis=frameGroundAxis(nodes),fail=reason=>({ok:false,reason});
  if(!axis.target)return fail('需要兩個固定軸，才能調整軸距與方向；這裡不是馬達本體角度。');
  if(!['length','angle'].includes(kind)||!Number.isFinite(delta))return fail('請輸入有效的軸距或角度。');
  if(kind==='angle'&&axis.length<1e-6)return fail('兩個固定軸重合，請先增加軸距。');
  const length=axis.length+(kind==='length'?delta:0),angle=(axis.angle+(kind==='angle'?delta:0))*Math.PI/180;
  if(length<8-1e-7)return fail('機架軸距至少保留 8 mm');
  // Numeric changes are exact; the 8 mm grid is for dragging, not angle steps.
  return {ok:true,id:axis.target.id,x:axis.base.x+Math.cos(angle)*length,y:axis.base.y+Math.sin(angle)*length};
}
