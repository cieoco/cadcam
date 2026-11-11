const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const base=process.env.TEST_URL||'http://127.0.0.1:8024',out=process.env.OUT||'output/mad-box/browser';
(async()=>{await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),results=[];
try{for(const viewport of [{width:1280,height:900},{width:390,height:844}].filter(v=>!process.env.TEST_WIDTH||v.width===+process.env.TEST_WIDTH)){
 const ctx=await browser.newContext({viewport,isMobile:viewport.width<500,hasTouch:viewport.width<500}),page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const state=()=>page.evaluate(async()=>{const {S}=await import('/js/blocks/state.js');return {comps:S.comps,params:S.topo.params,undo:S.undoStack.length,theta:S.theta};});
 try{
  await page.goto(base+'/blocks.html?example=iq-mad-box');await page.getByRole('button',{name:'載入此範例',exact:true}).click();await page.waitForTimeout(300);
  const pickRow=async id=>{const d=page.getByRole('dialog',{name:'選取重疊物件'});if(await d.isVisible())await d.locator(`[data-pick="${id}"]`).click();};const gear=page.locator('[data-pick-component="MadF"]');const box=await gear.boundingBox();await gear.click({position:{x:box.width/2,y:box.height/4}});await pickRow('MadF');if(!await page.locator('#gearTeethInput').isVisible())await page.locator('#sheetMore').click();await page.locator('#gearTeethInput').waitFor({state:'visible'});
  const before=await state(),field=page.locator('#gearTeethInput');
  await field.fill('24');await field.press('Tab');await page.waitForTimeout(300);const changed=await state();assert.equal(changed.comps.find(g=>g.id==='MadF').teeth,24);assert.equal(changed.undo,before.undo+1);
  assert.equal(changed.comps.find(g=>g.id==='MadF').p1.x,132);
  await page.getByRole('button',{name:/^復原(上一步)?$/}).filter({visible:true}).first().click();assert.equal((await state()).comps.find(g=>g.id==='MadF').teeth,36);
  await gear.click({position:{x:box.width/2,y:box.height/4}});await pickRow('MadF');await field.fill('5');await field.press('Tab');await page.waitForTimeout(200);assert.equal((await state()).comps.find(g=>g.id==='MadF').teeth,36);
  await page.locator('#playBtn').click();await page.waitForTimeout(3500);await page.locator('#playBtn').click();assert.ok(Math.abs((await state()).theta)>360);
  await page.evaluate(()=>blocks.saveFile());const download=page.waitForEvent('download');await page.locator('#saveProjectForm').evaluate(f=>f.requestSubmit());const path=out+'/mad-'+viewport.width+'.json';await (await download).saveAs(path);
  await page.evaluate(()=>blocks.openFile());const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'選擇作品檔',exact:true}).click();await(await chooser).setFiles(path);await page.waitForTimeout(300);
  const saved=await state();assert.equal(saved.comps.length,6);assert.equal(saved.comps[1].p2.id,saved.comps[2].p2.id);
  await page.evaluate(()=>blocks.toggle3D());await page.locator('#view3d canvas').waitFor({state:'visible'});
  await page.locator('#view3d summary').click();await page.locator('#view3d [data-view="iso"]').click();await page.waitForTimeout(700);
  await page.screenshot({path:out+'/mad-'+viewport.width+'-3d.png'});assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));results.push({viewport,ok:true});
 }catch(e){results.push({viewport,ok:false,error:e.stack});await page.screenshot({path:out+'/failed-'+viewport.width+'.png'});throw e;}
 finally{await ctx.close();await fs.writeFile(out+'/results.json',JSON.stringify(results,null,2));}
}}finally{await browser.close();}console.log(JSON.stringify(results));})().catch(e=>{console.error(e);process.exitCode=1;});
