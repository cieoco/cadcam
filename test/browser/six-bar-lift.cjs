const {revealExample}=require('./_example-catalog.cjs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const base=process.env.TEST_URL||'http://127.0.0.1:8023',out=process.env.OUT||'output/six-bar-lift';
(async()=>{
 await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),results=[];
 try{for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:360,height:640},{width:844,height:390}].filter(v=>!process.env.TEST_WIDTH||v.width===Number(process.env.TEST_WIDTH))){
  const ctx=await browser.newContext({viewport,isMobile:viewport.width<500,hasTouch:viewport.width<500}),page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());page.setDefaultTimeout(12000);
  // Observe the real model delivered to the renderer, without adding a production debug API.
  await page.route('**/blocks3d/viewer.js*',async route=>{const response=await route.fetch(),body=await response.text();assert.ok(body.includes('function update(model) {'));await route.fulfill({response,body:body.replace('function update(model) {','function update(model) { window.__sixModel = model;')});});
  const state=()=>page.evaluate(async()=>{const {S}=await import('/js/blocks/state.js');return {params:{...S.topo.params},undo:S.undoStack.length,comps:S.comps,theta:S.theta};});
  const select=async()=>{await page.evaluate(()=>blocks.selectLink('SixTool'));await page.waitForTimeout(250);if(await page.locator('#fusionSegment').isVisible())await page.locator('#fusionSegment').selectOption('SixTool');};
  try{
   await page.goto(base+'/blocks.html?gripperPilot=1');await page.waitForFunction(()=>window.blocks);
   await page.evaluate(()=>blocks.openExamples());
   await revealExample(page, 'six-bar-lift');await page.locator('[data-example-id="six-bar-lift"]').click();await page.getByRole('button',{name:'載入此範例',exact:true}).click();await page.waitForTimeout(600);
   assert.equal((await state()).comps.length,9);await select();
   const before=await state(),input=page.locator('#memberDimensionInput');
   if(!await input.isVisible())await page.locator('#sheetMore').click();
   await input.fill('40');await input.press('Tab');await page.waitForTimeout(500);
   assert.equal((await state()).params.SixToolLength,40);assert.equal((await state()).undo,before.undo+1);
   await page.evaluate(()=>blocks.undo());assert.equal((await state()).params.SixToolLength,32);
   await select();
   if(!await input.isVisible())await page.locator('#sheetMore').click();
   const invalidBefore=await state();await input.fill('0');await input.press('Tab');await page.waitForTimeout(300);
   assert.equal((await state()).params.SixToolLength,32);assert.equal((await state()).undo,invalidBefore.undo);
   const drag=async cancel=>{
    const h=await page.locator('[data-dimension-handle="member-length"]').boundingBox();assert.ok(h);
    const scale=await page.evaluate(async()=>{const V=await import('/js/blocks/view.js');return V.getScale()*document.querySelector('#stageSvg').getScreenCTM().a;});
    const x=h.x+h.width/2,y=h.y+h.height/2;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+8*scale,y,{steps:8});if(cancel)await page.keyboard.press('Escape');await page.mouse.up();await page.waitForTimeout(500);
   };
   await drag(true);assert.equal((await state()).params.SixToolLength,32);
   const preDrag=await state();await drag(false);assert.equal((await state()).params.SixToolLength,40);assert.equal((await state()).undo,preDrag.undo+1);
   const saved=await state();await page.screenshot({path:`${out}/${viewport.width}x${viewport.height}.png`});
   await page.evaluate(()=>blocks.saveFile());await page.locator('#saveProjectName').fill('六連桿升降臂');
   const downloaded=page.waitForEvent('download');await page.locator('#saveProjectForm').evaluate(f=>f.requestSubmit());
   const file=await downloaded,savePath=`${out}/${viewport.width}-saved.json`;await file.saveAs(savePath);
   await page.evaluate(()=>blocks.undo());assert.equal((await state()).params.SixToolLength,32);
   // Actual JSON file opening uses the app's existing file input.
   await page.evaluate(()=>blocks.openFile());const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'選擇作品檔',exact:true}).click();
   await (await chooser).setFiles(savePath);
   await page.waitForTimeout(700);assert.equal((await state()).params.SixToolLength,40);
   assert.equal((await state()).comps.filter(c=>c.barFusion).length,3);
   await page.evaluate(()=>blocks.togglePlay());await page.waitForTimeout(700);await page.evaluate(()=>blocks.togglePlay());assert.ok((await state()).theta>0);
   const before3d=await state();await page.evaluate(()=>blocks.toggle3D());await page.locator('#view3d canvas').waitFor();await page.waitForTimeout(700);
   const drive3d=await page.evaluate(()=>window.__sixModel.sticks.find(s=>s.id==='SixDrive'));
   assert.ok(Math.abs(drive3d.b.y-64*Math.sin(before3d.theta*Math.PI/180))<.001,'3D must open at the paused 2D angle');
   await page.screenshot({path:`${out}/${viewport.width}x${viewport.height}-3d.png`});await page.evaluate(()=>blocks.toggle3D());
   assert.deepEqual((await state()).params,before3d.params);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
   results.push({viewport,ok:true});
  }catch(e){results.push({viewport,ok:false,error:e.stack});await page.screenshot({path:`${out}/${viewport.width}-failed.png`});throw e;}
  finally{await ctx.close();await fs.writeFile(out+'/browser-results.json',JSON.stringify(results,null,2));}
 }}finally{await browser.close();}console.log(JSON.stringify(results));
})().catch(e=>{console.error(e);process.exitCode=1;});
