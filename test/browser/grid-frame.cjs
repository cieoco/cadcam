const assert=require('node:assert/strict'),fs=require('node:fs');const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
// 數位積木 G4a：固定孔拖曳對格、機架方向吸附格點角度、新增孔吸附、移除 8 mm 吸附開關（docs/SDD-GRID-BLOCKS.md）。需先在 8021 埠提供本 repo。
(async()=>{const out=process.env.OUT||'output/grid-blocks/g4a';fs.mkdirSync(out,{recursive:true});
const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),res=[];
for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:360,height:640},{width:844,height:390}].filter(v=>!process.env.TEST_WIDTH||v.width===+process.env.TEST_WIDTH)){
 const mobile=viewport.width<500,ctx=await b.newContext({viewport,isMobile:mobile,hasTouch:mobile}),p=await ctx.newPage(),errs=[];
 p.on('pageerror',e=>errs.push(e.message));p.on('dialog',d=>d.accept());p.setDefaultTimeout(12000);const r={viewport:`${viewport.width}x${viewport.height}`};
 try{
 await p.goto('http://127.0.0.1:8021/blocks.html?gripperPilot=1');await p.waitForFunction(()=>window.blocks,{},{timeout:45000});
 const load=async id=>{await p.evaluate(id=>blocks.loadExample(id),id);const s=p.getByRole('button',{name:'開始設計',exact:true});if(await s.isVisible().catch(()=>false))await s.click();await p.waitForTimeout(800);};
 const snap=()=>p.evaluate(()=>blocks.gripperPilot.snapshot());
 const pt=(s,id)=>{for(const c of s.comps)for(const k of ['p1','p2','p3'])if(c[k]?.id===id)return c[k];};
 const screen=w=>p.evaluate(async w=>{const V=await import('/js/blocks/view.js'),svg=document.getElementById('stageSvg'),m=svg.getScreenCTM();const q=new DOMPoint(V.TX(w.x),V.TY(w.y)).matrixTransform(m);return {x:q.x,y:q.y};},w);
 // 小畫面：先收合抽屜、把目標平移到可見區（沿用既有 frame-holes 測試的 panByClient 作法），不屬於作品修改。
 const collapse=async()=>{const d=p.getByRole('button',{name:'完成／收合',exact:true});if(await d.isVisible().catch(()=>false)){await d.click();await p.waitForTimeout(300);}};
 const reveal=async w=>{const q=await screen(w),svg=await p.locator('#stageSvg').boundingBox(),c=await p.locator('.controls').boundingBox().catch(()=>null);const bottom=c&&c.y>svg.y+150?c.y:svg.y+svg.height;const tx=svg.x+svg.width*0.45,ty=svg.y+(bottom-svg.y)*0.45;await p.evaluate(async({dx,dy})=>{const V=await import('/js/blocks/view.js');V.panByClient(document.querySelector('#stageSvg'),dx,dy);blocks.draw();},{dx:tx-q.x,dy:ty-q.y});await p.waitForTimeout(200);return screen(w);};
 const drag=async(a,bp)=>{await p.mouse.move(a.x,a.y);await p.mouse.down();for(let k=1;k<=6;k++){await p.mouse.move(a.x+(bp.x-a.x)*k/6,a.y+(bp.y-a.y)*k/6);await p.waitForTimeout(30);}await p.mouse.up();await p.waitForTimeout(700);};
 r.lockText=await p.evaluate(()=>document.body.innerText.includes('8 mm 吸附'));assert.equal(r.lockText,false,'toggle removed');
 await load('fourbar-double-crank');
 // 1. 固定孔拖曳 → 8 mm 世界格
 let s0=await snap();const A0=pt(s0,'A'),B0=pt(s0,'B');await collapse();const sb=await reveal(B0);
 if(mobile)await p.touchscreen.tap(sb.x,sb.y);else await p.mouse.click(sb.x,sb.y);await p.waitForTimeout(400);
 r.selected=await p.evaluate(async()=>(await import('/js/blocks/state.js')).S.selectedNodeId);await p.evaluate(()=>blocks.toggleGroundPositionLock());await p.waitForTimeout(200);
 const sb2=await screen(B0);   // 選取後編輯面板可能改變畫布寬度（橫向小畫面），拖曳起點要用面板展開後的位置
 await drag(sb2,{x:sb2.x+13,y:sb2.y-9});
 let s1=await snap();const B1=pt(s1,'B');r.A=[B1.x,B1.y];assert.equal(r.selected,'B');assert.ok(B1.x!==B0.x||B1.y!==B0.y,'fixed hole moved');assert.equal(B1.x%8,0);assert.equal(B1.y%8,0);
 await p.evaluate(()=>blocks.undo());await p.waitForTimeout(500);s1=await snap();assert.deepEqual([pt(s1,'B').x,pt(s1,'B').y],[B0.x,B0.y],'undo');
 // 2. 機架方向拖曳 → 第二固定孔落在格點、軸距不變
 await p.locator('#stageSvg text').filter({hasText:'🏠'}).first().click();await p.waitForTimeout(400);
 const h=p.locator('[data-dimension-handle="frame-angle"]').first();await h.waitFor();const hb=await h.boundingBox(),hc={x:hb.x+hb.width/2,y:hb.y+hb.height/2};
 const ca=await screen(A0),v={x:hc.x-ca.x,y:hc.y-ca.y},rad=Math.hypot(v.x,v.y),ang=Math.atan2(v.y,v.x)-0.55;
 await drag(hc,{x:ca.x+rad*Math.cos(ang),y:ca.y+rad*Math.sin(ang)});
 const s2=await snap(),A2=pt(s2,'A'),B2=pt(s2,'B');r.B=[B2.x,B2.y];const dx=B2.x-A2.x,dy=B2.y-A2.y;
 assert.ok(Math.abs(Math.hypot(dx,dy)-80)<1e-6,'axis length kept');assert.ok(Math.abs(dx-B0.x+A0.x)>1e-6||Math.abs(dy)>1e-6,'rotated');
 assert.ok(Math.abs(dx/8-Math.round(dx/8))<1e-6&&Math.abs(dy/8-Math.round(dy/8))<1e-6,`second axis on a lattice point (${dx},${dy})`);
 await p.screenshot({path:`${out}/${r.viewport}-angle.png`});
 await p.evaluate(()=>blocks.undo());await p.waitForTimeout(500);
 // 3. 新增孔：點在 u≈27 → 吸附 u=24（世界對齊機架）
 await p.locator('#stageSvg text').filter({hasText:'🏠'}).first().click().catch(()=>{});await p.waitForTimeout(300);
 const add=p.getByRole('button',{name:'新增孔',exact:true});if(viewport.width<1000){await p.locator('[data-dimension-handle="frame-angle"]').click();await p.waitForTimeout(300);}   // 同 frame-holes：小畫面要點方向把手才會展開機架編輯面板
 await add.click();await p.getByRole('button',{name:'取消新增',exact:true}).waitFor();
 const at=await reveal({x:A0.x+27,y:A0.y});   // 不可再按「完成／收合」：點抽屜外會取消放孔模式
 if(mobile)await p.touchscreen.tap(at.x,at.y);else await p.mouse.click(at.x,at.y);await p.waitForTimeout(700);
 const s3=await snap(),hole=s3.comps.find(c=>c.frameHole);r.holeU=hole?.frameHole.u;assert.equal(r.holeU,24,'hole placement snaps');
 assert.equal(hole.p1.x%8,0);assert.equal(hole.p1.y%8,0);
 await p.screenshot({path:`${out}/${r.viewport}-hole.png`});
 r.errors=errs;assert.deepEqual(errs,[]);r.ok=true;
 }catch(e){r.ok=false;r.fail=e.message;r.errors=errs;await p.screenshot({path:`${out}/${r.viewport}-fail.png`}).catch(()=>{});}
 res.push(r);await ctx.close();}
await b.close();fs.writeFileSync(`${out}/results.json`,JSON.stringify(res,null,1));for(const r of res)console.log(r.viewport,r.ok?'PASS':'FAIL '+r.fail,JSON.stringify({A:r.A,B:r.B,u:r.holeU}));if(res.some(r=>!r.ok))process.exitCode=1;})();
