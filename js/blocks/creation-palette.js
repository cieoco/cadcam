/** 展開狀態是介面偏好，不進作品、不影響求解。 */
export function createCreationPalette({cancel}) {
  const tools=document.getElementById('creationTools'),hint=document.getElementById('creationHint'),button=document.getElementById('cancelCreation');
  let focus=null,empty=null;
  button?.addEventListener('click',cancel);
  return {
    reset(){focus=null;empty=null;},
    sync({key,count,drawing}){
      if(!tools)return;
      if(focus!==key || (empty===false && count===0))tools.open=count===0;
      focus=key;empty=count===0;
      hint.textContent=count===0?'先加零件，或加入完整模組。':'點選零件可修改；需要連接或動力時，從這裡新增。';
      button.hidden=!drawing;
    }
  };
}
