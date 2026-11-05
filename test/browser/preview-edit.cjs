// Actual rendered pixels identify the target; interaction uses mouse/touch, not a test selection API.
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {PNG}=require(process.env.PNG_MODULE||'pngjs');
const output='output/preview-edit';
async function pixel(page,accept){
 const canvas=page.locator('#view3d canvas'),box=await canvas.boundingBox(),png=PNG.sync.read(await canvas.screenshot());
 const points=[];let sx=0,sy=0;
 for(let y=3;y<png.height-3;y++)for(let x=3;x<png.width-3;x++){
  const at=(x,y)=>accept(...png.data.subarray((y*png.width+x)*4,(y*png.width+x)*4+3));
  if(at(x,y)&&at(x-2,y)&&at(x+2,y)&&at(x,y-2)&&at(x,y+2)){points.push({x,y});sx+=x;sy+=y;}
 }
 assert.ok(points.length>5,'visible part has an interior touch point');
 const cx=sx/points.length,cy=sy/points.length;
 points.sort((a,b)=>Math.hypot(a.x-cx,a.y-cy)-Math.hypot(b.x-cx,b.y-cy));
 return {x:box.x+points[0].x*box.width/png.width,y:box.y+points[0].y*box.height/png.height};
}
(async()=>{
 await fs.mkdir(output,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const results=[];
 try{for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:360,height:640}]){
  const mobile=viewport.width<500,context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto((process.env.TEST_URL||'http://127.0.0.1:8021')+'/blocks.html');await page.waitForFunction(()=>window.blocks);
  await page.evaluate(()=>window.blocks.loadExample('hydraulic-h01'));await page.getByRole('button',{name:'開始設計',exact:true}).click();
  const state=()=>page.evaluate(async()=>{const {S}=await import('/js/blocks/state.js');return {comps:S.comps,params:S.topo.params,undo:S.undoStack.length,selected:S.selectedLinkId};});
  const baseline=await state();
  const enter=async()=>{await page.evaluate(()=>window.blocks.toggle3D());await page.locator('#view3d canvas').waitFor({state:'visible'});await page.waitForTimeout(1200);};
  await enter();let p=await pixel(page,(r,g,b)=>r>80&&r>g*1.25&&g>b*1.5);
  // Moving out and back remains a camera gesture, not a tap.
  await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+40,p.y,{steps:5});await page.mouse.move(p.x,p.y,{steps:5});await page.mouse.up();
  assert.ok(await page.locator('#view3d').isVisible());assert.deepEqual(await state(),baseline);
  if(mobile){
   const cdp=await context.newCDPSession(page);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y},{x:p.x+35,y:p.y+35}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{x:p.x,y:p.y}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   assert.ok(await page.locator('#view3d').isVisible());
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await cdp.detach();
   assert.ok(await page.locator('#view3d').isVisible());
  }
  p=await pixel(page,(r,g,b)=>r>80&&r>g*1.25&&g>b*1.5);await page.screenshot({path:`${output}/${viewport.width}-before-pick.png`});
  if(mobile)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);
  await page.locator('#view3d').waitFor({state:'hidden'});
  const selected=await state();assert.equal(selected.selected,'H1Arm');assert.deepEqual({...selected,selected:baseline.selected},baseline);
  assert.ok(await page.locator('#memberDimensionInput').isVisible());
  assert.equal(await page.locator('#lenEditor input[type=range]').count(),0,'member editor no longer duplicates the graphical dimension with a range slider');
  await page.screenshot({path:`${output}/${viewport.width}-selected.png`});
  // The original dimension setter still owns validation, undo and persistence.
  await page.locator('#memberDimensionInput').fill('84');await page.locator('#memberDimensionInput').press('Tab');
  assert.equal((await state()).params.H1Arm,84);await page.evaluate(()=>window.blocks.undo());assert.deepEqual((await state()).params,baseline.params);
  await enter();p=await pixel(page,(r,g,b)=>g>r+9&&b>r+6&&g>=b&&r>70);
  if(mobile)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);
  await page.locator('#syringeEditor').waitFor({state:'visible'});
  const beforeCancel=await state();assert.deepEqual(beforeCancel.comps,baseline.comps);
  await page.locator('#syringeEditor').getByRole('button',{name:'完成',exact:true}).click();assert.deepEqual(await state(),beforeCancel);
  await page.screenshot({path:`${output}/${viewport.width}-after-cancel.png`});
  assert.deepEqual(errors,[]);results.push({viewport,pick:true,drag:true,multitouch:mobile,dimensionUndo:true,syringeCancel:true,errors});await context.close();
 }}finally{await browser.close();}
 await fs.writeFile(`${output}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));
})().catch(e=>{console.error(e);process.exitCode=1;});
