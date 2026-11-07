const {revealExample}=require('./_example-catalog.cjs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const base=process.env.TEST_URL||'http://127.0.0.1:8023',out=process.env.OUT||'output/iq-clawbot';
(async()=>{
 await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),results=[];
 try{for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:360,height:640},{width:844,height:390}].filter(v=>!process.env.TEST_WIDTH||v.width===+process.env.TEST_WIDTH))for(const id of ['clawbot-geared-lift','clawbot-lift-gripper'].filter(id=>!process.env.TEST_CASE||process.env.TEST_CASE===id)){
  const ctx=await browser.newContext({viewport,isMobile:viewport.width<500,hasTouch:viewport.width<500}),page=await ctx.newPage(),errors=[];page.setDefaultTimeout(15000);
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  const state=()=>page.evaluate(async()=>{const {S}=await import('/js/blocks/state.js');return {value:S.topo.params.ClawLiftExtensionLength,undo:S.undoStack.length,theta:S.theta,motors:S.motorAngles,active:S.activeMotor,comps:S.comps,modules:S.modules};});
  const select=async()=>{await page.evaluate(()=>blocks.selectLink('ClawLiftExtension'));await page.waitForTimeout(200);if(await page.locator('#fusionSegment').isVisible())await page.locator('#fusionSegment').selectOption('ClawLiftExtension');};
  const field=page.locator('#memberDimensionInput'),reveal=async()=>{if(!await field.isVisible())await page.locator('#sheetMore').click();};
  try{
   await page.goto(base+'/blocks.html?gripperPilot=1');await page.waitForFunction(()=>window.blocks);await page.evaluate(()=>blocks.openExamples());
   await revealExample(page, id);await page.locator(`[data-example-id="${id}"]`).click();await page.getByRole('button',{name:'載入此範例',exact:true}).click();await page.waitForTimeout(500);
   await select();await reveal();const before=await state();assert.equal(before.value,136);
   await field.fill('144.5');await field.press('Tab');await page.waitForTimeout(400);assert.equal((await state()).value,144.5);assert.equal((await state()).undo,before.undo+1);
   await page.evaluate(()=>blocks.undo());await select();await reveal();assert.equal((await state()).value,136);
   const bad=await state();await field.fill('0');await field.press('Tab');await page.waitForTimeout(200);assert.equal((await state()).value,136);assert.equal((await state()).undo,bad.undo);
   const drag=async cancel=>{const h=await page.locator('[data-dimension-handle="member-length"]').boundingBox();assert.ok(h);
    const scale=await page.evaluate(async()=>{const V=await import('/js/blocks/view.js');return V.getScale()*document.querySelector('#stageSvg').getScreenCTM().a;});
    const x=h.x+h.width/2,y=h.y+h.height/2;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+8*scale,y,{steps:8});
    assert.equal((await state()).value,136,'drag preview must not change the saved work');if(cancel)await page.keyboard.press('Escape');await page.mouse.up();await page.waitForTimeout(300);};
   await drag(true);assert.equal((await state()).value,136);const preDrag=await state();await drag(false);assert.equal((await state()).value,144);assert.equal((await state()).undo,preDrag.undo+1);
   await page.screenshot({path:`${out}/${id}-${viewport.width}-edit.png`});
   await page.evaluate(()=>blocks.saveFile());const downloaded=page.waitForEvent('download');await page.locator('#saveProjectForm').evaluate(f=>f.requestSubmit());const file=await downloaded,path=`${out}/${id}-${viewport.width}.json`;await file.saveAs(path);
   await page.evaluate(()=>blocks.undo());assert.equal((await state()).value,136);await page.evaluate(()=>blocks.openFile());const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'選擇作品檔',exact:true}).click();await (await chooser).setFiles(path);await page.waitForTimeout(500);assert.equal((await state()).value,144);
   if(id==='clawbot-lift-gripper'){
    await page.locator('#modeBtnBench').click();await page.getByRole('button',{name:'M1',exact:true}).click();
    await page.locator('#playBtn').click();await page.waitForTimeout(500);await page.locator('#playBtn').click();const lift=await state();assert.ok(lift.theta<0);assert.equal(lift.active,'1');
    await page.getByRole('button',{name:'M2',exact:true}).click();await page.locator('#playBtn').click();await page.waitForTimeout(500);await page.locator('#playBtn').click();const grip=await state();assert.ok(grip.theta>0);assert.equal(grip.active,'2');assert.equal(grip.motors['1'],lift.theta,'claw control preserves the lift angle');
   }else{
    await page.locator('#playBtn').click();await page.waitForTimeout(500);await page.locator('#playBtn').click();assert.ok((await state()).theta<0);
    await page.evaluate(()=>blocks.toggle3D());await page.locator('#view3d canvas').waitFor({state:'visible'});
   }
   await page.waitForTimeout(400);await page.screenshot({path:`${out}/${id}-${viewport.width}-3d.png`});
   assert.equal((await state()).value,144);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);results.push({viewport,example:id,ok:true});
  }catch(e){results.push({viewport,example:id,ok:false,error:e.stack});await page.screenshot({path:`${out}/${id}-${viewport.width}-failed.png`});throw e;}
  finally{await ctx.close();await fs.writeFile(out+'/browser-results.json',JSON.stringify(results,null,2));}
 }}finally{await browser.close();}console.log(JSON.stringify(results));
})().catch(e=>{console.error(e);process.exitCode=1;});
