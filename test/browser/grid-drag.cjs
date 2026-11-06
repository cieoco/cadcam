const assert=require('node:assert/strict'),fs=require('node:fs');const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
// 數位積木 G3a：受格孔距拖曳一步 8 mm、數字保留小數、N 孔顯示（docs/SDD-GRID-BLOCKS.md）。需先在 8021 埠提供本 repo。
(async()=>{const out=process.env.OUT||'output/grid-blocks/g3';fs.mkdirSync(out,{recursive:true});
const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),res=[];
for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:360,height:640},{width:844,height:390}]){
 const mobile=viewport.width<500,ctx=await b.newContext({viewport,isMobile:mobile,hasTouch:mobile}),p=await ctx.newPage(),errs=[];
 p.on('pageerror',e=>errs.push(e.message));p.on('dialog',d=>d.accept());p.setDefaultTimeout(12000);const r={viewport:`${viewport.width}x${viewport.height}`};
 try{
 await p.goto('http://127.0.0.1:8021/blocks.html?gripperPilot=1');await p.waitForFunction(()=>window.blocks,{},{timeout:45000});
 await p.evaluate(()=>blocks.loadExample('parallel-fourbar'));const s=p.getByRole('button',{name:'開始設計',exact:true});if(await s.isVisible().catch(()=>false))await s.click();await p.waitForTimeout(800);
 const len=()=>p.evaluate(()=>{const s=blocks.gripperPilot.snapshot(),c=s.comps.find(c=>c.id==='Link2');return s.params[c.lenParam];});
 const count=()=>p.evaluate(()=>[...document.querySelectorAll('small[data-hole-count]')].filter(e=>!e.hidden).map(e=>e.textContent).join('|'));
 await p.evaluate(()=>blocks.selectLink('Link2'));await p.waitForTimeout(600);
 r.before=await len();r.countBefore=await count();assert.equal(r.countBefore,`${r.before/8+1} 孔`);
 const h=p.locator('[data-dimension-handle="member-length"]').first();await h.waitFor();const box=await h.boundingBox();
 const dir=await p.evaluate(()=>{const s=blocks.gripperPilot.snapshot(),c=s.comps.find(c=>c.id==='Link2'),L=Math.hypot(c.p2.x-c.p1.x,c.p2.y-c.p1.y);return {x:(c.p2.x-c.p1.x)/L,y:-(c.p2.y-c.p1.y)/L};});
 const x0=box.x+box.width/2,y0=box.y+box.height/2,dist=mobile?45:60;
 await p.mouse.move(x0,y0);await p.mouse.down();for(let k=1;k<=6;k++){await p.mouse.move(x0+dir.x*dist*k/6,y0+dir.y*dist*k/6);await p.waitForTimeout(30);}
 r.countDuring=await count();await p.mouse.up();await p.waitForTimeout(700);
 r.after=await len();r.countAfter=await count();
 await p.screenshot({path:`${out}/${r.viewport}-drag.png`});
 assert.notEqual(r.after,r.before,'drag changed the length');assert.equal(r.after%8,0,'drag lands on the 8 mm grid');assert.equal(r.countAfter,`${r.after/8+1} 孔`);
 await p.evaluate(()=>{const i=document.getElementById('memberDimensionInput');i.focus();i.value='50.5';i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));});
 await p.waitForTimeout(800);r.typed=await len();r.countTyped=await count();
 assert.equal(r.typed,50.5,'typed decimals kept');assert.equal(r.countTyped,'≈ 7 孔（差 2.5 mm）');
 await p.evaluate(()=>blocks.undo());await p.waitForTimeout(500);r.undo=await len();assert.equal(r.undo,r.after,'one undo returns to the dragged value');
 await p.screenshot({path:`${out}/${r.viewport}-typed.png`});
 r.errors=errs;assert.deepEqual(errs,[]);r.ok=true;
 }catch(e){r.ok=false;r.fail=e.message;r.errors=errs;await p.screenshot({path:`${out}/${r.viewport}-fail.png`}).catch(()=>{});}
 res.push(r);await ctx.close();}
await b.close();fs.writeFileSync(`${out}/results.json`,JSON.stringify(res,null,1));for(const r of res)console.log(r.viewport,r.ok?'PASS':'FAIL '+r.fail,JSON.stringify({b:r.before,a:r.after,during:r.countDuring}));if(res.some(r=>!r.ok))process.exitCode=1;})();
