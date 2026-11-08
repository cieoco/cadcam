import {prepareScopedExport,resolveExportScope} from './export-scope.js';
import {fusionRoot} from '../core/bar-fusion.js';
import {downloadText} from './exporters.js';
import {FABRICATION_DEFAULTS} from './fabrication-profile.js';
import {buildNestedDxf,nestedExportSummary,nestBaseName,NEST_DEFAULTS,NEST_METHODS} from './dxf-nest.js';

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
  for(const c of available.filter(c=>!c.barFusionRoot||c.barFusion)){const item=document.createElement('option');item.value=c.id;item.textContent=`${c.name||c.id}${c.fusedWith||c.barFusion?'（聯集件）':''}`;partSelect.append(item);}
  partSelect.value=fusionRoot(available,options.selectedId)?.id||options.selectedId||'';partLabel.append(partSelect);dialog.append(partLabel);
  // DXF 才有合併排版：每個零件一份／合併一份（雷射）／合併一份（CNC）。
  const methodLabel=document.createElement('label');methodLabel.textContent='輸出方式';
  const method=document.createElement('select');method.setAttribute('aria-label','輸出方式');method.style.cssText=select.style.cssText;
  for(const [value,text] of [['parts','每個零件一份'],['laser',NEST_METHODS.laser],['cnc',NEST_METHODS.cnc]]){const option=document.createElement('option');option.value=value;option.textContent=text;method.append(option);}
  methodLabel.append(method);
  const sheet=document.createElement('div');sheet.setAttribute('role','group');sheet.setAttribute('aria-label','板材尺寸');sheet.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin:0 0 8px';
  const sizeInput=(text,value)=>{const l=document.createElement('label');l.style.cssText='flex:1;min-width:120px';l.textContent=text;const input=document.createElement('input');input.type='number';input.min='20';input.max='5000';input.step='1';input.inputMode='decimal';input.value=String(value);input.setAttribute('aria-label',text);input.style.cssText='display:block;width:100%;box-sizing:border-box;min-height:44px;font:inherit;margin-top:4px';l.append(input);sheet.append(l);return input;};
  const sheetW=sizeInput('板材長（mm）',NEST_DEFAULTS.sheetW),sheetH=sizeInput('板材寬（mm）',NEST_DEFAULTS.sheetH);
  if(format==='dxf')dialog.append(methodLabel,sheet);
  const result=document.createElement('div');result.setAttribute('aria-live','polite');dialog.append(result);
  const footer=document.createElement('div');footer.style.cssText='display:flex;gap:8px;position:sticky;bottom:-16px;background:white;padding:12px 0';
  const cancel=document.createElement('button'),confirm=document.createElement('button');
  for(const b of [cancel,confirm])b.style.cssText='min-height:44px;flex:1;font:inherit;border:1px solid #afc4d6;border-radius:8px;padding:8px;background:#f0f6fb;color:#23415a';
  cancel.textContent='取消';confirm.textContent='確認下載';footer.append(cancel,confirm);dialog.append(footer);
  const close=()=>{dialog.close();dialog.remove();};cancel.onclick=close;
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  let prepared,downloads=[];
  const paragraph=text=>{const p=document.createElement('p');p.textContent=text;result.append(p);};
  const listOf=(label,items)=>{const list=document.createElement('ul');list.setAttribute('aria-label',label);list.style.cssText='padding-left:24px;overflow-wrap:anywhere';for(const text of items){const li=document.createElement('li');li.textContent=text;list.append(li);}result.append(list);return list;};
  const render=()=>{
    prepared=null;downloads=[];result.replaceChildren();confirm.disabled=true;
    partLabel.hidden=select.value!=='selected';
    // 所選零件只輸出單片，不提供合併排版。
    for(const option of method.options)option.disabled=option.value!=='parts'&&select.value==='selected';
    if(select.value==='selected')method.value='parts';
    const nest=format==='dxf'&&method.value!=='parts';sheet.hidden=!nest;sheet.style.display=nest?'flex':'none';
    if(select.value==='selected'&&!partSelect.value){paragraph('請在上方選擇要匯出的零件。');return;}
    try {
      prepared=prepareScopedExport(source,{...options,selectedId:partSelect.value||null,scope:select.value},format);
      if(nest) {
        const cnc=source.fabrication?.cnc||{},nested=buildNestedDxf(prepared.files,{method:method.value,sheetW:sheetW.value,sheetH:sheetH.value,
          toolDiameterMm:cnc.toolDiameterMm??FABRICATION_DEFAULTS.cnc.toolDiameterMm,defaultThicknessMm:cnc.stockThicknessMm??FABRICATION_DEFAULTS.cnc.stockThicknessMm,
          baseName:nestBaseName(source,{scope:select.value,focus:options.focus})});
        downloads=[nested];
        paragraph(`${select.options[select.selectedIndex].textContent}：1 份合併檔（${nested.parts.length} 個零件）`);
        listOf('合併檔',[nested.name]);
        paragraph('合併檔內的零件：');listOf('合併檔內的零件',nested.parts);
        nestedExportSummary(nested).forEach(paragraph);
        if(select.value==='assembly')paragraph('依目前組立成員及已安裝範圍匯出，不含未加入或備用設計。');
        prepared.notices.forEach(paragraph);
        if(method.value==='cnc')(prepared.cncWarnings||[]).forEach(paragraph);
        confirm.disabled=false;return;
      }
      downloads=prepared.files;
      paragraph(`${select.options[select.selectedIndex].textContent}：${prepared.files.length} 份檔案`);
      listOf('匯出檔案',prepared.files.map(file=>file.name+(file.sourceIds?.length>1?`（聯集：${file.sourceIds.join('＋')}）`:'')));
      paragraph('每個板材零件一份檔案；聯集件合為一片。馬達等外購件不輸出。');
      if(select.value==='assembly')paragraph('依目前組立成員及已安裝範圍匯出，不含未加入或備用設計。');
      if(select.value==='selected')paragraph('只輸出所選板身；不額外加入機架。聯集件會保留完整外形。');
      // DXF 下載只呈現輸出範圍資訊；加工細節不占用下載操作畫面。
      (format==='dxf'?prepared.notices:prepared.warnings).forEach(paragraph);confirm.disabled=false;
    } catch(e){paragraph(`尚未匯出：${e.message}`);}
  };
  select.onchange=render;
  partSelect.onchange=render;
  method.onchange=render;sheetW.oninput=render;sheetH.oninput=render;
  confirm.onclick=()=>{
    if(original!==revision()){paragraph('作品或選取已變更，請取消後重新匯出。');confirm.disabled=true;return;}
    if(!prepared||!downloads.length)return;
    confirm.disabled=true;select.disabled=true;partSelect.disabled=true;method.disabled=true;sheetW.disabled=true;sheetH.disabled=true;cancel.textContent='完成';
    for(const file of downloads)downloadText(file.text,file.name,file.mime);
    paragraph('已送出下載。如果瀏覽器阻擋多檔下載，可允許多檔下載後重試，或點下方逐一下載。');
    for(const file of downloads){const button=document.createElement('button');button.textContent=`下載 ${file.name}`;button.style.cssText='display:block;min-height:44px;margin:6px 0;max-width:100%;overflow-wrap:anywhere';button.onclick=()=>downloadText(file.text,file.name,file.mime);result.append(button);}
    notify?.(`已送出 ${downloads.length} 份 ${format.toUpperCase()} 檔案下載`);
  };
  render();document.body.append(dialog);dialog.showModal();cancel.focus();
}
