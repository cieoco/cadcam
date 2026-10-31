// 手機工作區保護：下方抽屜三段式（收合／半開／全開）、訊息走頂端訊息帶且點擊穿透、置中只用看得到的區域。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SHEET_STATES,nextSheetState,visibleWorkRect,messagePlacement} from '../js/blocks/mobile-workspace.js';
let pass=0;const ok=(c,m)=>{assert.ok(c,m);pass++;console.log('PASS',m);};
ok(JSON.stringify(SHEET_STATES)===JSON.stringify(['collapsed','half','full']),'抽屜三段：收合、半開、全開');
// ---------- 狀態轉換 ----------
const t=(s,e)=>nextSheetState(s,e);
ok(t('half','canvasTap')==='collapsed'&&t('full','canvasTap')==='collapsed','點工作區空白處：抽屜收合');
ok(t('half','canvasDragStart')==='collapsed'&&t('full','pinchStart')==='collapsed','開始拖曳或縮放：抽屜收合');
ok(t('collapsed','selectPart')==='collapsed','選取零件：維持收合，只顯示一行精簡列（不自動撐開）');
ok(t('collapsed','expand')==='half'&&t('half','expand')==='full'&&t('full','expand')==='full','點精簡列／往上拉：逐段展開');
ok(t('full','shrink')==='half'&&t('half','shrink')==='collapsed'&&t('collapsed','shrink')==='collapsed','往下拉：逐段收合');
ok(t('collapsed','openTab')==='half','點下方分頁（新增／調整／視圖／專案）：半開');
ok(t('half','unknown')==='half','不認得的事件不改狀態');
// ---------- 看得到的工作區 ----------
{
  const r=visibleWorkRect({width:390,height:844},{top:100,sheet:120,playBar:56});
  ok(r.x===0&&r.y===100&&r.width===390&&r.height===844-100-120-56,'看得到的區域＝扣掉頂端、抽屜與播放列');
  const r2=visibleWorkRect({width:360,height:640},{top:90,sheet:300,playBar:56});
  ok(r2.height>0&&r2.height===640-90-300-56,'小手機也正確');
  ok(visibleWorkRect({width:360,height:640},{top:90,sheet:600,playBar:56}).height===0,'被完全遮住時高度為 0（不為負）');
}
// ---------- 訊息位置 ----------
{
  for(const kind of ['info','success','loaded','warn']){const p=messagePlacement(kind);
    if(p.lane!=='top'||p.passThrough!==true||!(p.ttlMs>=1500&&p.ttlMs<=6000))assert.fail(`${kind} 應在頂端訊息帶、點擊穿透、幾秒後消失`);}
  ok(true,'一般訊息（提示、成功、已載入、警告）在頂端訊息帶、點擊穿透、自動消失');
  const e=messagePlacement('error');
  ok(e.lane==='status'&&e.passThrough===true,'錯誤訊息留在狀態提示，點了才展開，不擋工作區');
  const c=messagePlacement('confirm');
  ok(c.lane==='dialog'&&c.passThrough===false,'只有要確認的（清空、替換作品）才用對話框');
}
// ---------- 樣式與接線 ----------
{
  const css=readFileSync(new URL('../js/blocks/workspace-mobile.css',import.meta.url),'utf8');
  ok(/data-sheet=["']?collapsed/.test(css)&&/data-sheet=["']?half/.test(css)&&/data-sheet=["']?full/.test(css),'手機樣式有三段抽屜高度');
  ok(/pointer-events:\s*none/.test(css),'訊息帶設定點擊穿透');
  const app=readFileSync(new URL('../js/blocks/app.js',import.meta.url),'utf8');
  ok(/visibleWorkRect\(/.test(app)||/mobile-workspace/.test(app),'置中與載入範例時使用看得到的區域');
}
console.log(`mobile-workspace: ${pass} passed`);
