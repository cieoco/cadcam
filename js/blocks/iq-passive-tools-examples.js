/** IQ passive tools as editable plates and ordinary M3 corner brackets.
 * The small root widening and orthogonal spatula ribs are plate adaptations,
 * not replicas of the original moulded plastic connectors.
 */
const point=(id,x,y)=>({id,x,y,type:'fixed'});
const names={Back:'共用背板',ForkL:'左叉臂',ForkR:'右叉臂',SpatulaL:'左鏟板',SpatulaR:'右鏟板',SpatulaLCorner:'左鏟板轉接肋',SpatulaRCorner:'右鏟板轉接肋'};
function plate(id,length,width,{start=0,stock=8,rootHalf,tipHalf}={}){
 const fork=rootHalf!==undefined,wide=width>0;
 const corners=fork?[[0,-rootHalf],[0,rootHalf],[length,-tipHalf],[length,tipHalf]]:[[0,0],[0,width],[length,0],[length,width]];
 return {id,moduleId:id,name:names[id],type:'triangle',color:id==='Back'?'#95a5a6':id.endsWith('Corner')?'#bdc3c7':fork?'#e67e22':'#3498db',
  p1:point(id+'A',start,0),p2:point(id+'B',fork?56:length,0),p3:point(id+'C',start,wide?width:8),
  stock:{widthMm:stock,thicknessMm:3},gParam:id+'L',r1Param:id+'W',r2Param:id+'D',sign:1,shapeMode:'hull',
  // Shape corners need no pilot holes. Keep the two editable reference holes
  // clear of the generated M3 pair; the third solver reference is not a hole.
  vertices:[{solve:true,ref:'p1'},{solve:true,ref:'p2'},...corners.map(([x,y])=>({solve:false,u:x-start,v:y,hole:false}))]};
}
const selection=(id,hostFace,childFace,offsetU,offsetV,quarterTurns=0)=>({brackets:{enabled:true,offsets:{L1:0,R1:0,L2:0},childPart:id},hostFace,childFace,alignU:0,alignV:0,offsetU,offsetV,gap:0,quarterTurns});
function mount(mod,hostId,rotation,translation,chosen,ref){mod.mount={to:{module:hostId,output:'tool'},ref,home:{},face:{version:1,childPart:mod.id,rotation,translation,selection:chosen,hostThicknessMm:3,childThicknessMm:3}};}
function snapshot(kind){
 const comps=[plate('Back',72,8)];
 if(kind!=='spatula')for(const id of ['ForkL','ForkR'])comps.push(plate(id,60.2,0,{start:16,stock:3.8,rootHalf:3.5,tipHalf:2.1}));
 if(kind!=='fork')for(const id of ['SpatulaL','SpatulaR'])comps.push(plate(id+'Corner',16,16,{start:8}),plate(id,48,8,{start:24}));
 const modules=comps.map(c=>({id:c.id,name:names[c.id],base:c.p1.id,outputs:[{id:'tool',name:'板件基準',at:c.p2.id,body:{kind:'triangle',id:c.id}}],mount:null}));
 // Recorded from buildFaceCandidate; saved selections use the same editable
 // placement and drilling recalculation as the ordinary assembly operation.
 for(const m of modules){
  if(m.id.startsWith('Fork')){const u=m.id==='ForkL'?-28:28;mount(m,'Back',[[0,-1,0],[0,0,-1],[1,0,0]],{x:36+u,y:-4,z:3.3999999999999986},selection(m.id,'top','left',u,-8),{x:72,y:0,a:0});}
  if(m.id.endsWith('Corner')){const left=m.id==='SpatulaLCorner',u=left?-6.5:6.5;mount(m,'Back',left?[[0,-6.123233995736766e-17,1],[0,-1,-6.123233995736766e-17],[1,0,0]]:[[0,1.8369701987210297e-16,-1],[0,1,1.8369701987210297e-16],[1,0,0]],{x:36+u,y:left?9.5:-6.5,z:5.5},selection(m.id,'top','left',u,-2.5,left?1:3),{x:72,y:0,a:0});}
  if(/^Spatula[LR]$/.test(m.id)){const left=m.id==='SpatulaL';mount(m,m.id+'Corner',left?[[1,1.2246467991473532e-16,0],[0,0,1],[1.2246467991473532e-16,-1,0]]:[[1,0,0],[0,0,1],[0,-1,0]],{x:0,y:left?21.5:-5.5,z:-5.5000000000000036},selection(m.id,left?'front':'back',left?'bottom':'top',left?-16:16,-9.5,left?2:0),{x:16,y:0,a:0});m.mount.face.selection.brackets.offsets.L1=-4;}
 }
 return {kind:'blocks',v:1,counter:comps.length,projectName:'IQ '+({fork:'叉臂',spatula:'鏟板',combined:'叉臂與鏟板'})[kind],comps,params:Object.fromEntries(comps.flatMap(c=>[[c.gParam,c.p2.x-c.p1.x],[c.r1Param,c.p3.y],[c.r2Param,Math.hypot(c.p2.x-c.p1.x,c.p3.y)]])),modules,assemblyMembers:modules.map(m=>m.id)};
}
export const IQ_PASSIVE_TOOL_EXAMPLES=['fork','spatula','combined'].map(kind=>({
 id:'iq-passive-'+kind,title:'IQ 被動工具：'+({fork:'雙叉臂',spatula:'雙鏟板',combined:'叉臂＋鏟板'})[kind],
 note:'固定式工具，沒有獨立升降或馬達。'+(kind==='combined'?'外側長叉與內側低鏟共用一塊背板。':'先獨立觀察工具，再對照共用背板的組合版。'),
 adjustmentNote:'切到組立看角碼、配對孔及螺絲。叉根小幅加寬；鏟板以兩片轉接肋跨過 8 mm 高差。這是板材改製，五金尺寸與實物承載仍待核對。',
 lesson:{group:'manipulator',level:'來源試作',use:'用現有板件、選面接合與 M3 角碼表示 IQ 固定式叉／鏟；不含車體。',
  learn:'叉臂較長且窄；鏟板較短且寬，組合時位置更低、靠內。角碼把配對固定孔連起來，轉接肋跨過高差。',
  try:['切到組立，比較背板、外叉、轉接肋與內鏟的相對位置','回各板件設計修改孔距，再復原；保存作品重新開啟'],
  measure:'背板 80×16、叉臂長 64、鏟板 56×16 mm。叉根寬 10.8、端部寬 8；轉接肋 24×24×3 mm。固定孔 Ø3.2，角碼 13×9.5×7 mm。',
  explain:'來源為 VEX IQ Fork、Spatula、Fork + Spatula 官方 3D Parts List：背板 2×10、叉臂 1×8、鏟板 2×7。8 mm 格、3 mm 板、8 mm 高差是看圖改製推論。為實際容納現有角碼，叉根加寬並移開原端孔，鏟板用垂直轉接肋與兩顆角碼接背板；不是原廠兩種塑膠直角接頭的複製。已核對角碼底面、孔邊距及板件材料；沒有核對實物、承重、接觸或完整施工規格，SVG／DXF 含固定孔仍不等於完整施工圖。'},
 snapshot:snapshot(kind)
}));
