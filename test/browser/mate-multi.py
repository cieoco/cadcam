# M5b 瀏覽器合約：多構件——底座、未安裝、整串拆下、設為底座、同一條邊接兩個。真實點擊／觸控。
# 用法：python3 test/browser/mate-multi.py [URL] [desktop|phone] [截圖.png]
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
   order:S.modules.map(m=>m.id),
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
    lib('齒條升降'); lib('四連桿升降'); lib('齒輪夾爪')
    pg.evaluate("window.blocks.setMode('bench')"); pg.wait_for_timeout(3000)
    s0 = st(); d = dbg()
    A = [m for m in s0['mods'] if '齒條' in m['name']][0]; L = [m for m in s0['mods'] if '四連桿' in m['name']][0]; G = [m for m in s0['mods'] if '夾爪' in m['name']][0]
    role = lambda dd, i: [t for t in dd['tree'] if t['id'] == i][0]
    txt = lambda sel: pg.evaluate("s=>{const e=document.querySelector(s);return e?e.innerText:''}", sel)
    INBOX = """()=>{const box=document.querySelector('#mateTree').getBoundingClientRect();return [...document.querySelectorAll('.mate-tree-row')].map(e=>{const r=e.getBoundingClientRect();return r.top>=box.top-1&&r.bottom<=box.bottom+1&&r.bottom<=innerHeight})}"""
    ok('a1', '清單三列：齒條升降是底座，另外兩個是未安裝', len(d['tree']) == 3 and role(d, A['id'])['role'] == 'root' and role(d, L['id'])['role'] == 'spare' and role(d, G['id'])['role'] == 'spare' and d['root'] == A['id'])
    ok('a2', '底座那一列看得到「底座」兩個字', '底座' in txt(f".mate-tree-row[data-module='{A['id']}']"))
    ok('a3', '三列都不用捲動就看得到', all(pg.evaluate(INBOX)) and len(pg.evaluate(INBOX)) == 3)
    ok('a4', '提醒哪些還沒接上、不會進製作包', vis('#mateSpareNote') and L['name'] in txt('#mateSpareNote') and G['name'] in txt('#mateSpareNote') and '製作包' in txt('#mateSpareNote'))
    ok('a5', '兩個機構都有地方可接：不自動選，提示先點清單', d['selected'] is None and d['state'] == 'idle' and len(txt('#benchPanel').strip()) > 6)
    ok('a6', '畫面上只有一行干涉狀態（不重複）', pg.evaluate("[...document.querySelectorAll('#benchPanel *')].filter(e=>e.children.length===0&&/沒有干涉|撞到/.test(e.textContent)&&e.getBoundingClientRect().height>0).length") <= 1)
    c3d = pg.evaluate("(()=>{const c=document.querySelector('#stage3d canvas, canvas');return c.getBoundingClientRect().height/innerHeight})()")
    ok('a7', '3D 畫面至少佔螢幕高度 30%', c3d >= 0.3)
    shot('three')
    # b. 四連桿接到滑台
    tap(f".mate-tree-row[data-module='{L['id']}']"); d1 = dbg()
    car = [t for t in d1['targets'] if '滑台' in t['name'] and t['ok']]
    ok('b1', '選四連桿：可接到齒條升降的滑台', d1['selected'] == L['id'] and d1['state'] == 'pick' and len(car) == 1)
    tap(f".mate-target[data-mate='{car[0]['mateId']}']"); tap('#mateCommit'); d2 = dbg()
    ok('b2', '接上：四連桿進到機器（縮排一層），夾爪還是未安裝；提醒只剩夾爪', role(d2, L['id'])['role'] == 'machine' and role(d2, L['id'])['depth'] == 1 and role(d2, G['id'])['role'] == 'spare' and G['name'] in txt('#mateSpareNote') and L['name'] not in txt('#mateSpareNote'))
    # c. 夾爪接到工具架下緣
    tap(f".mate-tree-row[data-module='{G['id']}']"); d3 = dbg()
    low = [t for t in d3['targets'] if '下緣' in t['name'] and t['ok']][0]
    ok('c1', '選夾爪：卡片上看得出承接面是哪個機構的（四連桿的工具架、齒條升降的滑台已被佔用）', L['name'] in txt('#benchPanel') and any(t['ok'] is False and '滑台' in t['name'] for t in d3['targets']))
    tap(f".mate-target[data-mate='{low['mateId']}']"); tap('#mateCommit'); d4 = dbg(); s4 = st()
    ok('c2', '三個都接好：深度 0／1／2、沒有未安裝、提醒消失', [role(d4, i)['depth'] for i in (A['id'], L['id'], G['id'])] == [0, 1, 2] and d4['spare'] == [] and not vis('#mateSpareNote'))
    ok('c3', '三列仍然都看得到、按鈕不重疊', all(pg.evaluate(INBOX)) and buttons_ok())
    shot('connected')
    # d. 拆中間
    tap(f".mate-tree-row[data-module='{L['id']}']"); tap('#mateDetach'); d5 = dbg(); s5 = st()
    ok('d1', '拆下四連桿：它和夾爪整串變未安裝，夾爪仍縮排在四連桿底下；一筆復原', role(d5, L['id'])['role'] == 'spare' and role(d5, L['id'])['depth'] == 0 and role(d5, G['id'])['role'] == 'spare' and role(d5, G['id'])['depth'] == 1 and role(d5, G['id'])['parent'] == L['id'] and s5['undo'] == s4['undo'] + 1 and d5['root'] == A['id'])
    ok('d2', '畫面有說明連同幾個一起拆下', '一起' in txt('#benchPanel') or '一起' in (txt('#benchMsg') or txt('body')))
    shot('detached')
    # e. 設為底座
    ok('e1', '選著未安裝的四連桿：有「設為底座」', d5['selected'] == L['id'] and vis('#mateMakeRoot'))
    tap('#mateMakeRoot'); d6 = dbg(); s6 = st()
    ok('e2', '設為底座：四連桿＋夾爪變成機器、齒條升降變未安裝；一筆復原', d6['root'] == L['id'] and role(d6, L['id'])['role'] == 'root' and role(d6, G['id'])['role'] == 'machine' and role(d6, A['id'])['role'] == 'spare' and s6['undo'] == s5['undo'] + 1 and s6['order'][0] == L['id'])
    pg.wait_for_timeout(900); pg.reload(); pg.wait_for_timeout(3000); pg.evaluate("window.blocks.setMode('bench')"); pg.wait_for_timeout(2500)
    ok('e3', '重新整理後底座還是四連桿', dbg()['root'] == L['id'])
    # f. 再接回去：把齒條升降設回底座，四連桿接到滑台
    tap(f".mate-tree-row[data-module='{A['id']}']"); tap('#mateMakeRoot')
    tap(f".mate-tree-row[data-module='{L['id']}']"); dd = dbg(); car2 = [t for t in dd['targets'] if '滑台' in t['name'] and t['ok']][0]
    tap(f".mate-target[data-mate='{car2['mateId']}']"); tap('#mateCommit'); d7 = dbg()
    ok('f1', '齒條升降設回底座、四連桿接回滑台：三個又都在機器裡', d7['root'] == A['id'] and d7['spare'] == [] and [role(d7, i)['depth'] for i in (A['id'], L['id'], G['id'])] == [0, 1, 2])
    # g. 第二個夾爪接同一條邊
    pg.evaluate("window.blocks.setMode('design')"); pg.wait_for_timeout(1200); lib('齒輪夾爪'); pg.evaluate("window.blocks.setMode('bench')"); pg.wait_for_timeout(3000)
    s8 = st(); G2 = [m for m in s8['mods'] if '夾爪' in m['name'] and m['id'] != G['id']][0]
    d8 = dbg()
    ok('g1', '只有新夾爪沒接：自動選中它', d8['selected'] == G2['id'] and d8['state'] == 'pick')
    low2 = [t for t in d8['targets'] if '下緣' in t['name'] and t['ok']][0]
    tap(f".mate-target[data-mate='{low2['mateId']}']"); d9 = dbg()
    off1 = [m for m in st()['mods'] if m['id'] == G['id']][0]['mount']['orient'].get('offsetMm', 0)
    ok('g2', '預覽自動排到空位：和第一個夾爪至少錯開 24 mm', d9['state'] == 'preview' and abs(d9['preview']['offsetMm'] - off1) >= 24)
    act = 'slide+' if off1 > d9['preview']['offsetMm'] else 'slide-'
    before = d9['preview']['offsetMm']; tap(f".mate-adj[data-act='{act}']"); d10 = dbg()
    ok('g3', '往第一個夾爪滑：擋住不動，畫面說明會和誰重疊', d10['preview']['offsetMm'] == before and '夾爪' in txt('#benchPanel') and ('重疊' in txt('#benchPanel') or '重疊' in txt('body')))
    tap('#mateCommit'); d11 = dbg()
    ok('g4', '接上：四個都在機器裡、四列清單可在清單內捲動看到', d11['spare'] == [] and len(d11['tree']) == 4 and pg.evaluate("(()=>{const t=document.querySelector('#mateTree');return t.scrollHeight<=t.clientHeight+1||getComputedStyle(t).overflowY!=='visible'})()"))
    shot('four')
    ok('z0', '按鈕都夠大、不重疊', buttons_ok())
    ok('z1', '頁面沒有橫向捲動', pg.evaluate("document.documentElement.scrollWidth<=innerWidth+1"))
    ok('z2', '沒有 console error', len(errs) == 0)
    if errs: print(errs[:5])
    b.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
