const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const output='output/fusion-hydraulic/browser';await fs.mkdir(output,{recursive:true});
 const fixture=JSON.parse(await fs.readFile('test/fixtures/fusion-hydraulic-stale.json','utf8'));
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),results=[];
 try{for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:360,height:640},{width:844,height:390}]){
  const mobile=viewport.width<500,context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto('http://127.0.0.1:8021/blocks.html#m='+Buffer.from(JSON.stringify(fixture)).toString('base64url'));await page.waitForFunction(()=>window.blocks);await page.waitForTimeout(400);await page.evaluate(()=>history.replaceState(null,'',location.pathname));
  const state=()=>page.evaluate(async()=>{const {S}=await import('/js/blocks/state.js');return {comps:S.comps,params:S.topo.params,undo:S.undoStack.length};});
  const original=await state();
  const open=async()=>{
   // Landscape setup uses the existing selection action; dialog actions remain real clicks.
   if(viewport.width===844)await page.evaluate(()=>window.blocks.selectLink('Link11'));
   else{
    const part=page.locator('[data-pick-component="Link11"]').first();await part.waitFor({state:'visible'});const box=await part.boundingBox();
    if(mobile)await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);else await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
    const overlap=page.getByRole('dialog',{name:'選取重疊物件'});if(await overlap.isVisible())await overlap.locator('[data-pick="Link11"]').click();
   }
   if(mobile&&!['half','full'].includes(await page.locator('body').getAttribute('data-sheet')))await page.locator('#sheetMore').click();
   if(await page.locator('#memberOperations').isHidden())await page.getByRole('button',{name:'其他零件操作',exact:true}).click({timeout:4000}).catch(async e=>{await page.screenshot({path:output+'/'+viewport.width+'-failure.png'});console.log(await page.evaluate(async()=>{const{S}=await import('/js/blocks/state.js');return {link:S.selectedLinkId,node:S.selectedNodeId,body:document.body.dataset};}));throw e;});
   await page.getByRole('button',{name:'合成一片…',exact:true}).click();
   const dialog=page.getByRole('dialog',{name:'連桿合成一片'});await dialog.getByRole('button',{name:'H1Arm',exact:true}).click();return dialog;
  };
  let dialog=await open();await page.screenshot({path:`${output}/${viewport.width}-preview.png`});
  assert.equal(await dialog.getByRole('button',{name:'確認合成',exact:true}).isEnabled(),true);assert.match(await dialog.getByRole('status').innerText(),/已對齊/);assert.deepEqual(await state(),original);
  await dialog.getByRole('button',{name:'取消',exact:true}).click();assert.deepEqual(await state(),original);
  dialog=await open();await dialog.getByRole('button',{name:'確認合成',exact:true}).click();await dialog.waitFor({state:'detached'});
  const fused=await state();assert.equal(fused.undo,original.undo+1);assert.deepEqual(fused.params,original.params);
  const root=fused.comps.find(c=>c.barFusion);assert.ok(root);assert.equal(root.barFusion.members.length,2);
  await page.screenshot({path:`${output}/${viewport.width}-fused.png`});
  await page.evaluate(()=>window.blocks.undo());assert.deepEqual(await state(),original);
  dialog=await open();await dialog.getByRole('button',{name:'確認合成',exact:true}).click();
  const range=page.getByRole('slider',{name:'針筒伸出量 mm',exact:true});
  for(const mm of [0,10,20]){await range.fill(String(mm));await range.dispatchEvent('input');const s=await state();assert.equal(s.comps.find(c=>c.type==='syringe').extension,mm);assert.match(await page.locator('#mechanismStatus').innerText(),/幾何可行/);}
  const saved=await state();await page.waitForTimeout(1100);await page.reload();await page.waitForFunction(()=>window.blocks);assert.deepEqual((await state()).comps,saved.comps);assert.deepEqual((await state()).params,saved.params);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);results.push({viewport,cancel:true,confirm:true,undo:true,stroke:[0,10,20],reopen:true});await context.close();
 }}finally{await browser.close();}
 await fs.writeFile(output+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
})().catch(e=>{console.error(e);process.exitCode=1;});
