const assert=require('node:assert/strict'),fs=require('node:fs');const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
// 數位積木 G6 齒輪對格：中心距提示與建議、輸出孔拖曳吸附 8√n、一次復原、數字孔距 21 保留並標記例外（docs/SDD-GRID-BLOCKS.md R5）。需先在 8021 埠提供本 repo。
(async()=>{const out=process.env.OUT||'output/grid-blocks/g6';fs.mkdirSync(out,{recursive:true});
const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),res=[];
for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:360,height:640},{width:844,height:390}]){
 const mobile=viewport.width<500,ctx=await b.newContext({viewport,isMobile:mobile,hasTouch:mobile}),p=await ctx.newPage(),errs=[];
 p.on('pageerror',e=>errs.push(e.message));p.on('dialog',d=>d.accept());p.setDefaultTimeout(12000);const r={viewport:`${viewport.width}x${viewport.height}`};
 try{
 await p.goto('http://127.0.0.1:8021/blocks.html?gripperPilot=1');await p.waitForFunction(()=>window.blocks,{},{timeout:45000});
 await p.evaluate(()=>blocks.loadExample('gear-pair'));const s=p.getByRole('button',{name:'開始設計',exact:true});if(await s.isVisible().catch(()=>false))await s.click();await p.waitForTimeout(800);
 const hint=()=>p.evaluate(()=>[...document.querySelectorAll('[data-gear-grid-hint]')].filter(e=>!e.hidden).map(e=>e.textContent).join('|'));
 // 內建 gear-pair 已調回孔格（中心距 56 mm）；先在頁內還原成離格的 15/20 齒、中心距 70 mm 再驗提示。
 await p.evaluate(()=>{const sn=blocks.gripperPilot.snapshot();const g=sn.comps.filter(c=>c.type==='gear');g[0].teeth=15;g[1].teeth=20;sn.params.GRA=30;sn.params.GRB=40;for(const c of g)if(c.p1.id==='GCB')c.p1.x=30;blocks.gripperPilot.reopen(sn);});await p.waitForTimeout(800);
 let gid='GearB';const gear=()=>p.evaluate(id=>{const s=blocks.gripperPilot.snapshot(),c=s.comps.find(c=>c.id===id);return {teeth:c.teeth,phase:c.phase,radius:c.pinRadiusParam?s.params[c.pinRadiusParam]:c.pinRadius};},gid);
 const marked=()=>p.evaluate(()=>[...document.querySelectorAll('[data-grid-exception]')].map(e=>e.getAttribute('data-grid-exception')));
 let poly=p.locator('polygon[data-pick-component="GearB"]').first();await poly.waitFor();const pb=await poly.boundingBox();
 await p.mouse.click(pb.x+pb.width/2,pb.y+pb.height*0.25);await p.waitForTimeout(700);
 r.hintOff=await hint();assert.match(r.hintOff,/^中心距 70 mm 離格，可改齒數：(\d+\/\d+)(、\d+\/\d+){0,2}$/,'off-grid hint with suggestions');
 assert.ok((r.hintOff.match(/\d+\/\d+/g)||[]).length>=1);
 await p.screenshot({path:`${out}/${r.viewport}-hint-off.png`});
 // 範例的內嵌孔距不受 R5 檢查；改用新建齒輪對（12:20，參數孔距）驗證孔位。
 await p.evaluate(()=>blocks.confirmClearAll());await p.waitForTimeout(500);
 await p.evaluate(()=>blocks.addGearPair());await p.waitForTimeout(800);
 gid=await p.evaluate(()=>blocks.gripperPilot.snapshot().comps.filter(c=>c.type==='gear').pop().id);
 poly=p.locator(`polygon[data-pick-component="${gid}"]`).first();await poly.waitFor();
 r.hintOn=await hint();assert.equal(r.hintOn,'中心距 96 mm＝12 格');
 r.before=await gear();r.marksBefore=await marked();assert.ok(!r.marksBefore.includes(gid),'new gear pair default hole is on the grid (8 mm multiple)');assert.equal(r.before.radius%8,0);
 await p.evaluate(()=>{document.getElementById('gearMore').open=true;});await p.waitForTimeout(500);
 const h=p.locator('[data-dimension-handle="gear-hole"]').first();await h.waitFor();const hb=await h.boundingBox();
 const cb=await poly.boundingBox(),cx=cb.x+cb.width/2,cy=cb.y+cb.height/2;
 const x0=hb.x+hb.width/2,y0=hb.y+hb.height/2,tx=cx+(mobile?18:30),ty=cy-(mobile?30:45);
 await p.mouse.move(x0,y0);await p.mouse.down();for(let k=1;k<=8;k++){await p.mouse.move(x0+(tx-x0)*k/8,y0+(ty-y0)*k/8);await p.waitForTimeout(30);}
 r.during=await p.evaluate(()=>({radius:document.getElementById('gearPinRadiusVal').value,angle:document.querySelector('#gearHoleAngleVal input')?.value}));
 await p.mouse.up();await p.waitForTimeout(700);
 r.after=await gear();const n=(r.after.radius/8)**2;
 assert.ok(Math.abs(n-Math.round(n))<1e-6&&r.after.radius>=8,`radius 8*sqrt(n): ${r.after.radius}`);
 assert.notDeepEqual(r.after,r.before,'drag changed the hole');
 r.panel=await p.evaluate(()=>({radius:document.getElementById('gearPinRadiusVal').value,angle:document.querySelector('#gearHoleAngleVal input')?.value}));
 assert.ok(Math.abs(Number(r.panel.radius)-r.after.radius)<0.06,'panel radius follows snapped value');
 r.marksAfter=await marked();assert.ok(!r.marksAfter.includes(gid),'no R5 hole exception after drag');
 await p.screenshot({path:`${out}/${r.viewport}-drag.png`});
 await p.evaluate(()=>blocks.undo());await p.waitForTimeout(600);r.undo=await gear();assert.deepEqual(r.undo,r.before,'one undo returns to pre-drag hole');
 await p.mouse.click((await poly.boundingBox()).x+(await poly.boundingBox()).width*0.75,(await poly.boundingBox()).y+(await poly.boundingBox()).height*0.5);await p.waitForTimeout(600);
 const set=v=>p.evaluate(v=>{const i=document.getElementById('gearPinRadiusVal');i.value=v;i.dispatchEvent(new Event('change',{bubbles:true}));},v);
 await set('21');await p.waitForTimeout(700);r.typed=await gear();r.marksTyped=await marked();
 assert.equal(r.typed.radius,21,'typed hole distance kept');assert.ok(r.marksTyped.includes(gid),'exception mark for off-grid hole');
 await p.screenshot({path:`${out}/${r.viewport}-typed.png`});
 r.errors=errs;assert.deepEqual(errs,[]);r.ok=true;
 }catch(e){r.ok=false;r.fail=e.message;r.errors=errs;await p.screenshot({path:`${out}/${r.viewport}-fail.png`}).catch(()=>{});}
 res.push(r);await ctx.close();}
await b.close();fs.writeFileSync(`${out}/results.json`,JSON.stringify(res,null,1));for(const r of res)console.log(r.viewport,JSON.stringify(r.marksBefore),r.ok?'PASS':'FAIL '+r.fail,JSON.stringify({hint:r.hintOff,on:r.hintOn,b:r.before,a:r.after,during:r.during}));if(res.some(r=>!r.ok))process.exitCode=1;})();
