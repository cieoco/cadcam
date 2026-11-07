const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const base=process.env.TEST_URL||'http://127.0.0.1:8023',out=process.env.OUT||'output/iq-mechanisms';
const cases=[
 {id:'continuous-roller-intake',part:'IntakeRoller',field:'diskDiameterInput',handle:'disk-diameter',prop:'diameterMm',from:40,to:48,dir:[0,-.5]},
 {id:'crank-catapult-study',part:'ThrowExtension',field:'memberDimensionInput',handle:'member-length',param:'ThrowTipLength',from:64,to:72,dir:[-24.18655473466067/64,-59.25378106135729/64]},
 {id:'guided-scissor-lift',part:'ScissorExtension',field:'memberDimensionInput',handle:'member-length',param:'ScissorExtensionLength',from:64,to:72,dir:[1,0]}
].filter(c=>!process.env.TEST_CASE||c.id===process.env.TEST_CASE);
(async()=>{
 await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),results=[];
 try{for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:360,height:640},{width:844,height:390}].filter(v=>!process.env.TEST_WIDTH||v.width===Number(process.env.TEST_WIDTH)))for(const c of cases){
  const ctx=await browser.newContext({viewport,isMobile:viewport.width<500,hasTouch:viewport.width<500}),page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());page.setDefaultTimeout(12000);
  const state=()=>page.evaluate(async c=>{const {S}=await import('/js/blocks/state.js');return {value:c.param?S.topo.params[c.param]:S.comps.find(p=>p.id===c.part)?.[c.prop],undo:S.undoStack.length,theta:S.theta,comps:S.comps};},c);
  const select=async()=>{await page.evaluate(id=>blocks.selectLink(id),c.part);await page.waitForTimeout(250);};
  const field=page.locator('#'+c.field),handle=page.locator(`[data-dimension-handle="${c.handle}"]`);
  const reveal=async()=>{if(!await field.isVisible())await page.locator('#sheetMore').click();await field.waitFor();};
  try{
   await page.goto(base+'/blocks.html?gripperPilot=1');await page.waitForFunction(()=>window.blocks);await page.evaluate(()=>blocks.openExamples());
   await page.locator(`[data-example-id="${c.id}"]`).click();await page.getByRole('button',{name:'載入此範例',exact:true}).click();await page.waitForTimeout(500);
   if(c.id==='guided-scissor-lift')assert.ok(await page.locator('#syringeControls').isVisible());else assert.equal((await page.locator('#thetaUnit').textContent()).trim(),'°');
   await select();await reveal();const before=await state();assert.equal(before.value,c.from);
   await field.fill(String(c.to));await field.press('Tab');await page.waitForTimeout(400);assert.equal((await state()).value,c.to);assert.equal((await state()).undo,before.undo+1);
   await page.evaluate(()=>blocks.undo());await select();await reveal();assert.equal((await state()).value,c.from);
   const bad=await state();await field.fill('0');await field.press('Tab');await page.waitForTimeout(300);assert.equal((await state()).value,c.from);assert.equal((await state()).undo,bad.undo);
   const drag=async cancel=>{const h=await handle.boundingBox();assert.ok(h);const scale=await page.evaluate(async()=>{const V=await import('/js/blocks/view.js');return V.getScale()*document.querySelector('#stageSvg').getScreenCTM().a;});
    const x=h.x+h.width/2,y=h.y+h.height/2;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+(c.to-c.from)*c.dir[0]*scale,y+(c.to-c.from)*c.dir[1]*scale,{steps:8});if(cancel)await page.keyboard.press('Escape');await page.mouse.up();await page.waitForTimeout(400);};
   await drag(true);assert.equal((await state()).value,c.from);const preDrag=await state();await drag(false);assert.equal((await state()).value,c.to);assert.equal((await state()).undo,preDrag.undo+1);
   await page.screenshot({path:`${out}/${c.id}-${viewport.width}.png`});
   await page.evaluate(()=>blocks.saveFile());const downloaded=page.waitForEvent('download');await page.locator('#saveProjectForm').evaluate(f=>f.requestSubmit());const file=await downloaded,path=`${out}/${c.id}-${viewport.width}.json`;await file.saveAs(path);
   await page.evaluate(()=>blocks.undo());assert.equal((await state()).value,c.from);
   await page.evaluate(()=>blocks.openFile());const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'選擇作品檔',exact:true}).click();await (await chooser).setFiles(path);await page.waitForTimeout(500);assert.equal((await state()).value,c.to);
   await page.evaluate(()=>blocks.togglePlay());await page.waitForTimeout(650);await page.evaluate(()=>blocks.togglePlay());if(c.id==='guided-scissor-lift')assert.ok((await state()).comps.find(c=>c.type==='syringe').extension>0);else assert.ok((await state()).theta>0);
   await page.evaluate(()=>blocks.toggle3D());await page.locator('#view3d canvas').waitFor();await page.waitForTimeout(500);await page.screenshot({path:`${out}/${c.id}-${viewport.width}-3d.png`});await page.evaluate(()=>blocks.toggle3D());assert.equal((await state()).value,c.to);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);results.push({viewport,example:c.id,ok:true});
  }catch(e){results.push({viewport,example:c.id,ok:false,error:e.stack});await page.screenshot({path:`${out}/${c.id}-${viewport.width}-failed.png`});throw e;}
  finally{await ctx.close();await fs.writeFile(out+'/browser-results.json',JSON.stringify(results,null,2));}
 }}finally{await browser.close();}console.log(JSON.stringify(results));
})().catch(e=>{console.error(e);process.exitCode=1;});
