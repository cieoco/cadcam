/** 作品名同時可用於 JSON 檔名與既有分享白名單。 */
export function normalizeProjectName(value){
  if(typeof value!=='string')return '';
  let name=value.trim().replace(/\.json$/i,'').replace(/[\\/:*?"<>|'`\u0000-\u001f\u007f]/g,'_').slice(0,40).replace(/[.\s]+$/g,'').trim();
  if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))name='_'+name;
  return name;
}
