const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const out='output/frame-holes';await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),results=[];
 try{for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:360,height:640},{width:844,height:390}].filter(v=>!process.env.TEST_WIDTH||v.width===+process.env.TEST_WIDTH)){
  console.log(viewport);const mobile=viewport.width<500,context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(12000);try{
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto('http://127.0.0.1:8021/blocks.html?gripperPilot=1');await page.waitForFunction(()=>window.blocks,{},{timeout:45000});
  await page.evaluate(()=>blocks.loadExample('hydraulic-h01'));const start=page.getByRole('button',{name:'開始設計',exact:true});if(await start.isVisible())await start.click();
  const state=()=>page.evaluate(()=>blocks.gripperPilot.snapshot());
  await page.locator('#stageSvg text').filter({hasText:'🏠'}).click();if(viewport.width<1000)await page.locator('[data-dimension-handle="frame-angle"]').click();await page.getByRole('button',{name:'新增孔',exact:true}).waitFor();
  await page.evaluate(()=>blocks.setFrameSize('lengthMm',216));const before=await state();await page.screenshot({path:`${out}/${viewport.width}-before.png`});
  const pointAt=async u=>page.evaluate(async u=>{const V=await import('/js/blocks/view.js'),s=blocks.gripperPilot.snapshot(),f=s.comps.find(c=>c.id==='H1Frame'),l=Math.hypot(f.p2.x-f.p1.x,f.p2.y-f.p1.y),p={x:f.p1.x+(f.p2.x-f.p1.x)*u/l,y:f.p1.y+(f.p2.y-f.p1.y)*u/l};const q=new DOMPoint(V.TX(p.x),V.TY(p.y)).matrixTransform(document.querySelector('#stageSvg').getScreenCTM());return {x:q.x,y:q.y};},u);
  // A viewport pan is not a work edit; expose the extension on small/landscape screens.
  const reveal=async u=>{const p=await pointAt(u),svg=await page.locator('#stageSvg').boundingBox(),control=await page.locator('.controls').boundingBox();const tx=Math.max(svg.x+70,Math.min(svg.x+svg.width-90,p.x)),ty=Math.max(svg.y+70,Math.min(control.y-70,p.y));if(tx!==p.x||ty!==p.y)await page.evaluate(async({dx,dy})=>{const V=await import('/js/blocks/view.js');V.panByClient(document.querySelector('#stageSvg'),dx,dy);blocks.draw();},{dx:tx-p.x,dy:ty-p.y});};
  const tap=async p=>mobile?page.touchscreen.tap(p.x,p.y):page.mouse.click(p.x,p.y);
  const selectHole=async u=>{await reveal(u);await tap(await pointAt(u));const picker=page.getByRole('dialog',{name:'選取重疊物件'});if(await picker.isVisible())await picker.getByRole('button',{name:/^機架孔/}).click();};
  await page.getByRole('button',{name:'新增孔',exact:true}).click();await page.getByRole('button',{name:'取消新增',exact:true}).waitFor();await page.keyboard.press('Escape');assert.deepEqual(await state(),before);
  await reveal(150);await page.getByRole('button',{name:'新增孔',exact:true}).click();await page.getByRole('button',{name:'取消新增',exact:true}).waitFor();await tap(await pointAt(150));
  await page.locator('[data-frame-hole-editor]').waitFor();await page.locator('[data-dimension-handle="frame-hole"]').waitFor();
  const added=await state(),hole=added.comps.find(c=>c.frameHole);assert.equal(hole.frameHole.u,150);assert.equal(added.comps.length,before.comps.length+1);
  await page.evaluate(()=>blocks.undo());assert.deepEqual(await state(),before);
  await page.evaluate(n=>blocks.gripperPilot.reopen(n),added);
  await selectHole(150);await page.locator('[data-dimension-handle="frame-hole"]').waitFor();await page.locator('[data-dimension-handle="frame-hole"]').click();
  const input=page.getByRole('textbox',{name:'機架孔距基準孔（mm）',exact:true});await input.fill('145.25');await input.press('Tab');await page.waitForFunction(()=>blocks.gripperPilot.snapshot().comps.find(c=>c.frameHole)?.frameHole.u===145.25);const precise=await state();
  await input.fill('999');await input.press('Tab');await page.waitForFunction(()=>document.querySelector('[aria-label="機架孔距基準孔（mm）"]').value==='145.25');assert.deepEqual(await state(),precise);
  await reveal(145.25);const drag=async cancel=>{
   const a=await pointAt(145.25),b=await pointAt(138.3),cdp=mobile?await context.newCDPSession(page):null;
   if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[b]});}else{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:5});}
   assert.deepEqual(await state(),precise,'drag preview does not write');
   if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});await cdp.detach();}else{if(cancel)await page.keyboard.press('Escape');await page.mouse.up();}
  };
  await drag(true);assert.deepEqual(await state(),precise);await drag(false);await page.waitForFunction(()=>blocks.gripperPilot.snapshot().comps.find(c=>c.frameHole).frameHole.u!==145.25);const dragged=await state(),integer=dragged.comps.find(c=>c.frameHole).frameHole.u;assert.equal(integer,Math.round(integer));
  await page.evaluate(()=>blocks.undo());assert.deepEqual(await state(),precise);await selectHole(145.25);await page.locator('[data-dimension-handle="frame-hole"]').click();await input.fill(String(integer));await input.press('Tab');await page.waitForFunction(v=>blocks.gripperPilot.snapshot().comps.find(c=>c.frameHole).frameHole.u===v,integer);assert.deepEqual(await state(),dragged);
  await page.evaluate(()=>blocks.changeFrameGround('angle',10));const rotated=await state(),h=rotated.comps.find(c=>c.frameHole),f=rotated.comps.find(c=>c.id==='H1Frame');assert.ok(Math.abs(Math.hypot(h.p1.x-f.p1.x,h.p1.y-f.p1.y)-integer)<1e-7);assert.notEqual(h.p1.y,dragged.comps.find(c=>c.frameHole).p1.y);
  await page.evaluate(n=>blocks.gripperPilot.reopen(n),rotated);assert.deepEqual(await state(),rotated);
  await selectHole(integer);await page.locator('[data-dimension-handle="frame-hole"]').waitFor();await page.screenshot({path:`${out}/${viewport.width}-after.png`});
  // Draw an ordinary bar from the new hole using the existing tool and real pointer input.
  await page.evaluate(()=>blocks.startDrawLink());const origin=await pointAt(integer),end={x:origin.x-65,y:origin.y+35};
  if(mobile){await tap(origin);await tap(end);}else{await page.mouse.move(origin.x,origin.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:5});await page.mouse.up();}
  await page.waitForFunction(n=>blocks.gripperPilot.snapshot().comps.length===n,rotated.comps.length+1);const linked=await state(),bar=linked.comps.find(c=>!rotated.comps.some(p=>p.id===c.id));assert.equal(bar.type,'bar');assert.ok([bar.p1.id,bar.p2.id].includes(hole.p1.id));
  await page.evaluate(id=>blocks.removeFrameHole(id),hole.p1.id);assert.deepEqual(await state(),linked,'connected hole cannot silently sever its rod');
  await page.evaluate(n=>blocks.gripperPilot.reopen(n),linked);assert.deepEqual(await state(),linked);
  assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));results.push({viewport,place:true,placementCancel:true,integerDrag:true,cancelPreservesDecimal:true,numericMatches:true,invalidRejected:true,undo:true,save:true,followsAxis:true,existingDrawLink:true});await context.close();}catch(e){await page.screenshot({path:`${out}/${viewport.width}-failure.png`});throw e;}
 }}finally{await browser.close();}
 await fs.writeFile(out+'/results.json',JSON.stringify(results,null,2));console.log(results);
})().catch(e=>{console.error(e);process.exitCode=1;});
