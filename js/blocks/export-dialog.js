import {prepareScopedExport,resolveExportScope} from './export-scope.js';
import {downloadText} from './exporters.js';

export function openScopedExport({readSource,readOptions,format,notify}) {
  const source=structuredClone(readSource()),options={...readOptions()};
  const revision=()=>JSON.stringify([readSource(),readOptions()]);
  const original=revision();
  let available=[];
  try{available=resolveExportScope(source,{...options,scope:options.mode==='design'?'design':'assembly'}).targets.filter(c=>['bar','triangle','gear','rack','syringe'].includes(c.type));}catch{}
  const dialog=document.createElement('dialog');dialog.setAttribute('aria-label','匯出範圍與零件清單');
  dialog.style.cssText='width:min(480px,calc(100vw - 24px));max-height:85dvh;overflow:auto;border:1px solid #afc4d6;border-radius:14px;padding:16px;color:#23415a';
  const title=document.createElement('h2');title.style.cssText='font-size:19px;margin:0 0 12px';title.textContent=`匯出 ${format.toUpperCase()}`;dialog.append(title);
  const label=document.createElement('label');label.textContent='匯出範圍';
  const select=document.createElement('select');select.setAttribute('aria-label','匯出範圍');select.style.cssText='display:block;width:100%;min-height:44px;font:inherit;margin:8px 0';
  for(const [value,text] of [['design','目前設計'],['selected','所選零件'],['assembly','目前組立']]){
    const option=document.createElement('option');option.value=value;option.textContent=text;
    option.disabled=(value==='design'&&options.mode!=='design')||(value==='selected'&&!available.length);
    select.append(option);
  }
  select.value=options.mode==='design'?'design':'assembly';label.append(select);dialog.append(label);
  const partLabel=document.createElement('label');partLabel.textContent='選擇零件';
  const partSelect=document.createElement('select');partSelect.setAttribute('aria-label','選擇匯出的零件');partSelect.style.cssText=select.style.cssText;
  const empty=document.createElement('option');empty.value='';empty.textContent='請選擇零件';partSelect.append(empty);
  for(const c of available){const item=document.createElement('option');item.value=c.id;item.textContent=`${c.name||c.id}${c.fusedWith?'（聯集件）':''}`;partSelect.append(item);}
  partSelect.value=options.selectedId||'';partLabel.append(partSelect);dialog.append(partLabel);
  const result=document.createElement('div');result.setAttribute('aria-live','polite');dialog.append(result);
  const footer=document.createElement('div');footer.style.cssText='display:flex;gap:8px;position:sticky;bottom:-16px;background:white;padding:12px 0';
  const cancel=document.createElement('button'),confirm=document.createElement('button');
  for(const b of [cancel,confirm])b.style.cssText='min-height:44px;flex:1;font:inherit;border:1px solid #afc4d6;border-radius:8px;padding:8px;background:#f0f6fb;color:#23415a';
  cancel.textContent='取消';confirm.textContent='確認下載';footer.append(cancel,confirm);dialog.append(footer);
  const close=()=>{dialog.close();dialog.remove();};cancel.onclick=close;
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  let prepared;
  const paragraph=text=>{const p=document.createElement('p');p.textContent=text;result.append(p);};
  const render=()=>{
    prepared=null;result.replaceChildren();confirm.disabled=true;
    partLabel.hidden=select.value!=='selected';
    if(select.value==='selected'&&!partSelect.value){paragraph('請在上方選擇要匯出的零件。');return;}
    try {
      prepared=prepareScopedExport(source,{...options,selectedId:partSelect.value||null,scope:select.value},format);
      paragraph(`${select.options[select.selectedIndex].textContent}：${prepared.files.length} 份檔案`);
      const list=document.createElement('ul');list.style.cssText='padding-left:24px;overflow-wrap:anywhere';
      for(const file of prepared.files){const li=document.createElement('li');li.textContent=file.name+(file.sourceIds?.length>1?`（聯集：${file.sourceIds.join('＋')}）`:'');list.append(li);}result.append(list);
      paragraph('每個板材零件一份檔案；聯集件合為一片。馬達等外購件不輸出。');
      if(select.value==='assembly')paragraph('依目前組立成員及已安裝範圍匯出，不含未加入或備用設計。');
      if(select.value==='selected')paragraph('只輸出所選板身；不額外加入機架。聯集件會保留完整外形。');
      prepared.warnings.forEach(paragraph);confirm.disabled=false;
    } catch(e){paragraph(`尚未匯出：${e.message}`);}
  };
  select.onchange=render;
  partSelect.onchange=render;
  confirm.onclick=()=>{
    if(original!==revision()){paragraph('作品或選取已變更，請取消後重新匯出。');confirm.disabled=true;return;}
    if(!prepared)return;
    confirm.disabled=true;select.disabled=true;partSelect.disabled=true;cancel.textContent='完成';
    for(const file of prepared.files)downloadText(file.text,file.name,file.mime);
    paragraph('已送出下載。如果瀏覽器阻擋多檔下載，可允許多檔下載後重試，或點下方逐一下載。');
    for(const file of prepared.files){const button=document.createElement('button');button.textContent=`下載 ${file.name}`;button.style.cssText='display:block;min-height:44px;margin:6px 0;max-width:100%;overflow-wrap:anywhere';button.onclick=()=>downloadText(file.text,file.name,file.mime);result.append(button);}
    notify?.(`已送出 ${prepared.files.length} 份 ${format.toUpperCase()} 檔案下載`);
  };
  render();document.body.append(dialog);dialog.showModal();cancel.focus();
}
