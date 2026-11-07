const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
// 數位積木 G4b：三點板邊長拖曳吸附到格上三角形、格向量提示、一次復原、數字輸入 12.5 保留且顯示「離格」。需先在 8021 埠提供本 repo。
(async()=>{
 const output=process.env.TEST_OUTPUT||'output/grid-blocks/g4b';await fs.mkdir(output,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),results=[];
 const p=(id,x,y)=>({id,x,y,type:'fixed'});
 try{for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:360,height:640},{width:844,height:390}].filter(v=>!process.env.TEST_WIDTH||v.width===Number(process.env.TEST_WIDTH))){
  const mobile=viewport.width<500,context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());page.setDefaultTimeout(12000);
  // g=24、r1=32、r2=40（3-4-5）；拖 g 時另外兩邊 32、40 能構成格上三角形的長度是 24、8√17、8√41…
  const snap={kind:'blocks',v:1,counter:1,comps:[{type:'triangle',id:'Plate',color:'#e74c3c',p1:p('A',-12,-16),p2:p('B',12,-16),p3:p('C',-12,16),gParam:'TG',r1Param:'TR1',r2Param:'TR2',sign:1}],params:{theta:0,TG:24,TR1:32,TR2:40}};
  await page.goto((process.env.TEST_URL||'http://127.0.0.1:8021')+'/blocks.html#m='+Buffer.from(JSON.stringify(snap)).toString('base64url'));await page.waitForFunction(()=>window.blocks);await page.waitForTimeout(600);await page.evaluate(()=>history.replaceState(null,'',location.pathname));
  const start=page.getByRole('button',{name:'開始設計',exact:true});if(await start.isVisible().catch(()=>false))await start.click();await page.waitForTimeout(400);
  const state=()=>page.evaluate(async()=>{const {S}=await import('/js/blocks/state.js'),{gridIssues}=await import('/js/blocks/grid-rule.js');return {g:S.topo.params.TG,r1:S.topo.params.TR1,r2:S.topo.params.TR2,undo:S.undoStack.length,issues:gridIssues(S.comps,S.topo.params).filter(i=>i.componentId==='Plate'&&i.rule==='R2').length,selected:S.selectedTriangleId};});
  const hint=()=>page.evaluate(()=>[...document.querySelectorAll('small[data-hole-count]')].filter(e=>!e.hidden).map(e=>e.textContent).join('|'));
  const select=async()=>{await page.evaluate(()=>blocks.selectLink('Plate'));await page.waitForTimeout(500);if((await state()).selected!=='Plate'){const box=await page.locator('[data-pick-component=Plate]').first().boundingBox();await page.mouse.click(box.x+box.width*.4,box.y+box.height*.5);await page.waitForTimeout(500);}assert.equal((await state()).selected,'Plate');};
  await select();
  const before=await state();assert.deepEqual([before.g,before.r1,before.r2],[24,32,40]);
  const result={viewport:`${viewport.width}x${viewport.height}`,before};
  result.hintBefore=await hint();assert.match(result.hintBefore,/格$/);assert.doesNotMatch(result.hintBefore,/離格/);assert.equal(result.hintBefore,'3 格');
  // 拖 g 的尺寸把手往外；落點必須是格上三角形的邊長
  const handle=page.locator('[data-dimension-handle="member-length"]').first();await handle.waitFor({state:'visible'});await handle.scrollIntoViewIfNeeded();
  const box=await handle.boundingBox(),x0=box.x+box.width/2,y0=box.y+box.height/2;
  const dist=mobile?70:110;
  await page.mouse.move(x0,y0);await page.mouse.down();for(let k=1;k<=8;k++){await page.mouse.move(x0+dist*k/8,y0);await page.waitForTimeout(30);}
  result.hintDuring=await hint();await page.mouse.up();await page.waitForTimeout(700);
  const dragged=await state();result.dragged=dragged;
  assert.notEqual(dragged.g,before.g,'drag changed g');assert.equal(dragged.undo,before.undo+1,'one undo step');assert.equal(dragged.issues,0,'plate still on the grid');
  const candidates=await page.evaluate(async()=>{const m=await import('/js/blocks/grid-plate.js');return m.latticeEdgeCandidates(32,40,{min:8,max:2000});});
  assert.ok(candidates.some(c=>Math.abs(c-dragged.g)<1e-3),'dragged g is a lattice candidate: '+dragged.g);
  result.hintAfter=await hint();assert.match(result.hintAfter,/格$/);assert.doesNotMatch(result.hintAfter,/離格/);
  await page.screenshot({path:`${output}/${viewport.width}-drag.png`});
  // 一次復原回到原值
  await page.evaluate(()=>blocks.undo());await page.waitForTimeout(500);
  const undone=await state();assert.deepEqual([undone.g,undone.r1,undone.r2],[24,32,40]);assert.equal(undone.undo,before.undo);
  // 數字輸入 12.5：保留小數、板離格
  await select();
  await page.evaluate(()=>{const i=document.getElementById('memberDimensionInput');i.focus();i.value='12.5';i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));});
  await page.waitForTimeout(800);
  const typed=await state();result.typed=typed;assert.equal(typed.g,12.5,'typed decimals kept');assert.equal(typed.undo,before.undo+1);
  result.hintTyped=await hint();assert.equal(result.hintTyped,'離格');
  await page.screenshot({path:`${output}/${viewport.width}-typed.png`});
  await page.evaluate(()=>blocks.undo());await page.waitForTimeout(500);assert.equal((await state()).g,24);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);result.ok=true;results.push(result);await context.close();
 }}finally{await browser.close();await fs.writeFile(`${output}/results.json`,JSON.stringify(results,null,2));}
 console.log(JSON.stringify(results));
})().catch(e=>{console.error(e);process.exitCode=1;});
