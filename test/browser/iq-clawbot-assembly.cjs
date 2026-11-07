const {revealExample}=require('./_example-catalog.cjs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const base=process.env.TEST_URL||'http://127.0.0.1:8023',out=process.env.OUT||'output/iq-clawbot-assembly';
(async()=>{
 await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),results=[];
 try{for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:360,height:640},{width:844,height:390}].filter(v=>!process.env.TEST_WIDTH||v.width===+process.env.TEST_WIDTH)){
  const ctx=await browser.newContext({viewport,isMobile:viewport.width<500,hasTouch:viewport.width<500}),page=await ctx.newPage(),errors=[];page.setDefaultTimeout(15000);
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  const state=()=>page.evaluate(async()=>{const {S}=await import('/js/blocks/state.js');return {snapshot:JSON.stringify([S.comps,S.topo.params,S.modules]),undo:S.undoStack.length,mount:S.modules.find(m=>m.id==='Grip1').mount};});
  const dialog=page.getByRole('dialog',{name:'接合預覽',exact:true}),frame=page.frameLocator('iframe[title="選面與尺寸"]');
  const open=async()=>{
   await page.evaluate(()=>blocks.benchSelect('Grip1'));await page.locator('#benchFaceWizard').click();await dialog.waitFor();
   await frame.locator('#hosts button').filter({hasText:'升降臂工具端'}).click();await frame.locator('#next').click();
   await frame.locator('#children button').filter({hasText:'機架底板'}).click();await frame.locator('#next').click();
   await frame.locator('#hostFaces button[data-value="front"]').click();await frame.locator('#next').click();
   await frame.locator('#childFaces button[data-value="bottom"]').click();await frame.locator('#next').click();
   const set=async(selector,value)=>{await frame.locator(selector).click();await frame.locator('#dimensionValue').fill(String(value));await frame.locator('#dimensionValue').press('Enter');};
   await set('#angleChip',270);await set('#mateUChip',-100);await set('#mateGapChip',0);
   await frame.locator('#bracketHoles').check();await page.waitForTimeout(500);
   assert.ok(await frame.locator('#next').isEnabled(),await frame.locator('body').innerText());
  };
  try{
   await page.goto(base+'/blocks.html?gripperPilot=1');await page.waitForFunction(()=>window.blocks);await page.evaluate(()=>blocks.openExamples());await revealExample(page, 'clawbot-lift-gripper-practice');await page.locator('[data-example-id="clawbot-lift-gripper-practice"]').click();await page.getByRole('button',{name:'載入此範例',exact:true}).click();await page.locator('#modeBtnBench').click();
   const before=await state();assert.equal(before.mount,null);await open();assert.deepEqual(await state(),before,'preview cannot change either independent mechanism');
   await page.screenshot({path:`${out}/${viewport.width}-candidate.png`});await frame.locator('#cancel').click();await dialog.waitFor({state:'hidden'});assert.deepEqual(await state(),before);
   await open();await frame.locator('#next').click();await dialog.waitFor({state:'hidden'});await page.waitForTimeout(300);const mounted=await state();assert.ok(mounted.mount?.face);assert.equal(mounted.undo,before.undo+1);assert.equal(mounted.mount.to.module,'ClawLift');assert.equal(mounted.mount.face.selection.offsetU,-100);assert.equal(mounted.mount.face.selection.rotationDeg??mounted.mount.face.selection.quarterTurns*90,270);assert.equal(mounted.mount.face.selection.brackets.enabled,true);
   await page.screenshot({path:`${out}/${viewport.width}-confirmed.png`});
   await page.evaluate(()=>blocks.saveFile());const downloaded=page.waitForEvent('download');await page.locator('#saveProjectForm').evaluate(f=>f.requestSubmit());const path=`${out}/${viewport.width}.json`;await (await downloaded).saveAs(path);
   await page.evaluate(()=>blocks.undo());assert.equal((await state()).mount,null);assert.equal((await state()).snapshot,before.snapshot);
   await page.evaluate(()=>blocks.openFile());const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'選擇作品檔',exact:true}).click();await (await chooser).setFiles(path);await page.waitForTimeout(500);assert.deepEqual((await state()).mount,JSON.parse(JSON.stringify(mounted.mount)));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);results.push({viewport,ok:true});
  }catch(e){results.push({viewport,ok:false,error:e.stack});await page.screenshot({path:`${out}/${viewport.width}-failed.png`});throw e;}
  finally{await ctx.close();await fs.writeFile(out+'/browser-results.json',JSON.stringify(results,null,2));}
 }}finally{await browser.close();}console.log(JSON.stringify(results));
})().catch(e=>{console.error(e);process.exitCode=1;});
