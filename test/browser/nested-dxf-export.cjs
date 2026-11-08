const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/user/AppData/Local/Temp/cadcam-review-browser/node_modules/playwright');
const fs=require('node:fs/promises'),assert=require('node:assert/strict');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8024',out=process.env.TEST_OUTPUT||'output/nested-dxf-review/browser';
(async()=>{await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),results=[];try{for(const width of [1280,390]){
 const page=await browser.newPage({viewport:{width,height:900},isMobile:width<500,hasTouch:width<500}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto(base+'/blocks.html?gripperPilot=1&example=six-bar-lift');await page.getByRole('button',{name:'載入此範例',exact:true}).click();await page.waitForFunction(()=>blocks.gripperPilot.snapshot().comps.length>0);const before=await page.evaluate(()=>blocks.gripperPilot.snapshot());
 for(const method of ['laser','cnc']){
  await page.evaluate(()=>blocks.exportLinksDxf());const dialog=page.getByRole('dialog',{name:'匯出範圍與零件清單'}),select=dialog.getByLabel('輸出方式',{exact:true});assert.equal(await select.inputValue(),'parts');await select.selectOption(method);
  assert.equal(await dialog.getByLabel('合併檔內的零件',{exact:true}).locator('li').count(),7);assert.match(await dialog.innerText(),/共 1 張板材/);
  await dialog.getByLabel('板材長（mm）',{exact:true}).fill('20');assert.equal(await dialog.getByRole('button',{name:'確認下載',exact:true}).isDisabled(),true);assert.match(await dialog.innerText(),/超過板材可用範圍/);
  await dialog.getByLabel('板材長（mm）',{exact:true}).fill('600');assert.equal(await dialog.getByRole('button',{name:'確認下載',exact:true}).isEnabled(),true);
  await dialog.getByLabel('匯出範圍',{exact:true}).selectOption('selected');assert.equal(await select.inputValue(),'parts');assert.equal(await select.locator('option[value="laser"]').isDisabled(),true);
  await dialog.getByLabel('匯出範圍',{exact:true}).selectOption('assembly');await select.selectOption(method);
  await page.screenshot({path:`${out}/${width}-${method}.png`});const downloaded=page.waitForEvent('download');await dialog.getByRole('button',{name:'確認下載',exact:true}).click();const file=await downloaded;assert.match(file.suggestedFilename(),method==='laser'?/雷切-600x400\.dxf$/:/CNC-600x400\.dxf$/);const path=`${out}/${width}-${method}.dxf`;await file.saveAs(path);const text=await fs.readFile(path,'utf8');assert.match(text,/CADCAM NESTED DXF/);assert.match(text,method==='laser'?/\nCUT\n/:/\nCNC_ONLINE\n/);assert.ok(!/NaN|Infinity/.test(text));
  await dialog.getByRole('button',{name:'完成',exact:true}).click();assert.deepEqual(await page.evaluate(()=>blocks.gripperPilot.snapshot()),before);results.push({width,method,download:true,range:true,invalidSizeBlocked:true,sourceUnchanged:true});
 }
 await page.evaluate(()=>blocks.exportLinksSvg());const svgDialog=page.getByRole('dialog');assert.equal(await svgDialog.getByLabel('輸出方式',{exact:true}).count(),0);await svgDialog.getByRole('button',{name:'取消',exact:true}).click();
 await page.evaluate(()=>blocks.exportLinksDxf());const stale=page.getByRole('dialog');await stale.getByLabel('輸出方式',{exact:true}).selectOption('laser');await page.evaluate(()=>blocks.setDesignFocus('#root')); // Scope stays the same; explicitly change work for the stale guard.
 await page.evaluate(()=>{const s=blocks.gripperPilot.snapshot();s.comps[0].name='變更後零件';blocks.gripperPilot.reopen(s);});await stale.getByRole('button',{name:'確認下載',exact:true}).click();assert.match(await stale.innerText(),/作品或選取已變更/);await stale.getByRole('button',{name:'取消',exact:true}).click();
 assert.deepEqual(errors,[]);await page.close();console.log(width+' nested export: laser/CNC downloads, size/scope, SVG unchanged, no mutation, stale guard passed');
}}finally{await browser.close();}await fs.writeFile(`${out}/results.json`,JSON.stringify(results,null,2));})().catch(e=>{console.error(e);process.exitCode=1});
