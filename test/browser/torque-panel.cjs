// 扭力面板瀏覽器驗收（尚未在本機跑過，沿用 six-bar-lift.cjs 的寫法）：桌機與手機寬度各跑一次。
// 用法：TEST_URL=http://127.0.0.1:8023 node test/browser/torque-panel.cjs
const {revealExample}=require('./_example-catalog.cjs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const base=process.env.TEST_URL||'http://127.0.0.1:8023';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
  const ctx=await browser.newContext({viewport,isMobile:viewport.width<500,hasTouch:viewport.width<500}),page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
  const state=()=>page.evaluate(async()=>{const {S}=await import('/js/blocks/state.js');return {theta:S.theta,loads:S.topo.loads||[],gravity:S.topo.gravity||'vertical',undo:S.undoStack.length,sel:S.selectedNodeId};});
  await page.goto(base+'/blocks.html');await page.waitForFunction(()=>window.blocks);
  await page.evaluate(()=>blocks.openExamples());
  await revealExample(page,'six-bar-lift');await page.locator('[data-example-id="six-bar-lift"]').click();await page.getByRole('button',{name:'載入此範例',exact:true}).click();await page.waitForTimeout(600);
  if(viewport.width<500)await page.evaluate(()=>blocks.setMobilePanel('view'));
  await page.getByRole('button',{name:/扭力/}).first().click();
  const panel=page.locator('#torquePanel');await panel.waitFor();
  await page.locator('#torquePanel .tq-sum').waitFor();
  assert.match(await panel.locator('.tq-sum').innerText(),/最大需求 .* kgf·cm @ .*使用率/);
  assert.ok(await panel.locator('svg path').count()>=1,'曲線有畫出');
  const box=await panel.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=viewport.width+1&&box.y>=0&&box.y+box.height<=viewport.height+1,'面板在視窗內');
  const before=await state();
  await panel.getByRole('button',{name:'顯示最吃力姿態'}).click();
  const after=await state();assert.ok(after.sel,'已選取馬達軸');
  await panel.getByRole('button',{name:/新增負載/}).click();
  await panel.locator('[data-k=massG]').fill('30');await panel.getByRole('button',{name:'儲存'}).click();await page.waitForTimeout(500);
  const st=await state();assert.equal(st.loads.length,1);assert.equal(st.undo,before.undo+1);
  await panel.locator('input[value=flat]').check();await page.waitForTimeout(300);assert.equal((await state()).gravity,'flat');
  await page.evaluate(()=>blocks.undo());assert.equal((await state()).gravity,'vertical');
  await panel.getByRole('button',{name:'關閉'}).click();assert.equal(await page.locator('#torquePanel').count(),0);
  assert.deepEqual(errors,[]);await ctx.close();console.log('PASS torque-panel',viewport.width);
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
