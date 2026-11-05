const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const output='output/loose-bar-rotation';await fs.mkdir(output,{recursive:true});
 const fixture=JSON.parse(await fs.readFile('test/fixtures/loose-bar-rotation.json','utf8'));
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),results=[];
 try{for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:360,height:640},{width:844,height:390}].filter(v=>!process.env.TEST_WIDTH||v.width===+process.env.TEST_WIDTH)){
  const mobile=viewport.width<500,context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(15000);console.log('viewport',viewport.width);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto('http://127.0.0.1:8021/blocks.html#m='+Buffer.from(JSON.stringify(fixture)).toString('base64url'));await page.waitForFunction(()=>window.blocks);await page.waitForTimeout(400);await page.evaluate(()=>history.replaceState(null,'',location.pathname));
  const state=()=>page.evaluate(async()=>{const{S}=await import('/js/blocks/state.js');return {comps:S.comps,params:S.topo.params,undo:S.undoStack.length};});
  const node=async id=>{const r=await page.locator(`[data-id="${id}"]`).last().boundingBox();return {x:r.x+r.width/2,y:r.y+r.height/2};};
  const tap=async p=>mobile?page.touchscreen.tap(p.x,p.y):page.mouse.click(p.x,p.y);
  const place=async()=>{if(viewport.width!==844)return;const p=await node('P11b');await page.evaluate(async p=>{const V=await import('/js/blocks/view.js');V.panByClient(document.querySelector('[data-id="P11b"]').ownerSVGElement,430-p.x,230-p.y);window.blocks.draw();},p);};
  await place();const original=await state();await tap(await node('P11b'));await page.waitForTimeout(250);
  await page.evaluate(()=>window.blocks.fitView());await page.waitForTimeout(250);await place();
  const tip=await node('P11b'),pivot=await node('H1C');
  const handle=page.locator('[data-dimension-handle="point-dimension"]');await handle.waitFor().catch(async e=>{await page.screenshot({path:`${output}/${viewport.width}-failure.png`});throw e;});
  const r=await handle.locator('circle').nth(1).boundingBox(),h={x:r.x+r.width/2,y:r.y+r.height/2};
  assert.ok(Math.hypot(h.x-tip.x,h.y-tip.y)>=47.9,'dimension handle must not cover endpoint');
  assert.ok(await page.evaluate(p=>!!document.elementFromPoint(p.x,p.y)?.closest('[data-dimension-handle]'),h),'dimension handle remains visible and reachable');
  await page.screenshot({path:`${output}/${viewport.width}-before.png`});
  await tap(tip);assert.deepEqual(await state(),original,'selection preserves exact values');
  const dx=tip.x-pivot.x,dy=tip.y-pivot.y,a=-.55,target={x:pivot.x+dx*Math.cos(a)-dy*Math.sin(a),y:pivot.y+dx*Math.sin(a)+dy*Math.cos(a)};
  const gesture=async cancel=>{
   const start=await node('P11b');
   if(mobile){const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[target]});await page.waitForTimeout(150);await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});await cdp.detach();}
   else{await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:6});await page.waitForTimeout(150);if(cancel)await page.keyboard.press('Escape');await page.mouse.up();}
   await page.waitForTimeout(200);
  };
  await gesture(true);assert.deepEqual(await state(),original,'cancel restores exact original');
  await gesture(false);const moved=await state(),bar=moved.comps.find(c=>c.id==='Link11'),old=original.comps.find(c=>c.id==='Link11');
  assert.deepEqual(moved.params,original.params,'rotation keeps every dimension');assert.equal(moved.undo,original.undo+1);
  assert.deepEqual(moved.comps.filter(c=>c.id!=='Link11'),original.comps.filter(c=>c.id!=='Link11'),'attached mechanism stays still');assert.deepEqual(bar.p1,old.p1);
  assert.ok(Math.hypot(bar.p2.x-old.p2.x,bar.p2.y-old.p2.y)>10,'free tip actually rotates');
  assert.ok(Math.abs(Math.hypot(bar.p2.x-bar.p1.x,bar.p2.y-bar.p1.y)-57)<1e-8);
  const degrees=Math.atan2(bar.p2.y-bar.p1.y,bar.p2.x-bar.p1.x)*180/Math.PI;assert.ok(Math.abs(degrees-Math.round(degrees))<1e-8);
  await page.screenshot({path:`${output}/${viewport.width}-rotated.png`});
  await page.evaluate(()=>window.blocks.undo());assert.deepEqual(await state(),original,'one undo restores angle and precision');
  await tap(await node('P11b'));await page.waitForTimeout(200);
  const box=await handle.locator('circle').nth(1).boundingBox(),start={x:box.x+box.width/2,y:box.y+box.height/2},p=await node('H1C'),q=await node('P11b'),L=Math.hypot(q.x-p.x,q.y-p.y);
  await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+(q.x-p.x)/L*15,start.y+(q.y-p.y)/L*15,{steps:5});
  assert.notEqual(await handle.getAttribute('transform'),null,'dimension drag still previews separately');
  await page.keyboard.press('Escape');await page.mouse.up();assert.deepEqual(await state(),original);
  await tap(await node('P11b'));await gesture(false);const saved=await state();await page.waitForTimeout(1200);await page.reload();await page.waitForFunction(()=>window.blocks);
  assert.deepEqual((await state()).comps,saved.comps);assert.deepEqual((await state()).params,saved.params);assert.deepEqual(errors,[]);
  results.push({viewport,rotate:true,keepLength:true,keepMechanism:true,cancel:true,undo:true,dimensionPreview:true,reopen:true});await context.close();
 }}finally{await browser.close();}
 await fs.writeFile(output+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
})().catch(e=>{console.error(e);process.exitCode=1;});
