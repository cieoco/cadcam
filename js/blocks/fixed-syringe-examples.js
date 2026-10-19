import {rigidGripVertices} from './rigid-gripper.js';
// Measured F3D geometry; stroke 20 mm is a teaching interval, not a syringe specification.
import {SYRINGE_DEMO} from '../core/syringe.js';
const p=(id,x,y,type='floating')=>({id,x,y,type});
const bar=(id,a,b,len)=>({id,type:'bar',p1:a,p2:b,lenParam:len,fixedLen:true,snapLength:false,color:'#64748b',stock:{thicknessMm:3}});
const O=p('H2O',134.1527,209.5479,'fixed'),B=p('H2B',-30.315,157.7816),P=p('H2P',-10.8446,135.4673);
const A=p('H2A',59.2699,100.61565,'fixed');
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const reach=250,C=p('H2C',O.x+(B.x-O.x)*reach/distance(O,B),O.y+(B.y-O.y)*reach/distance(O,B));
export const fixedLiftSnapshot={kind:'blocks',v:1,projectName:'H02 管夾固定針筒抬臂',counter:20,params:{H2Frame:distance(A,O),H2Arm:distance(O,B),H2Coupler:distance(P,B),H2Reach:reach,H2Tail:reach-distance(O,B)},tracePoint:'H2C',comps:[
 bar('H2Frame',A,O,'H2Frame'),{id:'H2Arm',type:'triangle',p1:O,p2:B,p3:C,gParam:'H2Arm',r1Param:'H2Reach',r2Param:'H2Tail',shapeMode:'polyline',color:'#d99b35',stock:{thicknessMm:3}},bar('H2Coupler',P,B,'H2Coupler'),
 {id:'H2Syringe',type:'syringe',mountMode:'fixed-axis',appearance:'flat-rod',axisDeg:Math.atan2(P.y-A.y,P.x-A.x)*180/Math.PI,outputId:'H2Arm',a:{componentId:'H2Frame',u:0,v:0},b:{componentId:'H2Coupler',u:0,v:0},spec:{...SYRINGE_DEMO,name:'F3D 外形參考／20 mm 教學區間（未實測）',outerDiameter:17.5,bodyLength:72,rodDiameter:8,lmin:70,stroke:20,calibrated:false},extension:distance(A,P)-70,branch:1}
]};

// H03：依要求回復至 d5669bb 的交叉夾臂資料（改成推出夾緊之前）。
const G=p('H3O',125.8323,253.3701,'fixed'),R=p('H3P',67.031,254.3706),GA=p('H3A',-26,253.36805,'fixed');
const U=p('H3U',104.4572,301.267),V=p('H3V',102.8402,206.2281),F=p('H3F',147.2073,205.4733),T=p('H3T',148.8243,300.5121);
const tri=(id,a,b,c)=>({id,type:'triangle',p1:a,p2:b,p3:c,gParam:id+'g',r1Param:id+'r',r2Param:id+'d',shapeMode:'polyline',vertices:[{solve:true,ref:'p2'},{solve:true,ref:'p1'},{solve:true,ref:'p3'}],color:'#728b86',stock:{thicknessMm:2}});
export const fixedGripSnapshot={kind:'blocks',v:1,projectName:'H03 針筒夾具／一體式夾臂',counter:30,params:{H3Frame:distance(GA,G),H3Upper:60,H3Lower:60,H3JawAg:52.45,H3JawAr:52.45,H3JawAd:104.9,H3JawBg:52.45,H3JawBr:52.45,H3JawBd:104.9},comps:[
 bar('H3Frame',GA,G,'H3Frame'),bar('H3Upper',R,U,'H3Upper'),bar('H3Lower',R,V,'H3Lower'),tri('H3JawA',G,U,F),tri('H3JawB',G,V,T),
 {id:'H3Syringe',type:'syringe',mountMode:'fixed-axis',axisDeg:Math.atan2(R.y-GA.y,R.x-GA.x)*180/Math.PI,outputId:'H3JawA',a:{componentId:'H3Frame',u:0,v:0},b:{componentId:'H3Upper',u:0,v:0},spec:{...SYRINGE_DEMO,name:'F3D 夾具參考／20 mm 教學區間（未實測）',outerDiameter:17.5,bodyLength:72,rodDiameter:8,lmin:83,stroke:20,calibrated:false},extension:distance(GA,R)-83,branch:1,
 jawIds:['H3JawA','H3JawB']}
]};

for(const [id,angle] of [['H3JawA',70],['H3JawB',-70]]){const arm=fixedGripSnapshot.comps.find(c=>c.id===id);arm.vertices=rigidGripVertices(arm,40,angle);}

