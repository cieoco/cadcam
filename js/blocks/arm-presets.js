/** 彎桿／多臂件建立面板的純邏輯：預設角度、面板選項 → arms、整數欄位檢查。不碰 DOM。 */
import {ARM_345_DEG,ARM_HOLE_MAX,armsProblem} from './arm-blank.js';
export const PRESETS_2=[{label:'90°',angles:[90]},{label:'120°',angles:[120]},{label:'約127°（3-4-5）',angles:[ARM_345_DEG]},{label:'135°',angles:[135]},{label:'150°',angles:[150]}];
export const PRESETS_3=[{label:'T型',angles:[90,180]},{label:'Y型',angles:[120,240]},{label:'鐘形三臂',angles:[90,225]}];
export const defaultPanel=count=>count===3?{count:3,holes:[4,4,4],angles:[120,240]}:{count:2,holes:[5,3,4],angles:[90,240]};
export const panelArms=({count,holes,angles})=>Array.from({length:count},(_,k)=>({holes:holes[k],angleDeg:k?angles[k-1]:0}));
export const angleText=deg=>Math.abs(deg-ARM_345_DEG)<1e-9?'約127（3-4-5）':Number.isInteger(deg)?String(deg):String(Math.round(deg*100)/100);
/** 只收整數（打字輸入）；回傳 {ok,value} 或 {ok:false,message}。 */
export function readInteger(text,min,max,what){
 const t=String(text??'').trim(),n=Number(t);
 if(t===''||!Number.isInteger(n)||n<min||n>max)return {ok:false,message:`${what}請填${min}到${max}的整數${what.includes('夾角')?'度數；要約127°請按上方的預設按鈕':''}。`};
 return {ok:true,value:n};
}
export const readHoles=(text,k)=>readInteger(text,1,ARM_HOLE_MAX,`第${k+1}臂孔數`);
export const readAngle=(text,k)=>readInteger(text,1,359,`第${k+1}臂夾角`);
/** 畫面外框大小估計（mm），給第一次縮放視圖用。 */
export const armExtentMm=arms=>8*Math.max(...arms.map(a=>a.holes))+13;
export const panelOptions=(panel,origin)=>{const arms=panelArms(panel),e=armExtentMm(arms);return {kind:'arms',arms,lengthMm:e,heightMm:e,origin};};
export {armsProblem};
