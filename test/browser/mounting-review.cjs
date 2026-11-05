// Real pointer/numeric UI, native confirmation, autosave and undo. No npm setup required.
// Set PLAYWRIGHT_MODULE to an available Playwright installation when it is not on NODE_PATH.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const output='output/mounting-review/browser';
(async()=>{
 await fs.mkdir(output,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const results=[];
 try{for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:360,height:640}]){
  const mobile=viewport.width<500,context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile}),page=await context.newPage(),errors=[],questions=[];
  page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));let accept=false;
  page.on('dialog',async d=>{questions.push(d.message());if(d.type()!=='confirm')throw Error(d.message());await (accept?d.accept():d.dismiss());});
  await page.goto((process.env.TEST_URL||'http://127.0.0.1:8021')+'/blocks.html');await page.waitForFunction(()=>window.blocks);
  await page.evaluate(()=>window.blocks.loadExample('hydraulic-h07'));
  await page.getByRole('button',{name:'開始設計',exact:true}).click();
  const state=()=>page.evaluate(async()=>{const {S}=await import('/js/blocks/state.js');const {buildPartGeometryCatalog}=await import('/js/blocks/part-geometry.js');const c=S.comps.find(c=>c.type==='syringe');const g=buildPartGeometryCatalog({comps:S.comps,params:S.topo.params,modules:S.modules,fabrication:S.fabrication});return {a:c.a,axis:c.axisDeg,undo:S.undoStack.length,holes:Object.values(g.parts).flatMap(p=>p.holes.filter(h=>h.layer==='SYRINGE_CLAMP').map(h=>[p.id,h.x,h.y,h.r]))};});
  const before=await state();
  await page.getByRole('button',{name:'針筒設定',exact:true}).click();const dialog=page.getByRole('dialog',{name:'針筒安裝',exact:true});
  await dialog.getByText('精確座標與角度',{exact:true}).click();
  const x=dialog.getByRole('textbox',{name:'固定位置 X (mm)',exact:true}),oldX=Number(await x.inputValue());
  await page.screenshot({path:`${output}/${viewport.width}-before.png`});
  await x.fill(String(oldX+1));await x.press('Tab');
  assert.deepEqual(await state(),before,'preview must not mutate work or undo');
  const confirm=dialog.getByRole('button',{name:'確認安裝',exact:true});
  await confirm.click();assert.equal(questions.length,1);assert.match(questions[0],/是否更新對應的固定孔位/);
  assert.deepEqual(await state(),before,'decline must retain original work');assert.ok(await dialog.isVisible());
  await page.screenshot({path:`${output}/${viewport.width}-declined.png`});
  accept=true;await confirm.click();assert.equal(questions.length,2);await dialog.waitFor({state:'hidden'});
  const updated=await state();assert.equal(updated.undo,before.undo+1);assert.notDeepEqual(updated.holes,before.holes);
  // Save/reopen must keep the approved attachment; no new independently stored hole format.
  await page.waitForTimeout(1100);await page.reload();await page.waitForFunction(()=>window.blocks);
  const reopened=await state();assert.deepEqual(reopened.a,updated.a);assert.deepEqual(reopened.holes,updated.holes);
  await page.getByRole('button',{name:'針筒設定',exact:true}).click();
  const handle=page.locator('[data-install-position]');await handle.waitFor({state:'visible'});const box=await handle.boundingBox();assert.ok(box);
  const beforeDrag=await state();accept=false;
  const point={x:box.x+box.width/2,y:box.y+box.height/2};
  if(mobile){const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...point,x:point.x+8}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
  else{await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+8,point.y,{steps:3});await page.mouse.up();}
  await page.screenshot({path:`${output}/${viewport.width}-pointer.png`});
  assert.deepEqual(await state(),beforeDrag,'pointer preview stays isolated');
  await confirm.click();assert.equal(questions.length,3,'pointer edit must use same review');assert.deepEqual(await state(),beforeDrag);
  accept=true;await confirm.click();assert.equal(questions.length,4);await dialog.waitFor({state:'hidden'});
  assert.equal((await state()).undo,beforeDrag.undo+1);
  await page.evaluate(()=>window.blocks.undo());const undone=await state();assert.deepEqual(undone.a,beforeDrag.a);assert.deepEqual(undone.holes,beforeDrag.holes);
  // Whole-page and dialog fit remain usable on the small phone.
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:`${output}/${viewport.width}-after-undo.png`});
  assert.deepEqual(errors,[]);results.push({viewport,questions:questions.length,numeric:true,pointer:true,cancel:true,undo:true,reopen:true,errors});await context.close();
 }}finally{await browser.close();}
 await fs.writeFile(`${output}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));
})().catch(e=>{console.error(e);process.exitCode=1;});
