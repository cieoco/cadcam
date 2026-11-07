const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const base=process.env.TEST_URL||'http://127.0.0.1:8024',out=process.env.OUT||'output/iq-passive-tools/corners-browser';
(async()=>{await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),results=[];
try{for(const viewport of [{width:1280,height:900},{width:390,height:844}])for(const kind of ['fork','spatula','combined']){
 const ctx=await browser.newContext({viewport,isMobile:viewport.width<500,hasTouch:viewport.width<500}),page=await ctx.newPage(),errors=[];page.setDefaultTimeout(10000);
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const state=()=>page.evaluate(async()=>{const {S}=await import('/js/blocks/state.js');return {comps:S.comps,modules:S.modules,value:S.topo.params.ForkLL,undo:S.undoStack.length};});
 try{
  await page.goto(base+'/blocks.html?example=iq-passive-'+kind);await page.getByRole('button',{name:'載入此範例',exact:true}).click();await page.waitForTimeout(200);
  const initial=await state();assert.equal(initial.comps.length,kind==='combined'?7:kind==='spatula'?5:3);
  if(kind==='combined'){
   await page.getByRole('tab',{name:'左叉臂 ═ 已安裝',exact:true}).click();await page.locator('[data-pick-component=ForkL]').first().click({position:{x:35,y:8}});
   const field=page.locator('#memberDimensionInput');if(!await field.isVisible())await page.locator('#sheetMore').click();await field.waitFor({state:'visible'});
   const before=await state();await field.fill('43.1');await field.press('Tab');await page.waitForTimeout(200);assert.equal((await state()).value,43.1);assert.equal((await state()).undo,before.undo+1);
   await page.evaluate(()=>blocks.undo());assert.equal((await state()).value,40);
   await page.locator('[data-pick-component=ForkL]').first().click({position:{x:35,y:8}});if(!await field.isVisible())await page.locator('#sheetMore').click();await field.fill('0');await field.press('Tab');await page.waitForTimeout(200);assert.equal((await state()).value,40);
   const drag=async cancel=>{const h=await page.locator('[data-dimension-handle="member-length"] circle').nth(1).boundingBox();assert.ok(h);const scale=await page.evaluate(async()=>{const V=await import('/js/blocks/view.js');return V.getScale()*document.querySelector('#stageSvg').getScreenCTM().a;});const x=h.x+h.width/2,y=h.y+h.height/2;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+8*scale,y,{steps:8});if(cancel)await page.keyboard.press('Escape');await page.mouse.up();await page.waitForTimeout(200);};
   await drag(true);assert.equal((await state()).value,40);await drag(false);assert.notEqual((await state()).value,40);await page.evaluate(()=>blocks.undo());assert.equal((await state()).value,40);
  }
  await page.evaluate(()=>blocks.saveFile());const download=page.waitForEvent('download');await page.locator('#saveProjectForm').evaluate(f=>f.requestSubmit());const path=out+'/'+kind+'-'+viewport.width+'.json';await(await download).saveAs(path);
  await page.evaluate(()=>blocks.openFile());const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'選擇作品檔',exact:true}).click();await(await chooser).setFiles(path);await page.waitForTimeout(200);
  assert.deepEqual((await state()).modules,initial.modules);assert.deepEqual((await state()).comps,initial.comps);
  await page.locator('#modeBtnBench').click();await page.locator('#view3d canvas').waitFor({state:'visible'});await page.waitForTimeout(400);await page.screenshot({path:out+'/'+kind+'-'+viewport.width+'.png'});
  assert.equal(await page.locator('#mateTree [aria-pressed]').count(),initial.modules.length);assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));results.push({viewport,kind,ok:true});
 }catch(e){results.push({viewport,kind,ok:false,error:e.stack});await page.screenshot({path:out+'/failed.png'});throw e;}
 finally{await ctx.close();await fs.writeFile(out+'/results.json',JSON.stringify(results,null,2));}
}}finally{await browser.close();}console.log(JSON.stringify(results));})().catch(e=>{console.error(e);process.exitCode=1;});
