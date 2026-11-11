const {revealExample}=require('./_example-catalog.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const out='output/scissor-rebuild';await fs.mkdir(out,{recursive:true});const results=[];
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:360,height:640},{width:844,height:390}].filter(v=>!process.env.TEST_WIDTH||v.width===+process.env.TEST_WIDTH)){
  const mobile=viewport.width<500,ctx=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile}),page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());page.setDefaultTimeout(12000);
  const state=()=>page.evaluate(async()=>{const{S}=await import('/js/blocks/state.js');return {comps:S.comps,params:S.topo.params,undo:S.undoStack.length};});
  const input=async(n,v)=>{await n.fill(String(v));await n.press('Tab');await page.waitForTimeout(150);};
  const ext=s=>s.comps.find(c=>c.type==='syringe').extension;
  try{
   await page.goto((process.env.TEST_URL||'http://127.0.0.1:8023')+'/blocks.html?gripperPilot=1');await page.waitForFunction(()=>window.blocks);
   await page.evaluate(()=>blocks.openExamples());await revealExample(page, 'guided-scissor-lift');await page.locator('[data-example-id="guided-scissor-lift"]').click();await page.getByRole('button',{name:'載入此範例',exact:true}).click();await page.waitForTimeout(500);
   await page.screenshot({path:`${out}/clean-${viewport.width}.png`});
   const field=page.getByRole('textbox',{name:'針筒伸出量數值（mm）',exact:true}),before=await state();
   await input(field,7.25);assert.equal(ext(await state()),7.25);assert.equal((await state()).undo,before.undo+1);
   await page.evaluate(()=>blocks.undo());assert.deepEqual(await state(),before);
   await input(field,41);assert.deepEqual(await state(),before);
   const drag=async cancel=>{
    const h=page.locator('[data-dimension-handle="syringe-stroke"] circle').nth(1);let r=await h.boundingBox();assert.ok(r);
    const bottom=await page.locator('.controls').boundingBox();
    if(bottom&&r.y+r.height/2>bottom.y-40){await page.evaluate(async dy=>{const V=await import('/js/blocks/view.js');V.panByClient(document.querySelector('#stageSvg'),0,dy);blocks.draw();},bottom.y-80-(r.y+r.height/2));r=await h.boundingBox();}
    const p={x:r.x+r.width/2,y:r.y+r.height/2},delta=await page.evaluate(async()=>{
     const{S}=await import('/js/blocks/state.js'),{solveSyringe}=await import('/js/blocks/syringe-operations.js'),{attachmentPoint}=await import('/js/core/syringe.js'),V=await import('/js/blocks/view.js');
     const c=S.comps.find(c=>c.type==='syringe'),pts=solveSyringe(S.comps,S.topo.params).points,a=attachmentPoint(c.a,S.comps,S.topo.params,pts),b=attachmentPoint(c.b,S.comps,S.topo.params,pts),L=Math.hypot(b.x-a.x,b.y-a.y),scale=V.getScale()*document.querySelector('#stageSvg').getScreenCTM().a;
     return {x:(b.x-a.x)/L*8*scale,y:-(b.y-a.y)/L*8*scale};
    }),q={x:p.x+delta.x,y:p.y+delta.y},base=await state();
    assert.ok(await page.evaluate(p=>!!document.elementFromPoint(p.x,p.y)?.closest('[data-dimension-handle]'),p),'stroke handle is reachable');
    if(mobile){const cdp=await ctx.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[q]});assert.deepEqual(await state(),base);await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});await cdp.detach();}
    else{await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(q.x,q.y,{steps:6});assert.deepEqual(await state(),base);if(cancel)await page.keyboard.press('Escape');await page.mouse.up();}
    await page.waitForTimeout(200);if(cancel)assert.deepEqual(await state(),base);
   };
   await drag(true);await drag(false);const graphical=await state();assert.equal(ext(graphical),8);assert.equal(graphical.undo,before.undo+1);
   await page.evaluate(()=>blocks.undo());await input(field,8);assert.deepEqual(await state(),graphical,'pointer and number use identical candidate');
   await input(field,20);const raised=await state();
   const rail=raised.comps.find(c=>c.movingRail),platform=raised.comps.find(c=>c.id==='ScissorPlatform');
   assert.ok(Math.abs(rail.p1.y-platform.p1.y)<.001);assert.ok(Math.abs(rail.m1.y-rail.p1.y)<.001,'moving carrier seeds follow accepted stroke');
   await page.evaluate(()=>blocks.fitView());await page.waitForTimeout(150);
   // Select the actual platform rail through the existing overlap picker.
   const box=await page.locator('[data-pick-component="ScissorTop"]').boundingBox();assert.ok(box);await page.mouse.click(box.x+box.width*.45,box.y+box.height/2);
   const overlap=page.getByRole('dialog',{name:'選取重疊物件'});if(await overlap.isVisible())await overlap.locator('[data-pick="ScissorTop"]').click();
   if(mobile&&!['half','full'].includes(await page.locator('body').getAttribute('data-sheet')))await page.locator('#sheetMore').click();
   const length=page.locator('#sliderLengthInput');await length.waitFor({state:'visible'});const railBefore=await state();
   await input(length,120);assert.deepEqual(await state(),railBefore,'cannot change rail span while supporting body keeps128mm');
   await page.locator('#sliderSettings details').evaluateAll(nodes=>nodes.forEach(n=>n.open=true));await page.waitForTimeout(100);
   const start=page.getByRole('textbox',{name:'行程起點（mm）',exact:true});await input(start,42.5);assert.equal((await state()).comps.find(c=>c.movingRail).travelStart,42.5);assert.equal((await state()).undo,railBefore.undo+1);
   await page.evaluate(()=>blocks.undo());assert.deepEqual(await state(),railBefore);
   await page.evaluate(()=>blocks.saveFile());const download=page.waitForEvent('download');await page.locator('#saveProjectForm').evaluate(f=>f.requestSubmit());const path=`${out}/stroke-${viewport.width}.json`;await(await download).saveAs(path);
   await page.evaluate(()=>blocks.openFile());const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'選擇作品檔',exact:true}).click();await(await chooser).setFiles(path);await page.waitForTimeout(400);
   assert.equal(ext(await state()),20);assert.deepEqual((await state()).comps,railBefore.comps);assert.deepEqual(errors,[]);
   await page.screenshot({path:`${out}/rail-${viewport.width}.png`});results.push({viewport,stroke:true,numeric:true,cancel:true,undo:true,railValidation:true,reopen:true});
  }catch(e){await page.screenshot({path:`${out}/failed-${viewport.width}.png`});throw e;}finally{await ctx.close();await fs.writeFile(`${out}/browser-results.json`,JSON.stringify(results,null,2));}
 }}finally{await browser.close();}console.log(results);
})().catch(e=>{console.error(e);process.exitCode=1;});
