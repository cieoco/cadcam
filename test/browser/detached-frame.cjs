const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const out='output/detached-frame';await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),results=[];
 try{for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:360,height:640},{width:844,height:390}].filter(v=>!process.env.TEST_WIDTH||v.width===+process.env.TEST_WIDTH)){
  console.log(viewport);const mobile=viewport.width<500,context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile}),page=await context.newPage(),errors=[];let accept=true;
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>accept?d.accept():d.dismiss());
  await page.goto('http://127.0.0.1:8021/blocks.html?gripperPilot=1');await page.waitForFunction(()=>window.blocks,{},{timeout:45000});
  await page.evaluate(()=>blocks.loadExample('hydraulic-h01'));const start=page.getByRole('button',{name:'開始設計',exact:true});if(await start.isVisible())await start.click();
  const state=()=>page.evaluate(()=>blocks.gripperPilot.snapshot());
  const original=await state(),syringe=original.comps.find(c=>c.type==='syringe'),host=original.comps.find(c=>c.id===syringe.b.componentId);
  await page.screenshot({path:out+'/'+viewport.width+'-before.png'});
  await page.evaluate(async id=>{blocks.selectLink(id);await blocks.deleteSelectedPart();},host.id);
  await page.locator('[data-detached-end="b"]').waitFor();const detached=await state();assert.equal(detached.comps.length,original.comps.length-1);assert.ok(detached.comps.some(c=>c.id===syringe.id));
  await page.screenshot({path:out+'/'+viewport.width+'-detached.png'});
  await page.locator('#playBtn').click();assert.equal(await page.locator('#playBtn').evaluate(e=>e.classList.contains('playing')),false);assert.deepEqual(await state(),detached);
  await page.evaluate(()=>blocks.undo());assert.deepEqual(await state(),original);
  await page.evaluate(async id=>{blocks.selectLink(id);await blocks.deleteSelectedPart();},host.id);
  await page.evaluate(n=>blocks.gripperPilot.reopen(n),detached);await page.locator('[data-detached-end="b"]').waitFor();
  const repair=structuredClone(detached);repair.comps.push({...host,id:'ReplacementRod'});await page.evaluate(n=>{blocks.gripperPilot.reopen(n);blocks.fitView();},repair);
  await page.getByRole('button',{name:'針筒設定',exact:true}).click();await page.locator('#syringeEditor').waitFor();
  const repairBefore=await state();await page.getByRole('button',{name:'在圖上重新接孔',exact:true}).click();await page.keyboard.press('Escape');assert.deepEqual(await state(),repairBefore);
  const output=page.getByLabel('推桿接孔',{exact:true});await output.selectOption(JSON.stringify({componentId:syringe.outputId,u:0,v:0}));assert.deepEqual(await state(),repairBefore);assert.ok((await page.locator('.syringe-edit-status').textContent()).length);await output.selectOption(JSON.stringify({...syringe.b,componentId:'ReplacementRod'}));
  await page.waitForFunction(()=>!document.querySelector('[data-detached-end]'));assert.equal((await state()).comps.find(c=>c.id===syringe.id).b.componentId,'ReplacementRod');
  await page.evaluate(()=>blocks.undo());assert.equal((await state()).comps.find(c=>c.id===syringe.id).b.componentId,'');
  await page.getByRole('button',{name:'在圖上重新接孔',exact:true}).click();
  const point=await page.evaluate(async host=>{const V=await import('/js/blocks/view.js'),p=host.p1,m=document.querySelector('#stageSvg').getScreenCTM(),q=new DOMPoint(V.TX(p.x),V.TY(p.y)).matrixTransform(m);return {x:q.x,y:q.y};},host);
  // Fit the selected joint into the visible canvas without changing the work.
  const controls=await page.locator('.controls').boundingBox();if(point.y>controls.y-30){const dy=controls.y-50-point.y;await page.evaluate(async dy=>{const V=await import('/js/blocks/view.js');V.panByClient(document.querySelector('#stageSvg'),0,dy);blocks.draw();},dy);point.y+=dy;}
  await page.mouse.click(point.x,point.y);await page.waitForFunction(()=>!document.querySelector('[data-detached-end]'));assert.equal((await state()).comps.find(c=>c.id===syringe.id).b.componentId,'ReplacementRod');
  await page.evaluate(n=>{blocks.gripperPilot.reopen(n);blocks.fitView();},original);
  await page.locator('#stageSvg text').filter({hasText:'🏠'}).click();await page.locator('[data-dimension-handle="frame-angle"]').waitFor();
  await page.locator('[data-dimension-handle="frame-angle"]').click();
  const numeric=page.getByRole('textbox',{name:'固定軸方向（°）',exact:true});await numeric.fill('31.25');await numeric.press('Tab');const precise=await state();
  const panHandle=async()=>{const box=await page.locator('[data-dimension-handle="frame-angle"] circle').nth(1).boundingBox(),svg=await page.locator('#stageSvg').boundingBox(),controls=await page.locator('.controls').boundingBox();const x=box.x+box.width/2,y=box.y+box.height/2,tx=Math.max(svg.x+70,Math.min(svg.x+svg.width-90,x)),ty=Math.max(svg.y+70,Math.min(controls.y-70,y));if(x!==tx||y!==ty)await page.evaluate(async({dx,dy})=>{const V=await import('/js/blocks/view.js');V.panByClient(document.querySelector('#stageSvg'),dx,dy);blocks.draw();},{dx:tx-x,dy:ty-y});};
  await panHandle();await page.screenshot({path:out+'/'+viewport.width+'-frame.png'});
  const drag=async cancel=>{const box=await page.locator('[data-dimension-handle="frame-angle"] circle').nth(1).boundingBox(),a={x:box.x+box.width/2,y:box.y+box.height/2},b={x:a.x-25,y:a.y+18};const cdp=mobile?await context.newCDPSession(page):null;
   if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[b]});}else{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:4});}
   await page.locator('[data-frame-axis-preview]').waitFor();assert.deepEqual(await state(),precise);
   if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});await cdp.detach();}else{if(cancel)await page.keyboard.press('Escape');await page.mouse.up();}
  };
  await drag(true);assert.deepEqual(await state(),precise);await drag(false);const rotated=await state();assert.notDeepEqual(rotated,precise);
  const shown=Number(await numeric.inputValue()),onGrid=Math.abs(shown-Math.atan2(72,96)*180/Math.PI)<.006,angle=onGrid?Math.atan2(72,96)*180/Math.PI:shown;assert.ok(onGrid||shown===Math.round(shown),'dragged angle is an integer or the frame 8 mm grid direction (3-4-5 at 120 mm)');await page.evaluate(()=>blocks.undo());assert.deepEqual(await state(),precise);
  await numeric.fill(String(angle));await numeric.press('Tab');const near=s=>JSON.parse(JSON.stringify(s,(k,v)=>typeof v==='number'?Math.round(v*1e9)/1e9+0:v));assert.deepEqual(near(await state()),near(rotated));
  await page.evaluate(n=>blocks.gripperPilot.reopen(n),rotated);assert.deepEqual(await state(),rotated);
  assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));results.push({viewport,deleteRetainsSyringe:true,invalidMotionBlocked:true,roundTrip:true,undo:true,reconnectNumeric:true,reconnectCanvas:true,reconnectRejected:true,reconnectCancelled:true,frameCancel:true,frameDragInteger:true,frameNumericMatches:true});await context.close();
 }}finally{await browser.close();}
 await fs.writeFile(out+'/results.json',JSON.stringify(results,null,2));console.log(results);
})().catch(e=>{console.error(e);process.exitCode=1;});
