const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const out='output/mounting-motion-feedback';await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),results=[];
 try{for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:360,height:640},{width:844,height:390}].filter(v=>!process.env.TEST_WIDTH||v.width===+process.env.TEST_WIDTH)){
  console.log(viewport);const mobile=viewport.width<500,context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile}),page=await context.newPage(),errors=[];let accept=true,asks=0;
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{asks++;return accept?d.accept():d.dismiss();});
  await page.goto('http://127.0.0.1:8021/blocks.html?gripperPilot=1');await page.waitForFunction(()=>window.blocks,{},{timeout:45000});
  await page.evaluate(()=>blocks.loadExample('hydraulic-h07'));const start=page.getByRole('button',{name:'開始設計',exact:true});if(await start.isVisible())await start.click();
  const state=()=>page.evaluate(()=>blocks.gripperPilot.snapshot());
  const align=()=>page.evaluate(async()=>{const {S}=await import('/js/blocks/state.js'),{syringeClampFrameNodes}=await import('/js/blocks/syringe-shape.js'),V=await import('/js/blocks/view.js');
   const s=S.comps.find(c=>c.type==='syringe'),host=S.comps.find(c=>c.id===s.a.componentId),nodes=syringeClampFrameNodes(S.comps,[host.p1,host.p2,host.p3].filter(Boolean));
   return nodes.map(p=>{const n=document.querySelector(`[data-clamp-hole="${p.id}"]`);return Math.hypot(+n.getAttribute('cx')-V.TX(p.x),+n.getAttribute('cy')-V.TY(p.y));});});
  await page.getByRole('button',{name:'針筒設定',exact:true}).click();await page.locator('[data-dimension-handle="syringe-angle"]').waitFor();await page.waitForTimeout(400);
  if(viewport.height<500)await page.evaluate(async()=>{const V=await import('/js/blocks/view.js');V.panByClient(document.querySelector('#stageSvg'),0,-45);blocks.draw();});
  const before=await state();await page.screenshot({path:out+'/'+viewport.width+'-before.png'});
  const angle=page.getByRole('textbox',{name:'方向 (°)',exact:true});accept=false;await angle.fill('3');await angle.press('Tab');assert.deepEqual(await state(),before);assert.ok(asks>0);
  accept=true;await angle.fill('3');await angle.press('Tab');assert.ok((await align()).every(d=>d<.01));await page.evaluate(()=>blocks.undo());assert.deepEqual(await state(),before);
  const knob=await page.locator('[data-dimension-handle="syringe-angle"] circle').nth(1).boundingBox(),a={x:knob.x+knob.width/2,y:knob.y+knob.height/2},b={x:a.x,y:a.y-8};
  const cdp=mobile?await context.newCDPSession(page):null;
  if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[b]});}
  else{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:4});}
  await page.locator('[data-clamp-preview]').waitFor();assert.equal(await page.locator('[data-preview-hole]').count(),2);assert.deepEqual(await state(),before);await page.screenshot({path:out+'/'+viewport.width+'-preview.png'});
  if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await cdp.detach();}else{await page.keyboard.press('Escape');await page.mouse.up();}
  assert.equal(await page.locator('[data-clamp-preview]').count(),0);assert.deepEqual(await state(),before);
  await page.evaluate(async()=>{const {getExample}=await import('/js/blocks/examples.js');const n=structuredClone(getExample('hydraulic-h01').snapshot),s=n.comps.find(c=>c.type==='syringe'),arm=n.comps.find(c=>c.id===s.outputId),p=arm.p2;
   n.comps.push({type:'bar',id:'ExtraArm',color:'#3498db',p1:{...p},p2:{id:'LooseEnd',type:'floating',x:p.x+57,y:p.y},lenParam:'ExtraLength',fixedLen:true});n.params.ExtraLength=57;s.extension=15.153071999999927;blocks.gripperPilot.reopen(n);blocks.fitView();});
  const loose=await state();await page.locator('#playBtn').click();await page.locator('[data-unresolved-part="ExtraArm"]').waitFor({state:'attached'});
  const warning=await page.locator('#solveBanner').textContent();assert.ok(warning.includes('15.15 mm'));assert.ok(!warning.includes('999999'));assert.ok(warning.includes('合成一片'));assert.deepEqual(await state(),loose);
  assert.equal(await page.locator('#playBtn').evaluate(e=>e.classList.contains('playing')),false);assert.ok((await align()).every(d=>d<.01));
  await page.screenshot({path:out+'/'+viewport.width+'-warning.png'});await page.locator('#solveBanner').getByRole('button',{name:'選取連桿',exact:true}).click();
  await page.screenshot({path:out+'/'+viewport.width+'-selected.png'});await page.getByRole('button',{name:'合成一片…',exact:true}).waitFor({state:'visible'});assert.deepEqual(await state(),loose);
  assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));results.push({viewport,clampAlignment:true,preview:true,cancel:true,review:true,undo:true,unresolvedHighlighted:true,playbackBlocked:true,existingFusionEntry:true});await context.close();
 }}finally{await browser.close();}
 await fs.writeFile(out+'/results.json',JSON.stringify(results,null,2));console.log(results);
})().catch(e=>{console.error(e);process.exitCode=1;});
