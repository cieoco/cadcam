// HTTP 瀏覽器驗收：家族展開、能力、原載入確認／取消／復原與穩定 ID 深連結。
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const base=process.env.TEST_URL||'http://127.0.0.1:8024',out='output/example-catalog/browser';
(async()=>{
 await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),results=[];
 try{for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:360,height:640},{width:844,height:390}]){
  const mobile=viewport.width<900,ctx=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile}),page=await ctx.newPage(),errors=[];
  page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('blocks.startGallerySeen','1'));
  const state=()=>page.evaluate(async()=>{const {S}=await import('/js/blocks/state.js');return JSON.stringify({comps:S.comps,params:S.topo.params,modules:S.modules,undo:S.undoStack.length});});
  const catalog=async()=>{await page.evaluate(()=>blocks.openExamples());await page.locator('[data-example-id="unit4-start"]').waitFor({state:'attached'});};
  const pick=async(id)=>{const family=page.locator('.example-family').filter({has:page.locator(`[data-example-id="${id}"]`)});if(!await family.evaluate(el=>el.open))await family.locator('summary').click();await page.locator(`[data-example-id="${id}"]`).click();};
  try{
   await page.goto(base+'/blocks.html?example=gear-pair');await page.getByRole('button',{name:'載入此範例',exact:true}).click();
   const original=await state();await catalog();
   assert.equal(await page.locator('[data-example-id]').count(),62);
   assert.equal(await page.locator('[data-example-ref]').count(),4);
   assert.equal(await page.locator('[data-example-group="challenge"]').count(),0);
   assert.equal(await page.locator('[data-example-family="passive-tools"] summary .example-capability').textContent(),'固定組立');
   assert.equal(await page.locator('[data-example-family="wheel-grabber"] .example-capability').textContent(),'手動調姿');
   const beforeFamily=await state();
   const fork=page.locator('[data-example-family="passive-tools"]');await fork.locator('summary').click();assert.equal(await fork.locator('[data-example-id]:visible').count(),3);await fork.locator('summary').click();assert.equal(await state(),beforeFamily);
   const motion=page.locator('[data-example-family="fourbar"] summary');await motion.focus();await page.keyboard.press('Enter');assert.ok(await page.locator('[data-example-id="fourbar-missing-coupler"]').isVisible());
   await pick('fourbar-double-crank');assert.equal(await state(),original,'selection only previews load decision');await page.getByRole('button',{name:'保留目前作品',exact:true}).click();assert.equal(await state(),original);
   await pick('fourbar-double-crank');await page.getByRole('button',{name:'載入此範例',exact:true}).click();assert.notEqual(await state(),original);
   await page.evaluate(()=>blocks.undo());assert.equal(await state(),original,'one undo returns whole previous work');
   await catalog();await page.locator('[data-example-ref="wiper-single"]').click();await page.getByRole('button',{name:'保留目前作品',exact:true}).click();assert.equal(await state(),original);
   await page.locator('[data-example-id="iq-wheel-grabber"]').click();await page.getByRole('button',{name:'保留目前作品',exact:true}).click();assert.equal(await state(),original,'single-version card opens the same decision directly');
   await page.locator('[data-example-family="clawbot"] summary').click();await page.screenshot({path:`${out}/${viewport.width}-clawbot.png`});
   await page.locator('[data-example-family="passive-tools"] summary').click();await page.screenshot({path:`${out}/${viewport.width}-fork-spatula.png`});
   await page.screenshot({path:`${out}/${viewport.width}-catalog.png`});
   const bounds=await page.locator('#examplesDialog').boundingBox();assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=viewport.width+1&&bounds.y+bounds.height<=viewport.height+1);
   assert.ok(await page.locator('#exampleList').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
   await page.getByRole('button',{name:'關閉',exact:true}).filter({visible:true}).click();
   await page.goto(base+'/blocks.html?example=iq-passive-spatula');await page.getByRole('button',{name:'載入此範例',exact:true}).click();
   assert.ok(await page.evaluate(async()=>{const {S}=await import('/js/blocks/state.js');const {getExample}=await import('/js/blocks/examples.js');const {normalizeSnapshot}=await import('/js/blocks/schema.js');return JSON.stringify(S.comps)===JSON.stringify(normalizeSnapshot(getExample('iq-passive-spatula').snapshot).comps);}),'existing deep URL resolves its unchanged snapshot');
   assert.deepEqual(errors,[]);results.push({viewport,entries:62,families:true,keyboard:true,cancel:true,undo:true,deepLink:true,overflow:false});
  }catch(e){results.push({viewport,error:e.stack});await page.screenshot({path:`${out}/${viewport.width}-failed.png`});throw e;}
  finally{await ctx.close();await fs.writeFile(out+'/results.json',JSON.stringify(results,null,2));}
 }}finally{await browser.close();}console.log(results);
})().catch(e=>{console.error(e);process.exitCode=1;});
