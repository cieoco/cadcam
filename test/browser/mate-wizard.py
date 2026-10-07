# M4 瀏覽器合約：組立台的接合精靈（手機與電腦同一套）。真實點擊／觸控；狀態只用來讀結果。
# 用法：python3 test/browser/mate-wizard.py [URL] [desktop|phone] [截圖.png]
import sys, json
from playwright.sync_api import sync_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8766/blocks.html'
KIND = sys.argv[2] if len(sys.argv) > 2 else 'phone'
SHOT = sys.argv[3] if len(sys.argv) > 3 else None
phone = KIND == 'phone'; W, H = (390, 844) if phone else (1280, 800)
res = []
def ok(i, d, c): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + i + ' ' + d)
ST = """async()=>{const {S}=await import('./js/blocks/state.js');
 return {mode:S.mode,undo:S.undoStack.length,snap:JSON.stringify([S.comps,S.modules.map(m=>[m.id,m.mount||null])]),
   mods:S.modules.map(m=>({id:m.id,name:m.name,mount:m.mount?{to:m.mount.to,orient:m.mount.orient||null,face:!!m.mount.face}:null}))}}"""
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'])
    ctx = b.new_context(viewport={'width': W, 'height': H}, has_touch=True, is_mobile=True) if phone else b.new_context(viewport={'width': W, 'height': H})
    pg = ctx.new_page(); errs = []
    pg.on('console', lambda m: errs.append(m.text[:160]) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)[:160]))
    pg.goto(URL); pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_timeout(1500)
    def lib(n): pg.evaluate("n=>[...document.querySelectorAll('#moduleLibrary .block, #moduleLibrary > *, #moduleLibrary button')].find(e=>e.textContent.includes(n)).click()", n); pg.wait_for_timeout(700)
    def st(): return pg.evaluate(ST)
    def dbg(): return pg.evaluate("window.blocks.mateWizardDebug()")
    def vis(sel): return pg.evaluate("s=>{const e=document.querySelector(s);if(!e)return false;const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none'}", sel)
    def tap(sel):
        loc = pg.locator(sel).first; loc.scroll_into_view_if_needed(); pg.wait_for_timeout(120)
        (loc.tap() if phone else loc.click()); pg.wait_for_timeout(700)
    def hit(x, y):
        (pg.touchscreen.tap(x, y) if phone else pg.mouse.click(x, y)); pg.wait_for_timeout(800)
    def shot(n):
        if SHOT: pg.screenshot(path=SHOT.replace('.png', '_' + n + '.png'))
    # 精靈區內看得到的按鈕：都夠大、不超出畫面、彼此不重疊
    BTN = """()=>{const out=[];document.querySelectorAll('#benchPanel button, #mateTree button, #mateTree [role=button]').forEach(e=>{const r=e.getBoundingClientRect(),cs=getComputedStyle(e);
      if(r.width>0&&r.height>0&&cs.visibility!=='hidden'&&cs.display!=='none'&&!e.closest('details:not([open])')) out.push({t:(e.textContent||'').trim().slice(0,14),x:r.x,y:r.y,w:r.width,h:r.height});});return out}"""
    def buttons_ok():
        bs = pg.evaluate(BTN); bad = []
        for i, u in enumerate(bs):
            if u['h'] < 40 or u['x'] < -1 or u['x'] + u['w'] > W + 1: bad.append(('size', u['t'], round(u['h']), round(u['x']), round(u['w'])))
            for v in bs[i + 1:]:
                ox = min(u['x'] + u['w'], v['x'] + v['w']) - max(u['x'], v['x']); oy = min(u['y'] + u['h'], v['y'] + v['h']) - max(u['y'], v['y'])
                if ox > 2 and oy > 2: bad.append(('overlap', u['t'], v['t']))
        if bad: print('   ', bad[:6])
        return len(bs) > 0 and not bad
    lib('四連桿升降'); lib('齒輪夾爪')
    pg.evaluate("window.blocks.setMode('bench')"); pg.wait_for_timeout(3000)
    s0 = st(); d = dbg()
    L = [m for m in s0['mods'] if '四連桿' in m['name']][0]; G = [m for m in s0['mods'] if '夾爪' in m['name']][0]
    ok('a1', '預設就是精靈（不是工程模式），舊的「六面體精靈」按鈕不在畫面上', d['advanced'] is False and not vis('#benchFaceWizard'))
    ok('a2', '結構清單有兩列（四連桿、夾爪），夾爪標成未安裝', len(d['tree']) == 2 and [t for t in d['tree'] if t['id'] == G['id']][0]['unmounted'] is True and vis('#mateTree'))
    ok('a3', '自動選中唯一有地方可接的機構（夾爪），進入「選承接面」', d['selected'] == G['id'] and d['state'] == 'pick')
    ok('a4', '可接的承接面：工具架上緣、下緣，各一張大卡片', len([t for t in d['targets'] if t['ok']]) == 2 and pg.locator('.mate-target').count() >= 2)
    ok('a5', '精靈區的按鈕都 ≥ 40 px 高、不超出畫面、彼此不重疊', buttons_ok())
    ok('a6', '卡片文字不出現內部零件名稱', not pg.evaluate("/[A-Za-z]+_\\d+|ToolBrace|LiftCrank/.test((document.querySelector('#benchPanel')||{}).innerText||'')"))
    ok('a7', '3D 裡的機構夠大：機構外框至少佔 3D 畫面寬或高的 40%', (d.get('view') or {}).get('fill', 0) >= 0.4)
    shot('pick')
    low = [t for t in d['targets'] if '下緣' in t['name']][0]; up = [t for t in d['targets'] if '上緣' in t['name']][0]
    # b. 預覽
    tap(f".mate-target[data-mate='{low['mateId']}']"); d1 = dbg(); s1 = st()
    ok('b1', '點「工具架下緣」→ 進入預覽；作品還沒被改（沒有多的復原紀錄）', d1['state'] == 'preview' and s1['snap'] == s0['snap'] and s1['undo'] == s0['undo'])
    ok('b2', '預覽時看得到「接上」「取消」與三種接法', vis('#mateCommit') and vis('#mateCancel') and pg.locator('.mate-style').count() == 3 and d1['preview']['style'] == 'hang')
    ok('b3', '預覽時顯示目前有沒有干涉（數字）', isinstance(d1['preview'].get('hits'), int))
    ok('b4', '預覽畫面的按鈕都夠大、不重疊', buttons_ok())
    INVIEW = "s=>{const e=document.querySelector(s);if(!e)return false;const r=e.getBoundingClientRect();return r.height>0&&r.top>=0&&r.bottom<=innerHeight+1}"
    ok('b5', '預覽時不用捲動就看得到干涉狀態（#mateLive）與「接上」', pg.evaluate(INVIEW, '#mateLive') and pg.evaluate(INVIEW, '#mateCommit'))
    ok('b6', '預覽時機構仍夠大（≥ 40%）', (d1.get('view') or {}).get('fill', 0) >= 0.4)
    shot('preview')
    tap(".mate-style[data-style='stand-top']"); ok('c1', '切到「立在上面」', dbg()['preview']['style'] == 'stand-top')
    tap(".mate-style[data-style='hang']"); ok('c2', '切回「壓在邊上」', dbg()['preview']['style'] == 'hang')
    o0 = dbg()['preview'].get('offsetMm', 0); tap(".mate-adj[data-act='slide+']"); o1 = dbg()['preview'].get('offsetMm', 0)
    ok('c3', '沿邊滑一格：位置 +5 mm（或已到盡頭維持不變並說明）', o1 == o0 + 5 or (o1 == o0 and len(pg.evaluate("(document.querySelector('#benchPanel')||{}).innerText||''")) > 0))
    ok('c4', '預覽中調整不寫入作品', st()['snap'] == s0['snap'] and st()['undo'] == s0['undo'])
    tap('#mateCancel'); d2 = dbg()
    ok('d1', '取消 → 回到選承接面，作品完全沒變', d2['state'] == 'pick' and st()['snap'] == s0['snap'])
    # e. 從 3D 裡點承接面
    t3 = [t for t in d2['targets'] if t['mateId'] == up['mateId']][0]
    cv = pg.evaluate("(()=>{const c=document.querySelector('#stage3d canvas, canvas');const r=c.getBoundingClientRect();return [r.x,r.y,r.width,r.height]})()")
    in3d = isinstance(t3.get('x'), (int, float)) and cv[0] <= t3['x'] <= cv[0] + cv[2] and cv[1] <= t3['y'] <= cv[1] + cv[3]
    ok('e1', '承接面在 3D 畫面上有位置（亮起來的標記）', in3d)
    if in3d:
        hit(t3['x'], t3['y']); d3 = dbg()
        ok('e2', '直接點 3D 裡的「工具架上緣」→ 進入那個承接面的預覽', d3['state'] == 'preview' and d3['preview']['mateId'] == up['mateId'])
        tap('#mateCancel')
    # f. 接上
    tap(f".mate-target[data-mate='{low['mateId']}']"); tap('#mateCommit'); s2 = st(); d4 = dbg()
    g = [m for m in s2['mods'] if m['id'] == G['id']][0]
    ok('f1', '接上：夾爪直角安裝、角碼、爪沿邊伸出（childAxisDeg 270°／−90°），只多一筆復原', g['mount'] and g['mount']['orient'] and g['mount']['orient']['edge'] == 'host' and g['mount']['orient']['joint']['kind'] == 'bracket-m3' and g['mount']['orient']['childAxisDeg'] % 360 == 270 and s2['undo'] == s0['undo'] + 1)
    row = [t for t in d4['tree'] if t['id'] == G['id']][0]
    ok('f2', '結構清單：夾爪縮排在四連桿底下，寫著接在「工具架下緣」', d4['state'] == 'mounted' and row['depth'] == 1 and row['parent'] == L['id'] and '下緣' in (row.get('mateName') or '') and row['unmounted'] is False)
    ok('f3', '接好後的畫面按鈕都夠大、不重疊，有「拆下」', buttons_ok() and vis('#mateDetach'))
    ok('f4', '接好後機構仍夠大（≥ 40%）、不用捲動就看得到干涉狀態', (d4.get('view') or {}).get('fill', 0) >= 0.4 and pg.evaluate(INVIEW, '#mateLive'))
    shot('mounted')
    tap(".mate-style[data-style='stand-top']"); s3 = st()
    ok('g1', '接好後改接法「立在上面」：直接生效、一筆復原', [m for m in s3['mods'] if m['id'] == G['id']][0]['mount']['orient']['edge'] == 'child' and s3['undo'] == s2['undo'] + 1)
    tap('#mateDetach'); s4 = st()
    ok('g2', '拆下：夾爪回到未安裝、一筆復原', [m for m in s4['mods'] if m['id'] == G['id']][0]['mount'] is None and s4['undo'] == s3['undo'] + 1 and dbg()['state'] == 'pick')
    pg.evaluate("window.blocks.undo()"); pg.wait_for_timeout(600)
    ok('g3', '復原 → 夾爪又接回去（立在上面）', [m for m in st()['mods'] if m['id'] == G['id']][0]['mount'] is not None)
    # h. 點清單選別的機構
    tap(f".mate-tree-row[data-module='{L['id']}']"); d5 = dbg()
    ok('h1', '點清單的四連桿 → 選中它；它沒有地方可接，畫面有說明、沒有承接面卡片', d5['selected'] == L['id'] and pg.locator('.mate-target').count() == 0 and len(pg.evaluate("(document.querySelector('#benchPanel')||{}).innerText||''").strip()) > 4)
    # i. 進階（工程模式）
    tap('#mateAdvanced'); ok('i1', '切到進階：出現原本的工程面板', dbg()['advanced'] is True and vis('#benchPanel'))
    tap('#mateAdvanced'); ok('i2', '再切回精靈', dbg()['advanced'] is False)
    before = [m for m in st()['mods'] if m['id'] == G['id']][0]['mount']
    pg.wait_for_timeout(900); pg.reload(); pg.wait_for_timeout(3000)
    pg.evaluate("window.blocks.setMode('bench')"); pg.wait_for_timeout(2500)
    ok('j1', '重新整理後安裝還在、仍是精靈模式', [m for m in st()['mods'] if m['id'] == G['id']][0]['mount'] == before and dbg()['advanced'] is False)
    ok('z1', '頁面沒有橫向捲動', pg.evaluate("document.documentElement.scrollWidth<=innerWidth+1"))
    ok('z2', '沒有 console error', len(errs) == 0)
    if errs: print(errs[:5])
    shot('end')
    b.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
