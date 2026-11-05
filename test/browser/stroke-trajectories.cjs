const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const output='output/stroke-trajectories';await fs.mkdir(output,{recursive:true});
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),results=[];
 try{for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:360,height:640},{width:844,height:390}].filter(v=>!process.env.TEST_WIDTH||v.width===+process.env.TEST_WIDTH)){
  const mobile=viewport.width<500,context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile}),page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto('http://127.0.0.1:8021/blocks.html');await page.waitForFunction(()=>window.blocks);
  const load=async id=>{await page.evaluate(id=>window.blocks.loadExample(id),id);const start=page.getByRole('button',{name:'開始設計',exact:true});if(await start.isVisible())await start.click();};
  const state=()=>page.evaluate(async()=>{const {S}=await import('/js/blocks/state.js');return {comps:S.comps,params:S.topo.params,undo:S.undoStack.length,trace:S.topo.tracePoints};});
  await load('hydraulic-h07');
  const path=page.locator('[data-trace-point="H7B"]');await path.waitFor();assert.ok(await path.evaluate(e=>e.getTotalLength()>1));
  const original=await state();await page.screenshot({path:`${output}/${viewport.width}-point.png`});
  await page.evaluate(()=>window.blocks.selectLink('H7Turn'));
  if(mobile)await page.locator('#sheetMore').click();
  if(await page.locator('#memberOperations').isHidden())await page.getByRole('button',{name:'其他零件操作',exact:true}).click();
  await page.locator('#memberSweepToggle').check();
  assert.ok(await page.locator('[data-member-sweep="H7Turn"] line').count()>20);
  assert.deepEqual(await state(),original,'trajectory and range viewing must not mutate work');
  await page.screenshot({path:`${output}/${viewport.width}-sweep.png`});
  const dimension=page.locator('#memberDimensionInput');await dimension.fill('43');await dimension.press('Tab');
  assert.equal((await state()).params.H7Crank,43);await path.waitFor();
  assert.ok(await path.evaluate(e=>e.getTotalLength()>1));
  await page.screenshot({path:`${output}/${viewport.width}-radius43.png`});
  await page.evaluate(()=>window.blocks.undo());assert.deepEqual((await state()).params,original.params);
  const range=page.getByRole('slider',{name:'針筒伸出量 mm',exact:true}),before=await state();
  for(const mm of [0,10,20]){await range.fill(String(mm));await range.dispatchEvent('input');await path.waitFor();assert.ok(await path.evaluate(e=>e.getTotalLength()>1));assert.equal((await state()).comps.find(c=>c.type==='syringe').extension,mm);}
  assert.deepEqual((await state()).params,before.params);
  const saved=await state();await page.waitForTimeout(1200);await page.reload();await page.waitForFunction(()=>window.blocks);await path.waitFor();assert.deepEqual((await state()).comps,saved.comps);
  for(const [example,point] of [['hydraulic-h01','H1C'],['hydraulic-h08','H8B'],['fourbar-crank-rocker','D']]){await load(example);
   if(example==='fourbar-crank-rocker'){
    const hole=page.locator('[data-id="D"]').last();await hole.click();
    if(mobile&&!['half','full'].includes(await page.locator('body').getAttribute('data-sheet')))await page.locator('#sheetMore').click();
    const details=page.locator('#nodeAdvanced');if(await details.getAttribute('open')===null)await details.locator('summary').click();
    await page.locator('#traceBtn').click();
   }
   await page.locator(`[data-trace-point="${point}"]`).waitFor();}
  assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  results.push({viewport,point:true,sweep:true,radius43:true,undo:true,stroke:[0,10,20],reopen:true,otherDrives:true});await context.close();
 }}finally{await browser.close();}
 await fs.writeFile(output+(process.env.TEST_WIDTH?'/results-'+process.env.TEST_WIDTH+'.json':'/results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
})().catch(e=>{console.error(e);process.exitCode=1;});
