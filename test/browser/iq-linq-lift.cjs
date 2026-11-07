const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const out=process.env.OUT||'output/iq-linq-lift/rebuilt-browser',base=process.env.TEST_URL||'http://127.0.0.1:8024';
(async()=>{
 await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),results=[];
 try{for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:360,height:640},{width:844,height:390}].filter(v=>!process.env.VIEWPORT||`${v.width}x${v.height}`===process.env.VIEWPORT)){
  console.log('viewport',viewport.width,viewport.height);
  const mobile=viewport.width<500,ctx=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile}),page=await ctx.newPage(),errors=[];
  page.setDefaultTimeout(15000);page.on('pageerror',e=>{errors.push(e.message);console.log('pageerror',e.message);});page.on('dialog',d=>d.accept());
  const snapshot=()=>page.evaluate(()=>blocks.gripperPilot.snapshot());
  const attached=async()=>{const error=await page.evaluate(async()=>{const s=blocks.gripperPilot.snapshot(),{faceCandidateModel}=await import('/js/blocks/face-candidate.js'),{applyMatrix4}=await import('/js/blocks3d/orthogonal-3d.js'),m=faceCandidateModel({work:s}),d=m.model.materialParts.find(p=>p.partId==='LinqTrayDeck'),q=applyMatrix4(d.pose.matrix,{x:0,y:240,z:0}),t=m.points.LinqTrayTip;return Math.hypot(q.x-t.x,q.y-t.y);});assert.ok(error<.0001,`attached tray edge error ${error}`);};
  const collapse=async()=>{if(await page.locator('#sheetBar').isVisible()&&await page.locator('body').getAttribute('data-sheet')!=='collapsed'){
   const b=await page.locator('#sheetBar').boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2+160,{steps:10});await page.mouse.up();await page.waitForTimeout(200);
  }};
  const select=async()=>{await page.evaluate(()=>blocks.selectLink('LinqDriveReach'));if(await page.locator('.mobile-tab[data-tab="edit"]').isVisible())await page.locator('.mobile-tab[data-tab="edit"]').click();if(await page.locator('#sheetBar').isVisible()&&await page.locator('body').getAttribute('data-sheet')==='collapsed')await page.locator('#sheetBar').click();await page.locator('#fusionSegment').selectOption('LinqDriveReach');};
  const drag=async cancel=>{
   await select();await collapse();if(viewport.height<500){const h=await page.locator('[data-dimension-handle="member-length"] circle').last().boundingBox();if(h.y>230){await page.mouse.move(500,210);await page.mouse.down();await page.mouse.move(500,130,{steps:8});await page.mouse.up();await select();await collapse();}}const handle=page.locator('[data-dimension-handle="member-length"] circle').last();await handle.waitFor({state:'visible'});
   const r=await handle.boundingBox(),p={x:r.x+r.width/2,y:r.y+r.height/2};
   const delta=await page.evaluate(async()=>{const {S}=await import('/js/blocks/state.js'),V=await import('/js/blocks/view.js');const a=S.comps.find(c=>c.id==='LinqDriveReach').p1,b=S.comps.find(c=>c.id==='LinqDriveReach').p2,L=Math.hypot(b.x-a.x,b.y-a.y),scale=V.getScale()*document.querySelector('#stageSvg').getScreenCTM().a;return{x:8*(b.x-a.x)/L*scale,y:-8*(b.y-a.y)/L*scale};});
   const hit=await page.evaluate(p=>({hit:!!document.elementFromPoint(p.x,p.y)?.closest('[data-dimension-handle]'),html:document.elementFromPoint(p.x,p.y)?.outerHTML}),p);if(!hit.hit){await page.screenshot({path:`${out}/drag-obstruction-${viewport.width}x${viewport.height}.png`});console.log('obstruction',p,hit);}assert.ok(hit.hit,'dimension handle reachable');
   if(mobile){const cdp=await ctx.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x+delta.x,y:p.y+delta.y}]});await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});await cdp.detach();}
   else{await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+delta.x,p.y+delta.y,{steps:6});if(cancel)await page.keyboard.press('Escape');await page.mouse.up();}
   await page.waitForTimeout(100);
  };
  await page.goto(base+'/blocks.html?gripperPilot=1');await page.waitForFunction(()=>window.blocks?.gripperPilot);
  await page.evaluate(()=>blocks.openExamples());await page.locator('[data-example-id="iq-linq-lift"]').click();await page.getByRole('button',{name:'載入此範例',exact:true}).click();await page.waitForTimeout(300);
  await page.evaluate(async()=>{await blocks.setMode('design');blocks.setDesignFocus('LinqLift');blocks.fitView();});const baseline=await snapshot();assert.equal(baseline.tracePoint,'LinqTrayTip');await page.screenshot({path:`${out}/initial-${viewport.width}x${viewport.height}.png`});
  await page.locator('#playBtn').click();let changed=false;for(let i=0;i<6;i++){await page.waitForTimeout(120);const theta=await page.evaluate(async()=>{const{S}=await import('/js/blocks/state.js');return S.theta;});assert.ok(theta>=0&&theta<=120);changed||=theta>0;}
  assert.ok(changed,'playback changes the motor inside its declared range');await page.locator('#playBtn').click();await page.evaluate(s=>blocks.gripperPilot.reopen(s),baseline);
  await select();const input=page.locator('#memberDimensionInput');assert.equal(Number(await input.inputValue()),128);
  await input.fill('136');await input.press('Tab');try{await page.waitForFunction(()=>blocks.gripperPilot.snapshot().params.LinqDriveReach===136);}catch(e){console.log(await page.evaluate(async()=>{const{S}=await import('/js/blocks/state.js');return{selected:S.selectedLinkId,value:document.querySelector('#memberDimensionInput').value,active:document.activeElement.id,theta:S.theta,params:S.topo.params,text:document.body.innerText.slice(-2000)};}));throw e;}const numeric=await snapshot();await attached();await page.evaluate(()=>blocks.undo());assert.deepEqual(await snapshot(),baseline);
  await drag(true);assert.deepEqual(await snapshot(),baseline);await drag(false);assert.deepEqual(await snapshot(),numeric,'drag and numeric change the same drive segment');
  await page.evaluate(()=>blocks.undo());assert.deepEqual(await snapshot(),baseline);await select();await input.fill('0');await input.press('Tab');assert.deepEqual(await snapshot(),baseline,'invalid drive dimension rejected');
  await input.fill('136.3');await input.press('Tab');await page.waitForFunction(()=>blocks.gripperPilot.snapshot().params.LinqDriveReach===136.3);const precise=await snapshot();await page.evaluate(s=>blocks.gripperPilot.reopen(JSON.parse(JSON.stringify(s))),precise);assert.deepEqual(await snapshot(),precise);
  await attached();await select();await page.screenshot({path:`${out}/edited-${viewport.width}x${viewport.height}.png`});
  await collapse();await page.evaluate(async()=>{await blocks.setMode('bench');});await page.waitForSelector('#view3d',{state:'visible'});await page.waitForTimeout(400);await page.screenshot({path:`${out}/3d-${viewport.width}x${viewport.height}.png`});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
  results.push({viewport,localExample:true,playback:true,sameDirectNumeric:true,attachedAfterEdit:true,cancel:true,undo:true,invalidRejected:true,preciseReopen:true,threeD:true,errors});await ctx.close();
 }}finally{await browser.close();}
 await fs.writeFile(`${out}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));
})().catch(e=>{console.error(e);process.exitCode=1;});
