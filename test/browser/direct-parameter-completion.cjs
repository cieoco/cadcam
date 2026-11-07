const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const out='output/direct-parameter-completion';await fs.mkdir(out,{recursive:true});
 const loose=JSON.parse(await fs.readFile('test/fixtures/loose-bar-rotation.json','utf8'));
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),results=[];
 try{for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:360,height:640},{width:844,height:390}].filter(v=>!process.env.TEST_WIDTH||v.width===+process.env.TEST_WIDTH)){
  console.log('viewport',viewport.width);const mobile=viewport.width<500,context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  const state=()=>page.evaluate(async()=>{const{S}=await import('/js/blocks/state.js');const{toSnapshot}=await import('/js/blocks/schema.js');return {work:toSnapshot(S.comps,S.topo,S.counter,{activeMotor:S.activeMotor,motorAngles:S.motorAngles,fabrication:S.fabrication,modules:S.modules}),undo:S.undoStack.length};});
  const open=async fixture=>{await page.goto('about:blank');await page.goto('http://127.0.0.1:8021/blocks.html#m='+Buffer.from(JSON.stringify(fixture)).toString('base64url'));await page.waitForFunction(()=>window.blocks,null,{timeout:45000});await page.evaluate(()=>{history.replaceState(null,'',location.pathname);blocks.fitView();});await page.waitForTimeout(150);};
  const load=async id=>{await page.evaluate(id=>blocks.loadExample(id),id);const b=page.getByRole('button',{name:'開始設計',exact:true});if(await b.isVisible())await b.click();await page.waitForTimeout(150);};
  const world=async p=>page.evaluate(async p=>{const V=await import('/js/blocks/view.js');const q=new DOMPoint(V.TX(p.x),V.TY(p.y)).matrixTransform(document.querySelector('#stageSvg').getScreenCTM());return {x:q.x,y:q.y};},p);
  const tap=async p=>mobile?page.touchscreen.tap(p.x,p.y):page.mouse.click(p.x,p.y);
  const center=async key=>{const r=await page.locator(`[data-dimension-handle="${key}"] circle`).nth(1).boundingBox();assert.ok(r,key+' exists');return {x:r.x+r.width/2,y:r.y+r.height/2};};
  const expand=async()=>{if(mobile&&await page.locator('#sheetMore').isVisible()&&!['half','full'].includes(await page.locator('body').getAttribute('data-sheet')))await page.locator('#sheetMore').click();};
  const input=async(locator,value)=>{await locator.fill(String(value));await locator.press('Tab');await page.waitForTimeout(120);};
  const undo=async before=>{await page.evaluate(()=>blocks.undo());assert.deepEqual((await state()).work,before.work,'one undo restores work');};
  const drag=async(key,delta,cancel=false)=>{
   const p=await center(key),q={x:p.x+delta.x,y:p.y+delta.y},before=await state();
   assert.ok(await page.evaluate(p=>!!document.elementFromPoint(p.x,p.y)?.closest('[data-dimension-handle]'),p),key+' is reachable');
   if(mobile){const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[q]});assert.deepEqual(await state(),before,'draft never writes');await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});await cdp.detach();}
   else{await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(q.x,q.y,{steps:5});assert.deepEqual(await state(),before,'draft never writes');if(cancel)await page.keyboard.press('Escape');await page.mouse.up();}
   await page.waitForTimeout(160);if(cancel)assert.deepEqual(await state(),before,'cancel preserves precise values');return before;
  };
  const reopen=async()=>{const saved=(await state()).work;await page.waitForTimeout(1200);await page.reload();await page.waitForFunction(()=>window.blocks,null,{timeout:45000});assert.deepEqual((await state()).work,saved,'save/reopen preserves work');};
  await open(loose);await page.evaluate(()=>blocks.selectLink('Link11'));await expand();
  const beforeAngle=await state();await input(page.getByRole('textbox',{name:'連桿方向角度',exact:true}),'27.35');
  let after=await state(),bar=after.work.comps.find(c=>c.id==='Link11');
  assert.ok(Math.abs(Math.atan2(bar.p2.y-bar.p1.y,bar.p2.x-bar.p1.x)*180/Math.PI-27.35)<1e-7);assert.deepEqual(after.work.params,beforeAngle.work.params);assert.equal(after.undo,beforeAngle.undo+1);await undo(beforeAngle);
  await page.screenshot({path:`${out}/${viewport.width}-angle.png`});
  const selectMiddle=async()=>{const c=(await state()).work.comps.find(c=>c.id==='H2Arm');await tap(await world({x:(c.p2.x+c.p3.x)/2,y:(c.p2.y+c.p3.y)/2}));const choice=page.getByRole('button',{name:/H2Arm.*尺寸/});if(await choice.isVisible())await choice.click();};
  await load('hydraulic-h02');await selectMiddle();await expand();await page.evaluate(()=>blocks.fitView());await page.waitForTimeout(150);
  const middleField=page.locator('#memberDimensionInput');const middleBefore=await state();await input(middleField,145.9);let middle=(await state()).work;
  assert.equal(middle.params.H2Arm,145.9);assert.ok(Math.abs(middle.params.H2Arm+middle.params.H2Tail-250)<1e-7);await undo(middleBefore);await selectMiddle();await expand();
  await drag('member-length',{x:10,y:-8},true);const beforeMiddle=await drag('member-length',{x:10,y:-8});const middleResult=(await state()).work;assert.notEqual(middleResult.params.H2Arm,beforeMiddle.work.params.H2Arm);assert.ok(Number.isInteger(middleResult.params.H2Arm));assert.ok(Math.abs(middleResult.params.H2Arm+middleResult.params.H2Tail-250)<1e-7);
  await undo(beforeMiddle);await selectMiddle();await expand();await input(middleField,middleResult.params.H2Arm);assert.deepEqual((await state()).work,middleResult,'straight middle hole pointer and number agree');await page.screenshot({path:`${out}/${viewport.width}-middle-hole.png`});
  await load('hydraulic-h07');await page.getByRole('button',{name:'針筒設定',exact:true}).click();await page.locator('#syringeEditor').waitFor();await page.waitForTimeout(350);
  const stroke=page.getByRole('textbox',{name:'針筒伸出量數值（mm）',exact:true}),beforeStroke=await state();
  await input(stroke,'8.25');assert.equal((await state()).work.comps.find(c=>c.type==='syringe').extension,8.25);await undo(beforeStroke);
  await drag('syringe-stroke',{x:15,y:0},true);const beforeDrag=await drag('syringe-stroke',{x:15,y:0});after=await state();
  const extended=after.work.comps.find(c=>c.type==='syringe').extension;assert.notEqual(extended,beforeDrag.work.comps.find(c=>c.type==='syringe').extension);assert.ok(Number.isInteger(extended));assert.equal(after.undo,beforeDrag.undo+1);const graphical=after.work;await undo(beforeDrag);
  await input(stroke,extended);assert.deepEqual((await state()).work,graphical,'stroke pointer and number use same candidate');await page.screenshot({path:`${out}/${viewport.width}-stroke.png`});await reopen();
  await load('gear-pair');
  const selectGear=async()=>{const s=(await state()).work,g=s.comps.filter(c=>c.type==='gear')[1],r=s.params[g.radiusParam];await tap(await world({x:g.p1.x+r*.5,y:g.p1.y+r*.65}));await expand();await page.locator('[data-dimension-handle="gear-hole"]').waitFor();await page.evaluate(()=>blocks.fitView());await page.waitForTimeout(150);return g.id;};
  const gearId=await selectGear();await tap(await center('gear-hole'));await page.locator('#gearMore[open]').waitFor();const beforeGear=await state();
  await input(page.getByRole('textbox',{name:'輸出孔起始角度',exact:true}),'35.25');assert.equal((await state()).work.comps.find(c=>c.id===gearId).phase,35.25);await undo(beforeGear);await selectGear();
  await drag('gear-hole',{x:-9,y:-22},true);const beforeHole=await drag('gear-hole',{x:-9,y:-22});after=await state();
  const changed=after.work.comps.find(c=>c.id===gearId);assert.notEqual(changed.phase,0);assert.ok(Number.isFinite(changed.phase));assert.equal(after.undo,beforeHole.undo+1);const holeResult=after.work;await undo(beforeHole);await selectGear();
  const radius=changed.pinRadiusParam?after.work.params[changed.pinRadiusParam]:changed.pinRadius;
  await input(page.getByRole('spinbutton',{name:'輸出孔距',exact:true}),radius);await input(page.getByRole('textbox',{name:'輸出孔起始角度',exact:true}),changed.phase);assert.deepEqual((await state()).work,holeResult,'hole pointer and number agree');
  await page.screenshot({path:`${out}/${viewport.width}-gear.png`});await reopen();
  // A plain chain fixture is deliberately independent of the tutorial's attached linkage.
  const chain=await page.evaluate(async()=>{const {placeChainDrive}=await import('/js/blocks/chain-tools.js');const r=placeChainDrive([],{}, {x:0,y:0},{x:90,y:0});return {kind:'blocks',v:1,counter:2,comps:r.comps,params:r.params};});
  const selectChain=async()=>{const s=(await state()).work,g=s.comps.find(c=>c.id.includes('SprocketB')),r=s.params[g.radiusParam];await tap(await world({x:g.p1.x+r*.4,y:g.p1.y+r*.7}));await expand();await page.locator('[data-dimension-handle="chain-center"]').waitFor();await page.evaluate(()=>blocks.fitView());await page.waitForTimeout(150);};
  await open(chain);await selectChain();await tap(await center('chain-center'));await page.locator('#sprocketMore[open]').waitFor();
  const chainField=page.getByRole('textbox',{name:'鏈輪中心距（mm）',exact:true});const initial=await state();const old=Number(await chainField.inputValue());await input(chainField,old+3.25);assert.equal((await state()).undo,initial.undo+1);await undo(initial);await selectChain();
  await drag('chain-center',{x:15,y:0},true);const beforeChain=await drag('chain-center',{x:15,y:0});after=await state();assert.equal(after.undo,beforeChain.undo+1);const chainResult=after.work,newC=Number(await chainField.inputValue());assert.ok(Number.isInteger(newC));await undo(beforeChain);await selectChain();await input(chainField,newC);assert.deepEqual((await state()).work,chainResult,'chain pointer and number agree');
  await page.screenshot({path:`${out}/${viewport.width}-chain.png`});await reopen();
  assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');results.push({viewport,angle:true,middleHole:true,stroke:true,gear:true,chain:true,cancel:true,undo:true,reopen:true});await context.close();
 }}finally{await browser.close();}
 await fs.writeFile(out+'/results.json',JSON.stringify(results,null,2));console.log(results);
})().catch(e=>{console.error(e);process.exitCode=1;});
