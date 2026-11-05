// Existing page interactions, including touch; no test-only application API.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=process.env.TEST_OUTPUT||'output/point-dimensions';
(async()=>{
 await fs.mkdir(output,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const results=[];
 try{for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:360,height:640},{width:844,height:390}].filter(v=>!process.env.TEST_WIDTH||v.width===Number(process.env.TEST_WIDTH))){
  const mobile=viewport.width<500,context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));let accept=true,questions=0;
  page.on('dialog',async d=>{questions++;await (accept?d.accept():d.dismiss());});
  await page.goto((process.env.TEST_URL||'http://127.0.0.1:8021')+'/blocks.html');await page.waitForFunction(()=>window.blocks);
  await page.evaluate(()=>window.blocks.loadExample('hydraulic-h07'));
  await page.getByRole('button',{name:'開始設計',exact:true}).click();
  const choose=key=>page.locator('#pointDimensionEditor [data-dimension-choice='+JSON.stringify(key)+']').click().catch(async e=>{await page.screenshot({path:output+'/'+viewport.width+'-choose-failure.png'});console.log('choose failed',await state(),await page.evaluate(()=>({body:document.body.dataset,style:document.querySelector('#roleEditor').getAttribute('style')})));throw e;});
  const state=()=>page.evaluate(async()=>{const {S}=await import('/js/blocks/state.js');return {comps:S.comps,params:S.topo.params,undo:S.undoStack.length,node:S.selectedNodeId};});
  const clickNode=async id=>{await page.waitForTimeout(500);const box=await page.locator(`[data-id="${id}"]`).last().boundingBox();if(mobile)await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);else await page.mouse.click(box.x+box.width/2,box.y+box.height/2);const overlap=page.getByRole('dialog',{name:'選取重疊物件'});if(await overlap.isVisible())await overlap.getByRole('button',{name:`接點 · ${id}`,exact:true}).click();if(mobile&&!['half','full'].includes(await page.locator('body').getAttribute('data-sheet')))await page.locator('#sheetMore').click();};
  const original=await state();
  await page.screenshot({path:`${output}/${viewport.width}-before.png`});
  await clickNode('H7B');
  const select=page.locator('#pointDimensionEditor [data-choices]');await select.waitFor({state:'visible'}).catch(async e=>{await page.screenshot({path:`${output}/${viewport.width}-failure.png`});console.log(JSON.stringify(await state()));console.log((await page.locator('body').innerText()).slice(-4500));throw e;});
  assert.equal(await select.locator('[aria-pressed=true]').count(),0,'shared joint must not choose an owner silently');
  assert.deepEqual((await state()).params,original.params);
  assert.ok(!/H7Turn|H7Coupler/.test(await select.innerText()),'owner labels must not require internal identifiers');
  await page.screenshot({path:`${output}/${viewport.width}-choices.png`});
  const owner=page.locator('[data-point-choice='+JSON.stringify(JSON.stringify(['H7Turn','g']))+']');
  const hit=owner.locator('circle').first();const hitBox=await hit.boundingBox();assert.ok(hitBox.width>=43.9&&hitBox.height>=43.9);
  if(mobile)await page.touchscreen.tap(hitBox.x+hitBox.width/2,hitBox.y+hitBox.height/2);else await hit.click();
  assert.equal(await page.locator('[data-dimension-highlight]').getAttribute('data-dimension-highlight'),JSON.stringify(['H7Turn','g']));
  const field=page.getByRole('textbox',{name:'所選零件孔距（mm）',exact:true});
  await field.waitFor({state:'visible'}).catch(async e=>{await page.screenshot({path:output+'/'+viewport.width+'-pick-failure.png'});console.log(viewport,await state(),await page.locator('#pointDimensionEditor').innerHTML());throw e;});const baseline=await state();assert.equal(Number(await field.inputValue()),15);
  await field.fill('20.5');await field.press('Tab');
  const numeric=await state();assert.equal(numeric.params.H7Crank,20.5);assert.equal(numeric.params.H7Coupler,baseline.params.H7Coupler);assert.equal(numeric.undo,baseline.undo+1);
  // Invalid edge clearance must retain the exact work and restore the input.
  await field.fill('100');await field.press('Tab');assert.deepEqual(await state(),numeric);assert.equal(Number(await field.inputValue()),20.5);
  await choose(JSON.stringify(['H7Coupler','g']));await field.fill('200');await field.press('Tab');
  assert.deepEqual(await state(),numeric,'unreachable connecting rod length must be rejected before commit');
  await choose(JSON.stringify(['H7Turn','g']));
  await page.evaluate(()=>window.blocks.undo());assert.deepEqual((await state()).params,baseline.params);
  // Undo can reset selection; reselect through UI.
  await clickNode('H7B');await choose(JSON.stringify(['H7Turn','g']));
  await field.fill('15.4');await field.press('Tab');
  const handle=page.locator('[data-dimension-handle="point-dimension"]');await handle.waitFor({state:'visible'});
  const coords=await handle.evaluate(g=>{const c=g.querySelectorAll('circle')[1],svg=g.ownerSVGElement,m=svg.getScreenCTM(),p=new DOMPoint(+c.getAttribute('cx'),+c.getAttribute('cy')).matrixTransform(m),center=svg.querySelector('[data-id="H7O"]'),r=center.getBoundingClientRect(),end=svg.querySelector('[data-id="H7B"]').getBoundingClientRect(),dx=end.x+end.width/2-r.x-r.width/2,dy=end.y+end.height/2-r.y-r.height/2,L=Math.hypot(dx,dy);return {x:p.x,y:p.y,dx:dx/L*12,dy:dy/L*12};});
  const beforeDrag=await state();
  // A click and a cancelled drag must preserve a numeric decimal exactly.
  await page.mouse.click(coords.x,coords.y);assert.deepEqual(await state(),beforeDrag);
  await page.mouse.move(coords.x,coords.y);await page.mouse.down();await page.mouse.move(coords.x+coords.dx,coords.y+coords.dy,{steps:4});
  assert.ok(Number.isInteger(Number(await field.inputValue())),'drag preview is whole mm');
  await page.keyboard.press('Escape');await page.mouse.up();assert.deepEqual(await state(),beforeDrag);assert.equal(Number(await field.inputValue()),15.4);
  if(mobile){const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:coords.x,y:coords.y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:coords.x+coords.dx,y:coords.y+coords.dy}]});assert.deepEqual(await state(),beforeDrag);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
  else{await page.mouse.move(coords.x,coords.y);await page.mouse.down();await page.mouse.move(coords.x+coords.dx,coords.y+coords.dy,{steps:4});assert.deepEqual(await state(),beforeDrag);await page.mouse.up();}
  const dragged=await state();assert.notEqual(dragged.params.H7Crank,15.4);assert.ok(Number.isInteger(dragged.params.H7Crank));assert.equal(dragged.undo,beforeDrag.undo+1);assert.equal(dragged.params.H7Coupler,beforeDrag.params.H7Coupler);
  await page.evaluate(()=>window.blocks.undo());assert.equal((await state()).params.H7Crank,15.4,'undo restores the precise original');
  await clickNode('H7B');await choose(JSON.stringify(['H7Turn','g']));await field.fill(String(dragged.params.H7Crank));await field.press('Tab');
  if(mobile){const f=await field.boundingBox(),tabs=await page.locator('.mobile-tabs').boundingBox();assert.ok(f.y+f.height<=tabs.y,'numeric preview must remain above bottom tabs');}
  await page.screenshot({path:`${output}/${viewport.width}-selected-hole.png`});
  if(viewport.width===390){
    const style=await page.addStyleTag({content:'#pointDimensionEditor button{font-size:24px!important;overflow-wrap:anywhere}'});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    for(const button of await select.locator('button').all())assert.ok(await button.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'large text wraps inside its choice');
    await page.screenshot({path:`${output}/390-large-text.png`});await style.evaluate(e=>e.remove());
  }
  // Escape cancels a complete draft, including its numeric preview.
  const hbox=await handle.locator('circle').nth(1).boundingBox(),p={x:hbox.x+hbox.width/2,y:hbox.y+hbox.height/2};
  await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+15,p.y-10);await page.keyboard.press('Escape');await page.mouse.up();assert.deepEqual(await state(),dragged);
  // The same selected-hole path asks before changing existing syringe attachment holes.
  await page.waitForTimeout(1100);await page.reload();await page.waitForFunction(()=>window.blocks);
  await clickNode('H7O');await choose(JSON.stringify(['H7Frame','g']));
  const frameBefore=await state();accept=false;const qBefore=questions;
  await field.fill(String(frameBefore.params.H7Frame+8));await field.press('Tab');
  assert.equal(questions,qBefore+1);assert.deepEqual(await state(),frameBefore);accept=true;
  await page.waitForTimeout(1100);await page.reload();await page.waitForFunction(()=>window.blocks);
  const reopened=await state();assert.deepEqual(reopened.params,dragged.params);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
  results.push({viewport,numeric:true,pointer:true,owner:true,cancel:true,undo:true,reopen:true,questions,errors});await context.close();
 }}finally{await browser.close();}
 await fs.writeFile(`${output}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));
})().catch(e=>{console.error(e);process.exitCode=1;});
