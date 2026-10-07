# M2 瀏覽器合約：設計分頁的「接合面」工具。用真實點擊／觸控，狀態只用來讀結果。
# 用法：python3 test/browser/mates-design.py [URL] [desktop|phone]
import sys, json
from playwright.sync_api import sync_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8766/blocks.html'
KIND = sys.argv[2] if len(sys.argv) > 2 else 'desktop'
SHOT = sys.argv[3] if len(sys.argv) > 3 else None
res = []
def ok(i, d, c): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + i + ' ' + d)
ST = """async()=>{const {S}=await import('./js/blocks/state.js');const m=S.modules.find(x=>x.id===S.designFocus);
 return {focus:S.designFocus,mode:S.mode,mates:m?m.mates||null:null,undo:S.undoStack.length,nComps:S.comps.length,
   sel:[S.selectedLinkId,S.selectedTriangleId,S.selectedSliderId,S.selectedGearId,S.selectedNodeId].filter(Boolean),
   pos:JSON.stringify(S.comps.map(c=>[c.id,c.p1&&[c.p1.x,c.p1.y],c.p2&&[c.p2.x,c.p2.y]]))}}"""
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'])
    phone = KIND == 'phone'
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True) if phone else b.new_context(viewport={'width': 1280, 'height': 800})
    pg = ctx.new_page(); errs = []
    pg.on('console', lambda m: errs.append(m.text[:160]) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)[:160]))
    pg.goto(URL); pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_timeout(1500)
    def lib(n): pg.evaluate("n=>[...document.querySelectorAll('#moduleLibrary .block, #moduleLibrary > *, #moduleLibrary button')].find(e=>e.textContent.includes(n)).click()", n); pg.wait_for_timeout(700)
    def tab(n): pg.evaluate("n=>[...document.querySelectorAll('#designTabs .design-tab')].find(e=>e.textContent.includes(n)).click()", n); pg.wait_for_timeout(500)
    def st(): return pg.evaluate(ST)
    def dbg(): return pg.evaluate("window.blocks.mateDebug()")
    def hit(x, y):
        if phone: pg.touchscreen.tap(x, y)
        else: pg.mouse.click(x, y)
        pg.wait_for_timeout(350)
    def vis(sel): return pg.evaluate("s=>{const e=document.querySelector(s);if(!e)return false;const r=e.getBoundingClientRect();return !!(e.offsetParent||r.width)&&r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'}", sel)
    lib('四連桿升降'); lib('齒輪夾爪'); tab('四連桿升降')
    s0 = st()
    ok('a1', '設計分頁（模組）看得到「接合面」按鈕，高度 ≥ 40 px', vis('#mateToolBtn') and pg.evaluate("document.querySelector('#mateToolBtn').getBoundingClientRect().height") >= 40)
    ok('a2', '工具未開：mateDebug().active false', dbg()['active'] is False)
    hit(*pg.evaluate("(()=>{const r=document.querySelector('#mateToolBtn').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()"))
    d = dbg()
    ok('b1', '點按鈕後進入接合面模式，看到說明橫幅', d['active'] is True and vis('#mateBanner'))
    ok('b2', '預設只顯示主要候選（3～8 個），都帶畫面座標且在可見的畫布範圍內', 3 <= len(d['candidates']) <= 8 and all(0 <= c['x'] <= (390 if phone else 1280) and 0 <= c['y'] <= (844 if phone else 800) for c in d['candidates']))
    ok('b3', '四連桿：工具架上下緣已標、四個箭頭一個 active', len([c for c in d['candidates'] if c['marked']]) == 2 and len(d['arrows']) == 4 and len([a for a in d['arrows'] if a['active']]) == 1)
    ok('b4', '點擊目標彼此不重疊到無法分辨：任兩個候選／箭頭的畫面距離 ≥ 24 px', all(((u['x'] - v['x']) ** 2 + (u['y'] - v['y']) ** 2) ** 0.5 >= 24 for i, u in enumerate(d['candidates'] + d['arrows']) for v in (d['candidates'] + d['arrows'])[i + 1:]))
    if SHOT: pg.screenshot(path=SHOT.replace('.png', '_on.png'))
    ok('b5', '有「全部的邊」切換鈕', vis('#mateAll'))
    pg.evaluate("document.querySelector('#mateAll').click()"); pg.wait_for_timeout(350); da = dbg()
    ok('b6', '切到全部 → 候選變多（≥ 12），仍然彼此 ≥ 24 px', len(da['candidates']) >= 12 and all(((u['x'] - v['x']) ** 2 + (u['y'] - v['y']) ** 2) ** 0.5 >= 24 for i, u in enumerate(da['candidates'] + da['arrows']) for v in (da['candidates'] + da['arrows'])[i + 1:]))
    if SHOT: pg.screenshot(path=SHOT.replace('.png', '_all.png'))
    pg.evaluate("document.querySelector('#mateAll').click()"); pg.wait_for_timeout(350)
    ok('b7', '再按一次回到精簡', len(dbg()['candidates']) == len(d['candidates']))
    # c. 標一個未標的邊
    un = [c for c in d['candidates'] if not c['marked'] and c['kind'] == 'edge'][0]
    hit(un['x'], un['y']); d2 = dbg(); s1 = st()
    ok('c1', '點未標的邊 → 多一個承接面並寫進模組（一筆復原）', len([c for c in d2['candidates'] if c['marked']]) == 3 and s1['mates'] and len(s1['mates']['receive']) == 3 and s1['undo'] == s0['undo'] + 1)
    ok('c2', '標記時零件位置不變、沒有東西被選取（不是拖曳或選取）', s1['pos'] == s0['pos'] and s1['sel'] == [])
    # d. 點已標的 → 出現小選單，可取消標記
    hit(un['x'], un['y'])
    ok('d1', '點已標的邊 → 出現選單（改名／取消標記）', vis('#matePopover') and vis('#matePopover [data-act=rename]') and vis('#matePopover [data-act=remove]'))
    pg.evaluate("document.querySelector('#matePopover [data-act=remove]').click()"); pg.wait_for_timeout(300)
    s2 = st()
    ok('d2', '取消標記 → 回到 2 個承接面，選單關閉', len(s2['mates']['receive']) == 2 and not vis('#matePopover'))
    # e. 改安裝方向
    cur = [a for a in dbg()['arrows'] if a['active']][0]; other = [a for a in dbg()['arrows'] if not a['active']][0]
    hit(other['x'], other['y']); s3 = st()
    ok('e1', '點另一個箭頭 → 安裝方向改成那個角度', s3['mates']['attach'] and s3['mates']['attach']['normalDeg'] == other['normalDeg'] and [a for a in dbg()['arrows'] if a['active']][0]['normalDeg'] == other['normalDeg'])
    # f. 復原
    pg.evaluate("window.blocks.undo()"); pg.wait_for_timeout(300)
    ok('f1', '復原一次 → 安裝方向回到原本的', st()['mates']['attach']['normalDeg'] == cur['normalDeg'])
    # g. 存檔還在
    pg.evaluate("window.blocks.mateTool(false)"); pg.wait_for_timeout(900)
    before = st()['mates']
    pg.reload(); pg.wait_for_timeout(2500)
    ok('g1', '重新整理後接合面還在', st()['mates'] == before and before is not None)
    # h. 模式隔離
    pg.evaluate("window.blocks.mateTool(true)"); pg.wait_for_timeout(300)
    tab('齒輪夾爪'); dh = dbg()
    ok('h1', '切換分頁 → 工具自動關閉', dh['active'] is False and not vis('#mateBanner'))
    pg.evaluate("window.blocks.mateTool(true)"); pg.wait_for_timeout(300); dg = dbg()
    ok('h2', '夾爪分頁：沒有已標的承接面、安裝方向箭頭 90° active', dg['active'] and len([c for c in dg['candidates'] if c['marked']]) == 0 and [a for a in dg['arrows'] if a['active']][0]['normalDeg'] == 90)
    if SHOT: pg.screenshot(path=SHOT.replace('.png', '_gripper.png'))
    pg.evaluate("window.blocks.setMode('bench')"); pg.wait_for_timeout(1500)
    ok('h3', '切到組立 → 工具關閉、按鈕不顯示', dbg()['active'] is False and not vis('#mateToolBtn'))
    pg.evaluate("window.blocks.setMode('design')"); pg.wait_for_timeout(1000)
    # i. 未命名設計（還不是模組）
    tab('未命名設計') if pg.evaluate("[...document.querySelectorAll('#designTabs .design-tab')].some(e=>e.textContent.includes('未命名設計'))") else None
    if st()['focus'] == '#root':
        pg.evaluate("window.blocks.mateTool(true)"); pg.wait_for_timeout(300)
        ok('i1', '未命名設計：工具不啟動，提示要先存成模組', dbg()['active'] is False)
    ok('z1', '頁面沒有橫向捲動', pg.evaluate("document.documentElement.scrollWidth<=innerWidth+1"))
    ok('z2', '沒有 console error', len(errs) == 0)
    if errs: print(errs[:5])
    if SHOT: pg.screenshot(path=SHOT)
    b.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