// H05／H06 組合變體保留推出夾緊，不隨獨立 H03 回復而變更。
export const assemblyGripSnapshot=(()=>{
// H03：推出＝夾緊。針筒軸線、推桿點 H3P、機架點 H3A 與夾臂支點 H3O 共線（y=253.368），左右夾臂對軸線鏡像。
// 每支夾臂不交叉：後端連桿點與前端夾指在同一側，推桿前進時後端外擺、前端內收。
const G=p('H3O',125.8323,253.368,'fixed'),R=p('H3P',67.031,253.368),GA=p('H3A',-26,253.368,'fixed');
const U=p('H3U',103.6509,300.8968),V=p('H3V',103.6509,205.8392),F=p('H3F',155.9027,296.3421),T=p('H3T',155.9027,210.3939);
const tri=(id,a,b,c)=>({id,type:'triangle',p1:a,p2:b,p3:c,gParam:id+'g',r1Param:id+'r',r2Param:id+'d',shapeMode:'polyline',vertices:[{solve:true,ref:'p2'},{solve:true,ref:'p1'},{solve:true,ref:'p3'}],color:'#728b86',stock:{thicknessMm:2}});
const fixedGripSnapshot={kind:'blocks',v:1,projectName:'H03 針筒夾具／一體式夾臂',counter:30,params:{H3Frame:distance(GA,G),H3Upper:60,H3Lower:60,H3JawAg:52.45,H3JawAr:52.45,H3JawAd:52.45,H3JawBg:52.45,H3JawBr:52.45,H3JawBd:52.45},comps:[
 bar('H3Frame',GA,G,'H3Frame'),bar('H3Upper',R,U,'H3Upper'),bar('H3Lower',R,V,'H3Lower'),tri('H3JawA',G,U,F),tri('H3JawB',G,V,T),
 {id:'H3Syringe',type:'syringe',mountMode:'fixed-axis',axisDeg:Math.atan2(R.y-GA.y,R.x-GA.x)*180/Math.PI,outputId:'H3JawA',a:{componentId:'H3Frame',u:0,v:0},b:{componentId:'H3Upper',u:0,v:0},spec:{...SYRINGE_DEMO,name:'F3D 夾具參考／20 mm 教學區間（未實測）',outerDiameter:17.5,bodyLength:72,rodDiameter:8,lmin:83,stroke:20,calibrated:false},extension:distance(GA,R)-83,branch:1,
 jawIds:['H3JawA','H3JawB']}
]};

for(const [id,angle] of [['H3JawA',-70],['H3JawB',70]]){const arm=fixedGripSnapshot.comps.find(c=>c.id===id);arm.vertices=rigidGripVertices(arm,40,angle);}

return fixedGripSnapshot;
})();

// H04 旋轉底盤（俯視）：管夾固定針筒推短連桿，連桿另一端接在轉盤的曲柄銷上，轉盤繞垂直軸（圖面中心 O）轉動。
// 曲柄半徑 15 mm；針筒軸線偏離轉軸 15 mm，使 0–20 mm 行程以「連桿垂直曲柄（傳動角 90°）」的中點為對稱。M 在距轉軸 60 mm、與曲柄銷夾 120° 處，是轉盤安裝點，之後放升降總成。
{
  const r=15,L=60,half=Math.asin(10/r),s=Math.sqrt(L*L-r*r*(1-Math.cos(half))**2);
  var O4=p('H4O',0,0,'fixed'),B4=p('H4B',0,r),M4=p('H4M',60*Math.cos(-Math.PI/6),60*Math.sin(-Math.PI/6)),R4=p('H4P',-s,r),A4=p('H4A',-s-80,r,'fixed');
}
const stick={widthMm:10,thicknessMm:2};
export const fixedBaseSnapshot={kind:'blocks',v:1,projectName:'H04 管夾固定針筒旋轉底盤',counter:20,params:{H4Frame:distance(A4,O4),H4Coupler:distance(R4,B4),H4Crank:distance(O4,B4),H4Mount:distance(O4,M4),H4Pin:distance(B4,M4)},tracePoint:'H4M',comps:[
 {...bar('H4Frame',A4,O4,'H4Frame'),stock:stick},{...bar('H4Coupler',R4,B4,'H4Coupler'),stock:stick},
 {id:'H4Turn',type:'triangle',p1:O4,p2:B4,p3:M4,gParam:'H4Crank',r1Param:'H4Mount',r2Param:'H4Pin',shapeMode:'polyline',sign:-1,color:'#d99b35',stock:stick},
 {id:'H4Syringe',type:'syringe',mountMode:'fixed-axis',appearance:'flat-rod',axisDeg:0,outputId:'H4Turn',a:{componentId:'H4Frame',u:0,v:0},b:{componentId:'H4Coupler',u:0,v:0},spec:{...SYRINGE_DEMO,name:'F3D 外形參考／20 mm 教學區間（未實測）',outerDiameter:17.5,bodyLength:72,rodDiameter:8,lmin:70,stroke:20,calibrated:false},extension:10,branch:1}
]};
