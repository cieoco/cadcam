const assert=require('node:assert/strict'),fs=require('node:fs');const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
// 數位積木 G2：離格例外標示、參數離格提示、復原、載入不提示、製作包一節（docs/SDD-GRID-BLOCKS.md）。需先在 8021 埠提供本 repo。
(async()=>{const out='output/grid-blocks/g2';fs.mkdirSync(out,{recursive:true});
const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),res=[];
for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:360,height:640},{width:844,height:390}]){
 const mobile=viewport.width<500,ctx=await b.newContext({viewport,isMobile:mobile,hasTouch:mobile,acceptDownloads:true}),p=await ctx.newPage(),errs=[];
 p.on('pageerror',e=>errs.push(e.message));p.on('dialog',d=>d.accept());p.setDefaultTimeout(12000);
 const r={viewport:`${viewport.width}x${viewport.height}`};
 try{
 await p.goto('http://127.0.0.1:8021/blocks.html?gripperPilot=1');await p.waitForFunction(()=>window.blocks,{},{timeout:45000});
 const load=async id=>{await p.evaluate(id=>blocks.loadExample(id),id);const s=p.getByRole('button',{name:'開始設計',exact:true});if(await s.isVisible().catch(()=>false))await s.click();await p.waitForTimeout(800);};
 const marks=()=>p.evaluate(()=>[...document.querySelectorAll('[data-grid-exception]')].map(e=>e.getAttribute('data-grid-exception')));
 const banner=()=>p.evaluate(()=>document.getElementById('modeBanner')?.textContent||'');
 await load('parallel-fourbar');r.cleanMarks=(await marks()).length;assert.equal(r.cleanMarks,0,'on-grid example has no marks');
 await p.evaluate(()=>blocks.selectLink('Link1'));await p.waitForTimeout(400);
 await p.evaluate(()=>{const i=document.getElementById('memberDimensionInput');i.focus();i.value='50';i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));});
 await p.waitForTimeout(900);
 r.lenAfter=await p.evaluate(()=>{const s=blocks.gripperPilot.snapshot(),c=s.comps.find(c=>c.id==='Link1');return s.params[c.lenParam];});
 r.banner=await banner();r.marksAfterEdit=await marks();r.panel=await p.evaluate(()=>[...document.querySelectorAll('[data-grid-panel]')].map(e=>e.textContent.trim()).join(' / '));
 await p.screenshot({path:`${out}/${r.viewport}-edit.png`});
 assert.equal(r.lenAfter,50,'numeric input keeps the exact off-grid value');assert.ok(r.banner.includes('離開 8 mm 孔格'),'banner');assert.ok(r.marksAfterEdit.includes('Link1'),'mark');assert.ok(r.panel.includes('孔格例外'),'panel');
 await p.evaluate(()=>blocks.undo());await p.waitForTimeout(700);r.marksAfterUndo=(await marks()).length;assert.equal(r.marksAfterUndo,0,'undo clears marks');
 await load('fourbar-crank-rocker');r.loadMarks=await marks();r.loadBanner=await banner();
 assert.deepEqual([...r.loadMarks].sort(),['Link1','Link2','frame:'].sort());assert.ok(!r.loadBanner.includes('離開'),'no notice on load');
 await p.screenshot({path:`${out}/${r.viewport}-example.png`});
 const [dl]=await Promise.all([p.waitForEvent('download',{timeout:15000}),p.evaluate(()=>blocks.downloadBuildPack())]);const html=fs.readFileSync(await dl.path(),'utf8');
 r.packSection=html.includes('id="gridExceptions"');r.packRows=(html.match(/data-grid-exceptions/g)||[]).length;assert.ok(r.packSection,'build pack section');
 r.errors=errs;assert.deepEqual(errs,[]);r.ok=true;
 }catch(e){r.ok=false;r.fail=e.message;r.errors=errs;await p.screenshot({path:`${out}/${r.viewport}-fail.png`}).catch(()=>{});}
 res.push(r);await ctx.close();}
await b.close();fs.writeFileSync(`${out}/results.json`,JSON.stringify(res,null,1));for(const r of res)console.log(r.viewport,r.ok?'PASS':'FAIL '+r.fail);if(res.some(r=>!r.ok))process.exitCode=1;})();
