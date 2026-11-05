const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[],results=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const base=(process.env.TEST_URL||'http://127.0.0.1:8021')+'/blocks.html';
 const choose=key=>page.locator('#pointDimensionEditor [data-dimension-choice='+JSON.stringify(key)+']').click();
  const state=()=>page.evaluate(async()=>{const {S}=await import('/js/blocks/state.js');return {comps:S.comps,params:S.topo.params,undo:S.undoStack.length};});
 const read=page.getByRole('textbox',{name:'所選零件孔距（mm）',exact:true}),select=page.locator('#pointDimensionEditor [data-choices]');
 const p=(id,x,y,type='floating')=>({id,x,y,type});
 try{
  await page.goto(base);await page.waitForFunction(()=>window.blocks);
  for(const shape of ['bar','triangle']){
   const comp={type:shape,id:'CustomPiece',color:'#3498db',p1:p('Origin',0,0,'fixed'),p2:p('End',80,0),fixedLen:true,snapLength:false};
   const params={theta:0};
   if(shape==='bar'){comp.lenParam='Length';params.Length=80;}
   else{Object.assign(comp,{p3:p('Corner',40,60),gParam:'Base',r1Param:'Left',r2Param:'Right'});Object.assign(params,{Base:80,Left:Math.hypot(40,60),Right:Math.hypot(40,60)});}
   const hash=await page.evaluate(async snap=>(await import('/js/share-codec.js')).encodeSnapshot(snap),{kind:'blocks',v:1,counter:1,comps:[comp],params});
   await page.goto(base+'#m='+hash);await page.reload();await page.waitForFunction(()=>window.blocks);await page.waitForTimeout(600);
   await page.locator(`[data-id="${shape==='bar'?'End':'Corner'}"]`).last().click();
   if(shape==='triangle')await choose(JSON.stringify(['CustomPiece','r1']));
   await read.waitFor({state:'visible'});const before=await state();
   await read.fill(shape==='bar'?'100':'76');await read.press('Tab');
   const changed=await state(),key=shape==='bar'?'Length':'Left';
   assert.equal(changed.params[key],shape==='bar'?100:76);assert.equal(changed.undo,before.undo+1);
   if(shape==='triangle'){assert.equal(changed.params.Base,before.params.Base);assert.equal(changed.params.Right,before.params.Right);}
   const handle=page.locator('[data-dimension-handle="point-dimension"]');await handle.focus();await page.keyboard.press('ArrowRight');
   assert.equal((await state()).params[key],changed.params[key]+.1);
   await page.evaluate(()=>window.blocks.undo());assert.deepEqual((await state()).params,changed.params);
   await page.screenshot({path:`output/point-dimensions/${shape}.png`});results.push({shape,numeric:true,handleKeyboard:true,undo:true});
  }
  await page.evaluate(()=>window.blocks.loadExample('hydraulic-h06'));
  const start=page.getByRole('button',{name:'開始設計',exact:true});if(await start.isVisible())await start.click();await page.waitForTimeout(600);
  const before=await state(),turn=before.comps.find(c=>c.shape==='disk'&&c.p2.type==='floating');assert.ok(turn);
  await page.locator(`[data-id="${turn.p2.id}"]`).last().click();await choose(JSON.stringify([turn.id,'g']));
  await read.fill('20');await read.press('Tab');const after=await state();assert.equal(after.params[turn.lenParam],20);assert.equal(after.undo,before.undo+1);
  for(const key of Object.keys(before.params))if(key!==turn.lenParam)assert.equal(after.params[key],before.params[key],`unrelated dimension ${key}`);
  await page.screenshot({path:'output/point-dimensions/h06.png'});results.push({example:'H06',scope:true,unchangedOtherDimensions:true});
  assert.deepEqual(errors,[]);await fs.writeFile('output/point-dimensions/general-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
