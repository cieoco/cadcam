const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const output='output/syringe-inline';await fs.mkdir(output,{recursive:true});
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const results=[];
 try{for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:360,height:640},{width:844,height:390}]){
  console.log('viewport',viewport);const mobile=viewport.width<500,context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile}),page=await context.newPage(),errors=[];let accept=true,asks=0;
  page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{asks++;return accept?d.accept():d.dismiss();});
  await page.goto((process.env.TEST_URL||'http://127.0.0.1:8021')+'/blocks.html?gripperPilot=1');await page.waitForFunction(()=>window.blocks);await page.evaluate(()=>blocks.loadExample('hydraulic-h07'));if(await page.getByRole('button',{name:'開始設計',exact:true}).isVisible())await page.getByRole('button',{name:'開始設計',exact:true}).click();
  const snapshot=()=>page.evaluate(()=>JSON.stringify(blocks.gripperPilot.snapshot()));
  const undoCount=()=>page.evaluate(async()=>{const {S}=await import('/js/blocks/state.js');return S.undoStack.length;});
  const baseline=await snapshot(),count=await undoCount();
  // Click the visible syringe itself, not a test-only action.
  const body=page.locator('#stageSvg [data-syringe] line').nth(2);await body.click({force:true});await page.locator('#syringeEditor').waitFor({state:'visible'});await page.waitForTimeout(400);
  assert.equal(await page.locator('#syringeInstallation[open]').count(),0);assert.equal(await page.locator('#syringeEditor svg,#syringeEditor input[type=range]').count(),0);
  assert.equal(await snapshot(),baseline);
  const x=page.getByRole('textbox',{name:'位置 X (mm)',exact:true}),y=page.getByRole('textbox',{name:'位置 Y (mm)',exact:true}),oldX=await x.inputValue();
  await x.fill('-');await x.press('Escape');assert.equal(await snapshot(),baseline);assert.equal(await undoCount(),count);
  accept=false;await x.fill(String(Number(oldX)+8));await x.press('Tab');assert.equal(await snapshot(),baseline);assert.equal(await undoCount(),count);assert.ok(asks>0,'changed mounting holes require review');assert.equal(await x.inputValue(),oldX,'declined holes restore the displayed number');accept=true;
  await x.fill(String(Number(oldX)+8));await x.press('Tab');assert.notEqual(await snapshot(),baseline);assert.equal(await undoCount(),count+1);await page.evaluate(()=>blocks.undo());assert.equal(await snapshot(),baseline);
  const angle=page.getByRole('textbox',{name:'方向 (°)',exact:true});await angle.fill('1');await angle.press('Tab');assert.notEqual(await snapshot(),baseline);await page.evaluate(()=>blocks.undo());assert.equal(await snapshot(),baseline);
  const beforeStroke=asks;await page.locator('#syringeControls input[type=range]').focus();await page.keyboard.press('ArrowRight');assert.equal(asks,beforeStroke);await page.evaluate(()=>blocks.undo());assert.equal(await snapshot(),baseline);
  // Drag previews share the numbers and never write until release.
  const handle=()=>page.locator('[data-dimension-handle="syringe-position"] circle').first();
  const center=async()=>{const r=await handle().boundingBox();assert.ok(r&&r.width>=43);return {x:r.x+r.width/2,y:r.y+r.height/2};};
  await page.screenshot({path:`${output}/${viewport.width}-before-drag.png`});let p=await center();console.log('handle',p);const controls=await page.locator('.controls').boundingBox();if(mobile)assert.ok(p.y+22<controls.y,'handle remains above playback toolbar');
  const cdp=mobile?await context.newCDPSession(page):null;
  const start=async p=>{if(mobile)await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});else{await page.mouse.move(p.x,p.y);await page.mouse.down();}};
  const move=async p=>{if(mobile)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[p]});else await page.mouse.move(p.x,p.y,{steps:5});};
  const end=async()=>mobile?cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}):page.mouse.up();
  await start(p);await move({x:p.x+12,y:p.y-12});await page.waitForTimeout(100);assert.equal(await snapshot(),baseline);assert.notEqual(await x.inputValue(),oldX);
  if(mobile)await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});else{await page.keyboard.press('Escape');await page.mouse.up();}
  assert.equal(await snapshot(),baseline);assert.equal(await x.inputValue(),oldX);
  p=await center();await start(p);await move({x:p.x+8,y:p.y-8});await end();assert.notEqual(await snapshot(),baseline);assert.equal(await undoCount(),count+1);
  const moved=await snapshot();await page.evaluate(()=>blocks.undo());assert.equal(await snapshot(),baseline);
  await page.evaluate(s=>blocks.gripperPilot.reopen(JSON.parse(s)),moved);assert.equal(await snapshot(),moved);await page.evaluate(s=>blocks.gripperPilot.reopen(JSON.parse(s)),baseline);
  await page.getByRole('button',{name:'針筒設定',exact:true}).click();await page.waitForTimeout(200);
  if(mobile){p=await center();await start(p);await move({x:p.x+8,y:p.y-8});await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x+8,y:p.y-8},{x:p.x+50,y:p.y-8}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal(await snapshot(),baseline);await cdp.detach();if(!await x.isVisible())await page.locator('#sheetMore').click();}
  // Exact invalid positions cannot be silently clamped into a different mounting location.
  await x.fill('99999');await x.press('Tab');assert.equal(await snapshot(),baseline);assert.ok((await page.locator('#syringeEditor [role=status]').innerText()).length);await x.fill(oldX);await x.press('Tab');
  await page.locator('#syringeEditor summary').click();const offset=page.getByRole('spinbutton',{name:'固定環距筒尾 (mm)',exact:true});const beforeOffset=asks;
  await offset.fill('45');await offset.press('Tab');assert.equal(asks,beforeOffset,'barrel through clamp does not relocate holes');assert.equal(JSON.parse(await snapshot()).comps.find(c=>c.type==='syringe').installation.barrelOffsetMm,45);await page.evaluate(()=>blocks.undo());assert.equal(await snapshot(),baseline);
  await page.locator('#syringeEditor summary').click();await page.waitForTimeout(100);await page.screenshot({path:`${output}/${viewport.width}x${viewport.height}-after.png`});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.getByRole('button',{name:'完成',exact:true}).click();assert.equal(await page.locator('[data-dimension-handle^="syringe-"]').count(),0);
  await page.getByRole('button',{name:'針筒設定',exact:true}).click();await page.waitForTimeout(100);await page.evaluate(()=>blocks.selectLink('H7Turn'));assert.ok(!(await page.locator('#syringeEditor').isVisible()),'selection changes close prior editor');
  assert.deepEqual(errors,[]);results.push({viewport,review:asks,touch:mobile,cancel:true,undo:true,reopen:true,errors});await context.close();
 }}finally{await browser.close();}
 await fs.writeFile(`${output}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));
})().catch(e=>{console.error(e);process.exitCode=1;});
