// 扭力面板瀏覽器驗收（沿用 six-bar-lift.cjs 的寫法）：桌機與手機寬度各跑一次。
// 用法：TEST_URL=http://127.0.0.1:8023 [SHOT_DIR=output/shots] node test/browser/torque-panel.cjs
// 涵蓋：新增負載的預設接點不是固定點（A1）、手機開面板時下方抽屜收合且面板可捲動、關閉鈕可按（A3）、速度與電流區塊（B2）。
const {revealExample}=require('./_example-catalog.cjs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const base=process.env.TEST_URL||'http://127.0.0.1:8023',shotDir=process.env.SHOT_DIR||'';
const fs=require('node:fs');if(shotDir)fs.mkdirSync(shotDir,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
  const ctx=await browser.newContext({viewport,isMobile:viewport.width<500,hasTouch:viewport.width<500}),page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
  const shot=name=>shotDir?page.screenshot({path:`${shotDir}/torque-${viewport.width}-${name}.png`}):null;
  await page.addInitScript(()=>{try{localStorage.setItem('blocks.startGallerySeen','1');}catch(_){}});   // 不要自動跳出開始畫面
  const state=()=>page.evaluate(async()=>{const {S}=await import('/js/blocks/state.js');return {theta:S.theta,loads:S.topo.loads||[],gravity:S.topo.gravity||'vertical',undo:S.undoStack.length,sel:S.selectedNodeId};});
  await page.goto(base+'/blocks.html');await page.waitForFunction(()=>window.blocks);
  if(await page.locator('#startGalleryDialog[open], dialog[open]').count())await page.keyboard.press('Escape');   // 保險：開始畫面若仍開著就關掉
  await page.evaluate(()=>blocks.openExamples());
  await revealExample(page,'six-bar-lift');await page.locator('[data-example-id="six-bar-lift"]').click();await page.getByRole('button',{name:'載入此範例',exact:true}).click();await page.waitForTimeout(600);
  if(viewport.width<500){await page.evaluate(()=>blocks.setMobilePanel('view'));
   if(await page.evaluate(()=>document.body.dataset.sheet||'collapsed')==='collapsed')await page.locator('#sheetMore').click();   // 展開抽屜才看得到扭力鈕
   await page.waitForFunction(()=>document.body.dataset.sheet&&document.body.dataset.sheet!=='collapsed');}
  await page.locator('button:visible',{hasText:'扭力'}).first().click();
  const panel=page.locator('#torquePanel');await panel.waitFor();
  await page.locator('#torquePanel .tq-sum').waitFor();
  assert.match(await panel.locator('.tq-sum').innerText(),/最大需求 .* kgf·cm @ .*使用率/);
  const speed=await panel.locator('.tq-speed').innerText();assert.match(speed,/行程時間/);assert.match(speed,/峰值電流/);   // B2
  if(viewport.width<500){   // A3：手機開面板後抽屜收合，面板在視窗內且能捲到底，關閉鈕不被捲走
   assert.equal(await page.evaluate(()=>document.body.dataset.sheet||'collapsed'),'collapsed','手機開面板時抽屜收合');
   const sc=await panel.evaluate(el=>({sh:el.scrollHeight,ch:el.clientHeight}));
   await panel.evaluate(el=>{el.scrollTop=el.scrollHeight;});
   const cb=await panel.locator('button.tq-close').boundingBox(),pb=await panel.boundingBox();
   assert.ok(cb&&cb.y>=pb.y-1&&cb.y+cb.height<=pb.y+pb.height+1,'捲到底時關閉鈕仍在面板內可按（'+JSON.stringify(sc)+'）');
   await panel.evaluate(el=>{el.scrollTop=0;});}
  await shot('panel');
  assert.ok(await panel.locator('svg path').count()>=1,'曲線有畫出');
  const box=await panel.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=viewport.width+1&&box.y>=0&&box.y+box.height<=viewport.height+1,'面板在視窗內');
  const before=await state();
  await panel.getByRole('button',{name:'顯示最吃力姿態'}).click();
  const after=await state();assert.ok(after.sel,'已選取馬達軸');
  await panel.getByRole('button',{name:/新增負載/}).click();
  const defPoint=await panel.locator('[data-k=pointId] option:checked').innerText();assert.ok(!/固定/.test(defPoint),'預設接點不是固定點：'+defPoint);   // A1
  const defId=await panel.locator('[data-k=pointId]').inputValue(),isGround=await page.evaluate(async id=>{const {S}=await import('/js/blocks/state.js');return S.comps.some(c=>['p1','p2','p3'].some(k=>c[k]?.id===id&&(c[k].type==='fixed'||c[k].type==='motor')));},defId);
  assert.equal(isGround,false,'預設接點不是機架或馬達軸');
  await shot('add-load');
  await panel.locator('[data-k=massG]').fill('30');await panel.getByRole('button',{name:'儲存'}).click();await page.waitForTimeout(500);
  const st=await state();assert.equal(st.loads.length,1);assert.equal(st.loads[0].at.pointId,defId,'負載掛在預設接點');
  await shot('after-load');assert.equal(st.undo,before.undo+1);
  await panel.locator('input[value=flat]').check();await page.waitForTimeout(300);assert.equal((await state()).gravity,'flat');
  await page.evaluate(()=>blocks.undo());assert.equal((await state()).gravity,'vertical');
  await panel.getByRole('button',{name:'關閉'}).click();assert.equal(await page.locator('#torquePanel').count(),0);
  assert.deepEqual(errors,[]);await ctx.close();console.log('PASS torque-panel',viewport.width);
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
