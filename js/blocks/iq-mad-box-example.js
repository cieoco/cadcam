// Reference compound reduction, build steps 1–10. Three 12:36 meshes,
// two shared shafts. Dimensions below are a plate conversion, not measured tooling data.
const p=(id,x,type='fixed')=>({id,x,y:0,type});
const params={theta:0,MadPin0:8,MadPin1:8,MadPin2:8,MadPin3:8};
const gear=(id,shaft,teeth,mesh,color)=>{
 params[id+'Radius']=teeth;
 return {type:'gear',id,name:`第 ${shaft+1} 軸 ${teeth} 齒`,color,
  p1:{...p('MadAxis'+shaft,shaft*48),...(shaft===0?{physicalMotor:'1'}:{})},
  p2:p('MadPin'+shaft,shaft*48+8,'floating'),radiusParam:id+'Radius',pinRadiusParam:'MadPin'+shaft,
  pinHoleDiameter:2,teeth,module:2,phase:0,...(mesh?{mesh}:{})};
};
export const MAD_BOX_EXAMPLE={
 id:'iq-mad-box',title:"三段共軸減速",
 note:'三對 12:36 齒輪分成三層；中間兩軸的大、小輪固定一起轉。輸入轉 27 圈，輸出反向轉 1 圈。',
 adjustmentNote:'先看 3D 的三層，再點齒輪改齒數並復原。原圖為手搖，這裡沿用馬達播放；共軸用中心孔與定位孔固定，未含參考零件方軸、外側手柄及完整箱架。',
 lesson:{group:'transmission',level:'來源試作',use:'從一段 3:1 認識共軸複合傳動，不能把惰輪列當成三級減速。',
  learn:'同軸兩輪同角度；嚙合兩輪反向。三段相乘為 27:1，輸出反向。',
  try:['播放，再切 3D 看三對輪分層','點第 4 軸的 36 齒輪，改為 24 齒，預測總比變為 18:1，再復原','保存重開，核對中間兩軸各有一大一小齒輪'],
  predict:'若只把中間大輪換成 24 齒，共軸小輪的轉角也會改變嗎？',
  measure:'輸入 360°：四軸依序為 360°、−120°、40°、−13.333°；三層各自嚙合。',
  explain:"依參考組裝步驟 1～10：三對 12／36 齒輪、兩支中間共軸、四個共線軸心。保留齒數及節圓／軸距比例；模數 2、相鄰軸距 48 mm、定位孔距 8 mm、2 mm 孔徑為現有孔格與板材化示範。3D 分層間距沿現有板件規則；不是參考零件厚度。定位孔連接沿既有兩孔剛體規則；尚不能從空白畫布拖曳建立齒輪共軸接合。方軸鎖固、軸承、完整支承箱體、間隙、負載與實物尚未驗證。"},
 snapshot:{kind:'blocks',v:1,counter:6,projectName:"三段共軸減速",tracePoint:'MadPin3',
  comps:[gear('MadA',0,12,null,'#e74c3c'),gear('MadB',1,36,'MadA','#3498db'),
   gear('MadC',1,12,null,'#f39c12'),gear('MadD',2,36,'MadC','#27ae60'),
   gear('MadE',2,12,null,'#9b59b6'),gear('MadF',3,36,'MadE','#16a085')],params}
};
