const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const output=process.env.TEST_OUTPUT||'output/dual-edit';await fs.mkdir(output,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),results=[];
 const p=(id,x,type='fixed')=>({id,x,y:0,type});
 try{for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:360,height:640},{width:844,height:390}].filter(v=>!process.env.TEST_WIDTH||v.width===Number(process.env.TEST_WIDTH))){
  const mobile=viewport.width<500,context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());page.setDefaultTimeout(12000);
  const snap={kind:'blocks',v:1,counter:1,comps:[{type:'slider',id:'Track',color:'#16a085',lenParam:'L',p1:p('A',20),p2:p('B',120),p3:p('C',70,'floating'),m1:p('M',0),m2:p('N',200),carrierLen:200,carriageLen:32,railOffset:20,travelStart:10,travelEnd:90,baseEnd:'p1'}],params:{theta:0,L:100}};
  await page.goto((process.env.TEST_URL||'http://127.0.0.1:8021')+'/blocks.html#m='+Buffer.from(JSON.stringify(snap)).toString('base64url'));await page.waitForFunction(()=>window.blocks);await page.waitForTimeout(500);await page.evaluate(()=>history.replaceState(null,'',location.pathname));
  const state=()=>page.evaluate(async()=>{const {S}=await import('/js/blocks/state.js');return {comp:S.comps.find(c=>c.id==='Track'),params:S.topo.params,undo:S.undoStack.length};});
  const select=async()=>{const box=await page.locator('[data-pick-component=Track]').boundingBox();await page.mouse.click(box.x+box.width*.3,box.y+box.height/2);const overlap=page.getByRole('dialog',{name:'選取重疊物件'});if(await overlap.isVisible())await overlap.locator('[data-pick="Track"]').click();if(mobile&&!['half','full'].includes(await page.locator('body').getAttribute('data-sheet')))await page.locator('#sheetMore').click();};
  await select();assert.equal(await page.locator('#lenEditor input[type=range]').count(),0);
  await page.screenshot({path:output+'/slider-'+viewport.width+'-selected.png'});await page.locator('#sliderMountSettings summary').click().catch(async e=>{console.log(viewport,await page.evaluate(async()=>{const{S}=await import('/js/blocks/state.js');return {node:S.selectedNodeId,slider:S.selectedSliderId,body:document.body.dataset,editor:document.querySelector('#lenEditor').outerHTML.slice(0,1000)}}));throw e;});
  const body=page.getByRole('textbox',{name:'滑塊長度（mm）',exact:true});await body.waitFor({state:'visible'});
  for(const [key,label,next,prop]of [['body','滑塊長度',40.5,'carriageLen'],['carrier','底座長度',220.5,'carrierLen'],['offset','軌道偏移',30.5,'railOffset']]){
   const field=page.getByRole('textbox',{name:label+'（mm）',exact:true}),before=await state();
   await field.fill(String(next));await field.press('Tab');const numeric=await state();assert.equal(numeric.comp[prop],next);assert.equal(numeric.undo,before.undo+1);
   await page.evaluate(()=>window.blocks.undo());await select();await page.locator('#sliderMountSettings').evaluate(e=>{e.open=true;});await page.waitForTimeout(120);
   const handle=page.locator('[data-dimension-handle='+key+']');await handle.waitFor({state:'visible'});await handle.focus();
   const value=(await state()).comp[prop];await page.keyboard.press('ArrowRight');assert.equal((await state()).comp[prop],value+1);assert.equal((await state()).undo,before.undo+1);
   await page.evaluate(()=>window.blocks.undo());await select();await page.locator('#sliderMountSettings').evaluate(e=>{e.open=true;});await page.waitForTimeout(120);
  }
  await body.fill('32.5');await body.press('Tab');
  // Drag and numeric input give the same stored model, including the normalized rail endpoints.
  const handle=page.locator('[data-dimension-handle=body]');await handle.waitFor({state:'visible'});await handle.scrollIntoViewIfNeeded();
  const hit=await handle.locator('circle').first().boundingBox(),before=await state(),x=hit.x+hit.width/2,y=hit.y+hit.height/2;
  assert.ok(hit.width>=43.9);await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+18,y,{steps:4});assert.deepEqual(await state(),before);await page.keyboard.press('Escape');await page.mouse.up();assert.deepEqual(await state(),before);
  if(mobile){const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+18,y}]});assert.deepEqual(await state(),before);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
  else{await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+18,y,{steps:4});assert.deepEqual(await state(),before);await page.mouse.up();}
  const dragged=await state();assert.ok(Number.isInteger(dragged.comp.carriageLen));assert.notEqual(dragged.comp.carriageLen,before.comp.carriageLen);assert.equal(dragged.undo,before.undo+1);
  await page.evaluate(()=>window.blocks.undo());await select();await page.locator('#sliderMountSettings').evaluate(e=>{e.open=true;});await page.waitForTimeout(120);
  await body.fill(String(dragged.comp.carriageLen));await body.press('Tab');assert.deepEqual(await state(),dragged);
  await page.screenshot({path:`${output}/slider-${viewport.width}.png`});
  await body.fill('35.5');await body.press('Tab');
  const rail=page.getByRole('spinbutton',{name:'可滑動長度',exact:true});await rail.fill('80.5');await rail.press('Tab');
  const precise=await state();assert.equal(precise.params.L,80.5);assert.equal(precise.comp.carriageLen,35.5);
  await page.waitForTimeout(1100);await page.reload();await page.waitForFunction(()=>window.blocks);assert.deepEqual((await state()).comp,precise.comp);assert.equal((await state()).params.L,80.5);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);results.push({viewport,dimensions:3,drag:true,numericParity:true,cancel:true,undo:true,reopen:true});await context.close();
 }}finally{await browser.close();}
 await fs.writeFile(`${output}/slider-results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));
})().catch(e=>{console.error(e);process.exitCode=1;});
