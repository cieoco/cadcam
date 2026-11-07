const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const base=process.env.TEST_URL||'http://127.0.0.1:8024',out='output/iq-wheel-grabber/browser';
(async()=>{await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),results=[];
try{for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
 const mobile=viewport.width<500,ctx=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile}),page=await ctx.newPage(),errors=[];page.setDefaultTimeout(12000);
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const state=()=>page.evaluate(async()=>{const {S}=await import('/js/blocks/state.js');return {comps:S.comps,modules:S.modules,params:S.topo.params,undo:S.undoStack.length};});
 const select=async()=>{await page.evaluate(()=>blocks.selectLink('GrabLeftArm'));if(mobile&&await page.locator('#sheetMore').isVisible())await page.locator('#sheetMore').click();await page.getByRole('textbox',{name:'連桿方向角度',exact:true}).waitFor();};
 const input=async value=>{const field=page.getByRole('textbox',{name:'連桿方向角度',exact:true});await field.fill(String(value));await field.press('Tab');await page.waitForTimeout(150);};
 const point=async(x,y)=>page.evaluate(async p=>{const V=await import('/js/blocks/view.js');const q=new DOMPoint(V.TX(p.x),V.TY(p.y)).matrixTransform(document.querySelector('#stageSvg').getScreenCTM());return {x:q.x,y:q.y};},{x,y});
 const drag=async cancel=>{await page.evaluate(()=>blocks.fitView());const s=await state(),arm=s.comps.find(c=>c.id==='GrabLeftArm');if(mobile){const center=await point(arm.p2.x,arm.p2.y);await page.evaluate(async p=>{const V=await import('/js/blocks/view.js'),svg=document.querySelector('#stageSvg');V.zoomAt(svg,p.x,p.y,1.8);V.panByClient(svg,0,120);blocks.draw();},center);}const start=await point(arm.p2.x,arm.p2.y),a=35*Math.PI/180,end=await point(16+72*Math.cos(a),72*Math.sin(a));
  if(mobile){const cdp=await ctx.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});for(let i=1;i<=6;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+(end.x-start.x)*i/6,y:start.y+(end.y-start.y)*i/6}]});await page.waitForTimeout(35);}await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});await cdp.detach();}
  else{await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:8});if(cancel)await page.keyboard.press('Escape');await page.mouse.up();}await page.waitForTimeout(200);
 };
 try{
  await page.goto(base+'/blocks.html?example=iq-wheel-grabber');await page.getByRole('button',{name:'載入此範例',exact:true}).click();await page.getByRole('tab',{name:'左輪爪支承座 ═ 已安裝',exact:true}).click();await select();
  const before=await state();await input(27.35);let after=await state(),arm=after.comps.find(c=>c.id==='GrabLeftArm'),wheel=after.comps.find(c=>c.id==='GrabLeftWheel');
  assert.ok(Math.abs(Math.atan2(arm.p2.y-arm.p1.y,arm.p2.x-arm.p1.x)*180/Math.PI-27.35)<1e-8);assert.deepEqual(arm.p2,wheel.p1);assert.equal(after.undo,before.undo+1);
  assert.deepEqual(after.comps.filter(c=>c.moduleId==='GrabRight'),before.comps.filter(c=>c.moduleId==='GrabRight'));
  await page.evaluate(()=>blocks.undo());assert.deepEqual((await state()).comps,before.comps);await select();
  await drag(true);assert.deepEqual(await state(),before,'cancel restores all precise geometry and undo');await select();await drag(false);after=await state();arm=after.comps.find(c=>c.id==='GrabLeftArm');
  const angle=Math.atan2(arm.p2.y-arm.p1.y,arm.p2.x-arm.p1.x)*180/Math.PI;assert.ok(Math.abs(angle-35)<1e-7,'graphical arm rotation follows pointer');assert.equal(after.undo,before.undo+1);
  const graphical=after.comps,rounded=value=>JSON.parse(JSON.stringify(value,(_k,v)=>typeof v==='number'?Math.round(v*1e9)/1e9:v));await page.evaluate(()=>blocks.undo());await select();await input(35);assert.deepEqual(rounded((await state()).comps),rounded(graphical),'same angle from drag and precise input');
  await select();const exact=await state();await input(999);assert.deepEqual((await state()).comps,exact.comps,'out-of-range angle rejected');
  const length=page.locator('#memberDimensionInput');await length.fill('80');await length.press('Tab');await page.waitForTimeout(200);assert.equal((await state()).params.GrabLeftLength,80);await page.evaluate(()=>blocks.undo());assert.deepEqual((await state()).comps,exact.comps);await select();await length.fill('0');await length.press('Tab');await page.waitForTimeout(150);assert.equal((await state()).params.GrabLeftLength,72,'invalid arm length rejected');
  await page.screenshot({path:out+'/'+viewport.width+'-angle.png'});
  await page.evaluate(()=>blocks.saveFile());const download=page.waitForEvent('download');await page.locator('#saveProjectForm').evaluate(f=>f.requestSubmit());const path=out+'/'+viewport.width+'.json';await(await download).saveAs(path);
  await page.evaluate(()=>blocks.openFile());const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'選擇作品檔',exact:true}).click();await(await chooser).setFiles(path);await page.waitForTimeout(200);assert.deepEqual((await state()).comps,exact.comps);assert.deepEqual((await state()).modules,exact.modules);
  await page.locator('#modeBtnBench').click();await page.locator('#view3d canvas').waitFor({state:'visible'});await page.waitForTimeout(500);await page.screenshot({path:out+'/'+viewport.width+'-assembly.png'});
  assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));results.push({viewport,angle:true,drag:true,cancel:true,undo:true,reopen:true,assembly:true});
 }catch(e){results.push({viewport,error:e.stack});await page.screenshot({path:out+'/failed.png'});throw e;}finally{await ctx.close();await fs.writeFile(out+'/results.json',JSON.stringify(results,null,2));}
}}finally{await browser.close();}console.log(results);})().catch(e=>{console.error(e);process.exitCode=1;});
